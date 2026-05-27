from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Annotated, Optional, List

from app.database import get_db
from app.models.user import User
from app.schemas.auth import UserCreate, UserResponse, Token, UserLogin, UserRole
from app.services import auth_service, password_service, user_service
from app.auth.utils import get_current_user, create_access_token
from app.services.notification_triggers import NotificationTriggers
from pydantic import BaseModel

router = APIRouter()

class PasswordResetRequest(BaseModel):
    email: str

class UserLoginInfo(BaseModel):
    id: int
    username: str
    email: str
    role: str  # Will be converted from enum to string
    full_name: str
    
    class Config:
        use_enum_values = True

class PasswordReset(BaseModel):
    token: str
    new_password: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

async def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db)
) -> Optional[UserResponse]:
    """Get current user if authenticated, otherwise return None."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    
    try:
        return await get_current_user(auth_header.split(" ")[1], db)
    except:
        return None

@router.get("/registered-users")
async def get_registered_users(db: Session = Depends(get_db)):
    """
    Get all registered users for login page display.
    This endpoint is public and doesn't require authentication.
    """
    users = user_service.get_users(db)
    return [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role.value if hasattr(user.role, 'value') else str(user.role),
            "full_name": user.full_name
        }
        for user in users
    ]

# Test-specific registration endpoint (bypasses role restrictions)
@router.post("/register/test", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user_test(user: UserCreate, db: Session = Depends(get_db)):
    """
    Test-specific registration endpoint that bypasses role restrictions.
    This should only be used in testing environments.
    """
    return auth_service.create_user(db, user)

# General registration endpoint (for tests and public registration)
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user: UserCreate, 
    db: Session = Depends(get_db),
    current_user: Optional[UserResponse] = Depends(get_current_user_optional)
):
    """
    Register a new user with role-based restrictions:
    - Anyone can register as a client
    - Only admins can register trainers
    - Only trainers and admins can register clients
    """
    # If no current user (public registration), only allow client registration
    if not current_user:
        if user.role != UserRole.CLIENT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Public registration is only allowed for clients"
            )
    else:
        # Check role-based permissions
        if user.role == UserRole.TRAINER and current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can register trainers"
            )
        elif user.role == UserRole.CLIENT and current_user.role not in [UserRole.ADMIN, UserRole.TRAINER]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins and trainers can register clients"
            )
        elif user.role == UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin registration is not allowed through this endpoint"
            )
    
    return auth_service.create_user(db, user)

# Special setup endpoint for creating the first admin user
@router.post("/setup/admin", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def setup_admin(user: UserCreate, db: Session = Depends(get_db)):
    """
    Setup the first admin user (only works if no admin users exist)
    """
    # Check if any admin users already exist
    existing_admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
    if existing_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin user already exists. Use /api/auth/register/admin instead."
        )
    
    # Ensure the user being created is an admin
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is for admin setup only"
        )
    
    return auth_service.create_user(db, user)

# Admin-only registration endpoints
@router.post("/register/admin", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_admin(
    user: UserCreate, 
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Register a new admin user (admin only)
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can register new admin users"
        )
    
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is for admin registration only"
        )
    
    return auth_service.create_user(db, user)

@router.post("/register/trainer", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_trainer(
    user: UserCreate, 
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Register a new trainer (admin only)
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can register new trainers"
        )
    
    if user.role != UserRole.TRAINER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is for trainer registration only"
        )
    
    created_user = auth_service.create_user(db, user)
    
    # Notify admin about new trainer registration
    NotificationTriggers.notify_admin_on_user_activity(
        db=db,
        activity_type="Trainer Registration",
        user_id=created_user.id,
        details=f"New trainer registered: {user.username}"
    )
    
    return created_user

@router.post("/register/client", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_client(
    user: UserCreate, 
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Register a new client (trainer or admin only)
    """
    if current_user.role not in [UserRole.ADMIN, UserRole.TRAINER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and trainers can register new clients"
        )
    
    if user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is for client registration only"
        )
    
    created_user = auth_service.create_user(db, user)
    
    # If registered by a trainer, notify the trainer about the new client
    if current_user.role == UserRole.TRAINER:
        NotificationTriggers.notify_trainer_on_client_registration(
            db=db,
            client_id=created_user.id,
            trainer_id=current_user.id
        )
    
    # Notify admin about new client registration
    NotificationTriggers.notify_admin_on_user_activity(
        db=db,
        activity_type="Client Registration",
        user_id=created_user.id,
        details=f"New client registered by {current_user.role}: {user.username}"
    )
    
    return created_user

