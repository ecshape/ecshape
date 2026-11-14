"""Machine translations of library texts (exercise instructions, names…), cached forever (QA #43)."""
from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class TranslationCache(Base):
    __tablename__ = "translation_cache"
    __table_args__ = (UniqueConstraint("lang", "src_hash", name="uq_translation_lang_hash"),)

    id = Column(Integer, primary_key=True, index=True)
    lang = Column(String(5), nullable=False, index=True)
    src_hash = Column(String(40), nullable=False)
    src = Column(Text, nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())
