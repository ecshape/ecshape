"""Professional exercise library (free-exercise-db, public domain / Unlicense).

873 exercises with instructions, target muscles, equipment, level and two demo frames
(start / end position) served from the jsDelivr CDN. Trainers browse it and import
exercises into their own bank; imported rows keep `library_id` so the app can animate
the frames.
"""
import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.auth.utils import get_current_user
from app.database import get_db
from app.schemas.auth import UserResponse, UserRole

logger = logging.getLogger(__name__)
router = APIRouter()

DATA = Path(__file__).resolve().parent.parent / "data_library" / "exercises.json"
CDN = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises"

# library muscle -> bank muscle group. Built-in bank keys are lowercase (see staticMuscleGroups
# in ExerciseBank.tsx); anything else becomes a dynamic group (name, Hebrew name) stored as a slug.
STATIC_GROUP = {
    "chest": "chest", "shoulders": "shoulders", "triceps": "triceps", "biceps": "biceps",
    "lats": "back", "middle back": "back", "lower back": "back", "traps": "back",
    "abdominals": "core", "glutes": "glutes",
    "quadriceps": "legs", "hamstrings": "legs", "calves": "legs", "adductors": "legs", "abductors": "legs",
}
DYNAMIC_GROUP = {"forearms": ("Forearms", "אמות"), "neck": ("Neck", "צוואר")}


def frames(library_id: str) -> List[str]:
    return [f"{CDN}/{library_id}/0.jpg", f"{CDN}/{library_id}/1.jpg"]


@lru_cache(maxsize=1)
def _library() -> List[Dict]:
    items = json.loads(DATA.read_text(encoding="utf-8"))
    for e in items:
        e["frames"] = frames(e["id"])
        e["_hay"] = " ".join([e["name"], e.get("equipment") or "", *e.get("primaryMuscles", []), *e.get("secondaryMuscles", [])]).lower()
    return items


def _public(e: Dict) -> Dict:
    return {k: v for k, v in e.items() if not k.startswith("_")}


