"""Food-preferences intake and AI menu options through the chat (QA #134).

1. A new trainee gets a chat card from their coach: a short form (goal, diet such as kosher / vegetarian / vegan,
   allergies, likes / dislikes, what they like to eat at each meal, body data for the calorie target).
2. The answers are saved to the trainee's nutrition profile, then a menu is built: 4-5 interchangeable meals for each of
   breakfast / lunch / dinner / snack, made only of the coach's bank foods. An AI engine (the coach's keys, then the
   server keys, free Gemini first) picks the foods; quantities are always computed here from the bank values, so every
   meal fits the trainee's calorie and protein targets (their active meal plan's targets when they have one).
   Without any AI answer a rule-based builder makes the same structure.
3. The menu comes back as a chat card. The trainee can replace a whole meal or one product (quantity recomputed to
   keep the calories), then confirm: it becomes their meal plan.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy.orm import Session

from app.models.meal_system import MealBank, MealPlanV2

log = logging.getLogger(__name__)

SLOTS = ("breakfast", "lunch", "dinner", "snack")
SLOT_SHARE = {"breakfast": 0.25, "lunch": 0.35, "dinner": 0.28, "snack": 0.12}
SLOT_TIME = {"breakfast": "08:00", "lunch": "13:00", "dinner": "19:30", "snack": "16:30"}
OPTIONS_PER_SLOT = 5
GOALS = ("lose", "gain", "maintain", "recomp")
DIETS = ("kosher", "vegetarian", "vegan", "pescatarian", "gluten_free", "lactose_free")

SLOT_NAMES = {
    "he": {"breakfast": "ארוחת בוקר", "lunch": "ארוחת צהריים", "dinner": "ארוחת ערב", "snack": "נשנוש"},
    "en": {"breakfast": "Breakfast", "lunch": "Lunch", "dinner": "Dinner", "snack": "Snack"},
    "fr": {"breakfast": "Petit-déjeuner", "lunch": "Déjeuner", "dinner": "Dîner", "snack": "Collation"},
}
TEXTS = {
    "he": {
        "intake": "היי! כדי שאבנה לך תפריט שמתאים בדיוק לך, מלא/י את שאלון ההעדפות 🍽️",
        "menu": "התפריט שלך מוכן! 4-5 אפשרויות לכל ארוחה, בכמויות שמתאימות למטרה שלך. אפשר להחליף ארוחה או מוצר ואז לאשר.",
        "answered": "מילאתי את שאלון ההעדפות",
        "failed": "קיבלתי את התשובות שלך, אבנה לך את התפריט בקרוב.",
        "plan": "תפריט אישי",
        "option": "אפשרות",
    },
    "en": {
        "intake": "Hi! So I can build a menu that fits you exactly, please fill in your food preferences 🍽️",
        "menu": "Your menu is ready! 4-5 options for every meal, in amounts that fit your goal. Swap a meal or a product, then confirm.",
        "answered": "I filled in my food preferences",
        "failed": "Got your answers, I'll build your menu soon.",
        "plan": "Personal menu",
        "option": "Option",
    },
    "fr": {
        "intake": "Salut ! Pour te préparer un menu sur mesure, remplis tes préférences alimentaires 🍽️",
        "menu": "Ton menu est prêt ! 4-5 options par repas, en quantités adaptées à ton objectif. Remplace un repas ou un produit, puis confirme.",
        "answered": "J'ai rempli mes préférences alimentaires",
        "failed": "J'ai reçu tes réponses, je te prépare ton menu bientôt.",
        "plan": "Menu personnel",
        "option": "Option",
    },
}


def L(lang: Optional[str]) -> str:
    lang = (lang or "he")[:2]
    return lang if lang in TEXTS else "en"


def text(lang: Optional[str], key: str) -> str:
    return TEXTS[L(lang)][key]


# ------------------------------------------------------------------ answers

def clean_answers(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only known fields, bounded."""
    def s(v: Any, n: int = 400) -> str:
        return str(v or "").strip()[:n]

    def num(v: Any, lo: float, hi: float) -> Optional[float]:
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
        return f if lo <= f <= hi else None

    meals = raw.get("meals") if isinstance(raw.get("meals"), dict) else {}
    goal = raw.get("goal") if raw.get("goal") in GOALS else "maintain"
    diet = [d for d in (raw.get("diet") or []) if d in DIETS] if isinstance(raw.get("diet"), list) else []
    return {
        "goal": goal,
        "diet": diet,
        "allergies": s(raw.get("allergies")),
        "dislikes": s(raw.get("dislikes")),
        "likes": s(raw.get("likes")),
        "meals": {k: s(meals.get(k), 300) for k in SLOTS},
        "sex": raw.get("sex") if raw.get("sex") in ("male", "female") else None,
        "age": num(raw.get("age"), 12, 100),
        "height": num(raw.get("height"), 120, 230),
        "weight": num(raw.get("weight"), 30, 300),
        "activity": raw.get("activity") if raw.get("activity") in ("low", "moderate", "high") else "moderate",
        "notes": s(raw.get("notes"), 600),
    }


