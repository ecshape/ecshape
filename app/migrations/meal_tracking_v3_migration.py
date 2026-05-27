"""
Meal Tracking V3 migrations.

Current V3 implementation is an API contract adapter over the existing V2 meal tables, so there are
no new V3-only tables yet.

This migration file exists to keep the parallel rollout workflow predictable and to allow future
V3 table/model additions without changing the startup migration wiring again.
"""

import logging

logger = logging.getLogger(__name__)


def run_meal_tracking_v3_migrations() -> None:
    # No-op for now.
    logger.info("Meal Tracking V3 migrations: no-op (adapter over Meal System V2 tables).")

