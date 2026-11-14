import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/** A food being reviewed before it is logged. Totals scale with the amount, relative to the amount first proposed. */
export type DraftItem = {
  key: string;
  name: string;
  /** Amount: grams, or a number of portions when unit is 'portion'. */
  grams: number;
  baseGrams: number;
  base: { calories: number; protein: number; carbs: number; fat: number };
  unit?: 'g' | 'portion';
  image?: string | null;
  needsImage?: boolean;
  hint?: string | null;
};

let seq = 0;
export const newDraft = (name = '', grams = 100, base = { calories: 0, protein: 0, carbs: 0, fat: 0 }, extra: Partial<DraftItem> = {}): DraftItem => ({
  key: `d${Date.now()}-${seq++}`, name, grams, baseGrams: grams > 0 ? grams : 100, base, ...extra,
});

/** "120g" or "2 portions" — the backend reads grams back out of this text. */
export const draftQuantity = (d: DraftItem) => (d.unit === 'portion' ? `${+d.grams.toFixed(2)} portion${d.grams === 1 ? '' : 's'}` : `${Math.round(d.grams)}g`);

/** A search hit. Values are per 100 g (unit 'g') or per portion (unit 'portion'). */
export type FoodHit = {
  id: string;
  source: 'recent' | 'coach' | 'staple' | 'generic' | 'product';
  name: string;
  name_en?: string | null;
  brand?: string | null;
  image_url?: string | null;
  image_ai?: boolean;
  needs_image?: boolean;
  unit: 'g' | 'portion';
  serving_grams?: number | null;
  serving_label?: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  macro_type?: string | null;
};
export type FoodSearch = { query: string; recent: FoodHit[]; coach: FoodHit[]; foods: FoodHit[]; products: FoodHit[]; has_more: boolean; errors: string[]; ai_images: boolean };

/** Turns a search hit into a draft at its usual serving (or 100 g / 1 portion). */
export const hitToDraft = (h: FoodHit): DraftItem => {
  const name = h.brand && h.source === 'product' && !h.name.includes(h.brand) ? `${h.name} · ${h.brand}` : h.name;
  const extra = { unit: h.unit, image: h.image_url ?? null, needsImage: !!h.needs_image, hint: h.name_en ?? null };
  const per = { calories: h.calories, protein: h.protein, carbs: h.carbs, fat: h.fat };
  if (h.unit === 'portion') return newDraft(name, 1, per, { ...extra, baseGrams: 1 });
  const g = h.serving_grams && h.serving_grams > 0 ? Math.round(h.serving_grams) : 100;
  return newDraft(name, g, per, { ...extra, baseGrams: 100 });
};

export function useFoodSearch(q: string, lang: string, enabled: boolean) {
  return useQuery({
    queryKey: ['trainee', 'food-search', q, lang],
    queryFn: ({ signal }) => api<FoodSearch>(`/v3/meals/foods/search?q=${encodeURIComponent(q)}&lang=${lang}`, { signal }),
    enabled,
    staleTime: 10 * 60_000,
    placeholderData: (prev) => prev,
  });
}

/** AI photo for a food without a picture. Generated once on the server, then cached for everyone. */
export function useFoodImage(name: string, hint: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['trainee', 'food-image', name.trim().toLowerCase()],
    queryFn: () => api<{ url: string }>(`/v3/meals/foods/image?name=${encodeURIComponent(name.trim())}${hint ? `&hint=${encodeURIComponent(hint)}` : ''}`),
    enabled: enabled && !!name.trim(),
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });
}

export const draftTotals = (d: DraftItem) => {
  const k = d.baseGrams > 0 ? d.grams / d.baseGrams : 1;
  return { calories: d.base.calories * k, protein: d.base.protein * k, carbs: d.base.carbs * k, fat: d.base.fat * k };
};

export type AiFood = { name: string; grams: number; calories: number; protein: number; carbs: number; fat: number };
export type BarcodeProduct = { barcode: string; name: string; serving_grams: number | null; image_url?: string | null; needs_image?: boolean; per100: { calories: number; protein: number; carbs: number; fat: number } };
export type SavedItem = { name: string; quantity?: string | null; calories: number; protein: number; carbs: number; fat: number };
export type SavedMeal = { id: number; name: string; is_favorite: boolean; items: SavedItem[]; totals: { calories: number; protein: number; carbs: number; fat: number } };

export const useAiAvailable = (enabled: boolean) =>
  useQuery({ queryKey: ['trainee', 'meal-ai-status'], queryFn: () => api<{ available: boolean }>('/v3/meals/ai/status'), enabled, staleTime: 5 * 60_000 });

export const useSavedMeals = () =>
  useQuery({ queryKey: ['trainee', 'saved-meals'], queryFn: () => api<SavedMeal[]>('/v3/meals/saved'), staleTime: 30_000 });

export function useRefreshMealDay() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['trainee', 'meal-day'] });
    qc.invalidateQueries({ queryKey: ['trainee', 'meal-completions'] });
  };
}

export function useLogDrafts(date: string) {
  const refresh = useRefreshMealDay();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ items, slotId, saveAs }: { items: DraftItem[]; slotId: number | null; saveAs?: string }) => {
      const rows = items.filter((i) => i.name.trim()).map((i) => ({ i, t: draftTotals(i) }));
      for (const { i, t } of rows) {
        await api('/v3/meals/logs', {
          method: 'POST',
          body: {
            date, meal_slot_id: slotId, macro_type: slotId ? 'protein' : null, food_option_id: null, quantity: draftQuantity(i),
            custom_food_name: i.name.trim().slice(0, 120), custom_calories: Math.round(t.calories), custom_protein: +t.protein.toFixed(1), custom_carbs: +t.carbs.toFixed(1), custom_fat: +t.fat.toFixed(1),
          },
        });
      }
      if (saveAs?.trim()) {
        await api('/v3/meals/saved', {
          method: 'POST',
          body: { name: saveAs.trim(), is_favorite: true, items: rows.map(({ i, t }) => ({ name: i.name.trim(), quantity: draftQuantity(i), calories: Math.round(t.calories), protein: +t.protein.toFixed(1), carbs: +t.carbs.toFixed(1), fat: +t.fat.toFixed(1) })) },
        });
        qc.invalidateQueries({ queryKey: ['trainee', 'saved-meals'] });
      }
    },
    onSettled: refresh,
  });
}

/** Saves a reviewed list as a reusable meal without logging it. */
export function useCreateSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, items }: { name: string; items: DraftItem[] }) =>
      api('/v3/meals/saved', {
        method: 'POST',
        body: { name: name.trim(), is_favorite: true, items: items.filter((i) => i.name.trim()).map((i) => { const t = draftTotals(i); return { name: i.name.trim(), quantity: draftQuantity(i), calories: Math.round(t.calories), protein: +t.protein.toFixed(1), carbs: +t.carbs.toFixed(1), fat: +t.fat.toFixed(1) }; }) },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trainee', 'saved-meals'] }),
  });
}

export function useLogSaved(date: string) {
  const refresh = useRefreshMealDay();
  return useMutation({
    mutationFn: ({ id, slotId }: { id: number; slotId: number | null }) => api(`/v3/meals/saved/${id}/log`, { method: 'POST', body: { date, meal_slot_id: slotId } }),
    onSettled: refresh,
  });
}

export function useDeleteSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/v3/meals/saved/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trainee', 'saved-meals'] }),
  });
}

/** Shrinks a camera photo before upload (phones send 4-12 MB). Falls back to the original file. */
export async function downscaleImage(file: File, max = 1280): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}
