"""Build app/data/clip_food_vocab.npz: CLIP text embeddings of every built-in staple food (QA #51).

The server recognises meal photos without any AI key by comparing the photo's CLIP embedding with these
pre-computed food embeddings (see app/services/food_photo_local.py). Re-run after adding staples:

    pip install onnxruntime tokenizers numpy
    python tools/build_clip_food_vocab.py /path/to/clip-files

where /path/to/clip-files holds text_model_quantized.onnx and tokenizer.json from
https://huggingface.co/Xenova/clip-vit-base-patch32 (MIT licence).
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.food_photo_local import DISHES, photo_staples  # noqa: E402

TEMPLATES = ["a photo of {}, a type of food.", "a close-up photo of {} on a plate.", "a photo of a meal with {}."]
# Things a meal photo often shows that are not food: they win over food labels and are dropped from the result.
NOT_FOOD = [
    "an empty plate", "an empty table", "a person", "a hand", "a phone screen", "a kitchen", "a restaurant menu",
    "a dog", "a cat", "a document", "a car", "a room",
]


def clean(name: str) -> str:
    return re.sub(r"\s*\([^)]*\)", "", name).replace("/", " or ").strip()


def main(model_dir: str) -> None:
    d = Path(model_dir)
    tok = Tokenizer.from_file(str(d / "tokenizer.json"))
    tok.enable_padding(length=77, pad_id=49407, pad_token="<|endoftext|>")
    tok.enable_truncation(max_length=77)
    sess = ort.InferenceSession(str(d / "text_model_quantized.onnx"))

    def embed(texts):
        ids = np.array([e.ids for e in tok.encode_batch(texts)], dtype=np.int64)
        out = sess.run(None, {"input_ids": ids})[0]
        return out / np.linalg.norm(out, axis=1, keepdims=True)

    keys, vecs = [], []
    labels = [(s["key"], s["names"]["en"]) for s in photo_staples()] + [("dish:" + d[0], d[1]) for d in DISHES]
    for key, en in labels:
        label = clean(en).lower()
        v = embed([t.format(label) for t in TEMPLATES]).mean(axis=0)
        keys.append(key)
        vecs.append(v / np.linalg.norm(v))
    for n in NOT_FOOD:
        keys.append("!" + n)
        vecs.append(embed([f"a photo of {n}."])[0])
    out = ROOT / "app" / "data" / "clip_food_vocab.npz"
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out, keys=np.array(keys), vecs=np.array(vecs, dtype=np.float16))
    print(f"{len(keys)} labels -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
