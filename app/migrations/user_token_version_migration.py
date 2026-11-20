"""Additive migration: users.token_version (session revocation epoch). Idempotent, never blocks startup."""
import logging

from sqlalchemy import inspect, text

from app.database import engine

logger = logging.getLogger(__name__)


def run_user_token_version_migration() -> None:
    try:
        insp = inspect(engine)
        if "users" not in insp.get_table_names():
            return
        if "token_version" in {c["name"] for c in insp.get_columns("users")}:
            return
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"))
        logger.info("users: added token_version")
    except Exception:  # never block startup on this
        logger.exception("User token_version migration skipped")
