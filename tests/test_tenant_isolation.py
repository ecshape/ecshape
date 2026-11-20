"""Cross-tenant authorization matrix (security audit 2026-11, docs/security/api-audit-2026-11.md).

Every row is an attack that used to succeed: trainer B or client B acting on tenant A's data, a client acting as
staff, or nobody at all. Each must now be refused (403/404/401). The owner checks make sure the fixes did not lock
out the legitimate user.
"""
import io

import pytest


def attacks(w):
    A, B = w.id["clA"], w.id["clB"]
    return [
        # users (F-01..F-03)
        ("clB", "PUT", f"/api/users/{B}", {"role": "ADMIN"}),
        ("trA", "PUT", f"/api/users/{A}", {"role": "TRAINER"}),
        ("trB", "POST", f"/api/users/clients/{A}/assign", None),
        ("trB", "GET", f"/api/users/{A}", None),
        # v2 workouts (F-04)
        ("trB", "GET", f"/api/v2/workouts/plans/{w.wplan}", None),
        ("trB", "PUT", f"/api/v2/workouts/days/{w.day}", {"name": "pwned"}),
        ("trB", "POST", f"/api/v2/workouts/days/{w.day}/exercises", {"workout_day_id": w.day, "exercise_id": w.exercise, "order_index": 1}),
        ("trB", "PUT", f"/api/v2/workouts/exercises/{w.wexercise}", {"notes": "pwned"}),
        ("trB", "DELETE", f"/api/v2/workouts/exercises/{w.wexercise}", None),
        ("trB", "PUT", f"/api/v2/workouts/sessions/{w.session}", {"notes": "pwned"}),
        ("clB", "POST", "/api/v2/workouts/set-completions", {"workout_exercise_id": w.wexercise, "set_number": 1}),
        ("trB", "GET", f"/api/v2/workouts/prs?client_id={A}", None),
        # v2 meals (F-04)
        ("trB", "POST", f"/api/v2/meals/macro-categories/{w.macro}/foods", {"name": "pwned"}),
        ("trB", "PUT", f"/api/v2/meals/foods/{w.food}", {"name": "pwned"}),
        ("trB", "DELETE", f"/api/v2/meals/foods/{w.food}", None),
        ("trB", "GET", f"/api/v2/meals/choices?client_id={A}", None),
        ("trB", "GET", f"/api/v2/meals/daily-macros?client_id={A}", None),
        ("trB", "POST", "/api/v2/meals/history", {"client_id": A, "date": "2026-11-20T10:00:00"}),
        ("trB", "GET", f"/api/v2/meals/history/average?client_id={A}", None),
        ("trB", "POST", "/api/v2/meals/plans", {"client_id": A, "name": "x", "number_of_meals": 1}),
        ("trB", "POST", "/api/v3/meals/plans", {"client_id": A, "name": "x", "number_of_meals": 1, "meal_slots": []}),
        # legacy routers (F-04, F-05)
        ("trB", "GET", f"/api/workouts/plans/{w.lplan}", None),
        ("trB", "PUT", f"/api/workouts/plans/{w.lplan}", {"name": "pwned"}),
        ("clB", "GET", f"/api/workouts/sessions/{w.lsession}", None),
        ("trB", "POST", "/api/workouts/plans", {"name": "x", "client_id": A}),
        ("trB", "PUT", f"/api/workouts/exercises/{w.exercise}", {"name": "pwned"}),
        ("trB", "GET", f"/api/meal-plans/{w.lmealplan}", None),
        ("clB", "PUT", f"/api/meal-plans/{w.lmealplan}", {"title": "pwned"}),
        ("trB", "POST", "/api/meal-plans/", {"client_id": A, "date": "2026-11-20"}),
        ("trA", "GET", "/api/nutrition/plans", None),  # unmounted
        # private media (F-08)
        ("trB", "GET", f"/api/files/media/progress_photos/{w.photo}", None),
        ("clB", "GET", f"/api/files/media/progress_photos/{w.photo}", None),
        ("trB", "DELETE", f"/api/files/media/progress_photos/{w.photo}", None),
        ("clB", "GET", "/api/files/debug/paths", None),
        # notifications + sockets (F-11, F-12)
        ("trB", "POST", "/api/notifications/", {"title": "Pay now", "message": "x", "type": "info", "recipient_id": A}),
        ("trB", "POST", f"/api/notifications/trigger/goal-check/{A}", None),
        (None, "POST", f"/api/ws/ws/test-notification/{A}", None),
        (None, "GET", "/api/ws/ws/stats", None),
        (None, "GET", f"/uploads/progress_photos/{w.photo}", None),  # F-10
    ]


