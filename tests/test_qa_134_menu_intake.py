"""QA #134: food-preferences form in the chat -> AI menu options (4-5 per meal) -> swap a meal / product -> confirm."""
import json


def _food(client, h, name, macro, kcal, p, c, f, group=None):
    body = {"name": name, "macro_type": macro, "calories": kcal, "protein": p, "carbs": c, "fat": f}
    r = client.post("/api/v2/meals/meal-bank", headers=h, json=body)
    assert r.status_code == 201, r.text
    row = r.json()
    if group:
        from app.database import SessionLocal
        from app.models.meal_system import MealBank
        db = SessionLocal()
        try:
            db.query(MealBank).filter(MealBank.id == row["id"]).update({"food_group": group})
            db.commit()
        finally:
            db.close()
    return row


def _bank(client, h):
    rows = [
        ("Q134 chicken breast", "protein", 165, 31, 0, 3.6, "poultry"), ("Q134 salmon", "protein", 208, 20, 0, 13, "fish"),
        ("Q134 eggs", "protein", 155, 13, 1, 11, "eggs"), ("Q134 cottage cheese", "protein", 98, 11, 3, 4, "dairy"),
        ("Q134 lentils", "protein", 116, 9, 20, 0.4, "legumes"), ("Q134 tofu", "protein", 76, 8, 2, 4.8, "legumes"),
        ("Q134 rice", "carb", 130, 2.7, 28, 0.3, "grains"), ("Q134 whole bread", "carb", 247, 13, 41, 3.4, "bread"),
        ("Q134 oats", "carb", 389, 17, 66, 7, "cereals"), ("Q134 banana", "carb", 89, 1.1, 23, 0.3, "fruit"),
        ("Q134 quinoa", "carb", 120, 4.4, 21, 1.9, "grains"),
        ("Q134 olive oil", "fat", 884, 0, 0, 100, "oils_dressings"), ("Q134 almonds", "fat", 579, 21, 22, 50, "nuts_seeds"),
        ("Q134 avocado", "fat", 160, 2, 9, 15, "olives_avocado"), ("Q134 cucumber", "carb", 15, 0.7, 3.6, 0.1, "vegetables"),
    ]
    return {r[0]: _food(client, h, *r) for r in rows}


def _no_ai(monkeypatch):
    import app.services.ai_keys as keys
    monkeypatch.setattr(keys, "all_engines", lambda db, ids, prefer=None: [])


def _intake(client, world):
    r = client.post("/api/v2/chat/nutrition-intake/send", headers=world.h["trA"], json={"client_id": world.id["clA"], "lang": "en"})
    assert r.status_code == 201, r.text
    assert r.json()["card"]["kind"] == "nutrition_intake"
    return r.json()["id"]


def _menu_msg(client, world):
    r = client.get(f"/api/v2/chat/messages?client_id={world.id['clA']}", headers=world.h["clA"])
    if r.status_code != 200:
        r = client.get("/api/v2/chat/messages", headers=world.h["clA"])
    assert r.status_code == 200, r.text
    msgs = r.json() if isinstance(r.json(), list) else r.json().get("messages", [])
    cards = [m for m in msgs if (m.get("card") or {}).get("kind") == "menu_options"]
    assert cards, [m.get("card") for m in msgs]
    return cards[-1]


