"""
Meal Tracking V3 domain.

This project currently contains a fully working Meal System V2 (see `app/models/meal_system.py` and
`app/routers/meal_system.py`). For a safe parallel rollout, the V3 API contract is implemented as a new
namespace (`/api/v3/meals`) while reusing the existing V2 data model initially.

This module provides V3-named aliases so the rest of the code can depend on the V3 domain vocabulary.
"""

from app.models.meal_system import (  # Reuse the proven V2 schema/data model
    MealPlanV2,
    MealSlot,
    MacroCategory,
    FoodOption,
    ClientMealChoice,
    DailyMealHistory,
    MealBank,
    MacroType,
    MeasurementType,
)

# V3 domain aliases (same underlying tables/columns as V2)
MealPlanV3 = MealPlanV2
MealSlotV3 = MealSlot
MacroCategoryV3 = MacroCategory
FoodOptionV3 = FoodOption
ClientMealLogV3 = ClientMealChoice
DailyNutritionSummaryV3 = DailyMealHistory
FoodCatalogSourceV3 = MealBank

__all__ = [
    "MealPlanV3",
    "MealSlotV3",
    "MacroCategoryV3",
    "FoodOptionV3",
    "ClientMealLogV3",
    "DailyNutritionSummaryV3",
    "FoodCatalogSourceV3",
    "MacroType",
    "MeasurementType",
]

