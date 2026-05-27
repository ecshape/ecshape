from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, DateTime, Float, Enum, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum

class MealType(str, enum.Enum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"
    PRE_WORKOUT = "pre_workout"
    POST_WORKOUT = "post_workout"

class MealStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    SKIPPED = "skipped"

class ComponentType(str, enum.Enum):
    """Food category types for meal components.
    
    Each meal is divided into 3 main categories:
    - CARBS: Rice, bread, pasta, fruits, etc.
    - PROTEIN: Chicken, fish, eggs, protein powder, yogurt, etc.
    - FAT: Oils, nuts, peanut butter, avocado, etc.
    """
    CARBS = "carbs"
    PROTEIN = "protein"
    FAT = "fat"

# Legacy models (keeping for backward compatibility)
class NutritionPlan(Base):
    __tablename__ = "nutrition_plans"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    trainer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String)
    daily_calories = Column(Integer)
    protein_target = Column(Integer)  # in grams
    carbs_target = Column(Integer)    # in grams
    fat_target = Column(Integer)      # in grams
    start_date = Column(DateTime)  # SQLite compatible
    end_date = Column(DateTime)  # SQLite compatible
    created_at = Column(DateTime, default=func.now())  # SQLite compatible
    updated_at = Column(DateTime, onupdate=func.now())  # SQLite compatible

    # Relationships
    planned_meals = relationship("PlannedMeal", back_populates="nutrition_plan", cascade="all, delete-orphan")

class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(Integer, primary_key=True, index=True)
    trainer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String)
    instructions = Column(String)
    calories = Column(Integer)
    protein = Column(Integer)
    carbs = Column(Integer)
    fat = Column(Integer)
    preparation_time = Column(Integer)  # in minutes
    created_at = Column(DateTime, default=func.now())  # SQLite compatible

    # Relationships
    planned_meals = relationship("PlannedMeal", back_populates="recipe")

class PlannedMeal(Base):
    __tablename__ = "planned_meals"

    id = Column(Integer, primary_key=True, index=True)
    nutrition_plan_id = Column(Integer, ForeignKey("nutrition_plans.id"), nullable=False)
    recipe_id = Column(Integer, ForeignKey("recipes.id"))
    meal_type = Column(Enum(MealType), nullable=False)
    day_of_week = Column(Integer)  # 0-6 for Monday-Sunday
    time_of_day = Column(String)
    notes = Column(String)

    # Relationships
    nutrition_plan = relationship("NutritionPlan", back_populates="planned_meals")
    recipe = relationship("Recipe", back_populates="planned_meals")
    meal_completions = relationship("MealCompletion", back_populates="planned_meal", cascade="all, delete-orphan")

class MealCompletion(Base):
    __tablename__ = "meal_completions"

    id = Column(Integer, primary_key=True, index=True)
    planned_meal_id = Column(Integer, ForeignKey("planned_meals.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(Enum(MealStatus), nullable=False)
    photo_path = Column(String)
    completed_at = Column(DateTime, default=func.now())  # SQLite compatible
    notes = Column(String)

    # Relationships
    planned_meal = relationship("PlannedMeal", back_populates="meal_completions")

class WeighIn(Base):
    __tablename__ = "weigh_ins"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    weight = Column(Float, nullable=False)  # in kg
    body_fat = Column(Float)  # percentage
    notes = Column(String)
    recorded_at = Column(DateTime, default=func.now())  # SQLite compatible

# New Meal Plan System Models
class MealPlan(Base):
    __tablename__ = "meal_plans"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    trainer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    title = Column(String)  # e.g., "Cutting Phase", "Mass Gain Week 1"
    total_calories = Column(Integer)
    protein_target = Column(Integer)  # grams
    carb_target = Column(Integer)     # grams
    fat_target = Column(Integer)      # grams
    notes = Column(String)  # daily guidance from trainer
    created_at = Column(DateTime, default=func.now())

    # Relationships
    meal_entries = relationship("MealEntry", back_populates="meal_plan", cascade="all, delete-orphan")

class MealEntry(Base):
    __tablename__ = "meal_entries"

    id = Column(Integer, primary_key=True, index=True)
    meal_plan_id = Column(Integer, ForeignKey("meal_plans.id"), nullable=False)
    name = Column(String, nullable=False)  # e.g., "Breakfast", "Lunch", "Post-Workout"
    order_index = Column(Integer, nullable=False)  # 0 = first meal
    notes = Column(String)  # e.g., "2 protein options, avoid sauces"

    # Relationships
    meal_plan = relationship("MealPlan", back_populates="meal_entries")
    meal_components = relationship("MealComponent", back_populates="meal_entry", cascade="all, delete-orphan")
    meal_uploads = relationship("MealUpload", back_populates="meal_entry", cascade="all, delete-orphan")

class MealComponent(Base):
    __tablename__ = "meal_components"

    id = Column(Integer, primary_key=True, index=True)
    meal_entry_id = Column(Integer, ForeignKey("meal_entries.id"), nullable=False)
    type = Column(Enum(ComponentType), nullable=False)  # 'protein', 'carb', 'fat', 'vegetable', etc.
    description = Column(String, nullable=False)  # e.g., "1 slice bread", "150g chicken breast"
    calories = Column(Integer)
    protein = Column(Integer)  # grams
    carbs = Column(Integer)    # grams
    fat = Column(Integer)      # grams
    is_optional = Column(Boolean, default=False)

    # Relationships
    meal_entry = relationship("MealEntry", back_populates="meal_components")

class MealUpload(Base):
    __tablename__ = "meal_uploads"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    meal_entry_id = Column(Integer, ForeignKey("meal_entries.id"), nullable=False)
    image_path = Column(String)
    marked_ok = Column(Boolean)  # ✅ or ❌
    uploaded_at = Column(DateTime, default=func.now())

    # Relationships
    meal_entry = relationship("MealEntry", back_populates="meal_uploads")

# Legacy Nutrition Entry Model (for backward compatibility with tests)
class NutritionEntry(Base):
    __tablename__ = "nutrition_entries"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    weight = Column(Float, nullable=False)  # in kg
    notes = Column(String)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, onupdate=func.now()) 