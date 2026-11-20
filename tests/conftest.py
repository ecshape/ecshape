"""Test app on a throw-away SQLite database, with two tenants (trainer A + client A, trainer B + client B) and an
admin. Run: pytest tests/ (needs pytest + httpx; see tests/README)."""
import io
import os
import sys
import tempfile

import pytest

_TMP = tempfile.mkdtemp(prefix="ecshape-tests-")
os.environ.update({
    "ENVIRONMENT": "test",
    "DATABASE_URL": f"sqlite:///{_TMP}/test.db",
    "PERSISTENT_PATH": _TMP,
    "UPLOAD_DIR": os.path.join(_TMP, "uploads"),
    "JWT_SECRET": "test-secret-" + "x" * 32,
    "DEV_DEMO_SEED": "0",
})
os.environ.pop("PORT", None)
os.environ.pop("RAILWAY_PUBLIC_DOMAIN", None)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

PASSWORD = "Tenant-Test-Passw0rd!"


@pytest.fixture(scope="session")
def client():
    from app.main import app
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


class World:
    """Ids and auth headers of both tenants plus objects owned by tenant A."""


@pytest.fixture(scope="session")
def world(client):
    w = World()
    w.h = {}
    w.id = {}
    for name, role in [("adm", "ADMIN"), ("trA", "TRAINER"), ("trB", "TRAINER"), ("clA", "CLIENT"), ("clB", "CLIENT")]:
        r = client.post("/api/auth/register/test", json={
            "username": name, "email": f"{name}@example.com", "full_name": name, "role": role, "password": PASSWORD})
        assert r.status_code == 201, r.text
        w.id[name] = r.json()["id"]
        tok = client.post("/api/auth/login", json={"username": name, "password": PASSWORD}).json()["access_token"]
        w.h[name] = {"Authorization": f"Bearer {tok}"}
    for trainer, cl in (("trA", "clA"), ("trB", "clB")):
        r = client.post(f"/api/users/clients/{w.id[cl]}/assign", headers=w.h[trainer])
        assert r.status_code == 200, r.text

    # ---- tenant A objects
    r = client.post("/api/exercises/", headers=w.h["trA"], json={"name": "A squat", "muscle_group": "legs"})
    assert r.status_code in (200, 201), r.text
    w.exercise = r.json()["id"]
    r = client.post("/api/v2/workouts/plans", headers=w.h["trA"], json={"name": "A plan", "client_id": w.id["clA"]})
    assert r.status_code in (200, 201), r.text
    w.wplan = r.json()["id"]
    r = client.post(f"/api/v2/workouts/plans/{w.wplan}/days", headers=w.h["trA"],
                    json={"name": "Day 1", "workout_plan_id": w.wplan, "order_index": 0})
    assert r.status_code in (200, 201), r.text
    w.day = r.json()["id"]
    # (POST /days/{id}/exercises saves the row but answers 500 on main: its response model types `exercise` as a
    # dict. Pre-existing bug, so the row is written directly.)
    from app.database import SessionLocal as _SL
    from app.models.workout_system import WorkoutExerciseV2
    _db = _SL()
    try:
        we = WorkoutExerciseV2(workout_day_id=w.day, exercise_id=w.exercise, order_index=0, target_sets=3, target_reps="10", rest_seconds=90)
        _db.add(we); _db.commit(); w.wexercise = we.id
    finally:
        _db.close()
    r = client.post("/api/v2/workouts/sessions", headers=w.h["clA"], json={"workout_day_id": w.day, "started_at": "2026-11-20T10:00:00"})
    assert r.status_code in (200, 201), r.text
    w.session = r.json()["id"]

    # v2 meal plan with one slot / macro category / food option, written straight to the database
    from app.database import SessionLocal
    from app.models.meal_system import MealPlanV2, MealSlot, MacroCategory, FoodOption, MacroType
    db = SessionLocal()
    try:
        plan = MealPlanV2(client_id=w.id["clA"], trainer_id=w.id["trA"], name="A menu", number_of_meals=1, is_active=True)
        db.add(plan); db.flush()
        slot = MealSlot(meal_plan_id=plan.id, name="Breakfast", order_index=0); db.add(slot); db.flush()
        macro = MacroCategory(meal_slot_id=slot.id, macro_type=MacroType.PROTEIN); db.add(macro); db.flush()
        food = FoodOption(macro_category_id=macro.id, name="Eggs"); db.add(food); db.commit()
        w.mplan, w.macro, w.food = plan.id, macro.id, food.id
    finally:
        db.close()

    # legacy workout plan + session, legacy meal plan
    r = client.post("/api/workouts/plans", headers=w.h["trA"], json={"name": "legacy", "client_id": w.id["clA"]})
    assert r.status_code == 201, r.text
    w.lplan = r.json()["id"]
    r = client.post(f"/api/workouts/plans/{w.lplan}/sessions", headers=w.h["trA"], json={"name": "s1"})
    assert r.status_code == 201, r.text
    w.lsession = r.json()["id"]
    r = client.post("/api/meal-plans/", headers=w.h["trA"], json={"client_id": w.id["clA"], "date": "2026-11-20"})
    assert r.status_code == 200, r.text
    w.lmealplan = r.json()["id"]

    # progress photo of client A
    from PIL import Image
    buf = io.BytesIO(); Image.new("RGB", (16, 16), "blue").save(buf, "JPEG")
    r = client.post("/api/progress/weight", headers=w.h["clA"], data={"weight": "70"},
                    files={"photo": ("me.jpg", buf.getvalue(), "image/jpeg")})
    assert r.status_code == 201, r.text
    w.photo = r.json()["photo_path"]
    return w
