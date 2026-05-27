from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), default="info")  # info, success, warning, error
    recipient_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # null for system notifications
    client_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # which trainee this is about
    event_type = Column(String(50), nullable=True)  # weight_change, meal_completion, training_completion, weekly_digest, goal_achievement, system
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    read_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    recipient = relationship("User", foreign_keys=[recipient_id], back_populates="received_notifications")
    sender = relationship("User", foreign_keys=[sender_id], back_populates="sent_notifications") 