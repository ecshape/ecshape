"""Regression tests for the 2026-11 authentication audit (docs/security/auth-audit-2026-11.md).
Run: python -m pytest tests/security -q
"""
import base64
import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from conftest import PASSWORDS, H, login
from app.auth import password_policy, throttle
from app.auth.utils import create_access_token
from app.database import SessionLocal
from app.models.user import User

ROOT = Path(__file__).resolve().parents[2]


def _b64(d):
    return base64.urlsafe_b64encode(json.dumps(d, separators=(",", ":")).encode()).rstrip(b"=").decode()


def _forge(payload, secret, alg="HS256"):
    h, p = _b64({"alg": alg, "typ": "JWT"}), _b64(payload)
    if alg == "none":
        return f"{h}.{p}."
    sig = hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
    return f"{h}.{p}." + base64.urlsafe_b64encode(sig).rstrip(b"=").decode()


def _uid(c, who):
    return c.get("/api/auth/me", headers=H(login(c, who))).json()["id"]


# ---------------------------------------------------------------- C1 arbitrary file read
@pytest.mark.parametrize("path", ["/%2e%2e/requirements.txt", "/..%2frequirements.txt",
                                  "/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
                                  "/%2e%2e/app/auth/config.py"])
def test_c1_spa_route_does_not_serve_files_outside_static(client, path):
    for method in ("get", "options"):
        r = getattr(client, method)(path)
        assert r.status_code == 404 or "fastapi" not in r.text and "root:" not in r.text and "JWT" not in r.text


# ---------------------------------------------------------------- C2 role / status mass assignment
def test_c2_client_cannot_promote_itself(client):
    t = login(client, "client")
    uid = client.get("/api/auth/me", headers=H(t)).json()["id"]
    for body in ({"role": "ADMIN"}, {"role": "TRAINER"}, {"is_active": True}):
        assert client.put(f"/api/users/{uid}", json=body, headers=H(t)).status_code == 403
    assert client.get("/api/auth/me", headers=H(t)).json()["role"] == "CLIENT"


def test_c2_trainer_cannot_change_client_role_but_can_deactivate(client):
    tt = login(client, "trainer")
    cid = _uid(client, "client2")
    assert client.put(f"/api/users/{cid}", json={"role": "TRAINER"}, headers=H(tt)).status_code == 403
    ct = login(client, "client2")
    assert client.put(f"/api/users/{cid}", json={"is_active": False}, headers=H(tt)).status_code == 200
    assert client.get("/api/auth/me", headers=H(ct)).status_code == 401  # deactivation ends the session
    assert client.put(f"/api/users/{cid}", json={"is_active": True}, headers=H(tt)).status_code == 200


def test_c2_admin_role_change_ends_old_sessions(client):
    at = login(client, "admin")
    cid = _uid(client, "client2")
    ct = login(client, "client2")
    assert client.put(f"/api/users/{cid}", json={"role": "TRAINER"}, headers=H(at)).status_code == 200
    assert client.get("/api/auth/me", headers=H(ct)).status_code == 401
    assert client.put(f"/api/users/{cid}", json={"role": "CLIENT"}, headers=H(at)).status_code == 200


# ---------------------------------------------------------------- C3 / H1 open bootstrap & signup endpoints
def test_c3_setup_admin_disabled_by_default(client):
    r = client.post("/api/auth/setup/admin", json={"username": "evil", "email": "evil@example.com",
                                                   "full_name": "x", "role": "ADMIN", "password": "Evil-Pass-77341"})
    assert r.status_code == 404


def test_h1_registered_users_list_removed(client):
    assert client.get("/api/auth/registered-users").status_code in (404, 405)


def test_anonymous_signup_disabled(client):
    r = client.post("/api/auth/register", json={"username": "anon", "email": "anon@example.com", "full_name": "x",
                                                "role": "CLIENT", "password": "Anon-Pass-77341"})
    assert r.status_code == 403


def test_register_test_endpoint_never_on_deployed_host(client, monkeypatch):
    monkeypatch.setenv("ALLOW_TEST_REGISTER", "1")
    monkeypatch.setenv("RAILWAY_PROJECT_ID", "x")
    r = client.post("/api/auth/register/test", json={"username": "x1", "email": "x1@example.com", "full_name": "x",
                                                     "role": "ADMIN", "password": "Xx-Pass-77341-a"})
    assert r.status_code == 404


