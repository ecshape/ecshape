"""
One-time data backfill for v2 -> v3 meal correctness.

What this script fixes:
1) Populate/repair `MealPlanV2.start_date/end_date` so v3 day-view can choose the correct plan version.
2) Recompute `FoodOption.order_index` deterministically per macro category so "recommended" ordering is stable.

Run example (inside container):
  docker-compose exec elior-fitness python -m app.migrations.v2_to_v3_meals_data_backfill
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func

from app.database import SessionLocal
from app.models.meal_system import (
    MealPlanV2,
    MealSlot,
    FoodOption,
    ClientMealChoice,
    MealCompletionStatus,
)

logger = logging.getLogger(__name__)


def _normalize_day_start(dt: datetime) -> datetime:
    """
    Normalize an arbitrary datetime into naive UTC day-start (00:00:00).
    v2 stores dates as naive UTC at day start for completion statuses; meal choices
    may be at noon, so we normalize for consistent comparisons.
    """
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def backfill_food_option_order_indices(db) -> int:
    """
    Recompute FoodOption.order_index for every macro category.
    """
    updated = 0

    macro_category_ids = [
        row[0]
        for row in db.query(FoodOption.macro_category_id).distinct().all()
        if row[0] is not None
    ]

    for macro_category_id in macro_category_ids:
        foods = (
            db.query(FoodOption)
            .filter(FoodOption.macro_category_id == macro_category_id)
            .order_by(FoodOption.id.asc())
            .all()
        )

        for idx, food in enumerate(foods):
            if food.order_index != idx:
                food.order_index = idx
                updated += 1

    if updated:
        db.commit()
    return updated


def backfill_plan_date_ranges(db) -> int:
    """
    Populate/repair MealPlanV2.start_date/end_date using historical slot-based choices/completions.
    """
    updated_plans = 0
    plans = db.query(MealPlanV2).all()

    for plan in plans:
        needs_update = (
            plan.start_date is None
            or plan.end_date is None
            or (plan.start_date is not None and plan.end_date is not None and plan.start_date >= plan.end_date)
        )
        if not needs_update:
            continue

        slot_ids = [
            row[0]
            for row in db.query(MealSlot.id)
            .filter(MealSlot.meal_plan_id == plan.id)
            .all()
        ]
        if not slot_ids:
            continue

        # Prefer slot-based evidence (meal_slot_id is required for both completions and slot-based choices).
        choice_min = (
            db.query(func.min(ClientMealChoice.date))
            .filter(
                ClientMealChoice.client_id == plan.client_id,
                ClientMealChoice.meal_slot_id.in_(slot_ids),
            )
            .scalar()
        )
        choice_max = (
            db.query(func.max(ClientMealChoice.date))
            .filter(
                ClientMealChoice.client_id == plan.client_id,
                ClientMealChoice.meal_slot_id.in_(slot_ids),
            )
            .scalar()
        )

        completion_min = (
            db.query(func.min(MealCompletionStatus.date))
            .filter(
                MealCompletionStatus.client_id == plan.client_id,
                MealCompletionStatus.meal_slot_id.in_(slot_ids),
            )
            .scalar()
        )
        completion_max = (
            db.query(func.max(MealCompletionStatus.date))
            .filter(
                MealCompletionStatus.client_id == plan.client_id,
                MealCompletionStatus.meal_slot_id.in_(slot_ids),
            )
            .scalar()
        )

        evidence_min = min(
            [d for d in (choice_min, completion_min) if d is not None],
            default=None,
        )
        evidence_max = max(
            [d for d in (choice_max, completion_max) if d is not None],
            default=None,
        )

        if evidence_min is None or evidence_max is None:
            # Fallback: use plan creation day and assume a standard 7-day plan window.
            start_day = _normalize_day_start(plan.created_at or datetime.utcnow())
            end_day = start_day + timedelta(days=7)
        else:
            start_day = _normalize_day_start(evidence_min)
            # `end_date` in the v3 logic is treated as exclusive.
            end_day = _normalize_day_start(evidence_max) + timedelta(days=1)

        if plan.start_date is None:
            plan.start_date = start_day
        if plan.end_date is None or (plan.start_date and plan.end_date and plan.start_date >= plan.end_date):
            plan.end_date = end_day

        updated_plans += 1

    if updated_plans:
        db.commit()
    return updated_plans


def run() -> None:
    logger.info("Starting v2 -> v3 meals backfill...")
    db = SessionLocal()
    try:
        food_updates = backfill_food_option_order_indices(db)
        logger.info("Updated FoodOption.order_index rows: %s", food_updates)

        plan_updates = backfill_plan_date_ranges(db)
        logger.info("Updated MealPlanV2 rows: %s", plan_updates)

        logger.info("Backfill completed successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()

