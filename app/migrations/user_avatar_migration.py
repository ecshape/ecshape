"""Additive migration: profile photo columns on users (avatar_url, avatar_path). Idempotent, never blocks startup."""
import logging

from sqlalchemy import inspect, text

from app.database import engine

logger = logging.getLogger(__name__)

COLUMNS = {"avatar_url": "VARCHAR(500)", "avatar_path": "VARCHAR(500)"}


def run_user_avatar_migration() -> None:
    try:
        insp = inspect(engine)
        if "users" not in insp.get_table_names():
            return
        existing = {c["name"] for c in insp.get_columns("users")}
        missing = {k: v for k, v in COLUMNS.items() if k not in existing}
        if not missing:
            return
        with engine.begin() as conn:
            for name, sqltype in missing.items():
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {sqltype}"))
        logger.info("users: added %s", ", ".join(missing))
    except Exception:  # never block startup on this
        logger.exception("User avatar migration skipped")
