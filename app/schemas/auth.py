from pydantic import BaseModel, EmailStr, constr, ConfigDict
from typing import Optional
from enum import Enum
from datetime import datetime

class UserRole(str, Enum):
    ADMIN = "ADMIN"
    TRAINER = "TRAINER"
    CLIENT = "CLIENT"

class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    role: UserRole

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: int
    role: UserRole

class UserResponse(UserBase):
    id: int
    is_active: bool
    trainer_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_login: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True) 