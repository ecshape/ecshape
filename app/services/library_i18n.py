"""QA #140: the built-in exercise library in all three app languages, stored once in the database.

The library is English (data_library/exercises.json). Its names and instruction steps are translated to Hebrew
and French once, in the background, into the shared translation cache (translation_cache). Library endpoints then
send each exercise with its translation for the asked language (`i18n`), so opening an exercise shows the steps at
once instead of asking the translator every time.
"""
import logging
import os
import threading
import time
from typing import Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from app.models.translation_cache import TranslationCache

logger = logging.getLogger(__name__)

LANGS = ("he", "fr")
_BATCH = 40
_running = threading.Lock()


def _texts(e: Dict) -> List[str]:
    return [t for t in [e.get("name") or "", *(e.get("instructions") or [])] if t and t.strip()]


def _cached(db: Session, lang: str, texts: Iterable[str]) -> Dict[str, str]:
    from app.services.translate import _hash

    by_hash = {_hash(t): t for t in texts}
    if not by_hash:
        return {}
    out: Dict[str, str] = {}
    keys = list(by_hash)
    for i in range(0, len(keys), 500):
        rows = db.query(TranslationCache.src_hash, TranslationCache.text).filter(
            TranslationCache.lang == lang, TranslationCache.src_hash.in_(keys[i:i + 500])).all()
        out.update({by_hash[h]: txt for h, txt in rows})
    return out


def attach(db: Session, items: List[Dict], lang: Optional[str]) -> List[Dict]:
    """Adds `i18n: {lang, name, instructions}` (whatever is already translated) to library items. One query."""
    lang = (lang or "")[:2]
    if lang not in LANGS or not items:
        return items
    try:
        have = _cached(db, lang, [t for e in items for t in _texts(e)])
    except Exception as e:  # translations are a bonus: never break the list
        logger.warning("library i18n lookup failed: %s", e)
        return items
    for e in items:
        steps = e.get("instructions") or []
        e["i18n"] = {
            "lang": lang,
            "name": have.get(e.get("name") or ""),
            "instructions": [have.get(s) for s in steps],
        }
    return items


def _key_owner(db: Session) -> int:
    """Whose saved AI keys pay for the one-time translation: a coach with a key, else only the server keys."""
    try:
        from app.models.studio import TrainerAiKey

        row = db.query(TrainerAiKey.user_id).order_by(TrainerAiKey.is_preferred.desc(), TrainerAiKey.created_at.asc()).first()
        return row[0] if row else 0
    except Exception:
        return 0


def warm_all(session_factory, pause: float = 4.0) -> Dict[str, int]:
    """Translates every library text that isn't cached yet (he, fr). Idempotent; a second run costs one query."""
    from app.routers.exercise_library import _library
    from app.services.translate import translate

    if not _running.acquire(blocking=False):
        return {}
    done: Dict[str, int] = {}
    try:
        everything = list(dict.fromkeys(t for e in _library() for t in _texts(e)))
        for lang in LANGS:
            db = session_factory()
            try:
                have = _cached(db, lang, everything)
                missing = [t for t in everything if t not in have]
                owner = _key_owner(db)
            finally:
                db.close()
            if not missing:
                continue
            logger.info("library i18n: translating %d texts to %s", len(missing), lang)
            n = 0
            for i in range(0, len(missing), _BATCH):
                db = session_factory()
                try:
                    res = translate(db, owner, missing[i:i + _BATCH], lang, "en")
                    n += sum(1 for a, b in zip(missing[i:i + _BATCH], res["texts"]) if a != b)
                except Exception as e:
                    logger.warning("library i18n batch failed: %s", e)
                finally:
                    db.close()
                time.sleep(pause)  # gentle on free translator quotas
            done[lang] = n
            logger.info("library i18n: %s done (%d new)", lang, n)
    finally:
        _running.release()
    return done


def start_background(session_factory) -> None:
    """Runs warm_all once in a daemon thread at startup (skipped in tests or with LIBRARY_I18N_WARM=0)."""
    if os.getenv("LIBRARY_I18N_WARM", "1") == "0" or os.getenv("PYTEST_CURRENT_TEST") or os.getenv("TESTING"):
        return
    threading.Thread(target=warm_all, args=(session_factory,), name="library-i18n", daemon=True).start()
