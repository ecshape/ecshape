"""Per-trainer AI API keys (encrypted at rest) and engine resolution for Agent EC."""
from __future__ import annotations

import base64
import hashlib
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.models.studio import TrainerAiKey
from app.services.ai_providers import detect_provider, provider_info

logger = logging.getLogger(__name__)


def _fernet() -> Fernet:
    raw = os.getenv("AI_KEY_SECRET") or os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY") or "ecshape-dev-ai-key-secret"
    digest = hashlib.sha256(raw.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_key(plain: str) -> str:
    return _fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_key(token: str) -> str:
    return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")


def key_last4(key: str) -> str:
    cleaned = key.strip()
    return cleaned[-4:] if len(cleaned) >= 4 else cleaned


def ensure_columns(engine) -> None:
    """Additive migration for databases created before model/base_url existed (idempotent)."""
    try:
        insp = inspect(engine)
        if "studio_trainer_ai_keys" not in insp.get_table_names():
            return
        cols = {c["name"] for c in insp.get_columns("studio_trainer_ai_keys")}
        with engine.begin() as conn:
            if "model" not in cols:
                conn.execute(text("ALTER TABLE studio_trainer_ai_keys ADD COLUMN model VARCHAR(120)"))
            if "base_url" not in cols:
                conn.execute(text("ALTER TABLE studio_trainer_ai_keys ADD COLUMN base_url VARCHAR(300)"))
    except Exception:  # never block startup on this
        logger.exception("AI key column migration skipped")


def _summary(r: TrainerAiKey) -> Dict[str, Any]:
    info = provider_info(r.provider) or provider_info("custom")
    return {
        "id": r.id,
        "provider": info["id"],
        "product": info["product"],
        "label": r.label,
        "model": r.model or info["default_model"],
        "base_url": r.base_url or "",
        "last4": r.key_last4,
        "is_preferred": bool(int(r.is_preferred or 0)),
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def list_keys(db: Session, user_id: int) -> List[Dict[str, Any]]:
    rows = (
        db.query(TrainerAiKey)
        .filter(TrainerAiKey.user_id == user_id)
        .order_by(TrainerAiKey.is_preferred.desc(), TrainerAiKey.created_at.desc())
        .all()
    )
    return [_summary(r) for r in rows]


def add_key(db: Session, user_id: int, api_key: str, label: Optional[str] = None, provider: Optional[str] = None,
            model: Optional[str] = None, base_url: Optional[str] = None) -> Dict[str, Any]:
    plain = (api_key or "").strip()
    if len(plain) < 12:
        raise ValueError("API key looks too short")
    info = provider_info(provider) or provider_info(detect_provider(plain)) or provider_info("custom")
    if info.get("needs_base_url") and not (base_url or "").strip():
        raise ValueError("This provider needs an API address (base URL)")
    existing = db.query(TrainerAiKey).filter(TrainerAiKey.user_id == user_id).count()
    row = TrainerAiKey(
        user_id=user_id,
        provider=info["id"],
        label=(label or info["product"]).strip()[:80],
        key_ciphertext=encrypt_key(plain),
        key_last4=key_last4(plain),
        model=(model or info["default_model"] or "").strip()[:120] or None,
        base_url=(base_url or "").strip()[:300] or None,
        is_preferred=1 if existing == 0 else 0,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _summary(row)


def update_key(db: Session, user_id: int, key_id: int, api_key: Optional[str] = None, model: Optional[str] = None,
               base_url: Optional[str] = None, label: Optional[str] = None) -> Dict[str, Any]:
    row = db.query(TrainerAiKey).filter(TrainerAiKey.id == key_id, TrainerAiKey.user_id == user_id).first()
    if not row:
        raise LookupError("key not found")
    if api_key and api_key.strip():
        if len(api_key.strip()) < 12:
            raise ValueError("API key looks too short")
        row.key_ciphertext = encrypt_key(api_key.strip())
        row.key_last4 = key_last4(api_key)
    if model is not None:
        row.model = model.strip()[:120] or None
    if base_url is not None:
        row.base_url = base_url.strip()[:300] or None
    if label is not None and label.strip():
        row.label = label.strip()[:80]
    db.commit()
    return _summary(row)


def set_preferred(db: Session, user_id: int, key_id: int) -> None:
    rows = db.query(TrainerAiKey).filter(TrainerAiKey.user_id == user_id).all()
    if not any(r.id == key_id for r in rows):
        raise LookupError("key not found")
    for r in rows:
        r.is_preferred = 1 if r.id == key_id else 0
    db.commit()


def delete_key(db: Session, user_id: int, key_id: int) -> None:
    row = db.query(TrainerAiKey).filter(TrainerAiKey.id == key_id, TrainerAiKey.user_id == user_id).first()
    if not row:
        raise LookupError("key not found")
    was_pref = bool(int(row.is_preferred or 0))
    db.delete(row)
    db.commit()
    if was_pref:
        nxt = db.query(TrainerAiKey).filter(TrainerAiKey.user_id == user_id).order_by(TrainerAiKey.created_at.desc()).first()
        if nxt:
            nxt.is_preferred = 1
            db.commit()


@dataclass
class Engine:
    provider: str            # anthropic / openai / google / … / custom
    api_key: str
    model: str
    base_url: Optional[str]
    source: str              # "user" or "server"

    @property
    def label(self) -> str:
        info = provider_info(self.provider) or {"product": self.provider}
        return f"{info['product']} · {self.model}"


def resolve_engine(db: Session, user_id: int, choice: Optional[str] = None) -> Optional[Engine]:
    """Pick the engine for a request. choice = "auto" (preferred key, else server key) or a key id."""
    q = db.query(TrainerAiKey).filter(TrainerAiKey.user_id == user_id)
    rows = []
    if choice and choice not in ("auto", ""):
        try:
            rows = q.filter(TrainerAiKey.id == int(choice)).all()
        except (TypeError, ValueError):
            rows = []
    if not rows:
        rows = q.order_by(TrainerAiKey.is_preferred.desc(), TrainerAiKey.created_at.desc()).all()
    for r in rows:
        try:
            plain = decrypt_key(r.key_ciphertext)
        except InvalidToken:
            continue
        info = provider_info(r.provider) or provider_info("custom")
        return Engine(info["id"], plain, r.model or info["default_model"], r.base_url or info.get("base_url"), "user")
    env = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if env:
        return Engine("anthropic", env, "claude-opus-5-5", None, "server")
    return None


def has_any_key(db: Session, user_id: int) -> bool:
    return bool(db.query(TrainerAiKey).filter(TrainerAiKey.user_id == user_id).count() or os.getenv("ANTHROPIC_API_KEY"))


def resolve_anthropic_key(db: Session, user_id: int) -> Optional[str]:
    """Kept for callers that only speak Claude (meal variants)."""
    eng = resolve_engine(db, user_id)
    if eng and eng.provider == "anthropic":
        return eng.api_key
    env = os.getenv("ANTHROPIC_API_KEY")
    return env.strip() if env else None
