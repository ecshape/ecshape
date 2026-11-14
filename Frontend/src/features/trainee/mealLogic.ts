import type { MacroType, V3ClientMealChoiceResponse, V3DayViewResponse, V3FoodOption, V3MealSlotView } from '@/types/meals-v3';

/* Same contract as the previous meals screen: the trainer's pages read these encodings too. */

export const parseGrams = (value: string): number => {
  const m = value.match(/(\d+(?:\.\d+)?)/);
  const n = m ? parseFloat(m[1]) : 0;
  return Number.isFinite(n) ? n : 0;
};

export const normalizeQty = (v?: string | null) => (v && v.trim() ? v.trim() : '100g');

export const foodMacros = (food: V3FoodOption, qty?: string | null) => {
  const grams = parseGrams(normalizeQty(qty));
  const scale = food.measurement_type === 'per_portion' ? grams : grams / 100;
  return {
    calories: (food.calories ?? 0) * scale,
    protein: (food.protein ?? 0) * scale,
    carbs: (food.carbs ?? 0) * scale,
    fat: (food.fat ?? 0) * scale,
  };
};

/** Row-tagged swaps encode plan-row + target so MealBank ids never collide with FoodOption ids. */
const ROW_SWAP = '__V3MROW_';

export type RowSwap = { kind: 'plan' | 'bank'; rowId: number; targetId: number; displayName: string };

export const safeName = (name: string) => name.replace(/__/g, ' ').trim() || 'Food';
export const encodePlanSwap = (rowId: number, foodId: number, name: string) => `${ROW_SWAP}${rowId}__P_${foodId}__${name}`;
export const encodeBankSwap = (rowId: number, bankId: number, name: string) => `${ROW_SWAP}${rowId}__B_${bankId}__${name}`;

export const parseRowSwap = (custom?: string | null): RowSwap | null => {
  if (!custom?.startsWith(ROW_SWAP)) return null;
  const rest = custom.slice(ROW_SWAP.length);
  const p = rest.match(/^(\d+)__P_(\d+)__(.+)$/);
  if (p) return { kind: 'plan', rowId: +p[1], targetId: +p[2], displayName: p[3] };
  const b = rest.match(/^(\d+)__B_(\d+)__(.+)$/);
  if (b) return { kind: 'bank', rowId: +b[1], targetId: +b[2], displayName: b[3] };
  return null;
};

export const isOverallCustom = (c: V3ClientMealChoiceResponse) =>
  c.food_option_id == null && c.meal_variant_food_id == null && !!(c.custom_food_name ?? '').trim() && parseRowSwap(c.custom_food_name) === null;

export const choiceForRow = (choices: V3ClientMealChoiceResponse[] | undefined, slotId: number, rowFoodId: number) =>
  choices?.find((c) => c.meal_slot_id === slotId && (c.food_option_id === rowFoodId || parseRowSwap(c.custom_food_name)?.rowId === rowFoodId));

export type PlanRow = { macro: MacroType; food: V3FoodOption & { id: number }; qty: string; choice?: V3ClientMealChoiceResponse; swap: RowSwap | null };

export const planRows = (slot: V3MealSlotView, choices: V3ClientMealChoiceResponse[] | undefined): PlanRow[] => {
  const order: MacroType[] = ['protein', 'carb', 'fat'];
  return [...slot.categories]
    .sort((a, b) => order.indexOf(a.macro_type) - order.indexOf(b.macro_type))
    .flatMap((cat) =>
      [...(cat.recommended_foods ?? [])]
        .filter((f): f is V3FoodOption & { id: number } => typeof f.id === 'number')
        .sort((a, b) => a.id - b.id)
        .map((food) => {
          const choice = choiceForRow(choices, slot.meal_slot_id, food.id);
          return { macro: cat.macro_type, food, qty: normalizeQty(cat.quantity_instruction), choice, swap: parseRowSwap(choice?.custom_food_name) };
        }),
    );
};

export const rowMacros = (r: PlanRow) =>
  r.swap && r.choice
    ? { calories: r.choice.custom_calories ?? 0, protein: r.choice.custom_protein ?? 0, carbs: r.choice.custom_carbs ?? 0, fat: r.choice.custom_fat ?? 0 }
    : foodMacros(r.food, r.qty);

/** Calories actually logged for one meal (plan rows, option foods and extra foods). */
export const slotConsumed = (slot: V3MealSlotView, day: V3DayViewResponse) => {
  let kcal = 0;
  const rows = planRows(slot, day.choices);
  for (const c of day.choices) {
    if (c.meal_slot_id !== slot.meal_slot_id) continue;
    if (c.food_option_id != null) {
      const r = rows.find((x) => x.food.id === c.food_option_id);
      kcal += r ? foodMacros(r.food, c.quantity || r.qty).calories : 0;
    } else kcal += c.custom_calories ?? 0;
  }
  return kcal;
};
