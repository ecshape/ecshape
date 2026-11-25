"""QA #119-#123: private foods, coach menus built from the bank, automation channels / audience / activity."""


def _food(client, h, name, macro="protein", public=True):
    r = client.post("/api/v2/meals/meal-bank", headers=h, json={
        "name": name, "macro_type": macro, "calories": 100, "protein": 20, "carbs": 0, "fat": 2, "is_public": public})
    assert r.status_code == 201, r.text
    return r.json()


def _menu(foods):
    return {"name": "Cut 1800", "goal": "", "kcal": 1800, "p": 150, "c": 150, "f": 50,
            "slots": [{"name": "Breakfast", "time": "08:00", "kcal": 400, "cats": [{"macro": "protein", "qty": "200 g", "foods": foods}]}]}


def test_bank_food_is_never_public(client, world):
    item = _food(client, world.h["trA"], "QA119 chicken", public=True)
    assert item["is_public"] is False
    r = client.put(f"/api/v2/meals/meal-bank/{item['id']}", headers=world.h["trA"], json={"is_public": True})
    assert r.status_code == 200, r.text
    assert r.json()["is_public"] is False


def test_menus_crud_and_isolation(client, world):
    a = _food(client, world.h["trA"], "QA121 turkey")
    b = _food(client, world.h["trB"], "QA121 tofu B")
    r = client.post("/api/v3/meals/menus", headers=world.h["trA"], json=_menu([a["id"]]))
    assert r.status_code == 201, r.text
    menu = r.json()
    assert menu["slots"][0]["cats"][0]["foods"] == [a["id"]]

    # foods must come from the coach's own bank
    r = client.post("/api/v3/meals/menus", headers=world.h["trA"], json=_menu([b["id"]]))
    assert r.status_code == 400

    # other coach can't see, edit or delete it
    assert all(m["id"] != menu["id"] for m in client.get("/api/v3/meals/menus", headers=world.h["trB"]).json())
    assert client.put(f"/api/v3/meals/menus/{menu['id']}", headers=world.h["trB"], json=_menu([b["id"]])).status_code == 404
    assert client.delete(f"/api/v3/meals/menus/{menu['id']}", headers=world.h["trB"]).status_code == 404
    assert client.get("/api/v3/meals/menus", headers=world.h["clA"]).status_code == 403

    upd = _menu([a["id"]]) | {"name": "Cut 1700"}
    r = client.put(f"/api/v3/meals/menus/{menu['id']}", headers=world.h["trA"], json=upd)
    assert r.status_code == 200 and r.json()["name"] == "Cut 1700"
    assert client.delete(f"/api/v3/meals/menus/{menu['id']}", headers=world.h["trA"]).status_code == 204
    assert all(m["id"] != menu["id"] for m in client.get("/api/v3/meals/menus", headers=world.h["trA"]).json())


def test_whatsapp_without_connection_makes_a_task(client, world):
    from app.database import SessionLocal
    from app.models.user import ClientProfile
    db = SessionLocal()
    try:
        prof = db.query(ClientProfile).filter_by(user_id=world.id["clA"]).first()
        if not prof:
            prof = ClientProfile(user_id=world.id["clA"], trainer_id=world.id["trA"])
            db.add(prof)
        prof.phone = "050-123-4567"
        db.commit()
    finally:
        db.close()
    integ = client.get("/api/studio/automations/integrations", headers=world.h["trA"]).json()
    assert integ["whatsapp"]["connected"] is False
    r = client.post("/api/studio/automations", headers=world.h["trA"], json={
        "name": "QA123 wa", "trigger": "new_client", "config": {"hours": 100000, "client_ids": [world.id["clA"]]},
        "actions": [{"type": "whatsapp", "text": "Hi {first_name}"}], "enabled": False})
    assert r.status_code == 201, r.text
    auto = r.json()
    r = client.post(f"/api/studio/automations/{auto['id']}/run", headers=world.h["trA"])
    assert r.status_code == 200 and r.json()["fired"] == 1, r.text
    tasks = client.get("/api/studio/tasks", headers=world.h["trA"]).json()
    wa = [t for t in tasks if t["kind"] == "whatsapp"]
    assert wa and "https://wa.me/972501234567?text=Hi%20clA" in wa[0]["body"]
    act = client.get("/api/studio/automations/activity", headers=world.h["trA"]).json()
    assert act[0]["automation_id"] == auto["id"] and act[0]["result"][0]["mode"] == "manual"
    assert client.get("/api/studio/automations/activity", headers=world.h["trB"]).json() == [] or \
        all(x["automation_id"] != auto["id"] for x in client.get("/api/studio/automations/activity", headers=world.h["trB"]).json())
    stats = client.get("/api/studio/automations/stats", headers=world.h["trA"]).json()
    assert stats["fired_week"] >= 1 and len(stats["fired_14d"]) == 14


def test_audience_limits_trainees(client, world):
    r = client.post("/api/studio/automations", headers=world.h["trA"], json={
        "name": "QA123 nobody", "trigger": "new_client", "config": {"hours": 100000, "client_ids": [999999]},
        "actions": [{"type": "task", "title": "x"}], "enabled": False})
    auto = r.json()
    r = client.post(f"/api/studio/automations/{auto['id']}/test", headers=world.h["trA"])
    assert r.json()["matches"] == 0


def test_email_without_smtp_reports_error(client, world):
    integ = client.get("/api/studio/automations/integrations", headers=world.h["trA"]).json()
    assert integ["email"]["mode"] == ""
    r = client.put("/api/studio/automations/integrations/whatsapp", headers=world.h["trA"], json={"phone_number_id": "abc"})
    assert r.status_code in (400, 422)
