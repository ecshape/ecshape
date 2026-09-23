"""
Claude AI service for meal variant composition.
Groups favorites into coherent meals and generates Hebrew names.
"""

import json
import logging
import os
from typing import List, Optional, Tuple, FrozenSet

from app.models.meal_system import MealBank
from app.schemas.meal_variants_v3 import AIVariantSet, AIVariant, AIVariantFood

logger = logging.getLogger(__name__)

# Structured output is requested via a forced tool call (the documented pattern for the
# Messages API) rather than a nonexistent `messages.parse`/`output_format` helper.
MODEL_ID = "claude-opus-4-5-20251101"

VARIANT_TOOL_SCHEMA = {
    "name": "submit_meal_variants",
    "description": "Submit the 3 composed meal variants.",
    "input_schema": {
        "type": "object",
        "properties": {
            "variants": {
                "type": "array",
                "minItems": 3,
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "properties": {
                        "name_hebrew": {"type": "string", "maxLength": 40},
                        "foods": {
                            "type": "array",
                            "minItems": 2,
                            "maxItems": 6,
                            "items": {
                                "type": "object",
                                "properties": {
                                    "food_id": {"type": "integer"},
                                    "min_amount": {"type": "number"},
                                    "max_amount": {"type": "number"},
                                },
                                "required": ["food_id", "min_amount", "max_amount"],
                            },
                        },
                    },
                    "required": ["name_hebrew", "foods"],
                },
            },
        },
        "required": ["variants"],
    },
}


def _get_anthropic_client():
    """Lazy-import anthropic to avoid breaking the app when the package or key is missing."""
    try:
        import anthropic
    except ImportError:
        return None

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    return anthropic.Anthropic(api_key=api_key)


SYSTEM_PROMPT = """You are composing personalized meal variants from a client's favorite foods.

Your task: Create exactly 3 distinct meal variants, each using only foods from the provided list.

Rules:
1. Use ONLY foods by their integer `id` from the provided list; never invent a food id.
2. Each variant should have 2–6 foods that form a coherent meal.
3. Include at least one protein-dominant food and one carb-dominant food when both exist in the favorites.
4. The 3 variants must differ meaningfully in composition (not just order).
5. Do NOT compute grams or macros—only provide realistic `min_amount` and `max_amount` bands:
   - For `per_portion` foods: bands in portions (e.g., 0.5–2)
   - For `per_100g` foods: bands in grams (e.g., 50–150)
6. Variant names in Hebrew only, ≤40 chars, style "בוקר - כריך" (meal type - food).
7. Call the submit_meal_variants tool exactly once with your answer.

For each variant:
- Focus on realistic portion ranges that a client would actually eat.
- Group foods that pair well (e.g., chicken + rice + tahini).
- Never suggest extreme amounts (tiny sips or massive quantities).
"""


def _extract_tool_input(response) -> Optional[dict]:
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "submit_meal_variants":
            return block.input
    return None


def _call_claude(messages: List[dict]) -> Optional[AIVariantSet]:
    """
    Shared call path for the initial composition and the one retry.
    Returns AIVariantSet on success, None on any error (caller falls back to deterministic).
    """
    client = _get_anthropic_client()
    if not client:
        return None

    try:
        response = client.with_options(timeout=45.0, max_retries=1).messages.create(
            model=MODEL_ID,
            max_tokens=8000,
            system=SYSTEM_PROMPT,
            tools=[VARIANT_TOOL_SCHEMA],
            tool_choice={"type": "tool", "name": "submit_meal_variants"},
            messages=messages,
        )

        tool_input = _extract_tool_input(response)
        if tool_input is None:
            logger.error("Claude response had no submit_meal_variants tool call")
            return None

        return AIVariantSet.model_validate(tool_input)

    except Exception as e:
        logger.error(f"Claude call failed (request_id={getattr(e, 'request_id', None)}): {e}")
        return None


