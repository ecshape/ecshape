from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from jose import jwt
from app.models.user import User
from app.auth.utils import get_password_hash, verify_password
import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os

# Environment variables for email configuration
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USERNAME = os.getenv("EMAIL_USERNAME", "your-email@gmail.com")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "your-app-specific-password")
EMAIL_FROM = os.getenv("EMAIL_FROM", "your-email@gmail.com")

# Secret key for reset tokens
RESET_TOKEN_SECRET = os.getenv("RESET_TOKEN_SECRET", "your-reset-token-secret-key")
RESET_TOKEN_EXPIRE_MINUTES = 30

async def send_password_reset_email(email: str, reset_token: str, base_url: str) -> bool:
    """Send password reset email to user."""
    reset_url = f"{base_url}/reset-password?token={reset_token}"
    
    message = MIMEMultipart("alternative")
    message["Subject"] = "Password Reset Request"
    message["From"] = EMAIL_FROM
    message["To"] = email

    text = f"""
    Hello,

    You have requested to reset your password. Please click the link below to reset your password:
    {reset_url}

    This link will expire in {RESET_TOKEN_EXPIRE_MINUTES} minutes.

    If you did not request this reset, please ignore this email.

    Best regards,
    Your App Team
    """

    html = f"""
    <html>
        <body>
            <p>Hello,</p>
            <p>You have requested to reset your password. Please click the link below to reset your password:</p>
            <p><a href="{reset_url}">Reset Password</a></p>
            <p>This link will expire in {RESET_TOKEN_EXPIRE_MINUTES} minutes.</p>
            <p>If you did not request this reset, please ignore this email.</p>
            <p>Best regards,<br>Your App Team</p>
        </body>
    </html>
    """

    message.attach(MIMEText(text, "plain"))
    message.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT) as server:
            server.starttls()
            server.login(EMAIL_USERNAME, EMAIL_PASSWORD)
            server.send_message(message)
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False

async def create_password_reset_token(email: str) -> str:
    """Create a password reset token."""
    expire = datetime.utcnow() + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)
    data = {
        "sub": email,
        "exp": expire,
        "type": "password_reset"
    }
    return jwt.encode(data, RESET_TOKEN_SECRET, algorithm="HS256")

async def verify_reset_token(token: str) -> str:
    """Verify the reset token and return the email."""
    try:
        payload = jwt.decode(token, RESET_TOKEN_SECRET, algorithms=["HS256"])
        if payload.get("type") != "password_reset":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reset token"
            )
        return payload.get("sub")
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

async def request_password_reset(db: Session, email: str, base_url: str) -> bool:
    """Handle password reset request."""
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Return True to prevent email enumeration
        return True
    
    reset_token = await create_password_reset_token(email)
    return await send_password_reset_email(email, reset_token, base_url)

async def reset_password(db: Session, token: str, new_password: str) -> bool:
    """Reset user's password using the reset token."""
    email = await verify_reset_token(token)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.hashed_password = get_password_hash(new_password)
    db.commit()
    return True

async def change_password(
    db: Session,
    user_id: int,
    current_password: str,
    new_password: str
) -> bool:
    """Change user's password."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password"
        )
    
    user.hashed_password = get_password_hash(new_password)
    db.commit()
    return True

async def reset_user_password(
    db: Session,
    user_id: int,
    new_password: str
) -> bool:
    """Reset user's password (for trainers/admins, no current password required)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.hashed_password = get_password_hash(new_password)
    db.commit()
    return True 