"""Per-trainer AI API keys (encrypted at rest)."""
from __future__ import annotations

import base64
import hashlib
import os
from typing import Any, Dict, List, Optional

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from app.models.studio import TrainerAiKey

PROVIDERS = ("anthropic", "openai", "google", "other")


def _fernet() -> Fernet:
    raw = os.getenv("AI_KEY_SECRET") or os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY") or "ecshape-dev-ai-key-secret"
    digest = hashlib.sha256(raw.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_key(plain: str) -> str:
    return _fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_key(token: str) -> str:
    return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")


def detect_provider(key: str) -> str:
    k = key.strip()
    if k.startswith("sk-ant-"):
        return "anthropic"
    if k.startswith("sk-") or k.startswith("sk-proj-"):
        return "openai"
    if k.startswith("AIza"):
        return "google"
    return "other"


def key_last4(key: str) -> str:
    cleaned = key.strip()
    return cleaned[-4:] if len(cleaned) >= 4 else cleaned


def list_keys(db: Session, user_id: int) -> List[Dict[str, Any]]:
    rows = (
        db.query(TrainerAiKey)
        .filter(TrainerAiKey.user_id == user_id)
        .order_by(TrainerAiKey.is_preferred.desc(), TrainerAiKey.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "provider": r.provider,
            "label": r.label,
            "last4": r.key_last4,
            "is_preferred": bool(int(r.is_preferred or 0)),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


def add_key(db: Session, user_id: int, api_key: str, label: Optional[str] = None, provider: Optional[str] = None) -> Dict[str, Any]:
    plain = api_key.strip()
    if len(plain) < 12:
        raise ValueError("API key looks too short")
    prov = (provider or detect_provider(plain)).lower()
    if prov not in PROVIDERS:
        prov = "other"
    existing = db.query(TrainerAiKey).filter(TrainerAiKey.user_id == user_id).count()
    row = TrainerAiKey(
        user_id=user_id,
        provider=prov,
        label=(label or prov).strip()[:80],
        key_ciphertext=encrypt_key(plain),
        key_last4=key_last4(plain),
        is_preferred=1 if existing == 0 else 0,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "provider": row.provider,
        "label": row.label,
        "last4": row.key_last4,
        "is_preferred": bool(int(row.is_preferred or 0)),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def set_preferred(db: Session, user_id: int, key_id: int) -> None:
    rows = db.query(TrainerAiKey).filter(TrainerAiKey.user_id == user_id).all()
    found = False
    for r in rows:
        pref = 1 if r.id == key_id else 0
        if pref:
            found = True
        r.is_preferred = pref
    if not found:
        raise LookupError("key not found")
    db.commit()


def delete_key(db: Session, user_id: int, key_id: int) -> None:
    row = db.query(TrainerAiKey).filter(TrainerAiKey.id == key_id, TrainerAiKey.user_id == user_id).first()
    if not row:
        raise LookupError("key not found")
    was_pref = bool(int(row.is_preferred or 0))
    db.delete(row)
    db.commit()
    if was_pref:
        nxt = (
            db.query(TrainerAiKey)
            .filter(TrainerAiKey.user_id == user_id)
            .order_by(TrainerAiKey.created_at.desc())
            .first()
        )
        if nxt:
            nxt.is_preferred = 1
            db.commit()


def resolve_anthropic_key(db: Session, user_id: int) -> Optional[str]:
    """Any anthropic key for this trainer (preferred first), else env."""
    rows = (
        db.query(TrainerAiKey)
        .filter(TrainerAiKey.user_id == user_id, TrainerAiKey.provider == "anthropic")
        .order_by(TrainerAiKey.is_preferred.desc(), TrainerAiKey.created_at.desc())
        .all()
    )
    for row in rows:
        try:
            return decrypt_key(row.key_ciphertext)
        except InvalidToken:
            continue
    env = os.getenv("ANTHROPIC_API_KEY")
    return env.strip() if env else None


def has_any_key(db: Session, user_id: int) -> bool:
    if db.query(TrainerAiKey).filter(TrainerAiKey.user_id == user_id).count():
        return True
    return bool(os.getenv("ANTHROPIC_API_KEY"))
