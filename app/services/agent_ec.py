"""
Agent EC — the trainer's assistant, docked beside every studio page (modelled on Agent LE).

- Reads studio data through read tools executed here with the caller's DB session and trainer scope.
- Never changes data on its own: "proposal" tools turn into actions (ops) that the trainer sees
  as cards and confirms; the browser then runs them on the right page (/agent/execute).
- Sees the page the trainer is on (path, title, visible text, selection).
- Runs on the trainer's own AI key (Claude, ChatGPT, Gemini, Mistral, Grok, DeepSeek, Groq,
  OpenRouter or any OpenAI-compatible endpoint), or the server's ANTHROPIC_API_KEY.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.check_in import DailyCheckIn
from app.models.progress import ProgressEntry
from app.models.studio import Lead, QaTicket
from app.models.user import User
from app.schemas.auth import UserResponse, UserRole
from app.services.ai_keys import Engine, resolve_engine

logger = logging.getLogger(__name__)
MAX_TOOL_ROUNDS = 8
CLAUDE_FALLBACK_MODELS = {"claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-fable-5-2", "claude-fable-5-1"}


class AgentUnavailable(Exception):
    def __init__(self, message: str, fix: Optional[Dict[str, str]] = None):
        super().__init__(message)
        self.fix = fix


SYSTEM_PROMPT = """You are Agent EC, the assistant docked beside every page of the ECshape coaching studio of personal \
trainer Elior Cremisi (Hebrew: אליאור קרמיזי). You help him run the business: clients (trainees), prospects from the \
website, the public website's content, SEO/communication, and QA tickets about the site and app.

You can see the page the trainer has open (path, title and visible text). Use it: "this page", "this client", \
"this prospect" refer to what is on screen.

