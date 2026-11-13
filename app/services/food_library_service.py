"""
Food library: searchable, license-safe food data for the trainer's food bank.

Two sources are combined:

* **Open Food Facts** (https://world.openfoodfacts.org) - an open, collaborative
  database of food products. Data is ODbL, product photos are CC-BY-SA.
  We query it from the backend (no API key needed) so the browser never hits
  third-party CORS / rate limits, and we cache results in memory.
* **Staples** - a small built-in catalogue of generic whole foods (chicken
  breast, rice, oats, eggs...). Nutrition values are typical per-100g values
  (USDA FoodData Central, public domain). Photos are free-licensed files from
  Wikimedia Commons; their author and license are carried with every result so
  the UI can credit them.

Every result is normalised to the same shape (per 100 g):
    {id, source, source_id, name, name_he, name_en, name_fr, brand, image_url,
     image_thumb_url, image_credit, kcal, protein, carbs, fat, fiber, per,
     barcode, tags, nutriscore, nova_group, macro_type, quantity}
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = "ECshape-dev/1.0"
OFF_SEARCH_URL = "https://search.openfoodfacts.org/search"
OFF_LEGACY_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl"
OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product/{code}.json"
OFF_PRODUCT_PAGE = "https://world.openfoodfacts.org/product/{code}"
COMMONS_FILE_URL = "https://commons.wikimedia.org/wiki/Special:FilePath/{file}?width={width}"
COMMONS_PAGE_URL = "https://commons.wikimedia.org/wiki/File:{file}"

SUPPORTED_LANGS = ("he", "en", "fr")
LANG_COUNTRY = {"he": "il", "fr": "fr", "en": "world"}

# Hosts we accept as stored photo URLs (import payload fallback).
ALLOWED_IMAGE_HOSTS = (
    "images.openfoodfacts.org",
    "static.openfoodfacts.org",
    "commons.wikimedia.org",
    "upload.wikimedia.org",
)

# Canonical property tags understood by the frontend.
PROPERTY_TAGS = (
    "high_protein",
    "carb_source",
    "fat_source",
    "high_fiber",
    "vegetable",
    "fruit",
    "dairy",
    "vegan",
    "vegetarian",
    "gluten_free",
    "kosher",
)

_OFF_FIELDS = [
    "code",
    "product_name",
    "product_name_he",
    "product_name_en",
    "product_name_fr",
    "generic_name",
    "brands",
    "image_front_url",
    "image_front_small_url",
    "image_url",
    "image_small_url",
    "nutriments",
    "labels_tags",
    "categories_tags",
    "ingredients_analysis_tags",
    "nova_group",
    "nutriscore_grade",
    "quantity",
    "serving_size",
]


# --------------------------------------------------------------------------- #
# Staples catalogue
# --------------------------------------------------------------------------- #

def _staple(
    key: str,
    en: str,
    he: str,
    fr: str,
    macro: str,
    kcal: float,
    protein: float,
    carbs: float,
    fat: float,
    fiber: float = 0.0,
    tags: Iterable[str] = (),
    photo: Optional[Tuple[str, str, str]] = None,
    aliases: Iterable[str] = (),
) -> Dict[str, Any]:
    return {
        "key": key,
        "names": {"en": en, "he": he, "fr": fr},
        "macro_type": macro,
        "kcal": kcal,
        "protein": protein,
        "carbs": carbs,
        "fat": fat,
        "fiber": fiber,
        "tags": list(tags),
        "photo": photo,  # (commons file name, license, author)
        "aliases": list(aliases),
    }


GF = "gluten_free"
VEGAN = ("vegan", "vegetarian", GF)
VEGE = ("vegetarian", GF)

STAPLES: List[Dict[str, Any]] = [
    # Proteins
    _staple("chicken_breast", "Chicken breast (raw)", "חזה עוף (נא)", "Blanc de poulet (cru)", "protein",
            120, 22.5, 0, 2.6, 0, (GF,), ("Kycklingfilé.jpg", "Public domain", "Dnor"),
            ("chicken", "עוף", "poulet")),
    _staple("turkey_breast", "Turkey breast (roasted)", "חזה הודו (צלוי)", "Blanc de dinde (rôti)", "protein",
            135, 30, 0, 0.7, 0, (GF,), ("Thanksgiving_Turkey.jpg", "CC BY 2.0", "Patrick Fitzgerald"),
            ("turkey", "הודו", "dinde")),
    _staple("lean_beef", "Lean ground beef 5% (raw)", "בשר בקר טחון רזה 5% (נא)", "Boeuf haché 5% (cru)", "protein",
            137, 21.4, 0, 5, 0, (GF,), ("Hackfleisch-1.jpg", "CC BY-SA 3.0", "Rainer Zenz"),
            ("beef", "בקר", "boeuf", "steak")),
    _staple("salmon", "Salmon fillet (raw)", "פילה סלמון (נא)", "Filet de saumon (cru)", "protein",
            208, 20, 0, 13.4, 0, (GF,), ("Raw_salmon_fillets.jpg", "CC0", "Fulvio Tognon"),
            ("fish", "דג", "poisson")),
    _staple("tuna", "Tuna in water (canned, drained)", "טונה במים (משומרת)", "Thon au naturel (égoutté)", "protein",
            116, 25.5, 0, 0.8, 0, (GF,), None, ("fish", "דג", "poisson")),
    _staple("eggs", "Whole egg", "ביצה שלמה", "Oeuf entier", "protein",
            143, 12.6, 0.7, 9.5, 0, VEGE, ("6-Pack-Chicken-Eggs.jpg", "Public domain", "Evan-Amos"),
            ("egg", "ביצים", "oeufs")),
    _staple("egg_whites", "Egg whites", "חלבוני ביצה", "Blancs d'oeuf", "protein",
            52, 10.9, 0.7, 0.2, 0, VEGE,
            ("Chicken_Egg_without_Eggshell_5859.jpg", "CC BY 3.0", "Biswarup Ganguly"), ("חלבון",)),
    _staple("cottage_cheese", "Cottage cheese 5%", "קוטג' 5%", "Cottage cheese 5%", "protein",
            96, 11, 2.5, 5, 0, VEGE + ("dairy",), ("Cottagecheese200px.jpg", "CC BY-SA 3.0", "Fastily"),
            ("קוטג", "cottage", "fromage blanc")),
    _staple("greek_yogurt", "Greek yogurt 0%", "יוגורט יווני 0%", "Yaourt grec 0%", "protein",
            59, 10.2, 3.6, 0.4, 0, VEGE + ("dairy",), ("Labneh01.jpg", "Public domain", "Omernos"),
            ("yogurt", "יוגורט", "yaourt", "skyr")),
    _staple("tofu", "Firm tofu", "טופו קשה", "Tofu ferme", "protein",
            144, 17.3, 2.8, 8.7, 2.3, VEGAN,
            ("Japanese_SilkyTofu_(Kinugoshi_Tofu).JPG", "CC BY-SA 3.0", "DryPot"), ("טופו",)),
    # Carbs
    _staple("white_rice", "White rice (cooked)", "אורז לבן (מבושל)", "Riz blanc (cuit)", "carb",
            130, 2.7, 28.2, 0.3, 0.4, VEGAN, ("Bowl_of_white_rice_01.jpg", "CC0", "Douglas Perkins"),
            ("rice", "אורז", "riz")),
    _staple("brown_rice", "Brown rice (cooked)", "אורז מלא (מבושל)", "Riz complet (cuit)", "carb",
            123, 2.7, 25.6, 1, 1.6, VEGAN,
            ("Brown_rice_(whole_grain_rice)_photographed_in_West_Bengal,_India.jpg", "CC BY-SA 4.0", "Billjones94"),
            ("rice", "אורז", "riz")),
    _staple("oats", "Rolled oats (dry)", "שיבולת שועל (יבשה)", "Flocons d'avoine (secs)", "carb",
            379, 13.2, 67.7, 6.5, 10.1, ("vegan", "vegetarian"), ("Rolled_oats.jpg", "Public domain", "Hankwang"),
            ("oatmeal", "קוואקר", "avoine", "porridge")),
    _staple("sweet_potato", "Sweet potato (raw)", "בטטה (נא)", "Patate douce (crue)", "carb",
            86, 1.6, 20.1, 0.1, 3, VEGAN + ("vegetable",), ("Sweet_Potatos.jpg", "CC0", "SarKaLay"),
            ("batata", "בטטה")),
    _staple("potato", "Potato (raw)", "תפוח אדמה (נא)", "Pomme de terre (crue)", "carb",
            77, 2, 17.5, 0.1, 2.2, VEGAN + ("vegetable",), ("Patates.jpg", "Public domain", "Scott Bauer, USDA ARS"),
            ("תפוד", "pomme de terre")),
    _staple("whole_wheat_bread", "Whole wheat bread", "לחם מחיטה מלאה", "Pain complet", "carb",
            252, 12.4, 42.7, 3.5, 6, ("vegan", "vegetarian"),
            ("Vegan_no-knead_whole_wheat_bread_loaf,_September_2010.jpg", "CC BY-SA 2.0", "Veganbaking.net"),
            ("bread", "לחם", "pain")),
    _staple("pasta", "Pasta (dry)", "פסטה (יבשה)", "Pâtes (sèches)", "carb",
            371, 13, 74.7, 1.5, 3.2, ("vegan", "vegetarian"),
            ("(Pasta)_by_David_Adam_Kess_(pic.2).jpg", "CC BY-SA 4.0", "David Adam Kess"),
            ("spaghetti", "ספגטי", "pates")),
    _staple("quinoa", "Quinoa (cooked)", "קינואה (מבושלת)", "Quinoa (cuit)", "carb",
            120, 4.4, 21.3, 1.9, 2.8, VEGAN, ("Reismelde.jpg", "CC BY-SA 3.0", "Markus Hagenlocher"), ()),
    _staple("lentils", "Lentils (cooked)", "עדשים (מבושלות)", "Lentilles (cuites)", "carb",
            116, 9, 20.1, 0.4, 7.9, VEGAN, ("3_types_of_lentil.png", "CC BY-SA 2.5", "Justinc"),
            ("lentil", "עדשה", "lentille")),
    _staple("chickpeas", "Chickpeas (cooked)", "חומוס גרגרים (מבושל)", "Pois chiches (cuits)", "carb",
            164, 8.9, 27.4, 2.6, 7.6, VEGAN, ("Chickpea_BNC.jpg", "GFDL 1.2", "Prathyush Thomas"),
            ("garbanzo", "חומוס", "pois chiche")),
    _staple("banana", "Banana", "בננה", "Banane", "carb",
            89, 1.1, 22.8, 0.3, 2.6, VEGAN + ("fruit",), ("Bananavarieties.jpg", "CC BY-SA 3.0", "TimothyPilgrim"), ()),
    _staple("apple", "Apple", "תפוח", "Pomme", "carb",
            52, 0.3, 13.8, 0.2, 2.4, VEGAN + ("fruit",), ("Pink_lady_and_cross_section.jpg", "GFDL 1.2", "Fir0002"),
            ("תפוח עץ",)),
    _staple("broccoli", "Broccoli", "ברוקולי", "Brocoli", "carb",
            34, 2.8, 6.6, 0.4, 2.6, VEGAN + ("vegetable",),
            ("Broccoli_and_cross_section_edit.jpg", "GFDL 1.2", "Fir0002"), ()),
    _staple("cucumber", "Cucumber", "מלפפון", "Concombre", "carb",
            15, 0.7, 3.6, 0.1, 0.5, VEGAN + ("vegetable",), ("ARS_cucumber.jpg", "Public domain", "Stephen Ausmus, USDA ARS"),
            ()),
    _staple("tomato", "Tomato", "עגבנייה", "Tomate", "carb",
            18, 0.9, 3.9, 0.2, 1.2, VEGAN + ("vegetable",), ("Tomato_je.jpg", "CC BY-SA 3.0", "Softeis"), ()),
    # Fats
    _staple("avocado", "Avocado", "אבוקדו", "Avocat", "fat",
            160, 2, 8.5, 14.7, 6.7, VEGAN + ("fruit",), ("Persea_americana_fruit_2.JPG", "CC BY-SA 3.0", "B.navez"), ()),
    _staple("olive_oil", "Olive oil", "שמן זית", "Huile d'olive", "fat",
            884, 0, 0, 100, 0, VEGAN, ("Oliven_V1.jpg", "CC BY-SA 4.0", "Poyraz 72"), ("oil", "שמן", "huile")),
    _staple("almonds", "Almonds", "שקדים", "Amandes", "fat",
            579, 21.2, 21.6, 49.9, 12.5, VEGAN,
            ("Almonds_-_in_shell,_shell_cracked_open,_shelled,_blanched.jpg", "CC BY-SA 4.0", "Ivar Leidus"),
            ("nuts", "אגוזים", "noix")),
    _staple("walnuts", "Walnuts", "אגוזי מלך", "Noix", "fat",
            654, 15.2, 13.7, 65.2, 6.7, VEGAN,
            ("Walnuts_-_whole_and_open_with_halved_kernel.jpg", "CC BY-SA 4.0", "Ivar Leidus"), ("nuts", "אגוזים")),
    _staple("peanut_butter", "Peanut butter", "חמאת בוטנים", "Beurre de cacahuète", "fat",
            588, 25, 20, 50, 6, VEGAN, None, ("peanut", "בוטנים", "cacahuete")),
    _staple("tahini", "Tahini (raw)", "טחינה גולמית", "Tahini (crème de sésame)", "fat",
            595, 17, 21.2, 53.8, 9.3, VEGAN, ("Tahina.JPG", "CC BY-SA 3.0", "Gilabrand"), ("sesame", "שומשום", "sésame")),
    _staple("hummus", "Hummus (spread)", "חומוס (ממרח)", "Houmous", "fat",
            166, 7.9, 14.3, 9.6, 6, VEGAN, ("Lebanese_style_hummus.jpg", "CC BY 3.0", "Beyrouthhh"), ("חומוס",)),
]

STAPLES_BY_KEY = {s["key"]: s for s in STAPLES}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

_HEBREW_RE = re.compile(r"[֐-׿]")


def _num(value: Any) -> Optional[float]:
    try:
        if value is None or value == "":
            return None
        f = float(value)
        if f != f or f < 0:  # NaN / negative
            return None
        return round(f, 1)
    except (TypeError, ValueError):
        return None


def _fold(text: str) -> str:
    """Lowercase + strip accents/punctuation for loose matching (keeps Hebrew)."""
    import unicodedata

    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[\"'`׳״]", "", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def compute_macro_tags(kcal: Optional[float], protein: Optional[float], carbs: Optional[float],
                       fat: Optional[float], fiber: Optional[float]) -> List[str]:
    """Derive macro-based property tags (same rules as the frontend)."""
    tags: List[str] = []
    p, c, f = protein or 0, carbs or 0, fat or 0
    energy = kcal or (p * 4 + c * 4 + f * 9)
    if energy and energy > 0:
        if p >= 15 or ((p * 4) / energy >= 0.35 and p >= 8):
            tags.append("high_protein")
        if (c * 4) / energy >= 0.5 and c >= 5:
            tags.append("carb_source")
        if (f * 9) / energy >= 0.5 and f >= 5:
            tags.append("fat_source")
    if (fiber or 0) >= 6:
        tags.append("high_fiber")
    return tags


def suggest_macro_type(protein: Optional[float], carbs: Optional[float], fat: Optional[float]) -> str:
    p = (protein or 0) * 4
    c = (carbs or 0) * 4
    f = (fat or 0) * 9
    if p == c == f == 0:
        return "carb"
    best = max((p, "protein"), (c, "carb"), (f, "fat"))
    return best[1]


def _merge_tags(*groups: Iterable[str]) -> List[str]:
    seen: List[str] = []
    for group in groups:
        for tag in group:
            if tag in PROPERTY_TAGS and tag not in seen:
                seen.append(tag)
    if "vegan" in seen and "vegetarian" not in seen:
        seen.append("vegetarian")
    return seen


def credit_string(credit: Optional[Dict[str, Any]]) -> Optional[str]:
    """Serialise an image credit for storage on a MealBank row."""
    if not credit:
        return None
    return json.dumps(credit, ensure_ascii=False)


# --------------------------------------------------------------------------- #
# Staples
# --------------------------------------------------------------------------- #

def _staple_image(staple: Dict[str, Any], width: int) -> Optional[str]:
    photo = staple.get("photo")
    if not photo:
        return None
    return COMMONS_FILE_URL.format(file=quote(photo[0]), width=width)


def normalize_staple(staple: Dict[str, Any], lang: str = "he") -> Dict[str, Any]:
    names = staple["names"]
    photo = staple.get("photo")
    credit = None
    if photo:
        credit = {
            "provider": "Wikimedia Commons",
            "author": photo[2],
            "license": photo[1],
            "url": COMMONS_PAGE_URL.format(file=quote(photo[0])),
        }
    kcal, p, c, f, fib = staple["kcal"], staple["protein"], staple["carbs"], staple["fat"], staple["fiber"]
    return {
        "id": f"staple:{staple['key']}",
        "source": "staple",
        "source_id": staple["key"],
        "name": names.get(lang) or names["en"],
        "name_he": names["he"],
        "name_en": names["en"],
        "name_fr": names["fr"],
        "brand": None,
        "image_url": _staple_image(staple, 800),
        "image_thumb_url": _staple_image(staple, 400),
        "image_credit": credit,
        "kcal": kcal,
        "protein": p,
        "carbs": c,
        "fat": f,
        "fiber": fib,
        "per": "100g",
        "barcode": None,
        "tags": _merge_tags(staple["tags"], compute_macro_tags(kcal, p, c, f, fib)),
        "nutriscore": None,
        "nova_group": 1,
        "macro_type": staple["macro_type"],
        "quantity": None,
    }


def search_staples(query: str, lang: str = "he", limit: int = 12) -> List[Dict[str, Any]]:
    q = _fold(query)
    results: List[Tuple[int, Dict[str, Any]]] = []
    for idx, staple in enumerate(STAPLES):
        if not q:
            results.append((idx, staple))
            continue
        haystack = [_fold(n) for n in staple["names"].values()] + [_fold(a) for a in staple["aliases"]]
        haystack.append(staple["key"].replace("_", " "))
        score = None
        for h in haystack:
            if h.startswith(q):
                score = 0
                break
            if q in h:
                score = 1 if score is None else min(score, 1)
        if score is None:
            # Every query word must match somewhere
            words = q.split()
            if words and all(any(w in h for h in haystack) for w in words):
                score = 2
        if score is not None:
            results.append((score * 1000 + idx, staple))
    results.sort(key=lambda r: r[0])
    return [normalize_staple(s, lang) for _, s in results[:limit]]


# --------------------------------------------------------------------------- #
# Open Food Facts
# --------------------------------------------------------------------------- #

def _off_tags(product: Dict[str, Any]) -> List[str]:
    labels = set(product.get("labels_tags") or [])
    cats = set(product.get("categories_tags") or [])
    analysis = set(product.get("ingredients_analysis_tags") or [])
    tags: List[str] = []
    if "en:vegan" in labels or "en:vegan" in analysis:
        tags.append("vegan")
    if "en:vegetarian" in labels or "en:vegetarian" in analysis or "vegan" in tags:
        tags.append("vegetarian")
    if labels & {"en:no-gluten", "en:gluten-free", "en:certified-gluten-free"}:
        tags.append("gluten_free")
    if any(label.startswith("en:kosher") or label.endswith(":kosher") for label in labels):
        tags.append("kosher")
    if cats & {"en:dairies", "en:dairy", "en:milks", "en:cheeses", "en:yogurts", "en:fermented-milk-products"}:
        tags.append("dairy")
    if cats & {"en:vegetables", "en:fresh-vegetables", "en:vegetables-based-foods", "en:leaf-vegetables"}:
        tags.append("vegetable")
    if cats & {"en:fruits", "en:fresh-fruits", "en:fruits-based-foods"}:
        tags.append("fruit")
    return tags


def _off_brand(product: Dict[str, Any]) -> Optional[str]:
    brands = product.get("brands")
    if isinstance(brands, list):
        brands = ", ".join(str(b) for b in brands if b)
    if isinstance(brands, str):
        brands = brands.split(",")[0].strip()
    return brands or None


def _off_image(product: Dict[str, Any], small: bool) -> Optional[str]:
    keys = ("image_front_small_url", "image_small_url", "image_front_url", "image_url") if small else (
        "image_front_url", "image_url", "image_front_small_url", "image_small_url")
    for key in keys:
        url = product.get(key)
        if isinstance(url, str) and url.startswith("http"):
            return url
    return None


def normalize_off_product(product: Dict[str, Any], lang: str = "he") -> Optional[Dict[str, Any]]:
    code = str(product.get("code") or "").strip()
    if not code:
        return None
    base_name = (product.get("product_name") or "").strip()
    name_he = (product.get("product_name_he") or "").strip() or (base_name if _HEBREW_RE.search(base_name) else "")
    name_en = (product.get("product_name_en") or "").strip()
    name_fr = (product.get("product_name_fr") or "").strip()
    localized = {"he": name_he, "en": name_en, "fr": name_fr}.get(lang) or ""
    name = localized or base_name or name_en or name_fr or name_he or (product.get("generic_name") or "").strip()
    if not name:
        return None

    n = product.get("nutriments") or {}
    kcal = _num(n.get("energy-kcal_100g"))
    if kcal is None:
        kj = _num(n.get("energy-kj_100g")) or _num(n.get("energy_100g"))
        kcal = round(kj / 4.184, 1) if kj else None
    protein = _num(n.get("proteins_100g"))
    carbs = _num(n.get("carbohydrates_100g"))
    fat = _num(n.get("fat_100g"))
    fiber = _num(n.get("fiber_100g"))

    nutriscore = (product.get("nutriscore_grade") or "").lower()
    nutriscore = nutriscore if nutriscore in ("a", "b", "c", "d", "e") else None
    nova = product.get("nova_group")
    try:
        nova = int(nova) if nova not in (None, "") else None
        if nova not in (1, 2, 3, 4):
            nova = None
    except (TypeError, ValueError):
        nova = None

    image = _off_image(product, small=False)
    return {
        "id": f"off:{code}",
        "source": "openfoodfacts",
        "source_id": code,
        "name": name,
        "name_he": name_he or None,
        "name_en": name_en or (base_name if base_name and not _HEBREW_RE.search(base_name) else None),
        "name_fr": name_fr or None,
        "brand": _off_brand(product),
        "image_url": image,
        "image_thumb_url": _off_image(product, small=True),
        "image_credit": {
            "provider": "Open Food Facts",
            "author": "Open Food Facts contributors",
            "license": "CC BY-SA 3.0",
            "url": OFF_PRODUCT_PAGE.format(code=code),
        } if image else None,
        "kcal": kcal,
        "protein": protein,
        "carbs": carbs,
        "fat": fat,
        "fiber": fiber,
        "per": "100g",
        "barcode": code,
        "tags": _merge_tags(_off_tags(product), compute_macro_tags(kcal, protein, carbs, fat, fiber)),
        "nutriscore": nutriscore,
        "nova_group": nova,
        "macro_type": suggest_macro_type(protein, carbs, fat),
        "quantity": (product.get("quantity") or None),
    }


class _TTLCache:
    def __init__(self, ttl: int = 600, max_items: int = 300):
        self.ttl = ttl
        self.max_items = max_items
        self._data: Dict[str, Tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any:
        with self._lock:
            hit = self._data.get(key)
            if not hit:
                return None
            if time.time() - hit[0] > self.ttl:
                self._data.pop(key, None)
                return None
            return hit[1]

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            if len(self._data) >= self.max_items:
                oldest = min(self._data.items(), key=lambda kv: kv[1][0])[0]
                self._data.pop(oldest, None)
            self._data[key] = (time.time(), value)


_search_cache = _TTLCache(ttl=600)
_product_cache = _TTLCache(ttl=3600)


class FoodLibraryUnavailable(Exception):
    """Raised when Open Food Facts cannot be reached."""


def _http_get(url: str, params: Optional[Dict[str, Any]] = None, timeout: float = 8.0) -> Dict[str, Any]:
    with httpx.Client(timeout=timeout, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


def _search_off_modern(query: str, lang: str, page: int, page_size: int) -> Tuple[List[Dict[str, Any]], int]:
    langs = ",".join(dict.fromkeys([lang, "en"]))
    data = _http_get(OFF_SEARCH_URL, {
        "q": query,
        "langs": langs,
        "page": page,
        "page_size": page_size,
        "fields": ",".join(_OFF_FIELDS),
    })
    return data.get("hits") or [], int(data.get("count") or 0)


def _search_off_legacy(query: str, lang: str, page: int, page_size: int) -> Tuple[List[Dict[str, Any]], int]:
    params: Dict[str, Any] = {
        "search_terms": query,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page": page,
        "page_size": page_size,
        "lc": lang,
        "fields": ",".join(_OFF_FIELDS),
    }
    cc = LANG_COUNTRY.get(lang)
    if cc and cc != "world":
        params["cc"] = cc
    data = _http_get(OFF_LEGACY_SEARCH_URL, params, timeout=12.0)
    return data.get("products") or [], int(data.get("count") or 0)


def search_open_food_facts(query: str, lang: str = "he", page: int = 1, page_size: int = 24) -> Dict[str, Any]:
    query = (query or "").strip()
    if lang not in SUPPORTED_LANGS:
        lang = "en"
    if len(query) < 2:
        return {"results": [], "count": 0, "page": page}
    cache_key = f"{lang}|{page}|{page_size}|{query.lower()}"
    cached = _search_cache.get(cache_key)
    if cached is not None:
        return cached

    products: List[Dict[str, Any]] = []
    count = 0
    errors: List[str] = []
    for fn in (_search_off_modern, _search_off_legacy):
        try:
            products, count = fn(query, lang, page, page_size)
            break
        except Exception as exc:  # network error, 5xx, rate limit...
            errors.append(f"{fn.__name__}: {exc}")
            logger.warning("Open Food Facts search failed via %s: %s", fn.__name__, exc)
    else:
        raise FoodLibraryUnavailable("; ".join(errors))

    results: List[Dict[str, Any]] = []
    seen = set()
    for product in products:
        item = normalize_off_product(product, lang)
        if not item or item["source_id"] in seen:
            continue
        seen.add(item["source_id"])
        results.append(item)
    # Products with a photo and full macros first - nicer to browse.
    results.sort(key=lambda r: (r["image_url"] is None, r["kcal"] is None or r["protein"] is None))
    payload = {"results": results, "count": count, "page": page}
    _search_cache.set(cache_key, payload)
    return payload


def get_off_product(code: str, lang: str = "he") -> Optional[Dict[str, Any]]:
    code = re.sub(r"[^0-9A-Za-z]", "", code or "")
    if not code:
        return None
    cache_key = f"{lang}|{code}"
    cached = _product_cache.get(cache_key)
    if cached is not None:
        return cached
    data = _http_get(OFF_PRODUCT_URL.format(code=code), {"fields": ",".join(_OFF_FIELDS)})
    product = data.get("product")
    if not product:
        return None
    product.setdefault("code", code)
    item = normalize_off_product(product, lang)
    if item:
        _product_cache.set(cache_key, item)
    return item


def is_allowed_image_url(url: Optional[str]) -> bool:
    if not url:
        return False
    try:
        host = httpx.URL(url).host
    except Exception:
        return False
    return url.startswith("https://") and any(host == h or host.endswith("." + h) for h in ALLOWED_IMAGE_HOSTS)


def match_staple(*names: Optional[str]) -> Optional[Dict[str, Any]]:
    """Staple whose name or alias equals one of `names` (or is its plural / a longer form of it)."""
    keys = [_fold(n) for n in names if n]
    for staple in STAPLES:
        hay = [_fold(n) for n in staple["names"].values()] + [_fold(a) for a in staple["aliases"]]
        hay.append(staple["key"].replace("_", " "))
        if any(k and (k == h or h.startswith(k + " ") or h.startswith(k + "s")) for k in keys for h in hay):
            return staple
    return None
