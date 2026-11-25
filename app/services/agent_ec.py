"""
Agent EC — the trainer's assistant, docked beside every studio page (modelled on Agent LE).

- Reads studio data through read tools executed here with the caller's DB session and trainer scope.
- Never changes data on its own: "proposal" tools turn into actions (ops) that the trainer sees
  as cards and confirms; the browser then runs them on the right page (/agent/execute).
- Sees the page the trainer is on (path, title, visible text, selection).
- Works the page itself (do_on_page): clicks, typing, options, keys on the elements the browser lists with refs;
  the trainer watches a cursor do it. Looking around runs at once; anything that changes data is confirmed first.
- Runs on the trainer's own AI key (Claude, ChatGPT, Gemini — the free AI Studio key works —, Mistral, Grok, DeepSeek,
  Groq, OpenRouter or any OpenAI-compatible endpoint), or the server's GEMINI_API_KEY / ANTHROPIC_API_KEY.
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
create_qa_ticket, update_qa_ticket, set_site_text, set_page_seo, create_article, save_site_page, set_site_menu, \
set_site_layout, set_button_link). Each one becomes a card asking the trainer "Shall I do it for you?"; it runs only if \
they say yes, on the right page while they watch, and afterwards they confirm it is what they wanted (or undo it).
- You CAN build and change the public website yourself this way: write and publish blog articles (create_article), \
create new pages of the site (save_site_page, served at /p/<slug>), change the menu (set_site_menu: add a page, the \
blog, reorder, rename, remove), show / hide / reorder the home page sections (set_site_layout), point buttons \
somewhere else (set_button_link) and change any text (set_site_text). Never answer that you cannot do it, and never \
paste a whole article or page in the chat for the trainer to copy: put it in the proposal.
- Site work, step by step: 1) read what exists first (get_site_menu, list_site_pages, list_articles, get_site_content); \
2) if an essential is missing (topic, language, what goes on the page), ask in one short message; 3) otherwise propose \
every action needed in the same answer (e.g. the page AND the menu link to it, in each language asked) and write \
one or two sentences: what you prepared and "Shall I do it for you?". Write complete, final content (real HTML: \
<h2>, <p>, <ul>, <strong>; no <h1>, no markdown), never placeholders.
- When the trainer says the result is not what they wanted, ask what to change and propose the corrected version.
- To take the trainer somewhere, call navigate (or open_form to open a "new …" form). These run immediately.
- You can also work the page itself like a person would, with do_on_page: click buttons, tabs and links, type into fields, pick options, press Enter, scroll to or highlight something. The list "Interactive elements on the page" gives each element a ref like [e12]: use only refs from the latest list. Use do_on_page for everything no dedicated tool covers (clients and their plans, workouts, menus, the meal bank, exercises, tasks, automations, chat, settings…). Prefer a dedicated tool when one exists (it can be undone).
- Understand when the trainer needs an action: "add / change / create / remove / fix / send / set up / do it" means act — prepare the steps with do_on_page (or the matching tool), do not explain how. "How do I…?" means: answer in two lines AND offer the steps as a do_on_page card, so they can say "do it for me". Pure questions get answers only.
- Set do_on_page's effect honestly: "none" = only looks, scrolls, opens tabs/menus, searches or fills a filter (runs right away); "change" = saves, creates, edits or adds anything (the trainer confirms first); "danger" = deletes, sends something to a client or prospect, publishes, or cannot be undone (red card, always confirmed). Never hide a save or delete click inside an effect "none" task.
- A task that spans several pages or screens: do the steps you can see, set continue_after=true, and stop there with one short sentence. You will then receive the new page and its elements ("[Automatic] steps done…") and continue from it. When the task is finished, say so in one sentence and do not call do_on_page again.
- Never type passwords, card numbers, ID numbers or API keys into the page; ask the trainer to do it.
- For communication work (Instagram captions, WhatsApp replies to prospects, SEO titles and descriptions, articles), \
write ready-to-use text in the requested language. Brand voice: direct, warm, motivating, no medical claims, no emojis \
unless the trainer asks for them.
- For expert tasks (training programs, menus, SEO articles, social content, sales replies, progress reviews, site copy) \
follow the matching skill; if it is not loaded yet, call load_skill first. Use search_exercises / list_foods so plans \
use real exercises and foods from the app. Ask for missing essentials (goal, days, restrictions) in one short message.
- Answer in the language the trainer writes in (Hebrew, English or French). Be concise; short lists when helpful.
- Health data is sensitive: discuss it only with the trainer.
"""

