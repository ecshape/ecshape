"""Demo data for the ecshape-dev environment.

Runs only when DEV_DEMO_SEED=1 (never set on the production service) and only into an
empty database (no trainer yet). Demo passwords come from DEV_TRAINER_PASSWORD /
DEV_CLIENT_PASSWORD so the dev site never uses a password published in the repo.
"""
import json
import logging
import os
from pathlib import Path

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, MetaData, text

logger = logging.getLogger(__name__)
DATA_FILE = Path(__file__).with_name("demo_data.json")


def _password_for(role: str):
    from app.auth.utils import get_password_hash

    env = "DEV_TRAINER_PASSWORD" if role.upper() == "TRAINER" else "DEV_CLIENT_PASSWORD"
    raw = os.getenv(env)
    return get_password_hash(raw) if raw else None


def run_if_enabled(engine) -> None:
    if os.getenv("DEV_DEMO_SEED") != "1":
        return
    try:
        with engine.begin() as conn:
            has_trainer = conn.execute(text("select count(*) from users where upper(cast(role as text)) = 'TRAINER'")).scalar()
            if has_trainer:
                logger.info("dev seed: trainer already present, skipping")
                return
            data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            meta = MetaData()
            meta.reflect(conn)
            for table in meta.sorted_tables:
                rows = data.get(table.name)
                if not rows:
                    continue
                cols = set(table.c.keys())
                bools = {c.name for c in table.c if isinstance(c.type, Boolean)}
                stamps = {c.name for c in table.c if isinstance(c.type, DateTime)}
                days = {c.name for c in table.c if isinstance(c.type, Date) and not isinstance(c.type, DateTime)}
                clean = []
                for row in rows:
                    r = {k: v for k, v in row.items() if k in cols}
                    for b in bools & r.keys():
                        if r[b] is not None:
                            r[b] = bool(r[b])
                    for k in stamps & r.keys():
                        if isinstance(r[k], str):
                            r[k] = datetime.fromisoformat(r[k])
                    for k in days & r.keys():
                        if isinstance(r[k], str):
                            r[k] = date.fromisoformat(r[k][:10])
                    if table.name == "users":
                        r["hashed_password"] = _password_for(str(r.get("role", "")))
                        if not r["hashed_password"]:
                            continue  # no password configured: don't create a login nobody can use safely
                    clean.append(r)
                if clean:
                    conn.execute(table.insert(), clean)
                logger.info("dev seed: %s +%d", table.name, len(clean))
            if conn.dialect.name == "postgresql":
                for name, table in meta.tables.items():
                    if "id" in table.c:
                        conn.execute(text(
                            f"select setval(pg_get_serial_sequence('\"{name}\"','id'), "
                            f"coalesce((select max(id) from \"{name}\"),0)+1, false) "
                            f"where pg_get_serial_sequence('\"{name}\"','id') is not null"))
        logger.info("dev seed: done")
    except Exception as e:  # never block startup
        logger.error("dev seed failed: %s", e)
