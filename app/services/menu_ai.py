"""AI menu builder (QA #125): a draft menu made only of the coach's own bank foods, shaped by a trainee's preferences.

The coach picks a trainee (optional), a calorie target, the number of meals and free-text wishes. The trainee's saved
answers (nutrition questionnaire, dietary restrictions, goals) are added to the prompt. The model answers with JSON
that references bank ids only; anything else is dropped. Without any AI key, or if every provider fails, a simple
rule-based builder makes the draft instead (and says so), so the button always gives the coach something to edit.
The result is a DRAFT: nothing is saved until the coach saves it in the editor.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.meal_system import MealBank
from app.models.user import ClientProfile, User

log = logging.getLogger(__name__)

MACROS = ("protein", "carb", "fat")
# Share of a meal's calories per macro group, used by the rule-based builder.
_SPLIT = {"protein": 0.4, "carb": 0.4, "fat": 0.2}
_DEFAULT_MEALS = {
    "he": ["ארוחת בוקר", "ארוחת ביניים", "ארוחת צהריים", "ארוחת מנחה", "ארוחת ערב", "ארוחת לילה"],
    "en": ["Breakfast", "Snack", "Lunch", "Afternoon", "Dinner", "Late snack"],
    "fr": ["Petit-déjeuner", "Collation", "Déjeuner", "Goûter", "Dîner", "En-cas du soir"],
}
_DEFAULT_TIMES = ["08:00", "10:30", "13:00", "16:30", "19:30", "21:30"]
# Everyday groups the rule-based builder prefers, best first (ECShape table food_group keys).
_STAPLES = {
    "protein": ["poultry", "eggs", "fish", "dairy", "legumes", "beef"],
    "carb": ["grains", "cereals", "bread", "fruit", "legumes", "vegetables"],
    "fat": ["nuts_seeds", "olives_avocado", "oils_dressings", "dairy"],
}
_SKIP_GROUPS = {"fast_food", "restaurant", "sweets", "snacks", "drinks", "ready_meals", "soups_sauces", "spices", "deli"}
_UNIT = {"he": ("גרם", "מנות"), "fr": ("g", "portions"), "en": ("g", "servings")}


def _macro(row: MealBank) -> str:
    v = getattr(row.macro_type, "value", row.macro_type) or "protein"
    return str(v).lower() if str(v).lower() in MACROS else "protein"


def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def trainee_context(db: Session, trainer_id: int, client_id: Optional[int]) -> Tuple[str, Optional[str]]:
    """What we know about the trainee's food preferences, as prompt lines. Returns (text, name)."""
    if not client_id:
        return "", None
    client = db.query(User).filter(User.id == client_id, User.trainer_id == trainer_id).first()
    if not client:
        return "", None
    lines: List[str] = []
    if getattr(client, "dietary_restrictions", None):
        lines.append(f"Dietary restrictions: {client.dietary_restrictions}")
    prof = db.query(ClientProfile).filter(ClientProfile.user_id == client_id).first()
    if prof:
        for label, val in (("Goals", prof.fitness_goals), ("Dietary restrictions", prof.dietary_restrictions),
                           ("Medical conditions", prof.medical_conditions)):
            if val and f"{label}: {val}" not in lines:
                lines.append(f"{label}: {val}")
    try:
        from app.models.meal_variants import ClientNutritionProfile  # optional table
        nut = db.query(ClientNutritionProfile).filter(ClientNutritionProfile.client_id == client_id).first()
    except Exception:  # pragma: no cover - table missing on very old databases
        nut = None
    if nut:
        for label, val in (("Food preferences", nut.food_preferences), ("Training times", nut.training_times),
                           ("Foods to add", nut.extra_foods), ("Foods that must stay", nut.must_keep_foods)):
            if val:
                lines.append(f"{label}: {str(val)[:600]}")
    return "\n".join(lines), client.full_name or client.username


def _bank(db: Session, trainer_id: int) -> List[MealBank]:
    return db.query(MealBank).filter(MealBank.created_by == trainer_id).order_by(MealBank.id).limit(400).all()


def _food_line(b: MealBank) -> str:
    unit = "portion" if str(getattr(b.measurement_type, "value", b.measurement_type) or "").endswith("portion") else "100g"
    he = f" / {b.name_hebrew}" if b.name_hebrew else ""
    return f"{b.id} | {b.name}{he} | {_macro(b)} | per {unit}: {int(_num(b.calories))} kcal, P{_num(b.protein):g} C{_num(b.carbs):g} F{_num(b.fat):g}"