def test_vegan_kosher_answers_build_options_that_fit_targets(client, world, monkeypatch):
    _no_ai(monkeypatch)
    foods = _bank(client, world.h["trA"])
    mid = _intake(client, world)
    answers = {"goal": "lose", "diet": ["vegan", "kosher"], "allergies": "almonds", "dislikes": "", "likes": "",
               "meals": {"breakfast": "oats"}, "sex": "female", "age": 30, "height": 165, "weight": 65, "activity": "moderate"}
    r = client.post(f"/api/v2/chat/nutrition-intake/{mid}/answer", headers=world.h["clA"], json={"answers": answers})
    assert r.status_code == 200, r.text
    assert r.json()["card"]["kind"] == "nutrition_intake_reply"
    # answering twice is refused
    assert client.post(f"/api/v2/chat/nutrition-intake/{mid}/answer", headers=world.h["clA"], json={"answers": answers}).status_code == 409

    m = _menu_msg(client, world)
    menu = m["card"]["menu"]
    assert [s["key"] for s in menu["slots"]] == ["breakfast", "lunch", "dinner", "snack"]
    names = {i["name"] for s in menu["slots"] for o in s["options"] for i in o["items"]}
    for banned in ("Q134 chicken breast", "Q134 salmon", "Q134 eggs", "Q134 cottage cheese", "Q134 almonds"):
        assert banned not in names
    t = menu["targets"]
    assert 1300 <= t["kcal"] <= 2000
    for s in menu["slots"]:
        assert 1 <= len(s["options"]) <= 5
        for o in s["options"]:
            assert abs(o["kcal"] - s["kcal"]) <= s["kcal"] * 0.2, (s["key"], o)

    # swap a product: same kind of food, about the same calories
    r = client.post(f"/api/v2/chat/menu-options/{m['id']}/swap", headers=world.h["clA"], json={"slot": 1, "option": 0, "item": 0})
    assert r.status_code == 200, r.text
    # swap a whole meal
    r = client.post(f"/api/v2/chat/menu-options/{m['id']}/swap", headers=world.h["clA"], json={"slot": 0, "option": 1})
    assert r.status_code == 200, r.text
    # the coach cannot edit the trainee's menu
    assert client.post(f"/api/v2/chat/menu-options/{m['id']}/swap", headers=world.h["trA"], json={"slot": 0, "option": 0}).status_code == 403

    r = client.post(f"/api/v2/chat/menu-options/{m['id']}/accept", headers=world.h["clA"], json={"message": "ok"})
    assert r.status_code == 200, r.text
    assert r.json()["card"]["kind"] == "menu_reply"
    r = client.get(f"/api/v3/meals/plans/client/{world.id['clA']}", headers=world.h["trA"])
    if r.status_code == 200:
        body = r.json()
        plan = body[0] if isinstance(body, list) and body else body
        assert plan


def test_kosher_never_mixes_meat_and_dairy(monkeypatch):
    from app.services import menu_intake as mi

    class B:
        def __init__(self, i, name, macro, group, kcal=150):
            self.id, self.name, self.name_hebrew, self.food_group = i, name, None, group
            self.macro_type, self.calories, self.protein, self.carbs, self.fat = macro, kcal, 20, 10, 5
            self.measurement_type, self.image_url, self.tags, self.serving_size = "per_100g", None, None, None

    pool = [B(1, "chicken", "protein", "poultry"), B(2, "rice", "carb", "grains"), B(3, "cheese", "fat", "dairy"),
            B(4, "olive oil", "fat", "oils_dressings", 880)]
    ans = mi.clean_answers({"diet": ["kosher"]})
    opts = mi.rule_options(pool, "lunch", ans, {"kcal": 600, "p": 40, "c": 60, "f": 20}, "en")
    assert opts
    for o in opts:
        ids = {i["food_id"] for i in o["items"]}
        assert not ({1, 3} <= ids)


def test_ensure_sends_once_to_new_trainee(client, world, monkeypatch):
    r1 = client.post("/api/v2/chat/nutrition-intake/ensure", headers=world.h["clA"], json={"lang": "he"})
    assert r1.status_code == 200, r1.text
    r2 = client.post("/api/v2/chat/nutrition-intake/ensure", headers=world.h["clA"], json={"lang": "he"})
    assert r2.json()["sent"] is False
    assert client.post("/api/v2/chat/nutrition-intake/ensure", headers=world.h["trA"], json={}).json()["sent"] is False
