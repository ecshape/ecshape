import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, Heart, Search, X } from "lucide-react";
import Layout from "../components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  return (
    <Layout currentPage={isCoachView ? "dashboard" : "meals"}>
      <div className="max-w-3xl mx-auto px-4 py-4 sm:py-6 pb-24 space-y-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label={t("common.back", "Back")}>
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </Button>
          <div className="space-y-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" />
              {t("meals.favorites.title", "Favorite foods")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("meals.favorites.subtitle", "Pick the foods you like to eat at each meal")}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <Tabs value={activeSlot} onValueChange={setActiveSlot}>
            <TabsList className="w-full overflow-x-auto justify-start">
              {slots.map((slot) => (
                <TabsTrigger key={slot.order_index} value={String(slot.order_index)} className="gap-1.5">
                  {slot.name}
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    ({favoritesForSlot(slot.order_index).length})
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            {slots.map((slot) => {
              const slotFavorites = favoritesForSlot(slot.order_index);
              const favoriteByFoodId = new Map(slotFavorites.map((f) => [f.meal_bank_id, f]));

              return (
                <TabsContent key={slot.order_index} value={String(slot.order_index)} className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{t("meals.favorites.selected", "Selected")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {slotFavorites.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t("meals.favorites.empty", "No favorites yet for this meal")}
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {slotFavorites.map((fav) => {
                            const food = catalogById.get(fav.meal_bank_id);
                            return (
                              <Badge
                                key={fav.id}
                                variant="secondary"
                                className="gap-1 py-1 ps-3 pe-1 text-sm"
                              >
                                {food ? foodName(food) : `#${fav.meal_bank_id}`}
                                <button
                                  type="button"
                                  onClick={() => removeFavorite(fav)}
                                  disabled={pendingFoodIds.has(fav.meal_bank_id)}
                                  className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive"
                                  aria-label={t("meals.favorites.remove", "Remove")}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="relative">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("meals.favorites.search", "Search foods")}
                      className="ps-9"
                    />
                  </div>

                  <div className="rounded-lg border divide-y">
                    {filteredCatalog.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground text-center">
                        {t("meals.favorites.noResults", "No foods found")}
                      </p>
                    ) : (
                      filteredCatalog.map((food) => {
                        const fav = favoriteByFoodId.get(food.id);
                        const pending = pendingFoodIds.has(food.id);
                        const unit = food.measurement_type === "per_portion"
                          ? t("meals.favorites.perPortion", "per portion")
                          : t("meals.favorites.per100g", "per 100g");
                        return (
                          <button
                            key={food.id}
                            type="button"
                            disabled={pending}
                            onClick={() => (fav ? removeFavorite(fav) : addFavorite(food.id, slot.order_index))}
                            className={`w-full flex items-center justify-between gap-3 p-3 text-start transition-colors hover:bg-muted/50 disabled:opacity-60 ${
                              fav ? "bg-primary/5" : ""
                            }`}
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">{foodName(food)}</span>
                                {food.macro_type && (
                                  <Badge variant="outline" className={`text-[10px] ${MACRO_BADGE_CLASS[food.macro_type]}`}>
                                    {t(MACRO_LABEL_KEY[food.macro_type], food.macro_type)}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground" dir="ltr">
                                {Math.round(food.calories ?? 0)} kcal · P {food.protein ?? 0} · C {food.carbs ?? 0} · F{" "}
                                {food.fat ?? 0} <span className="opacity-70">({unit})</span>
                              </div>
                            </div>
                            <div
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                                fav ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
                              }`}
                            >
                              {fav && <Check className="h-4 w-4" />}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </Layout>
  );
};

export default ClientFavoritesPage;
