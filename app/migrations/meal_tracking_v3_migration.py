"""
Meal Tracking V3 migrations.

Handles additions to existing V2 tables for V3 features (meal variants).
New V3 tables are created by Base.metadata.create_all and need no migration here.
"""

import logging

from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)


def _ensure_nullable_column(engine, table_name: str, column_name: str, column_type: str, index: bool = False) -> None:
    """
    Add a nullable column if it's missing, and optionally index it.

    Deliberately nullable-only: ALTER TABLE ADD COLUMN ... NOT NULL without a DEFAULT is
    rejected on a non-empty table, and every migration here runs on every startup against
    databases that already have rows.
    """
    inspector = inspect(engine)

    existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
    if column_name in existing_columns:
        logger.info("Column %s.%s already exists", table_name, column_name)
    else:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))
        logger.info("Added column %s.%s (%s)", table_name, column_name, column_type)

    if not index:
        return

    # Re-inspect: the index list is stale if we just added the column.
    index_name = f"idx_{table_name}_{column_name}"
    existing_indexes = {idx["name"] for idx in inspect(engine).get_indexes(table_name)}
    if index_name in existing_indexes:
        logger.info("Index %s already exists", index_name)
        return

    with engine.begin() as conn:
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({column_name})"))
    logger.info("Created index %s", index_name)


def run_meal_tracking_v3_migrations(engine) -> None:
    """Run all V3 migrations. Must stay idempotent - this runs on every startup."""
    logger.info("Running Meal Tracking V3 migrations...")

    # Links a logged choice back to the MealVariantFood it came from, so the client UI can
    # tell variant-sourced rows apart from manually added custom foods.
    _ensure_nullable_column(
        engine,
        table_name="client_meal_choices_v2",
        column_name="meal_variant_food_id",
        column_type="INTEGER",
        index=True,
    )

    logger.info("Meal Tracking V3 migrations: ok")