# Routes the agent may open (prefix match)
ALLOWED_PATHS = ("/trainer-dashboard", "/clients", "/client/", "/exercises", "/create-exercise", "/meal-bank", "/chat",
                 "/studio/prospects", "/studio/tasks", "/studio/automations", "/studio/site", "/studio/seo", "/studio/qa",
                 "/studio/settings", "/trainer-weekly-meals-v3", "/create-workout-plan-v2", "/create-workout",
                 "/create-meal-plan", "/create-meal-plan-v3", "/admin", "/users", "/blog", "/p/", "/home")

# What lives where (so the agent can take the trainer anywhere and act there)
ROUTE_MAP = """Pages of the app:
/trainer-dashboard — overview, today, clients at a glance · /clients — all clients, add a client
/client/<id> — one client: profile, plan, menu, check-ins, progress · /client/<id>/edit — edit the client
/create-workout-plan-v2 — build a training program · /create-workout — single workout · /exercises — exercise library
/create-exercise — new exercise · /meal-bank — food bank · /trainer-weekly-meals-v3 — weekly menus
/create-meal-plan-v3 — new meal plan · /chat — messages with clients
/studio/prospects — website leads · /studio/tasks — to-dos · /studio/automations — automatic WhatsApp/email flows
/studio/site — public website editor · /studio/seo — blog and SEO · /studio/qa — QA tickets about the site/app
/studio/settings — preferences and AI keys · /admin, /users — administration (admins)
Public site: /home, /blog, /blog/<slug>, /p/<slug>"""

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
    {"name": "load_skill", "description": "Load the full expert method and output format for a kind of task (see the skills list). Load it before doing that task.",
     "schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"], "additionalProperties": False}},
    {"name": "search_exercises", "description": "Search the exercise library (870+ exercises) by name, muscle or equipment. Use the exact names it returns in plans.",
     "schema": {"type": "object", "properties": {"query": {"type": "string"}, "muscle": {"type": "string", "description": "e.g. chest, lats, quadriceps, hamstrings, glutes, shoulders, biceps, triceps, abdominals"},
                                                  "equipment": {"type": "string", "description": "e.g. barbell, dumbbell, machine, cable, body only, kettlebells, bands"},
                                                  "level": {"type": "string", "enum": ["beginner", "intermediate", "expert"]}, "limit": {"type": "integer"}},
                "additionalProperties": False}},
    {"name": "list_articles", "description": "Blog articles (id, language, slug, title, status). Public address: /blog/<slug>.",
     "schema": {"type": "object", "properties": {"lang": {"type": "string", "enum": ["he", "en", "fr"]}}, "additionalProperties": False}},
    {"name": "list_site_pages", "description": "Extra pages of the site created in Studio (id, language, slug, title, status). Public address: /p/<slug>.",
     "schema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "get_site_menu", "description": "The site menu per language (saved menu or default), the menu texts and the pages that can be linked.",
     "schema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "list_foods", "description": "Foods in the trainer's food bank with nutrition per 100 g or per portion (for menus).",
     "schema": {"type": "object", "properties": {"search": {"type": "string"}, "macro": {"type": "string", "enum": ["protein", "carb", "fat"]}}, "additionalProperties": False}},
]

UI_ACTIONS = ("click", "fill", "select", "press", "scroll", "highlight")
UI_EFFECTS = ("none", "change", "danger")

