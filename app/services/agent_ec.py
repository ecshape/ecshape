"""
Agent EC — the trainer's AI assistant inside the ECshape studio.

A manual tool-use loop on the Claude API: the model reads and updates studio data through the
tools below, each executed with the caller's DB session and trainer scope. Uses the same
ANTHROPIC_API_KEY the backend already uses for meal variants.
"""
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.check_in import DailyCheckIn
from app.models.progress import ProgressEntry
from app.models.studio import Lead, QaTicket
from app.models.user import User
from app.schemas.auth import UserResponse, UserRole

logger = logging.getLogger(__name__)

MODEL_ID = "claude-opus-5-5"
MAX_TOOL_ROUNDS = 8


class AgentUnavailable(Exception):
    pass


SYSTEM_PROMPT = """You are Agent EC, the assistant built into the ECshape coaching studio of personal trainer \
Elior Cremisi (Hebrew: אליאור קרמיזי). You help him run his business: clients (trainees), prospects coming \
from the website, the public website's content, SEO/communication, and QA tickets about the site and app.

How to work:
- Use the tools to look up real data before answering questions about clients, prospects or tickets. Never invent \
names, numbers or dates.
- You may change data (update a prospect, create a ticket, edit site text) when the trainer asks for it. Say \
exactly what you changed.
- For communication work (Instagram captions, WhatsApp replies to prospects, SEO titles/descriptions, articles), \
write ready-to-use text in the requested language. Keep the brand voice: direct, warm, motivating, no medical claims.
- Answer in the language the trainer writes in (Hebrew, English or French). Be concise; use short lists when helpful.
- Health data is sensitive: only discuss it with the trainer, never suggest sharing it elsewhere."""


# ------------------------------------------------------------------ tool definitions
TOOLS: List[Dict[str, Any]] = [
    {
        "name": "studio_overview",
        "description": "Counts for the studio dashboard: number of clients, new and open prospects, open QA tickets, check-ins logged today.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "list_clients",
        "description": "List the trainer's clients with their last login, last daily check-in date and latest recorded weight.",
        "input_schema": {
            "type": "object",
            "properties": {"search": {"type": "string", "description": "Optional name/email filter."}},
            "additionalProperties": False,
        },
    },
    {
        "name": "client_details",
        "description": "Recent check-ins (last 14 days) and weight history (last 12 entries) for one client.",
        "input_schema": {
            "type": "object",
            "properties": {"client_id": {"type": "integer"}},
            "required": ["client_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "list_prospects",
        "description": "List prospects (leads from the website forms), newest first.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["new", "contacted", "qualified", "converted", "lost"]},
                "since_days": {"type": "integer", "description": "Only leads created in the last N days."},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "update_prospect",
        "description": "Change a prospect's status and/or append a note.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "integer"},
                "status": {"type": "string", "enum": ["new", "contacted", "qualified", "converted", "lost"]},
                "add_note": {"type": "string"},
            },
            "required": ["lead_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "list_qa_tickets",
        "description": "List Atelier QA tickets (requests/bugs about the site or app).",
        "input_schema": {
            "type": "object",
            "properties": {"status": {"type": "string", "enum": ["new", "in_progress", "done", "cancelled"]}},
            "additionalProperties": False,
        },
    },
    {
        "name": "create_qa_ticket",
        "description": "Open a new Atelier QA ticket.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "body": {"type": "string"},
                "page": {"type": "string", "description": "Page or screen concerned, e.g. /meals or 'site: FAQ'."},
                "priority": {"type": "string", "enum": ["low", "normal", "high"]},
            },
            "required": ["title"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_site_content",
        "description": "Read the trainer's custom overrides of the public website text for one language (he, en, fr). Empty means defaults are shown.",
        "input_schema": {
            "type": "object",
            "properties": {"lang": {"type": "string", "enum": ["he", "en", "fr"]}},
            "required": ["lang"],
            "additionalProperties": False,
        },
    },
    {
        "name": "set_site_text",
        "description": "Override one text field of the public website, e.g. path 'hero.sub' or 'cta.title2'. Only when the trainer asks to change site wording.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lang": {"type": "string", "enum": ["he", "en", "fr"]},
                "path": {"type": "string", "description": "Dot path of the field, e.g. 'hero.title1'."},
                "value": {"type": "string"},
            },
            "required": ["lang", "path", "value"],
            "additionalProperties": False,
        },
    },
]


