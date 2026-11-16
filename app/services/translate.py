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
from app.services.ai_keys import Engine, all_engines, provider_error_text

logger = logging.getLogger(__name__)

LANGS = {"he": "Hebrew", "fr": "French", "en": "English", "ru": "Russian", "ar": "Arabic"}  # ru / ar: QA #85
# src_lang "auto": mixed sources (Open Food Facts names in French, wger exercises in German…), detected per text.
SRC_NAMES = {**LANGS, "auto": "their original language (detect it per item)"}
FAST_CLAUDE = "claude-haiku-5-5"
_lock = threading.Lock()


def _hash(text: str, src_lang: str = "en") -> str:
    key = text.strip() if src_lang == "en" else f"{src_lang}|{text.strip()}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()


def engines_for(db: Session, user_id: int) -> List[Engine]:
    """The user's keys, their coach's keys, then server keys; tried in order (a key without credit falls through)."""
    me = db.query(User).filter(User.id == user_id).first()
    return all_engines(db, [user_id, getattr(me, "trainer_id", None)])


def _prompt(lang_name: str, texts: List[str], src_name: str = "English") -> str:
    return (
        f"Translate each item of this JSON array from {src_name} into {lang_name} for a fitness coaching app / website. "
        "Keep the meaning and tone exact, keep line breaks, emoji and simple HTML tags as they are, "
        "use natural, simple wording a gym-goer understands, keep numbers and units, keep placeholders such as {{count}} or {name} "
        "and markers such as ⟦0⟧ exactly as they are, keep proper exercise names that are "
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


MYMEMORY_URL = "https://api.mymemory.translated.net/get"
MM_LANG = {"he": "he-IL", "fr": "fr-FR", "en": "en-GB", "ru": "ru-RU", "ar": "ar-SA", "auto": "autodetect"}


def _mm_piece(text: str, src: str, dst: str, timeout: float = 20) -> Optional[str]:
    import urllib.parse

    url = MYMEMORY_URL + "?" + urllib.parse.urlencode({"q": text, "langpair": f"{MM_LANG[src]}|{MM_LANG[dst]}"})
    req = urllib.request.Request(url, headers={"User-Agent": "ecshape-app/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = json.loads(r.read().decode())
    if body.get("quotaFinished") or int(body.get("responseStatus") or 0) != 200:
        return None
    out = (body.get("responseData") or {}).get("translatedText")
    return out if isinstance(out, str) and out.strip() else None


def _mm_text(text: str, src: str, dst: str) -> Optional[str]:
    parts: List[str] = []
    for line in text.split("\n"):
        if not line.strip():
            parts.append(line)
            continue
        chunks = re.findall(r".{1,450}(?:[.!?;,]\s|$)|.{1,450}", line) or [line]
        done = []
        for c in chunks:
            t = _mm_piece(c, src, dst)
            if t is None:
                return None
            done.append(t.strip())
        parts.append(" ".join(done))
    return "\n".join(parts)


def _mymemory(texts: List[str], src: str, dst: str) -> List[Optional[str]]:
    """Keyless fallback (QA #43 #48): MyMemory free machine translation (up to ~500 chars a request), 6 at a time.
    One result per text; None where that text could not be translated (it is then not cached and retried later)."""
    from concurrent.futures import ThreadPoolExecutor

    def one(t: str) -> Optional[str]:
        try:
            return _mm_text(t, src, dst)
        except Exception as e:  # network / quota / same language: keep the original
            logger.info("Translation fallback (MyMemory) failed: %s", e)
            return None

    with ThreadPoolExecutor(max_workers=6) as pool:
        return list(pool.map(one, texts))


def translate(db: Session, user_id: int, texts: List[str], lang: str, src_lang: str = "en") -> Dict[str, object]:
    lang = (lang or "en")[:2]
    src_lang = "auto" if src_lang == "auto" else (src_lang or "en")[:2]
    clean = [str(t or "") for t in texts]
    if lang not in LANGS or src_lang not in SRC_NAMES or lang == src_lang or not any(t.strip() for t in clean):
        return {"texts": clean, "translated": lang == src_lang}
    hashes = [_hash(t, src_lang) for t in clean]
    rows = db.query(TranslationCache).filter(TranslationCache.lang == lang, TranslationCache.src_hash.in_(set(hashes))).all()
    have = {r.src_hash: r.text for r in rows}
    missing = list(dict.fromkeys(t for t, h in zip(clean, hashes) if t.strip() and h not in have))
    complete = True
    if missing:
        engines = engines_for(db, user_id)
        # Give the DB connection back to the pool before any slow network call: many screens translate at once
        # and requests waiting on a translator must not hold connections (QueuePool exhaustion).
        db.rollback()
        for i in range(0, len(missing), 40):
                    chunk = missing[i:i + 40]
                    out: Optional[List[Optional[str]]] = None
                    if engines:
                        with _lock:  # one paid AI batch at a time per worker (avoids paying twice for the same texts)
                            for engine in engines:
                                try:
                                    out = _parse(_call(engine, _prompt(LANGS[lang], chunk, SRC_NAMES.get(src_lang, "English"))), len(chunk))
                                except Exception as e:  # provider errors must never break the screen
                                    logger.warning("Translation (%s) failed: %s", engine.provider, provider_error_text(e))
                                    out = None
                                if out:
                                    break
                    if not out and src_lang in MM_LANG and lang in MM_LANG:
                        out = _mymemory(chunk, src_lang, lang)
                    if not out:
                        complete = False
                        continue
                    for src, dst in zip(chunk, out):
                        if dst is None:
                            complete = False
                            continue
                        h = _hash(src, src_lang)
                        have[h] = dst
                        db.add(TranslationCache(lang=lang, src_hash=h, src=src, text=dst))
                    try:
                        db.commit()
                    except IntegrityError:  # another request cached the same text first
                        db.rollback()
    result = [have.get(h, t) if t.strip() else t for t, h in zip(clean, hashes)]
    return {"texts": result, "translated": complete}
