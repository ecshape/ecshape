"""Demo data for the ecshape-dev environment.

Runs only when DEV_DEMO_SEED=1 (never set on the production service) and only into an
empty database (no trainer yet). Demo passwords come from DEV_TRAINER_PASSWORD /
DEV_CLIENT_PASSWORD so the dev site never uses a password published in the repo.
"""
import json
import logging
import os
from pathlib import Path

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, MetaData, text

logger = logging.getLogger(__name__)
DATA_FILE = Path(__file__).with_name("demo_data.json")


def _password_for(role: str):
    from app.auth.utils import get_password_hash

    env = "DEV_TRAINER_PASSWORD" if role.upper() == "TRAINER" else "DEV_CLIENT_PASSWORD"
    raw = os.getenv(env)
    return get_password_hash(raw) if raw else None


DEMO_LIBRARY_LINKS = {
    "Bench Press": "Barbell_Bench_Press_-_Medium_Grip", "Incline Dumbbell Press": "Incline_Dumbbell_Press",
    "Overhead Press": "Standing_Military_Press", "Lateral Raise": "Side_Lateral_Raise",
    "Triceps Pushdown": "Triceps_Pushdown", "Pull-Up": "Pullups", "Barbell Row": "Bent_Over_Barbell_Row",
    "Biceps Curl": "Dumbbell_Bicep_Curl", "Back Squat": "Barbell_Squat", "Romanian Deadlift": "Romanian_Deadlift",
    "Walking Lunge": "Barbell_Walking_Lunge", "Plank": "Plank",
}


def _backfill_library_links(engine) -> None:
    """Idempotent: give the demo exercises their library demo frames."""
    try:
        with engine.begin() as conn:
            for name, lid in DEMO_LIBRARY_LINKS.items():
                conn.execute(text("update exercises set library_id = :l where name = :n and library_id is null"), {"l": lid, "n": name})
    except Exception as e:
        logger.error("dev seed backfill failed: %s", e)


def _backfill_food_photos(engine) -> None:
    """Idempotent: foods with no photo and a matching staple get its photo, credit and property tags.
    The trainer's own nutrition values are left untouched."""
    from app.services.food_library_service import match_staple, normalize_staple

    try:
        with engine.begin() as conn:
            rows = conn.execute(text("select id, name, name_hebrew from meal_bank where image_url is null and source is null")).fetchall()
            for row in rows:
                staple = match_staple(row.name, row.name_hebrew)
                if not staple:
                    continue
                item = normalize_staple(staple, "en")
                conn.execute(
                    text("update meal_bank set image_url = :img, image_credit = :credit, tags = :tags, fiber = coalesce(fiber, :fiber), "
                         "source = 'staple', source_id = :sid where id = :id"),
                    {"img": item["image_url"], "credit": json.dumps(item["image_credit"], ensure_ascii=False) if item["image_credit"] else None,
                     "tags": json.dumps(item["tags"]), "fiber": item["fiber"], "sid": item["source_id"], "id": row.id},
                )
    except Exception as e:
        logger.error("dev seed food photo backfill failed: %s", e)


def run_if_enabled(engine) -> None:
    if os.getenv("DEV_DEMO_SEED") != "1":
        return
    _run_seed(engine)
    _backfill_library_links(engine)
    _backfill_food_photos(engine)
    _backfill_demo_menu(engine)


def _run_seed(engine) -> None:
    try:
        with engine.begin() as conn:
            has_trainer = conn.execute(text("select count(*) from users where upper(cast(role as text)) = 'TRAINER'")).scalar()
            if has_trainer:
                logger.info("dev seed: trainer already present, skipping")
                return
            data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            meta = MetaData()
            meta.reflect(conn)
            for table in meta.sorted_tables:
                rows = data.get(table.name)
                if not rows:
                    continue
                cols = set(table.c.keys())
                bools = {c.name for c in table.c if isinstance(c.type, Boolean)}
                stamps = {c.name for c in table.c if isinstance(c.type, DateTime)}
                days = {c.name for c in table.c if isinstance(c.type, Date) and not isinstance(c.type, DateTime)}
                clean = []
                for row in rows:
                    r = {k: v for k, v in row.items() if k in cols}
                    for b in bools & r.keys():
                        if r[b] is not None:
                            r[b] = bool(r[b])
                    for k in stamps & r.keys():
                        if isinstance(r[k], str):
                            r[k] = datetime.fromisoformat(r[k])
                    for k in days & r.keys():
                        if isinstance(r[k], str):
                            r[k] = date.fromisoformat(r[k][:10])
                    if table.name == "users":
                        r["hashed_password"] = _password_for(str(r.get("role", "")))
                        if not r["hashed_password"]:
                            continue  # no password configured: don't create a login nobody can use safely
                    clean.append(r)
                if clean:
                    conn.execute(table.insert(), clean)
                logger.info("dev seed: %s +%d", table.name, len(clean))
            if conn.dialect.name == "postgresql":
                for name, table in meta.tables.items():
                    if "id" in table.c:
                        conn.execute(text(
                            f"select setval(pg_get_serial_sequence('\"{name}\"','id'), "
                            f"coalesce((select max(id) from \"{name}\"),0)+1, false) "
                            f"where pg_get_serial_sequence('\"{name}\"','id') is not null"))
        logger.info("dev seed: done")
    except Exception as e:  # never block startup
        logger.error("dev seed failed: %s", e)


# Default menu for the demo plan: meals created without foods show nothing to log.
DEMO_MENU_QTY = {"protein": "150g", "carb": "120g", "fat": "15g"}


def _backfill_demo_menu(engine) -> None:
    """Idempotent: every demo meal with no assigned foods gets protein / carb / fat options from the bank."""
    try:
        from sqlalchemy.orm import Session

        from app.models.meal_system import FoodOption, MacroCategory, MacroType, MealBank, MealPlanV2, MealSlot

        with Session(engine) as db:
            bank = db.query(MealBank).filter(MealBank.is_public == True).order_by(MealBank.id).all()  # noqa: E712
            by_macro = {m: [b for b in bank if b.macro_type == m] for m in (MacroType.PROTEIN, MacroType.CARB, MacroType.FAT)}
            changed = False
            demo_plans = {pid for (pid,) in db.query(MealPlanV2.id).filter(MealPlanV2.name.like("Demo%")).all()}
            for slot in db.query(MealSlot).filter(MealSlot.meal_plan_id.in_(demo_plans)).all() if demo_plans else []:
                if slot.macro_categories:
                    continue
                for i, (macro, foods) in enumerate(by_macro.items()):
                    if not foods:
                        continue
                    cat = MacroCategory(meal_slot_id=slot.id, macro_type=macro, quantity_instruction=DEMO_MENU_QTY[macro.value])
                    db.add(cat)
                    db.flush()
                    picks = [foods[(slot.id + k) % len(foods)] for k in range(min(3, len(foods)))]
                    for order, b in enumerate(dict((f.id, f) for f in picks).values()):
                        db.add(FoodOption(
                            macro_category_id=cat.id, name=b.name, name_hebrew=b.name_hebrew,
                            calories=int(round(b.calories or 0)), protein=b.protein, carbs=b.carbs, fat=b.fat,
                            serving_size=b.serving_size or "100g", measurement_type=b.measurement_type, order_index=order,
                        ))
                    changed = True
            if changed:
                db.commit()
                logger.info("dev seed: demo menu filled")
    except Exception as e:  # never block startup
        logger.error("dev seed menu backfill failed: %s", e)
