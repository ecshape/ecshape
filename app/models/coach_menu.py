"""A coach's own ready-made menus (QA #120 / #121).

A menu is a reusable meal-plan template built only from the coach's food bank: meals (slots) with a time and a calorie
target, each made of macro groups ("150 g protein") that list bank foods as interchangeable options. Assigning one
copies it into the trainee's meal plan (same body as the plan builder), so editing a menu later never changes plans
already assigned.

``data`` shape:
    {"kcal": 2200, "p": 160, "c": 220, "f": 70,
     "slots": [{"name": "Breakfast", "time": "08:00", "kcal": 500,
                "cats": [{"macro": "protein", "qty": "200 g", "foods": [<meal_bank id>, ...]}]}]}
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.sql import func

from app.database import Base


class CoachMenu(Base):
    __tablename__ = "coach_menus"

    id = Column(Integer, primary_key=True, index=True)
    trainer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    goal = Column(Text, nullable=True)
    source = Column(String(40), nullable=True)   # built-in template it was copied from (e.g. "cutting"), if any
    data = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
