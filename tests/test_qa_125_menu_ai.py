"""QA #125: AI menu draft from the coach's bank and the trainee's preferences (never another coach's foods)."""
import json


def _food(client, h, name, macro, kcal=150):
    r = client.post("/api/v2/meals/meal-bank", headers=h, json={
        "name": name, "macro_type": macro, "calories": kcal, "protein": 20 if macro == "protein" else 2,
        "carbs": 25 if macro == "carb" else 1, "fat": 10 if macro == "fat" else 1})
    assert r.status_code == 201, r.text
    return r.json()


def _no_ai(monkeypatch):
    import app.services.ai_keys as keys
    monkeypatch.setattr(keys, "all_engines", lambda db, ids, prefer=None: [])


def test_rule_based_draft_uses_own_bank_and_skips_disliked(client, world, monkeypatch):
    _no_ai(monkeypatch)
    mine = [_food(client, world.h["trA"], n, m) for n, m in
            (("QA125 chicken", "protein"), ("QA125 tuna", "protein"), ("QA125 rice", "carb"), ("QA125 oats", "carb"), ("QA125 olive oil", "fat"))]
    other = _food(client, world.h["trB"], "QA125 tofu B", "protein")
    r = client.post("/api/v3/meals/menus/ai-draft", headers=world.h["trA"],
                    json={"client_id": world.id["clA"], "kcal": 1800, "meals": 4, "wishes": "no tuna", "lang": "en"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["engine"] is None
    menu = d["menu"]
    assert len(menu["slots"]) == 4 and menu["kcal"] == 1800
    ids = {f for s in menu["slots"] for c in s["cats"] for f in c["foods"]}
    assert other["id"] not in ids
    tuna = next(f for f in mine if "tuna" in f["name"])
    assert tuna["id"] not in ids
    # the draft can be saved as is
    r = client.post("/api/v3/meals/menus", headers=world.h["trA"], json=menu)
    assert r.status_code == 201, r.text


def test_ai_answer_is_filtered_to_own_foods(client, world, monkeypatch):
    import app.services.ai_keys as keys
    import app.services.menu_ai as menu_ai
    from app.services.ai_keys import Engine
    a = _food(client, world.h["trA"], "QA125b egg", "protein")
    b = _food(client, world.h["trB"], "QA125b steak B", "protein")
    monkeypatch.setattr(keys, "all_engines", lambda db, ids, prefer=None: [Engine("anthropic", "k", "m", None, "server")])
    seen = {}

    def fake(engine, prompt):
        seen["prompt"] = prompt
        return "Here:\n" + json.dumps({"name": "Lean", "goal": "cut", "kcal": 0, "p": 120, "c": 100, "f": 40, "slots": [
            {"name": "Breakfast", "time": "8:00", "kcal": 500, "cats": [{"macro": "protein", "qty": "3 eggs", "foods": [a["id"], b["id"], 999999]}]},
            {"name": "Ghost", "time": "12:00", "kcal": 400, "cats": [{"macro": "carb", "qty": "x", "foods": [b["id"]]}]},
        ]})
    monkeypatch.setattr(menu_ai, "_complete", fake)
    r = client.post("/api/v3/meals/menus/ai-draft", headers=world.h["trA"], json={"kcal": 2000, "meals": 3, "wishes": "kosher"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["engine"]
    assert d["menu"]["slots"] == [{"name": "Breakfast", "time": "", "kcal": 500, "cats": [{"macro": "protein", "qty": "3 eggs", "foods": [a["id"]]}]}]
    assert "QA125b steak B" not in seen["prompt"] and "kosher" in seen["prompt"]


def test_ai_draft_coaches_only_and_other_coach_client_ignored(client, world, monkeypatch):
    _no_ai(monkeypatch)
    assert client.post("/api/v3/meals/menus/ai-draft", headers=world.h["clA"], json={}).status_code == 403
    _food(client, world.h["trB"], "QA125c bread", "carb")
    r = client.post("/api/v3/meals/menus/ai-draft", headers=world.h["trB"], json={"client_id": world.id["clA"], "lang": "he"})
    assert r.status_code == 200, r.text
    assert r.json()["client"] is None  # clA belongs to trA: trB learns nothing about them
