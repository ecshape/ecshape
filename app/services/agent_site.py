"""
Site actions Agent EC can carry out after the trainer confirms them: new site pages (served at /p/<slug>),
the site menu, the section layout, button links, blog articles — and an undo snapshot taken before each one,
so the trainer can say "no, that's not what I wanted" and get the site back exactly as it was.

Custom pages are stored in one site setting ("site_pages"), like the blog articles ("articles").
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

PAGES_KEY = "site_pages"
UNDO_KEY = "agent_undo"
UNDO_KEEP = 25
SITE_LANGS = ("he", "en", "fr")
CONTENT_LANGS = ("he", "en", "fr", "ru", "ar")
SECTION_KEYS = ("hero", "marquee", "manifesto", "story", "results", "shift", "programs", "app", "process", "voices", "faq", "cta", "ig")
LINK_PATHS = ("nav.cta", "nav.login", "hero.ctaPrimary", "hero.ctaSecondary", "results.ctaButton", "programs.start", "programs.more",
              "app.already", "faq.other", "cta.form", "cta.whatsapp", "ig.button", "footer.instagram", "footer.whatsapp", "footer.contact")
# Default menu of the home page (labels are the site texts nav.<key>).
DEFAULT_MENU = [("about", "#story"), ("results", "#results"), ("programs", "#programs"), ("app", "#app"), ("reviews", "#voices"), ("faq", "#faq")]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clip(v: Any, n: int) -> str:
    return str(v or "").strip()[:n]


# ------------------------------------------------------------------ links
def clean_href(raw: Any) -> str:
    """Same rules as the site's link editor (site/links.ts): no javascript: and the like."""
    v = str(raw or "").strip()
    if v in ("form", "whatsapp", "instagram"):
        return v
    if re.fullmatch(r"#[\w-]{1,60}", v):
        return v
    if re.fullmatch(r"/[^\s\"'<>]*", v) and not v.startswith("//"):
        return v
    if re.fullmatch(r"(https?://|mailto:|tel:)[^\s\"'<>]+", v, re.I):
        return v
    if re.fullmatch(r"[\w-]+(\.[\w-]+)+(/[^\s\"'<>]*)?", v):
        return "https://" + v
    return ""


# ------------------------------------------------------------------ custom pages
def list_pages(db: Session) -> List[Dict[str, Any]]:
    from app.routers.studio import get_setting
    items = get_setting(db, PAGES_KEY).get("items") or []
    return sorted(items, key=lambda p: p.get("updatedAt") or "", reverse=True)


def _store_pages(db: Session, items: List[Dict[str, Any]], user_id: Optional[int]) -> None:
    from app.routers.studio import put_setting
    put_setting(db, PAGES_KEY, {"items": items}, user_id)


def save_page(db: Session, raw: Dict[str, Any], user_id: Optional[int]) -> Dict[str, Any]:
    from app.services.seo_writer import sanitize_html, slugify

    items = list_pages(db)
    page_id = raw.get("id")
    existing = next((p for p in items if p.get("id") == page_id), None) if page_id else None
    title = _clip(raw.get("title"), 200)
    if not title:
        raise ValueError("A title is required.")
    lang = raw.get("lang") if raw.get("lang") in SITE_LANGS else "he"
    slug = slugify(raw.get("slug") or title) or uuid.uuid4().hex[:8]
    if not existing:  # same address in the same language = a new version of that page (the menu keeps pointing to it)
        existing = next((p for p in items if p.get("slug") == slug and p.get("lang") == lang), None)
        page_id = existing["id"] if existing else None
    base, n = slug, 2
    while any(p.get("slug") == slug and p.get("lang") == lang and p.get("id") != page_id for p in items):
        slug = f"{base}-{n}"
        n += 1
    seo = raw.get("seo") if isinstance(raw.get("seo"), dict) else {}
    page = {
        "id": page_id if existing else uuid.uuid4().hex,
        "lang": lang,
        "slug": slug,
        "title": title,
        "intro": _clip(raw.get("intro"), 600),
        "contentHtml": sanitize_html(raw.get("contentHtml") or ""),
        "coverImage": _clip(raw.get("coverImage"), 500),
        "cta": raw.get("cta") is not False,  # "book an intro call" box at the end
        "status": "published" if raw.get("status") == "published" else "draft",
        "seo": {"title": _clip(seo.get("title"), 120), "description": _clip(seo.get("description"), 320)},
        "createdAt": (existing or {}).get("createdAt") or _now(),
        "updatedAt": _now(),
    }
    _store_pages(db, [p for p in items if p.get("id") != page["id"]] + [page], user_id)
    return page


