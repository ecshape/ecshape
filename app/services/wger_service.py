"""
wger (https://wger.de) - open exercise database, data CC-BY-SA, no API key.

We download the whole public catalogue once (``/api/v2/exerciseinfo/?limit=1000``,
~900 exercises, a few MB) and keep it in memory for 12 hours, then search it
locally. Items are normalised to the shape of the built-in exercise library
(free-exercise-db): lowercase muscle keys, equipment keys, instructions list,
frames (image URLs). IDs are prefixed ``wger:``.
"""

from __future__ import annotations

import html
import logging
import re
import threading
import time
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = "ECshape-dev/1.0"
WGER_INFO_URL = "https://wger.de/api/v2/exerciseinfo/"
WGER_PAGE = "https://wger.de/exercise/{id}/view-base"
TTL_SECONDS = 12 * 3600
ATTRIBUTION = "Data: wger.de (CC-BY-SA)"

LANG_IDS = {"en": 2, "fr": 12, "he": 21, "de": 1}

# wger muscle id -> library muscle key (free-exercise-db names)
MUSCLE = {
    1: "biceps", 2: "shoulders", 3: "chest", 4: "chest", 5: "triceps", 6: "abdominals", 7: "calves",
    8: "glutes", 9: "traps", 10: "quadriceps", 11: "hamstrings", 12: "lats", 13: "biceps",
    14: "abdominals", 15: "calves",
}
# wger category id -> fallback muscle when an exercise lists none
CATEGORY_MUSCLE = {10: "abdominals", 8: "biceps", 12: "lats", 14: "calves", 11: "chest", 9: "quadriceps", 13: "shoulders"}
CARDIO_CATEGORY = 15
# wger equipment id -> library equipment key
EQUIPMENT = {
    1: "barbell", 2: "e-z curl bar", 3: "dumbbell", 4: "body only", 5: "exercise ball", 6: "body only",
    7: "body only", 10: "kettlebells", 11: "bands", 12: "cable",
}
BENCHES = {8, 9}


class WgerUnavailable(Exception):
    pass


_lock = threading.Lock()
_cache: Dict[str, Any] = {"at": 0.0, "items": None, "failed_at": 0.0}


def _strip_html(text: str) -> List[str]:
    if not text:
        return []
    parts = re.split(r"</li>|</p>|<br\s*/?>|\n", text, flags=re.I)
    steps = []
    for part in parts:
        clean = html.unescape(re.sub(r"<[^>]+>", " ", part))
        clean = re.sub(r"\s+", " ", clean).strip()
        clean = re.sub(r"^\d+[.)]\s*", "", clean)
        if len(clean) > 2:
            steps.append(clean[:600])
    return steps[:12]


def _normalize(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    wid = raw.get("id")
    trans = {t.get("language"): t for t in raw.get("translations") or [] if t.get("name")}
    en = trans.get(LANG_IDS["en"])
    if not wid or not en:
        return None
    names = {code: (trans[lid]["name"].strip() if lid in trans else None) for code, lid in LANG_IDS.items()}
    instr = {code: _strip_html(trans[lid].get("description") or "") if lid in trans else [] for code, lid in LANG_IDS.items()}

    primary = list(dict.fromkeys(MUSCLE[m["id"]] for m in raw.get("muscles") or [] if m.get("id") in MUSCLE))
    secondary = [k for k in dict.fromkeys(
        MUSCLE[m["id"]] for m in raw.get("muscles_secondary") or [] if m.get("id") in MUSCLE) if k not in primary]
    cat_id = (raw.get("category") or {}).get("id")
    if not primary and cat_id in CATEGORY_MUSCLE:
        primary = [CATEGORY_MUSCLE[cat_id]]

    eq_ids = [e.get("id") for e in raw.get("equipment") or []]
    equipment = None
    for eid in eq_ids:
        if eid in EQUIPMENT and eid not in (4, 6, 7):
            equipment = EQUIPMENT[eid]
            break
    if equipment is None and any(e in EQUIPMENT for e in eq_ids):
        equipment = "body only"
    if equipment is None and any(e in BENCHES for e in eq_ids):
        equipment = "other"

    images = sorted(raw.get("images") or [], key=lambda i: (not i.get("is_main"), i.get("id") or 0))
    frames = [i["image"] for i in images if str(i.get("image") or "").startswith("https://wger.de/")][:2]
    thumbs = [((i.get("thumbnails") or {}).get("medium") or i["image"]) for i in images
              if str(i.get("image") or "").startswith("https://wger.de/")][:2]
    author = raw.get("license_author") or ""
    return {
        "id": f"wger:{wid}",
        "source": "wger",
        "name": names["en"],
        "names": {k: v for k, v in names.items() if v},
        "instructions_i18n": {k: v for k, v in instr.items() if v},
        "level": "",
        "equipment": equipment,
        "mechanic": None,
        "force": None,
        "category": "cardio" if cat_id == CARDIO_CATEGORY else "strength",
        "primaryMuscles": primary,
        "secondaryMuscles": secondary,
        "instructions": instr["en"],
        "frames": frames,
        "thumbs": thumbs,
        "license": ((raw.get("license") or {}).get("short_name") or "CC-BY-SA"),
        "license_author": author[:120] or None,
        "source_url": WGER_PAGE.format(id=wid),
        "_hay": " ".join(
            [*(v.lower() for v in names.values() if v), equipment or "", *primary, *secondary]
        ),
    }


def catalog() -> List[Dict[str, Any]]:
    """All wger exercises (normalised). Raises WgerUnavailable."""
    now = time.time()
    items = _cache["items"]
    if items is not None and now - _cache["at"] < TTL_SECONDS:
        return items
    with _lock:
        items = _cache["items"]
        if items is not None and time.time() - _cache["at"] < TTL_SECONDS:
            return items
        if time.time() - _cache["failed_at"] < 60 and items is None:
            raise WgerUnavailable("recent failure")
        try:
            with httpx.Client(timeout=25.0, headers={"User-Agent": USER_AGENT}) as client:
                resp = client.get(WGER_INFO_URL, params={"limit": 1000})
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:  # network, 5xx, bad json
            logger.warning("wger catalogue download failed: %s", exc)
            _cache["failed_at"] = time.time()
            if items is not None:  # serve stale data rather than nothing
                return items
            raise WgerUnavailable(str(exc)) from exc
        out = []
        for raw in data.get("results") or []:
            try:
                item = _normalize(raw)
            except Exception:  # one malformed row must not break the catalogue
                item = None
            if item:
                out.append(item)
        out.sort(key=lambda e: (not e["frames"], e["name"].lower()))
        _cache.update(items=out, at=time.time())
        return out


def cached_count() -> Optional[int]:
    items = _cache["items"]
    return len(items) if items is not None else None


def localize(item: Dict[str, Any], lang: str) -> Dict[str, Any]:
    """Public copy with the name / instructions in `lang` when wger has them (falls back to English)."""
    out = {k: v for k, v in item.items() if not k.startswith("_")}
    out["name"] = item["names"].get(lang) or item["name"]
    out["name_en"] = item["name"]
    out["instructions"] = item["instructions_i18n"].get(lang) or item["instructions"]
    out.pop("instructions_i18n", None)
    return out
