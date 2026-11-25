"""QA #135: water tracker on the trainee's Today screen (+0.5 L per tap)."""


def test_water_adds_per_day_and_clamps(client, world):
    h = world.h["clA"]
    r = client.get("/api/check-ins/water?day=2026-11-24", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["ml"] == 0 and r.json()["goal_ml"] >= 2000 and r.json()["step_ml"] == 500
    for _ in range(3):
        r = client.post("/api/check-ins/water", headers=h, json={"day": "2026-11-24", "delta_ml": 500})
        assert r.status_code == 200, r.text
    assert r.json()["ml"] == 1500
    r = client.post("/api/check-ins/water", headers=h, json={"day": "2026-11-24", "delta_ml": -5000})
    assert r.json()["ml"] == 0
    client.post("/api/check-ins/water", headers=h, json={"day": "2026-11-24", "delta_ml": 500})
    # another day starts empty
    assert client.get("/api/check-ins/water?day=2026-11-25", headers=h).json()["ml"] == 0
    assert client.get("/api/check-ins/water?day=2026-11-24", headers=h).json()["ml"] == 500
    # coaches don't log water
    assert client.post("/api/check-ins/water", headers=world.h["trA"], json={"day": "2026-11-24", "delta_ml": 500}).status_code == 403
