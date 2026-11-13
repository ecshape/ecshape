export type MacroType = 'protein' | 'carb' | 'fat';

export interface ImageCredit {
  provider?: string;
  author?: string;
  license?: string;
  url?: string;
}

export interface MealBankItem {
  id: number;
  name: string;
  name_hebrew: string | null;
  macro_type: MacroType;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  measurement_type?: 'per_100g' | 'per_portion';
  serving_size?: string | null;
  is_public?: boolean;
  created_by: number;
  created_at: string;
  image_url?: string | null;
  image_credit?: ImageCredit | null;
  source?: string | null;
  source_id?: string | null;
  brand?: string | null;
  fiber?: number | null;
  tags?: string[] | null;
  nutriscore?: string | null;
  nova_group?: number | null;
}

export interface LibraryFood {
  id: string;
  source: 'openfoodfacts' | 'staple';
  source_id: string;
  name: string;
  name_he: string | null;
  name_en: string | null;
  name_fr: string | null;
  brand: string | null;
  image_url: string | null;
  image_thumb_url: string | null;
  image_credit: ImageCredit | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  per: string;
  barcode: string | null;
  tags: string[];
  nutriscore: string | null;
  nova_group: number | null;
  macro_type: MacroType;
  quantity: string | null;
}

/** Property tags, in display order. */
export const PROPERTY_TAGS = [
  'high_protein',
  'carb_source',
  'fat_source',
  'high_fiber',
  'vegetable',
  'fruit',
  'dairy',
  'vegan',
  'vegetarian',
  'gluten_free',
  'kosher',
] as const;
export type PropertyTag = (typeof PROPERTY_TAGS)[number];

/** Tags a trainer can set by hand (the macro-based ones are computed). */
export const MANUAL_TAGS: PropertyTag[] = [
  'vegetable',
  'fruit',
  'dairy',
  'vegan',
  'vegetarian',
  'gluten_free',
  'kosher',
];

export const MACRO_TAGS: PropertyTag[] = ['high_protein', 'carb_source', 'fat_source', 'high_fiber'];

export const normalizeMacroType = (value: string): MacroType => {
  const normalized = (value ?? '').toString().toLowerCase();
  if (normalized.includes('carb')) return 'carb';
  if (normalized.includes('fat')) return 'fat';
  return 'protein';
};

/** Same rules as app/services/food_library_service.compute_macro_tags. */
export function computeMacroTags(
  kcal: number | null | undefined,
  protein: number | null | undefined,
  carbs: number | null | undefined,
  fat: number | null | undefined,
  fiber: number | null | undefined,
): PropertyTag[] {
  const tags: PropertyTag[] = [];
  const p = protein || 0;
  const c = carbs || 0;
  const f = fat || 0;
  const energy = kcal || p * 4 + c * 4 + f * 9;
  if (energy > 0) {
    if (p >= 15 || ((p * 4) / energy >= 0.35 && p >= 8)) tags.push('high_protein');
    if ((c * 4) / energy >= 0.5 && c >= 5) tags.push('carb_source');
    if ((f * 9) / energy >= 0.5 && f >= 5) tags.push('fat_source');
  }
  if ((fiber || 0) >= 6) tags.push('high_fiber');
  return tags;
}

/** All property tags for a bank item: stored tags + macro-derived ones (per 100 g only). */
export function itemTags(item: MealBankItem): PropertyTag[] {
  const stored = (item.tags || []).filter((t): t is PropertyTag =>
    (PROPERTY_TAGS as readonly string[]).includes(t),
  );
  const derived =
    (item.measurement_type ?? 'per_100g') === 'per_100g'
      ? computeMacroTags(item.calories, item.protein, item.carbs, item.fat, item.fiber)
      : [];
  const set = new Set<PropertyTag>([...stored.filter((t) => !MACRO_TAGS.includes(t)), ...derived]);
  if (set.has('vegan')) set.add('vegetarian');
  return PROPERTY_TAGS.filter((t) => set.has(t));
}

/** Pick the display name for the current UI language. */
export function displayName(item: Pick<MealBankItem, 'name' | 'name_hebrew'>, lang: string) {
  const he = item.name_hebrew?.trim();
  const en = item.name?.trim();
  if (lang === 'he') return { primary: he || en || '', secondary: he && en && he !== en ? en : '' };
  return { primary: en || he || '', secondary: he && en && he !== en ? he : '' };
}

export function libraryName(food: LibraryFood, lang: string) {
  if (lang === 'he') return food.name_he || food.name;
  if (lang === 'fr') return food.name_fr || food.name;
  return food.name_en || food.name;
}

export const fmt = (n: number | null | undefined, digits = 1) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const rounded = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(rounded);
};

/** Fraction of energy from each macro, for the macro split bar. */
export function macroSplit(protein?: number | null, carbs?: number | null, fat?: number | null) {
  const p = (protein || 0) * 4;
  const c = (carbs || 0) * 4;
  const f = (fat || 0) * 9;
  const total = p + c + f;
  if (!total) return null;
  return { protein: p / total, carb: c / total, fat: f / total };
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
