"""
New Meal System Models
Designed for: Trainer creates meal plan → Client selects from food options
Architecture: MealPlan → MealSlot → MacroCategory → FoodOption → ClientChoice
"""

from sqlalchemy import (
    Boolean,
    Column,
    Integer,
    String,
    ForeignKey,
    DateTime,
    Float,
    Enum,
    Text,
    UniqueConstraint,
    TypeDecorator,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum

class MacroType(str, enum.Enum):
    """3 main macro categories as specified"""
    PROTEIN = "protein"  # חלבון
    CARB = "carb"        # פחמימה
    FAT = "fat"          # שומן

class MeasurementType(str, enum.Enum):
    """Measurement type for food items"""
    PER_100G = "per_100g"      # Per 100 grams
    PER_PORTION = "per_portion"  # Per portion (e.g., 1 slice, 2 pieces)

class MeasurementTypeColumn(TypeDecorator):
    """Custom type decorator to handle enum value conversion for backward compatibility"""
    impl = String
    cache_ok = True
    
    def __init__(self, length=20):
        super().__init__(length=length)
    
    def process_bind_param(self, value, dialect):
        """Convert enum to value when writing to database"""
        if value is None:
            return None
        if isinstance(value, MeasurementType):
            return value.value
        return value
    
    def process_result_value(self, value, dialect):
        """Convert database value to enum when reading"""
        if value is None:
            return None
        # Handle both enum names and values
        if value == 'per_100g' or value == 'PER_100G':
            return MeasurementType.PER_100G
        elif value == 'per_portion' or value == 'PER_PORTION':
            return MeasurementType.PER_PORTION
        # Try to find by value first
        try:
            return MeasurementType(value)
        except ValueError:
            # Try to find by name
            try:
                return MeasurementType[value]
            except KeyError:
                # Default fallback
                return MeasurementType.PER_100G

class MealPlanV2(Base):
    """Main meal plan assigned to a client by trainer"""
    __tablename__ = "meal_plans_v2"
    
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    trainer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)  # e.g., "Cutting Phase Week 1"
    description = Column(Text)  # Overall plan description
    number_of_meals = Column(Integer, nullable=False)  # Trainer chooses how many meals (e.g., 4)
    total_calories = Column(Integer)  # Daily target
    protein_target = Column(Integer)  # grams per day
    carb_target = Column(Integer)     # grams per day
    fat_target = Column(Integer)      # grams per day
    is_active = Column(Boolean, default=True)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    
    # Relationships
    meal_slots = relationship("MealSlot", back_populates="meal_plan", cascade="all, delete-orphan", order_by="MealSlot.order_index")

