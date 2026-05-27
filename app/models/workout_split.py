"""
Workout Split Model - Custom workout splits created by trainers
"""

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class WorkoutSplit(Base):
    """Custom workout splits created by trainers"""
    __tablename__ = "workout_splits"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)  # e.g., "Push/Pull/Legs", "Upper/Lower", "Custom Split"
    description = Column(Text)  # Optional description
    days_per_week = Column(Integer)  # Number of days (e.g., 3, 4, 6)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=func.now())