def save_profile(db: Session, client, answers: Dict[str, Any]) -> None:
    """Answers -> the trainee's nutrition profile (read by the coach's AI menu builder too)."""
    from app.models.meal_variants import ClientNutritionProfile
    from app.models.user import ClientProfile

    prefs = []
    if answers["diet"]:
        prefs.append("Diet: " + ", ".join(answers["diet"]))
    if answers["allergies"]:
        prefs.append("Allergies: " + answers["allergies"])
    if answers["dislikes"]:
        prefs.append("Doesn't eat / dislikes: " + answers["dislikes"])
    if answers["likes"]:
        prefs.append("Likes: " + answers["likes"])
    for k in SLOTS:
        if answers["meals"][k]:
            prefs.append(f"{k.capitalize()}: {answers['meals'][k]}")
    if answers["notes"]:
        prefs.append("Notes: " + answers["notes"])
    row = db.query(ClientNutritionProfile).filter(ClientNutritionProfile.client_id == client.id).first()
    if not row:
        row = ClientNutritionProfile(client_id=client.id, email=client.email, full_name=client.full_name, source="chat_intake")
        db.add(row)
    row.food_preferences = "\n".join(prefs)[:4000]
    row.raw_answers = json.dumps(answers, ensure_ascii=False)
    row.source = "chat_intake"
    prof = db.query(ClientProfile).filter(ClientProfile.user_id == client.id).first()
    if prof:
        goal_txt = {"lose": "Lose weight", "gain": "Gain weight / muscle", "maintain": "Maintain", "recomp": "Recomposition"}[answers["goal"]]
        if not prof.fitness_goals:
            prof.fitness_goals = goal_txt
        restr = ", ".join(answers["diet"] + ([answers["allergies"]] if answers["allergies"] else []))
        if restr:
            prof.dietary_restrictions = restr[:500]
        if answers["height"] and not prof.height:
            prof.height = int(answers["height"])


# ------------------------------------------------------------------ targets

def targets(db: Session, client_id: int, answers: Dict[str, Any]) -> Dict[str, int]:
    """Daily kcal / protein / carbs / fat: the trainee's active meal plan when it has targets, else computed
    (Mifflin-St Jeor x activity, adjusted for the goal)."""
    plan = (db.query(MealPlanV2).filter(MealPlanV2.client_id == client_id, MealPlanV2.is_active.is_(True))
            .order_by(MealPlanV2.id.desc()).first())
    if plan and plan.total_calories:
        kcal = int(plan.total_calories)
        p = int(plan.protein_target or kcal * 0.3 / 4)
        f = int(plan.fat_target or kcal * 0.27 / 9)
        c = int(plan.carb_target or max(0, (kcal - p * 4 - f * 9) / 4))
        return {"kcal": kcal, "p": p, "c": c, "f": f, "source": "plan"}  # type: ignore[dict-item]
    w = answers.get("weight") or 70.0
    h = answers.get("height") or 170.0
    a = answers.get("age") or 30.0
    sex_adj = {"male": 5, "female": -161}.get(answers.get("sex") or "", -78)
    bmr = 10 * w + 6.25 * h - 5 * a + sex_adj
    tdee = bmr * {"low": 1.4, "moderate": 1.55, "high": 1.75}[answers.get("activity") or "moderate"]
    goal = answers.get("goal") or "maintain"
    kcal = tdee * {"lose": 0.8, "gain": 1.12, "maintain": 1.0, "recomp": 0.95}[goal]
    kcal = int(round(max(1200, min(4500, kcal)) / 10) * 10)
    p = int(round(w * {"lose": 2.0, "recomp": 2.0, "gain": 1.8, "maintain": 1.6}[goal]))
    f = int(round(kcal * 0.27 / 9))
    c = int(round(max(50, (kcal - p * 4 - f * 9) / 4)))
    return {"kcal": kcal, "p": p, "c": c, "f": f, "source": "computed"}  # type: ignore[dict-item]


