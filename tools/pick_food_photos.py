"""Pick the best free-licence Wikimedia Commons photo for every built-in staple food (QA #64).

For each staple, Commons is searched for photos; every candidate is scored by the open CLIP model:
  * is it this food?   (probability of the staple among all staples)
  * does it look good? (appetizing food photography vs. packaging / text / diagrams / people / raw market stalls)
The winner (file, licence, author) goes to app/data/food_photos.json, which food_library_service uses instead of
the old hand-picked photos. Re-run after adding staples:

    pip install onnxruntime tokenizers numpy pillow
    python tools/pick_food_photos.py /path/to/clip-files      # text_model_quantized.onnx, vision_model_quantized.onnx, tokenizer.json

Only free licences are kept (CC0, public domain, CC BY, CC BY-SA); credit is shown on every photo.
"""
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services import food_library_service as library  # noqa: E402

API = "https://commons.wikimedia.org/w/api.php"
UA = "ecshape-food-photos/1.0 (food bank photo picker; one-off maintenance script)"
OUT = ROOT / "app" / "data" / "food_photos.json"
FREE = re.compile(r"^(cc0|public domain|pd|cc by(-sa)? \d(\.\d)?)", re.I)
MEAN = np.array((0.48145466, 0.4578275, 0.40821073), dtype=np.float32)
STD = np.array((0.26862954, 0.26130258, 0.27577711), dtype=np.float32)

GOOD = ["professional appetizing food photography, close-up, natural light", "a delicious looking plate of food"]
BAD = [
    "a supermarket shelf with packages", "a product package with text", "a diagram or illustration", "a menu with text",
    "a person eating", "a market stall", "a farm field", "a black and white photo", "a blurry dark photo",
    "an animal", "a plant growing in a garden", "a nutrition label",
    "a brand logo on a jar or bottle", "a plant with flowers", "a tree trunk", "fruit growing on a tree",
    "a live fish swimming in water", "workers in a factory", "a sign with large letters", "a botanical drawing",
    "a bee on a flower", "a glass of wine", "a fast food taco", "wild mushrooms in a forest",
]
REJECTED = ROOT / "tools" / "food_photos_rejected.json"  # files a human reviewer turned down (never picked again)


def clean(name: str) -> str:
    return re.sub(r"\s*\([^)]*\)", "", name).replace("/", " ").strip()


def get_json(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(6):  # Commons rate-limits bursts: back off and retry
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode())
            if "query" in data or "batchcomplete" in data:
                return data
        except Exception:
            pass
        time.sleep(5 * (attempt + 1))
    return {}


def get_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception:
            time.sleep(1.0 * (attempt + 1))
    return None


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def candidates(query, limit=24):
    data = get_json({
        "action": "query", "generator": "search", "gsrnamespace": 6, "gsrlimit": limit,
        "gsrsearch": f"{query} filetype:bitmap",
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 330,
    })
    out = []
    for p in (data.get("query") or {}).get("pages", []):
        ii = (p.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata") or {}
        lic = strip_html((meta.get("LicenseShortName") or {}).get("value"))
        if not FREE.match(lic or "") or ii.get("mime") not in ("image/jpeg", "image/png"):
            continue
        w, h = ii.get("width") or 0, ii.get("height") or 0
        if w < 640 or h < 480 or not (0.6 <= w / max(h, 1) <= 1.9):
            continue
        author = strip_html((meta.get("Artist") or {}).get("value"))[:80] or "Unknown"
        out.append({"file": p["title"].removeprefix("File:"), "license": lic, "author": author, "thumb": ii.get("thumburl")})
    return out


def pixels(data):
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    s = 224 / min(w, h)
    img = img.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BICUBIC)
    w, h = img.size
    l, t = (w - 224) // 2, (h - 224) // 2
    arr = (np.asarray(img.crop((l, t, l + 224, t + 224)), dtype=np.float32) / 255.0 - MEAN) / STD
    return arr.transpose(2, 0, 1)


def main(model_dir):
    d = Path(model_dir)
    tok = Tokenizer.from_file(str(d / "tokenizer.json"))
    tok.enable_padding(length=77, pad_id=49407, pad_token="<|endoftext|>")
    tok.enable_truncation(max_length=77)
    text = ort.InferenceSession(str(d / "text_model_quantized.onnx"))
    vision = ort.InferenceSession(str(d / "vision_model_quantized.onnx"))

    def embed_text(texts):
        ids = np.array([e.ids for e in tok.encode_batch(texts)], dtype=np.int64)
        v = text.run(None, {"input_ids": ids})[0]
        return v / np.linalg.norm(v, axis=1, keepdims=True)

    staples = library.STAPLES
    labels = [clean(s["names"]["en"]).lower() for s in staples]
    food_vecs = np.stack([embed_text([f"a photo of {l}, a type of food.", f"a close-up photo of {l}."]).mean(0) for l in labels])
    food_vecs /= np.linalg.norm(food_vecs, axis=1, keepdims=True)
    good = embed_text(GOOD).mean(0)
    good /= np.linalg.norm(good)
    bad = embed_text(BAD)

    result = json.loads(OUT.read_text()) if OUT.exists() else {}
    rejected = json.loads(REJECTED.read_text()) if REJECTED.exists() else {}
    pool = ThreadPoolExecutor(max_workers=4)
    for i, s in enumerate(staples):
        if s["key"] in result:
            continue
        label = labels[i]
        time.sleep(1.0)  # be gentle with Commons
        cands = candidates(label)
        queries = [label + " food"] + ([label + " on a plate", label + " close-up"] if s["key"] in rejected else [])
        for q in queries:
            if len(cands) >= 6 and s["key"] not in rejected:
                break
            seen = {x["file"] for x in cands}
            cands += [c for c in candidates(q) if c["file"] not in seen]
        cands = [c for c in cands if c["file"] not in set(rejected.get(s["key"], []))]
        datas = list(pool.map(lambda c: get_bytes(c["thumb"]) if c["thumb"] else None, cands))
        best, best_score = None, -1e9
        batch, keep = [], []
        for c, data in zip(cands, datas):
            if not data:
                continue
            try:
                batch.append(pixels(data))
                keep.append(c)
            except Exception:
                continue
        if not batch:
            print(f"{s['key']}: no candidates", flush=True)
            continue
        emb = vision.run(None, {"pixel_values": np.stack(batch).astype(np.float32)})[0]
        emb /= np.linalg.norm(emb, axis=1, keepdims=True)
        logits = 100 * emb @ food_vecs.T
        probs = np.exp(logits - logits.max(1, keepdims=True))
        probs /= probs.sum(1, keepdims=True)
        for j, c in enumerate(keep):
            p_food = float(probs[j, i])
            rank = int((probs[j] > probs[j, i]).sum())
            appeal = float(emb[j] @ good) - float((emb[j] @ bad.T).max())
            if rank > 4 or p_food < 0.08:
                continue  # probably not this food
            score = np.log(p_food + 1e-6) + 12 * appeal
            if score > best_score:
                best, best_score = c, score
        if best:
            result[s["key"]] = [best["file"], best["license"], best["author"]]
            print(f"{s['key']}: {best['file']}  ({best['license']}, score {best_score:.2f})", flush=True)
        else:
            print(f"{s['key']}: nothing good enough", flush=True)
        if i % 10 == 0:
            OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1, sort_keys=True))
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1, sort_keys=True))
    print(f"{len(result)}/{len(staples)} staples have a photo -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
