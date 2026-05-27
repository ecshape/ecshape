from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime, timezone
from app.database import Base

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    trainer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    message = Column(Text, nullable=False)
    progress_entry_id = Column(Integer, ForeignKey("progress_entries.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    trainer = relationship("User", foreign_keys=[trainer_id])
    client = relationship("User", foreign_keys=[client_id])
    sender = relationship("User", foreign_keys=[sender_id])
    progress_entry = relationship("ProgressEntry", foreign_keys=[progress_entry_id])