PROPOSAL_TOOLS: List[Dict[str, Any]] = [
    {"name": "do_on_page", "description": "Do steps on the page the trainer has open, like a person would, while they watch (a cursor "
                                     "moves to each element). Refs come from 'Interactive elements on the page'. effect none runs "
                                     "now; change / danger are confirmed by the trainer first.",
     "schema": {"type": "object", "properties": {
         "summary": {"type": "string", "description": "What this does, in the trainer's language, e.g. 'Add Dana to the 3-day program and save'."},
         "effect": {"type": "string", "enum": list(UI_EFFECTS)},
         "steps": {"type": "array", "items": {"type": "object", "properties": {
             "action": {"type": "string", "enum": list(UI_ACTIONS), "description": "fill = type a value (replaces the field); select = pick an "
                        "option by its text; press = a key (Enter, Escape, Tab) in the element or the page; highlight = show it to the trainer."},
             "ref": {"type": "string", "description": "e.g. e12 (may be empty for press/scroll on the whole page)"},
             "label": {"type": "string", "description": "Visible name of the element, e.g. 'Save' or 'Client name' (used to find it again)."},
             "value": {"type": "string", "description": "Text for fill, option text for select, key for press."},
             "say": {"type": "string", "description": "Very short caption shown next to the cursor, e.g. 'Typing the name'."}},
             "required": ["action", "label"]}},
         "continue_after": {"type": "boolean", "description": "true = send me the new page after the steps so I can continue the task."}},
         "required": ["summary", "effect", "steps"], "additionalProperties": False}},
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
    {"name": "create_article", "description": "Propose writing (or rewriting, with article_id) a full blog article on the site, ready to publish (trainer confirms). "
                                        "One call per language. Public address: /blog/<slug>.",
     "schema": {"type": "object", "properties": {
         "article_id": {"type": "string", "description": "Only to replace an existing article."},
         "lang": {"type": "string", "enum": ["he", "en", "fr"]}, "title": {"type": "string", "description": "H1 of the article."},
         "slug": {"type": "string", "description": "Short URL words, e.g. perdre-du-ventre"},
         "excerpt": {"type": "string", "description": "1-2 sentence summary shown on the blog."},
         "content_html": {"type": "string", "description": "Full article body in HTML (h2, h3, p, ul, ol, strong, a). No h1."},
         "focus_keyword": {"type": "string"}, "seo_title": {"type": "string", "description": "Google title, max 60 characters."},
         "meta_description": {"type": "string", "description": "Google description, 140-160 characters."},
         "category": {"type": "string"},
         "faq": {"type": "array", "items": {"type": "object", "properties": {"q": {"type": "string"}, "a": {"type": "string"}}, "required": ["q", "a"]}},
         "status": {"type": "string", "enum": ["draft", "published"], "description": "published = visible on the site right away."}},
         "required": ["lang", "title", "content_html", "status"], "additionalProperties": False}},
    {"name": "save_site_page", "description": "Propose creating (or replacing, with page_id) a page of the public site, e.g. 'About', 'Blog intro', "
                                        "'Online coaching', 'Prices' (trainer confirms). One call per language. Public address: /p/<slug>. "
                                        "To show it in the menu, also call set_site_menu.",
     "schema": {"type": "object", "properties": {
         "page_id": {"type": "string"}, "lang": {"type": "string", "enum": ["he", "en", "fr"]}, "title": {"type": "string"},
         "slug": {"type": "string"}, "intro": {"type": "string", "description": "Short lead under the title."},
         "content_html": {"type": "string", "description": "Page body in HTML (h2, h3, p, ul, ol, strong, a, img). No h1."},
         "seo_title": {"type": "string"}, "meta_description": {"type": "string"},
         "show_contact_box": {"type": "boolean", "description": "'Book an intro call' box at the end (default true)."},
         "status": {"type": "string", "enum": ["draft", "published"]}},
         "required": ["lang", "title", "content_html", "status"], "additionalProperties": False}},
    {"name": "set_site_menu", "description": "Propose the complete new menu of the site for one language (trainer confirms). Items in order; "
                                       "href: '#story' '#results' '#programs' '#app' '#voices' '#faq' '#contact' (home sections), '/blog', '/p/<slug>', "
                                       "'/home' or https://…. Read get_site_menu first and keep the items that should stay. Empty items = default menu.",
     "schema": {"type": "object", "properties": {
         "lang": {"type": "string", "enum": ["he", "en", "fr"]},
         "items": {"type": "array", "items": {"type": "object", "properties": {"label": {"type": "string"}, "href": {"type": "string"}}, "required": ["label", "href"]}}},
         "required": ["lang", "items"], "additionalProperties": False}},
    {"name": "set_site_layout", "description": "Propose the order of the home page sections and which ones are hidden (all languages; trainer confirms). "
                                         "Sections: hero (always first), marquee, manifesto, story, results, shift, programs, app, process, voices, faq, cta, ig.",
     "schema": {"type": "object", "properties": {"order": {"type": "array", "items": {"type": "string"}}, "hidden": {"type": "array", "items": {"type": "string"}}},
                "additionalProperties": False}},
    {"name": "set_button_link", "description": "Propose where a button of the site leads (all languages; trainer confirms). Buttons: nav.cta, nav.login, hero.ctaPrimary, "
                                         "hero.ctaSecondary, results.ctaButton, programs.start, programs.more, app.already, faq.other, cta.form, cta.whatsapp, ig.button, "
                                         "footer.instagram, footer.whatsapp, footer.contact. Target: 'form', 'whatsapp', 'instagram', '#section', '/p/<slug>', '/blog', https://…, or '' for default.",
     "schema": {"type": "object", "properties": {"button": {"type": "string"}, "target": {"type": "string"}}, "required": ["button", "target"], "additionalProperties": False}},
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
    if name == "do_on_page":
        return _ui_task_op(args)
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
    if name == "create_article":
        return {"kind": "article.save", "article": {
            "id": args.get("article_id"), "lang": args.get("lang"), "title": args.get("title"), "slug": args.get("slug"),
            "excerpt": args.get("excerpt"), "contentHtml": args.get("content_html"), "focusKeyword": args.get("focus_keyword"),
            "seoTitle": args.get("seo_title"), "metaDescription": args.get("meta_description"), "category": args.get("category"),
            "faq": [f for f in (args.get("faq") or []) if isinstance(f, dict)][:12], "status": args.get("status") or "draft"}}
    if name == "save_site_page":
        return {"kind": "page.save", "page": {
            "id": args.get("page_id"), "lang": args.get("lang"), "title": args.get("title"), "slug": args.get("slug"),
            "intro": args.get("intro"), "contentHtml": args.get("content_html"), "cta": args.get("show_contact_box") is not False,
            "seo": {"title": args.get("seo_title"), "description": args.get("meta_description")}, "status": args.get("status") or "draft"}}
    if name == "set_site_menu":
        from app.services.agent_site import clean_href
        items = [{"label": str(i.get("label") or "")[:60], "href": clean_href(i.get("href"))} for i in (args.get("items") or []) if isinstance(i, dict)]
        if any(not i["href"] or not i["label"] for i in items):
            return None
        return {"kind": "site.menu", "lang": args.get("lang"), "items": items[:12]}
    if name == "set_site_layout":
        return {"kind": "site.layout", **{k: args[k] for k in ("order", "hidden") if isinstance(args.get(k), list)}}
    if name == "set_button_link":
        from app.services.agent_site import LINK_PATHS, clean_href
        target = str(args.get("target") or "")
        if args.get("button") not in LINK_PATHS or (target and not clean_href(target)):
            return None
        return {"kind": "site.link", "path": args["button"], "target": clean_href(target) if target else ""}
    return None


_DANGER_WORDS = ("delete", "remove", "erase", "send", "publish", "log out", "logout", "sign out", "pay", "archive",
                 "מחק", "מחיקה", "הסר", "שלח", "פרסם", "התנתק", "supprimer", "effacer", "envoyer", "publier", "déconnexion")


def _ui_task_op(args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    import re

    steps = []
    for st in (args.get("steps") or [])[:12]:
        if not isinstance(st, dict) or st.get("action") not in UI_ACTIONS:
            return None
        ref = str(st.get("ref") or "").strip()
        if ref and not re.fullmatch(r"e\d{1,4}", ref):
            return None
        if not ref and st["action"] not in ("press", "scroll"):
            return None
        steps.append({"action": st["action"], "ref": ref, "label": str(st.get("label") or "")[:80],
                      "value": str(st.get("value") or "")[:4000], "say": str(st.get("say") or "")[:80]})
    if not steps:
        return None
    effect = args.get("effect") if args.get("effect") in UI_EFFECTS else "change"
    # A delete / send / publish click is never "just looking", whatever the model said.
    clicks = " ".join(s["label"].lower() for s in steps if s["action"] in ("click", "press"))
    if any(w in clicks for w in _DANGER_WORDS):
        effect = "danger"
    elif effect == "none" and any(s["action"] == "click" for s in steps) and re.search(
            r"save|create|add|submit|confirm|apply|שמור|שמירה|צור|הוסף|אישור|enregistrer|créer|ajouter|valider|confirmer", clicks):
        effect = "change"
    return {"kind": "ui.task", "summary": str(args.get("summary") or "")[:200], "effect": effect, "steps": steps,
            "continueAfter": bool(args.get("continue_after"))}


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
    if name == "list_articles":
        from app.services.seo_writer import list_articles
        return [{k: a.get(k) for k in ("id", "lang", "slug", "title", "status", "publishedAt")} | {"href": f"/blog/{a.get('slug')}"}
                for a in list_articles(db) if not args.get("lang") or a.get("lang") == args["lang"]]
    if name == "list_site_pages":
        from app.services.agent_site import list_pages
        return [{k: p.get(k) for k in ("id", "lang", "slug", "title", "status", "intro")} | {"href": f"/p/{p.get('slug')}"} for p in list_pages(db)]
    if name == "get_site_menu":
        from app.services.agent_site import menu_view
        return menu_view(db)
    if name == "load_skill":
        from app.services import agent_skills

        sk = agent_skills.get(args.get("name", ""))
        return {"skill": sk["name"], "instructions": sk["body"]} if sk else {"error": "Unknown skill", "skills": list(agent_skills.all_skills())}
    if name == "search_exercises":
        from app.routers.exercise_library import _library

        words = [w for w in str(args.get("query") or "").lower().split() if w]
        muscle, equipment, level = (args.get("muscle") or "").lower(), (args.get("equipment") or "").lower(), args.get("level")
        hits = []
        for e in _library():
            if muscle and muscle not in [m.lower() for m in e.get("primaryMuscles", [])]:
                continue
            if equipment and equipment not in (e.get("equipment") or "").lower():
                continue
            if level and e.get("level") != level:
                continue
            if words and not all(w in e["_hay"] for w in words):
                continue
            hits.append({"name": e["name"], "muscles": e.get("primaryMuscles", []), "secondary": e.get("secondaryMuscles", []),
                         "equipment": e.get("equipment"), "level": e.get("level"), "mechanic": e.get("mechanic"), "force": e.get("force")})
        hits.sort(key=lambda h: (h["mechanic"] != "compound", len(h["name"])))
        return {"total": len(hits), "items": hits[: max(1, min(int(args.get("limit") or 25), 60))]}
    if name == "list_foods":
        from app.models.meal_system import MealBank

        q = db.query(MealBank).filter((MealBank.created_by == user.id) | (MealBank.is_public.is_(True)))
        if args.get("search"):
            like = f"%{args['search']}%"
            q = q.filter((MealBank.name.ilike(like)) | (MealBank.name_hebrew.ilike(like)))
        if args.get("macro"):
            q = q.filter(MealBank.macro_type == args["macro"])
        return [{"name": f.name, "name_he": f.name_hebrew, "macro": getattr(f.macro_type, "value", f.macro_type), "kcal": f.calories,
                 "protein": f.protein, "carbs": f.carbs, "fat": f.fat, "per": getattr(f.measurement_type, "value", f.measurement_type),
                 "serving": f.serving_size} for f in q.order_by(MealBank.name).limit(150).all()]
    return {"error": f"Unknown tool {name}"}


# ------------------------------------------------------------------ engines
def _anthropic_tools() -> List[Dict[str, Any]]:
    return [{"name": t["name"], "description": t["description"], "input_schema": t["schema"]} for t in READ_TOOLS + PROPOSAL_TOOLS]


def _strip_schema(node: Any) -> Any:
    """Gemini's OpenAI-compatible endpoint rejects some JSON-schema keywords (additionalProperties)."""
    if isinstance(node, dict):
        return {k: _strip_schema(v) for k, v in node.items() if k != "additionalProperties"}
    if isinstance(node, list):
        return [_strip_schema(v) for v in node]
    return node


def _openai_tools(provider: str = "openai") -> List[Dict[str, Any]]:
    out = []
    for t in READ_TOOLS + PROPOSAL_TOOLS:
        fn: Dict[str, Any] = {"name": t["name"], "description": t["description"]}
        if provider == "google":
            schema = _strip_schema(t["schema"])
            if schema.get("properties"):  # Gemini refuses an object schema without properties
                fn["parameters"] = schema
        else:
            fn["parameters"] = t["schema"]
        out.append({"type": "function", "function": fn})
    return out


def _dispatch(db: Session, user: UserResponse, name: str, args: Dict[str, Any], ops: List[Dict[str, Any]]) -> Tuple[Any, bool]:
    """Run a read tool, or record a proposal as an op. Returns (result, is_error)."""
    try:
        if name in PROPOSAL_NAMES:
            op = _tool_to_op(name, args)
            if not op:
                return {"error": "This action or address is not allowed."}, True
            ops.append(op)
            auto = op["kind"] in ("navigate", "ui.open-form") or (op["kind"] == "ui.task" and op["effect"] == "none")
            note = "Runs now." if auto else "Shown to the trainer as a card; it runs only if they confirm."
            if op["kind"] == "ui.task":
                note += (" Stop here with one short sentence; the new page will be sent to you after the steps ran."
                         if op["continueAfter"] else " Stop here with one short sentence.")
            return {"proposed": True, "note": note}, False
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
            from app.services.ai_keys import provider_error_text
            raise AgentUnavailable(f"The AI service answered with an error ({e.status_code}): {provider_error_text(e)}")
        except anthropic.APIConnectionError:
            raise AgentUnavailable("The AI service could not be reached.")

        if response.stop_reason == "refusal":
            return "I can't help with that request."
        if response.stop_reason in ("tool_use", "pause_turn"):
            messages.append({"role": "assistant", "content": response.content})
            if response.stop_reason == "pause_turn":
                continue
            results = []
            before = sum(1 for o in ops if o["kind"] == "ui.task")
            for block in response.content:
                if block.type != "tool_use":
                    continue
                result, err = _dispatch(db, user, block.name, dict(block.input or {}), ops)
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result, ensure_ascii=False, default=str), **({"is_error": True} if err else {})})
            if sum(1 for o in ops if o["kind"] == "ui.task") > before:
                # Page steps end the turn: the page must change before the agent can see what comes next.
                return "".join(b.text for b in response.content if b.type == "text").strip()
            messages.append({"role": "user", "content": results})
            continue
        return "".join(b.text for b in response.content if b.type == "text").strip()
    return "I stopped after several steps without finishing. Please narrow the request."


