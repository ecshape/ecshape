"""
Trainer studio API + public site endpoints.

Public (no auth):
  POST /api/public/leads            in-site contact/consultation forms
  GET  /api/public/site?lang=he     editable site content overrides + SEO for that language
  GET  /api/public/articles?lang=he live blog articles; /api/public/articles/{slug} one article
  GET  /api/public/redirects        SEO redirects (applied by the site router)

Trainer / admin only (/api/studio):
  overview, prospects (leads), site content per language, SEO, Atelier QA, Agent EC chat
"""
import json
import re
import copy
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.auth.utils import create_access_token, get_current_user
from app.database import get_db
from app.models.studio import Lead, QaComment, QaTicket, SiteSetting
from app.models.automation import CoachTask
from app.models.user import User
from app.schemas.auth import UserResponse, UserRole

public_router = APIRouter()
router = APIRouter()

LANGS = ("he", "en", "fr", "ru", "ar")  # ru / ar: QA #85
SITE_CONTENT_MAX = 3_000_000  # bytes of JSON per language (a few inline photos)
LEAD_STATUSES = ("new", "contacted", "qualified", "converted", "lost")
QA_STATUSES = ("new", "in_progress", "done", "cancelled")
QA_PRIORITIES = ("low", "normal", "high")


def require_studio(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    if current_user.role not in (UserRole.TRAINER, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Trainer access only")
    # The studio is the business's public site + its leads (names, phones). When STUDIO_OWNER_IDS is set
    # (comma-separated user ids), only admins and those trainers may use it; other trainers coach clients only
    # (audit 2026-11, F-14). Unset = every trainer, as before.
    import os as _os
    owners = {x.strip() for x in (_os.getenv("STUDIO_OWNER_IDS") or "").split(",") if x.strip()}
    if owners and current_user.role != UserRole.ADMIN and str(current_user.id) not in owners:
        raise HTTPException(status_code=403, detail="Studio access only")
    return current_user


# ---------------------------------------------------------------- helpers
def get_setting(db: Session, key: str) -> Dict[str, Any]:
    row = db.query(SiteSetting).filter(SiteSetting.key == key).first()
    return copy.deepcopy(row.value or {}) if row else {}


def put_setting(db: Session, key: str, value: Dict[str, Any], user_id: Optional[int]) -> Dict[str, Any]:
    row = db.query(SiteSetting).filter(SiteSetting.key == key).first()
    if row:
        row.value = value
        row.updated_by = user_id
        flag_modified(row, "value")
    else:
        row = SiteSetting(key=key, value=value, updated_by=user_id)
        db.add(row)
    db.commit()
    return value


def lead_dict(l: Lead) -> Dict[str, Any]:
    return {
        "id": l.id, "name": l.name, "phone": l.phone, "email": l.email, "goal": l.goal,
        "program": l.program, "message": l.message, "lang": l.lang, "source": l.source,
        "status": l.status, "notes": l.notes,
        "created_at": l.created_at.isoformat() if l.created_at else None,
        "updated_at": l.updated_at.isoformat() if l.updated_at else None,
    }


def ticket_dict(t: QaTicket, db: Session, with_comments: bool = False) -> Dict[str, Any]:
    d = {
        "id": t.id, "title": t.title, "body": t.body, "page": t.page, "priority": t.priority,
        "status": t.status, "created_by": t.created_by,
        "author": None,
        "author_avatar": None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }
    if t.created_by:
        row = db.query(User.full_name, User.avatar_url).filter(User.id == t.created_by).first()
        if row:
            d["author"], d["author_avatar"] = row[0], row[1]
    comments = db.query(QaComment).filter(QaComment.ticket_id == t.id).order_by(QaComment.created_at).all()
    d["comment_count"] = len(comments)
    if with_comments:
        people = {u.id: u for u in db.query(User).filter(User.id.in_({c.author_id for c in comments if c.author_id})).all()} if comments else {}
        d["comments"] = [
            {"id": c.id, "body": c.body,
             "author": people[c.author_id].full_name if c.author_id in people else None,
             "author_avatar": people[c.author_id].avatar_url if c.author_id in people else None,
             "created_at": c.created_at.isoformat() if c.created_at else None}
            for c in comments
        ]
    return d


# ---------------------------------------------------------------- simple rate limit for public form
_hits: Dict[str, deque] = defaultdict(deque)


def _rate_limited(key: str, limit: int = 5, window: int = 600) -> bool:
    now = time.time()
    q = _hits[key]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        return True
    q.append(now)
    return False


# ================================================================= PUBLIC
class LeadIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    phone: Optional[str] = Field(None, max_length=40)
    email: Optional[str] = Field(None, max_length=160)
    goal: Optional[str] = Field(None, max_length=80)
    program: Optional[str] = Field(None, max_length=80)
    message: Optional[str] = Field(None, max_length=2000)
    lang: Optional[str] = Field(None, max_length=5)
    source: Optional[str] = Field(None, max_length=80)
    website: Optional[str] = None  # honeypot: real visitors never fill it

    @field_validator("email")
    @classmethod
    def _email_format(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        if not v:
            return None
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]{2,}", v):
            raise ValueError("invalid email")
        return v


@public_router.post("/leads", status_code=201)
def create_public_lead(payload: LeadIn, request: Request, db: Session = Depends(get_db)):
    if payload.website:
        return {"ok": True}  # silently drop bots
    if not (payload.phone or payload.email):
        raise HTTPException(status_code=422, detail="phone_or_email_required")
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "?")
    if _rate_limited(f"lead:{ip}"):
        raise HTTPException(status_code=429, detail="too_many_requests")
    lead = Lead(**payload.model_dump(exclude={"website"}), status="new")
    db.add(lead)
    db.commit()
    return {"ok": True, "id": lead.id}


@public_router.get("/site")
def public_site(lang: str = "he", db: Session = Depends(get_db)):
    lang = lang if lang in LANGS else "he"
    seo = get_setting(db, "seo")
    return {
        "lang": lang,
        "content": get_setting(db, f"content:{lang}"),
        "brand": get_setting(db, "brand"),
        "seo": (seo.get("pages") or {}).get(lang, {}),
        "social": seo.get("social", {}),
        "analytics_id": seo.get("analytics_id"),
        "search_console": seo.get("search_console"),  # Google verification code, rendered as a meta tag (QA #78)
    }


@public_router.get("/articles")
def public_articles(lang: Optional[str] = None, db: Session = Depends(get_db)):
    from app.services.seo_writer import live_articles
    return [
        {k: a.get(k) for k in ("id", "lang", "slug", "title", "excerpt", "coverImage", "coverAlt", "category", "publishedAt", "authorName")}
        for a in live_articles(db, lang if lang in LANGS else None)
    ]


@public_router.get("/articles/{slug}")
def public_article(slug: str, lang: Optional[str] = None, db: Session = Depends(get_db)):
    from app.services.seo_writer import live_articles
    items = live_articles(db)
    match = next((a for a in items if a.get("slug") == slug and (not lang or a.get("lang") == lang)), None)
    match = match or next((a for a in items if a.get("slug") == slug), None)
    if not match:
        raise HTTPException(status_code=404, detail="Article not found")
    return match


@public_router.get("/pages/{slug}")
def public_site_page(slug: str, lang: Optional[str] = None, db: Session = Depends(get_db)):
    """A page of the site created in Studio (often by Agent EC), served at /p/<slug>."""
    from app.services.agent_site import public_page
    page = public_page(db, slug, lang)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@public_router.get("/redirects")
def public_redirects(db: Session = Depends(get_db)):
    return get_setting(db, "seo").get("redirects") or []


# ================================================================= STUDIO
@router.get("/overview")
def studio_overview(user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    clients = db.query(User).filter(User.role == UserRole.CLIENT)
    if user.role == UserRole.TRAINER:
        clients = clients.filter(User.trainer_id == user.id)
    return {
        "clients": clients.count(),
        "leads_new": db.query(Lead).filter(Lead.status == "new").count(),
        "leads_open": db.query(Lead).filter(Lead.status.in_(("new", "contacted", "qualified"))).count(),
        "qa_open": db.query(QaTicket).filter(QaTicket.status.in_(("new", "in_progress"))).count(),
        "tasks_open": db.query(CoachTask).filter(CoachTask.trainer_id == user.id, CoachTask.status == "open").count(),
    }


# ---- Prospects
class LeadUpdate(BaseModel):
    status: Optional[Literal["new", "contacted", "qualified", "converted", "lost"]] = None
    notes: Optional[str] = Field(None, max_length=4000)
    name: Optional[str] = Field(None, max_length=120)
    phone: Optional[str] = Field(None, max_length=40)
    email: Optional[str] = Field(None, max_length=160)
    goal: Optional[str] = Field(None, max_length=80)
    program: Optional[str] = Field(None, max_length=80)


@router.get("/leads")
def list_leads(status: Optional[str] = None, q: Optional[str] = None,
               user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    query = db.query(Lead)
    if status:
        query = query.filter(Lead.status == status)
    if q:
        like = f"%{q}%"
        query = query.filter((Lead.name.ilike(like)) | (Lead.phone.ilike(like)) | (Lead.email.ilike(like)))
    return [lead_dict(l) for l in query.order_by(Lead.created_at.desc()).limit(500).all()]


@router.post("/leads", status_code=201)
def create_lead(payload: LeadIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    lead = Lead(**payload.model_dump(exclude={"website"}), status="new", source=payload.source or "studio")
    db.add(lead)
    db.commit()
    return lead_dict(lead)


@router.patch("/leads/{lead_id}")
def update_lead(lead_id: int, payload: LeadUpdate, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    lead = db.query(Lead).get(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(lead, k, v)
    db.commit()
    return lead_dict(lead)


@router.delete("/leads/{lead_id}", status_code=204)
def delete_lead(lead_id: int, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    lead = db.query(Lead).get(lead_id)
    if lead:
        db.delete(lead)
        db.commit()


# ---- Site content (Mon site) & SEO
@router.get("/site/{lang}")
def get_site_content(lang: str, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    if lang not in LANGS:
        raise HTTPException(status_code=404, detail="Unknown language")
    return {"content": get_setting(db, f"content:{lang}"), "brand": get_setting(db, "brand")}


class SiteContentIn(BaseModel):
    content: Dict[str, Any] = Field(default_factory=dict)
    brand: Optional[Dict[str, Any]] = None


@router.put("/site/{lang}")
def put_site_content(lang: str, payload: SiteContentIn, sync: bool = True, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    """Save one language of the site. ``sync`` (default): texts changed here are translated into the other languages."""
    if lang not in LANGS:
        raise HTTPException(status_code=404, detail="Unknown language")
    # Photos are stored inline (resized in the browser): cap the size so the public site stays fast.
    import json as _json
    if len(_json.dumps(payload.content, ensure_ascii=False)) > SITE_CONTENT_MAX:
        raise HTTPException(status_code=413, detail="Site content too large: use smaller photos")
    before = get_setting(db, f"content:{lang}") or {}
    put_setting(db, f"content:{lang}", payload.content, user.id)
    if payload.brand is not None:
        put_setting(db, "brand", payload.brand, user.id)
    synced: Dict[str, int] = {}
    sync_ok = True
    if sync:
        synced, sync_ok = _sync_languages(db, user, lang, before, payload.content)
    return {"ok": True, "synced": synced, "sync_ok": sync_ok}


# ------------------------------------------------------------------ QA #48: one edit, every language
_NOT_TEXT = re.compile(r"^(https?:|data:|mailto:|tel:|#[0-9a-fA-F]{3,8}$|/|\d+(\.\d+)?$)")


def _is_text(v: Any) -> bool:
    return isinstance(v, str) and bool(v.strip()) and len(v) <= 4000 and not _NOT_TEXT.match(v.strip()) and bool(re.search(r"[^\W\d_]", v))


def _changed_texts(old: Any, new: Any, path: tuple = ()) -> List[tuple]:
    """(path, new text) for every text leaf that is new or different from the previous save."""
    out: List[tuple] = []
    if isinstance(new, dict):
        for k, v in new.items():
            out += _changed_texts(old.get(k) if isinstance(old, dict) else None, v, path + (k,))
    elif isinstance(new, list):
        for i, v in enumerate(new):
            out += _changed_texts(old[i] if isinstance(old, list) and i < len(old) else None, v, path + (i,))
    elif _is_text(new) and new != old:
        out.append((path, new))
    return out


def _put_at(root: Any, path: tuple, value: Any) -> Any:
    if not path:
        return value
    key = path[0]
    if isinstance(key, int):
        node = root if isinstance(root, list) else []
        while len(node) <= key:
            node.append(None)
        node[key] = _put_at(node[key], path[1:], value)
        return node
    node = root if isinstance(root, dict) else {}
    node[key] = _put_at(node.get(key), path[1:], value)
    return node


def _sync_languages(db: Session, user: UserResponse, lang: str, before: Dict[str, Any], after: Dict[str, Any]):
    """Translate the texts that changed in ``lang`` into the other site languages and save them there."""
    from app.services import translate as tr

    changes = _changed_texts(before, after)
    if not changes:
        return {}, True
    synced: Dict[str, int] = {}
    ok = True
    for other in LANGS:
        if other == lang:
            continue
        content = get_setting(db, f"content:{other}") or {}  # a detached copy
        todo = changes
        if not content:  # language never edited: start from a full translated copy of this one
            content = copy.deepcopy(after)
            todo = _changed_texts({}, after)
        res = tr.translate(db, user.id, [t for _, t in todo], other, src_lang=lang)
        if not res.get("translated"):
            ok = False
            continue
        for (path, _), text in zip(todo, res["texts"]):
            content = _put_at(content, path, text)
        put_setting(db, f"content:{other}", content, user.id)
        synced[other] = len(todo)
    return synced, ok


@router.get("/seo")
def get_seo(user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    return get_setting(db, "seo")


@router.put("/seo")
def put_seo(payload: Dict[str, Any], user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    return put_setting(db, "seo", payload, user.id)


# ---- Atelier QA
class TicketIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    body: Optional[str] = Field(None, max_length=8000)
    page: Optional[str] = Field(None, max_length=200)
    priority: Literal["low", "normal", "high"] = "normal"


class TicketUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    body: Optional[str] = Field(None, max_length=8000)
    page: Optional[str] = Field(None, max_length=200)
    priority: Optional[Literal["low", "normal", "high"]] = None
    status: Optional[Literal["new", "in_progress", "done", "cancelled"]] = None


class CommentIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


# ---- QA agent key: lets a coding agent read / comment / close QA tickets without a browser sign-in.
# Created from Studio -> QA ("Agent access"); only its SHA-256 is stored. Header: X-QA-Agent-Key. QA endpoints only.
import hashlib as _hashlib  # noqa: E402
import secrets as _secrets  # noqa: E402
from fastapi import Header  # noqa: E402

QA_AGENT_SETTING = "qa_agent_key"


def _qa_key_hash(raw: str) -> str:
    return _hashlib.sha256(raw.encode()).hexdigest()


async def require_qa_access(
    x_qa_agent_key: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> UserResponse:
    """Studio sign-in (Bearer) or the QA agent key — the agent acts as the coach who created the key."""
    if x_qa_agent_key:
        row = db.query(SiteSetting).get(QA_AGENT_SETTING)
        val = dict((row.value if row else None) or {})
        if val.get("hash") and _secrets.compare_digest(val["hash"], _qa_key_hash(x_qa_agent_key)) and val.get("created_by"):
            val["last_used_at"] = datetime.utcnow().isoformat()
            row.value = val
            flag_modified(row, "value")
            db.commit()
            owner = await get_current_user(token=create_access_token({"sub": str(val["created_by"])}, timedelta(minutes=1)), db=db)
            return require_studio(owner)
        raise HTTPException(status_code=401, detail="Invalid QA agent key")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return require_studio(await get_current_user(token=authorization.split(" ", 1)[1], db=db))


def _qa_key_status(db: Session) -> Dict[str, Any]:
    val = get_setting(db, QA_AGENT_SETTING)
    return {"exists": bool(val.get("hash")), "last4": val.get("last4"), "created_at": val.get("created_at"),
            "last_used_at": val.get("last_used_at")}


@router.get("/qa/agent-key")
def qa_agent_key_status(user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    return _qa_key_status(db)


@router.post("/qa/agent-key", status_code=201)
def qa_agent_key_create(user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    """New key (replaces the previous one). The full key is returned once and never stored."""
    raw = "ecqa_" + _secrets.token_urlsafe(32)
    row = db.query(SiteSetting).get(QA_AGENT_SETTING)
    val = {"hash": _qa_key_hash(raw), "last4": raw[-4:], "created_at": datetime.utcnow().isoformat(), "created_by": user.id}
    if row:
        row.value = val
        flag_modified(row, "value")
    else:
        db.add(SiteSetting(key=QA_AGENT_SETTING, value=val, updated_by=user.id))
    db.commit()
    return {"key": raw, **_qa_key_status(db)}


@router.delete("/qa/agent-key", status_code=204)
def qa_agent_key_revoke(user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    row = db.query(SiteSetting).get(QA_AGENT_SETTING)
    if row:
        db.delete(row)
        db.commit()


@router.get("/qa")
def list_tickets(status: Optional[str] = None, user: UserResponse = Depends(require_qa_access), db: Session = Depends(get_db)):
    q = db.query(QaTicket)
    if status:
        q = q.filter(QaTicket.status == status)
    return [ticket_dict(t, db) for t in q.order_by(QaTicket.created_at.desc()).limit(500).all()]


@router.post("/qa", status_code=201)
def create_ticket(payload: TicketIn, user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    # Any signed-in user (trainer, admin, trainee) can report from the QA widget; reading/triage stays trainer-only.
    t = QaTicket(**payload.model_dump(), status="new", created_by=user.id)
    db.add(t)
    db.commit()
    return ticket_dict(t, db, with_comments=True)


@router.get("/qa/{ticket_id}")
def get_ticket(ticket_id: int, user: UserResponse = Depends(require_qa_access), db: Session = Depends(get_db)):
    t = db.query(QaTicket).get(ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket_dict(t, db, with_comments=True)


@router.patch("/qa/{ticket_id}")
def update_ticket(ticket_id: int, payload: TicketUpdate, user: UserResponse = Depends(require_qa_access), db: Session = Depends(get_db)):
    t = db.query(QaTicket).get(ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    return ticket_dict(t, db, with_comments=True)


@router.post("/qa/{ticket_id}/comments", status_code=201)
def add_comment(ticket_id: int, payload: CommentIn, user: UserResponse = Depends(require_qa_access), db: Session = Depends(get_db)):
    t = db.query(QaTicket).get(ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    db.add(QaComment(ticket_id=t.id, author_id=user.id, body=payload.body))
    db.commit()
    return ticket_dict(t, db, with_comments=True)


@router.delete("/qa/{ticket_id}", status_code=204)
def delete_ticket(ticket_id: int, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    t = db.query(QaTicket).get(ticket_id)
    if t:
        db.delete(t)
        db.commit()


# ---- Agent EC
from app.database import engine as _db_engine  # noqa: E402
from app.services.ai_keys import ensure_columns as _ensure_ai_key_columns  # noqa: E402

_ensure_ai_key_columns(_db_engine)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=20000)


class PageContext(BaseModel):
    path: Optional[str] = Field(None, max_length=300)
    title: Optional[str] = Field(None, max_length=300)
    snapshot: Optional[str] = Field(None, max_length=12000)
    selection: Optional[str] = Field(None, max_length=4000)


class AgentChatIn(BaseModel):
    messages: List[ChatTurn] = Field(..., min_length=1, max_length=60)
    lang: Optional[str] = "he"
    page: Optional[PageContext] = None
    provider: Optional[str] = "auto"  # "auto" or an AI key id


@router.post("/agent/chat")
def agent_chat(payload: AgentChatIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.agent_ec import AgentUnavailable, run_agent
    try:
        return {"ok": True, **run_agent(db, user, [t.model_dump() for t in payload.messages], lang=payload.lang or "he",
                                         page=payload.page.model_dump() if payload.page else None, provider=payload.provider)}
    except AgentUnavailable as e:
        return {"ok": False, "error": str(e), "fix": e.fix}


class AgentDraftIn(BaseModel):
    kind: Literal["lead", "qa", "seo", "site", "other"]
    field: str = Field(..., min_length=1, max_length=40)
    context_id: Optional[str] = Field(None, max_length=60)
    lang: Optional[str] = "he"
    current: Optional[str] = Field(None, max_length=8000)
    extra: Dict[str, Any] = Field(default_factory=dict)


@router.post("/agent/draft")
def agent_draft(payload: AgentDraftIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    """Inline Agent EC draft for one text box (prospect reply / notes, QA ticket, SEO fields, site texts)."""
    from app.services.agent_draft import draft_text
    from app.services.agent_ec import AgentUnavailable
    # Small flat context only (field values shown next to the box)
    extra = {str(k)[:40]: (v[:3000] if isinstance(v, str) else v)
             for k, v in list(payload.extra.items())[:20] if isinstance(v, (str, int, float, bool))}
    try:
        return {"ok": True, **draft_text(db, user, payload.kind, payload.field, lang=payload.lang or "he",
                                         context_id=payload.context_id, current=payload.current, extra=extra)}
    except AgentUnavailable as e:
        return {"ok": False, "error": str(e), "fix": e.fix}


@router.get("/agent/status")
def agent_status(user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.ai_keys import resolve_engine
    eng = resolve_engine(db, user.id)
    return {"configured": bool(eng), "engine": eng.label if eng else None, "source": eng.source if eng else "none"}


class AgentOpIn(BaseModel):
    op: Dict[str, Any]


def _set_path(obj: Dict[str, Any], path: str, value: Any) -> Dict[str, Any]:
    parts = [p for p in str(path).split(".") if p]
    if not parts:
        raise HTTPException(status_code=422, detail="Empty path")
    node: Any = obj
    for i, p in enumerate(parts[:-1]):
        nxt_is_index = parts[i + 1].isdigit()
        if isinstance(node, list) and p.isdigit():
            idx = int(p)
            while len(node) <= idx:
                node.append({} if not nxt_is_index else [])
            node = node[idx]
        else:
            if not isinstance(node.get(p), (dict, list)):
                node[p] = [] if nxt_is_index else {}
            node = node[p]
    last = parts[-1]
    if isinstance(node, list) and last.isdigit():
        idx = int(last)
        while len(node) <= idx:
            node.append("")
        node[idx] = value
    else:
        node[last] = value
    return obj


@router.post("/agent/execute")
def agent_execute(payload: AgentOpIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    """Run one action the trainer confirmed in the Agent EC panel. Same validation as the studio pages."""
    op = payload.op or {}
    kind = op.get("kind")
    if kind == "lead.update":
        lead = db.query(Lead).get(int(op.get("leadId") or 0))
        if not lead:
            raise HTTPException(status_code=404, detail="Prospect not found")
        if op.get("status") in LEAD_STATUSES:
            lead.status = op["status"]
        if op.get("note"):
            lead.notes = ((lead.notes or "") + f"\n[{datetime.now():%Y-%m-%d} · Agent EC] {str(op['note'])[:2000]}").strip()
        db.commit()
        return {"ok": True, "lead": lead_dict(lead)}
    if kind == "lead.create":
        data = LeadIn(**{k: v for k, v in (op.get("lead") or {}).items() if k in ("name", "phone", "email", "goal", "program") and v})
        notes = (op.get("lead") or {}).get("notes")
        lead = Lead(**data.model_dump(exclude={"website"}), status="new", source="agent-ec", notes=notes)
        db.add(lead)
        db.commit()
        return {"ok": True, "lead": lead_dict(lead)}
    if kind == "qa.create":
        t = op.get("ticket") or {}
        data = TicketIn(title=str(t.get("title") or "")[:200], body=t.get("body"), page=t.get("page"), priority=t.get("priority") if t.get("priority") in QA_PRIORITIES else "normal")
        ticket = QaTicket(**data.model_dump(), status="new", created_by=user.id)
        db.add(ticket)
        db.commit()
        return {"ok": True, "ticket": ticket_dict(ticket, db)}
    if kind == "qa.update":
        ticket = db.query(QaTicket).get(int(op.get("ticketId") or 0))
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")
        if op.get("status") in QA_STATUSES:
            ticket.status = op["status"]
        if op.get("priority") in QA_PRIORITIES:
            ticket.priority = op["priority"]
        db.commit()
        return {"ok": True, "ticket": ticket_dict(ticket, db)}
    if kind == "site.text":
        lang = op.get("lang")
        if lang not in LANGS or not isinstance(op.get("value"), str):
            raise HTTPException(status_code=422, detail="Invalid site text")
        content = _set_path(get_setting(db, f"content:{lang}"), op.get("path", ""), op["value"][:4000])
        put_setting(db, f"content:{lang}", content, user.id)
        return {"ok": True}
    if kind == "seo.page":
        lang = op.get("lang")
        if lang not in LANGS:
            raise HTTPException(status_code=422, detail="Invalid language")
        seo = get_setting(db, "seo")
        pages = seo.setdefault("pages", {})
        page = pages.setdefault(lang, {})
        for k in ("title", "description", "keywords"):
            if op.get(k):
                page[k] = str(op[k])[:400]
        put_setting(db, "seo", seo, user.id)
        return {"ok": True}
    if kind in ("article.save", "page.save", "site.menu", "site.layout", "site.link"):
        return _run_site_op(db, user, op)
    raise HTTPException(status_code=422, detail="Unknown action")


def _run_site_op(db: Session, user: UserResponse, op: Dict[str, Any]) -> Dict[str, Any]:
    """Site actions of Agent EC: new pages and articles, menu, section layout, button links."""
    from app.services import agent_site
    from app.services.seo_writer import save_article
    kind = op.get("kind")
    try:
        if kind == "article.save":
            a = op.get("article") or {}
            article = save_article(db, {
                "id": a.get("id"), "lang": a.get("lang"), "title": a.get("title"), "slug": a.get("slug"),
                "excerpt": a.get("excerpt"), "contentHtml": a.get("contentHtml"), "category": a.get("category"),
                "tags": a.get("tags") or [], "status": a.get("status"),
                "seo": {"focusKeyword": a.get("focusKeyword"), "title": a.get("seoTitle"), "description": a.get("metaDescription"), "faq": a.get("faq") or []},
            }, user.id, user.full_name or "ECshape")
            return {"ok": True, "article": {k: article[k] for k in ("id", "slug", "lang", "status", "title")}}
        if kind == "page.save":
            page = agent_site.save_page(db, op.get("page") or {}, user.id)
            return {"ok": True, "page": {k: page[k] for k in ("id", "slug", "lang", "status", "title")}}
        if kind == "site.menu":
            agent_site.set_menu(db, op.get("lang"), op.get("items") or [], user.id)
            return {"ok": True}
        if kind == "site.layout":
            agent_site.set_layout(db, op.get("order"), op.get("hidden"), user.id)
            return {"ok": True}
        if kind == "site.link":
            agent_site.set_link(db, str(op.get("path") or ""), str(op.get("target") or ""), user.id)
            return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    raise HTTPException(status_code=422, detail="Unknown action")


class AgentSnapshotIn(BaseModel):
    op: Dict[str, Any]
    undo_id: Optional[str] = Field(None, max_length=64)


@router.post("/agent/snapshot")
def agent_snapshot(payload: AgentSnapshotIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    """Before an action: saves what it is about to change. After it (with undo_id): saves the result, so the trainer
    can undo exactly this action if it is not what they wanted, without losing later edits."""
    from app.services.agent_site import snapshot
    return {"undo_id": snapshot(db, payload.op or {}, user.id, payload.undo_id)}


class AgentUndoIn(BaseModel):
    undo_id: str = Field(..., min_length=8, max_length=64)


@router.post("/agent/undo")
def agent_undo(payload: AgentUndoIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.agent_site import undo
    try:
        return {"ok": True, **undo(db, payload.undo_id, user.id)}
    except LookupError:
        raise HTTPException(status_code=404, detail="Nothing to undo")


# ---- Site pages (created in Studio or by Agent EC, served at /p/<slug>)
class SitePageIn(BaseModel):
    page: Dict[str, Any]


@router.get("/pages")
def get_site_pages(user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.agent_site import list_pages
    return list_pages(db)


@router.put("/pages")
def put_site_page(payload: SitePageIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.agent_site import save_page
    try:
        return save_page(db, payload.page, user.id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.delete("/pages/{page_id}", status_code=204)
def remove_site_page(page_id: str, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.agent_site import delete_page
    try:
        delete_page(db, page_id, user.id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Page not found")


@router.get("/agent/recommendations")
def agent_recommendations(user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    """Data-driven nudges shown on the agent's welcome screen (no AI call)."""
    from datetime import timedelta
    from app.models.check_in import DailyCheckIn

    out: List[Dict[str, Any]] = []
    new_leads = db.query(Lead).filter(Lead.status == "new").count()
    if new_leads:
        out.append({"id": "leads", "count": new_leads, "href": "/studio/prospects"})
    q = db.query(User).filter(User.role == UserRole.CLIENT, User.is_active == True)  # noqa: E712
    if user.role == UserRole.TRAINER:
        q = q.filter(User.trainer_id == user.id)
    since = datetime.now() - timedelta(days=3)
    silent = [c for c in q.all() if not db.query(DailyCheckIn).filter(DailyCheckIn.client_id == c.id, DailyCheckIn.date >= since).first()]
    if silent:
        out.append({"id": "silent", "count": len(silent), "names": [c.full_name for c in silent[:3]], "href": "/trainer-dashboard"})
    high = db.query(QaTicket).filter(QaTicket.status.in_(("new", "in_progress")), QaTicket.priority == "high").count()
    if high:
        out.append({"id": "qa", "count": high, "href": "/studio/qa"})
    seo = get_setting(db, "seo")
    missing = [l for l in LANGS if not ((seo.get("pages") or {}).get(l) or {}).get("description")]
    if missing:
        out.append({"id": "seo", "langs": missing, "href": "/studio/seo"})
    return out


# ---- AI keys (trainer only)
class AiKeyIn(BaseModel):
    api_key: str = Field(..., min_length=12, max_length=500)
    label: Optional[str] = Field(None, max_length=80)
    provider: Optional[str] = Field(None, max_length=40)
    model: Optional[str] = Field(None, max_length=120)
    base_url: Optional[str] = Field(None, max_length=300)


class AiKeyUpdate(BaseModel):
    api_key: Optional[str] = Field(None, max_length=500)
    label: Optional[str] = Field(None, max_length=80)
    model: Optional[str] = Field(None, max_length=120)
    base_url: Optional[str] = Field(None, max_length=300)


@router.get("/ai-providers")
def ai_providers(user: UserResponse = Depends(require_studio)):
    from app.services.ai_providers import public_catalogue
    return public_catalogue()


@router.get("/ai-keys")
def list_ai_keys(user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.ai_keys import list_keys
    return list_keys(db, user.id)


@router.post("/ai-keys", status_code=201)
def create_ai_key(payload: AiKeyIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.ai_keys import add_key
    try:
        row = add_key(db, user.id, payload.api_key, payload.label, payload.provider, payload.model, payload.base_url)
        from app.routers import i18n_bundle  # QA #85: a new key may unblock the Russian / Arabic translation now

        i18n_bundle._failed_at.clear()
        return row
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/ai-keys/{key_id}")
def update_ai_key(key_id: int, payload: AiKeyUpdate, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.ai_keys import update_key
    try:
        return update_key(db, user.id, key_id, payload.api_key, payload.model, payload.base_url, payload.label)
    except LookupError:
        raise HTTPException(status_code=404, detail="Key not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ai-keys/{key_id}/prefer")
def prefer_ai_key(key_id: int, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.ai_keys import set_preferred
    try:
        set_preferred(db, user.id, key_id)
        return {"ok": True}
    except LookupError:
        raise HTTPException(status_code=404, detail="Key not found")


@router.post("/ai-keys/{key_id}/test")
def test_ai_key(key_id: int, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.agent_ec import AgentUnavailable, test_engine
    try:
        return {"ok": True, "engine": test_engine(db, user, key_id)}
    except AgentUnavailable as e:
        return {"ok": False, "error": str(e)}


@router.delete("/ai-keys/{key_id}", status_code=204)
def remove_ai_key(key_id: int, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.ai_keys import delete_key
    try:
        delete_key(db, user.id, key_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Key not found")


# ---------------------------------------------------------------- COM / SEO articles
@router.get("/articles")
def get_articles(user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.seo_writer import list_articles
    return list_articles(db)


class ArticleIn(BaseModel):
    article: Dict[str, Any]


@router.put("/articles")
def put_article(payload: ArticleIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.seo_writer import save_article
    try:
        return save_article(db, payload.article, user.id, user.full_name or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/articles/{article_id}", status_code=204)
def remove_article(article_id: str, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.seo_writer import delete_article
    try:
        delete_article(db, article_id, user.id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Article not found")


class ArticleBriefIn(BaseModel):
    topic: str = Field(..., min_length=2, max_length=300)
    keyword: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1500)
    length: Literal["short", "standard", "long"] = "standard"
    lang: Optional[str] = Field(None, max_length=5)
    model: Optional[str] = Field(None, max_length=120)
    statuses: Dict[str, str] = Field(default_factory=dict)


@router.post("/seo/generate")
def generate_article(payload: ArticleBriefIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    from app.services.seo_writer import generate_article as run
    lang = payload.lang if payload.lang in LANGS else "he"
    brief = payload.model_dump(exclude={"statuses", "lang"})
    statuses = {k: str(v)[:120] for k, v in payload.statuses.items()}
    return StreamingResponse(
        run(db, user.id, brief, lang, statuses),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
