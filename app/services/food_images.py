"""AI-generated photos for foods that have no good picture (generic foods, products without a photo).

One photo per food name, shared by everyone: generated once, stored next to the trainers' uploaded food
photos (``<uploads>/food_photos/ai_<hash>.png``) and served from ``/files/media/food_photos/``.

Image models: OpenAI (gpt-image-1) or Google Gemini (gemini-2.5-flash-image). Keys, in order:
``OPENAI_API_KEY`` / ``GEMINI_API_KEY`` (or ``GOOGLE_API_KEY``) on the server, then an OpenAI or Google
key saved by the trainee's trainer (Studio -> AI keys). With no key, ``generate`` returns None and the
app shows its own illustrated placeholder.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict, deque
from typing import Deque, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

PUBLIC_PREFIX = "/files/media/food_photos/"
OPENAI_URL = "https://api.openai.com/v1/images/generations"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
OPENAI_MODEL = os.getenv("FOOD_IMAGE_OPENAI_MODEL", "gpt-image-1")
GEMINI_MODEL = os.getenv("FOOD_IMAGE_GEMINI_MODEL", "gemini-2.5-flash-image")
# New generations per user per hour (cached photos are always free).
HOURLY_LIMIT = int(os.getenv("FOOD_IMAGE_HOURLY_LIMIT", "60"))

PROMPT = (
    "Professional, appetizing food photograph of {food}. One typical serving, centered, filling most of the frame, "
    "on a plain soft warm light-grey background, soft natural daylight from the side, gentle shadow, shallow depth "
    "of field, three-quarter top-down angle, photorealistic, crisp detail. Show the food itself as it is eaten "
    "(not a package). No text, no letters, no logos, no labels, no hands, no people."
)

_locks: Dict[str, threading.Lock] = defaultdict(threading.Lock)
_locks_guard = threading.Lock()
_recent: Dict[int, Deque[float]] = defaultdict(deque)
_failed: Dict[str, float] = {}  # key -> time of last failure (avoid hammering a provider for a bad name)


def _photo_dir() -> str:
    base = os.getenv("UPLOAD_DIR") or os.path.join(os.getenv("PERSISTENT_PATH", "/app/persistent"), "uploads")
    path = os.path.join(base, "food_photos")
    os.makedirs(path, exist_ok=True)
    return path


def normalize_name(name: str) -> str:
    """Case / accent / punctuation-insensitive form, so "Greek yogurt 0%" and "greek  yogurt 0 %" share a photo."""
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^\w%]+", " ", s, flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).replace(" %", "%").strip()[:120]


def _key(name: str) -> str:
    return hashlib.sha1(normalize_name(name).encode("utf-8")).hexdigest()[:20]


def _filename(name: str) -> str:
    return f"ai_{_key(name)}.png"


def cached_url(name: str) -> Optional[str]:
    """Public path of the generated photo for ``name`` if it already exists."""
    if not normalize_name(name):
        return None
    fn = _filename(name)
    return PUBLIC_PREFIX + fn if os.path.exists(os.path.join(_photo_dir(), fn)) else None


# ----------------------------------------------------------------- keys

def _image_keys(db: Session, user_id: Optional[int]) -> List[Tuple[str, str]]:
    """(provider, api_key) pairs able to make images, best first."""
    keys: List[Tuple[str, str]] = []
    if os.getenv("OPENAI_API_KEY"):
        keys.append(("openai", os.environ["OPENAI_API_KEY"].strip()))
    g = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if g:
        keys.append(("google", g.strip()))
    if user_id:
        try:
            from app.models.studio import TrainerAiKey
            from app.models.user import User
            from app.services.ai_keys import decrypt_key

            me = db.query(User).filter(User.id == user_id).first()
            owners = [u for u in (getattr(me, "trainer_id", None), user_id) if u]
            rows = (
                db.query(TrainerAiKey)
                .filter(TrainerAiKey.user_id.in_(owners), TrainerAiKey.provider.in_(("openai", "google")))
                .all()
            )
            for r in rows:
                try:
                    keys.append((r.provider, decrypt_key(r.key_ciphertext)))
                except Exception:  # undecryptable (rotated secret)
                    continue
        except Exception as e:  # never break search because of key lookup
            logger.warning("Food image key lookup failed: %s", e)
    return keys


def available(db: Session, user_id: Optional[int]) -> bool:
    return bool(_image_keys(db, user_id))


# ----------------------------------------------------------------- providers

def _post_json(url: str, payload: dict, headers: Dict[str, str], timeout: int = 90) -> dict:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def _openai(api_key: str, prompt: str) -> Optional[bytes]:
    body = _post_json(OPENAI_URL, {"model": OPENAI_MODEL, "prompt": prompt, "size": "1024x1024", "quality": "low", "n": 1},
                      {"Authorization": f"Bearer {api_key}"})
    data = (body.get("data") or [{}])[0]
    if data.get("b64_json"):
        return base64.b64decode(data["b64_json"])
    if data.get("url"):
        with urllib.request.urlopen(data["url"], timeout=30) as r:
            return r.read()
    return None


def _gemini(api_key: str, prompt: str) -> Optional[bytes]:
    body = _post_json(GEMINI_URL.format(model=GEMINI_MODEL),
                      {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseModalities": ["IMAGE"]}},
                      {"x-goog-api-key": api_key})
    for cand in body.get("candidates") or []:
        for part in (cand.get("content") or {}).get("parts") or []:
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"])
    return None


def _rate_ok(user_id: Optional[int]) -> bool:
    if not user_id:
        return True
    q = _recent[user_id]
    now = time.time()
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= HOURLY_LIMIT:
        return False
    q.append(now)
    return True


class RateLimited(Exception):
    pass


def generate(db: Session, user_id: Optional[int], name: str, hint: Optional[str] = None) -> Optional[str]:
    """Public path of a photo for ``name``: the cached one, or a newly generated one. None when impossible.

    ``hint`` (English name, brand…) only steers the prompt; the cache key is ``name``.
    Raises RateLimited when this user generated too many photos in the last hour.
    """
    norm = normalize_name(name)
    if not norm:
        return None
    hit = cached_url(name)
    if hit:
        return hit
    key = _key(name)
    if time.time() - _failed.get(key, 0) < 600:
        return None
    with _locks_guard:
        lock = _locks[key]
    with lock:  # one generation per food even when several screens ask at once
        hit = cached_url(name)
        if hit:
            return hit
        keys = _image_keys(db, user_id)
        if not keys:
            return None
        if not _rate_ok(user_id):
            raise RateLimited()
        food = name.strip()[:120]
        if hint and normalize_name(hint) != norm:
            food = f"{food} ({hint.strip()[:80]})"
        prompt = PROMPT.format(food=food)
        for provider, api_key in keys:
            try:
                img = _openai(api_key, prompt) if provider == "openai" else _gemini(api_key, prompt)
            except (urllib.error.URLError, OSError, ValueError, KeyError) as e:
                logger.warning("Food image (%s) failed for %r: %s", provider, norm, e)
                continue
            if img and len(img) > 1000:
                path = os.path.join(_photo_dir(), _filename(name))
                tmp = path + ".tmp"
                with open(tmp, "wb") as fh:
                    fh.write(img)
                os.replace(tmp, path)
                return PUBLIC_PREFIX + _filename(name)
        _failed[key] = time.time()
        return None
