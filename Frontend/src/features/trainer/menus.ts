/**
 * Ready-made menus built from the coach's own food bank (QA #120 / #121).
 *
 * - "My menus" live on the server (/v3/meals/menus): meals -> macro groups -> bank food ids. Create, edit, delete.
 * - The ECShape menus (planTemplates.MEAL_TEMPLATES) are resolved against the bank: every reference food is the
 *   coach's own bank item when one matches, and a missing one is added to the bank first. A menu never carries
 *   foods that are not in the bank.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/features/trainee/api';
import { FOODS, pick, type Macro, type MealTemplate, type RefFood } from './planTemplates';

export interface BankFood {
  id: number;
  name: string;
  name_hebrew?: string | null;
  macro_type?: Macro | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  measurement_type?: string | null;
  serving_size?: string | null;
  image_url?: string | null;
  created_by?: number | null;
}
export interface MenuCat { macro: Macro; qty: string; foods: number[] }
export interface MenuSlot { name: string; time: string; kcal: number; cats: MenuCat[] }
export interface Menu {
  id?: number;
  name: string;
  goal: string;
  source?: string | null;
  kcal: number; p: number; c: number; f: number;
  slots: MenuSlot[];
  updated_at?: string | null;
}

export const menusKey = ['trainer', 'menus'] as const;
export const bankKey = ['trainer', 'bank-foods'] as const;

export const menusApi = {
  list: () => api<Menu[]>('/v3/meals/menus'),
  create: (m: Menu) => api<Menu>('/v3/meals/menus', { method: 'POST', body: strip(m) }),
  update: (id: number, m: Menu) => api<Menu>(`/v3/meals/menus/${id}`, { method: 'PUT', body: strip(m) }),
  remove: (id: number) => api<void>(`/v3/meals/menus/${id}`, { method: 'DELETE' }),
};
const strip = ({ id: _id, updated_at: _u, ...m }: Menu) => m;

/** The coach's own bank only (never other coaches' foods). */
export const fetchBank = () => api<BankFood[]>('/v2/meals/meal-bank?include_public=false');
export const useBankFoods = (enabled = true) => useQuery({ queryKey: bankKey, queryFn: fetchBank, enabled, staleTime: 30_000 });
export const useMenus = (enabled = true) => useQuery({ queryKey: menusKey, queryFn: menusApi.list, enabled });

export const foodLabel = (f: Pick<BankFood, 'name' | 'name_hebrew'>, lang: string) =>
  (lang.startsWith('he') ? f.name_hebrew || f.name : f.name || f.name_hebrew || '') || '';

/** Best bank item for a reference food: exact name first, then a name containing one of its fragments. */
export function matchRef(ref: RefFood, bank: BankFood[]): BankFood | undefined {
  const norm = (s?: string | null) => (s || '').trim().toLowerCase();
  const exact = bank.find((b) => norm(b.name) === norm(ref.name) || norm(b.name_hebrew) === norm(ref.he));
  if (exact) return exact;
  return bank.find((b) => {
    const hay = `${norm(b.name)} ${norm(b.name_hebrew)}`;
    return ref.match.some((m) => hay.includes(m));
  });
}

/** Reference foods of a built-in menu that the bank does not have yet. */
export function missingRefs(tpl: MealTemplate, bank: BankFood[]): string[] {
  const keys = [...new Set(tpl.slots.flatMap((s) => s.cats.flatMap((c) => c.foods as string[])))];
  return keys.filter((k) => !matchRef(FOODS[k], bank));
}

/**
 * A built-in menu as a bank menu. Reference foods missing from the bank are created in it first, so the result only
 * holds bank ids. Returns the menu and the bank as it is afterwards.
 */
