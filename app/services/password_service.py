"""Password change, trainer/admin reset and the emailed forgot-password flow.

Forgot-password tokens (auth audit 2026-11, C5):
- signed with a key derived from JWT_SECRET (no repo default), HS256 pinned, 30 min expiry;
- bound to the user id and a fingerprint of the current password hash, so a token works once (the reset changes
  the hash) and dies as soon as the password changes any other way;
- the link base comes from PUBLIC_APP_URL, never from the request's Host header (no link poisoning);
- the token travels in the URL fragment (#token=...), which browsers never send to servers or in Referer.
"""
import hashlib
import logging
import os
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.auth import password_policy
from app.auth.config import derived_key
from app.auth.utils import bump_token_version, get_password_hash, verify_password
from app.models.user import User

logger = logging.getLogger(__name__)

EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USERNAME = os.getenv("EMAIL_USERNAME", "")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "")

RESET_TOKEN_EXPIRE_MINUTES = 30
_RESET_TYP = "password_reset"
_INVALID = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")


def _reset_key() -> str:
    return derived_key("password-reset").hex()


def _pw_fingerprint(user: User) -> str:
    return hashlib.sha256((user.hashed_password or "").encode()).hexdigest()[:24]


def create_password_reset_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({
        "sub": str(user.id),
        "typ": _RESET_TYP,
        "pwf": _pw_fingerprint(user),
        "iat": now,
        "exp": now + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES),
    }, _reset_key(), algorithm="HS256")


def _user_for_reset_token(db: Session, token: str) -> User:
    if not token or len(token) > 2048:
        raise _INVALID
    try:
        payload = jwt.decode(token, _reset_key(), algorithms=["HS256"], options={"require_exp": True, "require_sub": True})
    except JWTError:
        raise _INVALID
    if payload.get("typ") != _RESET_TYP or not str(payload.get("sub", "")).isdigit():
        raise _INVALID
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user or not user.is_active or payload.get("pwf") != _pw_fingerprint(user):
        raise _INVALID
    return user


def _app_url() -> Optional[str]:
    url = (os.getenv("PUBLIC_APP_URL") or "").strip().rstrip("/")
    return url if url.startswith("https://") or url.startswith("http://localhost") else None


def send_password_reset_email(email: str, reset_token: str) -> bool:
    """Runs in a background task. Never logs the token, the link or SMTP credentials."""
    base = _app_url()
    if not (base and EMAIL_HOST and EMAIL_USERNAME and EMAIL_PASSWORD):
        logger.warning("Password reset requested but PUBLIC_APP_URL / EMAIL_* are not configured; no email sent")
        return False
    reset_url = f"{base}/reset-password#token={reset_token}"
    message = MIMEMultipart("alternative")
    message["Subject"] = "Password reset"
    message["From"] = EMAIL_FROM or EMAIL_USERNAME
    message["To"] = email
    text = (f"Someone asked to reset the password of your ECShape account.\n\nOpen this link within "
            f"{RESET_TOKEN_EXPIRE_MINUTES} minutes to choose a new one:\n{reset_url}\n\n"
            "If it wasn't you, ignore this email: your password stays the same.")
    message.attach(MIMEText(text, "plain"))
    try:
        with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT, timeout=15) as server:
            server.starttls()
            server.login(EMAIL_USERNAME, EMAIL_PASSWORD)
            server.send_message(message)
        return True
    except Exception as e:
        logger.error("Password reset email failed: %s", type(e).__name__)
        return False


def prepare_password_reset(db: Session, email: str) -> Optional[tuple]:
    """(email, token) to send, or None when there's no such active account. The endpoint answers the same either way."""
    user = db.query(User).filter(User.email == (email or "").strip()).first()
    if not user or not user.is_active:
        return None
    return user.email, create_password_reset_token(user)


def reset_password(db: Session, token: str, new_password: str) -> bool:
    user = _user_for_reset_token(db, token)
    password_policy.enforce(new_password, username=user.username, email=user.email)
    user.hashed_password = get_password_hash(new_password)
    bump_token_version(db, user)
    db.commit()
    return True


def change_password(db: Session, user_id: int, current_password: str, new_password: str) -> User:
    """Returns the user (with its new session epoch) so the caller can hand back a fresh token."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password")
    password_policy.enforce(new_password, username=user.username, email=user.email)
    user.hashed_password = get_password_hash(new_password)
    bump_token_version(db, user)
    db.commit()
    db.refresh(user)
    return user


def reset_user_password(db: Session, user_id: int, new_password: str) -> bool:
    """Trainer / admin sets a password (no current password). Signs the user out everywhere."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    password_policy.enforce(new_password, username=user.username, email=user.email)
    user.hashed_password = get_password_hash(new_password)
    bump_token_version(db, user)
    db.commit()
    return True
