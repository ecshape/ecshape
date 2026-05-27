from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum

class PhotoType(enum.Enum):
    FRONT = "front"  # קדימה
    SIDE = "side"    # צד
    BACK = "back"    # אחורה

class ProgressPhoto(Base):
    """Model for storing multiple progress photos per entry with labels"""
    __tablename__ = "progress_photos"

    id = Column(Integer, primary_key=True, index=True)
    progress_entry_id = Column(Integer, ForeignKey("progress_entries.id", ondelete="CASCADE"), nullable=False)
    photo_path = Column(String, nullable=False)  # Filename of the photo
    photo_type = Column(Enum(PhotoType), nullable=False)  # front, side, or back
    created_at = Column(DateTime, default=func.now())

    # Relationship
    progress_entry = relationship("ProgressEntry", back_populates="photos")
