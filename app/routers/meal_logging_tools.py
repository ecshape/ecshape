"""Ways for a trainee to add a meal besides the plan: AI photo, barcode, saved meals/favorites.

Mounted under /api/v3/meals (routes: /ai/status, /ai/photo, /barcode/{code}, /foods/search, /foods/image, /saved...).
The AI step reuses the per-trainer key plumbing (app.services.ai_keys): the trainee's trainer's
key first, then the server key. With no key the endpoints report ``available=false`` and the app
falls back to barcode / manual entry.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth.utils import get_current_user
from app.database import get_db
from app.models.meal_system import ClientMealChoice, MealBank
from app.models.saved_meals import ClientSavedMeal
from app.models.user import User
from app.schemas.auth import UserResponse, UserRole
from app.services import food_images
from app.services import food_library_service as library
from app.services.ai_keys import Engine, resolve_engine
from app.services.meal_tracking_v3_service import _parse_v3_date_to_choice_datetime

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Meal logging tools"])

MAX_PHOTO_BYTES = 8 * 1024 * 1024
PHOTO_PROMPT = (
    "You are a nutrition assistant. Look at the photo of a meal and list every distinct food you can identify. "
    "For each give a short name in the language requested, an estimated portion in grams (or millilitres for drinks) "
    "and the estimated TOTAL calories, protein, carbs and fat (grams) for that portion. "
    "Be realistic and conservative. If the photo has no food, return an empty list. "
    "Answer ONLY by calling the submit_foods tool."
)
FOODS_SCHEMA = {
    "type": "object",
    "properties": {
        "foods": {
            "type": "array",
            "maxItems": 12,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "grams": {"type": "number"},
                    "calories": {"type": "number"},
                    "protein": {"type": "number"},
                    "carbs": {"type": "number"},
                    "fat": {"type": "number"},
                },
                "required": ["name", "grams", "calories", "protein", "carbs", "fat"],
            },
        }
    },
    "required": ["foods"],
}


def _require_client(user: UserResponse) -> None:
    if user.role != UserRole.CLIENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only clients can use this")


def _engine_for(db: Session, user: UserResponse) -> Optional[Engine]:
    """Trainer's own key first (the trainee has none), then the server-wide key."""
    me = db.query(User).filter(User.id == user.id).first()
    for uid in (getattr(me, "trainer_id", None), user.id):
        if uid:
            eng = resolve_engine(db, uid)
            if eng:
                return eng
    return None


@router.get("/ai/status")
def ai_status(current_user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_client(current_user)
    return {"available": _engine_for(db, current_user) is not None}


def _clean_foods(raw: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for f in (raw or [])[:12]:
        try:
            name = str(f.get("name") or "").strip()[:80]
            if not name:
                continue
            out.append({
                "name": name,
                "grams": max(0.0, round(float(f.get("grams") or 0), 0)),
                "calories": max(0.0, round(float(f.get("calories") or 0), 0)),
                "protein": max(0.0, round(float(f.get("protein") or 0), 1)),
                "carbs": max(0.0, round(float(f.get("carbs") or 0), 1)),
                "fat": max(0.0, round(float(f.get("fat") or 0), 1)),
            })
        except (TypeError, ValueError, AttributeError):
            continue
    return out


def _vision_claude(engine: Engine, mime: str, data: bytes, lang: str) -> List[Dict[str, Any]]:
    import anthropic

    client = anthropic.Anthropic(api_key=engine.api_key)
    try:
        res = client.messages.create(
            model=engine.model, max_tokens=2000, system=PHOTO_PROMPT,
            tools=[{"name": "submit_foods", "description": "Submit the identified foods.", "input_schema": FOODS_SCHEMA}],
            tool_choice={"type": "tool", "name": "submit_foods"},
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": mime, "data": base64.b64encode(data).decode()}},
                {"type": "text", "text": f"Language for food names: {lang}."},
            ]}],
        )
    except anthropic.APIError as e:  # auth, rate limit, connection…
        logger.warning("Meal photo AI (anthropic) failed: %s", e)
        raise HTTPException(status_code=502, detail="ai_unavailable")
    for block in res.content:
        if block.type == "tool_use":
            return _clean_foods((block.input or {}).get("foods"))
    return []