# ------------------------------------------------------------------ foods

MEAT = {"poultry", "beef", "veal_lamb", "deli"}
_KW = {
    "nonkosher": ["pork", "bacon", "ham", "shrimp", "prawn", "lobster", "crab", "shellfish", "calamari", "squid", "oyster",
                  "mussel", "clam", "חזיר", "בייקון", "שרימפס", "סרטן", "לובסטר", "קלמרי", "פירות ים", "צדפ"],
    "meat": ["chicken", "turkey", "beef", "steak", "lamb", "veal", "pork", "ham", "bacon", "sausage", "salami", "schnitzel",
             "עוף", "הודו", "בקר", "סטייק", "כבש", "עגל", "נקניק", "שניצל", "קבב", "המבורגר", "פרגית"],
    "fish": ["fish", "tuna", "salmon", "cod", "sardine", "tilapia", "דג", "טונה", "סלמון", "אמנון", "סרדין", "בקלה"],
    "dairy": ["milk", "cheese", "yogurt", "yoghurt", "cream", "whey", "butter", "cottage", "labneh", "kefir",
              "חלב", "גבינ", "יוגורט", "שמנת", "חמאה", "קוטג", "לבנה", "מעדן", "קפיר", "אשל", "מי גבינה"],
    "egg": ["egg", "omelet", "omelette", "ביצ", "חביתה"],
    "gluten": ["wheat", "bread", "pasta", "couscous", "bulgur", "barley", "rye", "seitan", "pita", "cracker", "flour",
               "noodle", "toast", "bagel", "לחם", "פסטה", "קוסקוס", "בורגול", "פיתה", "שעורה", "חיטה", "קמח", "לחמני",
               "טוסט", "בייגל", "קרקר", "פתיתים"],
    "honey": ["honey", "gelatin", "דבש", "ג'לטין"],
}


def _name(b: MealBank) -> str:
    return f"{b.name or ''} {b.name_hebrew or ''}".lower()


def _has(b: MealBank, key: str) -> bool:
    n = _name(b)
    return any(w in n for w in _KW[key])


def _tags(b: MealBank) -> List[str]:
    try:
        v = json.loads(b.tags or "[]")
        return [str(x).lower() for x in v] if isinstance(v, list) else []
    except ValueError:
        return []


def is_meat(b: MealBank) -> bool:
    return (b.food_group or "") in MEAT or _has(b, "meat")


def is_dairy(b: MealBank) -> bool:
    return (b.food_group or "") == "dairy" or _has(b, "dairy")


def macro(b: MealBank) -> str:
    v = str(getattr(b.macro_type, "value", b.macro_type) or "protein").lower()
    return v if v in ("protein", "carb", "fat") else "protein"


def is_portion(b: MealBank) -> bool:
    return str(getattr(b.measurement_type, "value", b.measurement_type) or "").endswith("portion")


def _words(t: str) -> List[str]:
    return [w for w in re.split(r"[\s,;./\n]+", (t or "").lower()) if len(w) >= 3]