How to work:
- Look up real data with the read tools before answering questions about clients, prospects or tickets. Never invent \
names, numbers or dates.
- You never change data yourself. To act, call the matching proposal tool (update_prospect, create_prospect, \
create_qa_ticket, update_qa_ticket, set_site_text, set_page_seo). Each one becomes a card the trainer confirms; it runs \
on the right page while they watch. Say in one short sentence what you proposed.
- To take the trainer somewhere, call navigate (or open_form to open a "new …" form). These run immediately.
- For communication work (Instagram captions, WhatsApp replies to prospects, SEO titles and descriptions, articles), \
write ready-to-use text in the requested language. Brand voice: direct, warm, motivating, no medical claims, no emojis \
unless the trainer asks for them.
- Answer in the language the trainer writes in (Hebrew, English or French). Be concise; short lists when helpful.
- Health data is sensitive: discuss it only with the trainer.
"""

# Routes the agent may open (prefix match)
ALLOWED_PATHS = ("/trainer-dashboard", "/client/", "/exercises", "/meal-bank", "/chat", "/studio/prospects", "/studio/site",
                 "/studio/seo", "/studio/qa", "/studio/settings", "/trainer-weekly-meals-v3", "/create-workout-plan-v2")

# ------------------------------------------------------------------ tools (provider-neutral)
READ_TOOLS: List[Dict[str, Any]] = [
    {"name": "studio_overview", "description": "Dashboard counts: clients, new/open prospects, open QA tickets, check-ins today.",
     "schema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "list_clients", "description": "The trainer's clients with last login, last daily check-in and latest weight.",
     "schema": {"type": "object", "properties": {"search": {"type": "string"}}, "additionalProperties": False}},
    {"name": "client_details", "description": "Check-ins of the last 14 days and the last 12 weigh-ins of one client.",
     "schema": {"type": "object", "properties": {"client_id": {"type": "integer"}}, "required": ["client_id"], "additionalProperties": False}},
    {"name": "list_prospects", "description": "Prospects (website form leads), newest first.",
     "schema": {"type": "object", "properties": {"status": {"type": "string", "enum": ["new", "contacted", "qualified", "converted", "lost"]},
                                                  "since_days": {"type": "integer"}}, "additionalProperties": False}},
    {"name": "list_qa_tickets", "description": "Atelier QA tickets about the site or the app.",
     "schema": {"type": "object", "properties": {"status": {"type": "string", "enum": ["new", "in_progress", "done", "cancelled"]}}, "additionalProperties": False}},
    {"name": "get_site_content", "description": "The trainer's text overrides of the public website for a language (empty = defaults shown).",
     "schema": {"type": "object", "properties": {"lang": {"type": "string", "enum": ["he", "en", "fr"]}}, "required": ["lang"], "additionalProperties": False}},
    {"name": "get_seo", "description": "SEO settings per language (Google title, description, keywords, share image) and social links.",
     "schema": {"type": "object", "properties": {}, "additionalProperties": False}},
]

PROPOSAL_TOOLS: List[Dict[str, Any]] = [
    {"name": "navigate", "description": "Open a studio page now. href must be one of: " + ", ".join(ALLOWED_PATHS) + " (client pages: /client/<id>).",
     "schema": {"type": "object", "properties": {"href": {"type": "string"}, "label": {"type": "string", "description": "Button text, e.g. 'Open prospects'."}},
                "required": ["href", "label"], "additionalProperties": False}},
    {"name": "open_form", "description": "Open a 'new …' form on its page now.",
     "schema": {"type": "object", "properties": {"form": {"type": "string", "enum": ["prospect", "qa_ticket", "client"]}}, "required": ["form"], "additionalProperties": False}},
    {"name": "update_prospect", "description": "Propose changing a prospect's status and/or adding a note (trainer confirms).",
     "schema": {"type": "object", "properties": {"lead_id": {"type": "integer"}, "lead_name": {"type": "string"},
                                                  "status": {"type": "string", "enum": ["new", "contacted", "qualified", "converted", "lost"]},
                                                  "note": {"type": "string"}}, "required": ["lead_id", "lead_name"], "additionalProperties": False}},
    {"name": "create_prospect", "description": "Propose creating a prospect (trainer confirms). Nothing is sent to the person.",
     "schema": {"type": "object", "properties": {"name": {"type": "string"}, "phone": {"type": "string"}, "email": {"type": "string"},
                                                  "goal": {"type": "string"}, "program": {"type": "string"}, "notes": {"type": "string"}},
                "required": ["name"], "additionalProperties": False}},
    {"name": "create_qa_ticket", "description": "Propose opening an Atelier QA ticket (trainer confirms).",
     "schema": {"type": "object", "properties": {"title": {"type": "string"}, "body": {"type": "string"}, "page": {"type": "string"},
                                                  "priority": {"type": "string", "enum": ["low", "normal", "high"]}}, "required": ["title"], "additionalProperties": False}},
    {"name": "update_qa_ticket", "description": "Propose changing a QA ticket's status or priority (trainer confirms).",
     "schema": {"type": "object", "properties": {"ticket_id": {"type": "integer"}, "title": {"type": "string"},
                                                  "status": {"type": "string", "enum": ["new", "in_progress", "done", "cancelled"]},
                                                  "priority": {"type": "string", "enum": ["low", "normal", "high"]}}, "required": ["ticket_id"], "additionalProperties": False}},
    {"name": "set_site_text", "description": "Propose replacing one text of the public website, e.g. path 'hero.sub' or 'faq.items.2.a' (trainer confirms).",
     "schema": {"type": "object", "properties": {"lang": {"type": "string", "enum": ["he", "en", "fr"]}, "path": {"type": "string"}, "value": {"type": "string"}},
                "required": ["lang", "path", "value"], "additionalProperties": False}},
    {"name": "set_page_seo", "description": "Propose new Google title / description / keywords for the website in one language (trainer confirms).",
     "schema": {"type": "object", "properties": {"lang": {"type": "string", "enum": ["he", "en", "fr"]}, "title": {"type": "string"},
                                                  "description": {"type": "string"}, "keywords": {"type": "string"}}, "required": ["lang"], "additionalProperties": False}},
]
PROPOSAL_NAMES = {t["name"] for t in PROPOSAL_TOOLS}


def _tool_to_op(name: str, args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Convert a proposal tool call into an action the browser shows and runs."""
    if name == "navigate":
        href = str(args.get("href") or "")
        if not href.startswith("/") or not any(href == p.rstrip("/") or href.startswith(p) for p in ALLOWED_PATHS):
            return None
        return {"kind": "navigate", "href": href, "label": str(args.get("label") or href)[:80]}
    if name == "open_form":
        return {"kind": "ui.open-form", "form": args.get("form")}
    if name == "update_prospect":
        return {"kind": "lead.update", "leadId": int(args["lead_id"]), "leadName": args.get("lead_name", ""), "status": args.get("status"), "note": args.get("note")}
    if name == "create_prospect":
        return {"kind": "lead.create", "lead": {k: args.get(k) for k in ("name", "phone", "email", "goal", "program", "notes")}}
    if name == "create_qa_ticket":
        return {"kind": "qa.create", "ticket": {k: args.get(k) for k in ("title", "body", "page", "priority")}}
    if name == "update_qa_ticket":
        return {"kind": "qa.update", "ticketId": int(args["ticket_id"]), "title": args.get("title", ""), "status": args.get("status"), "priority": args.get("priority")}
    if name == "set_site_text":
        return {"kind": "site.text", "lang": args.get("lang"), "path": args.get("path"), "value": args.get("value")}
    if name == "set_page_seo":
        return {"kind": "seo.page", "lang": args.get("lang"), **{k: args.get(k) for k in ("title", "description", "keywords") if args.get(k)}}
    return None