def test_cross_tenant_attacks_are_refused(client, world):
    failures = []
    for who, method, url, body in attacks(world):
        headers = world.h[who] if who else {}
        r = client.request(method, url, headers=headers, json=body)
        if r.status_code < 400:
            failures.append(f"{who} {method} {url} -> {r.status_code} {r.text[:120]}")
    assert not failures, "Cross-tenant access succeeded:\n" + "\n".join(failures)


def test_trainer_listings_stay_in_tenant(client, world):
    users = client.get("/api/users/", headers=world.h["trB"]).json()
    assert {u["id"] for u in users} == {world.id["trB"], world.id["clB"]}
    trainers = client.get("/api/users/trainers", headers=world.h["trB"]).json()
    assert [t["id"] for t in trainers] == [world.id["trB"]]
    plans = client.get("/api/workouts/plans", headers=world.h["trB"]).json()
    assert all(p["trainer_id"] == world.id["trB"] for p in plans)


def test_owners_keep_access(client, world):
    h, A = world.h, world.id["clA"]
    assert client.get(f"/api/v2/workouts/plans/{world.wplan}", headers=h["trA"]).status_code == 200
    assert client.get(f"/api/v2/workouts/plans/{world.wplan}", headers=h["clA"]).status_code == 200
    assert client.put(f"/api/v2/meals/foods/{world.food}", headers=h["trA"], json={"notes": "ok"}).status_code == 200
    assert client.get(f"/api/v2/meals/daily-macros?client_id={A}", headers=h["trA"]).status_code == 200
    assert client.get(f"/api/workouts/plans/{world.lplan}", headers=h["clA"]).status_code == 200
    assert client.get(f"/api/meal-plans/{world.lmealplan}", headers=h["trA"]).status_code == 200
    for who in ("clA", "trA", "adm"):
        r = client.get(f"/api/files/media/progress_photos/{world.photo}", headers=h[who])
        assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg", who
    r = client.post("/api/notifications/", headers=h["trA"], json={"title": "hi", "message": "x", "type": "info", "recipient_id": A})
    assert r.status_code == 200
    assert client.put(f"/api/users/{world.id['clB']}", headers=h["adm"], json={"role": "CLIENT"}).status_code == 200


def test_polyglot_upload_is_not_served_as_html(client, world):
    """F-09: a JPEG/HTML polyglot named .html was stored as .html and served as text/html."""
    from PIL import Image
    buf = io.BytesIO(); Image.new("RGB", (8, 8), "red").save(buf, "JPEG")
    poly = buf.getvalue() + b"<html><script>alert(document.domain)</script></html>"
    r = client.post("/api/exercises/", headers=world.h["trB"], data={"exercise_json": '{"name":"poc","muscle_group":"chest"}'},
                    files={"image": ("poc.html", poly, "image/jpeg")})
    assert r.status_code in (200, 201), r.text
    name = r.json()["image_path"].replace("\\", "/").rsplit("/", 1)[-1]
    assert name.endswith(".jpg")
    served = client.get(f"/api/files/media/exercise_images/{name}")
    assert served.headers["content-type"].startswith("image/")


def test_video_url_must_be_http(client, world):
    r = client.post("/api/exercises/", headers=world.h["trA"], json={"name": "x", "muscle_group": "legs", "video_url": "javascript:alert(1)"})
    assert r.status_code in (400, 422)


@pytest.mark.parametrize("url,expected", [
    ("https://api.openai.com/v1", None),
    ("https://127.0.0.1/v1", "private"),
    ("https://169.254.169.254/latest", "private"),
    ("http://api.openai.com/v1", "https"),
])
def test_ssrf_guard_in_production(monkeypatch, url, expected):
    from app.services.url_safety import unsafe_reason
    monkeypatch.setenv("ENVIRONMENT", "production")
    reason = unsafe_reason(url)
    if expected is None:
        assert reason is None or "resolved" in reason  # offline CI cannot resolve DNS
    else:
        assert reason and expected in reason


def test_ai_rate_limit():
    from fastapi import HTTPException
    from app.services import rate_limit
    rate_limit.reset()
    for _ in range(rate_limit.LIMITS["ai"][0]):
        rate_limit.check("ai", 999)
    with pytest.raises(HTTPException) as e:
        rate_limit.check("ai", 999)
    assert e.value.status_code == 429
    rate_limit.reset()