def allowed(b: MealBank, answers: Dict[str, Any]) -> bool:
    d = set(answers.get("diet") or [])
    g = b.food_group or ""
    tags = _tags(b)
    if "vegan" in d and "vegan" not in tags and (is_meat(b) or g in ("fish", "dairy", "eggs") or _has(b, "fish") or _has(b, "dairy") or _has(b, "egg") or _has(b, "honey")):
        return False
    if "vegetarian" in d and (is_meat(b) or g == "fish" or _has(b, "fish")):
        return False
    if "pescatarian" in d and is_meat(b):
        return False
    if "kosher" in d and _has(b, "nonkosher"):
        return False
    if "gluten_free" in d and "gluten-free" not in tags and "gluten_free" not in tags and (g == "bread" or _has(b, "gluten")):
        return False
    if "lactose_free" in d and "lactose-free" not in tags and (g == "dairy" or _has(b, "dairy")):
        return False
    avoid = _words(answers.get("allergies", "")) + _words(answers.get("dislikes", ""))
    n = _name(b)
    return not any(w in n for w in avoid)


def food_pool(db: Session, trainer_id: int, answers: Dict[str, Any]) -> List[MealBank]:
    skip = {"fast_food", "restaurant", "sweets", "drinks", "ready_meals", "soups_sauces", "spices"}
    rows = (db.query(MealBank).filter(MealBank.created_by == trainer_id).order_by(MealBank.id).limit(600).all())
    return [b for b in rows if (b.food_group or "") not in skip and (b.calories or 0) > 0 and allowed(b, answers)]


# Preferred groups per meal and macro, best first.
PREF = {
    "breakfast": {"protein": ["eggs", "dairy", "protein_drinks", "legumes"], "carb": ["bread", "cereals", "fruit"],
                  "fat": ["nuts_seeds", "olives_avocado", "oils_dressings"]},
    "lunch": {"protein": ["poultry", "fish", "beef", "legumes", "eggs", "veal_lamb"], "carb": ["grains", "legumes", "bread", "cereals"],
              "fat": ["oils_dressings", "olives_avocado", "nuts_seeds"]},
    "dinner": {"protein": ["fish", "poultry", "eggs", "dairy", "legumes", "beef"], "carb": ["grains", "bread", "legumes", "cereals"],
               "fat": ["olives_avocado", "oils_dressings", "nuts_seeds"]},
    "snack": {"protein": ["dairy", "protein_drinks", "protein_powder", "eggs", "legumes"], "carb": ["fruit", "cereals", "bread", "snacks"],
              "fat": ["nuts_seeds", "olives_avocado"]},
}


def _ranked(pool: Sequence[MealBank], slot: str, mc: str) -> List[MealBank]:
    order = PREF[slot][mc]
    own = [b for b in pool if macro(b) == mc and (b.food_group or "") != "vegetables"]
    good = [b for b in own if (b.food_group or "") in order]
    # round-robin across groups so options differ (eggs, dairy, eggs, dairy… not five yogurts)
    lanes: Dict[str, List[MealBank]] = {}
    for b in sorted(good, key=lambda b: (order.index(b.food_group or ""), 0 if b.image_url else 1, b.id)):
        lanes.setdefault(b.food_group or "", []).append(b)
    mixed = [lane[i] for i in range(40) for lane in lanes.values() if i < len(lane)]
    # foods outside the meal's usual groups only when none fit (no banana with the salmon at lunch)
    return mixed or own


def _veg(pool: Sequence[MealBank]) -> List[MealBank]:
    return [b for b in pool if (b.food_group or "") == "vegetables"]


# ------------------------------------------------------------------ quantities

def _per(b: MealBank, k: str) -> float:
    v = {"kcal": b.calories, "p": b.protein, "c": b.carbs, "f": b.fat}[k]
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _round_amount(b: MealBank, units: float) -> float:
    """units = multiples of the bank unit (100 g or one portion)."""
    if is_portion(b):
        return max(0.5, min(6.0, round(units * 2) / 2))
    grams = max(10, min(450, round(units * 100 / 5) * 5))
    return grams / 100