class MealSlot(Base):
    """Individual meal slot (e.g., Meal 1, Meal 2, etc.)"""
    __tablename__ = "meal_slots_v2"
    
    id = Column(Integer, primary_key=True, index=True)
    meal_plan_id = Column(Integer, ForeignKey("meal_plans_v2.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)  # e.g., "Breakfast", "Lunch", "Meal 1", "Pre-Workout"
    order_index = Column(Integer, nullable=False)  # 0, 1, 2, 3... for ordering
    time_suggestion = Column(String)  # e.g., "08:00", "12:30"
    notes = Column(Text)  # Trainer notes for this meal
    target_calories = Column(Integer)
    target_protein = Column(Float)
    target_carbs = Column(Float)
    target_fat = Column(Float)
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    meal_plan = relationship("MealPlanV2", back_populates="meal_slots")
    macro_categories = relationship("MacroCategory", back_populates="meal_slot", cascade="all, delete-orphan")


class MealCompletionStatus(Base):
    """Track per-meal completion status for each client/day"""

    __tablename__ = "meal_completion_status_v2"
    __table_args__ = (
        UniqueConstraint("client_id", "meal_slot_id", "date", name="uniq_meal_completion"),
    )

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    meal_slot_id = Column(Integer, ForeignKey("meal_slots_v2.id", ondelete="CASCADE"), nullable=False)
    date = Column(DateTime, nullable=False)  # Stored as start-of-day UTC
    is_completed = Column(Boolean, default=False, nullable=False)
    completion_method = Column(String)  # manual / auto
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    meal_slot = relationship("MealSlot")

class MacroCategory(Base):
    """One of the 3 macro categories for a meal (Protein, Carb, Fat)"""
    __tablename__ = "macro_categories_v2"
    
    id = Column(Integer, primary_key=True, index=True)
    meal_slot_id = Column(Integer, ForeignKey("meal_slots_v2.id", ondelete="CASCADE"), nullable=False)
    macro_type = Column(Enum(MacroType), nullable=False)  # PROTEIN, CARB, or FAT
    quantity_instruction = Column(String)  # e.g., "150g", "1 serving", "2 pieces"
    calorie_goal = Column(Integer)  # Calorie goal for this macro category (e.g., 200 calories from protein)
    track_cross_macros = Column(Boolean, default=False)  # If True, subtract calories from other macros when food is eaten
    notes = Column(Text)  # Additional instructions for this macro
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    meal_slot = relationship("MealSlot", back_populates="macro_categories")
    food_options = relationship("FoodOption", back_populates="macro_category", cascade="all, delete-orphan")

class FoodOption(Base):
    """Specific food option within a macro category"""
    __tablename__ = "food_options_v2"
    
    id = Column(Integer, primary_key=True, index=True)
    macro_category_id = Column(Integer, ForeignKey("macro_categories_v2.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)  # e.g., "Chicken Breast", "Steak", "White Fish"
    name_hebrew = Column(String)  # e.g., "חזה עוף", "סינטה", "דג לבן"
    calories = Column(Integer)  # per serving
    protein = Column(Float)  # grams per serving
    carbs = Column(Float)    # grams per serving
    fat = Column(Float)      # grams per serving
    serving_size = Column(String)  # e.g., "100g", "1 piece"
    measurement_type = Column(MeasurementTypeColumn(length=20), default=MeasurementType.PER_100G, nullable=False)  # per_100g or per_portion
    notes = Column(Text)
    order_index = Column(Integer, default=0)  # For display ordering
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    macro_category = relationship("MacroCategory", back_populates="food_options")
    client_choices = relationship("ClientMealChoice", back_populates="food_option", cascade="all, delete-orphan")

class ClientMealChoice(Base):
    """Client's selection from food options + photo upload"""
    __tablename__ = "client_meal_choices_v2"
    
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    food_option_id = Column(Integer, ForeignKey("food_options_v2.id", ondelete="CASCADE"), nullable=True)  # Nullable for custom foods
    meal_slot_id = Column(Integer, ForeignKey("meal_slots_v2.id", ondelete="CASCADE"), nullable=True)  # Nullable for custom foods
    date = Column(DateTime, nullable=False)  # When they ate it
    quantity = Column(String)  # How much they ate (e.g., "150g", "1 serving")
    photo_path = Column(String)  # Optional photo of the meal
    is_approved = Column(Boolean)  # Trainer approval (✅ or ❌)
    trainer_comment = Column(Text)  # Trainer feedback
    created_at = Column(DateTime, default=func.now())
    
    # Custom food fields (when food_option_id is null)
    custom_food_name = Column(String)  # Name of custom food
    custom_calories = Column(Float)  # Total calories for this custom food
    custom_protein = Column(Float)  # Total protein in grams
    custom_carbs = Column(Float)  # Total carbs in grams
    custom_fat = Column(Float)  # Total fat in grams
    
    # Relationships
    food_option = relationship("FoodOption", back_populates="client_choices")

class MealTemplate(Base):
    """Reusable meal templates for trainers (optional feature)"""
    __tablename__ = "meal_templates_v2"
    
    id = Column(Integer, primary_key=True, index=True)
    trainer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)  # e.g., "High Protein Breakfast"
    description = Column(Text)
    is_public = Column(Boolean, default=False)  # Share with other trainers?
    created_at = Column(DateTime, default=func.now())

class DailyMealHistory(Base):
    """Daily aggregated meal history for tracking progress"""
    __tablename__ = "daily_meal_history_v2"
    
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date = Column(DateTime, nullable=False, index=True)  # The date of the meals (YYYY-MM-DD)
    total_calories = Column(Float, default=0)
    total_protein = Column(Float, default=0)
    total_carbs = Column(Float, default=0)
    total_fat = Column(Float, default=0)
    is_complete = Column(Boolean, default=False)  # Did client finish eating for the day?
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

class MealBank(Base):
    """Reusable meal bank items that trainers can add to meal plans"""
    __tablename__ = "meal_bank"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)  # e.g., "Chicken Breast", "Brown Rice", "Olive Oil"
    name_hebrew = Column(String)  # e.g., "חזה עוף", "אורז מלא", "שמן זית"
    macro_type = Column(Enum(MacroType), nullable=False)  # PROTEIN, CARB, or FAT
    calories = Column(Integer)  # per 100g or per portion (depending on measurement_type)
    protein = Column(Float)  # grams per 100g or per portion
    carbs = Column(Float)    # grams per 100g or per portion
    fat = Column(Float)      # grams per 100g or per portion
    measurement_type = Column(MeasurementTypeColumn(length=20), default=MeasurementType.PER_100G, nullable=False)  # per_100g or per_portion
    serving_size = Column(String)  # e.g., "100g", "1 slice", "2 pieces" - description of serving
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)  # Trainer who created it
    is_public = Column(Boolean, default=False)  # Share with other trainers?
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

