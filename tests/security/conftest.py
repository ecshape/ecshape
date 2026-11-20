"""Isolated app for the auth regression tests: throwaway SQLite DB, local (non-deployed) environment."""
import os
import sys
import tempfile
from pathlib import Path

import pytest

_TMP = tempfile.mkdtemp(prefix="ecshape-authtest-")
os.environ.update({
    "ENVIRONMENT": "development",
    "DATABASE_URL": f"sqlite:///{_TMP}/test.db",
    "PERSISTENT_PATH": _TMP,
    "AUTOMATIONS_ENABLED": "0",
})
for v in ("DEV_DEMO_SEED", "ALLOW_TEST_REGISTER", "ALLOW_PUBLIC_SIGNUP", "ALLOW_ADMIN_SETUP", "JWT_SECRET",
          "RAILWAY_ENVIRONMENT", "RAILWAY_PROJECT_ID", "RAILWAY_PUBLIC_DOMAIN", "PORT"):
    os.environ.pop(v, None)
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.auth import UserRole  # noqa: E402
from app.auth.utils import get_password_hash  # noqa: E402
from app.auth import throttle  # noqa: E402

PASSWORDS = {"trainer": "Trainer-Pass-9081", "client": "Client-Pass-4472", "client2": "Client2-Pass-1836",
             "admin": "Admin-Pass-5520"}


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        db = SessionLocal()
        try:
            if not db.query(User).filter(User.username == "t_trainer").first():
                t = User(username="t_trainer", email="t_trainer@example.com", full_name="T", role=UserRole.TRAINER,
                         hashed_password=get_password_hash(PASSWORDS["trainer"]), is_active=True)
                a = User(username="t_admin", email="t_admin@example.com", full_name="A", role=UserRole.ADMIN,
                         hashed_password=get_password_hash(PASSWORDS["admin"]), is_active=True)
                db.add_all([t, a]); db.commit()
                for name in ("client", "client2"):
                    db.add(User(username=f"t_{name}", email=f"t_{name}@example.com", full_name="C",
                                role=UserRole.CLIENT, trainer_id=t.id, is_active=True,
                                hashed_password=get_password_hash(PASSWORDS[name])))
                db.commit()
        finally:
            db.close()
        yield c


@pytest.fixture(autouse=True)
def _clean_throttle():
    throttle.reset_all()
    yield
    throttle.reset_all()


def login(c, who, password=None):
    r = c.post("/api/auth/login", json={"username": f"t_{who}", "password": password or PASSWORDS[who]})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def H(token):
    return {"Authorization": f"Bearer {token}"}