export async function materializeBuiltin(tpl: MealTemplate, lang: string, bank?: BankFood[]): Promise<{ menu: Menu; bank: BankFood[] }> {
  let items = bank ?? (await fetchBank());
  const macroOf: Record<string, Macro> = {};
  tpl.slots.forEach((s) => s.cats.forEach((c) => (c.foods as string[]).forEach((k) => { macroOf[k] ??= c.macro; })));
  const missing = missingRefs(tpl, items);
  if (missing.length) {
    const made = await Promise.all(missing.map((k) => {
      const r = FOODS[k];
      return api<BankFood>('/v2/meals/meal-bank', {
        method: 'POST',
        body: {
          name: r.name, name_hebrew: r.he, macro_type: macroOf[k], calories: r.kcal, protein: r.p, carbs: r.c, fat: r.f,
          measurement_type: r.per, serving_size: r.serving ?? null, is_public: false,
        },
      });
    }));
    items = [...items, ...made];
  }
  const idOf = (k: string) => matchRef(FOODS[k], items)?.id;
  const menu: Menu = {
    name: pick(tpl.name, lang),
    goal: pick(tpl.goal, lang),
    source: tpl.id,
    kcal: tpl.kcal, p: tpl.p, c: tpl.c, f: tpl.f,
    slots: tpl.slots.map((s) => ({
      name: pick(s.name, lang),
      time: s.time,
      kcal: s.kcal,
      cats: s.cats.map((c) => ({ macro: c.macro, qty: pick(c.qty, lang), foods: (c.foods as string[]).map(idOf).filter((x): x is number => !!x) })),
    })),
  };
  return { menu, bank: items };
}

/** The meal-plan body (without client_id) for a bank menu; also sent inside a chat menu card (QA #54). */
export function menuPlanBody(menu: Menu, bank: BankFood[]) {
  const byId = new Map(bank.map((b) => [b.id, b]));
  return {
    name: menu.name,
    description: menu.goal,
    number_of_meals: menu.slots.length,
    total_calories: menu.kcal || menu.slots.reduce((a, s) => a + (s.kcal || 0), 0),
    protein_target: menu.p,
    carb_target: menu.c,
    fat_target: menu.f,
    start_date: new Date().toISOString(),
    meal_slots: menu.slots.map((s) => ({
      name: s.name,
      time_suggestion: s.time,
      target_calories: s.kcal,
      macro_categories: s.cats.map((cat) => ({
        macro_type: cat.macro,
        quantity_instruction: cat.qty,
        food_options: cat.foods.map((id) => byId.get(id)).filter((b): b is BankFood => !!b).map((b, i) => ({
          name: b.name, name_hebrew: b.name_hebrew ?? null, calories: b.calories ?? null, protein: b.protein ?? null,
          carbs: b.carbs ?? null, fat: b.fat ?? null, serving_size: b.serving_size ?? null,
          measurement_type: b.measurement_type === 'per_portion' ? 'per_portion' : 'per_100g', order_index: i,
        })),
      })),
    })),
  };
}

/** Built-in menu -> plan body, every food from the bank (missing ones are added to it). */
export async function buildMealPlanBody(tpl: MealTemplate, lang: string) {
  const { menu, bank } = await materializeBuiltin(tpl, lang);
  return menuPlanBody(menu, bank);
}

export const assignMenu = (menu: Menu, bank: BankFood[], clientId: number) =>
  api('/v3/meals/plans', { method: 'POST', body: { client_id: clientId, ...menuPlanBody(menu, bank) } });

export const emptyMenu = (lang: string): Menu => {
  const he = lang.startsWith('he');
  const fr = lang.startsWith('fr');
  const slot = (name: string, time: string, kcal: number): MenuSlot => ({ name, time, kcal, cats: [{ macro: 'protein', qty: '', foods: [] }, { macro: 'carb', qty: '', foods: [] }] });
  return {
    name: '', goal: '', kcal: 0, p: 0, c: 0, f: 0,
    slots: [
      slot(he ? 'ארוחת בוקר' : fr ? 'Petit-déjeuner' : 'Breakfast', '08:00', 0),
      slot(he ? 'ארוחת צהריים' : fr ? 'Déjeuner' : 'Lunch', '13:00', 0),
      slot(he ? 'ארוחת ערב' : fr ? 'Dîner' : 'Dinner', '20:00', 0),
    ],
  };
};
