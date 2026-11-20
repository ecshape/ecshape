import i18n from '@/i18n/config';
import patch from '@/i18n/patches/foodtable.json';

/** Strings of the ECShape nutrition table (default food bank): groups and "search all sources" (src/i18n/patches/foodtable.json). */
for (const [lng, resources] of Object.entries(patch as Record<string, Record<string, unknown>>)) {
  i18n.addResourceBundle(lng, 'translation', resources, true, false);
}

/** Group keys in the table's order (app/data/ecshape_table.json). */
export const FOOD_GROUPS = ["poultry", "beef", "veal_lamb", "fish", "dairy", "eggs", "legumes", "deli", "protein_drinks", "protein_powder", "vegetables", "soups_sauces", "fast_food", "drinks", "snacks", "grains", "restaurant", "spices", "bread", "fruit", "sweets", "ready_meals", "cereals", "nuts_seeds", "oils_dressings", "olives_avocado"] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

export default i18n;
