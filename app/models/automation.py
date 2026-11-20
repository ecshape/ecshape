"""Coach automations (trigger -> actions) and the coach's task inbox.

An automation watches every trainee of a coach for one trigger (no workout for N days, no app visit, a new trainee,
a weight change...) and, once per trainee per occurrence, runs its actions in order: a task in the coach's inbox,
an in-app notification, a chat message signed by the coach, or a webhook call (Zapier / Make / n8n).
"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class Automation(Base):
    __tablename__ = "coach_automations"

    id = Column(Integer, primary_key=True, index=True)
    trainer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    template = Column(String(60), nullable=True)            # which ready-made template it came from
    trigger = Column(String(40), nullable=False)            # see services/automation_engine.TRIGGERS
    config = Column(JSON, nullable=False, default=dict)     # trigger settings, e.g. {"days": 4}
    actions = Column(JSON, nullable=False, default=list)    # [{"type": "task", "title": "...", "priority": "high"}, ...]
    enabled = Column(Boolean, nullable=False, default=False)
    runs = Column(Integer, nullable=False, default=0)
    last_run_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())


class AutomationFire(Base):
    """One firing for one trainee — the dedupe key makes every occurrence fire exactly once."""
    __tablename__ = "coach_automation_fires"
    __table_args__ = (UniqueConstraint("automation_id", "client_id", "occurrence", name="uq_automation_fire"),)

    id = Column(Integer, primary_key=True, index=True)
    automation_id = Column(Integer, ForeignKey("coach_automations.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    occurrence = Column(String(80), nullable=False)          # e.g. "last-workout:2026-11-12"
    result = Column(JSON, nullable=True)
    fired_at = Column(DateTime, default=func.now())


class CoachTask(Base):
    __tablename__ = "coach_tasks"

    id = Column(Integer, primary_key=True, index=True)
    trainer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    automation_id = Column(Integer, ForeignKey("coach_automations.id", ondelete="SET NULL"), nullable=True)
    kind = Column(String(40), nullable=False, default="manual")   # trigger name or "manual"
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=True)
    priority = Column(String(10), nullable=False, default="normal")  # low, normal, high, urgent
    status = Column(String(12), nullable=False, default="open")      # open, done, dismissed
    due_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), index=True)
    done_at = Column(DateTime, nullable=True)
