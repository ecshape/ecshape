from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User
from app.schemas.auth import UserCreate, UserResponse
from app.auth.utils import get_password_hash, verify_password, create_access_token
from app.services.user_service import get_user_by_email, get_user_by_username

def create_user(db: Session, user: UserCreate) -> User:
    # Check if user already exists
    db_user = get_user_by_email(db, user.email)
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Check if username already exists
    db_user = get_user_by_username(db, user.username)
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
        role=user.role
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def authenticate_user(db: Session, username_or_email: str, password: str) -> Optional[User]:
    # For clients and trainers, only allow username login (not email)
    # For admins, allow both username and email for backward compatibility
    user = get_user_by_username(db, username_or_email)
    if not user:
        # Only try email lookup for admins
        user = get_user_by_email(db, username_or_email)
        if user and user.role.value != "ADMIN":
            # If found by email but not admin, don't allow email login
            return None
    
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user

def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first() 