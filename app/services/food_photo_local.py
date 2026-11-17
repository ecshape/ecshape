"""Meal photo recognition with no AI key at all (QA #51).

An open CLIP model (Xenova/clip-vit-base-patch32, MIT licence, ~89 MB, CPU) runs on our own server. The photo and
five crops of it (whole, centre, four quarters, so plates with several foods work) are compared with pre-computed
embeddings of every built-in staple food (app/data/clip_food_vocab.npz, built by tools/build_clip_food_vocab.py).
Each found food gets a typical portion for its kind and the staple's nutrition values.

Nothing leaves the server: no third-party service sees the photo. An AI key (Gemini, Claude, OpenAI), when there is
one, still runs first because it reads quantities and mixed dishes better.
"""
from __future__ import annotations

import io
import re
import logging
import os
import threading
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

MODEL_URL = os.getenv(
    "FOOD_PHOTO_MODEL_URL",
    "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx",
)
VOCAB_PATH = Path(__file__).resolve().parents[1] / "data" / "clip_food_vocab.npz"
MEAN = (0.48145466, 0.4578275, 0.40821073)
STD = (0.26862954, 0.26130258, 0.27577711)
LOGIT_SCALE = 100.0

# Typical portion (grams) by food kind, when the photo cannot tell the amount.
PORTION_G = {
    "meat": 150, "fish": 150, "egg": 100, "dairy": 150, "grain": 150, "bread": 60, "legume": 150,
    "vegetable": 100, "fruit": 130, "nut": 30, "oil": 10, "sweet": 50, "snack": 40, "sauce": 30,
    "dish": 300, "drink": 250,
}
PORTION_BY_MACRO = {"protein": 150, "carb": 150, "fat": 15}

# Ready-made dishes a photo often shows (per 100 g, typical values) with a typical portion. Staples cover single foods.
# (key, en, he, fr, kcal, protein, carbs, fat, portion g)
DISHES: List[Tuple[str, str, str, str, float, float, float, float, int]] = [
    ("pizza", "Pizza", "פיצה", "Pizza", 250, 11, 31, 10, 200),
    ("hamburger", "Hamburger in a bun", "המבורגר בלחמנייה", "Hamburger", 250, 13, 24, 11, 220),
    ("shawarma_pita", "Shawarma in pita", "שווארמה בפיתה", "Chawarma en pita", 220, 14, 20, 9, 350),
    ("falafel_pita", "Falafel in pita", "פלאפל בפיתה", "Falafel en pita", 230, 7, 30, 9, 300),
    ("falafel_balls", "Falafel balls", "כדורי פלאפל", "Boulettes de falafel", 333, 13, 32, 18, 100),
    ("schnitzel", "Chicken schnitzel", "שניצל עוף", "Escalope panée", 260, 22, 12, 14, 150),
    ("sandwich", "Sandwich", "כריך", "Sandwich", 240, 11, 28, 9, 200),
    ("pasta_tomato", "Pasta with tomato sauce", "פסטה ברוטב עגבניות", "Pâtes sauce tomate", 140, 5, 25, 2.5, 300),
    ("spaghetti_bolognese", "Spaghetti bolognese", "ספגטי בולונז", "Spaghetti bolognaise", 150, 8, 18, 5, 350),
    ("pasta_cream", "Pasta in cream sauce", "פסטה ברוטב שמנת", "Pâtes à la crème", 190, 6, 22, 9, 300),
    ("lasagna", "Lasagna", "לזניה", "Lasagnes", 160, 9, 15, 7, 300),
    ("sushi", "Sushi", "סושי", "Sushi", 150, 6, 28, 1.5, 200),
    ("shakshuka", "Shakshuka", "שקשוקה", "Chakchouka", 110, 7, 5, 7, 300),
    ("omelette", "Omelette", "חביתה", "Omelette", 155, 11, 1, 12, 150),
    ("pancakes", "Pancakes", "פנקייק", "Pancakes", 227, 6, 28, 10, 150),
    ("greek_salad", "Greek salad", "סלט יווני", "Salade grecque", 110, 3, 5, 9, 250),
    ("green_salad", "Green salad with dressing", "סלט ירוק עם רוטב", "Salade verte vinaigrette", 70, 1.5, 5, 5, 200),
    ("israeli_salad", "Chopped vegetable salad", "סלט ירקות קצוץ", "Salade de légumes", 45, 1, 6, 2, 200),
    ("caesar_salad", "Caesar salad", "סלט קיסר", "Salade César", 140, 6, 6, 10, 250),
    ("vegetable_soup", "Vegetable soup", "מרק ירקות", "Soupe de légumes", 40, 1.5, 7, 1, 350),
    ("chicken_soup", "Chicken soup", "מרק עוף", "Soupe de poulet", 45, 4, 3, 1.5, 350),
    ("fried_rice", "Fried rice", "אורז מוקפץ", "Riz sauté", 165, 5, 25, 5, 300),
    ("stir_fry", "Chicken and vegetable stir-fry", "מוקפץ עוף וירקות", "Sauté de poulet aux légumes", 110, 10, 6, 5, 300),
    ("burrito", "Burrito", "בוריטו", "Burrito", 210, 9, 25, 8, 350),
    ("tacos", "Tacos", "טאקו", "Tacos", 220, 10, 20, 11, 200),
    ("hot_dog", "Hot dog", "נקניקייה בלחמנייה", "Hot-dog", 290, 10, 24, 17, 150),
    ("croissant", "Croissant", "קרואסון", "Croissant", 406, 8, 46, 21, 60),
    ("brioche", "Brioche", "בריוש", "Brioche", 350, 9, 50, 12, 60),
    ("cake", "Cake", "עוגה", "Gâteau", 370, 5, 50, 17, 100),
    ("ice_cream", "Ice cream", "גלידה", "Glace", 207, 3.5, 24, 11, 120),
    ("cookies", "Cookies", "עוגיות", "Biscuits", 480, 5, 65, 22, 40),
    ("chocolate", "Chocolate", "שוקולד", "Chocolat", 535, 7, 58, 30, 40),
    ("acai_bowl", "Smoothie bowl", "קערת סמותי", "Smoothie bowl", 90, 1.5, 17, 2, 300),
    ("yogurt_granola", "Yogurt with granola", "יוגורט עם גרנולה", "Yaourt au granola", 140, 5, 20, 4, 250),
    ("protein_shake", "Protein shake", "שייק חלבון", "Shake protéiné", 55, 9, 3, 1, 350),
    ("couscous_veg", "Couscous with vegetables", "קוסקוס עם ירקות", "Couscous aux légumes", 120, 4, 22, 2, 300),
    ("burekas", "Bourekas", "בורקס", "Bourekas", 330, 7, 30, 20, 120),
    ("bagel", "Bagel", "בייגל", "Bagel", 250, 10, 49, 1.5, 100),
    ("avocado_toast", "Avocado toast", "טוסט אבוקדו", "Toast à l'avocat", 190, 5, 20, 10, 150),
    ("meatballs", "Meatballs in sauce", "קציצות ברוטב", "Boulettes en sauce", 180, 12, 7, 12, 200),
    ("kebab", "Grilled kebab", "קבב על האש", "Brochette kebab", 230, 18, 2, 17, 150),
    ("grilled_steak", "Grilled steak", "סטייק על האש", "Steak grillé", 250, 26, 0, 16, 200),
    ("grilled_salmon", "Grilled salmon fillet", "פילה סלמון צלוי", "Pavé de saumon grillé", 206, 22, 0, 12, 150),
    ("grilled_chicken", "Grilled chicken breast", "חזה עוף צלוי", "Blanc de poulet grillé", 165, 31, 0, 3.6, 150),
]