# ------------------------------------------------------------------ read tool implementations
def _clients_query(db: Session, user: UserResponse):
    q = db.query(User).filter(User.role == UserRole.CLIENT)
    if user.role == UserRole.TRAINER:
        q = q.filter(User.trainer_id == user.id)
    return q


def _run_read_tool(db: Session, user: UserResponse, name: str, args: Dict[str, Any]) -> Any:
    from app.routers.studio import get_setting, lead_dict, ticket_dict  # local import avoids a cycle

    if name == "studio_overview":
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        ids = [c.id for c in _clients_query(db, user).all()]
        return {
            "clients": len(ids),
            "prospects_new": db.query(Lead).filter(Lead.status == "new").count(),
            "prospects_open": db.query(Lead).filter(Lead.status.in_(("new", "contacted", "qualified"))).count(),
            "qa_open": db.query(QaTicket).filter(QaTicket.status.in_(("new", "in_progress"))).count(),
            "checkins_today": db.query(DailyCheckIn).filter(DailyCheckIn.client_id.in_(ids or [-1]), DailyCheckIn.date >= today).count(),
        }
    if name == "list_clients":
        q = _clients_query(db, user)
        if args.get("search"):
            like = f"%{args['search']}%"
            q = q.filter((User.full_name.ilike(like)) | (User.email.ilike(like)))
        out = []
        for c in q.order_by(User.full_name).limit(200).all():
            ci = db.query(DailyCheckIn).filter(DailyCheckIn.client_id == c.id).order_by(DailyCheckIn.date.desc()).first()
            w = db.query(ProgressEntry).filter(ProgressEntry.client_id == c.id).order_by(ProgressEntry.date.desc()).first()
            out.append({"id": c.id, "name": c.full_name, "email": c.email, "active": c.is_active,
                        "last_login": c.last_login.isoformat() if c.last_login else None,
                        "last_checkin": ci.date.date().isoformat() if ci else None, "latest_weight_kg": w.weight if w else None})
        return out
    if name == "client_details":
        c = _clients_query(db, user).filter(User.id == int(args["client_id"])).first()
        if not c:
            return {"error": "Client not found for this trainer."}
        since = datetime.now() - timedelta(days=14)
        cis = db.query(DailyCheckIn).filter(DailyCheckIn.client_id == c.id, DailyCheckIn.date >= since).order_by(DailyCheckIn.date).all()
        ws = db.query(ProgressEntry).filter(ProgressEntry.client_id == c.id).order_by(ProgressEntry.date.desc()).limit(12).all()
        return {"client": {"id": c.id, "name": c.full_name, "email": c.email},
                "checkins_14d": [{"date": x.date.date().isoformat(), "weight": x.weight, "steps": x.steps, "sleep": x.sleep_hours, "hunger": x.hunger_level} for x in cis],
                "weights": [{"date": w.date.isoformat(), "kg": w.weight, "waist_cm": w.waist} for w in reversed(ws)]}
    if name == "list_prospects":
        q = db.query(Lead)
        if args.get("status"):
            q = q.filter(Lead.status == args["status"])
        if args.get("since_days"):
            q = q.filter(Lead.created_at >= datetime.now() - timedelta(days=int(args["since_days"])))
        return [lead_dict(l) for l in q.order_by(Lead.created_at.desc()).limit(100).all()]
    if name == "list_qa_tickets":
        q = db.query(QaTicket)
        if args.get("status"):
            q = q.filter(QaTicket.status == args["status"])
        return [ticket_dict(t, db) for t in q.order_by(QaTicket.created_at.desc()).limit(100).all()]
    if name == "get_site_content":
        return get_setting(db, f"content:{args['lang']}")
    if name == "get_seo":
        return get_setting(db, "seo")
    return {"error": f"Unknown tool {name}"}


