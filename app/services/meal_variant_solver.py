"""
Pure stdlib solver for meal variant composition.
Uses projected gradient descent to fit foods to macro targets.
No external dependencies (no numpy/scipy).
"""

import math
from typing import Any, List, Tuple, Dict
from dataclasses import dataclass


def enum_value(value: Any) -> Any:
    """Return `.value` for an Enum member, or the value unchanged if it's already a plain str."""
    return value.value if hasattr(value, "value") else value


@dataclass
class Food:
    """
    A food item with macros expressed per ONE unit of `amount`.

    `amount` is grams for per_100g foods and portions for per_portion foods, so the
    per_100g macros coming off MealBank must be divided by 100 before they land here.
    Build via `food_from_bank_values` rather than constructing directly, or the solver
    will read per-100g numbers as per-gram and overstate every macro 100x.
    """
    id: int
    name: str
    name_hebrew: str
    measurement_type: str  # per_100g|per_portion
    per_unit_calories: float
    per_unit_protein: float
    per_unit_carbs: float
    per_unit_fat: float
    min_amount: float  # grams or portions
    max_amount: float


def unit_scale(measurement_type: str) -> float:
    """
    Divisor converting a MealBank row's macros into per-one-unit-of-amount macros.
    per_100g rows are quoted per 100 grams; per_portion rows are already per portion.
    """
    return 100.0 if measurement_type == "per_100g" else 1.0


def food_from_bank_values(
    *,
    id: int,
    name: str,
    name_hebrew: str,
    measurement_type: str,
    calories: float,
    protein: float,
    carbs: float,
    fat: float,
    min_amount: float,
    max_amount: float,
) -> "Food":
    """Build a solver Food from raw MealBank macro values, applying the unit scale."""
    scale = unit_scale(measurement_type)
    return Food(
        id=id,
        name=name,
        name_hebrew=name_hebrew,
        measurement_type=measurement_type,
        per_unit_calories=float(calories) / scale,
        per_unit_protein=float(protein) / scale,
        per_unit_carbs=float(carbs) / scale,
        per_unit_fat=float(fat) / scale,
        min_amount=min_amount,
        max_amount=max_amount,
    )


@dataclass
class MacroBudget:
    """Target macros for a meal"""
    calories: float
    protein: float
    carbs: float
    fat: float


@dataclass
class Solution:
    """Result of solving for food quantities"""
    food_amounts: Dict[int, float]  # food_id -> quantity (grams or portions)
    computed_calories: float
    computed_protein: float
    computed_carbs: float
    computed_fat: float
    residual_norm: float  # How far from target (0 is perfect)


