"""
Meal Tracking V3 schemas.

This file defines the contract for the new `/api/v3/meals` namespace.

The initial V3 implementation is backed by the existing Meal System V2 data model, but it exposes a
distinct API contract so we can iterate on the UI/UX without breaking the legacy `/api/v2/meals`.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional, Literal

from pydantic import BaseModel, Field

from app.schemas.meal_system import (
    MacroType,
    MeasurementType,
    ClientMealChoiceResponse,
)


# ============ Shared primitives ============

class V3MacroTotals(BaseModel):
    calories: float = 0
    protein: float = 0
    carbs: float = 0
    fat: float = 0


class V3DailyMacrosResponse(BaseModel):
    consumed: V3MacroTotals
    targets: V3MacroTotals
    remaining: V3MacroTotals
    percentages: V3MacroTotals


class V3FoodOption(BaseModel):
    id: Optional[int] = None
    name: str
    name_hebrew: Optional[str] = None

    calories: Optional[int] = None
    protein: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None

    serving_size: Optional[str] = None
    measurement_type: MeasurementType = MeasurementType.PER_100G

    notes: Optional[str] = None


# ============ Trainer plan request ============

class V3CompleteMacroCategoryFood(V3FoodOption):
    """
    Food input used when the trainer publishes a complete plan.

    This matches the V2 "complete" create payload shape.
    """


class V3CompleteMacroCategoryCreate(BaseModel):
    macro_type: MacroType
    quantity_instruction: Optional[str] = None
    calorie_goal: Optional[int] = None
    track_cross_macros: Optional[bool] = False
    notes: Optional[str] = None
    food_options: List[V3CompleteMacroCategoryFood] = Field(default_factory=list)


class V3CompleteMealSlotCreate(BaseModel):
    name: str
    time_suggestion: Optional[str] = None

    target_calories: Optional[int] = None
    target_protein: Optional[float] = None
    target_carbs: Optional[float] = None
    target_fat: Optional[float] = None

    notes: Optional[str] = None
    macro_categories: List[V3CompleteMacroCategoryCreate]


class V3CompleteMealPlanCreate(BaseModel):
    client_id: int
    name: str
    description: Optional[str] = None

    number_of_meals: int = Field(..., ge=1, le=10, description="Number of meals per day")

    total_calories: Optional[int] = None
    protein_target: Optional[int] = None
    carb_target: Optional[int] = None
    fat_target: Optional[int] = None

    # Used for historical correctness (v3 day-view chooses the plan version by date).
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

    meal_slots: List[V3CompleteMealSlotCreate]


# ============ Trainer plan response ============

class V3CompleteMacroCategoryResponse(V3CompleteMacroCategoryCreate):
    id: Optional[int] = None
    meal_slot_id: Optional[int] = None
    created_at: Optional[datetime] = None


class V3MealSlotResponse(BaseModel):
    id: Optional[int] = None
    meal_plan_id: Optional[int] = None

    name: str
    time_suggestion: Optional[str] = None
    notes: Optional[str] = None
    order_index: int

    target_calories: Optional[int] = None
    target_protein: Optional[float] = None
    target_carbs: Optional[float] = None
    target_fat: Optional[float] = None

    created_at: Optional[datetime] = None
    macro_categories: List[V3CompleteMacroCategoryResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


class V3MealPlanResponse(BaseModel):
    id: Optional[int] = None
    client_id: int
    trainer_id: int

    name: str
    description: Optional[str] = None

    number_of_meals: int
    total_calories: Optional[int] = None
    protein_target: Optional[int] = None
    carb_target: Optional[int] = None
    fat_target: Optional[int] = None

    is_active: bool = True

    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    meal_slots: List[V3MealSlotResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


# ============ Trainee day view ============

class V3ChosenFood(BaseModel):
    """
    A single "what was eaten" record for a (slot, macro category).

    For plan foods, `food_option_id` is set.
    For custom foods, custom fields are set.
    """

    source: Literal["plan_food", "custom_food"]

    meal_slot_id: int
    macro_type: MacroType

    # Plan food selection
    food_option_id: Optional[int] = None

    # Custom food selection
    custom_food_name: Optional[str] = None
    custom_calories: Optional[float] = None
    custom_protein: Optional[float] = None
    custom_carbs: Optional[float] = None
    custom_fat: Optional[float] = None

    # UI quantity (grams as string, e.g. "150g") - optional
    quantity: Optional[str] = None

    # Optional derived values for UI display (single place of truth for rendering)
    display_calories: Optional[float] = None
    display_protein: Optional[float] = None
    display_carbs: Optional[float] = None
    display_fat: Optional[float] = None


class V3MacroCategoryView(BaseModel):
    macro_type: MacroType

    # From the plan macro category (recommended quantities & notes)
    macro_category_id: Optional[int] = None
    quantity_instruction: Optional[str] = None
    notes: Optional[str] = None

    # Recommended foods shown in the planner UI (alternates can be derived by UI)
    recommended_foods: List[V3FoodOption] = Field(default_factory=list)

    # Current trainee selection (if any)
    chosen_food: Optional[V3ChosenFood] = None


class V3MealSlotView(BaseModel):
    meal_slot_id: int
    name: str
    time_suggestion: Optional[str] = None
    notes: Optional[str] = None
    order_index: int

    categories: List[V3MacroCategoryView] = Field(default_factory=list)


class V3DayViewResponse(BaseModel):
    date: str  # YYYY-MM-DD
    meal_plan: Optional[V3MealPlanResponse] = None

    slots: List[V3MealSlotView] = Field(default_factory=list)
    daily_macros: V3DailyMacrosResponse
    # Raw trainee selections so the UI can render per-category and custom entries.
    choices: List[ClientMealChoiceResponse] = Field(default_factory=list)


# ============ Trainee logging request ============

class V3MealLogCreateRequest(BaseModel):
    """
    Create or update a logged intake item for the trainee.

    Contract rule:
    - If `food_option_id` is provided => it is treated as a plan food selection.
    - Else => custom food selection must be provided via custom_* fields.
    """

    date: str  # YYYY-MM-DD or ISO datetime (backend will normalize)

    meal_slot_id: int
    macro_type: MacroType

    # Plan food
    food_option_id: Optional[int] = None
    quantity: Optional[str] = None

    # Custom food (totals for that custom food record)
    custom_food_name: Optional[str] = None
    custom_calories: Optional[float] = None
    custom_protein: Optional[float] = None
    custom_carbs: Optional[float] = None
    custom_fat: Optional[float] = None

    # Optional photo support later
    photo_path: Optional[str] = None


class V3MealLogDeleteResponse(BaseModel):
    deleted: bool = True


# ============ Catalog response ============

class V3FoodCatalogItemResponse(V3FoodOption):
    is_public: Optional[bool] = None
    created_by: Optional[int] = None
    macro_type: Optional[MacroType] = None