def _retry_delay(body: str) -> Optional[float]:
    """Seconds the provider asks to wait (Gemini free tier: "retryDelay": "7s" / "Please retry in 6.2s")."""
    import re

    m = re.search(r'retryDelay"?\s*:\s*"(\d+(?:\.\d+)?)s', body) or re.search(r"retry in (\d+(?:\.\d+)?)\s*s", body, re.I)
    return float(m.group(1)) if m else None


def _post_json(url: str, api_key: str, payload: Dict[str, Any], retry_on_rate_limit: bool = False) -> Dict[str, Any]:
    import time

    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}",
                                          "HTTP-Referer": "https://ecshape.org", "X-Title": "ECshape Studio"})
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")[:2000]
        if e.code in (401, 403):
            raise AgentUnavailable("The AI key was refused by the provider.", {"label": "settings", "href": "/studio/settings#ai-keys"})
        if e.code == 429:
            # Free Gemini keys allow a few requests per minute: one short wait, then a second try.
            delay = _retry_delay(body)
            if retry_on_rate_limit and (delay is None or delay <= 12):
                time.sleep(min(delay or 4.0, 12.0))
                return _post_json(url, api_key, payload, retry_on_rate_limit=False)
            if "quota" in body.lower() and "day" in body.lower():
                raise AgentUnavailable("The free daily quota of this AI key is used up. Try again tomorrow or add another key.",
                                       {"label": "settings", "href": "/studio/settings#ai-keys"})
            raise AgentUnavailable("The AI service is busy (rate limit). Try again in a minute.")
        logger.error("Agent EC provider error %s: %s", e.code, body[:300])
        raise AgentUnavailable(f"The AI service answered with an error ({e.code}).")
    except urllib.error.URLError:
        raise AgentUnavailable("The AI service could not be reached.")


