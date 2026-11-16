"""Extra interface languages (QA #85: Russian, Arabic).

The English texts of the app, the public site and the legal pages ship in app/data/i18n_en.json (built by
tools/build_i18n_source.mjs). GET /api/public/i18n/<lang> returns them translated. Missing texts are translated once,
in the background, with the studio's AI keys (then the server keys, then the free fallback), and cached in
TranslationCache, so every visitor afterwards gets the full language instantly. Texts not translated yet are simply
absent: the app shows English for those until they are ready.
"""
from __future__ import annotations

import json
import logging
import re
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple

from fastapi import APIRouter

from app.database import SessionLocal
from app.models.translation_cache import TranslationCache
from app.models.user import User
from app.schemas.auth import UserRole
from app.services import translate as tr
from app.services.ai_keys import all_engines, provider_error_text

logger = logging.getLogger(__name__)
router = APIRouter()

SOURCE = Path(__file__).resolve().parents[1] / "data" / "i18n_en.json"
EXTRA_LANGS = ("ru", "ar")
PLACEHOLDER = re.compile(r"\{\{[^}]+\}\}|\{[a-zA-Z_]+\}|<[^>]+>")
_running: Dict[str, threading.Thread] = {}
_guard = threading.Lock()


@lru_cache(maxsize=1)
def _source() -> Dict[str, Any]:
    return json.loads(SOURCE.read_text(encoding="utf-8"))


def _flatten(node: Any, prefix: str = "") -> List[Tuple[str, str]]:
    if isinstance(node, str):
        return [(prefix, node)]
    out: List[Tuple[str, str]] = []
    if isinstance(node, dict):
        for k, v in node.items():
            out += _flatten(v, f"{prefix}\x1f{k}" if prefix else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            out += _flatten(v, f"{prefix}\x1f#{i}")
    return out


def _translatable(text: str) -> bool:
    t = text.strip()
    if not t or len(t) > 4000:
        return False
    if re.fullmatch(r"[\d\s.,:;/+\-–—%()×x#@]*", t):  # numbers, phone numbers, separators
        return False
    if re.fullmatch(r"(https?://|/|mailto:|tel:)\S*", t) or re.fullmatch(r"[\w.+-]+@[\w-]+\.[\w.]+", t):
        return False
    return bool(re.search(r"[A-Za-z]", t))


def _protect(text: str) -> Tuple[str, List[str]]:
    """{{count}}, {name} and HTML tags become ⟦0⟧ markers the translator keeps as they are."""
    found: List[str] = []

    def sub(m: re.Match) -> str:
        found.append(m.group(0))
        return f"⟦{len(found) - 1}⟧"

    return PLACEHOLDER.sub(sub, text), found


def _restore(text: str, found: List[str]) -> str:
    for i, v in enumerate(found):
        text = text.replace(f"⟦{i}⟧", v)
    return text


def _items() -> List[Tuple[str, str, str, List[str]]]:
    """(path, original, protected, placeholders) for every translatable English text."""
    out = []
    for path, text in _flatten(_source()):
        if path.split("\x1f")[0] == "site" and ("\x1fcontact\x1f" in path or path.endswith("\x1fvalue")):
            continue  # phone numbers, handles and form values are not words
        if _translatable(text):
            prot, ph = _protect(text)
            out.append((path, text, prot, ph))
    return out


def _cached(db, lang: str, protected: List[str]) -> Dict[str, str]:
    hashes = {tr._hash(p, "en"): p for p in protected}
    have: Dict[str, str] = {}
    keys = list(hashes)
    for i in range(0, len(keys), 500):
        for row in db.query(TranslationCache).filter(TranslationCache.lang == lang, TranslationCache.src_hash.in_(keys[i:i + 500])).all():
            have[hashes[row.src_hash]] = row.text
    return have


def _studio_engines(db):
    coach = db.query(User).filter(User.role == UserRole.TRAINER).order_by(User.id).first()
    return all_engines(db, [coach.id] if coach else [])


def _fill(lang: str) -> None:
    """Background job: translate every text of this language that is not cached yet (40 per AI call)."""
    db = SessionLocal()
    try:
        items = _items()
        protected = list(dict.fromkeys(p for _, _, p, _ in items))
        have = _cached(db, lang, protected)
        missing = [p for p in protected if p not in have]
        if not missing:
            return
        engines = _studio_engines(db)
        db.rollback()
        if not engines:
            # Thousands of texts would use up the free fallback's daily quota that trainees' screens rely on.
            logger.warning("i18n %s: no AI key, %d texts stay in English for now", lang, len(missing))
            return
        logger.info("i18n %s: translating %d texts", lang, len(missing))
        done = 0
        for i in range(0, len(missing), 40):
            chunk = missing[i:i + 40]
            out = None
            for engine in engines:
                try:
                    out = tr._parse(tr._call(engine, tr._prompt(tr.LANGS[lang], chunk, "English")), len(chunk))
                except Exception as e:  # a key without credit falls through to the next one
                    logger.warning("i18n %s (%s) failed: %s", lang, engine.provider, provider_error_text(e))
                    out = None
                if out:
                    break
            for src, dst in zip(chunk, out or []):
                if dst and all(f"⟦{k}⟧" in dst for k in range(src.count("⟦"))):
                    db.add(TranslationCache(lang=lang, src_hash=tr._hash(src, "en"), src=src, text=dst))
                    done += 1
            try:
                db.commit()
            except Exception:  # another worker cached some of them first
                db.rollback()
        logger.info("i18n %s: %d of %d texts translated", lang, done, len(missing))
    except Exception:
        logger.exception("i18n %s: background translation failed", lang)
    finally:
        db.close()
        with _guard:
            _running.pop(lang, None)


def _start(lang: str) -> None:
    with _guard:
        if lang in _running and _running[lang].is_alive():
            return
        t = threading.Thread(target=_fill, args=(lang,), name=f"i18n-{lang}", daemon=True)
        _running[lang] = t
        t.start()


def _set(tree: Dict[str, Any], path: str, value: str) -> None:
    parts = path.split("\x1f")
    node: Any = tree
    for i, p in enumerate(parts):
        last = i == len(parts) - 1
        nxt = parts[i + 1] if not last else None
        key: Any = int(p[1:]) if p.startswith("#") else p
        if isinstance(node, list):
            while len(node) <= key:
                node.append(None)
        if last:
            node[key] = value
            return
        child = node[key] if (isinstance(node, list) and node[key] is not None) or (isinstance(node, dict) and key in node) else None
        if child is None:
            child = [] if nxt and nxt.startswith("#") else {}
            node[key] = child
        node = child


@router.get("/i18n/{lang}")
def i18n_bundle(lang: str):
    lang = (lang or "")[:2].lower()
    if lang not in EXTRA_LANGS:
        return {"lang": lang, "complete": True, "app": {}, "site": {}, "legal": {}, "legalNav": {}}
    db = SessionLocal()
    try:
        items = _items()
        have = _cached(db, lang, [p for _, _, p, _ in items])
    finally:
        db.close()
    tree: Dict[str, Any] = {}
    n = 0
    for path, _orig, prot, ph in items:
        if prot in have:
            _set(tree, path, _restore(have[prot], ph))
            n += 1
    complete = n == len(items)
    if not complete:
        _start(lang)
    return {"lang": lang, "complete": complete, "progress": round(n / max(1, len(items)), 3),
            "app": tree.get("app", {}), "site": tree.get("site", {}), "legal": tree.get("legal", {}), "legalNav": tree.get("legalNav", {})}
