"""The ECShape nutrition table: every coach's default food bank.

``app/data/ecshape_table.json`` is Elior's table (1,343 foods in protein / carb / fat, per 100 g of the food as eaten,
protein drinks per 350 ml bottle). Each coach gets his own copy in ``meal_bank`` (``source="ecshape"``), so he can edit
values, add photos or delete rows like any of his foods; meals, swaps and the trainee's search use it first. The copy is
made once per coach (and again for new rows when ``version`` goes up); rows the coach deleted are not brought back.
Foods outside the table (built-in library, Israeli products, USDA, Open Food Facts) stay one search away.
"""
from __future__ import annotations

import json
import logging
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.meal_system import MacroType, MealBank, MeasurementType
from app.models.studio import SiteSetting

logger = logging.getLogger(__name__)

SOURCE = "ecshape"
_PATH = Path(__file__).resolve().parent.parent / "data" / "ecshape_table.json"
_lock = threading.Lock()
_done: set = set()  # (trainer_id, version) already checked in this process


@lru_cache(maxsize=1)
def table() -> Dict[str, Any]:
    return json.loads(_PATH.read_text(encoding="utf-8"))


def foods() -> List[Dict[str, Any]]:
    return table()["foods"]


def version() -> int:
    return int(table().get("version") or 1)


def _norm(value: Optional[str]) -> str:
    return " ".join((value or "").strip().lower().split())


def _marker_key(trainer_id: int) -> str:
    return f"ecshape_table:{trainer_id}"


def _row(food: Dict[str, Any], trainer_id: int) -> MealBank:
    bottle = food.get("per") == "bottle_350ml"
    return MealBank(
        name=food["en"] or food["he"],
        name_hebrew=food["he"],
        macro_type=MacroType(food["macro"]),
        calories=int(round(food["kcal"])),
        protein=float(food["protein"]),
        carbs=float(food["carbs"]),
        fat=float(food["fat"]),
        measurement_type=MeasurementType.PER_PORTION if bottle else MeasurementType.PER_100G,
        serving_size="1 bottle (350 ml)" if bottle else "100g",
        created_by=trainer_id,
        is_public=False,
        source=SOURCE,
        source_id=food["id"],
        food_group=food["group"],
    )


def ensure_for_trainer(db: Session, trainer_id: Optional[int]) -> int:
    """Copy the table into this coach's bank once. Returns how many foods were added (0 when already done)."""
    if not trainer_id:
        return 0
    v = version()
    if (trainer_id, v) in _done:
        return 0
    with _lock:
        if (trainer_id, v) in _done:
            return 0
        marker = db.query(SiteSetting).filter(SiteSetting.key == _marker_key(trainer_id)).first()
        if marker and int((marker.value or {}).get("version") or 0) >= v:
            _done.add((trainer_id, v))
            return 0
        try:
            added = _copy(db, trainer_id)
            value = {"version": v, "added": added}
            if marker:
                marker.value = value
            else:
                db.add(SiteSetting(key=_marker_key(trainer_id), value=value, updated_by=trainer_id))
            db.commit()
        except Exception:  # never break the page that asked for the bank
            db.rollback()
            logger.exception("ECShape table copy failed for trainer %s", trainer_id)
            return 0
        _done.add((trainer_id, v))
        if added:
            logger.info("ECShape table: %s foods added to trainer %s's bank", added, trainer_id)
        return added


def _copy(db: Session, trainer_id: int) -> int:
    mine = db.query(MealBank).filter(MealBank.created_by == trainer_id).all()
    have_ids = {m.source_id for m in mine if m.source == SOURCE}
    by_name: Dict[tuple, MealBank] = {}
    for m in mine:
        macro = getattr(m.macro_type, "value", m.macro_type)
        for n in (m.name_hebrew, m.name):
            if n:
                by_name.setdefault((_norm(n), macro), m)
    new: List[MealBank] = []
    for food in foods():
        if food["id"] in have_ids:
            continue
        own = by_name.get((_norm(food["he"]), food["macro"])) or by_name.get((_norm(food["en"]), food["macro"]))
        if own is not None:  # the coach already has this food: keep his values, just file it in its group
            if not own.food_group:
                own.food_group = food["group"]
            continue
        new.append(_with_photo(_row(food, trainer_id)))
    db.add_all(new)
    return len(new)


def _with_photo(item: MealBank) -> MealBank:
    """The built-in library's photo when the food is one of its staples (chicken breast, rice, banana…)."""
    try:
        from app.services.food_library_service import match_staple, staple_photo

        staple = match_staple(item.name_hebrew, item.name)
        if staple:
            url, credit = staple_photo(staple)
            if url:
                item.image_url = url
                item.image_credit = json.dumps(credit, ensure_ascii=False)
    except Exception:  # a photo is a bonus
        pass
    return item


def ensure_all_trainers(db: Session) -> int:
    from app.models.user import User
    from app.schemas.auth import UserRole

    total = 0
    for (uid,) in db.query(User.id).filter(User.role == UserRole.TRAINER).all():
        total += ensure_for_trainer(db, uid)
    return total