def _prompt(foods: List[MealBank], kcal: int, meals: int, wishes: str, about: str, lang: str) -> str:
    lang_name = {"he": "Hebrew", "fr": "French"}.get(lang, "English")
    return (
        "Build a one-day meal plan (a 'menu') for a fitness coach's trainee.\n"
        f"Daily target: about {kcal} kcal, {meals} meals.\n"
        f"What we know about the trainee:\n{about or '(nothing saved)'}\n"
        f"Coach's wishes: {wishes or '(none)'}\n\n"
        "Rules:\n"
        "- Use ONLY foods from the bank below, referenced by their numeric id. Never invent foods.\n"
        "- Respect restrictions, allergies, dislikes and religious rules strictly (e.g. kosher: no meat with dairy in one meal).\n"
        "- Each meal has macro groups (protein / carb / fat). Each group lists 1-4 interchangeable foods (the trainee picks one)\n"
        "  and a quantity text for that group, e.g. '150 g cooked' or '2 slices'.\n"
        "- Spread calories sensibly; meal kcal values should add up to the daily target.\n"
        f"- Write every name, goal and quantity in {lang_name}.\n\n"
        "Answer with JSON only, no prose, exactly this shape:\n"
        '{"name": str, "goal": str, "kcal": int, "p": int, "c": int, "f": int, '
        '"slots": [{"name": str, "time": "HH:MM", "kcal": int, "cats": [{"macro": "protein|carb|fat", "qty": str, "foods": [id, ...]}]}]}\n\n'
        "Food bank (id | name | macro | values):\n" + "\n".join(_food_line(b) for b in foods)
    )


def _parse(raw: str) -> Optional[Dict[str, Any]]:
    m = re.search(r"\{.*\}", raw or "", re.S)
    if not m:
        return None
    try:
        out = json.loads(m.group(0))
    except ValueError:
        return None
    return out if isinstance(out, dict) else None


def _clamp_int(v: Any, lo: int, hi: int) -> int:
    try:
        return max(lo, min(hi, int(round(float(v)))))
    except (TypeError, ValueError):
        return lo


def clean_menu(raw: Dict[str, Any], foods: List[MealBank], fallback_name: str) -> Optional[Dict[str, Any]]:
    """Keep only valid structure and the coach's own food ids."""
    by_id = {b.id: b for b in foods}
    slots = []
    for s in (raw.get("slots") or [])[:10]:
        if not isinstance(s, dict):
            continue
        cats = []
        for c in (s.get("cats") or [])[:6]:
            if not isinstance(c, dict):
                continue
            ids = []
            for f in c.get("foods") or []:
                fid = _clamp_int(f, 0, 2**31 - 1)
                if fid in by_id and fid not in ids:
                    ids.append(fid)
            if not ids:
                continue
            macro = str(c.get("macro") or "").lower()
            if macro not in MACROS:
                macro = _macro(by_id[ids[0]])
            cats.append({"macro": macro, "qty": str(c.get("qty") or "")[:120], "foods": ids[:20]})
        if not cats:
            continue
        time = str(s.get("time") or "")
        slots.append({"name": (str(s.get("name") or "").strip() or f"{len(slots) + 1}")[:80],
                      "time": time if re.fullmatch(r"\d{2}:\d{2}", time) else "",
                      "kcal": _clamp_int(s.get("kcal"), 0, 5000), "cats": cats})
    if not slots:
        return None
    kcal = sum(s["kcal"] for s in slots) or _clamp_int(raw.get("kcal"), 0, 10000)
    return {"name": (str(raw.get("name") or "").strip() or fallback_name)[:160], "goal": str(raw.get("goal") or "")[:1000],
            "source": "ai", "kcal": min(kcal, 10000), "p": _clamp_int(raw.get("p"), 0, 1000),
            "c": _clamp_int(raw.get("c"), 0, 1500), "f": _clamp_int(raw.get("f"), 0, 600), "slots": slots}


def _words(text: str) -> List[str]:
    return [w for w in re.split(r"[\s,;./\n]+", (text or "").lower()) if len(w) >= 3]


