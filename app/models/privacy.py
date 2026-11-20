"""Consent records (legal audit 2026-11).

One row per accepted document/consent and per version, so we can prove *what* a person agreed to and *when*
(Israeli Privacy Protection Law, Amendment 13 on especially sensitive data; GDPR Art. 7(1) and Art. 9(2)(a)).
Withdrawing a consent stamps `withdrawn_at`; rows are never edited otherwise.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from app.database import Base


class ConsentRecord(Base):
    __tablename__ = "privacy_consents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # terms | privacy | health_data | health_declaration | age_18 | marketing
    kind = Column(String(40), nullable=False, index=True)
    version = Column(String(20), nullable=False)
    accepted_at = Column(DateTime, server_default=func.now(), nullable=False)
    withdrawn_at = Column(DateTime, nullable=True)
    lang = Column(String(8), nullable=True)
    ip = Column(String(64), nullable=True)
    user_agent = Column(String(300), nullable=True)
    # health_declaration only: JSON of the questionnaire answers (shown to the trainer)
    details = Column(Text, nullable=True)
