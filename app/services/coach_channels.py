"""Outside channels for coach automations (QA #123): email and WhatsApp.

Email: the coach's own SMTP when he connected one (e.g. Gmail with an app password), else the platform SMTP
(EMAIL_* env). The sender name is the coach's and replies go to the coach's address.

WhatsApp: the coach's WhatsApp Business number through the WhatsApp Cloud API (phone number id + access token).
Free-form text only reaches a trainee who wrote to that number in the last 24 hours, so an approved template can be
set; its single body variable carries the message. Without a connection the automation still helps: it puts a task
in the coach's inbox with a wa.me link that opens WhatsApp with the message ready to send.
"""
from __future__ import annotations

import logging
import os
import re
import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Any, Dict, Optional
from urllib.parse import quote

import httpx
from sqlalchemy.orm import Session

from app.models.automation import CoachIntegration
from app.services.ai_keys import decrypt_key, encrypt_key, key_last4

logger = logging.getLogger(__name__)

GRAPH = "https://graph.facebook.com/v21.0"


class ChannelError(Exception):
    """A channel refused or is not set up; the message is shown in the automation's activity."""


def get(db: Session, trainer_id: int, kind: str) -> Optional[CoachIntegration]:
    return db.query(CoachIntegration).filter_by(trainer_id=trainer_id, kind=kind).first()


def secret(row: Optional[CoachIntegration]) -> str:
    if not row or not row.secret_enc:
        return ""
    try:
        return decrypt_key(row.secret_enc)
    except Exception:
        return ""


def save(db: Session, trainer_id: int, kind: str, config: Dict[str, Any], new_secret: Optional[str]) -> CoachIntegration:
    row = get(db, trainer_id, kind)
    if not row:
        row = CoachIntegration(trainer_id=trainer_id, kind=kind, config={})
        db.add(row)
    row.config = config
    row.enabled = True
    if new_secret:
        row.secret_enc = encrypt_key(new_secret.strip())
        row.secret_last4 = key_last4(new_secret)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------- email
def platform_smtp() -> Dict[str, Any]:
    return {"host": os.getenv("EMAIL_HOST", ""), "port": int(os.getenv("EMAIL_PORT", "587") or 587),
            "username": os.getenv("EMAIL_USERNAME", ""), "password": os.getenv("EMAIL_PASSWORD", ""),
            "from_email": os.getenv("EMAIL_FROM", "") or os.getenv("EMAIL_USERNAME", "")}


def email_ready(db: Session, trainer_id: int) -> str:
    """'own' (coach SMTP), 'platform' (server SMTP) or '' (no way to send)."""
    row = get(db, trainer_id, "email")
    if row and row.enabled and (row.config or {}).get("host") and secret(row):
        return "own"
    p = platform_smtp()
    return "platform" if p["host"] and p["username"] and p["password"] else ""


def send_email(db: Session, trainer_id: int, coach_name: str, coach_email: str, to: str, subject: str, text: str) -> str:
    if not to or "@" not in to:
        raise ChannelError("trainee has no email address")
    row = get(db, trainer_id, "email")
    cfg = (row.config if row else None) or {}
    mode = email_ready(db, trainer_id)
    if not mode:
        raise ChannelError("email is not set up")
    if mode == "own":
        smtp = {"host": cfg["host"], "port": int(cfg.get("port") or 587), "username": cfg.get("username") or cfg.get("from_email"),
                "password": secret(row), "from_email": cfg.get("from_email") or cfg.get("username")}
    else:
        smtp = platform_smtp()
    msg = MIMEText(text, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = formataddr((cfg.get("sender_name") or coach_name or "ECShape", smtp["from_email"]))
    msg["To"] = to
    reply_to = cfg.get("reply_to") or coach_email
    if reply_to:
        msg["Reply-To"] = reply_to
    try:
        if smtp["port"] == 465:
            with smtplib.SMTP_SSL(smtp["host"], 465, timeout=15) as s:
                s.login(smtp["username"], smtp["password"])
                s.send_message(msg)
        else:
            with smtplib.SMTP(smtp["host"], smtp["port"], timeout=15) as s:
                s.starttls()
                s.login(smtp["username"], smtp["password"])
                s.send_message(msg)
    except smtplib.SMTPException as e:
        raise ChannelError(f"email failed ({type(e).__name__})") from e
    except OSError as e:
        raise ChannelError("email server unreachable") from e
    return mode


def check_smtp(host: str, port: int, username: str, password: str) -> None:
    """Log in once to check the settings (no email is sent)."""
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, 465, timeout=12) as s:
                s.login(username, password)
        else:
            with smtplib.SMTP(host, port, timeout=12) as s:
                s.starttls()
                s.login(username, password)
    except smtplib.SMTPAuthenticationError as e:
        raise ChannelError("wrong username or password") from e
    except (smtplib.SMTPException, OSError) as e:
        raise ChannelError("could not reach the email server") from e