def _build_payload(
    favorite_foods: List[MealBank],
    calories_target: float,
    protein_target: float,
    carbs_target: float,
    fat_target: float,
    slot_name: str,
) -> dict:
    foods_data = []
    for food in favorite_foods:
        foods_data.append({
            "id": food.id,
            "name": food.name,
            "name_hebrew": food.name_hebrew,
            "macro_type": food.macro_type.value if hasattr(food.macro_type, 'value') else food.macro_type,
            "measurement_type": food.measurement_type.value if hasattr(food.measurement_type, 'value') else food.measurement_type,
            "per_unit": {
                "calories": float(food.calories),
                "protein": float(food.protein),
                "carbs": float(food.carbs),
                "fat": float(food.fat),
            },
            "unit": food.serving_size,
        })

    return {
        "meal_slot": slot_name,
        "budget": {
            "calories": calories_target,
            "protein": protein_target,
            "carbs": carbs_target,
            "fat": fat_target,
        },
        "foods": foods_data,
    }


def compose_variants_with_claude(
    favorite_foods: List[MealBank],
    calories_target: float,
    protein_target: float,
    carbs_target: float,
    fat_target: float,
    slot_name: str = "meal",
) -> Optional[AIVariantSet]:
    """
    Call Claude to compose 3 meal variants. Returns None on any error or missing key;
    caller falls back to the deterministic composer.
    """
    payload = _build_payload(
        favorite_foods, calories_target, protein_target, carbs_target, fat_target, slot_name
    )
    return _call_claude([
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False, sort_keys=True)}
    ])


def validate_and_clamp_variants(
    variants: AIVariantSet,
    favorite_foods_by_id: dict,
    budget: Tuple[float, float, float, float],  # (cal, pro, carb, fat)
) -> Tuple[Optional[AIVariantSet], Optional[str]]:
    """
    Validate Claude's response and clamp bands to hard limits.

    Returns: (validated_set, error_message)
    If any check fails, returns (None, error) for retry.
    """
    if not variants or not variants.variants:
        return None, "No variants in response"

    if len(variants.variants) != 3:
        return None, f"Expected 3 variants, got {len(variants.variants)}"

    # Import here to avoid circular import
    from app.services.meal_variant_solver import clamp_bounds

    validated_variants = []

    for i, variant in enumerate(variants.variants):
        # Check name
        if not variant.name_hebrew or len(variant.name_hebrew) > 40:
            variant.name_hebrew = f"אפשרות {i+1}"

        # Validate and clamp foods
        valid_foods = []
        food_ids_set = set()

        for food_info in variant.foods:
            food_id = food_info.food_id

            # Check food exists in favorites
            if food_id not in favorite_foods_by_id:
                logger.warning(f"Variant {i}: food_id {food_id} not in favorites, dropping")
                continue

            food = favorite_foods_by_id[food_id]
            macro_type = food.macro_type.value if hasattr(food.macro_type, 'value') else food.macro_type
            measurement_type = food.measurement_type.value if hasattr(food.measurement_type, 'value') else food.measurement_type

            # Clamp bounds to hard limits
            min_amt, max_amt = clamp_bounds(
                food_info.min_amount,
                food_info.max_amount,
                measurement_type,
                macro_type,
            )

            valid_foods.append(
                AIVariantFood(
                    food_id=food_id,
                    min_amount=min_amt,
                    max_amount=max_amt,
                )
            )
            food_ids_set.add(food_id)

        if len(valid_foods) < 2:
            return None, f"Variant {i}: fewer than 2 foods after filtering"

        variant.foods = valid_foods
        validated_variants.append((variant, frozenset(food_ids_set)))

    # Check uniqueness: each variant must have a distinct food set
    seen_sets: List[FrozenSet[int]] = []
    for i, (variant, food_set) in enumerate(validated_variants):
        if food_set in seen_sets:
            return None, f"Variant {i}: duplicate food set"
        seen_sets.append(food_set)

    # Reconstruct response
    validated_set = AIVariantSet(
        variants=[v[0] for v in validated_variants]
    )
    return validated_set, None


def retry_with_error(
    favorite_foods: List[MealBank],
    calories_target: float,
    protein_target: float,
    carbs_target: float,
    fat_target: float,
    slot_name: str,
    error_message: str,
) -> Optional[AIVariantSet]:
    """
    Retry Claude call once with the validation error appended as a second user turn.
    """
    logger.info(f"Retrying Claude call with error context: {error_message}")

    payload = _build_payload(
        favorite_foods, calories_target, protein_target, carbs_target, fat_target, slot_name
    )
    return _call_claude([
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False, sort_keys=True)},
        {"role": "user", "content": f"Validation error: {error_message}. Please fix and retry."},
    ])
