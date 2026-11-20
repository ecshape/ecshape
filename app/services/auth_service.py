from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User
from app.schemas.auth import UserCreate
from app.auth.utils import get_password_hash, verify_password, burn_password_check, normalize_role
from app.auth import password_policy
from app.services.user_service import get_user_by_email, get_user_by_username


def create_user(db: Session, user: UserCreate, trainer_id: Optional[int] = None) -> User:
    password_policy.enforce(user.password, username=user.username, email=user.email)
    # One generic message for both clashes: callers are already authenticated trainers / admins, but there's no
    # need to tell them which of the two identifiers belongs to someone else.
    if get_user_by_email(db, user.email) or get_user_by_username(db, user.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )

    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password),
        full_name=user.full_name,
        role=user.role,
        token_version=0,
    )
    if trainer_id is not None:
        db_user.trainer_id = trainer_id

    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def authenticate_user(db: Session, username_or_email: str, password: str) -> Optional[User]:
    """Username for everyone; email only for admins (backward compatibility). Constant work whatever the outcome:
    an unknown account still costs one bcrypt verification (ASVS 2.2.1 / user enumeration by timing)."""
    user = get_user_by_username(db, username_or_email)
    if not user:
        user = get_user_by_email(db, username_or_email)
        if user and normalize_role(user.role).value != "ADMIN":
            user = None
    if not user:
        burn_password_check()
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()