def item(b: MealBank, units: float, lang: str) -> Dict[str, Any]:
    u = _round_amount(b, units)
    he = L(lang) == "he"
    qty = (f"{u:g} {'מנות' if he else 'portion' + ('s' if u != 1 else '')}" if is_portion(b) else f"{int(round(u * 100))} {'גרם' if he else 'g'}")
    return {
        "food_id": b.id, "name": b.name, "name_hebrew": b.name_hebrew, "macro": macro(b), "group": b.food_group,
        "units": u, "qty": qty, "image": b.image_url, "measurement_type": "per_portion" if is_portion(b) else "per_100g",
        "serving_size": b.serving_size,
        "kcal": round(_per(b, "kcal") * u), "p": round(_per(b, "p") * u, 1), "c": round(_per(b, "c") * u, 1), "f": round(_per(b, "f") * u, 1),
    }


def _sum(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {k: round(sum(i[k] for i in items), 1 if k != "kcal" else None) for k in ("kcal", "p", "c", "f")}  # type: ignore[call-overload]


def build_option(foods: List[MealBank], slot_t: Dict[str, float], lang: str, name: str = "") -> Optional[Dict[str, Any]]:
    """Quantities for one meal so it lands on the slot's kcal with its share of protein / carbs."""
    by = {mc: [b for b in foods if macro(b) == mc and (b.food_group or "") != "vegetables"] for mc in ("protein", "carb", "fat")}
    veg = [b for b in foods if (b.food_group or "") == "vegetables"]
    if not by["protein"] and not by["carb"]:
        return None
    units: Dict[int, float] = {}
    used = 0.0
    for b in veg[:1]:
        units[b.id] = 1.5 if not is_portion(b) else 1
        used += _per(b, "kcal") * units[b.id]
    if by["protein"]:
        b = by["protein"][0]
        per = _per(b, "p") or 1
        units[b.id] = max(0.3, slot_t["p"] / per) if _per(b, "p") >= 5 else max(0.5, slot_t["kcal"] * 0.35 / (_per(b, "kcal") or 1))
        if not is_portion(b):
            units[b.id] = min(units[b.id], 2.5)  # at most 250 g of the protein food; the carb food fills the rest
        used += _per(b, "kcal") * units[b.id]
    if by["carb"]:
        b = by["carb"][0]
        c_left = max(0.0, slot_t["c"] - sum(_per(x, "c") * units.get(x.id, 0) for x in foods))
        per = _per(b, "c") or 1
        units[b.id] = max(0.3, c_left / per) if c_left > 5 else max(0.3, slot_t["kcal"] * 0.25 / (_per(b, "kcal") or 1))
        used += _per(b, "kcal") * units[b.id]
    if by["fat"]:
        b = by["fat"][0]
        left = slot_t["kcal"] - used
        if left > 30:
            units[b.id] = left / (_per(b, "kcal") or 1)
            used += left
    total = sum(_per(b, "kcal") * units.get(b.id, 0) for b in foods)
    # keep the meal within ±10% of its budget
    if total > 0 and abs(total - slot_t["kcal"]) > slot_t["kcal"] * 0.1:
        k = slot_t["kcal"] / total
        units = {i: u * k for i, u in units.items()}
    items = [item(b, units[b.id], lang) for b in foods if b.id in units]
    if not items:
        return None
    he = L(lang) == "he"
    label = name or (", ".join(((i["name_hebrew"] if he and i["name_hebrew"] else i["name"]) for i in items if i["group"] != "vegetables")))
    return {"name": label[:120], "items": items, **_sum(items)}


def slot_targets(t: Dict[str, int]) -> Dict[str, Dict[str, float]]:
    return {s: {k: t[k] * SLOT_SHARE[s] for k in ("kcal", "p", "c", "f")} for s in SLOTS}


def _kosher_ok(foods: List[MealBank], answers: Dict[str, Any]) -> bool:
    return "kosher" not in (answers.get("diet") or []) or not (any(is_meat(b) for b in foods) and any(is_dairy(b) for b in foods))


def rule_options(pool: List[MealBank], slot: str, answers: Dict[str, Any], st: Dict[str, float], lang: str,
                 skip_protein: Sequence[int] = (), n: int = OPTIONS_PER_SLOT, offset: int = 0) -> List[Dict[str, Any]]:
    pro, carb, fat, veg = _ranked(pool, slot, "protein"), _ranked(pool, slot, "carb"), _ranked(pool, slot, "fat"), _veg(pool)
    pro = [b for b in pro if b.id not in skip_protein] or pro
    out: List[Dict[str, Any]] = []
    for i in range(n * 3):
        if len(out) >= n:
            break
        k = i + offset
        foods: List[MealBank] = []
        if pro:
            foods.append(pro[k % len(pro)])
        if carb:
            foods.append(carb[(k * 2 + 1) % len(carb)])
        if fat and slot != "snack":
            fats = [b for b in fat if _kosher_ok(foods + [b], answers)] or fat
            foods.append(fats[k % len(fats)])
        if veg and slot in ("lunch", "dinner"):
            foods.append(veg[k % len(veg)])
        if not _kosher_ok(foods, answers):
            foods = [b for b in foods if not is_dairy(b)]
        if not foods or any(set(o["_ids"]) == {b.id for b in foods} for o in out):
            continue
        opt = build_option(foods, st, lang)
        if opt:
            opt["_ids"] = [b.id for b in foods]
            out.append(opt)
    for o in out:
        o.pop("_ids", None)
    return out


# ------------------------------------------------------------------ AI composition

def _prompt(pool: List[MealBank], answers: Dict[str, Any], t: Dict[str, int], lang: str) -> str:
    lang_name = {"he": "Hebrew", "fr": "French"}.get(L(lang), "English")
    lines = [f"{b.id} | {b.name}{' / ' + b.name_hebrew if b.name_hebrew else ''} | {macro(b)} | {b.food_group or '-'}" for b in pool[:300]]
    return (
        "Compose meal options for a fitness trainee from the food list below.\n"
        f"Daily target: {t['kcal']} kcal, protein {t['p']} g. Goal: {answers['goal']}.\n"
        f"Diet: {', '.join(answers['diet']) or 'no special diet'}. Allergies: {answers['allergies'] or '-'}. "
        f"Doesn't eat: {answers['dislikes'] or '-'}. Likes: {answers['likes'] or '-'}.\n"
        + "".join(f"What they like for {k}: {answers['meals'][k] or '-'}\n" for k in SLOTS)
        + f"Notes: {answers['notes'] or '-'}\n\n"
        f"Make {OPTIONS_PER_SLOT} different options for each of: breakfast, lunch, dinner, snack.\n"
        "Rules:\n- Use ONLY ids from the list. Each option: 2-4 foods, one protein food and one carb food at least "
        "(a snack may be 2 foods), lunch and dinner may add one vegetable.\n"
        "- Respect the diet strictly (kosher: never meat with dairy in the same option).\n"
        "- Options of the same meal should really differ (different protein foods), and match what the trainee likes.\n"
        f"- Give every option a short appetising name in {lang_name} (max 40 chars).\n"
        "- Do NOT give quantities: they are computed afterwards.\n\n"
        'Answer with JSON only: {"breakfast": [{"name": str, "foods": [id, ...]}], "lunch": [...], "dinner": [...], "snack": [...]}\n\n'
        "Foods (id | name | macro | group):\n" + "\n".join(lines)
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


def ai_options(db: Session, trainer_id: int, pool: List[MealBank], answers: Dict[str, Any], t: Dict[str, int], lang: str) -> Tuple[Optional[Dict[str, List[Dict[str, Any]]]], Optional[str]]:
    try:
        from app.services.agent_draft import _complete
        from app.services.ai_keys import all_engines
        engines = all_engines(db, [trainer_id], prefer="google")  # Gemini has a free tier
    except Exception:  # pragma: no cover
        return None, None
    by_id = {b.id: b for b in pool}
    sts = slot_targets(t)
    prompt = _prompt(pool, answers, t, lang)
    for eng in engines[:3]:
        try:
            raw = _parse(_complete(eng, "You are a sports nutritionist. You answer with valid JSON only.", prompt, 5000)) or {}
        except Exception as e:  # provider down / refused key: next engine
            log.info("menu intake ai: %s failed: %s", getattr(eng, "label", "?"), e)
            continue
        out: Dict[str, List[Dict[str, Any]]] = {}
        for s in SLOTS:
            opts = []
            for o in (raw.get(s) or [])[:OPTIONS_PER_SLOT + 2]:
                if not isinstance(o, dict):
                    continue
                ids = []
                for f in o.get("foods") or []:
                    try:
                        fid = int(f)
                    except (TypeError, ValueError):
                        continue
                    if fid in by_id and fid not in ids:
                        ids.append(fid)
                foods = [by_id[i] for i in ids][:4]
                if not _kosher_ok(foods, answers):
                    foods = [b for b in foods if not is_dairy(b)]
                if not any(macro(b) in ("protein", "carb") for b in foods):
                    continue
                opt = build_option(foods, sts[s], lang, str(o.get("name") or "").strip()[:60])
                if opt:
                    opts.append(opt)
            out[s] = opts[:OPTIONS_PER_SLOT]
        if sum(len(v) for v in out.values()) >= len(SLOTS) * 3:
            return out, getattr(eng, "label", None)
    return None, None


def build_menu(db: Session, trainer_id: int, client_id: int, answers: Dict[str, Any], lang: str) -> Optional[Dict[str, Any]]:
    pool = food_pool(db, trainer_id, answers)
    if not pool:
        return None
    t = targets(db, client_id, answers)
    sts = slot_targets(t)
    ai, engine = ai_options(db, trainer_id, pool, answers, t, lang)
    slots = []
    for s in SLOTS:
        opts = list((ai or {}).get(s) or [])
        if len(opts) < OPTIONS_PER_SLOT:  # top up with rule-based options
            have = {tuple(sorted(i["food_id"] for i in o["items"])) for o in opts}
            for o in rule_options(pool, s, answers, sts[s], lang):
                if len(opts) >= OPTIONS_PER_SLOT:
                    break
                if tuple(sorted(i["food_id"] for i in o["items"])) not in have:
                    opts.append(o)
        if opts:
            slots.append({"key": s, "name": SLOT_NAMES[L(lang)][s], "time": SLOT_TIME[s], "kcal": round(sts[s]["kcal"]),
                          "p": round(sts[s]["p"]), "options": opts})
    if not slots:
        return None
    return {"name": text(lang, "plan"), "goal": answers["goal"], "targets": t, "lang": L(lang), "engine": engine, "slots": slots}


# ------------------------------------------------------------------ trainee edits

def _bank_rows(db: Session, trainer_id: int, ids: Sequence[int]) -> Dict[int, MealBank]:
    return {b.id: b for b in db.query(MealBank).filter(MealBank.id.in_(list(ids)), MealBank.created_by == trainer_id).all()}


def swap_item(db: Session, trainer_id: int, menu: Dict[str, Any], answers: Dict[str, Any], si: int, oi: int, ii: int) -> Dict[str, Any]:
    """Replace one product by the next fitting food of the same kind, keeping the item's calories."""
    slot = menu["slots"][si]
    opt = slot["options"][oi]
    cur = opt["items"][ii]
    pool = food_pool(db, trainer_id, answers)
    others = _bank_rows(db, trainer_id, [i["food_id"] for j, i in enumerate(opt["items"]) if j != ii])
    if cur.get("group") == "vegetables":
        cands = _veg(pool)
    else:
        cands = _ranked(pool, slot["key"], cur["macro"])
    cands = [b for b in cands if b.id != cur["food_id"] and b.id not in others and _kosher_ok(list(others.values()) + [b], answers)]
    if not cands:
        raise ValueError("no_alternative")
    n = int(cur.get("swaps") or 0)
    b = cands[n % len(cands)]
    kcal = cur["kcal"] or 100
    new = item(b, kcal / (_per(b, "kcal") or 1), menu.get("lang") or "he")
    new["swaps"] = n + 1
    opt["items"][ii] = new
    he = L(menu.get("lang")) == "he"
    if not opt.get("named"):
        opt["name"] = ", ".join(((i["name_hebrew"] if he and i["name_hebrew"] else i["name"]) for i in opt["items"] if i["group"] != "vegetables"))[:120]
    opt.update(_sum(opt["items"]))
    return menu


def swap_option(db: Session, trainer_id: int, menu: Dict[str, Any], answers: Dict[str, Any], si: int, oi: int) -> Dict[str, Any]:
    """Replace a whole meal by a new one built around a protein food not used in this meal's other options."""
    slot = menu["slots"][si]
    pool = food_pool(db, trainer_id, answers)
    used = [i["food_id"] for o in slot["options"] for i in o["items"] if i["macro"] == "protein"]
    sts = {k: v for k, v in slot_targets(menu["targets"])[slot["key"]].items()}
    n = int(slot.get("swaps") or 0) + 1
    fresh = rule_options(pool, slot["key"], answers, sts, menu.get("lang") or "he", skip_protein=used, n=1, offset=n * 3 + oi)
    if not fresh:
        raise ValueError("no_alternative")
    slot["options"][oi] = fresh[0]
    slot["swaps"] = n
    return menu


# ------------------------------------------------------------------ confirm -> meal plan

def plan_body(db: Session, trainer_id: int, menu: Dict[str, Any]) -> Dict[str, Any]:
    """The menu as a V3 complete plan: one meal slot per meal; each macro group lists the foods of every option
    (the option they belong to in the note), and the slot note lists the options with their quantities."""
    ids = {i["food_id"] for s in menu["slots"] for o in s["options"] for i in o["items"]}
    bank = _bank_rows(db, trainer_id, list(ids))
    t = menu["targets"]
    he = L(menu.get("lang")) == "he"
    opt_word = text(menu.get("lang"), "option")
    slots = []
    for s in menu["slots"]:
        cats: Dict[str, List[Dict[str, Any]]] = {"protein": [], "carb": [], "fat": []}
        seen: Dict[str, set] = {k: set() for k in cats}
        notes = []
        for oi, o in enumerate(s["options"]):
            notes.append(f"{opt_word} {oi + 1}: {o['name']} — " + ", ".join(
                f"{(i['name_hebrew'] if he and i['name_hebrew'] else i['name'])} {i['qty']}" for i in o["items"]))
            for i in o["items"]:
                mc = i["macro"] if i["macro"] in cats else "carb"
                if i["food_id"] in seen[mc]:
                    continue
                seen[mc].add(i["food_id"])
                b = bank.get(i["food_id"])
                cats[mc].append({
                    "name": i["name"], "name_hebrew": i.get("name_hebrew"),
                    "calories": int(b.calories or 0) if b else None, "protein": float(b.protein or 0) if b else None,
                    "carbs": float(b.carbs or 0) if b else None, "fat": float(b.fat or 0) if b else None,
                    "serving_size": i["qty"], "measurement_type": i["measurement_type"], "image_url": i.get("image"),
                    "notes": f"{opt_word} {oi + 1}",
                })
        slots.append({
            "name": s["name"], "time_suggestion": s.get("time"), "target_calories": s.get("kcal"),
            "target_protein": s.get("p"), "notes": "\n".join(notes)[:2000],
            "macro_categories": [{"macro_type": mc, "quantity_instruction": None, "food_options": foods}
                                 for mc, foods in cats.items() if foods],
        })
    return {"name": menu.get("name") or "Menu", "description": None, "number_of_meals": len(slots),
            "total_calories": t["kcal"], "protein_target": t["p"], "carb_target": t["c"], "fat_target": t["f"],
            "meal_slots": slots}


# ------------------------------------------------------------------ who gets the intake

def should_send_intake(db: Session, client) -> bool:
    """A new trainee (account under 30 days old) with a coach, no meal plan yet, and no intake sent before."""
    from app.models.chat import ChatMessage

    if not client or not client.trainer_id:
        return False
    created = client.created_at
    if created is not None:
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - created > timedelta(days=30):
            return False
    if db.query(MealPlanV2.id).filter(MealPlanV2.client_id == client.id, MealPlanV2.is_active.is_(True)).first():
        return False
    sent = (db.query(ChatMessage.id).filter(ChatMessage.client_id == client.id, ChatMessage.payload.isnot(None),
                                            ChatMessage.payload.like('%"kind": "nutrition_intake"%')).first())
    return not sent
