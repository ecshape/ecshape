import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, Search, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FoodThumb } from "@/features/trainee/AddMealSheet";
import { useTranslatedMap } from "@/features/trainee/useTranslated";
import "@/features/trainee/qa2I18n";
import Layout from "../components/Layout";
import { BackLink, PageTitle, Skel, TabStrip } from "@/features/trainer/ui";
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
  const [macro, setMacro] = useState<"all" | MacroType>("all");
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

  const trNames = useTranslatedMap(catalog.filter((f) => !(isRtlHe && f.name_hebrew)).map((f) => f.name));
  const foodName = useCallback(
    (food: { name: string; name_hebrew?: string | null }) =>
      isRtlHe && food.name_hebrew ? food.name_hebrew : trNames[food.name] || food.name,
    [isRtlHe, trNames]
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

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: catalog.length };
    MACRO_ORDER.forEach((m) => { c[m] = catalog.filter((f) => f.macro_type === m).length; });
    return c;
  }, [catalog]);
  const visibleCatalog = macro === "all" ? filteredCatalog : filteredCatalog.filter((f) => f.macro_type === macro);

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
            <Skel className="h-36 rounded-[1.5rem]" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skel key={i} className="aspect-[4/5] rounded-[1.25rem]" />)}</div>
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
              <div id="fav-panel" role="tabpanel" aria-labelledby={`fav-${activeSlot}`} className="tr-tabpanel mt-4 space-y-5" key={activeSlot}>
                {/* Shelf: what this meal already has (QA #46) */}
                <section aria-label={t("meals.favorites.selected", "Selected")}>
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h2 className="tp-title text-[1.7rem]">{t("meals.favorites.selected", "Selected")}</h2>
                    <span className="text-xs text-muted-foreground" dir="auto">{slot.name} · <span dir="ltr">{slotFavorites.length}</span></span>
                  </div>
                  {slotFavorites.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-[1.25rem] border border-dashed border-primary/40 bg-primary/[.05] p-4">
                      <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-primary/15 text-primary"><Sparkles className="h-5 w-5" /></span>
                      <p className="text-sm text-muted-foreground">{t("meals.favorites.empty", "No favorites yet for this meal")} — {t("meals.favorites.tapHeart", "tap ♥ on a food below.")}</p>
                    </div>
                  ) : (
                    <div className="tp-scroll-x -mx-1 flex gap-2.5 px-1 pb-1">
                      {slotFavorites.map((fav) => {
                        const food = catalogById.get(fav.meal_bank_id);
                        const name = food ? foodName(food) : `#${fav.meal_bank_id}`;
                        return (
                          <div key={fav.id} className="fav-pop relative w-[6.5rem] flex-none">
                            <FoodThumb name={food?.name ?? name} src={food?.image_url} needsImage={!food?.image_url} className="aspect-square w-full rounded-2xl" />
                            <button
                              type="button"
                              onClick={() => removeFavorite(fav)}
                              disabled={pendingFoodIds.has(fav.meal_bank_id)}
                              className="absolute end-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition-transform active:scale-90"
                              aria-label={`${t("meals.favorites.remove", "Remove")} ${name}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                            <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-tight" dir="auto">{name}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Picker: sticky search + macro filter, then a photo grid */}
                <section aria-label={t("meals.favorites.search", "Search foods")}>
                  <div className="sticky top-[calc(var(--tr-bar-h,4rem)+.25rem)] z-10 -mx-1 space-y-2 rounded-[1.25rem] bg-background/85 px-1 py-2 backdrop-blur-xl">
                    <div className="tr-search">
                      <Search />
                      <input
                        type="text"
                        inputMode="search"
                        className="tp-input"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t("meals.favorites.search", "Search foods")}
                        aria-label={t("meals.favorites.search", "Search foods")}
                      />
                    </div>
                    <div className="tr-chips" role="group" aria-label={t("meals.favorites.filter", "Filter")}>
                      {(["all", ...MACRO_ORDER] as const).map((m) => (
                        <button key={m} type="button" className="tr-chip" aria-pressed={macro === m} onClick={() => setMacro(m)}>
                          {m === "all" ? t("tt.common.all", "All") : t(MACRO_LABEL_KEY[m], m)}<span>{counts[m]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {visibleCatalog.length === 0 ? (
                    <div className="flex flex-col items-center px-6 py-12 text-center">
                      <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary"><Search className="h-6 w-6" /></span>
                      <p className="font-semibold">{t("meals.favorites.noResults", "No foods found")}</p>
                    </div>
                  ) : (
                    <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {visibleCatalog.map((food) => {
                        const fav = favoriteByFoodId.get(food.id);
                        const pending = pendingFoodIds.has(food.id);
                        const unit = food.measurement_type === "per_portion"
                          ? t("meals.favorites.perPortion", "per portion")
                          : t("meals.favorites.per100g", "per 100g");
                        const p = (food.protein ?? 0) * 4, c = (food.carbs ?? 0) * 4, f = (food.fat ?? 0) * 9;
                        const sum = p + c + f || 1;
                        return (
                          <li key={food.id}>
                            <button
                              type="button"
                              disabled={pending}
                              aria-pressed={!!fav}
                              onClick={() => (fav ? removeFavorite(fav) : addFavorite(food.id, slot.order_index))}
                              className={cn("tp-press group relative flex h-full w-full flex-col overflow-hidden rounded-[1.25rem] bg-card text-start shadow-[0_10px_30px_-22px_rgba(0,0,0,.7)] ring-1 ring-border/60 transition-shadow disabled:opacity-60", fav && "ring-2 ring-primary")}
                              data-testid="fav-food"
                            >
                              <FoodThumb name={food.name} src={food.image_url} needsImage={!food.image_url} className="aspect-[4/3] w-full rounded-none" />
                              <span className={cn("absolute end-2 top-2 grid h-9 w-9 place-items-center rounded-full shadow-md backdrop-blur transition-all", fav ? "fav-heart bg-primary text-primary-foreground" : "bg-black/45 text-white group-hover:bg-black/60")} aria-hidden>
                                <Heart className={cn("h-[18px] w-[18px]", fav && "fill-current")} />
                              </span>
                              <span className="flex flex-1 flex-col gap-1 p-2.5">
                                <span className="line-clamp-2 text-sm font-bold leading-snug" dir="auto">{foodName(food)}</span>
                                <span className="text-xs text-muted-foreground"><span dir="ltr">{Math.round(food.calories ?? 0)} kcal</span> · {unit}</span>
                                <span className="mt-auto flex h-1.5 overflow-hidden rounded-full bg-foreground/[.06]" aria-label={`P ${food.protein ?? 0} · C ${food.carbs ?? 0} · F ${food.fat ?? 0}`}>
                                  <span style={{ width: `${(p / sum) * 100}%`, background: "hsl(152 60% 45%)" }} />
                                  <span style={{ width: `${(c / sum) * 100}%`, background: "hsl(28 92% 55%)" }} />
                                  <span style={{ width: `${(f / sum) * 100}%`, background: "hsl(300 60% 58%)" }} />
                                </span>
                                <span className="text-[10px] text-muted-foreground" dir="ltr">P {food.protein ?? 0} · C {food.carbs ?? 0} · F {food.fat ?? 0}</span>
                              </span>
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
