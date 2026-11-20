import logging
import os as _os
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import throttle
from app.auth.config import is_deployed, is_production
from app.auth.utils import (
    SESSION_MAX_DAYS, decode_token, get_current_user, oauth2_scheme, revoke_token, token_for_user, user_from_token,
)
from app.database import get_db
from app.models.user import User
from app.schemas.auth import Token, UserCreate, UserLogin, UserResponse, UserRole
from app.services import auth_service, password_service
from app.services.notification_triggers import NotificationTriggers

router = APIRouter()
logger = logging.getLogger(__name__)

_GENERIC_LOGIN_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Incorrect username or password",
    headers={"WWW-Authenticate": "Bearer"},
)


class PasswordResetRequest(BaseModel):
    email: str = Field(..., max_length=254)


class PasswordReset(BaseModel):
    token: str = Field(..., max_length=2048)
    new_password: str = Field(..., max_length=1024)


class PasswordChange(BaseModel):
    current_password: str = Field(..., max_length=1024)
    new_password: str = Field(..., max_length=1024)


class PasswordResetByTrainer(BaseModel):
    user_id: int
    new_password: str = Field(..., max_length=1024)


async def get_current_user_optional(request: Request, db: Session = Depends(get_db)) -> Optional[UserResponse]:
    """Current user when a valid Bearer token is sent, otherwise None."""
    auth_header = request.headers.get("Authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return None
    try:
        return user_from_token(db, auth_header.split(" ", 1)[1])
    except HTTPException:
        return None


def _flag(name: str) -> bool:
    return _os.getenv(name) == "1"


# Test-only registration (any role). 404 unless ENVIRONMENT=test / ALLOW_TEST_REGISTER=1, and never on a deployed host.
@router.post("/register/test", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user_test(user: UserCreate, db: Session = Depends(get_db)):
    enabled = _os.getenv("ENVIRONMENT", "").lower() == "test" or _flag("ALLOW_TEST_REGISTER")
    if not enabled or is_deployed():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    return auth_service.create_user(db, user)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: Optional[UserResponse] = Depends(get_current_user_optional)
):
    """Accounts are created by coaches (clients) and admins (trainers). Anonymous self-signup is off unless
    ALLOW_PUBLIC_SIGNUP=1 (and then only as a client)."""
    if not current_user:
        if not _flag("ALLOW_PUBLIC_SIGNUP"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sign-up is by invitation from your coach")
        if user.role != UserRole.CLIENT:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Public registration is only allowed for clients")
    else:
        if user.role == UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin registration is not allowed through this endpoint")
        if user.role == UserRole.TRAINER and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can register trainers")
        if user.role == UserRole.CLIENT and current_user.role not in (UserRole.ADMIN, UserRole.TRAINER):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins and trainers can register clients")
    return auth_service.create_user(db, user)


@router.post("/setup/admin", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def setup_admin(user: UserCreate, db: Session = Depends(get_db)):
    """First-admin bootstrap. Unauthenticated by nature, so it is off (404) unless ALLOW_ADMIN_SETUP=1 is set for
    the one deploy that needs it; setup_admin.py (ADMIN_PASSWORD) is the normal path."""
    if not _flag("ALLOW_ADMIN_SETUP"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    if db.query(User).filter(User.role == UserRole.ADMIN).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This endpoint is for admin setup only")
    return auth_service.create_user(db, user)


@router.post("/register/admin", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_admin(user: UserCreate, db: Session = Depends(get_db), current_user: UserResponse = Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can register new admin users")
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This endpoint is for admin registration only")
    return auth_service.create_user(db, user)


@router.post("/register/trainer", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_trainer(user: UserCreate, db: Session = Depends(get_db), current_user: UserResponse = Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can register new trainers")
    if user.role != UserRole.TRAINER:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This endpoint is for trainer registration only")
    created_user = auth_service.create_user(db, user)
    NotificationTriggers.notify_admin_on_user_activity(
        db=db, activity_type="Trainer Registration", user_id=created_user.id,
        details=f"New trainer registered: {user.username}")
    return created_user


@router.post("/register/client", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_client(user: UserCreate, db: Session = Depends(get_db), current_user: UserResponse = Depends(get_current_user)):
    if current_user.role not in [UserRole.ADMIN, UserRole.TRAINER]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins and trainers can register new clients")
    if user.role != UserRole.CLIENT:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This endpoint is for client registration only")
    created_user = auth_service.create_user(db, user)
    if current_user.role == UserRole.TRAINER:
        NotificationTriggers.notify_trainer_on_client_registration(db=db, client_id=created_user.id, trainer_id=current_user.id)
    NotificationTriggers.notify_admin_on_user_activity(
        db=db, activity_type="Client Registration", user_id=created_user.id,
        details=f"New client registered by {current_user.role}: {user.username}")
    return created_user


def _sign_in(request: Request, db: Session, username: str, password: str) -> dict:
    """Shared by /login and /token: throttle, constant-time check, one generic error, fresh session token."""
    ip = throttle.client_ip(request)
    throttle.check("login", username, ip)
    user = auth_service.authenticate_user(db, username, password)
    if not user:
        throttle.failure("login", username, ip)
        logger.info("Sign-in failed from %s", ip)
        raise _GENERIC_LOGIN_ERROR
    throttle.success("login", username)
    user.last_login = datetime.utcnow()
    db.commit()
    return {"access_token": token_for_user(user), "token_type": "bearer"}


@router.post("/token", response_model=Token)
async def login(request: Request, form_data: Annotated[OAuth2PasswordRequestForm, Depends()], db: Session = Depends(get_db)):
    """OAuth2 compatible token login."""
    return _sign_in(request, db, form_data.username, form_data.password)


@router.post("/login", response_model=Token)
async def login_json(request: Request, user_data: UserLogin, db: Session = Depends(get_db)):
    """JSON login."""
    return _sign_in(request, db, user_data.username, user_data.password)


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: Annotated[UserResponse, Depends(get_current_user)]):
    return current_user


@router.post("/refresh", response_model=Token)
async def refresh_token(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """New access token for a still-valid one, inside the absolute session lifetime (SESSION_MAX_DAYS from the
    original sign-in). Revoked / old-epoch tokens are refused by user_from_token."""
    user_from_token(db, token)
    payload = decode_token(token)
    auth_time = int(payload.get("auth_time") or payload.get("iat") or 0)
    if datetime.now(timezone.utc).timestamp() - auth_time > SESSION_MAX_DAYS * 86400:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please sign in again",
                            headers={"WWW-Authenticate": "Bearer"})
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    return {"access_token": token_for_user(user, auth_time=auth_time), "token_type": "bearer"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """End this session server-side: the token is deny-listed until it would have expired."""
    try:
        payload = decode_token(token)
    except HTTPException:
        return None  # already invalid: nothing to end
    revoke_token(db, payload)
    return None


@router.post("/password-reset/request")
async def request_password_reset(reset_request: PasswordResetRequest, request: Request, background: BackgroundTasks,
                                 db: Session = Depends(get_db)):
    """Same answer, same timing, whether or not the email exists; the email itself is sent in the background."""
    ip = throttle.client_ip(request)
    throttle.check("reset-request", reset_request.email, ip)
    throttle.failure("reset-request", reset_request.email, ip)  # every request counts against the budget
    found = password_service.prepare_password_reset(db, reset_request.email)
    if found:
        background.add_task(password_service.send_password_reset_email, *found)
    return {"message": "If the email exists, a password reset link has been sent"}


@router.post("/password-reset/verify")
async def reset_password(reset_data: PasswordReset, request: Request, db: Session = Depends(get_db)):
    ip = throttle.client_ip(request)
    throttle.check("reset-verify", None, ip)
    try:
        password_service.reset_password(db, reset_data.token, reset_data.new_password)
    except HTTPException:
        throttle.failure("reset-verify", None, ip)
        raise
    return {"message": "Password has been reset successfully"}


@router.post("/password/change")
async def change_password(password_data: PasswordChange, request: Request,
                          current_user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    """Change the signed-in user's password. Every other session ends; this device gets a fresh token."""
    ip = throttle.client_ip(request)
    account = f"uid:{current_user.id}"
    throttle.check("password-change", account, ip)
    try:
        user = password_service.change_password(db, current_user.id, password_data.current_password, password_data.new_password)
    except HTTPException as e:
        if e.detail == "Incorrect password":
            throttle.failure("password-change", account, ip)
        raise
    throttle.success("password-change", account)
    return {"access_token": token_for_user(user), "token_type": "bearer", "message": "Password changed successfully"}


@router.post("/password/reset")
async def reset_password_by_trainer(password_data: PasswordResetByTrainer, current_user: UserResponse = Depends(get_current_user),
                                    db: Session = Depends(get_db)):
    """Trainers reset their own clients' passwords; admins anyone's. The user is signed out everywhere."""
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only trainers and admins can reset passwords")
    if current_user.role == UserRole.TRAINER:
        target_user = db.query(User).filter(User.id == password_data.user_id).first()
        if not target_user or target_user.trainer_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only reset passwords for your clients")
    password_service.reset_user_password(db, password_data.user_id, password_data.new_password)
    return {"message": "Password reset successfully"}


# ---- Dev-only demo shortcuts (ecshape-dev). Off unless DEV_DEMO_SEED=1, and refused outright when
# ENVIRONMENT=production, so a stray DEV_DEMO_SEED on the live service can't open a password-less sign-in.
_DEMO_USERS = {"trainer": "trainer1", "client": "client1"}


def _demo_enabled() -> bool:
    return _os.getenv("DEV_DEMO_SEED") == "1" and not is_production()


@router.get("/demo-accounts")
async def demo_accounts():
    enabled = _demo_enabled()
    return {"enabled": enabled, "roles": list(_DEMO_USERS) if enabled else []}


@router.post("/demo-login/{role}", response_model=Token)
async def demo_login(role: str, db: Session = Depends(get_db)):
    if not _demo_enabled() or role not in _DEMO_USERS:
        raise HTTPException(status_code=404, detail="Not found")
    user = db.query(User).filter(User.username == _DEMO_USERS[role]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Demo account missing")
    user.last_login = datetime.utcnow()
    db.commit()
    return {"access_token": token_for_user(user), "token_type": "bearer"}
