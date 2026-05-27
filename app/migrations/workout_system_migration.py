import logging
from typing import Dict, List
import os

from sqlalchemy import text, inspect

from app.database import engine

logger = logging.getLogger(__name__)

# Detect database type
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "")
IS_POSTGRESQL = SQLALCHEMY_DATABASE_URL.startswith("postgresql") if SQLALCHEMY_DATABASE_URL else False


def _table_info(table_name: str) -> List[Dict[str, object]]:
    """Get table info - database-agnostic."""
    if IS_POSTGRESQL:
        query = text("""
            SELECT 
                column_name as name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_name = :table_name
            ORDER BY ordinal_position
        """)
        with engine.connect() as connection:
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
    else:
        # SQLite
        query = text(f"PRAGMA table_info('{table_name}')")
        with engine.connect() as connection:
            result = connection.execute(query)
            return [dict(row._mapping) for row in result]


def _column_exists(table_name: str, column_name: str) -> bool:
    """Check if column exists - database-agnostic."""
    if IS_POSTGRESQL:
        query = text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = :table_name AND column_name = :column_name
        """)
        with engine.connect() as connection:
            result = connection.execute(query, {"table_name": table_name, "column_name": column_name})
            return result.fetchone() is not None
    else:
        return any(column["name"] == column_name for column in _table_info(table_name))


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
                    pg_type = column_type.replace("TEXT", "VARCHAR").replace("INTEGER", "INTEGER")
                    connection.execute(
                        text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {pg_type}")
                    )
                else:
                    connection.execute(
                        text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
                    )


def _table_exists(table_name: str) -> bool:
    """Check if a table exists in the database - database-agnostic."""
    if IS_POSTGRESQL:
        query = text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = :table_name
        """)
        with engine.connect() as connection:
            result = connection.execute(query, {"table_name": table_name})
            return result.fetchone() is not None
    else:
        # SQLite
        query = text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=:table_name"
        )
        with engine.connect() as connection:
            result = connection.execute(query, {"table_name": table_name})
            return result.fetchone() is not None


def _make_column_nullable(table_name: str, column_name: str) -> None:
    """Make a column nullable - database-agnostic."""
    try:
        if not _table_exists(table_name):
            logger.debug(f"Table '{table_name}' does not exist, skipping nullable check for '{column_name}'")
            return
        
        table_info = _table_info(table_name)
        column = next((col for col in table_info if col["name"] == column_name), None)
        
        if not column:
            logger.debug(f"Column '{column_name}' does not exist in table '{table_name}', skipping")
            return
        
        # Check if already nullable
        is_nullable = not column.get("notnull", False)
        if is_nullable:
            logger.debug(f"Column '{table_name}.{column_name}' is already nullable ✓")
            return
        
        # Make nullable
        if IS_POSTGRESQL:
            logger.info(f"Making column '{table_name}.{column_name}' nullable in PostgreSQL...")
            try:
                with engine.begin() as connection:
                    # PostgreSQL supports ALTER COLUMN
                    connection.execute(
                        text(f"ALTER TABLE {table_name} ALTER COLUMN {column_name} DROP NOT NULL")
                    )
                logger.info(f"✅ Successfully made column '{table_name}.{column_name}' nullable")
            except Exception as e:
                logger.error(f"❌ Failed to make column '{table_name}.{column_name}' nullable: {e}")
                # Don't raise - continue with other migrations
        else:
            # SQLite doesn't support ALTER COLUMN, so we just log a warning
            logger.warning(f"⚠️ Column '{table_name}.{column_name}' is NOT NULL in SQLite but model allows NULL. "
                         f"SQLite doesn't support ALTER COLUMN, so this will be handled by the model's nullable=True")
    except Exception as e:
        logger.error(f"Error checking/making column '{table_name}.{column_name}' nullable: {e}")
        # Don't raise - continue with other migrations


def run_workout_system_migrations() -> None:
    """
    Ensure workout system tables contain expected columns for compatibility.
    This migration runs on EVERY startup to ensure schema matches models.
    Tables are created automatically by SQLAlchemy Base.metadata.create_all(),
    but we need to handle schema changes to existing tables.
    """
    logger.info("=" * 60)
    logger.info("RUNNING WORKOUT SYSTEM MIGRATIONS")
    logger.info("=" * 60)
    
    try:
        # Step 1: Add missing columns to existing tables
        logger.info("Step 1: Adding missing columns...")
        
        # Add group_name column to workout_exercises_v2
        try:
            _ensure_columns(
                "workout_exercises_v2",
                {
                    "group_name": "TEXT",
                },
            )
        except Exception as e:
            logger.warning(f"Could not add group_name to workout_exercises_v2: {e}")
        
        # Add muscle_group_id column to exercises table
        try:
            _ensure_columns(
                "exercises",
                {
                    "muscle_group_id": "INTEGER",
                },
            )
        except Exception as e:
            logger.warning(f"Could not add muscle_group_id to exercises: {e}")
        
        # Add image_path column to exercises table
        try:
            _ensure_columns(
                "exercises",
                {
                    "image_path": "TEXT",
                },
            )
        except Exception as e:
            logger.warning(f"Could not add image_path to exercises: {e}")

        # Add name_he column to muscle_groups table (Hebrew display name)
        try:
            _ensure_columns(
                "muscle_groups",
                {
                    "name_he": "TEXT",
                },
            )
        except Exception as e:
            logger.warning(f"Could not add name_he to muscle_groups: {e}")

        # Step 2: Make columns nullable to match model definitions
        logger.info("Step 2: Ensuring columns are nullable to match models...")
        
        # Make columns nullable in workout_exercises_v2 (PostgreSQL supports ALTER COLUMN)
        if _table_exists("workout_exercises_v2"):
            logger.info("Checking workout_exercises_v2 columns...")
            _make_column_nullable("workout_exercises_v2", "target_sets")
            _make_column_nullable("workout_exercises_v2", "target_reps")
            _make_column_nullable("workout_exercises_v2", "rest_seconds")
            _make_column_nullable("workout_exercises_v2", "group_name")
            _make_column_nullable("workout_exercises_v2", "target_weight")
            _make_column_nullable("workout_exercises_v2", "tempo")
            _make_column_nullable("workout_exercises_v2", "notes")
            _make_column_nullable("workout_exercises_v2", "video_url")
        else:
            logger.info("Table 'workout_exercises_v2' does not exist yet (will be created by SQLAlchemy)")
        
        # Make split_type nullable in workout_plans_v2
        if _table_exists("workout_plans_v2"):
            logger.info("Checking workout_plans_v2 columns...")
            _make_column_nullable("workout_plans_v2", "split_type")
        else:
            logger.info("Table 'workout_plans_v2' does not exist yet (will be created by SQLAlchemy)")
        
        logger.info("=" * 60)
        logger.info("✅ WORKOUT SYSTEM MIGRATIONS COMPLETED")
        logger.info("=" * 60)
        
    except Exception as exc:
        logger.error("=" * 60)
        logger.error("❌ FAILED TO RUN WORKOUT SYSTEM MIGRATIONS")
        logger.error("=" * 60)
        logger.error(f"Error: {exc}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        # Don't raise - allow application to start even if migrations fail
        # The tables will still be created by SQLAlchemy, just without the migrations
        logger.warning("⚠️ Continuing startup despite migration errors...")


