"""
Trainer studio API + public site endpoints.

Public (no auth):
  POST /api/public/leads            in-site contact/consultation forms
  GET  /api/public/site?lang=he     editable site content overrides + SEO for that language

Trainer / admin only (/api/studio):
  overview, prospects (leads), site content per language, SEO, Atelier QA, Agent EC chat
"""
import copy
import time
from collections import defaultdict, deque
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.auth.utils import get_current_user
from app.database import get_db
from app.models.studio import Lead, QaComment, QaTicket, SiteSetting
from app.models.user import User
from app.schemas.auth import UserResponse, UserRole

public_router = APIRouter()
router = APIRouter()

LANGS = ("he", "en", "fr")
LEAD_STATUSES = ("new", "contacted", "qualified", "converted", "lost")
QA_STATUSES = ("new", "in_progress", "done", "cancelled")
QA_PRIORITIES = ("low", "normal", "high")


def require_studio(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    if current_user.role not in (UserRole.TRAINER, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Trainer access only")
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
        "author": (db.query(User.full_name).filter(User.id == t.created_by).scalar() if t.created_by else None),
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }
    comments = db.query(QaComment).filter(QaComment.ticket_id == t.id).order_by(QaComment.created_at).all()
    d["comment_count"] = len(comments)
    if with_comments:
        names = {u.id: u.full_name for u in db.query(User).filter(User.id.in_({c.author_id for c in comments if c.author_id})).all()} if comments else {}
        d["comments"] = [
            {"id": c.id, "body": c.body, "author": names.get(c.author_id), "created_at": c.created_at.isoformat() if c.created_at else None}
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
    }


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
def put_site_content(lang: str, payload: SiteContentIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    if lang not in LANGS:
        raise HTTPException(status_code=404, detail="Unknown language")
    put_setting(db, f"content:{lang}", payload.content, user.id)
    if payload.brand is not None:
        put_setting(db, "brand", payload.brand, user.id)
    return {"ok": True}


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


@router.get("/qa")
def list_tickets(status: Optional[str] = None, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    q = db.query(QaTicket)
    if status:
        q = q.filter(QaTicket.status == status)
    return [ticket_dict(t, db) for t in q.order_by(QaTicket.created_at.desc()).limit(500).all()]


@router.post("/qa", status_code=201)
def create_ticket(payload: TicketIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    t = QaTicket(**payload.model_dump(), status="new", created_by=user.id)
    db.add(t)
    db.commit()
    return ticket_dict(t, db, with_comments=True)


@router.get("/qa/{ticket_id}")
def get_ticket(ticket_id: int, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    t = db.query(QaTicket).get(ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket_dict(t, db, with_comments=True)


@router.patch("/qa/{ticket_id}")
def update_ticket(ticket_id: int, payload: TicketUpdate, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    t = db.query(QaTicket).get(ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    return ticket_dict(t, db, with_comments=True)


@router.post("/qa/{ticket_id}/comments", status_code=201)
def add_comment(ticket_id: int, payload: CommentIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
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
    raise HTTPException(status_code=422, detail="Unknown action")


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
        return add_key(db, user.id, payload.api_key, payload.label, payload.provider, payload.model, payload.base_url)
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
