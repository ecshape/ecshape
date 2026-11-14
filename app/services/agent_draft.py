"""
Agent EC inline drafts: the small Agent EC button in the corner of a studio text box writes a draft for that box,
with the context of the record it belongs to (prospect, QA ticket, SEO fields, site text).

Model choice per task:
  - "fast" tasks (short replies, notes, comments, meta fields, one site text) use a fast / cheap model,
    taken from the trainer's keys when one of them offers it;
  - "strong" tasks (long texts: ticket write-ups, article intros) use the strongest model of the preferred key.
If the tier model is refused (not available on that key), the key's own model is used instead.
"""
from __future__ import annotations

import dataclasses
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.studio import Lead, QaComment, QaTicket, TrainerAiKey
from app.models.user import User
from app.schemas.auth import UserResponse
from app.services.agent_ec import AgentUnavailable, _post_json
from app.services.ai_keys import Engine, resolve_engine

logger = logging.getLogger(__name__)

LANG_NAMES = {"he": "Hebrew", "en": "English", "fr": "French"}

# Fast / cheap and strongest model of each catalogue provider (custom & OpenRouter keep the key's own model).
FAST_MODELS = {
    "anthropic": "claude-haiku-5-5",
    "openai": "gpt-4.1-mini",
    "google": "gemini-2.5-flash",
    "mistral": "mistral-small-latest",
    "xai": "grok-3-mini",
    "deepseek": "deepseek-chat",
    "groq": "llama-3.3-70b-versatile",
}
STRONG_MODELS = {
    "anthropic": "claude-opus-5-5",
    "openai": "gpt-4.1",
    "google": "gemini-2.5-pro",
    "mistral": "mistral-large-latest",
    "xai": "grok-3",
    "deepseek": "deepseek-chat",
    "groq": "llama-3.3-70b-versatile",
}
# Providers that are fast by nature: preferred for "fast" tasks when the trainer has one of them.
FAST_FIRST = ("groq", "google", "openai", "anthropic", "mistral", "xai", "deepseek")

# (kind, field) -> (tier, instruction, max_tokens)
TASKS: Dict[Tuple[str, str], Tuple[str, str, int]] = {
    ("lead", "reply"): ("fast", "Write the first personal reply message the trainer will send to this prospect on WhatsApp or by email. "
                                "Warm, short (2 to 5 sentences), refers to their goal and message, proposes a concrete next step (a short call). "
                                "Sign with the trainer's first name.", 400),
    ("lead", "notes"): ("fast", "Write the trainer's internal notes about this prospect: a one-line summary, what they want, "
                                "open questions, and the next action with a suggested date. Short lines, no greeting.", 400),
    ("qa", "body"): ("strong", "Rewrite this QA ticket as a clear request for the developer: what is wrong, where (page / element), "
                               "what is expected instead, and how to check it is fixed. Plain short lines.", 900),
    ("qa", "comment"): ("fast", "Write a short comment for this QA ticket (status update or a precise question to unblock it).", 300),
    ("seo", "title"): ("fast", "Write an SEO title: at most 60 characters, includes the focus keyword near the start, no quotes.", 120),
    ("seo", "description"): ("fast", "Write a meta description: 140 to 155 characters, includes the focus keyword, ends with a soft call to action.", 220),
    ("seo", "excerpt"): ("fast", "Write the article excerpt shown in the blog list: 1 to 2 sentences, at most 220 characters.", 220),
    ("seo", "intro"): ("strong", "Write the opening paragraph of this article (60 to 110 words): a hook, the promise, the focus keyword once.", 500),
    ("site", "text"): ("fast", "Rewrite this text of the public site. Keep about the same length and the same role (title, button, paragraph); "
                               "the tone of a premium personal-training brand: direct, confident, warm.", 400),
}
DEFAULT_TASK = ("fast", "Write a concise, useful text for this field.", 400)


