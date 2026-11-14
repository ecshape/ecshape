"""Translate library texts (English exercise instructions, names…) into he / fr once, then serve them from the cache.

The AI engine is the user's own key, else their trainer's, else the server key (ANTHROPIC_API_KEY). Without any key the
originals come back with ``translated=False`` and the app keeps its "English only" note.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import threading
import urllib.request
from typing import Dict, List, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.translation_cache import TranslationCache
from app.models.user import User
from app.services.ai_keys import Engine, resolve_engine

logger = logging.getLogger(__name__)

LANGS = {"he": "Hebrew", "fr": "French"}
FAST_CLAUDE = "claude-haiku-5-5"
_lock = threading.Lock()


def _hash(text: str) -> str:
    return hashlib.sha1(text.strip().encode("utf-8")).hexdigest()


def engine_for(db: Session, user_id: int) -> Optional[Engine]:
    me = db.query(User).filter(User.id == user_id).first()
    for uid in (user_id, getattr(me, "trainer_id", None)):
        if uid:
            eng = resolve_engine(db, uid)
            if eng:
                return eng
    return None


def _prompt(lang_name: str, texts: List[str]) -> str:
    return (
        f"Translate each item of this JSON array from English into {lang_name} for a fitness app. Keep the meaning exact, "
        "use natural, simple wording a gym-goer understands, keep numbers and units, keep proper exercise names that are "
        "usually said in English (e.g. Bench Press) in English when that is how people say them. Return ONLY a JSON array of "
        f"strings with exactly {len(texts)} items in the same order.\n\n" + json.dumps(texts, ensure_ascii=False)
    )


def _parse(raw: str, n: int) -> Optional[List[str]]:
    m = re.search(r"\[.*\]", raw or "", re.S)
    if not m:
        return None
    try:
        out = json.loads(m.group(0))
    except ValueError:
        return None
    if not isinstance(out, list) or len(out) != n:
        return None
    return [str(x) for x in out]


def _call(engine: Engine, prompt: str) -> str:
    if engine.provider == "anthropic":
        import anthropic

        client = anthropic.Anthropic(api_key=engine.api_key)
        model = FAST_CLAUDE if engine.source == "server" or engine.model.startswith("claude-opus") else engine.model
        res = client.messages.create(model=model, max_tokens=8000, messages=[{"role": "user", "content": prompt}])
        return "".join(b.text for b in res.content if getattr(b, "type", "") == "text")
    if not engine.base_url:
        raise RuntimeError("no base url")
    req = urllib.request.Request(
        engine.base_url.rstrip("/") + "/chat/completions",
        data=json.dumps({"model": engine.model, "messages": [{"role": "user", "content": prompt}]}).encode(),
        method="POST", headers={"Content-Type": "application/json", "Authorization": f"Bearer {engine.api_key}"},
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        body = json.loads(r.read().decode())
    return (body.get("choices") or [{}])[0].get("message", {}).get("content") or ""


def translate(db: Session, user_id: int, texts: List[str], lang: str) -> Dict[str, object]:
    lang = (lang or "en")[:2]
    clean = [str(t or "") for t in texts]
    if lang not in LANGS or not any(t.strip() for t in clean):
        return {"texts": clean, "translated": lang == "en"}
    hashes = [_hash(t) for t in clean]
    rows = db.query(TranslationCache).filter(TranslationCache.lang == lang, TranslationCache.src_hash.in_(set(hashes))).all()
    have = {r.src_hash: r.text for r in rows}
    missing = list(dict.fromkeys(t for t, h in zip(clean, hashes) if t.strip() and h not in have))
    complete = True
    if missing:
        engine = engine_for(db, user_id)
        if not engine:
            complete = False
        else:
            with _lock:  # one batch at a time per worker (avoids paying twice for the same texts)
                for i in range(0, len(missing), 40):
                    chunk = missing[i:i + 40]
                    try:
                        out = _parse(_call(engine, _prompt(LANGS[lang], chunk)), len(chunk))
                    except Exception as e:  # provider errors must never break the screen
                        logger.warning("Translation (%s) failed: %s", engine.provider, e)
                        out = None
                    if not out:
                        complete = False
                        continue
                    for src, dst in zip(chunk, out):
                        h = _hash(src)
                        have[h] = dst
                        db.add(TranslationCache(lang=lang, src_hash=h, src=src, text=dst))
                    try:
                        db.commit()
                    except IntegrityError:  # another request cached the same text first
                        db.rollback()
    result = [have.get(h, t) if t.strip() else t for t, h in zip(clean, hashes)]
    return {"texts": result, "translated": complete}