def _require_trainer(user: UserResponse):
    if user.role not in (UserRole.TRAINER, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Trainer access required")


@router.get("/facets")
def library_facets(user: UserResponse = Depends(get_current_user)):
    lib = _library()
    muscles: Dict[str, int] = {}
    equipment: Dict[str, int] = {}
    levels: Dict[str, int] = {}
    categories: Dict[str, int] = {}
    for e in lib:
        for m in e.get("primaryMuscles", []):
            muscles[m] = muscles.get(m, 0) + 1
        equipment[e.get("equipment") or "other"] = equipment.get(e.get("equipment") or "other", 0) + 1
        levels[e.get("level") or "beginner"] = levels.get(e.get("level") or "beginner", 0) + 1
        categories[e.get("category") or "strength"] = categories.get(e.get("category") or "strength", 0) + 1
    return {"total": len(lib), "muscles": muscles, "equipment": equipment, "levels": levels, "categories": categories}


@router.get("/sources")
def library_sources(user: UserResponse = Depends(get_current_user)):
    """Size of each searchable source (wger is null until its catalogue was downloaded once)."""
    from app.services import wger_service

    return {
        "library": len(_library()),
        "wger": wger_service.cached_count(),
        "wger_attribution": wger_service.ATTRIBUTION,
    }


def _search_wger(words, muscle, equipment, category, lang, offset, limit, db, user):
    from app.services import wger_service

    try:
        items = wger_service.catalog()
    except wger_service.WgerUnavailable:
        raise HTTPException(status_code=503, detail="wger.de is unreachable right now")
    res = []
    for e in items:
        if muscle and muscle not in e["primaryMuscles"]:
            continue
        if equipment and (e.get("equipment") or "other") != equipment:
            continue
        if category and e.get("category") != category:
            continue
        if words and not all(w in e["_hay"] for w in words):
            continue
        res.append(e)
    if words:
        res.sort(key=lambda e: (not any(n.lower().startswith(words[0]) for n in e["names"].values()), not e["frames"], len(e["name"])))
    imported = _imported_ids(db, user.id)
    page = [{**wger_service.localize(e, lang), "imported": e["id"] in imported} for e in res[offset: offset + limit]]
    return {"total": len(res), "items": page, "source": "wger", "catalog_total": len(items)}


@router.get("")
def search_library(
    q: Optional[str] = None,
    muscle: Optional[str] = None,
    equipment: Optional[str] = None,
    level: Optional[str] = None,
    category: Optional[str] = None,
    source: str = Query("library"),
    lang: str = Query("en"),
    offset: int = Query(0, ge=0),
    limit: int = Query(48, ge=1, le=200),
    user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_trainer(user)
    words = [w for w in (q or "").lower().split() if w]
    if source == "wger":
        lang = (lang or "en").lower()[:2]
        return _search_wger(words, muscle, equipment, category, lang if lang in ("en", "fr", "he", "de") else "en",
                            offset, limit, db, user)
    res = []
    for e in _library():
        if muscle and muscle not in e.get("primaryMuscles", []):
            continue
        if equipment and (e.get("equipment") or "other") != equipment:
            continue
        if level and e.get("level") != level:
            continue
        if category and e.get("category") != category:
            continue
        if words and not all(w in e["_hay"] for w in words):
            continue
        res.append(e)
    # exact-ish name matches first
    if words:
        res.sort(key=lambda e: (not e["name"].lower().startswith(words[0]), len(e["name"])))
    imported = _imported_ids(db, user.id)
    page = [{**_public(e), "imported": e["id"] in imported} for e in res[offset: offset + limit]]
    return {"total": len(res), "items": page}


@router.get("/browse")
def browse_library(
    q: Optional[str] = None,
    muscle: Optional[str] = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(48, ge=1, le=200),
    user: UserResponse = Depends(get_current_user),
):
    """Read-only browse of the built-in library for any signed-in user (trainee app "Explore")."""
    words = [w for w in (q or "").lower().split() if w]
    res = []
    for e in _library():
        if muscle and muscle not in e.get("primaryMuscles", []):
            continue
        if words and not all(w in e["_hay"] for w in words):
            continue
        res.append(e)
    if words:
        res.sort(key=lambda e: (not e["name"].lower().startswith(words[0]), len(e["name"])))
    return {"total": len(res), "items": [_public(e) for e in res[offset: offset + limit]]}


def _imported_ids(db: Session, user_id: int) -> set:
    try:
        rows = db.execute(text("select library_id from exercises where library_id is not null")).fetchall()
        return {r[0] for r in rows}
    except Exception:
        return set()


class ImportIn(BaseModel):
    ids: List[str] = Field(..., min_length=1, max_length=100)
    lang: Optional[str] = "en"  # wger names / instructions language (falls back to English)


@router.post("/import")
def import_from_library(payload: ImportIn, user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_trainer(user)
    from app.models.muscle_group import MuscleGroup
    from app.models.workout import Exercise

    by_id = {e["id"]: e for e in _library()}
    if any(i.startswith("wger:") for i in payload.ids):
        from app.services import wger_service

        try:
            for w in wger_service.catalog():
                by_id[w["id"]] = w
        except wger_service.WgerUnavailable:
            raise HTTPException(status_code=503, detail="wger.de is unreachable right now")
    already = _imported_ids(db, user.id)
    created, skipped = [], []
    groups = {g.name.lower(): g for g in db.query(MuscleGroup).all()}
    for lid in payload.ids:
        e = by_id.get(lid)
        if not e:
            continue
        if lid in already:
            skipped.append(lid)
            continue
        is_wger = lid.startswith("wger:")
        if is_wger:
            from app.services import wger_service

            e = wger_service.localize(e, (payload.lang or "en")[:2])
            e["frames"] = e.get("frames") or [None]
        muscle = (e.get("primaryMuscles") or ["other"])[0]
        group_id = None
        if is_wger and not e.get("primaryMuscles") and e.get("category") == "cardio":
            group_key = "cardio"
        elif muscle in STATIC_GROUP:
            group_key = STATIC_GROUP[muscle]
        else:
            en, he = DYNAMIC_GROUP.get(muscle, (muscle.title(), None))
            group = groups.get(en.lower())
            if not group:
                group = MuscleGroup(name=en, name_he=he, created_by=user.id)
                db.add(group)
                db.flush()
                groups[en.lower()] = group
            group_key, group_id = en.lower().replace(" ", "_"), group.id
        secondary = ", ".join(e.get("secondaryMuscles") or [])
        credit = None
        if is_wger:
            credit = f"{wger_service.ATTRIBUTION}" + (f", {e['license_author']}" if e.get("license_author") else "")
        ex = Exercise(
            name=e["name"][:200],
            description=" · ".join(x for x in [e.get("level"), e.get("mechanic"), e.get("force"), secondary and f"also: {secondary}", credit] if x),
            image_path=e["frames"][0],
            muscle_group=group_key,
            muscle_group_id=group_id,
            equipment_needed=e.get("equipment") or None,
            instructions="\n".join(e.get("instructions") or []),
            category=(e.get("category") or "strength").title(),
            created_by=user.id,
        )
        ex.library_id = lid
        db.add(ex)
        created.append(lid)
    db.commit()
    return {"created": len(created), "skipped": len(skipped)}


def ensure_library_column(engine) -> None:
    """Additive migration: exercises.library_id (works on SQLite and Postgres)."""
    try:
        cols = {c["name"] for c in inspect(engine).get_columns("exercises")}
        if "library_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE exercises ADD COLUMN library_id VARCHAR(120)"))
            logger.info("exercises.library_id added")
    except Exception as e:  # never block startup
        logger.error("library_id migration failed: %s", e)
