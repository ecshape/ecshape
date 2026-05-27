from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime, date
from app.models.nutrition import MealType, MealStatus, ComponentType

# Nutrition Plan Schemas
class NutritionPlanBase(BaseModel):
    name: str
    description: Optional[str] = None
    daily_calories: Optional[int] = Field(None, ge=0)
    protein_target: Optional[int] = Field(None, ge=0)  # in grams
    carbs_target: Optional[int] = Field(None, ge=0)    # in grams
    fat_target: Optional[int] = Field(None, ge=0)      # in grams
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class NutritionPlanCreate(NutritionPlanBase):
    client_id: int

class NutritionPlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    daily_calories: Optional[int] = Field(None, ge=0)
    protein_target: Optional[int] = Field(None, ge=0)
    carbs_target: Optional[int] = Field(None, ge=0)
    fat_target: Optional[int] = Field(None, ge=0)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class NutritionPlanResponse(NutritionPlanBase):
    id: int
    trainer_id: int
    client_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

# Recipe Schemas
class RecipeBase(BaseModel):
    name: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    calories: Optional[int] = Field(None, ge=0)
    protein: Optional[int] = Field(None, ge=0)  # in grams
    carbs: Optional[int] = Field(None, ge=0)    # in grams
    fat: Optional[int] = Field(None, ge=0)      # in grams
    preparation_time: Optional[int] = Field(None, ge=0)  # in minutes

class RecipeCreate(RecipeBase):
    pass

class RecipeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    calories: Optional[int] = Field(None, ge=0)
    protein: Optional[int] = Field(None, ge=0)
    carbs: Optional[int] = Field(None, ge=0)
    fat: Optional[int] = Field(None, ge=0)
    preparation_time: Optional[int] = Field(None, ge=0)

class RecipeResponse(RecipeBase):
    id: int
    trainer_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# Planned Meal Schemas
class PlannedMealBase(BaseModel):
    meal_type: MealType
    day_of_week: Optional[int] = Field(None, ge=0, le=6)  # 0-6 for Monday-Sunday
    time_of_day: Optional[str] = None
    notes: Optional[str] = None

class PlannedMealCreate(PlannedMealBase):
    nutrition_plan_id: int
    recipe_id: Optional[int] = None

class PlannedMealUpdate(BaseModel):
    meal_type: Optional[MealType] = None
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    time_of_day: Optional[str] = None
    notes: Optional[str] = None
    recipe_id: Optional[int] = None

class PlannedMealResponse(PlannedMealBase):
    id: int
    nutrition_plan_id: int
    recipe_id: Optional[int] = None
    recipe: Optional[RecipeResponse] = None

    model_config = ConfigDict(from_attributes=True)

# Meal Completion Schemas
class MealCompletionBase(BaseModel):
    status: MealStatus
    notes: Optional[str] = None

class MealCompletionCreate(MealCompletionBase):
    planned_meal_id: int

class MealCompletionUpdate(BaseModel):
    status: Optional[MealStatus] = None
    notes: Optional[str] = None

class MealCompletionResponse(MealCompletionBase):
    id: int
    planned_meal_id: int
    client_id: int
    photo_path: Optional[str] = None
    completed_at: datetime

    model_config = ConfigDict(from_attributes=True)

# Weigh In Schemas
class WeighInBase(BaseModel):
    weight: float = Field(..., gt=0)  # in kg
    body_fat: Optional[float] = Field(None, ge=0, le=100)  # percentage
    notes: Optional[str] = None

class WeighInCreate(WeighInBase):
    pass

class WeighInUpdate(BaseModel):
    weight: Optional[float] = Field(None, gt=0)
    body_fat: Optional[float] = Field(None, ge=0, le=100)
    notes: Optional[str] = None

class WeighInResponse(WeighInBase):
    id: int
    client_id: int
    recorded_at: datetime

    model_config = ConfigDict(from_attributes=True)

# Complete Nutrition Plan with Planned Meals
class CompleteNutritionPlanResponse(NutritionPlanResponse):
    planned_meals: List[PlannedMealResponse] = []

# Filter Schemas
class NutritionPlanFilter(BaseModel):
    trainer_id: Optional[int] = None
    client_id: Optional[int] = None
    search: Optional[str] = None
    page: int = 1
    size: int = 20

class RecipeFilter(BaseModel):
    trainer_id: Optional[int] = None
    search: Optional[str] = None
    page: int = 1
    size: int = 20

class WeighInFilter(BaseModel):
    client_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    page: int = 1
    size: int = 20