# ------------------------------------------------------------------ engines
def _anthropic_tools() -> List[Dict[str, Any]]:
    return [{"name": t["name"], "description": t["description"], "input_schema": t["schema"]} for t in READ_TOOLS + PROPOSAL_TOOLS]


def _openai_tools() -> List[Dict[str, Any]]:
    return [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["schema"]}}
            for t in READ_TOOLS + PROPOSAL_TOOLS]


def _dispatch(db: Session, user: UserResponse, name: str, args: Dict[str, Any], ops: List[Dict[str, Any]]) -> Tuple[Any, bool]:
    """Run a read tool, or record a proposal as an op. Returns (result, is_error)."""
    try:
        if name in PROPOSAL_NAMES:
            op = _tool_to_op(name, args)
            if not op:
                return {"error": "This action or address is not allowed."}, True
            ops.append(op)
            auto = op["kind"] in ("navigate", "ui.open-form")
            return {"proposed": True, "note": "Runs now." if auto else "Shown to the trainer as a card; it runs only if they confirm."}, False
        result = _run_read_tool(db, user, name, args)
        return result, isinstance(result, dict) and "error" in result
    except Exception as e:
        logger.exception("Agent EC tool %s failed", name)
        db.rollback()
        return {"error": str(e)}, True


def _run_claude(engine: Engine, db: Session, user: UserResponse, system: List[Dict[str, Any]], messages: List[Dict[str, Any]], ops: List[Dict[str, Any]]) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=engine.api_key)
    tools = _anthropic_tools()
    for _ in range(MAX_TOOL_ROUNDS):
        kwargs: Dict[str, Any] = dict(model=engine.model, max_tokens=16000, system=system, tools=tools, messages=messages)
        try:
            if engine.model in CLAUDE_FALLBACK_MODELS:
                response = client.beta.messages.create(**kwargs, output_config={"effort": "medium"},
                                                       betas=["server-side-fallback-2026-07-01"], fallbacks="default")
            else:
                response = client.messages.create(**kwargs)
        except anthropic.AuthenticationError:
            raise AgentUnavailable("The Claude key was refused.", {"label": "settings", "href": "/studio/settings#ai-keys"})
        except anthropic.RateLimitError:
            raise AgentUnavailable("The AI service is busy (rate limit). Try again in a minute.")
        except anthropic.APIStatusError as e:
            logger.error("Agent EC Claude error %s: %s", e.status_code, e.message)
            raise AgentUnavailable(f"The AI service answered with an error ({e.status_code}).")
        except anthropic.APIConnectionError:
            raise AgentUnavailable("The AI service could not be reached.")

        if response.stop_reason == "refusal":
            return "I can't help with that request."
        if response.stop_reason in ("tool_use", "pause_turn"):
            messages.append({"role": "assistant", "content": response.content})
            if response.stop_reason == "pause_turn":
                continue
            results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                result, err = _dispatch(db, user, block.name, dict(block.input or {}), ops)
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result, ensure_ascii=False, default=str), **({"is_error": True} if err else {})})
            messages.append({"role": "user", "content": results})
            continue
        return "".join(b.text for b in response.content if b.type == "text").strip()
    return "I stopped after several steps without finishing. Please narrow the request."


