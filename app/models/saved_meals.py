"""Trainee-owned reusable meals / menus (a named list of foods that can be logged again in one tap)."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class ClientSavedMeal(Base):
    __tablename__ = "client_saved_meals_v3"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    # JSON list: [{name, quantity, calories, protein, carbs, fat}] (totals per item, as logged)
    items_json = Column(Text, nullable=False, default="[]")
    is_favorite = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=func.now())