def solve_macro_targets(
    foods: List[Food],
    budget: MacroBudget,
    weights: Tuple[float, float, float, float] = (0.35, 1.0, 1.0, 1.0),
) -> Solution:
    """
    Solve for food quantities to hit macro targets.

    Uses projected gradient descent:
    - Minimizes sum of weighted squared macro errors
    - Weights: (calories, protein, carbs, fat)
    - Default: protein/carbs/fat = 1.0 each, calories = 0.35 (redundant with 4P+4C+9F)

    Returns Solution with quantities and computed macros.
    """
    if not foods:
        return Solution(
            food_amounts={},
            computed_calories=0,
            computed_protein=0,
            computed_carbs=0,
            computed_fat=0,
            residual_norm=0,
        )

    n = len(foods)

    # Scale each macro by 1/T so the four residual terms are comparable. A zero target
    # still needs a finite scale, otherwise its error term drops out of the objective
    # and the solver is free to pile that macro on without penalty.
    scales = (
        1.0 / (budget.calories if budget.calories > 0 else 1.0),
        1.0 / (budget.protein if budget.protein > 0 else 1.0),
        1.0 / (budget.carbs if budget.carbs > 0 else 1.0),
        1.0 / (budget.fat if budget.fat > 0 else 1.0),
    )
    targets = (budget.calories, budget.protein, budget.carbs, budget.fat)

    def macro_row(food: Food) -> Tuple[float, float, float, float]:
        return (
            food.per_unit_calories,
            food.per_unit_protein,
            food.per_unit_carbs,
            food.per_unit_fat,
        )

    rows = [macro_row(food) for food in foods]

    def totals(vec: List[float]) -> Tuple[float, float, float, float]:
        out = [0.0, 0.0, 0.0, 0.0]
        for i in range(n):
            for m in range(4):
                out[m] += vec[i] * rows[i][m]
        return (out[0], out[1], out[2], out[3])

    def residual_of(vec: List[float]) -> float:
        current = totals(vec)
        acc = 0.0
        for m in range(4):
            err = (current[m] - targets[m]) * scales[m]
            acc += weights[m] * err * err
        return math.sqrt(acc)

    # Initial guess: midpoint of each food's band
    x = [(foods[i].min_amount + foods[i].max_amount) / 2 for i in range(n)]

    # Step size from a Lipschitz bound on the (convex, quadratic) objective rather than a
    # hand-tuned constant, so convergence does not depend on the magnitude of the macros.
    lipschitz = 0.0
    for i in range(n):
        for m in range(4):
            a = rows[i][m] * scales[m]
            lipschitz += 2.0 * weights[m] * a * a
    step_size = 1.0 / lipschitz if lipschitz > 0 else 0.0

    max_iterations = 500
    tolerance = 1e-9

    for _ in range(max_iterations):
        current = totals(x)
        # d/dx[i] = sum_m 2 * w_m * (total_m - T_m) * scale_m^2 * a_mi
        gradient = [0.0] * n
        for i in range(n):
            g = 0.0
            for m in range(4):
                g += 2.0 * weights[m] * (current[m] - targets[m]) * scales[m] * scales[m] * rows[i][m]
            gradient[i] = g

        moved = 0.0
        for i in range(n):
            updated = x[i] - step_size * gradient[i]
            # Project back into the feasible band.
            updated = max(foods[i].min_amount, min(foods[i].max_amount, updated))
            moved = max(moved, abs(updated - x[i]))
            x[i] = updated

        if moved < tolerance:
            break

    final_calories, final_protein, final_carbs, final_fat = totals(x)
    final_residual = residual_of(x)

    food_amounts = {foods[i].id: x[i] for i in range(n)}

    return Solution(
        food_amounts=food_amounts,
        computed_calories=final_calories,
        computed_protein=final_protein,
        computed_carbs=final_carbs,
        computed_fat=final_fat,
        residual_norm=final_residual,
    )


def round_quantity(
    amount: float,
    measurement_type: str,  # per_100g or per_portion
) -> Tuple[float, str]:
    """
    Round quantity to human-friendly increments.

    Returns: (rounded_amount, display_label)
    """
    if measurement_type == "per_portion":
        # Round to nearest 0.5 portion, minimum 0.5
        rounded = max(0.5, round(amount * 2) / 2)
        if rounded == int(rounded):
            label = f"{int(rounded)}"
        else:
            label = f"{rounded}"
        return rounded, label
    else:  # per_100g
        # Round to nearest 5g, minimum 5g
        rounded = max(5.0, round(amount / 5) * 5)
        label = f"{int(rounded)}g"
        return rounded, label


def get_hard_bounds(measurement_type: str, macro_type: str) -> Tuple[float, float]:
    """
    Get hard bounds for food amounts by type.

    Prevents Claude from suggesting 310g olive oil or 0.05 portions of bread.
    """
    if measurement_type == "per_portion":
        # Portions: 0.5 to 4-5 depending on macro
        if macro_type == "protein":
            return 0.5, 4.0
        elif macro_type == "carb":
            return 0.5, 5.0
        else:  # fat
            return 0.5, 3.0
    else:  # per_100g
        # Grams: 5g to 350-400g depending on macro
        if macro_type == "protein":
            return 30.0, 350.0
        elif macro_type == "carb":
            return 20.0, 400.0
        else:  # fat
            return 3.0, 60.0


def clamp_bounds(
    min_amount: float,
    max_amount: float,
    measurement_type: str,
    macro_type: str,
) -> Tuple[float, float]:
    """
    Clamp a suggested band into the hard limits for this food type.

    The result is always a valid (min <= max) range. A caller passing a gram-scale band
    for a per_portion food would otherwise invert the range (e.g. 50..150 against hard
    limits 0.5..4 yields min=50, max=4), and the solver's projection step would then pin
    the amount to 50 *portions*.
    """
    hard_min, hard_max = get_hard_bounds(measurement_type, macro_type)
    clamped_min = min(max(min_amount, hard_min), hard_max)
    clamped_max = max(min(max_amount, hard_max), hard_min)
    if clamped_min > clamped_max:
        clamped_min, clamped_max = clamped_max, clamped_min
    return clamped_min, clamped_max
