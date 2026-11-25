"""QA #145: a trainee created by the coach can sign in (case / spaces / email). QA #140: library translations in the DB."""
from tests.conftest import PASSWORD


def test_coach_created_trainee_signs_in_like_on_a_phone(client, world):
    body = {"username": "dani.cohen", "email": "Dani.Cohen@Example.com", "full_name": "Dani Cohen",
            "password": "Strong-Pass-2026!", "role": "CLIENT"}
    r = client.post("/api/auth/register/client", headers=world.h["trA"], json=body)
    assert r.status_code == 201, r.text
    for login in ("dani.cohen", "Dani.cohen", " dani.cohen ", "DANI.COHEN", "dani.cohen@example.com", " Dani.Cohen@example.com"):
        res = client.post("/api/auth/login", json={"username": login, "password": "Strong-Pass-2026!"})
        assert res.status_code == 200, (login, res.text)
    assert client.post("/api/auth/login", json={"username": "dani.cohen", "password": "wrong-Pass-2026!"}).status_code == 401
    # a username differing only by case is still the same account for sign-up
    body2 = {**body, "username": "Dani.Cohen", "email": "other@example.com"}
    assert client.post("/api/auth/register/client", headers=world.h["trA"], json=body2).status_code == 400


def test_library_items_come_with_their_translation(client, world):
    from app.database import SessionLocal
    from app.models.translation_cache import TranslationCache
    from app.routers.exercise_library import _library
    from app.services.translate import _hash

    e = _library()[0]
    db = SessionLocal()
    try:
        db.query(TranslationCache).filter(TranslationCache.lang == "he",
                                          TranslationCache.src_hash.in_([_hash(e["name"]), _hash(e["instructions"][0])])).delete()
        db.add(TranslationCache(lang="he", src_hash=_hash(e["name"]), src=e["name"], text="שם בעברית"))
        db.add(TranslationCache(lang="he", src_hash=_hash(e["instructions"][0]), src=e["instructions"][0], text="שלב ראשון"))
        db.commit()
    finally:
        db.close()
    r = client.get(f"/api/exercise-library/item?library_id={e['id']}&lang=he", headers=world.h["clA"])
    assert r.status_code == 200, r.text
    tr = r.json()["i18n"]
    assert tr["lang"] == "he" and tr["name"] == "שם בעברית" and tr["instructions"][0] == "שלב ראשון"
    assert len(tr["instructions"]) == len(e["instructions"])
    page = client.get("/api/exercise-library/browse?limit=3&lang=he", headers=world.h["clA"]).json()["items"]
    assert all("i18n" in x for x in page)
    assert "i18n" not in client.get(f"/api/exercise-library/item?library_id={e['id']}", headers=world.h["clA"]).json()


def test_warm_all_translates_only_what_is_missing(monkeypatch):
    from app.database import SessionLocal
    from app.services import library_i18n, translate as tr

    calls = []

    def fake(db, uid, texts, lang, src="en"):
        calls.append((lang, len(texts)))
        return {"texts": [f"[{lang}] {t}" for t in texts], "translated": True}

    monkeypatch.setattr(tr, "translate", fake)
    monkeypatch.setattr(library_i18n, "_cached", lambda db, lang, texts: {t: t for t in list(texts)[3:]})
    out = library_i18n.warm_all(SessionLocal, pause=0)
    assert out == {"he": 3, "fr": 3} and calls == [("he", 3), ("fr", 3)]
