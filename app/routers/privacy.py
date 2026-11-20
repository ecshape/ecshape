"""Privacy & consent endpoints (legal audit 2026-11).

  GET    /api/privacy/consent                       what the signed-in user has accepted and what is still required
  POST   /api/privacy/consent                       record consents (terms, privacy, health data, health declaration, 18+, marketing)
  POST   /api/privacy/consent/withdraw              withdraw marketing / health-data consent
  GET    /api/privacy/clients/{id}/health-declaration  the trainee's latest health declaration (their trainer only)
  GET    /api/privacy/export                        a ZIP of everything stored about the signed-in user (right of access / portability)
  DELETE /api/privacy/me                            trainee erases their own account, rows and uploaded files (right to erasure)

Why: the privacy policy promises access, a copy and deletion (Privacy Protection Law s.13-14; GDPR Art. 15, 17, 20),
and health data needs explicit, recorded consent (Amendment 13 "especially sensitive data"; GDPR Art. 9(2)(a), 7(1)).
"""
import glob
import io
import json
import logging
import os
import zipfile
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.utils import get_current_user
from app.database import Base, get_db
from app.models.privacy import ConsentRecord
from app.models.user import User
from app.schemas.auth import UserResponse, UserRole

logger = logging.getLogger(__name__)
router = APIRouter()

# Bump when the terms / privacy policy / health texts change materially: everyone is asked to accept again.
POLICY_VERSION = "2026-11-20"
CLIENT_REQUIRED = ("terms", "privacy", "health_data", "health_declaration", "age_18")
STAFF_REQUIRED = ("terms", "privacy")
ALL_KINDS = set(CLIENT_REQUIRED) | {"marketing"}
WITHDRAWABLE = {"marketing", "health_data"}
# Columns never exported (secrets, not personal data of the requester)
SECRET_COLUMNS = {"hashed_password", "password", "api_key", "token", "secret"}


def _required(role) -> tuple:
    return CLIENT_REQUIRED if role == UserRole.CLIENT else STAFF_REQUIRED


def _active(db: Session, user_id: int) -> Dict[str, ConsentRecord]:
    rows = (
        db.query(ConsentRecord)
        .filter(ConsentRecord.user_id == user_id, ConsentRecord.withdrawn_at.is_(None))
        .order_by(ConsentRecord.accepted_at.desc(), ConsentRecord.id.desc())
        .all()
    )
    out: Dict[str, ConsentRecord] = {}
    for r in rows:
        out.setdefault(r.kind, r)
    return out


def _status(db: Session, user: UserResponse) -> dict:
    active = _active(db, user.id)
    missing = [k for k in _required(user.role) if k not in active or active[k].version != POLICY_VERSION]
    return {
        "version": POLICY_VERSION,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "required": list(_required(user.role)),
        "missing": missing,
        "accepted": {k: {"version": r.version, "at": r.accepted_at.isoformat() if r.accepted_at else None} for k, r in active.items()},
        "marketing": "marketing" in active,
    }