# ---------------------------------------------------------------- C4 JWT
def test_c4_forged_and_malformed_tokens_rejected(client):
    uid = _uid(client, "client")
    future = int(time.time()) + 3600
    base = {"sub": str(uid), "exp": future, "iat": int(time.time()), "jti": "x", "tv": 0, "typ": "access",
            "iss": "ecshape-api", "aud": "ecshape-portal"}
    for tok in (_forge(base, "your-secret-key-here"), _forge(base, "", alg="none"),
                _forge({**base, "alg": "none"}, "", alg="none")):
        assert client.get("/api/auth/me", headers=H(tok)).status_code == 401


def test_c4_token_claims_are_enforced(client):
    uid = _uid(client, "client")
    good = create_access_token({"sub": str(uid)})
    assert client.get("/api/auth/me", headers=H(good)).status_code == 200
    # wrong type (e.g. a future reset / ws token) and expired tokens are refused
    assert client.get("/api/auth/me", headers=H(create_access_token({"sub": str(uid)}, typ="ws"))).status_code == 401
    from datetime import timedelta
    assert client.get("/api/auth/me", headers=H(create_access_token({"sub": str(uid)}, timedelta(seconds=-60)))).status_code == 401


def _run_config(env):
    full = {k: v for k, v in os.environ.items() if not k.startswith(("RAILWAY", "JWT_SECRET", "ENVIRONMENT"))}
    full.update(env)
    return subprocess.run([sys.executable, "-c", "import app.auth.config as c; print(len(c.JWT_SECRET))"],
                          cwd=ROOT, env=full, capture_output=True, text=True)


def test_c4_deployed_host_refuses_missing_or_placeholder_secret():
    assert _run_config({"RAILWAY_ENVIRONMENT": "production"}).returncode != 0
    assert _run_config({"RAILWAY_ENVIRONMENT": "production", "JWT_SECRET": "your-secret-key-here"}).returncode != 0
    assert _run_config({"ENVIRONMENT": "production", "JWT_SECRET": "short"}).returncode != 0
    ok = _run_config({"RAILWAY_ENVIRONMENT": "production", "JWT_SECRET": "k" * 20 + "Zq81-x0Pq_aa9Lmn4"})
    assert ok.returncode == 0, ok.stderr


def test_c4_algorithm_not_configurable():
    r = _run_config({"JWT_ALGORITHM": "none"})
    assert r.returncode == 0
    from app.auth.config import JWT_ALGORITHM
    assert JWT_ALGORITHM == "HS256"


# ---------------------------------------------------------------- C5 password reset
def test_c5_reset_token_forged_with_old_default_secret_rejected(client):
    tok = _forge({"sub": "t_client@example.com", "type": "password_reset", "exp": int(time.time()) + 600},
                 "your-reset-token-secret-key")
    r = client.post("/api/auth/password-reset/verify", json={"token": tok, "new_password": "Pwned-Pass-77341"})
    assert r.status_code == 400


def test_c5_reset_token_single_use_and_bound_to_password(client):
    from app.services.password_service import create_password_reset_token
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == "t_client").first()
        tok = create_password_reset_token(user)
    finally:
        db.close()
    old_session = login(client, "client")
    new = "Brand-New-Pass-6612"
    assert client.post("/api/auth/password-reset/verify", json={"token": tok, "new_password": new}).status_code == 200
    assert client.get("/api/auth/me", headers=H(old_session)).status_code == 401  # reset ends sessions
    assert client.post("/api/auth/password-reset/verify", json={"token": tok, "new_password": "Again-Pass-6612x"}).status_code == 400
    t = login(client, "client", new)
    assert client.post("/api/auth/password/change", json={"current_password": new, "new_password": PASSWORDS["client"]},
                       headers=H(t)).status_code == 200


def test_c5_reset_request_uniform_and_ignores_host(client):
    a = client.post("/api/auth/password-reset/request", json={"email": "t_client@example.com"},
                    headers={"Host": "evil.example"})
    b = client.post("/api/auth/password-reset/request", json={"email": "nobody@example.com"})
    assert a.status_code == b.status_code == 200 and a.json() == b.json()


