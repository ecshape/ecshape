import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Heart, Search, X } from "lucide-react";
import Layout from "../components/Layout";
import { BackLink, PageTitle, SectionCard, Skel, TabStrip } from "@/features/trainer/ui";
import { API_BASE_URL } from "../config/api";
import { useToast } from "../hooks/use-toast";
import type { MacroType, V3FavoriteFood, V3FoodCatalogItem } from "../types/meals-v3";

type SlotTab = { order_index: number; name: string };

const MACRO_ORDER: MacroType[] = ["protein", "carb", "fat"];

const MACRO_LABEL_KEY: Record<MacroType, string> = {
  protein: "meals.protein",
  carb: "meals.carbs",
  fat: "meals.fat",
};

const MACRO_BADGE_CLASS: Record<MacroType, string> = {
  protein: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  carb: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  fat: "bg-fuchsia-500/15 text-fuchsia-600 border-fuchsia-500/30",
};

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("access_token")}`,
  "Content-Type": "application/json",
});

const ClientFavoritesPage: React.FC = () => {
  const { clientId } = useParams<{ clientId?: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const isRtlHe = (i18n.language || "").toLowerCase().startsWith("he");
  const isCoachView = Boolean(clientId);
  const clientQuery = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";

  const [slots, setSlots] = useState<SlotTab[]>([]);
  const [catalog, setCatalog] = useState<V3FoodCatalogItem[]>([]);
  const [favorites, setFavorites] = useState<V3FavoriteFood[]>([]);
  const [activeSlot, setActiveSlot] = useState("0");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingFoodIds, setPendingFoodIds] = useState<Set<number>>(new Set());

  const defaultSlots = useMemo<SlotTab[]>(
    () => [
      { order_index: 0, name: t("meals.breakfast", "Breakfast") },
      { order_index: 1, name: t("meals.lunch", "Lunch") },
      { order_index: 2, name: t("meals.dinner", "Dinner") },
    ],
    [t]
  );

  const foodName = useCallback(
    (food: { name: string; name_hebrew?: string | null }) =>
      isRtlHe ? food.name_hebrew || food.name : food.name,
    [isRtlHe]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const headers = authHeaders();
        const [plansRes, catalogRes, favRes] = await Promise.all([
          fetch(`${API_BASE_URL}/v3/meals/plans${clientQuery}`, { headers }),
          fetch(`${API_BASE_URL}/v3/meals/catalog`, { headers }),
          fetch(`${API_BASE_URL}/v3/meals/favorites${clientQuery}`, { headers }),
        ]);
        if (!catalogRes.ok || !favRes.ok) throw new Error("load failed");

        const plans = plansRes.ok ? await plansRes.json() : [];
        const planSlots: SlotTab[] = (plans[0]?.meal_slots ?? [])
          .map((s: { order_index: number; name: string }) => ({ order_index: s.order_index, name: s.name }))
          .sort((a: SlotTab, b: SlotTab) => a.order_index - b.order_index);

        if (cancelled) return;
        const resolvedSlots = planSlots.length > 0 ? planSlots : defaultSlots;
        setSlots(resolvedSlots);
        setActiveSlot(String(resolvedSlots[0].order_index));
        setCatalog(await catalogRes.json());
        setFavorites(await favRes.json());
      } catch {
        if (!cancelled) {
          toast({ title: t("meals.favorites.loadError", "Could not load favorites"), variant: "destructive" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // defaultSlots only matters as a fallback on first load; re-running on language change would refetch needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientQuery]);

  const catalogById = useMemo(() => new Map(catalog.map((f) => [f.id, f])), [catalog]);

  const favoritesForSlot = useCallback(
    (orderIndex: number) => favorites.filter((f) => f.meal_slot_order_index === orderIndex),
    [favorites]
  );

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = q
      ? catalog.filter(
          (f) => f.name.toLowerCase().includes(q) || (f.name_hebrew ?? "").toLowerCase().includes(q)
        )
      : catalog;
    return [...items].sort(
      (a, b) =>
        MACRO_ORDER.indexOf(a.macro_type ?? "protein") - MACRO_ORDER.indexOf(b.macro_type ?? "protein") ||
        foodName(a).localeCompare(foodName(b))
    );
  }, [catalog, search, foodName]);

  const setPending = (foodId: number, on: boolean) =>
    setPendingFoodIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(foodId);
      else next.delete(foodId);
      return next;
    });

  const addFavorite = async (foodId: number, orderIndex: number) => {
    setPending(foodId, true);
    try {
      const res = await fetch(`${API_BASE_URL}/v3/meals/favorites${clientQuery}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ meal_bank_id: foodId, meal_slot_order_index: orderIndex }),
      });
      if (!res.ok) throw new Error();
      const created: V3FavoriteFood = await res.json();
      setFavorites((prev) => (prev.some((f) => f.id === created.id) ? prev : [...prev, created]));
    } catch {
      toast({ title: t("meals.favorites.saveError", "Could not save"), variant: "destructive" });
    } finally {
      setPending(foodId, false);
    }
  };

  const removeFavorite = async (favorite: V3FavoriteFood) => {
    setPending(favorite.meal_bank_id, true);
    try {
      const res = await fetch(`${API_BASE_URL}/v3/meals/favorites/${favorite.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      setFavorites((prev) => prev.filter((f) => f.id !== favorite.id));
    } catch {
      toast({ title: t("meals.favorites.saveError", "Could not save"), variant: "destructive" });
    } finally {
      setPending(favorite.meal_bank_id, false);
    }
  };

  const goBack = () => navigate(isCoachView ? `/client/${clientId}` : "/meals");
  const slot = slots.find((s) => String(s.order_index) === activeSlot) ?? slots[0];
  const slotFavorites = slot ? favoritesForSlot(slot.order_index) : [];
  const favoriteByFoodId = new Map(slotFavorites.map((f) => [f.meal_bank_id, f]));

  return (
    <Layout currentPage={isCoachView ? "dashboard" : "meals"}>
      <div className="tr-page tr-page--narrow">
        <BackLink onClick={goBack} className="mb-4" />
        <PageTitle
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5 text-primary" />
              {t("meals.favorites.title", "Favorite foods")}
            </span>
          }
          title={t("meals.favorites.title", "Favorite foods")}
          lead={t("meals.favorites.subtitle", "Pick the foods you like to eat at each meal")}
        />

        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-label={t("common.loading")}>
            <Skel className="h-12 w-full max-w-md rounded-full" />
            <Skel className="h-28 rounded-[1.5rem]" />
            <Skel className="h-96 rounded-[1.5rem]" />
          </div>
        ) : (
          <>
            <div className="tr-tabs">
              <TabStrip<string>
                value={activeSlot}
                onChange={setActiveSlot}
                label={t("meals.favorites.title", "Favorite foods")}
                idPrefix="fav"
                items={slots.map((s) => ({
                  id: String(s.order_index),
                  label: (
                    <>
                      {s.name}
                      <span className="tr-seg-count" dir="ltr">{favoritesForSlot(s.order_index).length}</span>
                    </>
                  ),
                }))}
              />
            </div>

            {slot && (
              <div id="fav-panel" role="tabpanel" aria-labelledby={`fav-${activeSlot}`} className="tr-tabpanel mt-3 space-y-4" key={activeSlot}>
                <SectionCard icon={Heart} title={t("meals.favorites.selected", "Selected")}>
                  {slotFavorites.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("meals.favorites.empty", "No favorites yet for this meal")}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {slotFavorites.map((fav) => {
                        const food = catalogById.get(fav.meal_bank_id);
                        return (
                          <span key={fav.id} className="tr-tag">
                            {food ? foodName(food) : `#${fav.meal_bank_id}`}
                            <button
                              type="button"
                              onClick={() => removeFavorite(fav)}
                              disabled={pendingFoodIds.has(fav.meal_bank_id)}
                              aria-label={`${t("meals.favorites.remove", "Remove")} ${food ? foodName(food) : ""}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </SectionCard>

                <section className="tp-card overflow-hidden">
                  <div className="border-b border-border/50 p-3 sm:p-4">
                    <div className="tr-search">
                      <Search />
                      <input
                        type="search"
                        className="tp-input"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t("meals.favorites.search", "Search foods")}
                        aria-label={t("meals.favorites.search", "Search foods")}
                      />
                    </div>
                  </div>
                  {filteredCatalog.length === 0 ? (
                    <div className="flex flex-col items-center px-6 py-12 text-center">
                      <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary"><Search className="h-6 w-6" /></span>
                      <p className="font-semibold">{t("meals.favorites.noResults", "No foods found")}</p>
                    </div>
                  ) : (
                    <ul className="max-h-[60dvh] space-y-0.5 overflow-y-auto p-2">
                      {filteredCatalog.map((food) => {
                        const fav = favoriteByFoodId.get(food.id);
                        const pending = pendingFoodIds.has(food.id);
                        const unit = food.measurement_type === "per_portion"
                          ? t("meals.favorites.perPortion", "per portion")
                          : t("meals.favorites.per100g", "per 100g");
                        return (
                          <li key={food.id}>
                            <button
                              type="button"
                              disabled={pending}
                              aria-pressed={!!fav}
                              onClick={() => (fav ? removeFavorite(fav) : addFavorite(food.id, slot.order_index))}
                              className="tr-food disabled:opacity-60"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="truncate font-semibold">{foodName(food)}</span>
                                  {food.macro_type && (
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${MACRO_BADGE_CLASS[food.macro_type]}`}>
                                      {t(MACRO_LABEL_KEY[food.macro_type], food.macro_type)}
                                    </span>
                                  )}
                                </span>
                                <span className="mt-0.5 block text-xs text-muted-foreground" dir="ltr">
                                  {Math.round(food.calories ?? 0)} kcal · P {food.protein ?? 0} · C {food.carbs ?? 0} · F {food.fat ?? 0}{" "}
                                  <span className="opacity-70">({unit})</span>
                                </span>
                              </span>
                              <span className="tr-food-check" aria-hidden>{fav && <Check className="h-4 w-4" />}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default ClientFavoritesPage;
