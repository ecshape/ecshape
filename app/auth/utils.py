from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import os
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.user_service import get_user_by_id
from app.schemas.auth import UserResponse, UserRole

def normalize_role(role) -> UserRole:
    """Normalize role to UserRole enum - handles both enum objects and strings."""
    if isinstance(role, UserRole):
        return role
    if isinstance(role, str):
        # Always convert to uppercase for comparison
        role_upper = role.upper()
        try:
            # Try direct enum conversion with uppercase
            return UserRole(role_upper)
        except ValueError:
            # Try case-insensitive match against enum values
            for enum_role in UserRole:
                if enum_role.value.upper() == role_upper:
                    return enum_role
            # Also handle common variations
            if role_upper in ["TRAINER", "ADMIN", "CLIENT"]:
                return UserRole(role_upper)
            raise ValueError(f"Invalid role: {role}")
    raise TypeError(f"Role must be UserRole enum or string, got {type(role)}")

load_dotenv()

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET", "your-secret-key-here")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "exp": expire,
        "iat": now
    })
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> UserResponse:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            import logging
            logger = logging.getLogger(__name__)
            logger.error("JWT payload missing 'sub' field")
            raise credentials_exception
        
        # Get the full user object from database
        user = get_user_by_id(db, int(user_id))
        if user is None:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"User with ID {user_id} not found in database")
            raise credentials_exception
        
        # Check if user is active
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )
        
        # Normalize role - handle both enum and string representations
        # PostgreSQL might return enum as string, SQLAlchemy might return as enum object
        try:
            user_role = normalize_role(user.role)
        except (ValueError, TypeError) as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Invalid role value for user {user.id}: {user.role} (type: {type(user.role)}), error: {e}")
            raise credentials_exception
        
        # Convert to UserResponse
        return UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=user_role,
            is_active=user.is_active,
            trainer_id=user.trainer_id,
            created_at=user.created_at,
            updated_at=user.updated_at
        )
    except JWTError as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"JWT validation error for token (first 20 chars): {token[:20] if token else 'None'}... Error: {e}")
        logger.error(f"JWT_SECRET configured: {bool(SECRET_KEY and SECRET_KEY != 'your-secret-key-here')}")
        logger.error(f"JWT_ALGORITHM: {ALGORITHM}")
        raise credentials_exception
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Unexpected error in get_current_user: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise credentials_exception

async def get_current_user_websocket(token: str) -> UserResponse:
    """
    WebSocket version of get_current_user that doesn't use Depends.
    Used for WebSocket authentication where FastAPI Depends doesn't work.
    """
    from app.database import SessionLocal
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            import logging
            logger = logging.getLogger(__name__)
            logger.error("WebSocket: JWT payload missing 'sub' field")
            raise credentials_exception
        
        # Create database session
        db = SessionLocal()
        try:
            # Get the full user object from database
            user = get_user_by_id(db, int(user_id))
            if user is None:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"WebSocket: User with ID {user_id} not found in database")
                raise credentials_exception
            
            # Check if user is active
            if not user.is_active:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"WebSocket: User {user_id} is inactive")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="User account is inactive"
                )
            
            # Normalize role - handle both enum and string representations
            try:
                user_role = normalize_role(user.role)
            except (ValueError, TypeError) as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"WebSocket: Invalid role value for user {user.id}: {user.role} (type: {type(user.role)}), error: {e}")
                raise credentials_exception
            
            # Convert to UserResponse
            return UserResponse(
                id=user.id,
                username=user.username,
                email=user.email,
                full_name=user.full_name,
                role=user_role,
                is_active=user.is_active,
                trainer_id=user.trainer_id,
                created_at=user.created_at,
                updated_at=user.updated_at
            )
        finally:
            db.close()
            
    except JWTError as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"WebSocket: JWT validation error: {e}")
        logger.error(f"WebSocket: JWT_SECRET configured: {bool(SECRET_KEY and SECRET_KEY != 'your-secret-key-here')}")
        logger.error(f"WebSocket: JWT_ALGORITHM: {ALGORITHM}")
        raise credentials_exception
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"WebSocket: Unexpected error in get_current_user_websocket: {e}")
        import traceback
        logger.error(f"WebSocket: Traceback: {traceback.format_exc()}")
        raise credentials_exception 