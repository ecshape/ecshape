"""
Schemas for meal variants API
"""

from pydantic import BaseModel
from typing import Any, Dict, List, Optional
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
    generated_by: str = "manual"  # manual (trainer-authored)


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


class ManualVariantFoodInput(BaseModel):
    name: str
    name_hebrew: str
    measurement_type: str  # per_100g|per_portion
    quantity_amount: float
    quantity_label: str  # e.g. "135 ג'" or "2 ביצים"
    calories: float
    protein: float
    carbs: float
    fat: float


class ManualVariantInput(BaseModel):
    name_hebrew: str  # e.g. "חביתה וקוטג'"
    foods: List[ManualVariantFoodInput]


class ManualVariantSlotInput(BaseModel):
    meal_slot_id: int
    variants: List[ManualVariantInput]


class ManualVariantsRequest(BaseModel):
    slots: List[ManualVariantSlotInput]


class DailyTargetsFields(BaseModel):
    total_calories: int
    protein_target: float
    carb_target: float
    fat_target: float


class MealSlotTargetFields(BaseModel):
    target_calories: int
    target_protein: float
    target_carbs: float
    target_fat: float


class ParsedFoodPlaceholder(BaseModel):
    """
    A single blank/pre-filled food row per parsed option. Ingredient text in a PDF table
    export comes out word-scrambled with no safe way to reconstruct individual foods, so
    this is not an attempt at that - it exists so the option's macro totals (if parsed)
    are visible immediately, pending the trainer replacing/splitting it into real foods.
    """
    name: str = ""
    name_hebrew: str = ""
    measurement_type: str = "per_100g"
    quantity_amount: float = 100
    quantity_label: str = ""
    calories: float = 0
    protein: float = 0
    carbs: float = 0
    fat: float = 0


class ParsedVariant(BaseModel):
    option_index: int  # 1-based, as printed ("1.", "2." ...)
    name_hebrew: str  # from the option header line, as-is (may have minor PDF artifacts)
    raw_ingredient_text: str  # the garbled ingredient lines, joined - read-only reference
    # The single best-guess macro split (resolve_macro_blob picks automatically between
    # multiple valid digit splits via a calorie-sanity check). Null only when the option
    # had no parseable macro line at all - the trainer then types these in from scratch.
    resolved_protein: Optional[float] = None
    resolved_carbs: Optional[float] = None
    resolved_fat: Optional[float] = None
    resolved_calories: Optional[float] = None
    macro_blob_raw: Optional[str] = None  # the original glued digit string, for trust/debugging
    foods: List[ParsedFoodPlaceholder] = []


class ParsedSlot(BaseModel):
    raw_meal_name: str  # e.g. "ארוחת בוקר", straight from the PDF
    matched_meal_slot_id: Optional[int] = None
    match_confidence: str = "none"  # "exact" | "fuzzy" | "none"
    candidate_meal_slot_ids: List[int] = []  # plan slots the trainer could pick from
    # Populated only when matched_meal_slot_id is null AND the PDF's own breakdown table
    # had a target for this meal - lets the trainer create a brand new slot (via
    # POST /plans/ensure) instead of being hard-blocked with nowhere to put this meal's
    # options. Never auto-applied; the trainer confirms before anything is created.
    proposed_target: Optional[MealSlotTargetFields] = None
    variants: List[ParsedVariant] = []


class ParsedMenuPdfResponse(BaseModel):
    slots: List[ParsedSlot] = []
    warnings: List[str] = []
    # True when the client already had an active meal plan at parse time. False means
    # every slot in `slots` necessarily has matched_meal_slot_id=None - there was nothing
    # to match against - and the review screen should offer to create the whole plan.
    has_plan: bool = True
    # The PDF's own daily totals, only set when has_plan is False (an existing plan
    # already has its own real targets via PUT /plans/{id}/targets - irrelevant here).
    daily_targets: Optional[DailyTargetsFields] = None


class EnsurePlanSlotInput(BaseModel):
    raw_name: str  # becomes the new MealSlot's name, e.g. "ארוחת בוקר"
    order_index: int
    target_calories: int
    target_protein: float
    target_carbs: float
    target_fat: float


class EnsurePlanRequest(BaseModel):
    client_id: int
    daily_targets: Optional[DailyTargetsFields] = None
    new_slots: List[EnsurePlanSlotInput] = []


class VariantSelectRequest(BaseModel):
    variant_id: int
    client_id: Optional[int] = None
    date: Optional[str] = None  # YYYY-MM-DD; defaults to today (UTC)


class VariantSelectResponse(BaseModel):
    variant_id: int
    # Reuses the day-view macro shape (consumed/targets/remaining/percentages) so the
    # client can update its rings from this response without a second fetch.
    daily_macros: V3DailyMacrosResponse

    class Config:
        from_attributes = True


class NutritionProfileFields(BaseModel):
    full_name: Optional[str] = None
    food_preferences: Optional[str] = None
    training_times: Optional[str] = None
    extra_foods: Optional[str] = None
    must_keep_foods: Optional[str] = None


class NutritionProfileUpdate(NutritionProfileFields):
    pass


class NutritionProfileResponse(NutritionProfileFields):
    id: int
    client_id: Optional[int] = None
    email: Optional[str] = None
    raw_answers: Optional[str] = None
    source: str = "manual"
    submitted_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class QuestionnaireWebhookPayload(NutritionProfileFields):
    email: str
    raw_answers: Optional[Dict[str, Any]] = None


class QuestionnaireLinkRequest(BaseModel):
    client_id: int
