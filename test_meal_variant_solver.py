"""
Standalone tests for the meal variant solver (stdlib only, no pytest needed).

    python test_meal_variant_solver.py

Covers the per_100g unit scale in particular: MealBank quotes macros per 100g while
amounts are in grams, and conflating the two overstated every macro by 100x.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.services.meal_variant_solver import (
    food_from_bank_values, MacroBudget, solve_macro_targets, round_quantity, unit_scale,
)

fails = []
def check(name, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + name + (f"  {detail}" if detail else ""))
    if not cond: fails.append(name)

# Realistic per-100g foods.
chicken = food_from_bank_values(id=1, name="Chicken", name_hebrew="עוף", measurement_type="per_100g",
                                calories=165, protein=31, carbs=0, fat=3.6, min_amount=80, max_amount=250)
rice    = food_from_bank_values(id=2, name="Rice", name_hebrew="אורז", measurement_type="per_100g",
                                calories=130, protein=2.7, carbs=28, fat=0.3, min_amount=50, max_amount=300)
oil     = food_from_bank_values(id=3, name="Olive oil", name_hebrew="שמן", measurement_type="per_100g",
                                calories=884, protein=0, carbs=0, fat=100, min_amount=5, max_amount=30)

# 1) Unit scale: 150g chicken = 247.5 kcal, NOT 24,750.
cal_150g = 150 * chicken.per_unit_calories
check("150g chicken ~= 247.5 kcal (not 24750)", abs(cal_150g - 247.5) < 0.1, f"got {cal_150g:.1f}")
check("unit_scale per_100g == 100", unit_scale("per_100g") == 100.0)
check("unit_scale per_portion == 1", unit_scale("per_portion") == 1.0)

# 2) per_portion foods are NOT divided.
egg = food_from_bank_values(id=4, name="Egg", name_hebrew="ביצה", measurement_type="per_portion",
                            calories=78, protein=6, carbs=0.6, fat=5, min_amount=1, max_amount=4)
check("2 eggs == 156 kcal", abs(2 * egg.per_unit_calories - 156) < 0.01, f"got {2*egg.per_unit_calories}")

# 3) Feasible target -> near-zero residual.
budget = MacroBudget(calories=600, protein=50, carbs=50, fat=15)
sol = solve_macro_targets([chicken, rice, oil], budget)
print(f"      solved: {sol.computed_calories:.0f}kcal P{sol.computed_protein:.0f} "
      f"C{sol.computed_carbs:.0f} F{sol.computed_fat:.0f} residual={sol.residual_norm:.4f}")
check("feasible set converges (residual < 0.15)", sol.residual_norm < 0.15, f"residual={sol.residual_norm:.4f}")
check("calories in plausible range", 400 < sol.computed_calories < 800, f"{sol.computed_calories:.0f}")
for fid, amt in sol.food_amounts.items():
    f = {1: chicken, 2: rice, 3: oil}[fid]
    check(f"food {fid} within bounds", f.min_amount - 1e-6 <= amt <= f.max_amount + 1e-6, f"{amt:.1f}")

# 4) Protein-only vs high-carb budget -> large residual, all at bounds.
sol2 = solve_macro_targets([chicken], MacroBudget(calories=600, protein=30, carbs=120, fat=10))
check("infeasible carb target -> large residual", sol2.residual_norm > 0.5, f"residual={sol2.residual_norm:.3f}")

# 5) Zero target for one macro must still be penalized (regression: zero gradient bug).
sol3 = solve_macro_targets([oil], MacroBudget(calories=100, protein=0, carbs=0, fat=0))
check("zero-fat target pushes oil to its floor", abs(sol3.food_amounts[3] - oil.min_amount) < 1e-3,
      f"amount={sol3.food_amounts[3]:.3f}")

# 6) Rounding.
check("per_100g rounds to 5g", round_quantity(137.0, "per_100g") == (135.0, "135g"), str(round_quantity(137.0,"per_100g")))
check("per_portion rounds to 0.5", round_quantity(1.3, "per_portion")[0] == 1.5, str(round_quantity(1.3,"per_portion")))
check("per_100g floor 5g", round_quantity(0.4, "per_100g")[0] == 5.0)
check("per_portion floor 0.5", round_quantity(0.1, "per_portion")[0] == 0.5)

# 7) Empty input.
empty = solve_macro_targets([], budget)
check("empty food list is safe", empty.computed_calories == 0 and empty.food_amounts == {})

print()
print(("ALL PASSED" if not fails else f"{len(fails)} FAILED: {fails}"))
sys.exit(1 if fails else 0)