def test_c5_reset_link_uses_configured_url_and_fragment(monkeypatch):
    from app.services import password_service as ps
    sent = {}

    class FakeSMTP:
        def __init__(self, *a, **k): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def starttls(self): pass
        def login(self, *a): pass
        def send_message(self, m): sent["body"] = m.as_string()

    monkeypatch.setattr(ps, "EMAIL_HOST", "smtp.test"); monkeypatch.setattr(ps, "EMAIL_USERNAME", "u")
    monkeypatch.setattr(ps, "EMAIL_PASSWORD", "p"); monkeypatch.setattr(ps.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setenv("PUBLIC_APP_URL", "https://ecshape.com")
    assert ps.send_password_reset_email("a@example.com", "TOKEN123")
    assert "https://ecshape.com/reset-password#token=TOKEN123" in sent["body"]
    monkeypatch.setenv("PUBLIC_APP_URL", "")
    assert not ps.send_password_reset_email("a@example.com", "TOKEN123")


# ---------------------------------------------------------------- H2 brute force / H3 sessions
def test_h2_account_lockout_after_failures(client):
    for _ in range(throttle.ACCOUNT_LIMIT):
        assert client.post("/api/auth/login", json={"username": "t_trainer", "password": "wrong-guess-1"}).status_code == 401
    r = client.post("/api/auth/login", json={"username": "t_trainer", "password": PASSWORDS["trainer"]})
    assert r.status_code == 429 and "retry-after" in {k.lower() for k in r.headers}


def test_h2_unknown_user_gets_same_answer_and_lockout(client):
    for _ in range(throttle.ACCOUNT_LIMIT):
        r = client.post("/api/auth/login", json={"username": "nobody_here", "password": "wrong-guess-1"})
        assert r.status_code == 401 and r.json()["detail"] == "Incorrect username or password"
    assert client.post("/api/auth/login", json={"username": "nobody_here", "password": "x"}).status_code == 429


def test_h2_per_ip_limit(client):
    hdr = {"X-Forwarded-For": "203.0.113.9"}
    for i in range(throttle.IP_LIMIT):
        client.post("/api/auth/login", json={"username": f"spray{i}", "password": "Spray-Pass-1"}, headers=hdr)
    r = client.post("/api/auth/login", json={"username": "t_client", "password": PASSWORDS["client"]}, headers=hdr)
    assert r.status_code == 429


def test_h2_login_timing_does_not_reveal_accounts(client):
    def median(u):
        ts = []
        for _ in range(5):
            s = time.perf_counter()
            client.post("/api/auth/login", json={"username": u, "password": "wrong-guess-1"})
            ts.append(time.perf_counter() - s)
            throttle.reset_all()
        return sorted(ts)[2]
    existing, missing = median("t_trainer"), median("nobody_zz")
    assert missing > existing * 0.5, (existing, missing)


def test_h3_logout_revokes_token(client):
    t = login(client, "client")
    assert client.post("/api/auth/logout", headers=H(t)).status_code == 204
    assert client.get("/api/auth/me", headers=H(t)).status_code == 401
    assert client.post("/api/auth/refresh", headers=H(t)).status_code == 401


def test_h3_password_change_ends_other_sessions_keeps_this_one(client):
    a, b = login(client, "client"), login(client, "client")
    new = "Another-Good-Pass-31"
    r = client.post("/api/auth/password/change", json={"current_password": PASSWORDS["client"], "new_password": new}, headers=H(a))
    assert r.status_code == 200
    fresh = r.json()["access_token"]
    assert client.get("/api/auth/me", headers=H(a)).status_code == 401
    assert client.get("/api/auth/me", headers=H(b)).status_code == 401
    assert client.get("/api/auth/me", headers=H(fresh)).status_code == 200
    assert client.post("/api/auth/password/change", json={"current_password": new, "new_password": PASSWORDS["client"]},
                       headers=H(fresh)).status_code == 200


def test_h3_trainer_reset_ends_client_sessions(client):
    ct = login(client, "client2")
    tt = login(client, "trainer")
    cid = _uid(client, "client2")
    new = "Coach-Set-Pass-8842"
    assert client.post("/api/auth/password/reset", json={"user_id": cid, "new_password": new}, headers=H(tt)).status_code == 200
    assert client.get("/api/auth/me", headers=H(ct)).status_code == 401
    assert client.post("/api/auth/password/reset", json={"user_id": cid, "new_password": PASSWORDS["client2"]},
                       headers=H(tt)).status_code == 200


def test_h3_refresh_respects_absolute_lifetime(client):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.username == "t_client").first()
        old_auth = int(time.time()) - 40 * 86400
        tok = create_access_token({"sub": str(u.id)}, token_version=u.token_version, auth_time=old_auth)
    finally:
        db.close()
    assert client.post("/api/auth/refresh", headers=H(tok)).status_code == 401
    assert client.post("/api/auth/refresh", headers=H(login(client, "client"))).status_code == 200