def _run_openai_compatible(engine: Engine, db: Session, user: UserResponse, system_text: str, turns: List[Dict[str, str]], ops: List[Dict[str, Any]]) -> str:
    if not engine.base_url:
        raise AgentUnavailable("This AI key has no API address.", {"label": "settings", "href": "/studio/settings#ai-keys"})
    url = engine.base_url.rstrip("/") + "/chat/completions"
    messages: List[Dict[str, Any]] = [{"role": "system", "content": system_text}] + [{"role": t["role"], "content": t["content"]} for t in turns]
    tools = _openai_tools(engine.provider)
    google = engine.provider == "google"
    for _ in range(MAX_TOOL_ROUNDS):
        data = _post_json(url, engine.api_key, {"model": engine.model, "messages": messages, "tools": tools, "tool_choice": "auto"},
                          retry_on_rate_limit=google)
        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        calls = msg.get("tool_calls") or []
        if calls:
            # Gemini may attach thought signatures (extra_content) to its calls: they are sent back untouched.
            messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls})
            before = sum(1 for o in ops if o["kind"] == "ui.task")
            for i, call in enumerate(calls):
                fn = call.get("function") or {}
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                result, _err = _dispatch(db, user, fn.get("name", ""), args if isinstance(args, dict) else {}, ops)
                tool_msg: Dict[str, Any] = {"role": "tool", "tool_call_id": call.get("id") or f"call_{i}", "content": json.dumps(result, ensure_ascii=False, default=str)}
                if google:
                    tool_msg["name"] = fn.get("name", "")
                messages.append(tool_msg)
            if sum(1 for o in ops if o["kind"] == "ui.task") > before:
                return (msg.get("content") or "").strip()
            continue
        return (msg.get("content") or "").strip()
    return "I stopped after several steps without finishing. Please narrow the request."


