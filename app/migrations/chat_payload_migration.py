"""Additive migration: structured payload on chat messages (exercise requests, QA #42). Idempotent, never blocks startup."""
import logging

from sqlalchemy import inspect, text

from app.database import engine

logger = logging.getLogger(__name__)


def run_chat_payload_migration() -> None:
    try:
        insp = inspect(engine)
        if "chat_messages" not in insp.get_table_names():
            return
        if "payload" in {c["name"] for c in insp.get_columns("chat_messages")}:
            return
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE chat_messages ADD COLUMN payload TEXT"))
        logger.info("chat_messages: added payload")
    except Exception:  # never block startup on this
        logger.exception("Chat payload migration skipped")