def _clip(v: Any, n: int) -> str:
    s = "" if v is None else str(v)
    return s if len(s) <= n else s[: n - 1] + "…"


# ------------------------------------------------------------------ context
def _lead_context(db: Session, lead_id: Any) -> Tuple[str, Optional[str]]:
    try:
        lead = db.query(Lead).get(int(lead_id))
    except (TypeError, ValueError):
        lead = None
    if not lead:
        raise AgentUnavailable("Prospect not found.")
    lines = [
        f"Prospect: {lead.name}",
        f"Received: {lead.created_at.date().isoformat() if lead.created_at else '?'} from the site form ({lead.source or 'site'})",
        f"Status in the pipeline: {lead.status}",
        f"Goal: {lead.goal or '-'}; program they picked: {lead.program or '-'}",
        f"Language they used: {lead.lang or '-'}",
        f"Contact: {'phone' if lead.phone else ''} {'email' if lead.email else ''}".strip(),
    ]
    if lead.message:
        lines.append(f"Their message:\n{_clip(lead.message, 1500)}")
    if lead.notes:
        lines.append(f"Trainer's notes so far:\n{_clip(lead.notes, 1500)}")
    return "\n".join(lines), lead.lang


def _qa_context(db: Session, ticket_id: Any) -> str:
    try:
        t = db.query(QaTicket).get(int(ticket_id))
    except (TypeError, ValueError):
        t = None
    if not t:
        return ""
    lines = [f"Ticket #{t.id}: {t.title}", f"Status: {t.status}; priority: {t.priority}", f"Page: {t.page or '-'}"]
    if t.body:
        lines.append(f"Current text:\n{_clip(t.body, 3000)}")
    comments = db.query(QaComment).filter(QaComment.ticket_id == t.id).order_by(QaComment.created_at).all()[-8:]
    if comments:
        names = {u.id: u.full_name for u in db.query(User).filter(User.id.in_({c.author_id for c in comments if c.author_id})).all()}
        lines.append("Comments:\n" + "\n".join(f"- {names.get(c.author_id, '?')}: {_clip(c.body, 400)}" for c in comments))
    return "\n".join(lines)


def _extra_context(extra: Dict[str, Any]) -> str:
    lines = []
    for k, v in (extra or {}).items():
        if v in (None, "", [], {}):
            continue
        lines.append(f"{k}: {_clip(v, 2500)}")
    return "\n".join(lines[:20])


# ------------------------------------------------------------------ engine per task
def pick_engine(db: Session, user_id: int, tier: str) -> Tuple[Optional[Engine], Optional[str]]:
    """Returns (engine with the tier model, the key's own model as a fallback)."""
    keys: List[TrainerAiKey] = (
        db.query(TrainerAiKey).filter(TrainerAiKey.user_id == user_id)
        .order_by(TrainerAiKey.is_preferred.desc(), TrainerAiKey.created_at.desc()).all()
    )
    chosen: Optional[TrainerAiKey] = keys[0] if keys else None
    if tier == "fast" and len(keys) > 1:
        for pid in FAST_FIRST:
            hit = next((k for k in keys if k.provider == pid), None)
            if hit:
                chosen = hit
                break
    engine = resolve_engine(db, user_id, str(chosen.id) if chosen else None)
    if not engine:
        return None, None
    own = engine.model
    table = FAST_MODELS if tier == "fast" else STRONG_MODELS
    tier_model = table.get(engine.provider)
    if tier_model and tier_model != own:
        return dataclasses.replace(engine, model=tier_model), own
    return engine, None