def photo_staples():
    """Staples that a photo can show: dry / uncooked forms are left out (a plate shows cooked rice, not dry rice)."""
    from app.services import food_library_service as library

    return [s for s in library.STAPLES if "(dry)" not in s["names"]["en"].lower()]


_lock = threading.Lock()
_session = None
_vocab: Optional[Tuple[List[str], Any]] = None


def _model_path() -> Path:
    base = Path(os.getenv("PERSISTENT_PATH", "/app/persistent")) / "models"
    return base / "clip-vit-b32-vision-q.onnx"


def _download() -> Path:
    path = _model_path()
    if path.exists() and path.stat().st_size > 50_000_000:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part")
    logger.info("Downloading the meal photo model (%s)…", MODEL_URL)
    req = urllib.request.Request(MODEL_URL, headers={"User-Agent": "ecshape-app/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r, open(tmp, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    tmp.replace(path)
    logger.info("Meal photo model ready (%.0f MB)", path.stat().st_size / 1e6)
    return path


def warm_up_in_background() -> None:
    """Fetch the model file at startup so the first photo does not wait for the download."""
    def run():
        try:
            with _lock:
                _download()
        except Exception as e:  # never break startup
            logger.warning("Meal photo model download failed (will retry on first photo): %s", e)
    threading.Thread(target=run, daemon=True).start()


def _load():
    global _session, _vocab
    with _lock:
        if _session is None:
            import numpy as np
            import onnxruntime as ort

            opts = ort.SessionOptions()
            opts.intra_op_num_threads = max(1, min(4, os.cpu_count() or 1))
            _session = ort.InferenceSession(str(_download()), sess_options=opts, providers=["CPUExecutionProvider"])
            data = np.load(VOCAB_PATH)
            vecs = data["vecs"].astype(np.float32)
            _vocab = ([str(k) for k in data["keys"]], vecs)
    return _session, _vocab


def available() -> bool:
    """True when the local recogniser can run (libraries installed, vocabulary shipped)."""
    try:
        import numpy  # noqa: F401
        import onnxruntime  # noqa: F401
    except ImportError:
        return False
    return VOCAB_PATH.exists()


def _pixels(img) -> Any:
    import numpy as np
    from PIL import Image

    img = img.convert("RGB")
    w, h = img.size
    s = 224 / min(w, h)
    img = img.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BICUBIC)
    w, h = img.size
    left, top = (w - 224) // 2, (h - 224) // 2
    img = img.crop((left, top, left + 224, top + 224))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - np.array(MEAN, dtype=np.float32)) / np.array(STD, dtype=np.float32)
    return arr.transpose(2, 0, 1)