# ------------------------------------------------------------------ entry point
def run_agent(db: Session, user: UserResponse, turns: List[Dict[str, str]], lang: str = "he",
              page: Optional[Dict[str, str]] = None, provider: Optional[str] = None) -> Dict[str, Any]:
    from app.services.ai_keys import all_engines

    engine = resolve_engine(db, user.id, provider) or next(iter(all_engines(db, [user.id])), None)  # e.g. the server's free Gemini key
    if not engine:
        raise AgentUnavailable("No AI key yet. Add one in Settings → AI keys.", {"label": "settings", "href": "/studio/settings#ai-keys"})

    context = f"Trainer: {user.full_name}. Interface language: {lang}. Today: {datetime.now().date().isoformat()}."
    if page:
        context += f"\nOpen page: {page.get('path', '')} — {page.get('title', '')}."
        if page.get("selection"):
            context += f"\nText the trainer selected:\n{page['selection'][:2000]}"
        if page.get("snapshot"):
            context += f"\nVisible page text (for context):\n{page['snapshot'][:9000]}"
        if page.get("elements"):
            context += f"\nInteractive elements on the page (ref, kind, name, state) — for do_on_page:\n{page['elements'][:10000]}"
    context = ROUTE_MAP + "\n\n" + context

    # QA #87: the expert skill(s) for this request (workout plan, menu, SEO, social content…) go into the instructions.
    from app.services import agent_skills

    last_user = next((t["content"] for t in reversed(turns) if t.get("role") == "user"), "")
    picked = agent_skills.pick(last_user, (page or {}).get("path"))
    skills_text = agent_skills.catalog_text()
    if picked:
        skills_text += "\n\nSkills loaded for this request (follow them):\n\n" + "\n\n".join(f"## Skill: {s['title']}\n{s['body']}" for s in picked)
    context = skills_text + "\n\n" + context

    # QA #99: when the chosen model fails (no credit, refused key, provider down…), the other connected models are
    # tried in turn, so the trainer gets an answer whenever any of their models works.
    engines = [engine] + [e for e in all_engines(db, [user.id]) if (e.provider, e.api_key, e.model) != (engine.provider, engine.api_key, engine.model)]
    first_error: Optional[AgentUnavailable] = None
    for i, eng in enumerate(engines[:5]):
        ops: List[Dict[str, Any]] = []
        try:
            if eng.provider == "anthropic":
                system = [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}, {"type": "text", "text": context}]
                messages: List[Dict[str, Any]] = [{"role": t["role"], "content": t["content"]} for t in turns]
                reply = _run_claude(eng, db, user, system, messages, ops)
            else:
                reply = _run_openai_compatible(eng, db, user, SYSTEM_PROMPT + "\n\n" + context, turns, ops)
        except AgentUnavailable as e:
            logger.warning("Agent EC: %s failed (%s), trying the next model", eng.label, e)
            first_error = first_error or e
            continue
        out: Dict[str, Any] = {"reply": reply, "actions": ops, "engine": eng.label}
        if i > 0:
            out["fallback_from"] = engine.label
        return out
    raise first_error or AgentUnavailable("The AI service could not be reached.")


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
            # QA #53: say why (no credit, model not allowed…) instead of a bare status code
            from app.services.ai_keys import provider_error_text
            raise AgentUnavailable(f"Claude answered with an error ({e.status_code}): {provider_error_text(e)}")
        except anthropic.APIConnectionError:
            raise AgentUnavailable("Claude could not be reached.")
    else:
        _post_json(engine.base_url.rstrip("/") + "/chat/completions", engine.api_key,
                   {"model": engine.model, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 8})
    return engine.label
