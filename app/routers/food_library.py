"""
Food library endpoints (mounted under /api/v2/meals via the meal_system router).

GET  /food-library/search?q=&lang=&page=&source=   search staples + USDA + Open Food Facts
GET  /food-library/staples?lang=                   the built-in staples catalogue
GET  /food-library/packs?lang=                     curated starter packs
POST /food-library/packs/{key}/import              import a starter pack (skips duplicates)
POST /food-library/import                          create a MealBank item from a result
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.utils import get_current_user
from app.database import get_db
from app.models.meal_system import MacroType, MealBank, MeasurementType
from app.schemas.auth import UserResponse, UserRole
from app.schemas.meal_system import MealBankResponse
from app.services import food_library_service as library
from app.services import usda_fdc_service as usda

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/food-library", tags=["Food Library"])


def _require_trainer(user: UserResponse) -> None:
    if user.role not in (UserRole.TRAINER, UserRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only trainers can use the food library")


def _lang(value: Optional[str]) -> str:
    value = (value or "he").lower()[:2]
    return value if value in library.SUPPORTED_LANGS else "en"


@router.get("/staples")
def list_staples(
    lang: str = Query("he"),
    current_user: UserResponse = Depends(get_current_user),
) -> Dict[str, Any]:
    _require_trainer(current_user)
    return {"results": library.search_staples("", _lang(lang), limit=500)}


SOURCES = ("all", "usda", "off")
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="food-lib")


def _usda_search(query: str, lang: str, page: int, page_size: int) -> Dict[str, Any]:
    """USDA results + status. Never raises."""
    out: Dict[str, Any] = {"results": [], "count": 0, "error": None, "query_en": None}
    query_en, _changed = usda.prepare_query(query, lang)
    out["query_en"] = query_en
    if not query_en:
        out["error"] = "no_translation"
        return out
    try:
        res = usda.search(query_en, lang, page, page_size)
        out["results"], out["count"] = res["results"], res["count"]
    except usda.UsdaRateLimited:
        out["error"] = "rate_limited"
    except usda.UsdaUnavailable as exc:
        logger.warning("USDA search failed: %s", exc)
        out["error"] = "unavailable"
    return out


def _off_search(query: str, lang: str, page: int, page_size: int) -> Dict[str, Any]:
    out: Dict[str, Any] = {"results": [], "count": 0, "error": None}
    try:
        off = library.search_open_food_facts(query, lang, page, page_size)
        out["results"], out["count"] = off["results"], off["count"]
    except library.FoodLibraryUnavailable:
        out["error"] = "unavailable"
    return out


@router.get("/search")
def search_food_library(
    q: str = Query("", max_length=120),
    lang: str = Query("he"),
    page: int = Query(1, ge=1, le=20),
    page_size: int = Query(24, ge=1, le=50),
    include_staples: bool = Query(True),
    source: str = Query("all"),
    current_user: UserResponse = Depends(get_current_user),
) -> Dict[str, Any]:
    """Search built-in staples, USDA FoodData Central (generic foods) and Open Food Facts (products).

    ``source``: all | usda | off. Results are normalised per 100 g. A source that
    cannot be reached sets its own error (``library_error`` for Open Food Facts,
    ``generic_error`` for USDA: rate_limited / unavailable / no_translation); the
    other sources are still returned.
    """
    _require_trainer(current_user)
    lang = _lang(lang)
    query = q.strip()
    source = source if source in SOURCES else "all"
    use_usda = source in ("all", "usda")
    use_off = source in ("all", "off")
    usda_size = page_size if source == "usda" else min(page_size, 12)

    staples: List[Dict[str, Any]] = []
    if include_staples and page == 1:
        staples = library.search_staples(query, lang, limit=8 if query else 500)

    usda_res: Dict[str, Any] = {"results": [], "count": 0, "error": None, "query_en": None}
    off_res: Dict[str, Any] = {"results": [], "count": 0, "error": None}
    if len(query) >= 2:
        futures = {}
        if use_usda:
            futures["usda"] = _pool.submit(_usda_search, query, lang, page, usda_size)
        if use_off:
            futures["off"] = _pool.submit(_off_search, query, lang, page, page_size)
        if "usda" in futures:
            usda_res = futures["usda"].result()
        if "off" in futures:
            off_res = futures["off"].result()

    generic_has_more = use_usda and page * usda_size < usda_res["count"]
    products_has_more = use_off and page * page_size < off_res["count"]
    return {
        "query": query,
        "lang": lang,
        "page": page,
        "source": source,
        "staples": staples,
        "staples_total": len(library.STAPLES),
        "generic": usda_res["results"],
        "generic_count": usda_res["count"],
        "generic_error": usda_res["error"],
        "generic_query": usda_res["query_en"],
        "generic_has_more": generic_has_more,
        "usda_demo_key": usda.using_demo_key(),
        "products": off_res["results"],
        "count": off_res["count"],
        "products_has_more": products_has_more,
        "has_more": products_has_more or generic_has_more,
        "library_error": off_res["error"],
        "attribution": {
            "usda": "USDA FoodData Central (public domain)",
            "openfoodfacts": "Data: Open Food Facts (ODbL), photos CC BY-SA",
            "staples": "Typical values per 100 g (USDA FoodData Central). Photos: Wikimedia Commons",
        },
    }


class FoodLibraryImportRequest(BaseModel):
    source: str = Field(..., description="'openfoodfacts' or 'staple'")
    source_id: str = Field(..., max_length=64)
    lang: Optional[str] = "he"
    # Optional overrides chosen by the trainer
    name: Optional[str] = None
    name_hebrew: Optional[str] = None
    macro_type: Optional[MacroType] = None
    is_public: bool = False
    # Fallback payload (used only when Open Food Facts cannot be reached)
    item: Optional[Dict[str, Any]] = None


def _round_int(value: Optional[float]) -> Optional[int]:
    return int(round(value)) if value is not None else None


@router.post("/import", response_model=MealBankResponse, status_code=status.HTTP_201_CREATED)
def import_from_food_library(
    payload: FoodLibraryImportRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a MealBank item (per 100 g) from a staple or an Open Food Facts product."""
    _require_trainer(current_user)
    lang = _lang(payload.lang)
    source = payload.source.strip().lower()

    item: Optional[Dict[str, Any]] = None
    if source == "staple":
        staple = library.STAPLES_BY_KEY.get(payload.source_id)
        if not staple:
            raise HTTPException(status_code=404, detail="Unknown staple")
        item = library.normalize_staple(staple, lang)
    elif source == "openfoodfacts":
        try:
            item = library.get_off_product(payload.source_id, lang)
        except Exception as exc:  # network failure - fall back to client payload
            logger.warning("Open Food Facts product lookup failed (%s): %s", payload.source_id, exc)
            item = None
        if item is None and payload.item:
            fallback = dict(payload.item)
            if not library.is_allowed_image_url(fallback.get("image_url")):
                fallback["image_url"] = None
                fallback["image_credit"] = None
            item = {
                "source": "openfoodfacts",
                "source_id": payload.source_id,
                "name": str(fallback.get("name") or "")[:200],
                "name_he": fallback.get("name_he"),
                "name_en": fallback.get("name_en"),
                "brand": fallback.get("brand"),
                "image_url": fallback.get("image_url"),
                "image_credit": library.clean_credit(fallback.get("image_credit")),
                "kcal": library._num(fallback.get("kcal")),
                "protein": library._num(fallback.get("protein")),
                "carbs": library._num(fallback.get("carbs")),
                "fat": library._num(fallback.get("fat")),
                "fiber": library._num(fallback.get("fiber")),
                "tags": [t for t in (fallback.get("tags") or []) if t in library.PROPERTY_TAGS],
                "nutriscore": fallback.get("nutriscore"),
                "nova_group": fallback.get("nova_group"),
                "macro_type": fallback.get("macro_type"),
            }
        if item is None:
            raise HTTPException(status_code=404, detail="Product not found in Open Food Facts")
    elif source == "usda":
        try:
            item = usda.get_food(payload.source_id, lang)
        except usda.UsdaUnavailable as exc:  # rate limit / network - use the search payload
            logger.info("USDA food lookup failed (%s): %s", payload.source_id, exc)
            item = None
        if item is None and payload.item:
            fb = dict(payload.item)
            sid = "".join(ch for ch in payload.source_id if ch.isdigit())[:20]
            if sid:
                item = {
                    "source": "usda",
                    "source_id": sid,
                    "name": str(fb.get("name") or "")[:200],
                    "name_he": (str(fb["name_he"])[:200] if fb.get("name_he") else None),
                    "name_en": (str(fb["name_en"])[:200] if fb.get("name_en") else None),
                    "brand": None,
                    "image_url": None,
                    "image_credit": None,
                    "kcal": library._num(fb.get("kcal")),
                    "protein": library._num(fb.get("protein")),
                    "carbs": library._num(fb.get("carbs")),
                    "fat": library._num(fb.get("fat")),
                    "fiber": library._num(fb.get("fiber")),
                    "tags": [t for t in (fb.get("tags") or []) if t in library.PROPERTY_TAGS],
                    "nutriscore": None,
                    "nova_group": None,
                    "macro_type": fb.get("macro_type"),
                }
        if item is None:
            raise HTTPException(status_code=404, detail="Food not found in USDA FoodData Central")
    else:
        raise HTTPException(status_code=400, detail="Unknown source")

    # Already imported by this trainer?
    existing = (
        db.query(MealBank)
        .filter(
            MealBank.created_by == current_user.id,
            MealBank.source == item["source"],
            MealBank.source_id == item["source_id"],
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Already in your food bank", "item_id": existing.id},
        )

    name_he = (payload.name_hebrew or item.get("name_he") or "").strip()
    name_en = (payload.name or item.get("name_en") or "").strip()
    if item.get("brand") and item["source"] == "openfoodfacts":
        brand = str(item["brand"]).strip()
        if name_en and brand.lower() not in name_en.lower() and not payload.name:
            name_en = f"{name_en} ({brand})"
    fallback_name = (item.get("name") or "").strip()
    if not name_en and not name_he:
        name_en = fallback_name
    if not name_en and not name_he:
        raise HTTPException(status_code=400, detail="The product has no name")

    macro = payload.macro_type or item.get("macro_type") or library.suggest_macro_type(
        item.get("protein"), item.get("carbs"), item.get("fat"))
    try:
        macro_enum = MacroType(macro if isinstance(macro, str) else macro.value)
    except ValueError:
        macro_enum = MacroType.CARB

    nova = item.get("nova_group")
    nutriscore = item.get("nutriscore")
    meal_bank_item = MealBank(
        name=name_en or name_he,
        name_hebrew=name_he or None,
        macro_type=macro_enum,
        calories=_round_int(item.get("kcal")),
        protein=item.get("protein"),
        carbs=item.get("carbs"),
        fat=item.get("fat"),
        fiber=item.get("fiber"),
        measurement_type=MeasurementType.PER_100G,
        serving_size="100g",
        created_by=current_user.id,
        is_public=payload.is_public,
        image_url=item.get("image_url"),
        image_credit=library.credit_string(item.get("image_credit")),
        source=item["source"],
        source_id=str(item["source_id"])[:64],
        brand=(str(item["brand"])[:120] if item.get("brand") else None),
        tags=json.dumps(item.get("tags") or []),
        nutriscore=nutriscore if nutriscore in ("a", "b", "c", "d", "e") else None,
        nova_group=nova if nova in (1, 2, 3, 4) else None,
    )
    db.add(meal_bank_item)
    db.commit()
    db.refresh(meal_bank_item)
    return meal_bank_item


# --------------------------------------------------------------------------- #
# Starter packs
# --------------------------------------------------------------------------- #

def _bank_index(db: Session, user_id: int):
    """(source, source_id) pairs and folded names already in this trainer's bank."""
    rows = db.query(MealBank.source, MealBank.source_id, MealBank.name, MealBank.name_hebrew).filter(
        MealBank.created_by == user_id).all()
    ids = {(r[0], r[1]) for r in rows if r[0] and r[1]}
    names = {library._fold(n) for r in rows for n in (r[2], r[3]) if n}
    return ids, names


def _staple_in_bank(staple: Dict[str, Any], ids: set, names: set) -> bool:
    if ("staple", staple["key"]) in ids:
        return True
    return any(library._fold(n) in names for n in staple["names"].values() if n)


@router.get("/packs")
def list_starter_packs(
    lang: str = Query("he"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Curated packs of staples, with how many of each are already in the trainer's bank."""
    _require_trainer(current_user)
    lang = _lang(lang)
    have_ids, have_names = _bank_index(db, current_user.id)
    packs = []
    for pack in library.starter_packs():
        staples = [library.STAPLES_BY_KEY[k] for k in pack["staple_keys"]]
        packs.append({
            "key": pack["key"],
            "count": pack["count"],
            "already": sum(1 for st in staples if _staple_in_bank(st, have_ids, have_names)),
            "preview": [st["names"].get(lang) or st["names"]["en"] for st in staples[:6]],
        })
    return {"packs": packs, "staples_total": len(library.STAPLES)}


class PackImportRequest(BaseModel):
    lang: Optional[str] = "he"
    is_public: bool = False


@router.post("/packs/{pack_key}/import", status_code=status.HTTP_201_CREATED)
def import_starter_pack(
    pack_key: str,
    payload: PackImportRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Bulk-create MealBank items for a starter pack. Items already in the bank
    (same staple key, or same name in any language) are skipped."""
    _require_trainer(current_user)
    keys = library.STARTER_PACKS.get(pack_key)
    if not keys:
        raise HTTPException(status_code=404, detail="Unknown starter pack")
    lang = _lang(payload.lang)
    have_ids, have_names = _bank_index(db, current_user.id)
    created: List[MealBank] = []
    skipped = 0
    for key in keys:
        staple = library.STAPLES_BY_KEY.get(key)
        if not staple:
            continue
        if _staple_in_bank(staple, have_ids, have_names):
            skipped += 1
            continue
        item = library.normalize_staple(staple, lang)
        try:
            macro_enum = MacroType(item["macro_type"])
        except ValueError:
            macro_enum = MacroType.CARB
        row = MealBank(
            name=item["name_en"],
            name_hebrew=item["name_he"],
            macro_type=macro_enum,
            calories=_round_int(item["kcal"]),
            protein=item["protein"],
            carbs=item["carbs"],
            fat=item["fat"],
            fiber=item["fiber"],
            measurement_type=MeasurementType.PER_100G,
            serving_size="100g",
            created_by=current_user.id,
            is_public=payload.is_public,
            image_url=item["image_url"],
            image_credit=library.credit_string(item["image_credit"]),
            source="staple",
            source_id=staple["key"],
            tags=json.dumps(item["tags"]),
            nova_group=1,
        )
        db.add(row)
        created.append(row)
        have_ids.add(("staple", staple["key"]))
        have_names.update(library._fold(n) for n in staple["names"].values())
    db.commit()
    for row in created:
        db.refresh(row)
    return {
        "pack": pack_key,
        "created": len(created),
        "skipped": skipped,
        "items": [MealBankResponse.model_validate(r).model_dump(mode="json") for r in created],
    }
