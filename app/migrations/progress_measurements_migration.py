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
                    # REAL in SQLite maps to REAL in PostgreSQL (both are floating point)
                    pg_type = column_type if column_type == "REAL" else column_type.replace("TEXT", "VARCHAR").replace("INTEGER", "INTEGER")
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


def run_progress_measurements_migration() -> None:
    """
    Ensure progress_entries table contains body measurement columns.
    This migration runs on EVERY startup to ensure schema matches models.
    """
    logger.info("=" * 60)
    logger.info("RUNNING PROGRESS MEASUREMENTS MIGRATION")
    logger.info("=" * 60)
    
    try:
        if not _table_exists("progress_entries"):
            logger.info("Table 'progress_entries' does not exist yet (will be created by SQLAlchemy)")
            logger.info("=" * 60)
            logger.info("✅ PROGRESS MEASUREMENTS MIGRATION COMPLETED (table will be created by SQLAlchemy)")
            logger.info("=" * 60)
            return
        
        # Add missing body measurement columns
        logger.info("Step 1: Adding missing body measurement columns...")
        
        try:
            _ensure_columns(
                "progress_entries",
                {
                    "chest": "REAL",
                    "waist": "REAL",
                    "hips": "REAL",
                    "thighs": "REAL",
                    "arms": "REAL",
                    "right_arm": "REAL",
                    "left_arm": "REAL",
                },
            )
        except Exception as e:
            logger.warning(f"Could not add body measurement columns to progress_entries: {e}")
        
        logger.info("=" * 60)
        logger.info("✅ PROGRESS MEASUREMENTS MIGRATION COMPLETED")
        logger.info("=" * 60)
        
    except Exception as exc:
        logger.error("=" * 60)
        logger.error("❌ FAILED TO RUN PROGRESS MEASUREMENTS MIGRATION")
        logger.error("=" * 60)
        logger.error(f"Error: {exc}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        # Don't raise - allow application to start even if migrations fail
        logger.warning("⚠️ Continuing startup despite migration errors...")