def _crops(data: bytes) -> List[Any]:
    from PIL import Image, ImageOps

    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    except Exception as e:
        raise ValueError("unreadable image") from e
    img.thumbnail((1024, 1024))
    w, h = img.size
    boxes = [
        (0, 0, w, h),
        (w // 6, h // 6, w - w // 6, h - h // 6),
        (0, 0, w // 2 + w // 10, h // 2 + h // 10),
        (w // 2 - w // 10, 0, w, h // 2 + h // 10),
        (0, h // 2 - h // 10, w // 2 + w // 10, h),
        (w // 2 - w // 10, h // 2 - h // 10, w, h),
    ]
    return [_pixels(img.crop(b)) for b in boxes]


def identify(data: bytes, lang: str = "en", max_items: int = 4) -> List[Dict[str, Any]]:
    """Foods in a meal photo, with a typical portion and its nutrition. Raises on unreadable images."""
    import numpy as np

    from app.services import food_library_service as library

    session, (keys, vecs) = _load()
    batch = np.stack(_crops(data)).astype(np.float32)
    emb = session.run(None, {"pixel_values": batch})[0]
    emb = emb / np.linalg.norm(emb, axis=1, keepdims=True)
    logits = LOGIT_SCALE * emb @ vecs.T
    probs = np.exp(logits - logits.max(axis=1, keepdims=True))
    probs = probs / probs.sum(axis=1, keepdims=True)

    by_key = {s["key"]: s for s in library.STAPLES}
    for d in DISHES:
        by_key["dish:" + d[0]] = {
            "key": "dish:" + d[0], "names": {"en": d[1], "he": d[2], "fr": d[3]},
            "kcal": d[4], "protein": d[5], "carbs": d[6], "fat": d[7], "portion": d[8], "category": "dish",
        }
    score: Dict[str, float] = {}
    whole = probs[0]
    if keys[int(whole.argmax())].startswith("!") and whole.max() > 0.5:
        return []  # clearly not a meal photo
    for i, row in enumerate(probs):
        order = row.argsort()[::-1][:3]
        for rank, j in enumerate(order):
            k = keys[int(j)]
            p = float(row[j])
            if k.startswith("!"):
                continue
            # the whole photo counts more; quarters only add foods they are fairly sure about
            weight = 1.0 if i <= 1 else 0.7
            if (i <= 1 and rank == 0) or p >= 0.35:
                score[k] = max(score.get(k, 0.0), p * weight)
    chosen = sorted(score.items(), key=lambda kv: kv[1], reverse=True)
    if not chosen:
        return []
    best = chosen[0][1]
    index = {k: i for i, k in enumerate(keys)}
    picked: List[str] = []
    for k, sc in chosen:
        if sc < max(0.12, best * 0.3) or len(picked) >= max_items:
            continue
        # near-duplicates ("sweet potato" / "baked sweet potato") count once
        if any(float(vecs[index[k]] @ vecs[index[p]]) > 0.88 for p in picked):
            continue
        # a dish already covers its ingredients (pizza -> no separate mozzarella) unless they are clearly separate
        if any(p.startswith("dish:") for p in picked) and not k.startswith("dish:") and sc < 0.6:
            continue
        picked.append(k)

    lang = (lang or "en")[:2]
    out: List[Dict[str, Any]] = []
    for k in picked:
        s = by_key.get(k)
        if not s:
            continue
        g = s.get("portion") or PORTION_G.get(s.get("category") or "", PORTION_BY_MACRO.get(s.get("macro_type") or "", 100))
        f = g / 100.0
        name = re.sub(r"\s*\((?:raw|נא|cru|crue)\)", "", s["names"].get(lang) or s["names"]["en"]).strip()
        out.append({
            "name": name,
            "grams": g,
            "calories": round((s.get("kcal") or 0) * f),
            "protein": round((s.get("protein") or 0) * f, 1),
            "carbs": round((s.get("carbs") or 0) * f, 1),
            "fat": round((s.get("fat") or 0) * f, 1),
            "confidence": round(score[k], 2),
        })
    return out
