"""
Meal Tracking V3 service helpers.

The current V3 API is backed by the existing Meal System V2 tables, but exposes a distinct `/api/v3/meals`
contract for the frontend redesign.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple, Dict, Any

from sqlalchemy.orm import Session, joinedload

from app.models.meal_system import (
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
from app.schemas.meal_system import ClientMealChoiceResponse
from app.schemas.meal_tracking_v3 import (
    V3DailyMacrosResponse,
    V3MacroTotals,
    V3MealSlotView,
    V3MacroCategoryView,
    V3FoodOption,
    V3ChosenFood,
    V3MealLogCreateRequest,
)
from app.schemas.auth import UserResponse, UserRole


def _parse_v3_date_to_day(date_str: str) -> datetime:
    """
    Normalize a v3 `date` string to a naive UTC datetime at start-of-day.
    """
    # Support YYYY-MM-DD and ISO datetime strings.
    if "T" in date_str:
        parsed = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        if parsed.tzinfo:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed.replace(hour=0, minute=0, second=0, microsecond=0)

    parsed_day = datetime.fromisoformat(date_str)
    return parsed_day.replace(hour=0, minute=0, second=0, microsecond=0)


def _parse_quantity_value(quantity: Optional[str]) -> float:
    """
    Extract numeric quantity from strings like `150g`, `150`, `2 slices`, `2`.
    """
    if not quantity:
        return 1.0

    match = re.search(r"(\d+(?:\.\d+)?)", quantity)
    if not match:
        return 1.0

    try:
        return float(match.group(1))
    except ValueError:
        return 1.0


def _scale_from_measurement_type(
    measurement_type: MeasurementType,
    quantity_value: float,
) -> float:
    if measurement_type == MeasurementType.PER_PORTION:
        return quantity_value
    # Default: per_100g
    return quantity_value / 100.0 if quantity_value is not None else 1.0


def _food_option_to_v3_food(food: FoodOption) -> V3FoodOption:
    return V3FoodOption(
        id=food.id,
        name=food.name,
        name_hebrew=food.name_hebrew,
        calories=food.calories,
        protein=food.protein,
        carbs=food.carbs,
        fat=food.fat,
        serving_size=food.serving_size,
        measurement_type=food.measurement_type,
        notes=food.notes,
    )


def _compute_plan_food_macros(food: FoodOption, choice_quantity: Optional[str]) -> Tuple[float, float, float, float]:
    quantity_value = _parse_quantity_value(choice_quantity)
    scale = _scale_from_measurement_type(food.measurement_type, quantity_value)

    calories = float((food.calories or 0) * scale)
    protein = float((food.protein or 0) * scale)
    carbs = float((food.carbs or 0) * scale)
    fat = float((food.fat or 0) * scale)
    return calories, protein, carbs, fat


def _compute_daily_macros_v3(
    db: Session,
    target_client_id: int,
    target_day: datetime,
    meal_plan: Optional[MealPlanV2] = None,
) -> V3DailyMacrosResponse:
    start_of_day = target_day.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)

    choices: List[ClientMealChoice] = (
        db.query(ClientMealChoice)
        .filter(
            ClientMealChoice.client_id == target_client_id,
            ClientMealChoice.date >= start_of_day,
            ClientMealChoice.date < end_of_day,
        )
        .all()
    )

    total_calories = 0.0
    total_protein = 0.0
    total_carbs = 0.0
    total_fat = 0.0

    for choice in choices:
        if choice.custom_food_name:
            if choice.custom_calories is not None:
                total_calories += float(choice.custom_calories)
            if choice.custom_protein is not None:
                total_protein += float(choice.custom_protein)
            if choice.custom_carbs is not None:
                total_carbs += float(choice.custom_carbs)
            if choice.custom_fat is not None:
                total_fat += float(choice.custom_fat)
        elif choice.food_option_id:
            food_option = db.query(FoodOption).filter(FoodOption.id == choice.food_option_id).first()
            if not food_option:
                continue

            calories, protein, carbs, fat = _compute_plan_food_macros(food_option, choice.quantity)
            total_calories += calories
            total_protein += protein
            total_carbs += carbs
            total_fat += fat

    if meal_plan is None:
        meal_plan = (
            db.query(MealPlanV2)
            .filter(MealPlanV2.client_id == target_client_id, MealPlanV2.is_active == True)
            .first()
        )

    targets = {
        "calories": float(meal_plan.total_calories) if meal_plan and meal_plan.total_calories else 2000.0,
        "protein": float(meal_plan.protein_target) if meal_plan and meal_plan.protein_target else 150.0,
        "carbs": float(meal_plan.carb_target) if meal_plan and meal_plan.carb_target else 200.0,
        "fat": float(meal_plan.fat_target) if meal_plan and meal_plan.fat_target else 60.0,
    }

    # v2 returns 1 decimal; keep consistent.
    consumed = V3MacroTotals(
        calories=round(total_calories, 1),
        protein=round(total_protein, 1),
        carbs=round(total_carbs, 1),
        fat=round(total_fat, 1),
    )
    targets_payload = V3MacroTotals(
        calories=targets["calories"],
        protein=targets["protein"],
        carbs=targets["carbs"],
        fat=targets["fat"],
    )
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


def build_v3_day_slots_view(
    db: Session,
    plan: MealPlanV2,
    choices: List[ClientMealChoice],
) -> List[V3MealSlotView]:
    """
    Build the day structure (slots -> macro categories -> recommended foods).

    For now, `chosen_food` is populated only for plan foods where the `food_option_id` maps to a food option.
    Custom foods are available via the raw `choices` list in the day response.
    """

    # For faster lookup.
    plan_foods_by_id: Dict[int, FoodOption] = {}
    plan_slot_by_food_id: Dict[int, int] = {}
    plan_macro_type_by_food_id: Dict[int, MacroType] = {}

    for slot in plan.meal_slots:
        for category in slot.macro_categories:
            for food in sorted(category.food_options, key=lambda f: f.order_index or 0):
                plan_foods_by_id[food.id] = food
                plan_slot_by_food_id[food.id] = slot.id
                plan_macro_type_by_food_id[food.id] = category.macro_type

    # Picks the latest choice per food option id.
    latest_choice_by_food_id: Dict[int, ClientMealChoice] = {}
    for choice in sorted(choices, key=lambda c: c.date or datetime.min, reverse=True):
        if choice.food_option_id and choice.food_option_id in plan_foods_by_id:
            latest_choice_by_food_id[choice.food_option_id] = choice

    slot_views: List[V3MealSlotView] = []

    for slot in plan.meal_slots:
        categories: List[V3MacroCategoryView] = []
        for category in slot.macro_categories:
            sorted_food_options = sorted(category.food_options, key=lambda f: f.order_index or 0)
            recommended_foods = [
                _food_option_to_v3_food(food)
                for food in sorted_food_options
            ]

            chosen_food: Optional[V3ChosenFood] = None
            # Find a chosen food that belongs to this category.
            for food in sorted_food_options:
                choice = latest_choice_by_food_id.get(food.id)
                if not choice:
                    continue
                calories, protein, carbs, fat = _compute_plan_food_macros(food, choice.quantity)
                chosen_food = V3ChosenFood(
                    source="plan_food",
                    meal_slot_id=choice.meal_slot_id or slot.id,
                    macro_type=category.macro_type,
                    food_option_id=food.id,
                    quantity=choice.quantity,
                    display_calories=round(calories, 1),
                    display_protein=round(protein, 1),
                    display_carbs=round(carbs, 1),
                    display_fat=round(fat, 1),
                )
                break

            categories.append(
                V3MacroCategoryView(
                    macro_type=category.macro_type,
                    macro_category_id=category.id,
                    quantity_instruction=category.quantity_instruction,
                    notes=category.notes,
                    recommended_foods=recommended_foods,
                    chosen_food=chosen_food,
                )
            )

        slot_views.append(
            V3MealSlotView(
                meal_slot_id=slot.id,
                name=slot.name,
                time_suggestion=slot.time_suggestion,
                notes=slot.notes,
                order_index=slot.order_index,
                categories=categories,
            )
        )

    # Sort for safety (order_index should already exist).
    slot_views.sort(key=lambda s: s.order_index)
    return slot_views