def delete_page(db: Session, page_id: str, user_id: Optional[int]) -> None:
    items = list_pages(db)
    if not any(p.get("id") == page_id for p in items):
        raise LookupError(page_id)
    _store_pages(db, [p for p in items if p.get("id") != page_id], user_id)


def public_page(db: Session, slug: str, lang: Optional[str]) -> Optional[Dict[str, Any]]:
    live = [p for p in list_pages(db) if p.get("status") == "published" and p.get("slug") == slug]
    return next((p for p in live if p.get("lang") == lang), None) or (live[0] if live else None)


# ------------------------------------------------------------------ menu / layout / links (stored in content:<lang>)
def _update_content(db: Session, langs, user_id: Optional[int], mutate) -> None:
    from app.routers.studio import get_setting, put_setting
    for lang in langs:
        content = get_setting(db, f"content:{lang}") or {}
        mutate(lang, content)
        put_setting(db, f"content:{lang}", content, user_id)


def menu_view(db: Session) -> Dict[str, Any]:
    """What the agent needs to edit the menu: the saved menu per language (none = default menu)."""
    from app.routers.studio import get_setting
    out: Dict[str, Any] = {"default_menu": [{"label_text": f"nav.{k}", "href": h} for k, h in DEFAULT_MENU],
                           "note": "A language without a saved menu shows the default menu (labels = site texts nav.*). "
                                   "Links: #section on the home page, /blog, /p/<page-slug>, /home, or https://…"}
    for lang in SITE_LANGS:
        c = get_setting(db, f"content:{lang}") or {}
        out[lang] = {"saved_menu": (c.get("menu") or {}).get("items"), "nav_texts": c.get("nav") or "(defaults)"}
    out["pages"] = [{"slug": p["slug"], "lang": p["lang"], "title": p["title"], "status": p["status"], "href": f"/p/{p['slug']}"} for p in list_pages(db)]
    return out


def set_menu(db: Session, lang: str, items: List[Dict[str, Any]], user_id: Optional[int]) -> None:
    clean = []
    for it in items[:12]:
        label, href = _clip((it or {}).get("label"), 60), clean_href((it or {}).get("href"))
        if label and href and href not in ("form", "whatsapp", "instagram"):
            clean.append({"label": label, "href": href})
    if lang not in SITE_LANGS:
        raise ValueError("Invalid language")

    def mutate(_l: str, content: Dict[str, Any]) -> None:
        if clean:
            content["menu"] = {"items": clean}
        else:
            content.pop("menu", None)  # empty list = back to the default menu
    _update_content(db, [lang], user_id, mutate)


def set_layout(db: Session, order: Optional[List[str]], hidden: Optional[List[str]], user_id: Optional[int]) -> None:
    def mutate(_l: str, content: Dict[str, Any]) -> None:
        layout = dict(content.get("layout") or {})
        if order is not None:
            layout["order"] = [k for k in order if k in SECTION_KEYS]
        if hidden is not None:
            layout["hidden"] = [k for k in hidden if k in SECTION_KEYS and k != "hero"]
        content["layout"] = layout
    _update_content(db, CONTENT_LANGS, user_id, mutate)  # the layout is shared by every language


def set_link(db: Session, path: str, target: str, user_id: Optional[int]) -> None:
    if path not in LINK_PATHS:
        raise ValueError("This button has no editable link.")
    t = clean_href(target) if target else ""
    if target and not t:
        raise ValueError("Invalid link target.")

    def mutate(_l: str, content: Dict[str, Any]) -> None:
        links = dict(content.get("links") or {})
        if t:
            links[path] = t
        else:
            links.pop(path, None)
        content["links"] = links
    _update_content(db, CONTENT_LANGS, user_id, mutate)


# ------------------------------------------------------------------ undo
def keys_for(op: Dict[str, Any]) -> List[str]:
    """Settings an action changes (empty: no undo, e.g. prospects and QA tickets)."""
    kind = op.get("kind")
    if kind in ("site.text", "site.menu", "site.layout", "site.link"):
        return [f"content:{l}" for l in CONTENT_LANGS]  # one text edit is translated into the other languages
    if kind == "seo.page":
        return ["seo"]
    if kind == "article.save":
        return ["articles"]
    if kind == "page.save":
        return [PAGES_KEY]
    return []


