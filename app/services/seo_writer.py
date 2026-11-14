"""
COM / SEO: blog articles (stored as one site setting) and the live AI writer.

The writer streams NDJSON events to the editor while the model writes, so the trainer watches the
article appear block by block (same flow as LaveriExpert's "Rédiger avec l'IA"):
  status → meta → block… → faq → end
"""
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional

import httpx
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

ARTICLES_KEY = "articles"
STATUSES = ("draft", "published", "scheduled")
SCHEMA_TYPES = ("BlogPosting", "Article", "NewsArticle", "none")
LANG_NAMES = {"he": "Hebrew", "en": "English", "fr": "French"}
LENGTH_WORDS = {"short": 800, "standard": 1300, "long": 1800}
OPENAI_COMPAT_BASE = {
    "openai": "https://api.openai.com/v1",
    "google": "https://generativelanguage.googleapis.com/v1beta/openai",
}

_DANGEROUS = re.compile(r"<\s*(script|style|iframe|object|embed|noscript|template|svg|math|form|textarea|select|button)\b[\s\S]*?<\s*/\s*\1\s*>", re.I)
_DANGEROUS_OPEN = re.compile(r"<\s*/?\s*(script|style|iframe|object|embed|noscript|template|svg|math|form|textarea|select|button|link|meta|base)\b[^>]*>?", re.I)
_ON_ATTR = re.compile(r"[\s/]+on[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
_JS_URL = re.compile(r"(href|src)\s*=\s*([\"'])\s*(javascript|data|vbscript):[^\"']*\2", re.I)


def sanitize_html(html: str) -> str:
    """Server-side safety net; the site renders through an allow-list sanitizer as well."""
    out = _DANGEROUS.sub("", str(html or "")[:400_000])
    out = _DANGEROUS_OPEN.sub("", out)  # unclosed or stray dangerous tags
    out = re.sub(r"<!--[\s\S]*?-->", "", out)
    out = _ON_ATTR.sub("", out)
    return _JS_URL.sub(r'\1="#"', out)


def slugify(text: str) -> str:
    s = re.sub(r"[\"'’`]", "", str(text or "").strip().lower())
    s = re.sub(r"[^\w\u0590-\u05FF]+", "-", s, flags=re.UNICODE)
    return s.strip("-_")[:90]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------------ storage
def _clip(v: Any, n: int) -> str:
    return str(v or "").strip()[:n]


def normalize_seo(raw: Any) -> Dict[str, Any]:
    o = raw if isinstance(raw, dict) else {}
    faq = []
    for f in o.get("faq") or []:
        if isinstance(f, dict) and f.get("q") and f.get("a"):
            faq.append({"q": _clip(f["q"], 300), "a": _clip(f["a"], 2000)})
    schema = o.get("schemaType") if o.get("schemaType") in SCHEMA_TYPES else "BlogPosting"
    return {
        "focusKeyword": _clip(o.get("focusKeyword"), 100),
        "secondaryKeywords": [_clip(k, 80) for k in (o.get("secondaryKeywords") or []) if str(k).strip()][:4],
        "title": _clip(o.get("title"), 120),
        "description": _clip(o.get("description"), 320),
        "robots": "noindex" if o.get("robots") == "noindex" else "index",
        "nofollow": o.get("nofollow") is True,
        "noarchive": o.get("noarchive") is True,
        "noimageindex": o.get("noimageindex") is True,
        "nosnippet": o.get("nosnippet") is True,
        "canonical": _clip(o.get("canonical"), 300),
        "pillar": o.get("pillar") is True,
        "schemaType": schema,
        "faq": faq[:20],
        "ogTitle": _clip(o.get("ogTitle"), 120),
        "ogDescription": _clip(o.get("ogDescription"), 320),
        "ogImage": _clip(o.get("ogImage"), 500),
    }


def list_articles(db: Session) -> List[Dict[str, Any]]:
    from app.routers.studio import get_setting
    items = get_setting(db, ARTICLES_KEY).get("items") or []
    return sorted(items, key=lambda a: a.get("updatedAt") or "", reverse=True)


def _store(db: Session, items: List[Dict[str, Any]], user_id: Optional[int]) -> None:
    from app.routers.studio import put_setting
    put_setting(db, ARTICLES_KEY, {"items": items}, user_id)


def save_article(db: Session, raw: Dict[str, Any], user_id: Optional[int], author: str) -> Dict[str, Any]:
    items = list_articles(db)
    art_id = raw.get("id")
    existing = next((a for a in items if a.get("id") == art_id), None) if art_id else None
    title = _clip(raw.get("title"), 200)
    if not title:
        raise ValueError("A title is required.")
    lang = raw.get("lang") if raw.get("lang") in LANG_NAMES else "he"
    slug = slugify(raw.get("slug") or title) or uuid.uuid4().hex[:8]
    base, n = slug, 2
    while any(a.get("slug") == slug and a.get("lang") == lang and a.get("id") != art_id for a in items):
        slug = f"{base}-{n}"
        n += 1
    status = raw.get("status") if raw.get("status") in STATUSES else "draft"
    published_at = raw.get("publishedAt") or None
    if status == "published" and not published_at:
        published_at = (existing or {}).get("publishedAt") or _now()
    article = {
        "id": art_id if existing else uuid.uuid4().hex,
        "lang": lang,
        "slug": slug,
        "title": title,
        "excerpt": _clip(raw.get("excerpt"), 600),
        "contentHtml": sanitize_html(raw.get("contentHtml") or ""),
        "coverImage": _clip(raw.get("coverImage"), 500),
        "coverAlt": _clip(raw.get("coverAlt"), 200),
        "category": _clip(raw.get("category"), 80),
        "tags": [_clip(t, 40) for t in (raw.get("tags") or []) if str(t).strip()][:12],
        "status": status,
        "publishedAt": published_at,
        "authorName": (existing or {}).get("authorName") or author,
        "seo": normalize_seo(raw.get("seo")),
        "createdAt": (existing or {}).get("createdAt") or _now(),
        "updatedAt": _now(),
    }
    items = [a for a in items if a.get("id") != article["id"]] + [article]
    _store(db, items, user_id)
    return article


def delete_article(db: Session, art_id: str, user_id: Optional[int]) -> None:
    items = list_articles(db)
    if not any(a.get("id") == art_id for a in items):
        raise LookupError(art_id)
    _store(db, [a for a in items if a.get("id") != art_id], user_id)


def is_live(a: Dict[str, Any]) -> bool:
    if a.get("status") == "published":
        return True
    if a.get("status") == "scheduled" and a.get("publishedAt"):
        try:
            when = datetime.fromisoformat(str(a["publishedAt"]).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return False
        if when.tzinfo is None:  # a date saved without a timezone is read as UTC (never a 500 on the public blog)
            when = when.replace(tzinfo=timezone.utc)
        return when <= datetime.now(timezone.utc)
    return False


def live_articles(db: Session, lang: Optional[str] = None) -> List[Dict[str, Any]]:
    items = [a for a in list_articles(db) if is_live(a) and (not lang or a.get("lang") == lang)]
    return sorted(items, key=lambda a: a.get("publishedAt") or "", reverse=True)


# ------------------------------------------------------------------ live writer
WRITER_SYSTEM = """You write SEO blog articles for ECshape, the coaching brand of personal trainer Elior Cremisi \
(online and in-person fitness coaching, nutrition, habits). Voice: direct, warm, motivating, concrete. \
Never make medical claims or promise specific results; recommend seeing a doctor when health is involved.

Output format — STRICT: one JSON object per line (NDJSON), nothing else, no markdown fences.
Line 1: {"type":"meta","title":…,"slug":…,"excerpt":…,"category":…,"tags":[…],"focusKeyword":…,"secondaryKeywords":[…],"seoTitle":…,"seoDescription":…,"coverAlt":…}
Then one line per block, in reading order: {"type":"block","kind":K,"html":H}
  K is one of: intro, h2, h3, p, list, callout, table, quote, cta.
  H is clean HTML for that block only: <p>, <h2>, <h3>, <ul>/<ol>/<li>, <strong>, <em>, <a href>, <blockquote>,
  <table>, <div class="callout">. No inline styles, no scripts, no images.
Last line: {"type":"faq","items":[{"q":…,"a":…}, …]} with 4 to 6 questions.

SEO rules (Rank Math): focus keyword in the SEO title (first half), in the meta description, in the slug, in the
first 10% of the text, in at least one H2, density about 1–1.5%. SEO title 50–60 characters with a number and a
power word; meta description 140–160 characters. At least 3 H2. Short paragraphs (under 120 words), short
sentences (under 20 words on average). Add 2 internal links (to "/home" or "/home#programs" or "/blog") and
1 external link to a reputable source (WHO, a university, a peer-reviewed review). The slug uses Latin letters
for English/French and may use Hebrew letters for Hebrew."""


def _brief_prompt(brief: Dict[str, Any], lang: str) -> str:
    words = LENGTH_WORDS.get(brief.get("length") or "standard", 1300)
    parts = [
        f"Language of the article: {LANG_NAMES.get(lang, 'Hebrew')}.",
        f"Topic: {str(brief.get('topic') or '')[:300]}",
        f"Target length: about {words} words.",
    ]
    if brief.get("keyword"):
        parts.append(f"Focus keyword (use it exactly): {str(brief['keyword'])[:100]}")
    if brief.get("notes"):
        parts.append(f"Trainer's notes: {str(brief['notes'])[:1500]}")
    return "\n".join(parts)


def _line(obj: Dict[str, Any]) -> str:
    return json.dumps(obj, ensure_ascii=False) + "\n"


def _parse_line(raw: str) -> Optional[Dict[str, Any]]:
    raw = raw.strip().strip(",")
    if not raw.startswith("{"):
        return None
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict) or obj.get("type") not in ("meta", "block", "faq"):
        return None
    if obj["type"] == "block":
        obj["html"] = sanitize_html(obj.get("html") or "")
        obj["kind"] = str(obj.get("kind") or "p")[:20]
    if obj["type"] == "meta":
        obj["slug"] = slugify(obj.get("slug") or obj.get("title") or "")
        for k in ("tags", "secondaryKeywords"):
            obj[k] = [str(x)[:80] for x in (obj.get(k) or [])][:6]
    if obj["type"] == "faq":
        obj["items"] = [{"q": str(f.get("q", ""))[:300], "a": str(f.get("a", ""))[:2000]} for f in (obj.get("items") or []) if isinstance(f, dict)][:8]
    return obj


def _anthropic_chunks(resolved, prompt: str) -> Iterator[str]:
    import anthropic
    client = anthropic.Anthropic(api_key=resolved.api_key)
    with client.messages.stream(
        model=resolved.model, max_tokens=16000, system=WRITER_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        for text in stream.text_stream:
            yield text


def _openai_chunks(resolved, prompt: str) -> Iterator[str]:
    base = (resolved.base_url or OPENAI_COMPAT_BASE.get(resolved.provider) or "").rstrip("/")
    if not base:
        raise RuntimeError(f"no endpoint for provider {resolved.provider}")
    headers = {"Authorization": f"Bearer {resolved.api_key}", "Content-Type": "application/json"}
    body = {"model": resolved.model, "stream": True, "messages": [{"role": "system", "content": WRITER_SYSTEM}, {"role": "user", "content": prompt}]}
    with httpx.Client(timeout=300) as http, http.stream("POST", f"{base}/chat/completions", headers=headers, json=body) as r:
        if r.status_code >= 400:
            r.read()
            raise RuntimeError(f"{resolved.provider} error {r.status_code}")
        for line in r.iter_lines():
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                delta = (json.loads(data).get("choices") or [{}])[0].get("delta") or {}
            except json.JSONDecodeError:
                continue
            if delta.get("content"):
                yield delta["content"]


def generate_article(db: Session, user_id: int, brief: Dict[str, Any], lang: str, statuses: Dict[str, str]) -> Iterator[str]:
    """Yields NDJSON lines. `statuses` holds the translated step labels sent by the editor."""
    from app.services.ai_keys import resolve_engine

    # brief["model"] is an AI key id from the trainer's settings, or "auto" (preferred key, else server key)
    resolved = resolve_engine(db, user_id, brief.get("model") or "auto")
    if not resolved:
        yield _line({"type": "error", "error": "NO_KEY"})
        return
    yield _line({"type": "status", "step": "brief", "text": statuses.get("brief", "")})
    chunks = _anthropic_chunks if resolved.provider == "anthropic" else _openai_chunks
    buffer, started, blocks = "", False, 0
    try:
        for piece in chunks(resolved, _brief_prompt(brief, lang)):
            buffer += piece
            while "\n" in buffer:
                raw, buffer = buffer.split("\n", 1)
                obj = _parse_line(raw)
                if not obj:
                    continue
                if obj["type"] == "meta" and not started:
                    started = True
                    yield _line(obj)
                    yield _line({"type": "status", "step": "writing", "text": statuses.get("writing", "")})
                elif obj["type"] == "block":
                    blocks += 1
                    yield _line(obj)
                elif obj["type"] == "faq":
                    yield _line({"type": "status", "step": "finishing", "text": statuses.get("finishing", "")})
                    yield _line(obj)
        tail = _parse_line(buffer)
        if tail:
            yield _line(tail)
    except Exception as e:  # provider errors surface in the editor, never as a 500 mid-stream
        logger.error("SEO writer failed (%s): %s", resolved.provider, e)
        yield _line({"type": "error", "error": "WRITER_FAILED"})
        return
    if not blocks:
        yield _line({"type": "error", "error": "WRITER_EMPTY"})
        return
    yield _line({"type": "end", "engine": resolved.label})
