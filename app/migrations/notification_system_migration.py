"""
Notification system migrations: add client_id and event_type to notifications.
client_notification_settings table is created by SQLAlchemy create_all when the model is registered.
"""

import logging
import os
from typing import Dict, List

from sqlalchemy import text

from app.database import engine

logger = logging.getLogger(__name__)

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "")
IS_POSTGRESQL = SQLALCHEMY_DATABASE_URL.startswith("postgresql") if SQLALCHEMY_DATABASE_URL else False


def _table_info(table_name: str) -> List[Dict[str, object]]:
    if IS_POSTGRESQL:
        query = text("""
            SELECT column_name as name, data_type, is_nullable as notnull
            FROM information_schema.columns
            WHERE table_name = :table_name
            ORDER BY ordinal_position
        """)
        with engine.connect() as conn:
            result = conn.execute(query, {"table_name": table_name})
            return [{"name": row.name, "notnull": row.notnull == "NO"} for row in result]
    else:
        query = text(f"PRAGMA table_info('{table_name}')")
        with engine.connect() as conn:
            result = conn.execute(query)
            return [dict(row._mapping) for row in result]


def _column_exists(table_name: str, column_name: str) -> bool:
    if IS_POSTGRESQL:
        query = text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = :table_name AND column_name = :column_name
        """)
        with engine.connect() as conn:
            result = conn.execute(query, {"table_name": table_name, "column_name": column_name})
            return result.fetchone() is not None
    return any(c.get("name") == column_name for c in _table_info(table_name))


def _ensure_columns(table_name: str, columns: Dict[str, str]) -> None:
    with engine.begin() as conn:
        for col_name, col_type in columns.items():
            if not _column_exists(table_name, col_name):
                logger.info("Adding column %s.%s (%s)", table_name, col_name, col_type)
                if IS_POSTGRESQL:
                    pg_type = col_type.replace("TEXT", "VARCHAR")
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {pg_type}"))
                else:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))


def run_notification_system_migrations() -> None:
    logger.info("RUNNING NOTIFICATION SYSTEM MIGRATIONS")
    try:
        _ensure_columns(
            "notifications",
            {"client_id": "INTEGER", "event_type": "TEXT"},
        )
        logger.info("Notification system migrations completed")
    except Exception as e:
        logger.error("Notification system migrations failed: %s", e)
        raise