# ------------------------------------------------------------------ tool implementations
def _clients_query(db: Session, user: UserResponse):
    q = db.query(User).filter(User.role == UserRole.CLIENT)
    if user.role == UserRole.TRAINER:
        q = q.filter(User.trainer_id == user.id)
    return q


def _run_tool(db: Session, user: UserResponse, name: str, args: Dict[str, Any]) -> Any:
    from app.routers.studio import get_setting, put_setting, lead_dict, ticket_dict  # local import avoids a cycle

    if name == "studio_overview":
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        client_ids = [c.id for c in _clients_query(db, user).all()]
        return {
            "clients": len(client_ids),
            "prospects_new": db.query(Lead).filter(Lead.status == "new").count(),
            "prospects_open": db.query(Lead).filter(Lead.status.in_(("new", "contacted", "qualified"))).count(),
            "qa_open": db.query(QaTicket).filter(QaTicket.status.in_(("new", "in_progress"))).count(),
            "checkins_today": db.query(DailyCheckIn).filter(DailyCheckIn.client_id.in_(client_ids or [-1]), DailyCheckIn.date >= today).count(),
        }

    if name == "list_clients":
        q = _clients_query(db, user)
        if args.get("search"):
            like = f"%{args['search']}%"
            q = q.filter((User.full_name.ilike(like)) | (User.email.ilike(like)))
        out = []
        for c in q.order_by(User.full_name).limit(200).all():
            last_ci = db.query(DailyCheckIn).filter(DailyCheckIn.client_id == c.id).order_by(DailyCheckIn.date.desc()).first()
            last_w = db.query(ProgressEntry).filter(ProgressEntry.client_id == c.id).order_by(ProgressEntry.date.desc()).first()
            out.append({
                "id": c.id, "name": c.full_name, "email": c.email, "active": c.is_active,
                "last_login": c.last_login.isoformat() if c.last_login else None,
                "last_checkin": last_ci.date.date().isoformat() if last_ci else None,
                "latest_weight_kg": last_w.weight if last_w else None,
            })
        return out

    if name == "client_details":
        c = _clients_query(db, user).filter(User.id == int(args["client_id"])).first()
        if not c:
            return {"error": "Client not found for this trainer."}
        since = datetime.now() - timedelta(days=14)
        cis = db.query(DailyCheckIn).filter(DailyCheckIn.client_id == c.id, DailyCheckIn.date >= since).order_by(DailyCheckIn.date).all()
        ws = db.query(ProgressEntry).filter(ProgressEntry.client_id == c.id).order_by(ProgressEntry.date.desc()).limit(12).all()
        return {
            "client": {"id": c.id, "name": c.full_name, "email": c.email},
            "checkins_14d": [
                {"date": ci.date.date().isoformat(), "weight": ci.weight, "steps": ci.steps, "sleep": ci.sleep_hours, "hunger": ci.hunger_level}
                for ci in cis
            ],
            "weights": [{"date": w.date.isoformat(), "kg": w.weight, "waist_cm": w.waist} for w in reversed(ws)],
        }

    if name == "list_prospects":
        q = db.query(Lead)
        if args.get("status"):
            q = q.filter(Lead.status == args["status"])
        if args.get("since_days"):
            q = q.filter(Lead.created_at >= datetime.now() - timedelta(days=int(args["since_days"])))
        return [lead_dict(l) for l in q.order_by(Lead.created_at.desc()).limit(100).all()]

    if name == "update_prospect":
        lead = db.query(Lead).get(int(args["lead_id"]))
        if not lead:
            return {"error": "Prospect not found."}
        if args.get("status"):
            lead.status = args["status"]
        if args.get("add_note"):
            stamp = datetime.now().strftime("%Y-%m-%d")
            lead.notes = ((lead.notes or "") + f"\n[{stamp} · Agent EC] {args['add_note']}").strip()
        db.commit()
        return {"ok": True, "prospect": lead_dict(lead)}

    if name == "list_qa_tickets":
        q = db.query(QaTicket)
        if args.get("status"):
            q = q.filter(QaTicket.status == args["status"])
        return [ticket_dict(t, db) for t in q.order_by(QaTicket.created_at.desc()).limit(100).all()]

    if name == "create_qa_ticket":
        t = QaTicket(title=args["title"][:200], body=args.get("body"), page=args.get("page"),
                     priority=args.get("priority") or "normal", status="new", created_by=user.id)
        db.add(t)
        db.commit()
        return {"ok": True, "ticket": ticket_dict(t, db)}

    if name == "get_site_content":
        return get_setting(db, f"content:{args['lang']}")

    if name == "set_site_text":
        key = f"content:{args['lang']}"
        content = get_setting(db, key)
        node = content
        parts = [p for p in str(args["path"]).split(".") if p]
        if not parts:
            return {"error": "Empty path."}
        for p in parts[:-1]:
            if not isinstance(node.get(p), dict):
                node[p] = {}
            node = node[p]
        node[parts[-1]] = args["value"]
        put_setting(db, key, content, user.id)
        return {"ok": True, "path": args["path"], "lang": args["lang"]}

    return {"error": f"Unknown tool {name}"}


