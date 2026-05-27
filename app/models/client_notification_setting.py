"""
Client notification preference: per (trainer_id, client_id) mode.
Trainer chooses EVERYTHING (immediate) or WEEKLY_DIGEST for each client.
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ClientNotificationSetting(Base):
    __tablename__ = "client_notification_settings"

    id = Column(Integer, primary_key=True, index=True)
    trainer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mode = Column(String(32), nullable=False)  # EVERYTHING | WEEKLY_DIGEST
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("trainer_id", "client_id", name="uq_trainer_client_notification"),)

    trainer = relationship("User", foreign_keys=[trainer_id])
    client = relationship("User", foreign_keys=[client_id])
