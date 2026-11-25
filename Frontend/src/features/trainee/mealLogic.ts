import type { MacroType, V3ClientMealChoiceResponse, V3DayViewResponse, V3FoodOption, V3MealSlotView } from '@/types/meals-v3';

/* Same contract as the previous meals screen: the trainer's pages read these encodings too. */

export const parseGrams = (value: string): number => {
  const m = value.match(/(\d+(?:\.\d+)?)/);
  const n = m ? parseFloat(m[1]) : 0;
  return Number.isFinite(n) ? n : 0;
};

export const normalizeQty = (v?: string | null) => (v && v.trim() ? v.trim() : '100g');

const GRAMS_RE = /(\d+(?:[.,]\d+)?)\s*(?:g\b|gr\b|grams?\b|ml\b|גרם|גר׳|מ["״]ל)/i;
/** The gram (or ml) amount written in a quantity text: "3 eggs or 200 g" -> 200. */
export const gramsIn = (value: string): number | null => {
  const m = value.match(GRAMS_RE);
  const n = m ? parseFloat(m[1].replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
};
/** A count of pieces / portions in a quantity text (a number not followed by a gram unit): "3 eggs or 200 g" -> 3. */
export const countIn = (value: string): number | null => {
  // no regex lookbehind (unsupported before iOS 16.4): walk the numbers and check what follows each one
  for (const m of value.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const after = value.slice((m.index ?? 0) + m[0].length);
    if (/^\s*(?:g\b|gr\b|grams?\b|ml\b|גרם|גר׳|מ["״]ל)/i.test(after)) continue;
    const n = parseFloat(m[0].replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

export const foodMacros = (food: V3FoodOption, qty?: string | null) => {
  const q = normalizeQty(qty);
  let scale: number;
  if (food.measurement_type === 'per_portion') {
    // portions: an explicit count; a gram-only amount converts through the serving weight, else one portion
    // (a "120g" instruction used to count 120 portions, e.g. 9,480 kcal of bread)
    const count = countIn(q);
    const g = gramsIn(q);
    const servingG = food.serving_size ? gramsIn(food.serving_size) : null;
    scale = count ?? (g && servingG ? g / servingG : 1);
  } else {
    scale = (gramsIn(q) ?? parseGrams(q)) / 100;
  }
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
