from sqlalchemy import Boolean, Column, Integer, String, Enum, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import enum
from app.schemas.auth import UserRole

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    role = Column(Enum(UserRole), nullable=False)  # Use Enum type for proper enum handling
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())  # SQLite compatible
    updated_at = Column(DateTime, onupdate=func.now())  # SQLite compatible
    last_login = Column(DateTime, nullable=True)  # Track last login time

    # Trainer-Client relationship
    trainer_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    clients = relationship("User", backref="trainer", remote_side=[id])

    # Relationships with other tables will be added here when models are implemented
    # workouts = relationship("Workout", back_populates="user")
    # nutrition_plans = relationship("NutritionPlan", back_populates="user")
    progress_entries = relationship("ProgressEntry", back_populates="client")
    
    # Notification relationships
    received_notifications = relationship("Notification", foreign_keys="Notification.recipient_id", back_populates="recipient")
    sent_notifications = relationship("Notification", foreign_keys="Notification.sender_id", back_populates="sender")

class TrainerProfile(Base):
    __tablename__ = "trainer_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, unique=True, nullable=False)
    specialization = Column(String)
    bio = Column(String)
    years_of_experience = Column(Integer)
    certification = Column(String)

class ClientProfile(Base):
    __tablename__ = "client_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, unique=True, nullable=False)
    trainer_id = Column(Integer, nullable=False)
    height = Column(Integer)  # in cm
    target_weight = Column(Integer)  # in grams
    fitness_goals = Column(String)
    medical_conditions = Column(String)
    dietary_restrictions = Column(String)
    phone = Column(String)
    address = Column(String)
    emergency_contact = Column(String) 