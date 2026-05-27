import logging
from typing import Dict, List
import os

from sqlalchemy import text

from app.database import engine

logger = logging.getLogger(__name__)

# Detect database type
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "")
IS_POSTGRESQL = SQLALCHEMY_DATABASE_URL.startswith("postgresql") if SQLALCHEMY_DATABASE_URL else False


def _table_info(table_name: str) -> List[Dict[str, object]]:
    """Return table info as a list of dicts - database-agnostic."""
    if IS_POSTGRESQL:
        query = text("""
            SELECT 
                column_name as name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = :table_name
            ORDER BY ordinal_position
        """)
        try:
            with engine.connect() as connection:
                # Set a statement timeout for this query (30 seconds)
                connection.execute(text("SET statement_timeout = '30s'"))
                result = connection.execute(query, {"table_name": table_name})
                return [
                    {
                        "name": row.name,
                        "type": row.data_type,
                        "notnull": row.is_nullable == "NO",
                        "dflt_value": row.column_default
                    }
                    for row in result
                ]
        except Exception as e:
            logger.error(f"Error fetching table info for {table_name}: {e}")
            raise
    else:
        # SQLite
        query = text(f"PRAGMA table_info('{table_name}')")
        with engine.connect() as connection:
            result = connection.execute(query)
            return [dict(row._mapping) for row in result]


def _column_exists(table_name: str, column_name: str) -> bool:
    """Check if column exists - optimized to avoid fetching all columns."""
    if IS_POSTGRESQL:
        # Use a direct query that only checks for the specific column - much faster
        query = text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = :table_name AND column_name = :column_name
            LIMIT 1
        """)
        try:
            with engine.connect() as connection:
                result = connection.execute(query, {"table_name": table_name, "column_name": column_name})
                return result.fetchone() is not None
        except Exception as e:
            logger.warning(f"Error checking column existence for {table_name}.{column_name}: {e}")
            # Fallback to table_info if direct query fails
            try:
                return any(col["name"] == column_name for col in _table_info(table_name))
            except Exception as fallback_error:
                logger.error(f"Fallback table_info also failed: {fallback_error}")
                # Assume column doesn't exist if we can't check
                return False
    else:
        # SQLite - use table_info
        return any(col["name"] == column_name for col in _table_info(table_name))


def _ensure_columns(table_name: str, columns: Dict[str, str]) -> None:
    """Add columns if they don't exist - database-agnostic."""
    with engine.begin() as connection:
        for column_name, column_type in columns.items():
            if not _column_exists(table_name, column_name):
                logger.info(
                    "Adding missing column '%s.%s' (%s)",
                    table_name,
                    column_name,
                    column_type,
                )
                # Map SQLite types to PostgreSQL types
                if IS_POSTGRESQL:
                    pg_type = column_type.replace("TEXT", "VARCHAR").replace("INTEGER", "INTEGER").replace("REAL", "REAL")
                    connection.execute(
                        text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {pg_type}")
                    )
                else:
                    connection.execute(
                        text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
                    )


def _ensure_client_meal_choice_nullable_columns() -> None:
    """
    Older databases created client_meal_choices_v2 with NOT NULL constraints on
    food_option_id and meal_slot_id. Custom foods introduced nullable columns,
    so we recreate the table when needed.
    """
    table_name = "client_meal_choices_v2"
    columns = _table_info(table_name)

    needs_rebuild = False
    for column in columns:
        if column["name"] in {"food_option_id", "meal_slot_id"} and column["notnull"]:
            needs_rebuild = True
            break

    if not needs_rebuild:
        return

    logger.info("Rebuilding %s table to allow nullable food_option_id and meal_slot_id", table_name)

    with engine.begin() as connection:
        # Create new table with desired schema
        if IS_POSTGRESQL:
            connection.execute(
                text(
                    """
CREATE TABLE IF NOT EXISTS client_meal_choices_v2_new (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL,
    food_option_id INTEGER,
    meal_slot_id INTEGER,
    date TIMESTAMP NOT NULL,
    quantity VARCHAR,
    photo_path VARCHAR,
    is_approved BOOLEAN,
    trainer_comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    custom_food_name VARCHAR,
    custom_calories REAL,
    custom_protein REAL,
    custom_carbs REAL,
    custom_fat REAL,
    FOREIGN KEY(client_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(food_option_id) REFERENCES food_options_v2(id) ON DELETE CASCADE,
    FOREIGN KEY(meal_slot_id) REFERENCES meal_slots_v2(id) ON DELETE CASCADE
)
"""
                )
            )
        else:
            connection.execute(
                text(
                    """
CREATE TABLE IF NOT EXISTS client_meal_choices_v2_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    food_option_id INTEGER,
    meal_slot_id INTEGER,
    date DATETIME NOT NULL,
    quantity VARCHAR,
    photo_path VARCHAR,
    is_approved BOOLEAN,
    trainer_comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    custom_food_name TEXT,
    custom_calories REAL,
    custom_protein REAL,
    custom_carbs REAL,
    custom_fat REAL,
    FOREIGN KEY(client_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(food_option_id) REFERENCES food_options_v2(id) ON DELETE CASCADE,
    FOREIGN KEY(meal_slot_id) REFERENCES meal_slots_v2(id) ON DELETE CASCADE
)
"""
            )
        )

        # Copy existing data
        connection.execute(
            text(
                """
INSERT INTO client_meal_choices_v2_new (
    id,
    client_id,
    food_option_id,
    meal_slot_id,
    date,
    quantity,
    photo_path,
    is_approved,
    trainer_comment,
    created_at,
    custom_food_name,
    custom_calories,
    custom_protein,
    custom_carbs,
    custom_fat
)
SELECT
    id,
    client_id,
    food_option_id,
    meal_slot_id,
    date,
    quantity,
    photo_path,
    is_approved,
    trainer_comment,
    created_at,
    custom_food_name,
    custom_calories,
    custom_protein,
    custom_carbs,
    custom_fat
FROM client_meal_choices_v2
"""
            )
        )

        # Replace old table
        connection.execute(text("DROP TABLE client_meal_choices_v2"))
        connection.execute(
            text("ALTER TABLE client_meal_choices_v2_new RENAME TO client_meal_choices_v2")
        )