def _vision_openai(engine: Engine, mime: str, data: bytes, lang: str) -> List[Dict[str, Any]]:
    if not engine.base_url:
        raise HTTPException(status_code=502, detail="ai_unavailable")
    url = engine.base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": engine.model,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PHOTO_PROMPT.replace("Answer ONLY by calling the submit_foods tool.", "")
             + f" Language for food names: {lang}. Reply with ONLY JSON: "
             '{"foods":[{"name":"","grams":0,"calories":0,"protein":0,"carbs":0,"fat":0}]}'},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(data).decode()}"}},
        ]}],
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {engine.api_key}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = json.loads(r.read().decode())
        text = (body.get("choices") or [{}])[0].get("message", {}).get("content") or ""
        m = re.search(r"\{.*\}", text, re.S)
        return _clean_foods(json.loads(m.group(0)).get("foods")) if m else []
    except (OSError, ValueError, KeyError, AttributeError, TypeError) as e:  # URLError is an OSError
        logger.warning("Meal photo AI (openai-compatible) failed: %s", e)
        raise HTTPException(status_code=502, detail="ai_unavailable")


@router.post("/ai/photo")
async def identify_meal_photo(
    file: UploadFile = File(...),
    lang: str = "en",
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Identify the foods in a meal photo. 503 ``no_ai_key`` when no AI key is configured."""
    _require_client(current_user)
    engine = _engine_for(db, current_user)
    if not engine:
        raise HTTPException(status_code=503, detail="no_ai_key")
    data = await file.read()
    if not data or len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="Photo is empty or larger than 8 MB")
    mime = (file.content_type or "").lower()
    if mime not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise HTTPException(status_code=400, detail="Unsupported image type")
    lang_name = {"he": "Hebrew", "fr": "French"}.get(lang[:2], "English")
    import asyncio

    fn = _vision_claude if engine.provider == "anthropic" else _vision_openai
    foods = await asyncio.to_thread(fn, engine, mime, data, lang_name)
    return {"foods": foods}


# ------------------------------------------------------------------ barcode

@router.get("/barcode/{code}")
async def lookup_barcode(code: str, lang: str = "en", current_user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    """Product (nutrition per 100 g) from Open Food Facts. 404 when the product is unknown."""
    _require_client(current_user)
    if not re.fullmatch(r"\d{6,14}", code):
        raise HTTPException(status_code=400, detail="Invalid barcode")
    import asyncio

    try:
        item = await asyncio.to_thread(library.get_off_product, code, _lang(lang))
    except library.FoodLibraryUnavailable:
        raise HTTPException(status_code=502, detail="lookup_failed")
    except Exception as e:  # network error inside the library helper
        logger.warning("Barcode lookup failed: %s", e)
        raise HTTPException(status_code=502, detail="lookup_failed")
    if not item:
        raise HTTPException(status_code=404, detail="not_found")
    food = _from_library(item)
    _attach_cached_image(food)
    return {
        "barcode": code,
        "name": food["name"] if not food.get("brand") else f"{food['name']} · {food['brand']}"[:120],
        "serving_grams": food.get("serving_grams"),
        "image_url": food.get("image_url"),
        "needs_image": food.get("needs_image", False),
        "per100": {"calories": food["calories"], "protein": food["protein"], "carbs": food["carbs"], "fat": food["fat"]},
    }


# ------------------------------------------------------------------ smart search

def _lang(value: Optional[str]) -> str:
    v = (value or "en").lower()[:2]
    return v if v in library.SUPPORTED_LANGS else "en"


def _r(v: Any, d: int = 1) -> float:
    try:
        return round(float(v or 0), d)
    except (TypeError, ValueError):
        return 0.0


_GRAMS_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:g|gr|ml|גרם|מ\"ל)\b", re.I)


def _serving_grams(text: Optional[str]) -> Optional[float]:
    m = _GRAMS_RE.search(text or "")
    if not m:
        return None
    g = float(m.group(1).replace(",", "."))
    return g if 0 < g <= 2000 else None


def _from_library(it: Dict[str, Any]) -> Dict[str, Any]:
    """Staple / USDA / Open Food Facts result -> the trainee search shape (values per 100 g)."""
    return {
        "id": str(it.get("id")),
        "source": {"staple": "staple", "openfoodfacts": "product"}.get(it.get("source"), "generic"),
        "name": (it.get("name") or "")[:120],
        "name_en": it.get("name_en"),
        "brand": it.get("brand"),
        "image_url": it.get("image_thumb_url") or it.get("image_url"),
        "unit": "g",
        "serving_grams": _serving_grams(it.get("quantity")) if it.get("source") != "openfoodfacts" else None,
        "calories": round(_r(it.get("kcal"), 0)),
        "protein": _r(it.get("protein")),
        "carbs": _r(it.get("carbs")),
        "fat": _r(it.get("fat")),
        "macro_type": it.get("macro_type"),
    }


def _attach_cached_image(food: Dict[str, Any]) -> None:
    """No photo -> the AI photo if one was generated before, else mark it so the app asks for one."""
    if food.get("image_url"):
        return
    cached = food_images.cached_url(food["name"])
    if cached:
        food["image_url"] = cached
        food["image_ai"] = True
    else:
        food["needs_image"] = True


def _bank_foods(db: Session, client_id: int, query: str, lang: str, limit: int) -> List[Dict[str, Any]]:
    me = db.query(User).filter(User.id == client_id).first()
    trainer_id = getattr(me, "trainer_id", None)
    q = db.query(MealBank).filter(or_(MealBank.created_by == trainer_id, MealBank.is_public.is_(True)) if trainer_id else MealBank.is_public.is_(True))
    if query:
        like = f"%{query}%"
        q = q.filter(or_(MealBank.name.ilike(like), MealBank.name_hebrew.ilike(like), MealBank.brand.ilike(like)))
    rows = q.order_by((MealBank.created_by == trainer_id).desc() if trainer_id else MealBank.id, MealBank.name).limit(limit).all()
    out = []
    seen = set()
    for b in rows:
        name = (b.name_hebrew if lang == "he" and b.name_hebrew else b.name) or b.name
        k = food_images.normalize_name(name)
        if k in seen:
            continue
        seen.add(k)
        portion = str(getattr(b.measurement_type, "value", b.measurement_type) or "").lower() == "per_portion"
        out.append({
            "id": f"bank:{b.id}", "source": "coach", "name": name[:120], "name_en": b.name, "brand": b.brand,
            "image_url": b.image_url, "unit": "portion" if portion else "g",
            "serving_grams": None if portion else _serving_grams(b.serving_size), "serving_label": b.serving_size,
            "calories": round(_r(b.calories, 0)), "protein": _r(b.protein), "carbs": _r(b.carbs), "fat": _r(b.fat),
            "macro_type": getattr(b.macro_type, "value", b.macro_type),
        })
    return out


def _recent_foods(db: Session, client_id: int, query: str, limit: int) -> List[Dict[str, Any]]:
    """Foods this trainee typed / scanned / searched before (newest first), normalised back to per 100 g."""
    since = datetime.utcnow() - timedelta(days=120)
    q = db.query(ClientMealChoice).filter(
        ClientMealChoice.client_id == client_id, ClientMealChoice.custom_food_name.isnot(None), ClientMealChoice.date >= since)
    if query:
        q = q.filter(ClientMealChoice.custom_food_name.ilike(f"%{query}%"))
    out: List[Dict[str, Any]] = []
    seen = set()
    for c in q.order_by(ClientMealChoice.date.desc()).limit(300):
        k = food_images.normalize_name(c.custom_food_name)
        if not k or k in seen:
            continue
        seen.add(k)
        g = _serving_grams(c.quantity)
        if g:
            f = 100.0 / g
            food = {"unit": "g", "serving_grams": g}
        else:  # "2 portions" -> per portion; unknown amount -> what was logged is one portion
            m = re.match(r"\s*(\d+(?:[.,]\d+)?)\s*portion", c.quantity or "", re.I)
            n = float(m.group(1).replace(",", ".")) if m else 1.0
            f = 1.0 / n if n > 0 else 1.0
            food = {"unit": "portion", "serving_grams": None}
        food.update({
            "id": f"recent:{c.id}", "source": "recent", "name": c.custom_food_name[:120], "name_en": None, "brand": None,
            "image_url": None, "calories": round(_r(c.custom_calories, 0) * f), "protein": _r(_r(c.custom_protein) * f),
            "carbs": _r(_r(c.custom_carbs) * f), "fat": _r(_r(c.custom_fat) * f), "macro_type": None,
        })
        out.append(food)
        if len(out) >= limit:
            break
    return out


@router.get("/foods/search")
def search_foods(
    q: str = Query("", max_length=120),
    lang: str = Query("en"),
    page: int = Query(1, ge=1, le=10),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One search over everything a trainee may have eaten.

    Order: foods they logged before, their coach's food bank, everyday staples, generic foods (USDA) and
    packaged products (Open Food Facts, any language). Values are per 100 g (``unit: "g"``) or per portion
    (``unit: "portion"``). Foods without a photo get their AI photo when one exists, else ``needs_image``.
    """
    _require_client(current_user)
    lang = _lang(lang)
    query = q.strip()
    sections: Dict[str, List[Dict[str, Any]]] = {"recent": [], "coach": [], "foods": [], "products": []}
    errors: List[str] = []
    if page == 1:
        sections["recent"] = _recent_foods(db, current_user.id, query, 6 if query else 8)
        sections["coach"] = _bank_foods(db, current_user.id, query, lang, 8 if query else 0) if query else []
        sections["foods"] = [_from_library(s) for s in library.search_staples(query, lang, limit=10)] if query else []
    has_more = False
    if len(query) >= 2:
        from app.routers.food_library import _off_search, _pool, _usda_search

        fu = _pool.submit(_usda_search, query, lang, page, 8)
        fo = _pool.submit(_off_search, query, lang, page, 16)
        usda_res, off_res = fu.result(), fo.result()
        sections["foods"] += [_from_library(x) for x in usda_res["results"]]
        sections["products"] = [_from_library(x) for x in off_res["results"] if x.get("kcal") is not None]
        has_more = page * 16 < (off_res.get("count") or 0)
        if usda_res.get("error") in ("unavailable", "rate_limited"):
            errors.append("generic")
        if off_res.get("error"):
            errors.append("products")
    # The same food from several places: keep the first (recent > coach > staple > generic).
    seen = set()
    for key in ("recent", "coach", "foods", "products"):
        kept = []
        for f in sections[key]:
            k = (food_images.normalize_name(f["name"]), food_images.normalize_name(f.get("brand") or ""))
            if k in seen:
                continue
            seen.add(k)
            _attach_cached_image(f)
            kept.append(f)
        sections[key] = kept
    return {"query": query, "page": page, **sections, "has_more": has_more, "errors": errors,
            "ai_images": food_images.available(db, current_user.id)}


@router.get("/foods/image")
async def food_image(
    name: str = Query(..., min_length=1, max_length=120),
    hint: Optional[str] = Query(None, max_length=120),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """AI photo for a food without a good picture (made once, then shared). 404 ``no_image_ai`` without an image key."""
    import asyncio

    try:
        url = await asyncio.to_thread(food_images.generate, db, current_user.id, name, hint)
    except food_images.RateLimited:
        raise HTTPException(status_code=429, detail="too_many_images")
    if not url:
        raise HTTPException(status_code=404, detail="no_image_ai")
    return {"url": url, "ai": True}


# ------------------------------------------------------------------ saved meals

class SavedItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    quantity: Optional[str] = Field(default=None, max_length=40)
    calories: float = 0
    protein: float = 0
    carbs: float = 0
    fat: float = 0


class SavedMealIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    items: List[SavedItem] = Field(min_length=1, max_length=30)
    is_favorite: bool = True


class SavedMealLogIn(BaseModel):
    date: str
    meal_slot_id: Optional[int] = None


def _saved_dict(r: ClientSavedMeal) -> Dict[str, Any]:
    try:
        items = json.loads(r.items_json or "[]")
    except ValueError:
        items = []
    return {"id": r.id, "name": r.name, "is_favorite": bool(r.is_favorite), "items": items,
            "totals": {k: round(sum(float(i.get(k) or 0) for i in items), 1) for k in ("calories", "protein", "carbs", "fat")}}


@router.get("/saved")
def list_saved(current_user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_client(current_user)
    rows = db.query(ClientSavedMeal).filter(ClientSavedMeal.client_id == current_user.id).order_by(ClientSavedMeal.created_at.desc()).all()
    return [_saved_dict(r) for r in rows]


@router.post("/saved", status_code=status.HTTP_201_CREATED)
def create_saved(body: SavedMealIn, current_user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_client(current_user)
    row = ClientSavedMeal(client_id=current_user.id, name=body.name.strip(), is_favorite=body.is_favorite,
                          items_json=json.dumps([i.model_dump() for i in body.items], ensure_ascii=False))
    db.add(row)
    db.commit()
    db.refresh(row)
    return _saved_dict(row)


@router.patch("/saved/{saved_id}")
def update_saved(saved_id: int, body: Dict[str, Any], current_user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_client(current_user)
    row = db.query(ClientSavedMeal).filter(ClientSavedMeal.id == saved_id, ClientSavedMeal.client_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    if isinstance(body.get("name"), str) and body["name"].strip():
        row.name = body["name"].strip()[:120]
    if isinstance(body.get("is_favorite"), bool):
        row.is_favorite = body["is_favorite"]
    db.commit()
    return _saved_dict(row)


@router.delete("/saved/{saved_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved(saved_id: int, current_user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_client(current_user)
    row = db.query(ClientSavedMeal).filter(ClientSavedMeal.id == saved_id, ClientSavedMeal.client_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return None


@router.post("/saved/{saved_id}/log")
def log_saved(saved_id: int, body: SavedMealLogIn, current_user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    """Log every item of a saved meal in one go (free entries when no meal slot is given)."""
    _require_client(current_user)
    row = db.query(ClientSavedMeal).filter(ClientSavedMeal.id == saved_id, ClientSavedMeal.client_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    when = _parse_v3_date_to_choice_datetime(body.date)
    items = json.loads(row.items_json or "[]")
    for i in items:
        db.add(ClientMealChoice(
            client_id=current_user.id, meal_slot_id=body.meal_slot_id, date=when, quantity=i.get("quantity"),
            custom_food_name=str(i.get("name") or row.name)[:120], custom_calories=i.get("calories"),
            custom_protein=i.get("protein"), custom_carbs=i.get("carbs"), custom_fat=i.get("fat"),
        ))
    db.commit()
    return {"logged": len(items)}