# Nutrition Goals Tracking
class NutritionGoalsBase(BaseModel):
    daily_calories: Optional[int] = Field(None, ge=0)
    protein_target: Optional[int] = Field(None, ge=0)  # in grams
    carbs_target: Optional[int] = Field(None, ge=0)    # in grams
    fat_target: Optional[int] = Field(None, ge=0)      # in grams

class NutritionGoalsCreate(NutritionGoalsBase):
    pass

class NutritionGoalsUpdate(BaseModel):
    daily_calories: Optional[int] = Field(None, ge=0)
    protein_target: Optional[int] = Field(None, ge=0)
    carbs_target: Optional[int] = Field(None, ge=0)
    fat_target: Optional[int] = Field(None, ge=0)

class NutritionGoalsResponse(NutritionGoalsBase):
    id: int
    client_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

# Daily Nutrition Summary
class DailyNutritionSummary(BaseModel):
    date: datetime
    total_calories: int = 0
    total_protein: int = 0  # in grams
    total_carbs: int = 0    # in grams
    total_fat: int = 0      # in grams
    completed_meals: int = 0
    total_meals: int = 0
    goals: Optional[NutritionGoalsResponse] = None

    model_config = ConfigDict(from_attributes=True)

# New Meal Plan System Schemas
class MealComponentBase(BaseModel):
    type: ComponentType
    description: str
    calories: Optional[int] = Field(None, ge=0)
    protein: Optional[int] = Field(None, ge=0)  # grams
    carbs: Optional[int] = Field(None, ge=0)    # grams
    fat: Optional[int] = Field(None, ge=0)      # grams
    is_optional: bool = False

class MealComponentCreate(MealComponentBase):
    pass

class MealComponentUpdate(BaseModel):
    type: Optional[ComponentType] = None
    description: Optional[str] = None
    calories: Optional[int] = Field(None, ge=0)
    protein: Optional[int] = Field(None, ge=0)
    carbs: Optional[int] = Field(None, ge=0)
    fat: Optional[int] = Field(None, ge=0)
    is_optional: Optional[bool] = None

class MealComponentResponse(MealComponentBase):
    id: int
    meal_entry_id: int

    model_config = ConfigDict(from_attributes=True)

class MealEntryBase(BaseModel):
    name: str
    order_index: int = Field(ge=0)
    notes: Optional[str] = None

class MealEntryCreate(MealEntryBase):
    meal_components: List[MealComponentCreate] = []

class MealEntryUpdate(BaseModel):
    name: Optional[str] = None
    order_index: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None

class MealEntryResponse(MealEntryBase):
    id: int
    meal_plan_id: int
    meal_components: List[MealComponentResponse] = []

    model_config = ConfigDict(from_attributes=True)

class MealPlanBase(BaseModel):
    client_id: int
    date: date
    title: Optional[str] = None
    total_calories: Optional[int] = Field(None, ge=0)
    protein_target: Optional[int] = Field(None, ge=0)  # grams
    carb_target: Optional[int] = Field(None, ge=0)     # grams
    fat_target: Optional[int] = Field(None, ge=0)      # grams
    notes: Optional[str] = None

class MealPlanCreate(MealPlanBase):
    meal_entries: List[MealEntryCreate] = []

class MealPlanUpdate(BaseModel):
    title: Optional[str] = None
    total_calories: Optional[int] = Field(None, ge=0)
    protein_target: Optional[int] = Field(None, ge=0)
    carb_target: Optional[int] = Field(None, ge=0)
    fat_target: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None

class MealPlanResponse(MealPlanBase):
    id: int
    trainer_id: int
    created_at: datetime
    meal_entries: List[MealEntryResponse] = []

    model_config = ConfigDict(from_attributes=True)

class MealUploadBase(BaseModel):
    meal_entry_id: int
    marked_ok: Optional[bool] = None

class MealUploadCreate(MealUploadBase):
    pass

class MealUploadUpdate(BaseModel):
    marked_ok: Optional[bool] = None

class MealUploadResponse(MealUploadBase):
    id: int
    client_id: int
    image_path: Optional[str] = None
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)

# Complete Meal Plan with Uploads
class CompleteMealPlanResponse(MealPlanResponse):
    meal_uploads: List[MealUploadResponse] = []

# Filter Schemas for Meal Plans
class MealPlanFilter(BaseModel):
    trainer_id: Optional[int] = None
    client_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    search: Optional[str] = None
    page: int = 1
    size: int = 20

# Meal Plan Summary
class MealPlanSummary(BaseModel):
    date: date
    total_meals: int
    completed_meals: int
    total_calories: int
    total_protein: int
    total_carbs: int
    total_fat: int
    completion_rate: float

    model_config = ConfigDict(from_attributes=True) 