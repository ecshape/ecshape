"""
Muscle Group Model - Dynamic muscle groups created by trainers
"""

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class MuscleGroup(Base):
    """Dynamic muscle groups created by trainers"""
    __tablename__ = "muscle_groups"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)  # English display name
    name_he = Column(String, nullable=True)  # Hebrew display name
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    exercises = relationship("Exercise", back_populates="muscle_group_rel")





