"""Instagram comment auto-reply logic (ManyChat-style)."""
import json
import logging
import os
import random
import re
import threading
from collections import OrderedDict
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Bundled with the app code so it ships in the Docker image (data/ is not copied).
_DEFAULT_RULES_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "instagram_rules.json",
)

_rules_cache = {"mtime": None, "path": None, "rules": []}
_seen = OrderedDict()
_seen_lock = threading.Lock()
_SEEN_MAX = 5000


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def load_rules() -> list:
    path = os.getenv("INSTAGRAM_RULES_PATH") or _DEFAULT_RULES_PATH
    if path != _DEFAULT_RULES_PATH and not os.path.exists(path):
        logger.warning("Instagram rules file not found: %s, using bundled %s", path, _DEFAULT_RULES_PATH)
        path = _DEFAULT_RULES_PATH
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        logger.warning("Instagram rules file not found: %s", path)
        return []
    if _rules_cache["mtime"] != mtime or _rules_cache["path"] != path:
        try:
            with open(path, encoding="utf-8") as f:
                _rules_cache["rules"] = json.load(f).get("rules", [])
            _rules_cache["mtime"], _rules_cache["path"] = mtime, path
        except Exception:
            logger.exception("Failed to load Instagram rules")
            return _rules_cache["rules"]
    return _rules_cache["rules"]


def find_matching_rule(text: str, media_id: Optional[str] = None) -> Optional[dict]:
    norm = _normalize(text)
    if not norm:
        return None
    for rule in load_rules():
        media_ids = [str(m) for m in rule.get("media_ids") or []]
        if media_ids and str(media_id) not in media_ids:
            continue
        exact = rule.get("match", "contains") == "exact"
        for kw in rule.get("keywords", []):
            k = _normalize(kw)
            if k and ((norm == k) if exact else (k in norm)):
                return rule
    return None


def _already_handled(comment_id: str) -> bool:
    with _seen_lock:
        if comment_id in _seen:
            return True
        _seen[comment_id] = True
        if len(_seen) > _SEEN_MAX:
            _seen.popitem(last=False)
    return False


def handle_comment(comment_id: str, text: str, from_id: str, media_id: Optional[str] = None,
                   client: Optional[httpx.Client] = None) -> dict:
    """Match a comment against rules; send public reply + private DM."""
    result = {"matched": False, "reply": None, "dm": None}
    own_id = os.getenv("INSTAGRAM_BUSINESS_ID")
    if not comment_id or (own_id and str(from_id) == own_id):
        return result
    rule = find_matching_rule(text, media_id)
    if not rule or _already_handled(comment_id):
        return result
    result["matched"] = True

    token = os.getenv("INSTAGRAM_ACCESS_TOKEN")
    if not token:
        logger.error("INSTAGRAM_ACCESS_TOKEN not set")
        return result
    version = os.getenv("INSTAGRAM_API_VERSION", "v21.0")
    base = f"https://graph.instagram.com/{version}"
    headers = {"Authorization": f"Bearer {token}"}
    own = client or httpx.Client(timeout=10)
    try:
        replies = rule.get("public_reply") or []
        if isinstance(replies, str):
            replies = [replies]
        if replies:
            result["reply"] = _post(own, f"{base}/{comment_id}/replies", headers,
                                    {"message": random.choice(replies)})
        if rule.get("dm_text"):
            ig_id = own_id or "me"
            result["dm"] = _post(own, f"{base}/{ig_id}/messages", headers, {
                "recipient": {"comment_id": comment_id},
                "message": {"text": rule["dm_text"]},
            }, as_json=True)
    finally:
        if client is None:
            own.close()
    return result


def _post(client: httpx.Client, url: str, headers: dict, payload: dict, as_json: bool = False) -> bool:
    try:
        resp = client.post(url, headers=headers, **({"json": payload} if as_json else {"data": payload}))
        if resp.status_code >= 400:
            logger.error("Instagram API %s failed: %s %s", url, resp.status_code, resp.text[:300])
            return False
        return True
    except Exception:
        logger.exception("Instagram API call failed: %s", url)
        return False
