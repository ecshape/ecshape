"""
Schemas for meal variants API
"""

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from app.schemas.meal_tracking_v3 import V3DailyMacrosResponse


class FavoriteFoodBase(BaseModel):
    meal_bank_id: int
    meal_slot_order_index: int  # 0=breakfast, 1=lunch, 2=dinner


class FavoriteFoodCreate(FavoriteFoodBase):
    pass


class FavoriteFoodResponse(FavoriteFoodBase):
    id: int
    client_id: int
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True


class MealVariantFoodBase(BaseModel):
    meal_bank_id: Optional[int] = None
    name: str
    name_hebrew: str
    measurement_type: str  # per_100g|per_portion
    quantity_amount: float
    quantity_label: str  # "137g" or "1.5"
    calories: float
    protein: float
    carbs: float
    fat: float
    order_index: int = 0


class MealVariantFoodResponse(MealVariantFoodBase):
    id: int
    meal_variant_id: int

    class Config:
        from_attributes = True


class MealVariantBase(BaseModel):
    variant_index: int  # 0, 1, or 2
    name: str
    name_hebrew: str
    computed_calories: float
    computed_protein: float
    computed_carbs: float
    computed_fat: float
    fit_status: str = "ok"  # ok|approximate|infeasible
    note_hebrew: Optional[str] = None
    generated_by: str = "ai"  # ai|fallback


class MealVariantResponse(MealVariantBase):
    id: int
    meal_slot_id: int
    source_hash: Optional[str] = None
    generated_at: datetime
    foods: List[MealVariantFoodResponse] = []

    class Config:
        from_attributes = True


class MealSlotTargetsUpdate(BaseModel):
    # Identifies which slot these targets belong to. Optional for backward compatibility;
    # when omitted the server falls back to list position, which a stale client can get
    # wrong after slots are added/removed/reordered.
    meal_slot_id: Optional[int] = None
    target_calories: int
    target_protein: float
    target_carbs: float
    target_fat: float


class DailyTargetsUpdate(BaseModel):
    total_calories: int
    protein_target: float
    carb_target: float
    fat_target: float
    meal_targets: Optional[List[MealSlotTargetsUpdate]] = None  # Optional per-meal targets


class DailyTargetsResponse(BaseModel):
    total_calories: int
    protein_target: float
    carb_target: float
    fat_target: float
    drift: float  # Sum of meal targets - daily target (calories)
    meal_targets: List[MealSlotTargetsUpdate] = []

    class Config:
        from_attributes = True


class VariantGenerateRequest(BaseModel):
    client_id: Optional[int] = None
    meal_slot_id: Optional[int] = None
    force: bool = False


class VariantSelectRequest(BaseModel):
    variant_id: int
    client_id: Optional[int] = None


class VariantSelectResponse(BaseModel):
    variant_id: int
    # Reuses the day-view macro shape (consumed/targets/remaining/percentages) so the
    # client can update its rings from this response without a second fetch.
    daily_macros: V3DailyMacrosResponse

    class Config:
        from_attributes = True


# AI Service schemas (internal)
class AIVariantFood(BaseModel):
    food_id: int
    min_amount: float
    max_amount: float


class AIVariant(BaseModel):
    name_hebrew: str
    foods: List[AIVariantFood]


class AIVariantSet(BaseModel):
    variants: List[AIVariant]
