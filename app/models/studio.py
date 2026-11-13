"""Trainer studio data: site prospects, editable site content/SEO, and QA tickets."""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from app.database import Base


class Lead(Base):
    """A prospect who filled a form on the public site."""
    __tablename__ = "studio_leads"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    phone = Column(String(40), nullable=True)
    email = Column(String(160), nullable=True)
    goal = Column(String(80), nullable=True)          # e.g. weight_loss, muscle, health
    program = Column(String(80), nullable=True)       # personal / online / group
    message = Column(Text, nullable=True)
    lang = Column(String(5), nullable=True)
    source = Column(String(80), nullable=True)        # which form / section
    status = Column(String(20), nullable=False, default="new")  # new, contacted, qualified, converted, lost
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), index=True)
    updated_at = Column(DateTime, onupdate=func.now())


class SiteSetting(Base):
    """Key/value JSON documents edited from the studio (site content per language, SEO, branding)."""
    __tablename__ = "studio_site_settings"

    key = Column(String(60), primary_key=True)        # e.g. content:he, content:en, seo, brand
    value = Column(JSON, nullable=False, default=dict)
    updated_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class QaTicket(Base):
    """Atelier QA: a request or bug report about the site or the app."""
    __tablename__ = "studio_qa_tickets"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=True)
    page = Column(String(200), nullable=True)
    priority = Column(String(10), nullable=False, default="normal")  # low, normal, high
    status = Column(String(15), nullable=False, default="new")       # new, in_progress, done, cancelled
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), index=True)
    updated_at = Column(DateTime, onupdate=func.now())


class QaComment(Base):
    __tablename__ = "studio_qa_comments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("studio_qa_tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())


class TrainerAiKey(Base):
    """Trainer-owned AI API keys (ciphertext only — never return the raw secret)."""
    __tablename__ = "studio_trainer_ai_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(40), nullable=False, default="anthropic")
    label = Column(String(80), nullable=False, default="default")
    key_ciphertext = Column(Text, nullable=False)
    key_last4 = Column(String(8), nullable=False)
    is_preferred = Column(Integer, nullable=False, default=0)  # 0/1 for SQLite friendliness
    created_at = Column(DateTime, default=func.now())