def _ensure_meal_slot_targets() -> None:
    _ensure_columns(
        "meal_slots_v2",
        {
            "target_calories": "INTEGER",
            "target_protein": "REAL",
            "target_carbs": "REAL",
            "target_fat": "REAL",
        },
    )


def _ensure_measurement_type_columns() -> None:
    """Add measurement_type column to food_options_v2 and meal_bank tables"""
    # For SQLite, we need to handle enum differently
    if IS_POSTGRESQL:
        # PostgreSQL - use VARCHAR for enum (will be converted to enum type by SQLAlchemy)
        _ensure_columns(
            "food_options_v2",
            {
                "measurement_type": "VARCHAR(20) DEFAULT 'per_100g'",
            },
        )
        _ensure_columns(
            "meal_bank",
            {
                "measurement_type": "VARCHAR(20) DEFAULT 'per_100g'",
                "serving_size": "VARCHAR",
            },
        )
    else:
        # SQLite - use TEXT for enum
        _ensure_columns(
            "food_options_v2",
            {
                "measurement_type": "TEXT DEFAULT 'per_100g'",
            },
        )
        _ensure_columns(
            "meal_bank",
            {
                "measurement_type": "TEXT DEFAULT 'per_100g'",
                "serving_size": "TEXT",
            },
        )


def _ensure_meal_completion_table() -> None:
    with engine.begin() as connection:
        if IS_POSTGRESQL:
            # PostgreSQL syntax
            connection.execute(
                text(
                    """
CREATE TABLE IF NOT EXISTS meal_completion_status_v2 (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL,
    meal_slot_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completion_method VARCHAR(255),
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE(client_id, meal_slot_id, date),
    FOREIGN KEY(client_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(meal_slot_id) REFERENCES meal_slots_v2(id) ON DELETE CASCADE
)
"""
                )
            )
        else:
            # SQLite syntax
            connection.execute(
                text(
                """
CREATE TABLE IF NOT EXISTS meal_completion_status_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    meal_slot_id INTEGER NOT NULL,
    date DATETIME NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT 0,
    completion_method VARCHAR,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    UNIQUE(client_id, meal_slot_id, date),
    FOREIGN KEY(client_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(meal_slot_id) REFERENCES meal_slots_v2(id) ON DELETE CASCADE
)
"""
            )
        )


def run_meal_system_migrations() -> None:
    """
    Ensure the v2 meal-system tables contain the expected columns.

    SQLite's CREATE TABLE does not alter existing tables, so we patch
    missing columns here to keep legacy databases compatible.
    """
    try:
        _ensure_columns(
            "client_meal_choices_v2",
            {
                "custom_food_name": "TEXT",
                "custom_calories": "REAL",
                "custom_protein": "REAL",
                "custom_carbs": "REAL",
                "custom_fat": "REAL",
            },
        )
        _ensure_client_meal_choice_nullable_columns()
        _ensure_meal_slot_targets()
        _ensure_meal_completion_table()
        _ensure_measurement_type_columns()
    except Exception as exc:
        logger.error("Failed to run meal system migrations: %s", exc)
        raise