def rule_menu(foods: List[MealBank], kcal: int, meals: int, wishes: str, about: str, lang: str, name: str) -> Optional[Dict[str, Any]]:
    """No-AI draft: avoid foods named in the restrictions / wishes after "no", "without", "לא", "בלי", "sans"."""
    avoid: List[str] = []
    for m in re.finditer(r"(?:\bno\b|without|allerg\w*|לא|בלי|ללא|אלרגי\w*|sans|pas de)\s+([^\n,.;]+)", f"{about}\n{wishes}".lower()):
        avoid += _words(m.group(1))
    ok = [b for b in foods if not any(w in f"{b.name} {b.name_hebrew or ''}".lower() for w in avoid)]
    def rank(b: MealBank, mc: str) -> Tuple[int, int, int]:
        order = _STAPLES[mc]
        g = (b.food_group or "")
        return (order.index(g) if g in order else len(order), 0 if b.image_url else 1, b.id)

    groups = {}
    for mc in MACROS:
        pool = [b for b in ok if _macro(b) == mc]
        staple = [b for b in pool if (b.food_group or "") not in _SKIP_GROUPS]
        ranked = sorted(staple or pool, key=lambda b: rank(b, mc))
        # round-robin across food groups so a day is not all chicken: poultry, eggs, fish, dairy, poultry, …
        by_group: Dict[str, List[MealBank]] = {}
        for f in ranked:
            by_group.setdefault(f.food_group or "", []).append(f)
        lanes = [v[:6] for v in by_group.values()]
        mixed = [lane[i] for i in range(6) for lane in lanes if i < len(lane)]
        groups[mc] = mixed[:24]
    if not any(groups.values()):
        return None
    names = _DEFAULT_MEALS.get(lang, _DEFAULT_MEALS["en"])
    per_meal = round(kcal / meals)
    slots = []
    p = c = f = 0.0
    for i in range(meals):
        cats = []
        for mc in MACROS:
            pool = groups[mc]
            if not pool:
                continue
            picks = [pool[(i * 2 + k) % len(pool)] for k in range(min(3, len(pool)))]
            picks = list({b.id: b for b in picks}.values())
            first = picks[0]
            target = per_meal * _SPLIT[mc]
            per = _num(first.calories)
            is_portion = str(getattr(first.measurement_type, "value", first.measurement_type) or "").endswith("portion")
            if per > 0:
                factor = target / per
                grams, portions = _UNIT.get(lang, _UNIT["en"])
                qty = (f"{max(0.5, round(factor * 2) / 2):g} {portions}" if is_portion else f"{int(round(factor * 100 / 10) * 10) or 10} {grams}")
                p += _num(first.protein) * factor
                c += _num(first.carbs) * factor
                f += _num(first.fat) * factor
            else:
                qty = ""
            cats.append({"macro": mc, "qty": qty, "foods": [b.id for b in picks]})
        slots.append({"name": names[i % len(names)], "time": _DEFAULT_TIMES[i % len(_DEFAULT_TIMES)], "kcal": per_meal, "cats": cats})
    return {"name": name, "goal": wishes[:1000], "source": "auto", "kcal": per_meal * meals,
            "p": int(p), "c": int(c), "f": int(f), "slots": slots}


def _complete(engine, prompt: str) -> str:
    from app.services.agent_draft import _complete as complete
    return complete(engine, "You are a sports nutritionist. You answer with valid JSON only.", prompt, 6000)


def generate_menu(db: Session, trainer_id: int, client_id: Optional[int], kcal: int, meals: int, wishes: str, lang: str) -> Dict[str, Any]:
    foods = _bank(db, trainer_id)
    if not foods:
        raise ValueError("empty_bank")
    about, who = trainee_context(db, trainer_id, client_id)
    base = {"he": "תפריט", "fr": "Menu"}.get(lang, "Menu")
    name = f"{base} · {who}" if who else f"{base} {kcal}"
    errors: List[str] = []
    try:
        from app.services.ai_keys import all_engines, provider_error_text
        engines = all_engines(db, [trainer_id])
    except Exception:  # pragma: no cover
        engines, provider_error_text = [], str  # type: ignore[assignment]
    prompt = _prompt(foods, kcal, meals, wishes, about, lang)
    for eng in engines[:3]:
        try:
            menu = clean_menu(_parse(_complete(eng, prompt)) or {}, foods, name)
        except Exception as e:  # provider down, refused key, bad model…: try the next engine
            errors.append(f"{eng.label}: {provider_error_text(e)}")
            log.info("menu ai: %s failed: %s", eng.label, e)
            continue
        if menu:
            return {"menu": menu, "engine": eng.label, "client": who}
        errors.append(f"{eng.label}: invalid answer")
    menu = rule_menu(foods, kcal, meals, wishes, about, lang, name)
    if not menu:
        raise ValueError("empty_bank")
    return {"menu": menu, "engine": None, "client": who, "errors": errors[:3]}