# ---------------------------------------------------------------- M1 password policy
@pytest.mark.parametrize("pw,ok", [("short", False), ("password123", False), ("12345678", False), ("aaaaaaaa", False),
                                   ("t_client-rocks!", False), ("x" * 73, False),
                                   ("correct horse battery", True), ("Coach-Set-Pass-8842", True)])
def test_m1_policy(pw, ok):
    assert (password_policy.check(pw, username="t_client", email="t_client@example.com") is None) is ok


def test_m1_weak_password_refused_on_change(client):
    t = login(client, "client")
    r = client.post("/api/auth/password/change", json={"current_password": PASSWORDS["client"], "new_password": "1"}, headers=H(t))
    assert r.status_code == 400 and isinstance(r.json()["detail"], str)


def test_m1_oversized_password_is_422_not_500(client):
    r = client.post("/api/auth/login", json={"username": "t_client", "password": "A" * 100_000})
    assert r.status_code == 422


# ---------------------------------------------------------------- M2 demo login
def test_m2_demo_login_refused_in_production(client, monkeypatch):
    monkeypatch.setenv("DEV_DEMO_SEED", "1")
    monkeypatch.setenv("ENVIRONMENT", "production")
    assert client.post("/api/auth/demo-login/trainer").status_code == 404
    assert client.get("/api/auth/demo-accounts").json()["enabled"] is False


# ---------------------------------------------------------------- M4 CORS / M6 headers / M7 info
@pytest.mark.parametrize("origin", ["https://attacker.up.railway.app", "https://evil.duckdns.org",
                                    "http://ecshape.com", "https://ecshape.com.evil.io", "null"])
def test_m4_cors_does_not_reflect_untrusted_origins(client, origin):
    r = client.get("/api/auth/demo-accounts", headers={"Origin": origin})
    assert r.headers.get("access-control-allow-origin") != origin


def test_m4_cors_localhost_only_off_deployed_hosts(client, monkeypatch):
    monkeypatch.setenv("RAILWAY_PROJECT_ID", "x")
    r = client.get("/api/auth/demo-accounts", headers={"Origin": "http://localhost:6666"})
    assert r.headers.get("access-control-allow-origin") is None
    r = client.get("/api/auth/demo-accounts", headers={"Origin": "https://ecshape.com"})
    assert r.headers.get("access-control-allow-origin") == "https://ecshape.com"


def test_m6_security_headers(client):
    r = client.get("/api/auth/me", headers=H(login(client, "client")))
    assert r.headers["cache-control"] == "no-store"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["x-content-type-options"] == "nosniff"


def test_m7_metrics_and_db_status_admin_only(client):
    ct = login(client, "client")
    for p in ("/metrics", "/status/database", "/api/debug/env"):
        assert client.get(p).status_code == 401
        assert client.get(p, headers=H(ct)).status_code == 403
    assert "cors_origins" not in client.get("/api/test").text


# ---------------------------------------------------------------- M8 websocket token
def test_m8_ws_refuses_query_token_accepts_subprotocol(client):
    t = login(client, "client")
    uid = client.get("/api/auth/me", headers=H(t)).json()["id"]
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/ws/{uid}?token={t}") as ws:
            ws.receive_text()
    with client.websocket_connect(f"/api/ws/{uid}", subprotocols=["ecshape.bearer", t]) as ws:
        assert ws.accepted_subprotocol == "ecshape.bearer"
        assert json.loads(ws.receive_text())["type"]
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/ws/{uid + 1}", subprotocols=["ecshape.bearer", t]) as ws:
            ws.receive_text()


# ---------------------------------------------------------------- QA agent key keeps working with session epochs
def test_qa_agent_key_acts_as_creator(client):
    tt = login(client, "trainer")
    key = client.post("/api/studio/qa/agent-key", headers=H(tt)).json()["key"]
    assert client.get("/api/studio/qa", headers={"X-QA-Agent-Key": key}).status_code == 200
    assert client.get("/api/studio/qa", headers={"X-QA-Agent-Key": key + "x"}).status_code == 401
    client.delete("/api/studio/qa/agent-key", headers=H(tt))
    assert client.get("/api/studio/qa", headers={"X-QA-Agent-Key": key}).status_code == 401


def test_railway_token_not_tracked():
    out = subprocess.run(["git", "ls-files", ".cursor/railwaytoken.txt"], cwd=ROOT, capture_output=True, text=True)
    assert out.stdout.strip() == ""
