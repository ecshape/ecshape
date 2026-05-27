from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, DateTime, Float, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class ProgressEntry(Base):
    __tablename__ = "progress_entries"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    weight = Column(Float, nullable=False)  # in kg
    photo_path = Column(String)  # optional progress photo
    notes = Column(String)  # optional notes
    # Body measurements (all optional)
    chest = Column(Float, nullable=True)  # in cm
    waist = Column(Float, nullable=True)  # in cm
    hips = Column(Float, nullable=True)  # in cm
    thighs = Column(Float, nullable=True)  # in cm
    arms = Column(Float, nullable=True)  # in cm (deprecated - use right_arm and left_arm)
    right_arm = Column(Float, nullable=True)  # in cm - right arm circumference
    left_arm = Column(Float, nullable=True)  # in cm - left arm circumference
    created_at = Column(DateTime, default=func.now())

    # Relationships
    client = relationship("User", back_populates="progress_entries")
    photos = relationship("ProgressPhoto", back_populates="progress_entry", cascade="all, delete-orphan") 