import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
import os

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.user_service import get_user_by_id
from app.schemas.auth import UserResponse, UserRole

load_dotenv()

from app.auth.config import JWT_SECRET, JWT_ALGORITHM, JWT_ISSUER, JWT_AUDIENCE  # noqa: E402

logger = logging.getLogger(__name__)


def normalize_role(role) -> UserRole:
    """Normalize role to UserRole enum - handles both enum objects and strings."""
    if isinstance(role, UserRole):
        return role
    if isinstance(role, str):
        try:
            return UserRole(role.upper())
        except ValueError:
            raise ValueError(f"Invalid role: {role}")
    raise TypeError(f"Role must be UserRole enum or string, got {type(role)}")


# Kept for backwards compatibility with imports; the values come from app.auth.config (fail-closed, pinned alg).
SECRET_KEY = JWT_SECRET
ALGORITHM = JWT_ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours
# Absolute session lifetime: /auth/refresh can't extend a sign-in past this (ASVS 3.3.2 / 3.3.4).
SESSION_MAX_DAYS = int(os.getenv("SESSION_MAX_DAYS", "30"))

# Password hashing: bcrypt, cost 12 (passlib default; ASVS 2.4.4 asks >= 10)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
# Verified against when the account doesn't exist, so a wrong username costs the same time as a wrong password.
_DUMMY_HASH = pwd_context.hash(secrets.token_urlsafe(16))

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def verify_password(plain_password: str, hashed_password: Optional[str]) -> bool:
    if not plain_password or len(plain_password) > 1024:
        pwd_context.verify("x", _DUMMY_HASH)
        return False
    try:
        return pwd_context.verify(plain_password, hashed_password or _DUMMY_HASH)
    except (ValueError, TypeError):
        return False


def burn_password_check() -> None:
    """Spend one bcrypt verification (unknown account path) so timing doesn't reveal which usernames exist."""
    pwd_context.verify("not-the-password", _DUMMY_HASH)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None, *, token_version: int = 0,
                        auth_time: Optional[int] = None, typ: str = "access") -> str:
    """Sign a token. `sub` (user id) is required; `tv` binds it to the user's session epoch."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode = {k: v for k, v in data.items() if k in ("sub", "role")}
    to_encode.update({
        "exp": expire,
        "iat": now,
        "nbf": now - timedelta(seconds=5),
        "jti": secrets.token_urlsafe(16),
        "tv": int(token_version or 0),
        "auth_time": int(auth_time or now.timestamp()),
        "typ": typ,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
    })
    if isinstance(to_encode.get("role"), UserRole):
        to_encode["role"] = to_encode["role"].value
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def token_for_user(user, *, auth_time: Optional[int] = None) -> str:
    """Access token for a User row (login, refresh, demo)."""
    role = normalize_role(user.role)
    return create_access_token({"sub": str(user.id), "role": role.value}, token_version=user.token_version or 0,
                               auth_time=auth_time)


def decode_token(token: str, typ: str = "access") -> dict:
    """Verify signature (HS256 only), exp / nbf / iat, issuer, audience and token type. Raises the 401 on failure."""
    if not token or len(token) > 4096:
        raise _CREDENTIALS_ERROR
    try:
        payload = jwt.decode(
            token, JWT_SECRET, algorithms=[JWT_ALGORITHM], audience=JWT_AUDIENCE, issuer=JWT_ISSUER,
            options={"require_exp": True, "require_iat": True, "require_sub": True, "require_jti": True,
                     "require_aud": True, "require_iss": True},
        )
    except JWTError as e:
        logger.info("JWT rejected: %s", type(e).__name__)
        raise _CREDENTIALS_ERROR
    if payload.get("typ") != typ:
        raise _CREDENTIALS_ERROR
    return payload


def is_revoked(db: Session, jti: Optional[str]) -> bool:
    from app.models.user import RevokedToken
    return bool(jti) and db.query(RevokedToken.jti).filter(RevokedToken.jti == jti).first() is not None


def revoke_token(db: Session, payload: dict) -> None:
    """Deny-list one token until its natural expiry (sign-out)."""
    from app.models.user import RevokedToken
    jti = payload.get("jti")
    if not jti or is_revoked(db, jti):
        return
    exp = datetime.fromtimestamp(int(payload.get("exp", 0)), tz=timezone.utc).replace(tzinfo=None)
    db.add(RevokedToken(jti=jti, user_id=int(payload["sub"]) if str(payload.get("sub", "")).isdigit() else None,
                        expires_at=exp))
    # Housekeeping: drop rows whose tokens have expired anyway.
    db.query(RevokedToken).filter(RevokedToken.expires_at < datetime.utcnow()).delete(synchronize_session=False)
    db.commit()


def bump_token_version(db: Session, user) -> None:
    """End every session of this user (password change / reset, deactivation, role change)."""
    user.token_version = int(user.token_version or 0) + 1


def user_response(user) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=normalize_role(user.role),
        is_active=user.is_active,
        trainer_id=user.trainer_id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        avatar_url=getattr(user, "avatar_url", None),
    )


def load_active_user(db: Session, user_id) -> UserResponse:
    """The user behind a verified credential, refused when missing or inactive."""
    try:
        user = get_user_by_id(db, int(user_id))
    except (TypeError, ValueError):
        raise _CREDENTIALS_ERROR
    if user is None:
        raise _CREDENTIALS_ERROR
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")
    try:
        return user_response(user)
    except (ValueError, TypeError):
        logger.error("Invalid role value for user %s", user.id)
        raise _CREDENTIALS_ERROR


def user_from_token(db: Session, token: str, typ: str = "access") -> UserResponse:
    payload = decode_token(token, typ)
    user = get_user_by_id(db, int(payload["sub"])) if str(payload.get("sub", "")).isdigit() else None
    if user is None:
        raise _CREDENTIALS_ERROR
    # Session epoch: a password change / reset / deactivation ends every older token.
    if int(payload.get("tv", -1)) != int(user.token_version or 0):
        raise _CREDENTIALS_ERROR
    if typ == "access" and is_revoked(db, payload.get("jti")):
        raise _CREDENTIALS_ERROR
    return load_active_user(db, user.id)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> UserResponse:
    return user_from_token(db, token)


async def get_current_user_websocket(token: str) -> UserResponse:
    """WebSocket version of get_current_user that doesn't use Depends."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        return user_from_token(db, token)
    finally:
        db.close()