# ---------------------------------------------------------------- WhatsApp
def wa_number(phone: Optional[str], default_cc: str = "972") -> str:
    """Digits in international form: 050-123-4567 -> 972501234567, +33 6.. -> 336.."""
    d = re.sub(r"\D", "", phone or "")
    if not d:
        return ""
    if (phone or "").strip().startswith("+") or d.startswith("00"):
        return d.lstrip("0") if d.startswith("00") else d
    if d.startswith("0"):
        return default_cc + d[1:]
    return d


def wa_link(phone: Optional[str], text: str) -> str:
    n = wa_number(phone)
    return f"https://wa.me/{n}?text={quote(text)}" if n else f"https://wa.me/?text={quote(text)}"


def wa_connected(db: Session, trainer_id: int) -> Optional[CoachIntegration]:
    row = get(db, trainer_id, "whatsapp")
    return row if row and row.enabled and (row.config or {}).get("phone_number_id") and secret(row) else None


def wa_check(phone_number_id: str, token: str) -> Dict[str, Any]:
    """Checks the credentials with Meta and returns the business number's display data."""
    if not re.fullmatch(r"\d{5,30}", phone_number_id or ""):
        raise ChannelError("the phone number ID is a long number from Meta's WhatsApp settings")
    try:
        r = httpx.get(f"{GRAPH}/{phone_number_id}", params={"fields": "display_phone_number,verified_name"},
                      headers={"Authorization": f"Bearer {token}"}, timeout=10)
    except httpx.HTTPError as e:
        raise ChannelError("could not reach WhatsApp") from e
    if r.status_code != 200:
        raise ChannelError(_wa_error(r))
    return r.json()


def _wa_error(r: httpx.Response) -> str:
    try:
        return (r.json().get("error") or {}).get("message") or f"WhatsApp error {r.status_code}"
    except Exception:
        return f"WhatsApp error {r.status_code}"


def send_whatsapp(row: CoachIntegration, phone: Optional[str], text: str) -> None:
    to = wa_number(phone, (row.config or {}).get("country_code") or "972")
    if not to:
        raise ChannelError("trainee has no phone number")
    cfg = row.config or {}
    if cfg.get("template"):
        body: Dict[str, Any] = {"messaging_product": "whatsapp", "to": to, "type": "template", "template": {
            "name": cfg["template"], "language": {"code": cfg.get("lang") or "he"},
            "components": [{"type": "body", "parameters": [{"type": "text", "text": text[:1000]}]}]}}
    else:
        body = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": text[:4096], "preview_url": True}}
    try:
        r = httpx.post(f"{GRAPH}/{cfg['phone_number_id']}/messages", json=body,
                       headers={"Authorization": f"Bearer {secret(row)}"}, timeout=10)
    except httpx.HTTPError as e:
        raise ChannelError("could not reach WhatsApp") from e
    if r.status_code >= 300:
        raise ChannelError(_wa_error(r))