@router.get("/consent")
def get_consent(user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    return _status(db, user)


class HealthDeclaration(BaseModel):
    # PAR-Q style yes/no answers, keyed by question id; free-text notes for the coach
    answers: Dict[str, bool] = Field(default_factory=dict)
    notes: Optional[str] = Field(None, max_length=2000)


class ConsentIn(BaseModel):
    kinds: List[str]
    lang: Optional[str] = Field(None, max_length=8)
    health_declaration: Optional[HealthDeclaration] = None


@router.post("/consent")
def post_consent(payload: ConsentIn, request: Request, user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    kinds = [k for k in dict.fromkeys(payload.kinds) if k in ALL_KINDS]
    if not kinds:
        raise HTTPException(status_code=422, detail="no_valid_consent")
    if "health_declaration" in kinds and payload.health_declaration is None:
        raise HTTPException(status_code=422, detail="health_declaration_answers_required")
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else None)
    ua = (request.headers.get("user-agent") or "")[:300]
    for k in kinds:
        details = None
        if k == "health_declaration":
            details = json.dumps(payload.health_declaration.model_dump(), ensure_ascii=False)
        db.add(ConsentRecord(user_id=user.id, kind=k, version=POLICY_VERSION, lang=payload.lang, ip=ip, user_agent=ua, details=details))
    db.commit()
    return _status(db, user)


class WithdrawIn(BaseModel):
    kind: str


@router.post("/consent/withdraw")
def withdraw_consent(payload: WithdrawIn, user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.kind not in WITHDRAWABLE:
        raise HTTPException(status_code=422, detail="not_withdrawable")
    now = datetime.utcnow()
    db.query(ConsentRecord).filter(
        ConsentRecord.user_id == user.id, ConsentRecord.kind == payload.kind, ConsentRecord.withdrawn_at.is_(None)
    ).update({"withdrawn_at": now})
    db.commit()
    return _status(db, user)


@router.get("/clients/{client_id}/health-declaration")
def client_health_declaration(client_id: int, user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    client = db.get(User, client_id)
    if not client or client.role != UserRole.CLIENT:
        raise HTTPException(status_code=404, detail="Client not found")
    if not (user.role == UserRole.ADMIN or (user.role == UserRole.TRAINER and client.trainer_id == user.id)):
        raise HTTPException(status_code=404, detail="Client not found")
    rec = _active(db, client_id).get("health_declaration")
    if not rec:
        return {"declared": False}
    data = json.loads(rec.details or "{}")
    answers = data.get("answers") or {}
    return {
        "declared": True,
        "version": rec.version,
        "at": rec.accepted_at.isoformat() if rec.accepted_at else None,
        "answers": answers,
        "notes": data.get("notes"),
        "needs_medical_clearance": any(bool(v) for v in answers.values()),
    }


# ------------------------------------------------------------------ export / erase helpers
def _user_fk_columns():
    """(table, column, ondelete) for every column that references users.id, discovered from the models."""
    out = []
    for table in Base.metadata.sorted_tables:
        for col in table.columns:
            for fk in col.foreign_keys:
                if fk.column.table.name == "users" and fk.column.name == "id":
                    out.append((table, col, (fk.ondelete or "").upper()))
    return out


def _jsonable(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, Enum):
        return v.value
    if isinstance(v, bytes):
        return None
    return v


def _row(r) -> dict:
    return {k: _jsonable(v) for k, v in dict(r._mapping).items() if k not in SECRET_COLUMNS}


def _upload_base() -> str:
    from app.services.file_service import FileService
    return FileService().base_upload_path


def _user_files(db: Session, user_id: int) -> List[str]:
    """Files on disk that belong to this person: progress photos, chat photos/voice, avatar."""
    base = _upload_base()
    files = set()
    for sub in ("progress_photos", "thumbnails"):
        files.update(glob.glob(os.path.join(base, sub, f"progress_photo_{user_id}_*")))
    # chat media are named {trainer}_{client}_{hex}.ext; a trainee owns the files of their own conversation
    files.update(glob.glob(os.path.join(base, "chat_media", f"*_{user_id}_*")))
    files.update(glob.glob(os.path.join(base, "avatars", f"{user_id}_*")))
    u = db.get(User, user_id)
    if u and u.avatar_path and os.path.exists(u.avatar_path):
        files.add(u.avatar_path)
    # progress photos referenced from the DB (older uploads may use other names)
    try:
        from app.models.progress import ProgressEntry
        from app.models.progress_photo import ProgressPhoto
        entries = db.query(ProgressEntry).filter(ProgressEntry.client_id == user_id).all()
        for e in entries:
            names = [getattr(e, "photo_path", None)] + [p.photo_path for p in getattr(e, "photos", []) or []]
            for n in names:
                if n:
                    p = os.path.join(base, "progress_photos", os.path.basename(n))
                    if os.path.exists(p):
                        files.add(p)
    except Exception as exc:  # pragma: no cover - export must not fail on an optional model
        logger.warning("privacy: progress photo lookup failed: %s", exc)
    base_abs = os.path.abspath(base)
    return sorted(f for f in files if os.path.abspath(f).startswith(base_abs + os.sep) and os.path.isfile(f))


@router.get("/export")
def export_my_data(user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    data: Dict[str, list] = {}
    users_table = Base.metadata.tables["users"]
    me = db.execute(select(users_table).where(users_table.c.id == user.id)).first()
    data["users"] = [_row(me)] if me else []
    seen = set()
    for table, col, _ in _user_fk_columns():
        if table.name == "users":
            continue
        rows = db.execute(select(table).where(col == user.id)).all()
        if not rows:
            continue
        bucket = data.setdefault(table.name, [])
        for r in rows:
            key = (table.name, tuple(_row(r).items()).__hash__())
            if key in seen:
                continue
            seen.add(key)
            bucket.append(_row(r))
    # progress photos hang off progress_entries, not users
    try:
        from app.models.progress import ProgressEntry
        from app.models.progress_photo import ProgressPhoto
        ids = [e.id for e in db.query(ProgressEntry.id).filter(ProgressEntry.client_id == user.id)]
        if ids:
            pp = Base.metadata.tables["progress_photos"]
            data["progress_photos"] = [_row(r) for r in db.execute(select(pp).where(pp.c.progress_entry_id.in_(ids))).all()]
    except Exception:
        pass
    # leads sent from the public site with the same email
    if user.email:
        leads = Base.metadata.tables.get("studio_leads")
        if leads is not None:
            rows = db.execute(select(leads).where(leads.c.email == user.email)).all()
            if rows:
                data["studio_leads"] = [_row(r) for r in rows]

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("README.txt", (
            "ECshape - your data export\n"
            f"Exported: {datetime.utcnow().isoformat()}Z\n"
            "data.json: every record stored about you, by table. files/: your progress photos, chat photos and voice\n"
            "messages, and profile photo. Passwords are stored hashed and are not included.\n"
        ))
        z.writestr("data.json", json.dumps(data, ensure_ascii=False, indent=2, default=str))
        base = _upload_base()
        for f in _user_files(db, user.id):
            z.write(f, os.path.join("files", os.path.relpath(f, base)))
    buf.seek(0)
    name = f"ecshape-my-data-{date.today().isoformat()}.zip"
    return StreamingResponse(buf, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{name}"'})


class EraseIn(BaseModel):
    confirm: str


@router.delete("/me", status_code=status.HTTP_200_OK)
def erase_me(payload: EraseIn, user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    """A trainee deletes their own account. Coaches/admins write to us instead: their account carries other people's data."""
    if payload.confirm != "DELETE":
        raise HTTPException(status_code=422, detail="confirmation_required")
    if user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="staff_account_erasure_by_request")
    files = _user_files(db, user.id)
    email = user.email
    try:
        # progress photos (child of progress_entries) first, then every row that references the user
        try:
            from app.models.progress import ProgressEntry
            pp = Base.metadata.tables["progress_photos"]
            ids = [e.id for e in db.query(ProgressEntry.id).filter(ProgressEntry.client_id == user.id)]
            if ids:
                db.execute(pp.delete().where(pp.c.progress_entry_id.in_(ids)))
        except KeyError:
            pass
        fk_cols = _user_fk_columns()
        for table, col, ondelete in reversed(fk_cols):
            if table.name == "users":
                continue
            if ondelete == "SET NULL" and col.nullable:
                db.execute(table.update().where(col == user.id).values({col.name: None}))
            else:
                db.execute(table.delete().where(col == user.id))
        if email:
            leads = Base.metadata.tables.get("studio_leads")
            if leads is not None:
                db.execute(leads.delete().where(leads.c.email == email))
        users_table = Base.metadata.tables["users"]
        db.execute(users_table.delete().where(users_table.c.id == user.id))
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("privacy: erase failed for user %s", user.id)
        raise HTTPException(status_code=500, detail="erase_failed") from exc
    removed = 0
    for f in files:
        try:
            os.remove(f)
            removed += 1
        except OSError:
            logger.warning("privacy: could not remove %s", f)
    logger.info("privacy: user %s erased (%s files)", user.id, removed)
    return {"ok": True, "files_removed": removed}


# ------------------------------------------------------------------ Meta / Instagram data-deletion callback
# Meta Platform Terms: apps must tell users how to delete their data, and may register a Data Deletion Request
# callback (developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback).
# The Instagram auto-reply keeps no Instagram data on disk or in the DB (comment ids live only in memory, capped,
# and are lost on restart), so there is nothing to delete: we verify the request and confirm it.
@router.post("/meta/data-deletion")
async def meta_data_deletion(request: Request):
    import base64
    import hashlib
    import hmac
    import secrets

    secret = os.getenv("INSTAGRAM_APP_SECRET")
    if not secret:
        raise HTTPException(status_code=503, detail="Not configured")
    form = await request.form()
    signed = str(form.get("signed_request") or "")
    try:
        sig_b64, payload_b64 = signed.split(".", 1)
        pad = lambda s: s + "=" * (-len(s) % 4)  # noqa: E731
        sig = base64.urlsafe_b64decode(pad(sig_b64))
        expected = hmac.new(secret.encode(), payload_b64.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad signature")
        json.loads(base64.urlsafe_b64decode(pad(payload_b64)))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signed_request")
    code = secrets.token_hex(8)
    site = (os.getenv("PUBLIC_SITE_URL") or str(request.base_url)).rstrip("/")
    return {"url": f"{site}/legal/privacy#instagram", "confirmation_code": code}