@router.post("/token", response_model=Token)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db)
):
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    user = auth_service.authenticate_user(
        db, form_data.username, form_data.password
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Update last login timestamp
    from datetime import datetime
    user.last_login = datetime.utcnow()
    db.commit()
    # Normalize role before adding to token
    from app.auth.utils import normalize_role
    normalized_role = normalize_role(user.role)
    access_token = create_access_token(data={"sub": str(user.id), "role": normalized_role.value if hasattr(normalized_role, 'value') else str(normalized_role)})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
async def login_json(user_data: UserLogin, db: Session = Depends(get_db)):
    """
    JSON compatible login, get an access token for future requests
    """
    user = auth_service.authenticate_user(
        db, user_data.username, user_data.password
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Update last login timestamp
    from datetime import datetime
    user.last_login = datetime.utcnow()
    db.commit()
    # Normalize role before adding to token
    from app.auth.utils import normalize_role
    normalized_role = normalize_role(user.role)
    access_token = create_access_token(data={"sub": str(user.id), "role": normalized_role.value if hasattr(normalized_role, 'value') else str(normalized_role)})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def read_users_me(
    current_user: Annotated[UserResponse, Depends(get_current_user)]
):
    """
    Get current user information
    """
    return current_user

@router.post("/refresh", response_model=Token)
async def refresh_token(
    current_user: Annotated[UserResponse, Depends(get_current_user)]
):
    """
    Refresh the access token.
    """
    # Create a new token with the same user data
    access_token = create_access_token(
        data={"sub": str(current_user.id), "role": current_user.role}
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/password-reset/request")
async def request_password_reset(
    reset_request: PasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Request a password reset. Sends an email with a reset link if the email exists.
    """
    base_url = str(request.base_url)
    await password_service.request_password_reset(db, reset_request.email, base_url)
    return {"message": "If the email exists, a password reset link has been sent"}

@router.post("/password-reset/verify")
async def reset_password(
    reset_data: PasswordReset,
    db: Session = Depends(get_db)
):
    """
    Reset password using the reset token.
    """
    success = await password_service.reset_password(db, reset_data.token, reset_data.new_password)
    if success:
        return {"message": "Password has been reset successfully"}
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Failed to reset password"
    )

@router.post("/password/change")
async def change_password(
    password_data: PasswordChange,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Change the current user's password.
    """
    success = await password_service.change_password(
        db,
        current_user.id,
        password_data.current_password,
        password_data.new_password
    )
    if success:
        return {"message": "Password changed successfully"}
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Failed to change password"
    )

class PasswordResetByTrainer(BaseModel):
    user_id: int
    new_password: str

@router.post("/password/reset")
async def reset_password_by_trainer(
    password_data: PasswordResetByTrainer,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Reset a user's password (for trainers/admins only).
    Trainers can only reset passwords for their clients.
    """
    from app.schemas.auth import UserRole
    from app.models.user import User
    
    # Check if user is trainer or admin
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers and admins can reset passwords"
        )
    
    # If trainer, verify the target user is their client
    if current_user.role == UserRole.TRAINER:
        target_user = db.query(User).filter(User.id == password_data.user_id).first()
        if not target_user or target_user.trainer_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only reset passwords for your clients"
            )
    
    success = await password_service.reset_user_password(
        db,
        password_data.user_id,
        password_data.new_password
    )
    if success:
        return {"message": "Password reset successfully"}
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Failed to reset password"
    ) 