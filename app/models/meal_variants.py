"""
Meal Variants System Models
Handles AI-composed meal variants with favorite foods and per-meal budgets
"""

from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    DateTime,
    Float,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ClientFavoriteFood(Base):
    """Client's favorite foods for meal variants composition"""
    __tablename__ = "client_favorite_foods_v3"
    __table_args__ = (
        UniqueConstraint("client_id", "meal_bank_id", "meal_slot_order_index",
                        name="uniq_client_favorite_food"),
    )

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    meal_bank_id = Column(Integer, ForeignKey("meal_bank.id", ondelete="CASCADE"), nullable=False)
    meal_slot_order_index = Column(Integer, nullable=False)  # 0=breakfast, 1=lunch, 2=dinner
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)  # Coach who added it
    created_at = Column(DateTime, default=func.now())


class MealVariant(Base):
    """AI-composed or fallback-generated meal variant"""
    __tablename__ = "meal_variants_v3"
    __table_args__ = (
        UniqueConstraint("meal_slot_id", "variant_index", name="uniq_meal_variant"),
    )

    id = Column(Integer, primary_key=True, index=True)
    meal_slot_id = Column(Integer, ForeignKey("meal_slots_v2.id", ondelete="CASCADE"), nullable=False)
    variant_index = Column(Integer, nullable=False)  # 0, 1, or 2
    name = Column(String, nullable=False)  # English name
    name_hebrew = Column(String, nullable=False)  # Hebrew name (≤40 chars)
    computed_calories = Column(Float, nullable=False)
    computed_protein = Column(Float, nullable=False)  # grams
    computed_carbs = Column(Float, nullable=False)  # grams
    computed_fat = Column(Float, nullable=False)  # grams
    fit_status = Column(String, default="ok")  # ok|approximate|infeasible
    note_hebrew = Column(Text)  # Hebrew warning/explanation when not ok
    generated_by = Column(String, default="ai")  # ai|fallback
    source_hash = Column(String)  # Hash of favorites+budget+algo version for caching
    generated_at = Column(DateTime, default=func.now())

    # Relationships
    meal_slot = relationship("MealSlot")
    foods = relationship("MealVariantFood", back_populates="meal_variant", cascade="all, delete-orphan")


class MealVariantFood(Base):
    """Food item within a meal variant with denormalized data"""
    __tablename__ = "meal_variant_foods_v3"

    id = Column(Integer, primary_key=True, index=True)
    meal_variant_id = Column(Integer, ForeignKey("meal_variants_v3.id", ondelete="CASCADE"), nullable=False)
    meal_bank_id = Column(Integer, ForeignKey("meal_bank.id", ondelete="SET NULL"), nullable=True)
    # Denormalized fields (snapshot of meal_bank at generation time)
    name = Column(String, nullable=False)
    name_hebrew = Column(String, nullable=False)
    measurement_type = Column(String, nullable=False)  # per_100g|per_portion
    # Quantity for this variant
    quantity_amount = Column(Float, nullable=False)  # grams or portions
    quantity_label = Column(String, nullable=False)  # Display label: "137g" or "1.5"
    # Absolute macros for this quantity
    calories = Column(Float, nullable=False)
    protein = Column(Float, nullable=False)  # grams
    carbs = Column(Float, nullable=False)  # grams
    fat = Column(Float, nullable=False)  # grams
    order_index = Column(Integer, default=0)  # Display order within variant

    # Relationships
    meal_variant = relationship("MealVariant", back_populates="foods")