def _post_json(url: str, api_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}",
                                          "HTTP-Referer": "https://ecshape.org", "X-Title": "ECshape Studio"})
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")[:300]
        if e.code in (401, 403):
            raise AgentUnavailable("The AI key was refused by the provider.", {"label": "settings", "href": "/studio/settings#ai-keys"})
        if e.code == 429:
            raise AgentUnavailable("The AI service is busy (rate limit). Try again in a minute.")
        logger.error("Agent EC provider error %s: %s", e.code, body)
        raise AgentUnavailable(f"The AI service answered with an error ({e.code}).")
    except urllib.error.URLError:
        raise AgentUnavailable("The AI service could not be reached.")


def _run_openai_compatible(engine: Engine, db: Session, user: UserResponse, system_text: str, turns: List[Dict[str, str]], ops: List[Dict[str, Any]]) -> str:
    if not engine.base_url:
        raise AgentUnavailable("This AI key has no API address.", {"label": "settings", "href": "/studio/settings#ai-keys"})
    url = engine.base_url.rstrip("/") + "/chat/completions"
    messages: List[Dict[str, Any]] = [{"role": "system", "content": system_text}] + [{"role": t["role"], "content": t["content"]} for t in turns]
    tools = _openai_tools()
    for _ in range(MAX_TOOL_ROUNDS):
        data = _post_json(url, engine.api_key, {"model": engine.model, "messages": messages, "tools": tools, "tool_choice": "auto"})
        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        calls = msg.get("tool_calls") or []
        if calls:
            messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls})
            for call in calls:
                fn = call.get("function") or {}
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                result, _err = _dispatch(db, user, fn.get("name", ""), args if isinstance(args, dict) else {}, ops)
                messages.append({"role": "tool", "tool_call_id": call.get("id"), "content": json.dumps(result, ensure_ascii=False, default=str)})
            continue
        return (msg.get("content") or "").strip()
    return "I stopped after several steps without finishing. Please narrow the request."


# ------------------------------------------------------------------ entry point
def run_agent(db: Session, user: UserResponse, turns: List[Dict[str, str]], lang: str = "he",
              page: Optional[Dict[str, str]] = None, provider: Optional[str] = None) -> Dict[str, Any]:
    engine = resolve_engine(db, user.id, provider)
    if not engine:
        raise AgentUnavailable("No AI key yet. Add one in Settings → AI keys.", {"label": "settings", "href": "/studio/settings#ai-keys"})

    context = f"Trainer: {user.full_name}. Interface language: {lang}. Today: {datetime.now().date().isoformat()}."
    if page:
        context += f"\nOpen page: {page.get('path', '')} — {page.get('title', '')}."
        if page.get("selection"):
            context += f"\nText the trainer selected:\n{page['selection'][:2000]}"
        if page.get("snapshot"):
            context += f"\nVisible page text (for context):\n{page['snapshot'][:9000]}"

    ops: List[Dict[str, Any]] = []
    if engine.provider == "anthropic":
        system = [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}, {"type": "text", "text": context}]
        messages: List[Dict[str, Any]] = [{"role": t["role"], "content": t["content"]} for t in turns]
        reply = _run_claude(engine, db, user, system, messages, ops)
    else:
        reply = _run_openai_compatible(engine, db, user, SYSTEM_PROMPT + "\n\n" + context, turns, ops)
    return {"reply": reply, "actions": ops, "engine": engine.label}


def test_engine(db: Session, user: UserResponse, key_id: int) -> str:
    """Tiny round-trip to check a key works; returns the engine label."""
    engine = resolve_engine(db, user.id, str(key_id))
    if not engine:
        raise AgentUnavailable("Key not found.")
    if engine.provider == "anthropic":
        import anthropic
        try:
            anthropic.Anthropic(api_key=engine.api_key).messages.create(model=engine.model, max_tokens=16, messages=[{"role": "user", "content": "ping"}])
        except anthropic.AuthenticationError:
            raise AgentUnavailable("The Claude key was refused.")
        except anthropic.APIStatusError as e:
            raise AgentUnavailable(f"Claude answered with an error ({e.status_code}).")
        except anthropic.APIConnectionError:
            raise AgentUnavailable("Claude could not be reached.")
    else:
        _post_json(engine.base_url.rstrip("/") + "/chat/completions", engine.api_key,
                   {"model": engine.model, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 8})
    return engine.label