def _complete(engine: Engine, system: str, prompt: str, max_tokens: int) -> str:
    if engine.provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=engine.api_key)
        try:
            res = client.messages.create(model=engine.model, max_tokens=max_tokens, system=system,
                                         messages=[{"role": "user", "content": prompt}])
        except anthropic.AuthenticationError:
            raise AgentUnavailable("The Claude key was refused.", {"label": "settings", "href": "/studio/settings#ai-keys"})
        except anthropic.NotFoundError:
            raise LookupError("model")
        except anthropic.RateLimitError:
            raise AgentUnavailable("The AI service is busy (rate limit). Try again in a minute.")
        except anthropic.APIStatusError as e:
            if e.status_code in (400, 404):
                raise LookupError("model")
            raise AgentUnavailable(f"The AI service answered with an error ({e.status_code}).")
        except anthropic.APIConnectionError:
            raise AgentUnavailable("The AI service could not be reached.")
        return "".join(b.text for b in res.content if getattr(b, "type", "") == "text").strip()
    if not engine.base_url:
        raise AgentUnavailable("This AI key has no API address.", {"label": "settings", "href": "/studio/settings#ai-keys"})
    try:
        data = _post_json(engine.base_url.rstrip("/") + "/chat/completions", engine.api_key, {
            "model": engine.model, "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        })
    except AgentUnavailable as e:
        # 400 / 404 from the provider usually means this key cannot use that model: let the caller retry.
        if "error (400)" in str(e) or "error (404)" in str(e):
            raise LookupError("model")
        raise
    msg = ((data.get("choices") or [{}])[0].get("message") or {})
    return (msg.get("content") or "").strip()


def _clean(text: str) -> str:
    t = (text or "").strip()
    t = re.sub(r"^```[a-z]*\n|\n```$", "", t).strip()
    if len(t) >= 2 and t[0] in "\"'“«" and t[-1] in "\"'”»":
        t = t[1:-1].strip()
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
    return t


# ------------------------------------------------------------------ entry point
def draft_text(db: Session, user: UserResponse, kind: str, field: str, lang: str = "he", context_id: Any = None,
               current: Optional[str] = None, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    tier, instruction, max_tokens = TASKS.get((kind, field), DEFAULT_TASK)
    engine, fallback_model = pick_engine(db, user.id, tier)
    if not engine:
        raise AgentUnavailable("No AI key yet. Add one in Settings → AI keys.", {"label": "settings", "href": "/studio/settings#ai-keys"})

    out_lang = lang if lang in LANG_NAMES else "he"
    parts: List[str] = []
    if kind == "lead":
        ctx, lead_lang = _lead_context(db, context_id)
        parts.append(ctx)
        # A reply goes to the prospect: write it in the language they used on the site.
        if field == "reply" and lead_lang in LANG_NAMES:
            out_lang = lead_lang
    elif kind == "qa":
        ctx = _qa_context(db, context_id)
        if ctx:
            parts.append(ctx)
    extra_ctx = _extra_context(extra or {})
    if extra_ctx:
        parts.append(extra_ctx)
    if current and current.strip():
        parts.append(f"What is already in the box (improve it, keep the facts):\n{_clip(current, 3000)}")

    system = (
        "You are Agent EC, the writing assistant of the ECshape coaching studio of personal trainer "
        f"{user.full_name or 'the trainer'}. You write one text for one field of the studio. "
        f"Write in {LANG_NAMES[out_lang]}. Output only the text itself: no preamble, no quotes, no markdown, no emojis."
    )
    prompt = f"Task: {instruction}\nToday: {datetime.now().date().isoformat()}\n\nContext:\n" + ("\n\n".join(parts) or "(none)")

    try:
        text = _complete(engine, system, prompt, max_tokens)
    except LookupError:
        if not fallback_model:
            raise AgentUnavailable("The AI service refused this request.")
        engine = dataclasses.replace(engine, model=fallback_model)
        try:
            text = _complete(engine, system, prompt, max_tokens)
        except LookupError:
            raise AgentUnavailable("The AI service refused this request.")
    text = _clean(text)
    if not text:
        raise AgentUnavailable("The AI returned an empty text. Try again.")
    return {"text": text, "engine": engine.label, "model": engine.model, "tier": tier, "lang": out_lang}
