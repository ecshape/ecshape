"""
Meal Tracking V3 mock backend.

Purpose:
- Provide stable mock responses for UI testing.
- Never touch DB, never write.
- Exposed under `/api/v3/meals-mock` so it cannot affect production v2/v3 data.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter

from app.schemas.meal_system import ClientMealChoiceResponse
from app.schemas.meal_tracking_v3 import (
    V3FoodCatalogItemResponse,
    V3CompleteMealPlanCreate,
    V3MealPlanResponse,
    V3DayViewResponse,
    V3MealLogCreateRequest,
    V3DailyMacrosResponse,
    V3ChosenFood,
    V3MacroTotals,
)
from app.schemas.meal_system import MacroType, MeasurementType



router = APIRouter(tags=["Meal Tracking V3 Mock"])

_MOCK_CATALOG: List[V3FoodCatalogItemResponse] = [
    # Protein
    V3FoodCatalogItemResponse(
        id=101,
        name="Chicken Breast",
        name_hebrew="חזה עוף",
        macro_type=MacroType.PROTEIN,
        calories=165,
        protein=31.0,
        carbs=0.0,
        fat=3.6,
        serving_size="100g",
        measurement_type=MeasurementType.PER_100G,
        notes=None,
        is_public=True,
        created_by=1,
    ),
    V3FoodCatalogItemResponse(
        id=102,
        name="Greek Yogurt",
        name_hebrew="יוגורט יווני",
        macro_type=MacroType.PROTEIN,
        calories=59,
        protein=10.3,
        carbs=3.6,
        fat=0.4,
        serving_size="100g",
        measurement_type=MeasurementType.PER_100G,
        notes=None,
        is_public=True,
        created_by=1,
    ),
    # Carbs
    V3FoodCatalogItemResponse(
        id=201,
        name="Oats",
        name_hebrew="שיבולת שועל",
        macro_type=MacroType.CARB,
        calories=389,
        protein=16.9,
        carbs=66.3,
        fat=6.9,
        serving_size="100g",
        measurement_type=MeasurementType.PER_100G,
        notes=None,
        is_public=True,
        created_by=1,
    ),
    V3FoodCatalogItemResponse(
        id=202,
        name="Brown Rice",
        name_hebrew="אורז מלא",
        macro_type=MacroType.CARB,
        calories=111,
        protein=2.6,
        carbs=23.0,
        fat=1.8,
        serving_size="100g",
        measurement_type=MeasurementType.PER_100G,
        notes=None,
        is_public=True,
        created_by=1,
    ),
    # Fat
    V3FoodCatalogItemResponse(
        id=301,
        name="Olive Oil",
        name_hebrew="שמן זית",
        macro_type=MacroType.FAT,
        calories=884,
        protein=0.0,
        carbs=0.0,
        fat=100.0,
        serving_size="100g",
        measurement_type=MeasurementType.PER_100G,
        notes=None,
        is_public=True,
        created_by=1,
    ),
    V3FoodCatalogItemResponse(
        id=302,
        name="Avocado",
        name_hebrew="אבוקדו",
        macro_type=MacroType.FAT,
        calories=160,
        protein=2.0,
        carbs=8.5,
        fat=14.7,
        serving_size="100g",
        measurement_type=MeasurementType.PER_100G,
        notes=None,
        is_public=True,
        created_by=1,
    ),
]

_MOCK_DAY_TARGETS = {
    "calories": 2000.0,
    "protein": 150.0,
    "carbs": 200.0,
    "fat": 60.0,
}

# In-memory store so the UI can update totals while testing.
# Keyed by date -> category selection id composite.
_MOCK_LOGS_BY_DATE: dict[str, dict[str, V3MealLogCreateRequest]] = {}


def _parse_quantity_value(quantity: str | None) -> float:
    if not quantity:
        return 100.0
    # Accept "150g", "150", "2 pieces" etc.
    import re

    match = re.search(r"(\d+(?:\.\d+)?)", quantity)
    if not match:
        return 100.0
    try:
        return float(match.group(1))
    except ValueError:
        return 100.0


def _scale_from_measurement_type(
    measurement_type: MeasurementType,
    quantity_value: float,
) -> float:
    # Mock catalog uses per_100g, but keep it generic.
    if measurement_type == MeasurementType.PER_PORTION:
        return quantity_value
    return quantity_value / 100.0


def _find_catalog_item(food_option_id: int) -> V3FoodCatalogItemResponse | None:
    for item in _MOCK_CATALOG:
        if item.id == food_option_id:
            return item
    return None


def _compute_choice_macros(
    log: V3MealLogCreateRequest,
) -> tuple[float, float, float, float]:
    """
    Return (calories, protein, carbs, fat) for this log entry.
    """
    if log.food_option_id is not None:
        food = _find_catalog_item(log.food_option_id)
        if not food:
            return (0.0, 0.0, 0.0, 0.0)
        q = _parse_quantity_value(log.quantity)
        scale = _scale_from_measurement_type(food.measurement_type, q)
        calories = float(food.calories or 0) * scale
        protein = float(food.protein or 0) * scale
        carbs = float(food.carbs or 0) * scale
        fat = float(food.fat or 0) * scale
        return (calories, protein, carbs, fat)

    # Custom food (not used heavily yet, but supported by contract).
    return (
        float(log.custom_calories or 0),
        float(log.custom_protein or 0),
        float(log.custom_carbs or 0),
        float(log.custom_fat or 0),
    )


def _build_daily_macros_from_logs(date_str: str) -> V3DailyMacrosResponse:
    logs_for_date = _MOCK_LOGS_BY_DATE.get(date_str, {})
    total_calories = 0.0
    total_protein = 0.0
    total_carbs = 0.0
    total_fat = 0.0

    for log in logs_for_date.values():
        cal, pro, carbs, fat = _compute_choice_macros(log)
        total_calories += cal
        total_protein += pro
        total_carbs += carbs
        total_fat += fat

    targets = _MOCK_DAY_TARGETS
    consumed = V3MacroTotals(
        calories=round(total_calories, 1),
        protein=round(total_protein, 1),
        carbs=round(total_carbs, 1),
        fat=round(total_fat, 1),
    )
    targets_payload = V3MacroTotals(**targets)
    remaining = V3MacroTotals(
        calories=round(max(0.0, targets["calories"] - total_calories), 1),
        protein=round(max(0.0, targets["protein"] - total_protein), 1),
        carbs=round(max(0.0, targets["carbs"] - total_carbs), 1),
        fat=round(max(0.0, targets["fat"] - total_fat), 1),
    )
    percentages = V3MacroTotals(
        calories=round((total_calories / targets["calories"] * 100.0) if targets["calories"] > 0 else 0.0, 1),
        protein=round((total_protein / targets["protein"] * 100.0) if targets["protein"] > 0 else 0.0, 1),
        carbs=round((total_carbs / targets["carbs"] * 100.0) if targets["carbs"] > 0 else 0.0, 1),
        fat=round((total_fat / targets["fat"] * 100.0) if targets["fat"] > 0 else 0.0, 1),
    )

    return V3DailyMacrosResponse(
        consumed=consumed,
        targets=targets_payload,
        remaining=remaining,
        percentages=percentages,
    )


def _category_key(meal_slot_id: int, macro_type: MacroType) -> str:
    return f"{meal_slot_id}:{macro_type}"


def _mock_log_storage_key(payload: V3MealLogCreateRequest) -> str:
    """
    One log per (slot, macro, plan food or custom payload) so multiple plan foods per category work.
    """
    slot_id = payload.meal_slot_id
    macro = payload.macro_type
    if payload.food_option_id is not None:
        return f"{slot_id}:{macro}:f:{payload.food_option_id}"
    custom = (payload.custom_food_name or "").strip()
    return f"{slot_id}:{macro}:c:{custom}"


@router.get("/catalog", response_model=List[V3FoodCatalogItemResponse])
def get_mock_catalog(
    macro_type: Optional[MacroType] = None,
    include_public: bool = True,  # ignored in mock
):
    if macro_type is None:
        return list(_MOCK_CATALOG)
    return [item for item in _MOCK_CATALOG if item.macro_type == macro_type]


@router.post("/plans", response_model=V3MealPlanResponse, status_code=201)
def create_mock_plan(payload: V3CompleteMealPlanCreate):
    # For mock testing, return a deterministic plan response without persisting anything.
    # The trainer UI checks `response.ok` only.
    return V3MealPlanResponse(
        id=999,
        client_id=payload.client_id,
        trainer_id=1,
        name=payload.name,
        description=payload.description,
        number_of_meals=payload.number_of_meals,
        total_calories=payload.total_calories,
        protein_target=payload.protein_target,
        carb_target=payload.carb_target,
        fat_target=payload.fat_target,
        is_active=True,
        start_date=None,
        end_date=None,
        created_at=None,
        updated_at=None,
        meal_slots=[
            {
                "id": i + 1,
                "meal_plan_id": 999,
                "name": slot.name,
                "time_suggestion": slot.time_suggestion,
                "notes": slot.notes,
                "order_index": i,
                "target_calories": slot.target_calories,
                "target_protein": slot.target_protein,
                "target_carbs": slot.target_carbs,
                "target_fat": slot.target_fat,
                "created_at": None,
                "macro_categories": [
                    {
                        "id": j + 1,
                        "meal_slot_id": i + 1,
                        "macro_type": mc.macro_type,
                        "quantity_instruction": mc.quantity_instruction,
                        "calorie_goal": mc.calorie_goal,
                        "track_cross_macros": mc.track_cross_macros,
                        "notes": mc.notes,
                        "food_options": [
                            {
                                "id": k + 1,
                                "name": f.name,
                                "name_hebrew": f.name_hebrew,
                                "calories": f.calories,
                                "protein": f.protein,
                                "carbs": f.carbs,
                                "fat": f.fat,
                                "serving_size": f.serving_size,
                                "measurement_type": f.measurement_type,
                                "notes": f.notes,
                                "order_index": 0,
                                "macro_category_id": j + 1,
                                "created_at": None,
                            }
                            for k, f in enumerate(mc.food_options or [])
                        ],
                        "created_at": None,
                    }
                    for j, mc in enumerate(slot.macro_categories)
                ],
            }
            for i, slot in enumerate(payload.meal_slots)
        ],
    )


@router.get("/day", response_model=V3DayViewResponse)
def get_mock_day_view(date: str):
    # date is YYYY-MM-DD in the UI flow.
    date_str = date
    daily_macros = _build_daily_macros_from_logs(date_str)

    # Build stable slot structure for UI testing.
    slot_defs = [
        {"id": 1, "name": "Breakfast", "time_suggestion": "08:00", "order_index": 0},
        {"id": 2, "name": "Lunch", "time_suggestion": "12:30", "order_index": 1},
    ]

    slots: list = []
    logs_for_date = _MOCK_LOGS_BY_DATE.get(date_str, {})

    choices_payload: List[ClientMealChoiceResponse] = []
    for idx, (_k, log) in enumerate(logs_for_date.items(), start=1):
        dt = datetime.fromisoformat(str(log.date).replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            dt = dt.replace(tzinfo=None)
        choices_payload.append(
            ClientMealChoiceResponse(
                id=idx,
                client_id=1,
                food_option_id=log.food_option_id,
                meal_slot_id=log.meal_slot_id,
                date=dt,
                quantity=log.quantity,
                photo_path=log.photo_path,
                is_approved=None,
                trainer_comment=None,
                created_at=datetime.utcnow(),
                custom_food_name=log.custom_food_name,
                custom_calories=log.custom_calories,
                custom_protein=log.custom_protein,
                custom_carbs=log.custom_carbs,
                custom_fat=log.custom_fat,
            )
        )

    for slot in slot_defs:
        slot_id = slot["id"]
        categories: list = []
        for macro_type in [MacroType.PROTEIN, MacroType.CARB, MacroType.FAT]:
            recommended_foods = [f for f in _MOCK_CATALOG if f.macro_type == macro_type]

            prefix = f"{slot_id}:{macro_type}:"
            first_log = None
            for k, lg in logs_for_date.items():
                if k.startswith(prefix):
                    first_log = lg
                    break

            chosen_food: V3ChosenFood | None = None
            if first_log:
                macros = _compute_choice_macros(first_log)
                chosen_food = V3ChosenFood(
                    source="plan_food",
                    meal_slot_id=first_log.meal_slot_id,
                    macro_type=first_log.macro_type,
                    food_option_id=first_log.food_option_id,
                    custom_food_name=first_log.custom_food_name,
                    quantity=first_log.quantity,
                    display_calories=round(macros[0], 1),
                    display_protein=round(macros[1], 1),
                    display_carbs=round(macros[2], 1),
                    display_fat=round(macros[3], 1),
                )

            categories.append(
                {
                    "macro_type": macro_type,
                    "macro_category_id": None,
                    "quantity_instruction": "100g",
                    "notes": None,
                    "recommended_foods": recommended_foods,
                    "chosen_food": chosen_food,
                }
            )

        slots.append(
            {
                "meal_slot_id": slot_id,
                "name": slot["name"],
                "time_suggestion": slot["time_suggestion"],
                "notes": None,
                "order_index": slot["order_index"],
                "categories": categories,
            }
        )

    return V3DayViewResponse(
        date=date_str,
        meal_plan=None,
        slots=slots,
        daily_macros=daily_macros,
        choices=choices_payload,
    )


@router.get("/day/summary", response_model=V3DailyMacrosResponse)
def get_mock_day_summary(date: str):
    return _build_daily_macros_from_logs(date)


@router.post("/logs")
def create_mock_log(payload: V3MealLogCreateRequest):
    date_str = payload.date
    if date_str not in _MOCK_LOGS_BY_DATE:
        _MOCK_LOGS_BY_DATE[date_str] = {}

    key = _mock_log_storage_key(payload)
    _MOCK_LOGS_BY_DATE[date_str][key] = payload

    # Stateless response; UI will refetch `/day` for totals.
    return {"ok": True}


@router.delete("/logs")
def delete_mock_log(payload: V3MealLogCreateRequest):
    """
    Remove a logged choice from the in-memory store.
    The UI uses this to support "swipe to delete" and "remove from Food bank".
    """
    date_str = payload.date
    logs_for_date = _MOCK_LOGS_BY_DATE.get(date_str)
    if not logs_for_date:
        return {"ok": True}

    # Legacy category-wide clear (no specific food/custom key in payload).
    if payload.food_option_id is None and not (payload.custom_food_name or "").strip():
        prefix = f"{payload.meal_slot_id}:{payload.macro_type}:"
        for k in list(logs_for_date.keys()):
            if k.startswith(prefix):
                logs_for_date.pop(k, None)
        return {"ok": True}

    key = _mock_log_storage_key(payload)
    logs_for_date.pop(key, None)
    return {"ok": True}