WRITE_TOOLS = {"update_prospect", "create_qa_ticket", "set_site_text"}


# ------------------------------------------------------------------ loop
def run_agent(db: Session, user: UserResponse, turns: List[Dict[str, str]], lang: str = "he", page: Optional[str] = None) -> Dict[str, Any]:
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise AgentUnavailable("ANTHROPIC_API_KEY is not configured on the server.")
    try:
        import anthropic
    except ImportError as e:  # pragma: no cover
        raise AgentUnavailable("The anthropic package is not installed.") from e

    client = anthropic.Anthropic()
    messages: List[Dict[str, Any]] = [{"role": t["role"], "content": t["content"]} for t in turns]
    context = f"Trainer: {user.full_name}. Interface language: {lang}. Today: {datetime.now().date().isoformat()}."
    if page:
        context += f" The trainer is currently on studio page: {page}."
    system = [
        {"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": context},
    ]
    actions: List[Dict[str, Any]] = []

    for _ in range(MAX_TOOL_ROUNDS):
        try:
            response = client.beta.messages.create(
                model=MODEL_ID,
                max_tokens=16000,
                system=system,
                tools=TOOLS,
                messages=messages,
                output_config={"effort": "medium"},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except anthropic.RateLimitError:
            raise AgentUnavailable("Agent EC is busy right now (rate limit). Try again in a minute.")
        except anthropic.APIStatusError as e:
            logger.error("Agent EC API error %s: %s", e.status_code, e.message)
            raise AgentUnavailable("Agent EC could not reach the AI service.")
        except anthropic.APIConnectionError:
            raise AgentUnavailable("Agent EC could not reach the AI service (network).")

        if response.stop_reason == "refusal":
            return {"reply": "I can't help with that request.", "actions": actions}

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                try:
                    result = _run_tool(db, user, block.name, dict(block.input or {}))
                    is_error = isinstance(result, dict) and "error" in result
                except Exception as e:  # tool failure goes back to the model, not to the user
                    logger.exception("Agent EC tool %s failed", block.name)
                    db.rollback()
                    result, is_error = {"error": str(e)}, True
                if block.name in WRITE_TOOLS and not is_error:
                    actions.append({"tool": block.name, "input": dict(block.input or {})})
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                    **({"is_error": True} if is_error else {}),
                })
            messages.append({"role": "user", "content": results})
            continue

        if response.stop_reason == "pause_turn":
            messages.append({"role": "assistant", "content": response.content})
            continue

        text = "".join(b.text for b in response.content if b.type == "text").strip()
        return {"reply": text, "actions": actions}

    return {"reply": "I stopped after several steps without finishing. Please narrow the request.", "actions": actions}
