"""
Food library endpoints (mounted under /api/v2/meals via the meal_system router).

GET  /food-library/search?q=&lang=&page=   search staples + Open Food Facts
GET  /food-library/staples?lang=           the built-in staples catalogue
POST /food-library/import                  create a MealBank item from a result
"""

import json
import logging
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
    return {"results": library.search_staples("", _lang(lang), limit=100)}


@router.get("/search")
def search_food_library(
    q: str = Query("", max_length=120),
    lang: str = Query("he"),
    page: int = Query(1, ge=1, le=20),
    page_size: int = Query(24, ge=1, le=50),
    include_staples: bool = Query(True),
    current_user: UserResponse = Depends(get_current_user),
) -> Dict[str, Any]:
    """Search generic staples and Open Food Facts products.

    Results are normalised per 100 g. If Open Food Facts is unreachable the
    staples are still returned and ``library_error`` is set.
    """
    _require_trainer(current_user)
    lang = _lang(lang)
    query = q.strip()

    staples: List[Dict[str, Any]] = []
    if include_staples and page == 1:
        staples = library.search_staples(query, lang, limit=8 if query else 100)

    products: List[Dict[str, Any]] = []
    count = 0
    library_error: Optional[str] = None
    if len(query) >= 2:
        try:
            off = library.search_open_food_facts(query, lang, page, page_size)
            products, count = off["results"], off["count"]
        except library.FoodLibraryUnavailable:
            library_error = "unavailable"

    return {
        "query": query,
        "lang": lang,
        "page": page,
        "staples": staples,
        "products": products,
        "count": count,
        "has_more": page * page_size < count,
        "library_error": library_error,
        "attribution": {
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
