"""
USDA FoodData Central (https://fdc.nal.usda.gov) - the US reference nutrition
database. Public domain (CC0). We only query the "generic" data types
(Foundation, SR Legacy, Survey/FNDDS); branded products come from Open Food Facts.

API key: env ``FDC_API_KEY``; falls back to ``DEMO_KEY`` which is heavily
rate-limited (a few requests per hour per IP). A 429 raises ``UsdaRateLimited``
and starts a short cool-down so we stop hammering the API.

Results use the same item shape as the rest of the food library (per 100 g).
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.services import food_translate

logger = logging.getLogger(__name__)

USER_AGENT = "ECshape-dev/1.0"
FDC_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"
FDC_FOOD_URL = "https://api.nal.usda.gov/fdc/v1/food/{fdc_id}"
FDC_FOOD_PAGE = "https://fdc.nal.usda.gov/food-details/{fdc_id}/nutrients"
GENERIC_TYPES = "Foundation,SR Legacy,Survey (FNDDS)"
TIMEOUT = 8.0

# Nutrient ids (FDC) -> our fields. Energy has three possible ids.
N_PROTEIN, N_FAT, N_CARBS, N_FIBER = 1003, 1004, 1005, 1079
N_ENERGY = (1008, 2047, 2048)

CATEGORY_TAGS = {
    "Dairy and Egg Products": ["dairy"],
    "Vegetables and Vegetable Products": ["vegetable", "vegan"],
    "Fruits and Fruit Juices": ["fruit", "vegan"],
    "Legumes and Legume Products": ["vegan"],
    "Nut and Seed Products": ["vegan"],
    "Cereal Grains and Pasta": ["vegan"],
}

CATEGORY_KIND = {
    "Poultry Products": "meat",
    "Beef Products": "meat",
    "Pork Products": "meat",
    "Lamb, Veal, and Game Products": "meat",
    "Sausages and Luncheon Meats": "meat",
    "Finfish and Shellfish Products": "fish",
    "Dairy and Egg Products": "dairy",
    "Vegetables and Vegetable Products": "vegetable",
    "Fruits and Fruit Juices": "fruit",
    "Legumes and Legume Products": "legume",
    "Nut and Seed Products": "nut",
    "Cereal Grains and Pasta": "grain",
    "Baked Products": "grain",
    "Breakfast Cereals": "grain",
    "Fats and Oils": "oil",
    "Sweets": "snack",
    "Snacks": "snack",
    "Beverages": "drink",
    "Soups, Sauces, and Gravies": "dish",
    "Fast Foods": "dish",
    "Restaurant Foods": "dish",
    "Meals, Entrees, and Side Dishes": "dish",
}


class UsdaUnavailable(Exception):
    """USDA could not be reached (network error, 5xx...)."""


class UsdaRateLimited(UsdaUnavailable):
    """USDA returned 429 (DEMO_KEY quota is tiny)."""


def api_key() -> str:
    return (os.getenv("FDC_API_KEY") or "").strip() or "DEMO_KEY"


def using_demo_key() -> bool:
    return api_key() == "DEMO_KEY"


class _TTL:
    def __init__(self, ttl: int, max_items: int = 300):
        self.ttl, self.max_items = ttl, max_items
        self._d: Dict[str, Tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any:
        with self._lock:
            hit = self._d.get(key)
            if hit and time.time() - hit[0] <= self.ttl:
                return hit[1]
            self._d.pop(key, None)
            return None

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            if len(self._d) >= self.max_items:
                self._d.pop(min(self._d.items(), key=lambda kv: kv[1][0])[0], None)
            self._d[key] = (time.time(), value)


_search_cache = _TTL(ttl=6 * 3600)
_food_cache = _TTL(ttl=24 * 3600)
_cooldown_until = 0.0
_COOLDOWN_S = 120


def _get(url: str, params: Dict[str, Any]) -> Dict[str, Any]:
    global _cooldown_until
    if time.time() < _cooldown_until:
        raise UsdaRateLimited("cool-down after 429")
    params = {**params, "api_key": api_key()}
    try:
        with httpx.Client(timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}) as client:
            resp = client.get(url, params=params)
    except httpx.HTTPError as exc:
        raise UsdaUnavailable(str(exc)) from exc
    if resp.status_code == 429:
        _cooldown_until = time.time() + _COOLDOWN_S
        raise UsdaRateLimited("429 Too Many Requests")
    if resp.status_code == 404:
        return {}
    if resp.status_code >= 400:
        raise UsdaUnavailable(f"HTTP {resp.status_code}")
    try:
        return resp.json()
    except ValueError as exc:
        raise UsdaUnavailable("invalid JSON") from exc


def _r(value: Any) -> Optional[float]:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if f != f:
        return None
    return round(max(f, 0.0), 1)


def _nutrients(food: Dict[str, Any]) -> Dict[str, Optional[float]]:
    vals: Dict[str, Optional[float]] = {}
    energy: Dict[Any, float] = {}
    for n in food.get("foodNutrients") or []:
        # search results: flat; detail endpoint: {"nutrient": {...}, "amount": x}
        nid = n.get("nutrientId") or (n.get("nutrient") or {}).get("id")
        number = str(n.get("nutrientNumber") or n.get("number") or (n.get("nutrient") or {}).get("number") or "")
        unit = str(n.get("unitName") or (n.get("nutrient") or {}).get("unitName") or "").lower()
        value = n.get("value", n.get("amount"))
        if value is None:
            continue
        if nid == N_PROTEIN or number == "203":
            vals["protein"] = _r(value)
        elif nid == N_FAT or number == "204":
            vals["fat"] = _r(value)
        elif nid == N_CARBS or number == "205":
            vals["carbs"] = _r(value)
        elif nid == N_FIBER or number == "291":
            vals["fiber"] = _r(value)
        elif (nid in N_ENERGY or number in ("208", "957", "958")) and unit == "kcal":
            energy[nid or number] = float(value)
    for key in (1008, "208", 2048, "958", 2047, "957"):
        if key in energy:
            vals["kcal"] = _r(energy[key])
            break
    if vals.get("kcal") is None and any(vals.get(k) is not None for k in ("protein", "carbs", "fat")):
        vals["kcal"] = _r((vals.get("protein") or 0) * 4 + (vals.get("carbs") or 0) * 4 + (vals.get("fat") or 0) * 9)
    return vals


def _pretty(description: str) -> str:
    """'CHICKEN, BREAST' / 'Chicken, breast' -> 'Chicken, breast'."""
    d = re.sub(r"\s+", " ", description or "").strip()
    if d.isupper():
        d = d.capitalize()
    return d[:200]


def normalize(food: Dict[str, Any], lang: str = "he") -> Optional[Dict[str, Any]]:
    from app.services.food_library_service import _merge_tags, compute_macro_tags, suggest_macro_type

    fdc_id = food.get("fdcId")
    if not fdc_id:
        return None
    name_en = _pretty(food.get("description") or "")
    if not name_en:
        return None
    vals = _nutrients(food)
    kcal, p, c, f, fib = (vals.get(k) for k in ("kcal", "protein", "carbs", "fat", "fiber"))
    category = food.get("foodCategory")
    if isinstance(category, dict):
        category = category.get("description")
    category = str(category or "")
    name_he = food_translate.name_for(name_en, "he")
    name_fr = food_translate.name_for(name_en, "fr")
    localized = {"he": name_he, "fr": name_fr}.get(lang)
    return {
        "id": f"usda:{fdc_id}",
        "source": "usda",
        "source_id": str(fdc_id),
        "name": localized or name_en,
        "name_he": name_he,
        "name_en": name_en,
        "name_fr": name_fr,
        "brand": None,
        "image_url": None,
        "image_thumb_url": None,
        "image_credit": None,
        "kcal": kcal,
        "protein": p,
        "carbs": c,
        "fat": f,
        "fiber": fib,
        "per": "100g",
        "barcode": None,
        "tags": _merge_tags(CATEGORY_TAGS.get(category, []), compute_macro_tags(kcal, p, c, f, fib)),
        "nutriscore": None,
        "nova_group": None,
        "macro_type": suggest_macro_type(p, c, f),
        "quantity": None,
        "category": CATEGORY_KIND.get(category),
        "data_type": food.get("dataType"),
        "source_url": FDC_FOOD_PAGE.format(fdc_id=fdc_id),
    }


def prepare_query(query: str, lang: str) -> Tuple[Optional[str], bool]:
    """English query for USDA (he/fr are translated with the built-in dictionary)."""
    query = (query or "").strip()
    if not query:
        return None, False
    if lang in ("he", "fr") or food_translate.is_hebrew(query):
        return food_translate.translate_query(query)
    return query, False


def search(query_en: str, lang: str = "he", page: int = 1, page_size: int = 24) -> Dict[str, Any]:
    """Search generic foods. Raises UsdaRateLimited / UsdaUnavailable."""
    key = f"{page}|{page_size}|{query_en.lower()}"
    cached = _search_cache.get(key)
    if cached is None:
        data = _get(FDC_SEARCH_URL, {
            "query": query_en,
            "dataType": GENERIC_TYPES,
            "pageSize": page_size,
            "pageNumber": page,
            "sortBy": "score",
        })
        cached = {"foods": data.get("foods") or [], "count": int(data.get("totalHits") or 0)}
        _search_cache.set(key, cached)
    results: List[Dict[str, Any]] = []
    seen = set()
    for food in cached["foods"]:
        item = normalize(food, lang)
        if not item or item["source_id"] in seen or item["kcal"] is None:
            continue
        seen.add(item["source_id"])
        results.append(item)
    # Foundation / SR Legacy (lab values) before survey composites.
    order = {"Foundation": 0, "SR Legacy": 1}
    results.sort(key=lambda r: order.get(r.get("data_type") or "", 2))
    return {"results": results, "count": cached["count"], "page": page}


def get_food(fdc_id: str, lang: str = "he") -> Optional[Dict[str, Any]]:
    fdc_id = re.sub(r"[^0-9]", "", fdc_id or "")
    if not fdc_id:
        return None
    raw = _food_cache.get(fdc_id)
    if raw is None:
        raw = _get(FDC_FOOD_URL.format(fdc_id=fdc_id), {"format": "abridged"})
        if not raw:
            return None
        _food_cache.set(fdc_id, raw)
    return normalize(raw, lang)