def _read(db: Session, keys: List[str]) -> Dict[str, Any]:
    from app.models.studio import SiteSetting
    from app.routers.studio import get_setting
    out: Dict[str, Any] = {}
    for k in keys:
        row = db.query(SiteSetting).filter(SiteSetting.key == k).first()
        out[k] = get_setting(db, k) if row else None
    return out


def snapshot(db: Session, op: Dict[str, Any], user_id: Optional[int], undo_id: Optional[str] = None) -> Optional[str]:
    """Before an action: save what it may change. After it (undo_id given): save the result too, so undo can
    revert only what this action changed and keep later edits."""
    from app.routers.studio import get_setting, put_setting

    store = get_setting(db, UNDO_KEY)
    entries = store.get("entries") or []
    if undo_id:
        entry = next((e for e in entries if e.get("id") == undo_id), None)
        if not entry:
            return None
        entry["after"] = _read(db, list((entry.get("values") or {}).keys()))
        put_setting(db, UNDO_KEY, {"entries": entries}, user_id)
        return undo_id
    keys = keys_for(op)
    if not keys:
        return None
    new_id = uuid.uuid4().hex
    entries = (entries + [{"id": new_id, "kind": op.get("kind"), "at": _now(), "by": user_id, "values": _read(db, keys)}])[-UNDO_KEEP:]
    put_setting(db, UNDO_KEY, {"entries": entries}, user_id)
    return new_id


_MISSING = object()


def _keyed(v: Any) -> Any:
    """Lists of records with an id (articles, pages) are compared record by record."""
    if isinstance(v, list) and v and all(isinstance(x, dict) and x.get("id") for x in v):
        return {"\x00" + str(x["id"]): _keyed(x) for x in v}
    if isinstance(v, dict):
        return {k: _keyed(x) for k, x in v.items()}
    return v


def _unkeyed(v: Any) -> Any:
    if isinstance(v, dict):
        if v and all(k.startswith("\x00") for k in v):
            return [_unkeyed(x) for x in v.values()]
        return {k: _unkeyed(x) for k, x in v.items()}
    return v


def _revert(before: Any, after: Any, current: Any) -> Tuple[Any, int, int]:
    """Three-way revert: each part this action changed goes back to `before`, unless it was changed again since.
    Returns (new value, parts reverted, parts kept because they changed since)."""
    if before == after:
        return current, 0, 0
    if isinstance(before, dict) and isinstance(after, dict) and isinstance(current, dict):
        out = dict(current)
        done = kept = 0
        for k in set(before) | set(after):
            b, a = before.get(k, _MISSING), after.get(k, _MISSING)
            if b == a:
                continue
            c = current.get(k, _MISSING)
            if isinstance(b, dict) and isinstance(a, dict) and isinstance(c, dict):
                out[k], d, kp = _revert(b, a, c)
                done, kept = done + d, kept + kp
            elif c == a:
                if b is _MISSING:
                    out.pop(k, None)
                else:
                    out[k] = b
                done += 1
            else:
                kept += 1
        return out, done, kept
    if current == after:
        return before, 1, 0
    return current, 0, 1


def undo(db: Session, undo_id: str, user_id: Optional[int]) -> Dict[str, int]:
    from app.models.studio import SiteSetting
    from app.routers.studio import get_setting, put_setting

    store = get_setting(db, UNDO_KEY)
    entries = store.get("entries") or []
    entry = next((e for e in entries if e.get("id") == undo_id), None)
    if not entry:
        raise LookupError(undo_id)
    befores = entry.get("values") or {}
    afters = entry.get("after")
    currents = _read(db, list(befores.keys()))
    reverted = kept = 0
    for k, b in befores.items():
        if afters is None:  # result never recorded: whole value back (older entries)
            new = b
        else:
            new, d, kp = _revert(_keyed(b if b is not None else {}), _keyed(afters.get(k) or {}), _keyed(currents.get(k) or {}))
            new = _unkeyed(new)
            reverted, kept = reverted + d, kept + kp
            if new == (currents.get(k) or {}):
                continue
        if new is None or (b is None and new == {}):
            row = db.query(SiteSetting).filter(SiteSetting.key == k).first()
            if row:
                db.delete(row)
                db.commit()
        else:
            put_setting(db, k, new, user_id)
    put_setting(db, UNDO_KEY, {"entries": [e for e in entries if e.get("id") != undo_id]}, user_id)
    return {"reverted": reverted, "kept": kept}
