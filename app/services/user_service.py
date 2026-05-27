from sqlalchemy.orm import Session
from typing import List, Optional
from app.models.user import User, TrainerProfile, ClientProfile
from app.models.notification import Notification
from app.schemas.auth import UserRole, UserResponse, UserUpdate

def get_users(db: Session) -> List[User]:
    """Get all users"""
    return db.query(User).all()

def get_user(db: Session, user_id: int) -> Optional[User]:
    """Get user by ID"""
    return db.query(User).filter(User.id == user_id).first()

def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    """Get user by ID."""
    return db.query(User).filter(User.id == user_id).first()

def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email."""
    return db.query(User).filter(User.email == email).first()

def get_user_by_username(db: Session, username: str) -> Optional[User]:
    """Get user by username."""
    return db.query(User).filter(User.username == username).first()

def get_all_users(db: Session, skip: int = 0, limit: int = 100) -> List[User]:
    """Get all users with pagination."""
    return db.query(User).offset(skip).limit(limit).all()

def update_user(db: Session, user_id: int, user_update: UserUpdate) -> Optional[User]:
    """Update user information."""
    db_user = get_user_by_id(db, user_id)
    if not db_user:
        return None
    
    update_data = user_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_user, field, value)
    
    db.commit()
    db.refresh(db_user)
    return db_user

def delete_user(db: Session, user_id: int) -> bool:
    """
    Delete a user.
    - If deleting a trainer, deletes all their clients first
    - Deletes all notifications for the user before deleting the user
    """
    try:
        db_user = get_user_by_id(db, user_id)
        if not db_user:
            return False
        
        # If deleting a trainer, delete all their clients first
        if db_user.role == UserRole.TRAINER:
            clients = get_trainer_clients(db, user_id)
            for client in clients:
                # Delete notifications for each client
                db.query(Notification).filter(Notification.recipient_id == client.id).delete()
                db.query(Notification).filter(Notification.sender_id == client.id).update({"sender_id": None})
                # Delete client profile if it exists
                db.query(ClientProfile).filter(ClientProfile.user_id == client.id).delete()
                # Delete the client
                db.delete(client)
        
        # Delete trainer profile if it exists (for trainers)
        if db_user.role == UserRole.TRAINER:
            db.query(TrainerProfile).filter(TrainerProfile.user_id == user_id).delete()
        
        # Delete client profile if it exists (for clients)
        if db_user.role == UserRole.CLIENT:
            db.query(ClientProfile).filter(ClientProfile.user_id == user_id).delete()
        
        # Delete all notifications where this user is the recipient
        # This must be done before deleting the user because recipient_id is NOT NULL
        db.query(Notification).filter(Notification.recipient_id == user_id).delete()
        
        # Delete all notifications where this user is the sender
        # This is safe because sender_id can be NULL
        db.query(Notification).filter(Notification.sender_id == user_id).update({"sender_id": None})
        
        # Now delete the user
        db.delete(db_user)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        print(f"Error deleting user {user_id}: {str(e)}")
        raise

def get_trainer_clients(db: Session, trainer_id: int) -> List[User]:
    """Get all clients assigned to a trainer."""
    trainer = get_user_by_id(db, trainer_id)
    if not trainer or trainer.role != UserRole.TRAINER:
        return []
    
    # Query clients that have this trainer_id
    clients = db.query(User).filter(
        User.role == UserRole.CLIENT,
        User.trainer_id == trainer_id
    ).all()
    
    return clients

def assign_client_to_trainer(db: Session, trainer_id: int, client_id: int) -> bool:
    """Assign a client to a trainer."""
    trainer = get_user_by_id(db, trainer_id)
    client = get_user_by_id(db, client_id)
    
    if not trainer or not client:
        return False
    
    if trainer.role != UserRole.TRAINER or client.role != UserRole.CLIENT:
        return False
    
    # Update the client's trainer_id
    client.trainer_id = trainer_id
    db.commit()
    db.refresh(client)
    return True

def remove_client_from_trainer(db: Session, trainer_id: int, client_id: int) -> bool:
    """Remove a client from a trainer."""
    trainer = get_user_by_id(db, trainer_id)
    client = get_user_by_id(db, client_id)
    
    if not trainer or not client:
        return False
    
    if trainer.role != UserRole.TRAINER or client.role != UserRole.CLIENT:
        return False
    
    # Remove the trainer_id from the client
    client.trainer_id = None
    db.commit()
    db.refresh(client)
    return True

def get_users_by_role(db: Session, role: UserRole) -> List[User]:
    """Get all users with a specific role."""
    return db.query(User).filter(User.role == role).all() 