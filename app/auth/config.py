"""Auth configuration that must fail closed.

Secrets never fall back to a value published in the repo. On a deployed host (Railway / Render / an explicit
ENVIRONMENT=production|staging|preview) a missing or weak JWT_SECRET stops the process at import, so a misconfigured
deploy cannot run with a forgeable signing key (auth audit 2026-11, finding C4).
"""
import hashlib
import hmac
import logging
import os
import secrets
from pathlib import Path

logger = logging.getLogger(__name__)

# Values that have shipped in this repo as defaults or examples: never accept them as real secrets.
_KNOWN_PLACEHOLDERS = {
    "your-secret-key-here",
    "your-reset-token-secret-key",
    "ecshape-dev-ai-key-secret",
    "changeme",
    "secret",
}
MIN_SECRET_LEN = 32


def is_deployed() -> bool:
    """True on any hosted environment. Local `uvicorn` runs and tests return False."""
    if (os.getenv("ENVIRONMENT") or "").lower() in {"production", "staging", "preview"}:
        return True
    return any(os.getenv(v) for v in (
        "RAILWAY_ENVIRONMENT", "RAILWAY_PROJECT_ID", "RAILWAY_PUBLIC_DOMAIN", "RENDER_EXTERNAL_URL", "HEROKU_APP_NAME",
    ))


def is_production() -> bool:
    """Explicit production marker (ENVIRONMENT=production). Dev-only shortcuts refuse to run when it is set."""
    return (os.getenv("ENVIRONMENT") or "").lower() == "production"


def _weak(value: str) -> bool:
    v = (value or "").strip()
    if len(v) < MIN_SECRET_LEN:
        return True
    low = v.lower()
    return low in _KNOWN_PLACEHOLDERS or low.startswith("your-")


def _local_dev_secret() -> str:
    """Random signing key for local runs, kept in PERSISTENT_PATH so a restart doesn't sign everyone out."""
    base = os.getenv("PERSISTENT_PATH")
    if base:
        p = Path(base) / ".dev-jwt-secret"
        try:
            if p.exists():
                s = p.read_text().strip()
                if not _weak(s):
                    return s
            p.parent.mkdir(parents=True, exist_ok=True)
            s = secrets.token_urlsafe(48)
            p.write_text(s)
            os.chmod(p, 0o600)
            return s
        except OSError:
            pass
    return secrets.token_urlsafe(48)


def resolve_jwt_secret() -> str:
    raw = os.getenv("JWT_SECRET") or ""
    if raw and not _weak(raw):
        return raw
    if is_deployed():
        raise RuntimeError(
            "JWT_SECRET is missing or weak (needs >= 32 random characters, not a placeholder). "
            "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
        )
    if raw:
        logger.warning("JWT_SECRET is weak; using a random local signing key instead (local run only)")
    return _local_dev_secret()


JWT_SECRET = resolve_jwt_secret()
# Pinned: never read from the environment, so `none` / RS-HS confusion can't be configured in.
JWT_ALGORITHM = "HS256"
JWT_ISSUER = "ecshape-api"
JWT_AUDIENCE = "ecshape-portal"


def derived_key(purpose: str) -> bytes:
    """Independent key per purpose (reset links, websocket tickets...), all derived from JWT_SECRET (HKDF-like)."""
    return hmac.new(JWT_SECRET.encode(), f"ecshape:{purpose}".encode(), hashlib.sha256).digest()
