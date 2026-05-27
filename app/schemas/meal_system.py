"""
Pydantic schemas for the new meal system
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum

class MacroType(str, Enum):
    PROTEIN = "protein"
    CARB = "carb"
    FAT = "fat"

class MeasurementType(str, Enum):
    PER_100G = "per_100g"
    PER_PORTION = "per_portion"

# ============ Food Option Schemas ============

class FoodOptionBase(BaseModel):
    name: str
    name_hebrew: Optional[str] = None
    calories: Optional[int] = None
    protein: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    serving_size: Optional[str] = None
    measurement_type: MeasurementType = MeasurementType.PER_100G
    notes: Optional[str] = None
    order_index: int = 0

class FoodOptionCreate(FoodOptionBase):
    macro_category_id: int

class FoodOptionUpdate(BaseModel):
    name: Optional[str] = None
    name_hebrew: Optional[str] = None
    calories: Optional[int] = None
    protein: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    serving_size: Optional[str] = None
    measurement_type: Optional[MeasurementType] = None
    notes: Optional[str] = None
    order_index: Optional[int] = None

class FoodOptionResponse(FoodOptionBase):
    id: int
    macro_category_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# ============ Macro Category Schemas ============

class MacroCategoryBase(BaseModel):
    macro_type: MacroType
    quantity_instruction: Optional[str] = None
    calorie_goal: Optional[int] = None  # Calorie goal for this macro category
    track_cross_macros: Optional[bool] = False  # Track and subtract calories from other macros
    notes: Optional[str] = None

class MacroCategoryCreate(MacroCategoryBase):
    meal_slot_id: int
    food_options: Optional[List[FoodOptionCreate]] = []

class MacroCategoryUpdate(BaseModel):
    quantity_instruction: Optional[str] = None
    calorie_goal: Optional[int] = None
    track_cross_macros: Optional[bool] = None
    notes: Optional[str] = None

class MacroCategoryResponse(MacroCategoryBase):
    id: int
    meal_slot_id: int
    created_at: datetime
    food_options: List[FoodOptionResponse] = []
    
    class Config:
        from_attributes = True

# ============ Meal Slot Schemas ============

class MealSlotBase(BaseModel):
    name: str
    order_index: int
    time_suggestion: Optional[str] = None
    notes: Optional[str] = None
    target_calories: Optional[int] = None
    target_protein: Optional[float] = None
    target_carbs: Optional[float] = None
    target_fat: Optional[float] = None

class MealSlotCreate(MealSlotBase):
    meal_plan_id: int
    macro_categories: Optional[List[MacroCategoryCreate]] = []

class MealSlotUpdate(BaseModel):
    name: Optional[str] = None
    time_suggestion: Optional[str] = None
    notes: Optional[str] = None
    target_calories: Optional[int] = None
    target_protein: Optional[float] = None
    target_carbs: Optional[float] = None
    target_fat: Optional[float] = None

class MealSlotResponse(MealSlotBase):
    id: int
    meal_plan_id: int
    created_at: datetime
    macro_categories: List[MacroCategoryResponse] = []
    
    class Config:
        from_attributes = True

# ============ Meal Plan Schemas ============

class MealPlanBase(BaseModel):
    name: str
    description: Optional[str] = None
    number_of_meals: int = Field(..., ge=1, le=10, description="Number of meals per day")
    total_calories: Optional[int] = None
    protein_target: Optional[int] = None
    carb_target: Optional[int] = None
    fat_target: Optional[int] = None
    is_active: bool = True

class MealPlanCreate(MealPlanBase):
    client_id: int
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class MealPlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    number_of_meals: Optional[int] = Field(None, ge=1, le=10)
    total_calories: Optional[int] = None
    protein_target: Optional[int] = None
    carb_target: Optional[int] = None
    fat_target: Optional[int] = None
    is_active: Optional[bool] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class MealPlanResponse(MealPlanBase):
    id: int
    client_id: int
    trainer_id: int
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    meal_slots: List[MealSlotResponse] = []
    
    class Config:
        from_attributes = True

# ============ Complete Meal Plan Creation (All at once) ============

class CompleteFoodOption(BaseModel):
    name: str
    name_hebrew: Optional[str] = None
    calories: Optional[int] = None
    protein: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    serving_size: Optional[str] = None
    measurement_type: MeasurementType = MeasurementType.PER_100G

class CompleteMacroCategory(BaseModel):
    macro_type: MacroType
    quantity_instruction: Optional[str] = None
    calorie_goal: Optional[int] = None  # Calorie goal for this macro category
    track_cross_macros: Optional[bool] = False  # Track and subtract calories from other macros
    food_options: List[CompleteFoodOption]

class CompleteMealSlot(BaseModel):
    name: str
    time_suggestion: Optional[str] = None
    target_calories: Optional[int] = None
    target_protein: Optional[float] = None
    target_carbs: Optional[float] = None
    target_fat: Optional[float] = None
    macro_categories: List[CompleteMacroCategory]  # Always 3: Protein, Carb, Fat

class CompleteMealPlanCreate(BaseModel):
    client_id: int
    name: str
    description: Optional[str] = None
    number_of_meals: int = Field(..., ge=1, le=10)
    total_calories: Optional[int] = None
    protein_target: Optional[int] = None
    carb_target: Optional[int] = None
    fat_target: Optional[int] = None
    meal_slots: List[CompleteMealSlot]

# ============ Client Meal Choice Schemas ============

class ClientMealChoiceCreate(BaseModel):
    food_option_id: Optional[int] = None  # Nullable for custom foods
    meal_slot_id: Optional[int] = None  # Nullable for custom foods
    date: datetime
    quantity: Optional[str] = None
    photo_path: Optional[str] = None
    # Custom food fields
    custom_food_name: Optional[str] = None
    custom_calories: Optional[float] = None
    custom_protein: Optional[float] = None
    custom_carbs: Optional[float] = None
    custom_fat: Optional[float] = None

class ClientMealChoiceUpdate(BaseModel):
    quantity: Optional[str] = None
    photo_path: Optional[str] = None
    is_approved: Optional[bool] = None
    trainer_comment: Optional[str] = None
    # Custom food fields
    custom_food_name: Optional[str] = None
    custom_calories: Optional[float] = None
    custom_protein: Optional[float] = None
    custom_carbs: Optional[float] = None
    custom_fat: Optional[float] = None

class ClientMealChoiceResponse(BaseModel):
    id: int
    client_id: int
    food_option_id: Optional[int] = None
    meal_slot_id: Optional[int] = None
    date: datetime
    quantity: Optional[str] = None
    photo_path: Optional[str] = None
    is_approved: Optional[bool] = None
    trainer_comment: Optional[str] = None
    created_at: datetime
    # Custom food fields
    custom_food_name: Optional[str] = None
    custom_calories: Optional[float] = None
    custom_protein: Optional[float] = None
    custom_carbs: Optional[float] = None
    custom_fat: Optional[float] = None
    
    class Config:
        from_attributes = True

# ============ Daily Meal History Schemas ============

class MealHistoryChoiceResponse(BaseModel):
    choice_id: int
    food_option_id: Optional[int] = None
    meal_slot_id: Optional[int] = None
    macro_type: Optional[MacroType] = None
    food_name: Optional[str] = None
    food_name_hebrew: Optional[str] = None
    quantity: Optional[str] = None
    is_custom: bool = False
    calories: Optional[float] = None
    protein: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    is_approved: Optional[bool] = None
    trainer_comment: Optional[str] = None
    photo_path: Optional[str] = None


class MealHistoryMealResponse(BaseModel):
    meal_slot_id: Optional[int] = None
    meal_name: str
    time_suggestion: Optional[str] = None
    choices: List[MealHistoryChoiceResponse] = []
    is_completed: Optional[bool] = None


class DailyMealHistoryBase(BaseModel):
    date: datetime
    total_calories: float = 0
    total_protein: float = 0
    total_carbs: float = 0
    total_fat: float = 0
    is_complete: bool = False

class DailyMealHistoryCreate(DailyMealHistoryBase):
    client_id: Optional[int] = None  # Optional, will use current user if not provided

class DailyMealHistoryResponse(DailyMealHistoryBase):
    id: int
    client_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    meals: List[MealHistoryMealResponse] = []
    
    class Config:
        from_attributes = True

# ============ Meal Completion Schemas ============

class MealCompletionStatusCreate(BaseModel):
    meal_slot_id: int
    date: datetime
    is_completed: bool
    completion_method: Optional[str] = None
    client_id: Optional[int] = None


class MealCompletionStatusResponse(BaseModel):
    id: int
    client_id: int
    meal_slot_id: int
    date: datetime
    is_completed: bool
    completion_method: Optional[str] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ============ Meal Bank Schemas ============

class MealBankBase(BaseModel):
    name: str
    name_hebrew: Optional[str] = None
    macro_type: MacroType
    calories: Optional[int] = None
    protein: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    measurement_type: MeasurementType = MeasurementType.PER_100G
    serving_size: Optional[str] = None
    is_public: bool = False

class MealBankCreate(MealBankBase):
    pass

class MealBankUpdate(BaseModel):
    name: Optional[str] = None
    name_hebrew: Optional[str] = None
    macro_type: Optional[MacroType] = None
    calories: Optional[int] = None
    protein: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    measurement_type: Optional[MeasurementType] = None
    serving_size: Optional[str] = None
    is_public: Optional[bool] = None

class MealBankResponse(MealBankBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True






