import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Layout from "../components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../config/api";
import { Trash2, Plus, Search, Save } from "lucide-react";
import type { MacroType, MeasurementType, V3DayViewResponse, V3FoodOption, V3DailyMacrosResponse, V3MealSlotView } from "../types/meals-v3";
import { formatDateForAPI } from "../utils/dashboard";
import type { TFunction } from "i18next";

type QuantityMode = "per_100g" | "per_portion";

type MacroCategoryPlan = {
  /** How the trainer entered quantity (grams vs portions); drives preview scaling. */
  quantityMode: QuantityMode;
  gramsAmount: number;
  portionAmount: number;
  /** Serialized for API `quantity_instruction` / `serving_size` hints. */
  quantityInstruction: string;
  recommendedFoodOptionId: number | null;
  allowedSwapFoodOptionIds: number[];
};

type MealSlotPlanState = {
  protein: MacroCategoryPlan;
  carb: MacroCategoryPlan;
  fat: MacroCategoryPlan;
};

type FoodById = Record<number, V3FoodOption>;

type V3CompleteMacroCategoryFoodCreate = {
  name: string;
  name_hebrew?: string | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  serving_size?: string | null;
  measurement_type?: MeasurementType;
  notes?: string | null;
};

type V3CompleteMacroCategoryCreate = {
  macro_type: MacroType;
  quantity_instruction?: string | null;
  calorie_goal?: number | null;
  track_cross_macros?: boolean;
  notes?: string | null;
  food_options: V3CompleteMacroCategoryFoodCreate[];
};

type V3CompleteMealSlotCreate = {
  name: string;
  time_suggestion?: string | null;
  notes?: string | null;
  target_calories?: number | null;
  target_protein?: number | null;
  target_carbs?: number | null;
  target_fat?: number | null;
  macro_categories: V3CompleteMacroCategoryCreate[];
};

type V3CompleteMealPlanCreate = {
  client_id: number;
  name: string;
  description?: string | null;
  number_of_meals: number;
  total_calories?: number | null;
  protein_target?: number | null;
  carb_target?: number | null;
  fat_target?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  meal_slots: V3CompleteMealSlotCreate[];
};

const roundQuantity = (x: number): number => Math.round(Math.max(0, x) * 100) / 100;

const parseServingGrams = (serving?: string | null): number | null => {
  if (!serving) return null;
  const m = serving.match(/(\d+(?:\.\d+)?)\s*g(?:ram)?s?\b/i);
  if (m) return parseFloat(m[1]);
  return null;
};

const quantityFieldsFromInstructionAndFood = (
  quantityInstruction: string,
  recommendedFood: V3FoodOption | null | undefined
): Pick<MacroCategoryPlan, "quantityInstruction" | "quantityMode" | "gramsAmount" | "portionAmount"> => {
  const qi = (quantityInstruction || "").trim();
  const gramMatch = qi.match(/^(\d+(?:\.\d+)?)\s*g$/i);
  if (gramMatch) {
    const gramsAmount = Math.max(0.01, parseFloat(gramMatch[1]));
    return { quantityInstruction: `${gramsAmount}g`, quantityMode: "per_100g", gramsAmount, portionAmount: 1 };
  }
  const numMatch = qi.match(/^(\d+(?:\.\d+)?)\b/);
  const catalogMode: QuantityMode = recommendedFood?.measurement_type === "per_portion" ? "per_portion" : "per_100g";
  if (numMatch && catalogMode === "per_portion") {
    const portionAmount = Math.max(0.01, parseFloat(numMatch[1]));
    return { quantityInstruction: qi, quantityMode: "per_portion", gramsAmount: 100, portionAmount };
  }
  if (catalogMode === "per_portion") {
    return { quantityInstruction: qi || "1", quantityMode: "per_portion", gramsAmount: 100, portionAmount: 1 };
  }
  return { quantityInstruction: qi || "100g", quantityMode: "per_100g", gramsAmount: 100, portionAmount: 1 };
};

const instructionFromMacroPlan = (plan: MacroCategoryPlan, t: TFunction): string => {
  if (plan.quantityMode === "per_100g") {
    return `${roundQuantity(plan.gramsAmount)}g`;
  }
  const n = roundQuantity(plan.portionAmount);
  const unit =
    n === 1
      ? t("meals.weeklyMeals.portionSingular", "portion")
      : t("meals.weeklyMeals.portionPlural", "portions");
  return `${n} ${unit}`;
};

const scaledNutritionForPlanner = (
  food: V3FoodOption,
  mode: QuantityMode,
  gramsAmount: number,
  portionAmount: number
): { cal: number; p: number; c: number; f: number } => {
  const baseCal = food.calories ?? 0;
  const baseP = food.protein ?? 0;
  const baseC = food.carbs ?? 0;
  const baseF = food.fat ?? 0;
  const mt = food.measurement_type ?? "per_100g";

  if (mode === "per_100g") {
    const g = Math.max(0, gramsAmount);
    if (mt === "per_100g") {
      const mult = g / 100;
      return { cal: baseCal * mult, p: baseP * mult, c: baseC * mult, f: baseF * mult };
    }
    const gPerPortion = parseServingGrams(food.serving_size) ?? 100;
    const portions = gPerPortion > 0 ? g / gPerPortion : 0;
    return { cal: baseCal * portions, p: baseP * portions, c: baseC * portions, f: baseF * portions };
  }

  const portions = Math.max(0, portionAmount);
  if (mt === "per_portion") {
    return { cal: baseCal * portions, p: baseP * portions, c: baseC * portions, f: baseF * portions };
  }
  const mult = (portions * 100) / 100;
  return { cal: baseCal * mult, p: baseP * mult, c: baseC * mult, f: baseF * mult };
};

const createDefaultMacroCategoryPlan = (): MacroCategoryPlan => ({
  quantityMode: "per_100g",
  gramsAmount: 100,
  portionAmount: 1,
  quantityInstruction: "100g",
  recommendedFoodOptionId: null,
  allowedSwapFoodOptionIds: [],
});

const createDraftMealSlotView = (tempId: number, orderIndex: number, name: string): V3MealSlotView => ({
  meal_slot_id: tempId,
  name,
  time_suggestion: null,
  notes: null,
  order_index: orderIndex,
  categories: [],
});

const TrainerWeeklyMealsPlannerV3: React.FC = () => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const location = useLocation();

  const isRtlHe = (i18n.language || "").toLowerCase().startsWith("he");
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  // Production uses real `/v3/meals`. Opt into mock only with `?mock=1` (dev / isolated QA).
  const [useV3MockBackend, setUseV3MockBackend] = useState<boolean>(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const mockEnabled = params.get("mock") === "1" || params.get("mock") === "true";
    setUseV3MockBackend(mockEnabled);
  }, [location.search]);

  useEffect(() => {
    // Real flow: trainer opens this page from `ClientProfile -> meal planning`,
    // so we expect `location.state.client` (or `?clientId=`) to already exist.
    const state = location.state as unknown as {
      client?: { id?: number; full_name?: string | null; username?: string | null };
    } | null;

    const fromState = typeof state?.client?.id === "number" ? state.client!.id : null;

    const params = new URLSearchParams(location.search);
    const fromQueryRaw = params.get("clientId") ?? params.get("client_id");
    const fromQuery = fromQueryRaw && !Number.isNaN(Number(fromQueryRaw)) ? Number(fromQueryRaw) : null;

    const nextClientId = fromState ?? fromQuery;
    if (typeof nextClientId !== "number") return;

    setClientId(nextClientId);
    const nextName =
      state?.client?.full_name ?? state?.client?.username ?? `Client ${nextClientId}`;
    setClientDisplayName(nextName);
  }, [location.search, location.state]);

  const [clients, setClients] = useState<Array<{ id: number; full_name: string; email: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState<number | null>(null);
  const [clientDisplayName, setClientDisplayName] = useState<string | null>(null);
  /** Date used only to load the client's repeating plan template from `/day` (same structure every day). */
  const [planLoadDate, setPlanLoadDate] = useState<string>(() => formatDateForAPI(new Date()));
  const [draftSlots, setDraftSlots] = useState<V3MealSlotView[]>([]);
  const [removedSlotIds, setRemovedSlotIds] = useState<Set<number>>(() => new Set());
  const [slotCustomNames, setSlotCustomNames] = useState<Record<number, string>>({});
  const nextTempSlotIdRef = useRef(-1);
  const seededEmptyPlanRef = useRef(false);

  const [dayView, setDayView] = useState<V3DayViewResponse | null>(null);
  const [daySummary, setDaySummary] = useState<V3DailyMacrosResponse | null>(null);

  const [proteinCatalog, setProteinCatalog] = useState<V3FoodOption[]>([]);
  const [carbCatalog, setCarbCatalog] = useState<V3FoodOption[]>([]);
  const [fatCatalog, setFatCatalog] = useState<V3FoodOption[]>([]);

  const catalogByMacro: Record<MacroType, FoodById> = useMemo(() => {
    const toMap = (items: V3FoodOption[]): FoodById =>
      items.reduce((acc, item) => {
        if (typeof item.id === "number") acc[item.id] = item;
        return acc;
      }, {} as FoodById);
    return {
      protein: toMap(proteinCatalog),
      carb: toMap(carbCatalog),
      fat: toMap(fatCatalog),
    };
  }, [proteinCatalog, carbCatalog, fatCatalog]);

  const [mealSlotPlansById, setMealSlotPlansById] = useState<Record<number, MealSlotPlanState>>({});

  useEffect(() => {
    if (!clientId) return;
    setPlanLoadDate(formatDateForAPI(new Date()));
    setDraftSlots([]);
    setRemovedSlotIds(new Set());
    setSlotCustomNames({});
    nextTempSlotIdRef.current = -1;
    seededEmptyPlanRef.current = false;
    setDayView(null);
    setDaySummary(null);
  }, [clientId]);

  const fetchClients = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/users/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => null))?.detail || `HTTP ${res.status}`);
      }
      type ClientApi = { id: number; full_name?: string | null; username?: string | null; email?: string | null };
      const data = (await res.json()) as ClientApi[];
      setClients(
        data.map((c) => ({
          id: c.id,
          full_name: c.full_name ?? c.username ?? `Client ${c.id}`,
          email: c.email ?? "",
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchCatalog = useCallback(
    async (macroType: MacroType) => {
      if (useV3MockBackend) {
        const res = await fetch(`${API_BASE_URL}/v3/meals-mock/catalog?macro_type=${macroType}&include_public=true`);
        if (!res.ok) {
          throw new Error((await res.json().catch(() => null))?.detail || `HTTP ${res.status}`);
        }
        return (await res.json()) as V3FoodOption[];
      }

      if (!token) return [];
      const res = await fetch(`${API_BASE_URL}/v3/meals/catalog?macro_type=${macroType}&include_public=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => null))?.detail || `HTTP ${res.status}`);
      }
      return (await res.json()) as V3FoodOption[];
    },
    [token, useV3MockBackend]
  );

  const fetchAllCatalog = useCallback(async () => {
    const [protein, carb, fat] = await Promise.all([fetchCatalog("protein"), fetchCatalog("carb"), fetchCatalog("fat")]);
    setProteinCatalog(protein);
    setCarbCatalog(carb);
    setFatCatalog(fat);
  }, [fetchCatalog]);

  const initializeMealSlotPlansFromDayView = useCallback(
    (view: V3DayViewResponse) => {
      setMealSlotPlansById((prev) => {
        const apiDerived: Record<number, MealSlotPlanState> = {};

        for (const slot of view.slots) {
          const proteinCat = slot.categories.find((c) => c.macro_type === "protein");
          const carbCat = slot.categories.find((c) => c.macro_type === "carb");
          const fatCat = slot.categories.find((c) => c.macro_type === "fat");

          const recommendedOrNull = (food: V3FoodOption | undefined | null) => (typeof food?.id === "number" ? food : null);

          const proteinRecommended = recommendedOrNull(proteinCat?.recommended_foods?.[0] ?? null);
          const carbRecommended = recommendedOrNull(carbCat?.recommended_foods?.[0] ?? null);
          const fatRecommended = recommendedOrNull(fatCat?.recommended_foods?.[0] ?? null);

          const mockAllowed: boolean = useV3MockBackend;

          const toAllowedIds = (foods: V3FoodOption[] | undefined | null): number[] => {
            if (!foods || foods.length === 0) return [];
            if (mockAllowed) return [];
            return foods
              .slice(1)
              .map((f) => (typeof f.id === "number" ? f.id : null))
              .filter((id): id is number => typeof id === "number");
          };

          const proteinQuantity = proteinCat?.quantity_instruction ?? proteinRecommended?.serving_size ?? "100g";
          const carbQuantity = carbCat?.quantity_instruction ?? carbRecommended?.serving_size ?? "100g";
          const fatQuantity = fatCat?.quantity_instruction ?? fatRecommended?.serving_size ?? "100g";

          const proteinQ = quantityFieldsFromInstructionAndFood(proteinQuantity, proteinRecommended);
          const carbQ = quantityFieldsFromInstructionAndFood(carbQuantity, carbRecommended);
          const fatQ = quantityFieldsFromInstructionAndFood(fatQuantity, fatRecommended);

          apiDerived[slot.meal_slot_id] = {
            protein: {
              ...proteinQ,
              recommendedFoodOptionId: proteinRecommended?.id ?? null,
              allowedSwapFoodOptionIds: toAllowedIds(proteinCat?.recommended_foods ?? []),
            },
            carb: {
              ...carbQ,
              recommendedFoodOptionId: carbRecommended?.id ?? null,
              allowedSwapFoodOptionIds: toAllowedIds(carbCat?.recommended_foods ?? []),
            },
            fat: {
              ...fatQ,
              recommendedFoodOptionId: fatRecommended?.id ?? null,
              allowedSwapFoodOptionIds: toAllowedIds(fatCat?.recommended_foods ?? []),
            },
          };
        }

        if (view.slots.length > 0) {
          return apiDerived;
        }

        const merged: Record<number, MealSlotPlanState> = { ...apiDerived };
        for (const [k, v] of Object.entries(prev)) {
          const id = Number(k);
          if (id < 0) merged[id] = v;
        }
        return merged;
      });
    },
    [useV3MockBackend]
  );

  const fetchDayForWeek = useCallback(async () => {
    if (!clientId) return;
    if (!useV3MockBackend && !token) return;
    setLoading(true);
    setError(null);
    try {
      const [viewRes, summaryRes] = useV3MockBackend
        ? [
            fetch(`${API_BASE_URL}/v3/meals-mock/day?date=${planLoadDate}`),
            fetch(`${API_BASE_URL}/v3/meals-mock/day/summary?date=${planLoadDate}`),
          ]
        : [
            fetch(`${API_BASE_URL}/v3/meals/day?date=${planLoadDate}&client_id=${clientId}`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch(`${API_BASE_URL}/v3/meals/day/summary?date=${planLoadDate}&client_id=${clientId}`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ];
      if (!viewRes.ok) {
        throw new Error((await viewRes.json().catch(() => null))?.detail || `HTTP ${viewRes.status}`);
      }
      if (!summaryRes.ok) {
        throw new Error((await summaryRes.json().catch(() => null))?.detail || `HTTP ${summaryRes.status}`);
      }
      const view = (await viewRes.json()) as V3DayViewResponse;
      const summary = (await summaryRes.json()) as V3DailyMacrosResponse;

      setDayView(view);
      setDaySummary(summary);
      initializeMealSlotPlansFromDayView(view);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load day view");
    } finally {
      setLoading(false);
    }
  }, [clientId, initializeMealSlotPlansFromDayView, token, useV3MockBackend, planLoadDate]);

  useEffect(() => {
    if (!user || user.role !== "TRAINER") return;
    if (clientId) return;
    fetchClients();
  }, [clientId, fetchClients, user]);

  useEffect(() => {
    // Bootstrap catalog once, independent of week/client.
    fetchAllCatalog().catch(() => null);
  }, [fetchAllCatalog]);

  useEffect(() => {
    if (!clientId) return;
    fetchDayForWeek().catch(() => null);
  }, [clientId, fetchDayForWeek]);

  const mealSlots = useMemo(() => dayView?.slots ?? [], [dayView]);

  const apiSlotsEffective = useMemo(
    () => mealSlots.filter((s) => !removedSlotIds.has(s.meal_slot_id)),
    [mealSlots, removedSlotIds]
  );

  const slotsForEditor = useMemo(
    () => [...apiSlotsEffective, ...draftSlots].sort((a, b) => a.order_index - b.order_index),
    [apiSlotsEffective, draftSlots]
  );

  useEffect(() => {
    if (!clientId || !dayView || loading) return;
    const apiSlots = dayView.slots ?? [];
    if (apiSlots.length > 0) return;
    if (draftSlots.length > 0) return;
    if (seededEmptyPlanRef.current) return;
    seededEmptyPlanRef.current = true;
    const id = nextTempSlotIdRef.current--;
    setDraftSlots([createDraftMealSlotView(id, 0, t("meals.weeklyMeals.defaultMealName", "Meal 1"))]);
  }, [clientId, dayView, loading, draftSlots.length, t]);

  const addMealSlot = useCallback(() => {
    const maxOrder = slotsForEditor.reduce((m, s) => Math.max(m, s.order_index), -1);
    const id = nextTempSlotIdRef.current--;
    setDraftSlots((d) => [
      ...d,
      createDraftMealSlotView(
        id,
        maxOrder + 1,
        t("meals.weeklyMeals.newMealSlot", "Meal {{n}}", { n: slotsForEditor.length + 1 })
      ),
    ]);
  }, [slotsForEditor, t]);

  const removeSlot = useCallback((slotId: number) => {
    if (slotId < 0) {
      setDraftSlots((d) => d.filter((s) => s.meal_slot_id !== slotId));
    } else {
      setRemovedSlotIds((prev) => new Set(prev).add(slotId));
    }
    setSlotCustomNames((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setMealSlotPlansById((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }, []);

  const updateMacroCategoryPlan = useCallback(
    (mealSlotId: number, macroType: MacroType, updater: (p: MacroCategoryPlan) => MacroCategoryPlan) => {
      setMealSlotPlansById((prev) => {
        const existing = prev[mealSlotId];
        const empty: MealSlotPlanState = {
          protein: createDefaultMacroCategoryPlan(),
          carb: createDefaultMacroCategoryPlan(),
          fat: createDefaultMacroCategoryPlan(),
        };

        const currentSlot = existing ?? empty;
        const macroKey = macroType as keyof MealSlotPlanState;
        return {
          ...prev,
          [mealSlotId]: {
            ...currentSlot,
            [macroKey]: updater(currentSlot[macroKey]),
          },
        };
      });
    },
    []
  );

  const setRecommendedFood = useCallback(
    (mealSlotId: number, macroType: MacroType, foodOptionId: number | null) => {
      updateMacroCategoryPlan(mealSlotId, macroType, (p) => {
        if (typeof foodOptionId !== "number") {
          return { ...p, recommendedFoodOptionId: null };
        }
        const food = catalogByMacro[macroType][foodOptionId];
        const defaultQi = food?.measurement_type === "per_portion" ? "1" : "100g";
        const q = quantityFieldsFromInstructionAndFood(defaultQi, food);
        return {
          ...p,
          recommendedFoodOptionId: foodOptionId,
          allowedSwapFoodOptionIds: p.allowedSwapFoodOptionIds.filter((id) => id !== foodOptionId),
          ...q,
        };
      });
    },
    [catalogByMacro, updateMacroCategoryPlan]
  );

  const setMacroQuantityMode = useCallback(
    (mealSlotId: number, macroType: MacroType, quantityMode: QuantityMode) => {
      updateMacroCategoryPlan(mealSlotId, macroType, (p) => {
        const next: MacroCategoryPlan = { ...p, quantityMode };
        return { ...next, quantityInstruction: instructionFromMacroPlan(next, t) };
      });
    },
    [t, updateMacroCategoryPlan]
  );

  const setMacroGramsAmount = useCallback(
    (mealSlotId: number, macroType: MacroType, gramsAmount: number) => {
      updateMacroCategoryPlan(mealSlotId, macroType, (p) => {
        const next: MacroCategoryPlan = { ...p, gramsAmount: Math.max(0.01, gramsAmount) };
        return { ...next, quantityInstruction: instructionFromMacroPlan(next, t) };
      });
    },
    [t, updateMacroCategoryPlan]
  );

  const setMacroPortionAmount = useCallback(
    (mealSlotId: number, macroType: MacroType, portionAmount: number) => {
      updateMacroCategoryPlan(mealSlotId, macroType, (p) => {
        const next: MacroCategoryPlan = { ...p, portionAmount: Math.max(0.01, portionAmount) };
        return { ...next, quantityInstruction: instructionFromMacroPlan(next, t) };
      });
    },
    [t, updateMacroCategoryPlan]
  );

  const addAllowedSwapFood = useCallback(
    (mealSlotId: number, macroType: MacroType, foodOptionId: number) => {
      updateMacroCategoryPlan(mealSlotId, macroType, (p) => {
        const exists = p.allowedSwapFoodOptionIds.includes(foodOptionId);
        if (exists) return p;
        if (p.recommendedFoodOptionId === foodOptionId) return p;
        return { ...p, allowedSwapFoodOptionIds: [...p.allowedSwapFoodOptionIds, foodOptionId] };
      });
    },
    [updateMacroCategoryPlan]
  );

  const removeAllowedSwapFood = useCallback(
    (mealSlotId: number, macroType: MacroType, foodOptionId: number) => {
      updateMacroCategoryPlan(mealSlotId, macroType, (p) => ({
        ...p,
        allowedSwapFoodOptionIds: p.allowedSwapFoodOptionIds.filter((id) => id !== foodOptionId),
      }));
    },
    [updateMacroCategoryPlan]
  );

  const [foodDialogOpen, setFoodDialogOpen] = useState(false);
  const [foodDialogMacroType, setFoodDialogMacroType] = useState<MacroType>("protein");
  const [foodDialogMealSlotId, setFoodDialogMealSlotId] = useState<number | null>(null);
  type FoodDialogMode = "recommended" | "allowed";
  const [foodDialogMode, setFoodDialogMode] = useState<FoodDialogMode>("recommended");
  const [foodDialogQuery, setFoodDialogQuery] = useState("");

  const foodDialogInputRef = useRef<HTMLInputElement | null>(null);

  const openFoodDialog = useCallback((macroType: MacroType, mealSlotId: number, mode: FoodDialogMode) => {
    setFoodDialogMacroType(macroType);
    setFoodDialogMealSlotId(mealSlotId);
    setFoodDialogMode(mode);
    setFoodDialogQuery("");
    setFoodDialogOpen(true);
  }, []);

  useEffect(() => {
    if (foodDialogOpen) {
      window.setTimeout(() => foodDialogInputRef.current?.focus(), 50);
    }
  }, [foodDialogOpen]);

  const currentDialogSlotPlan = useMemo(() => {
    if (!foodDialogMealSlotId) return null;
    return mealSlotPlansById[foodDialogMealSlotId] ?? null;
  }, [foodDialogMealSlotId, mealSlotPlansById]);

  const catalogItemsForDialog = useMemo(() => {
    if (foodDialogMacroType === "protein") return proteinCatalog;
    if (foodDialogMacroType === "carb") return carbCatalog;
    return fatCatalog;
  }, [carbCatalog, fatCatalog, foodDialogMacroType, proteinCatalog]);

  const filteredCatalogItems = useMemo(() => {
    const q = foodDialogQuery.trim().toLowerCase();
    if (!q) return catalogItemsForDialog;
    return catalogItemsForDialog.filter((item) => {
      const name = (isRtlHe ? item.name_hebrew ?? item.name : item.name) ?? "";
      return name.toLowerCase().includes(q);
    });
  }, [catalogItemsForDialog, foodDialogQuery, isRtlHe]);

  const applyFoodSelection = useCallback(
    (food: V3FoodOption) => {
      if (!foodDialogMealSlotId) return;
      if (typeof food.id !== "number") return;

      if (foodDialogMode === "recommended") {
        setRecommendedFood(foodDialogMealSlotId, foodDialogMacroType, food.id);
      } else {
        addAllowedSwapFood(foodDialogMealSlotId, foodDialogMacroType, food.id);
      }

      setFoodDialogOpen(false);
    },
    [addAllowedSwapFood, foodDialogMacroType, foodDialogMealSlotId, foodDialogMode, setRecommendedFood]
  );

  const publishWeekPlan = useCallback(async () => {
    if (!clientId) return;
    if (slotsForEditor.length === 0) {
      setError(t("meals.weeklyMeals.minOneSlot", "Add at least one meal slot."));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (!daySummary) return;
      if (!useV3MockBackend && !token) return;

      const plansPayloadSlots: V3CompleteMealSlotCreate[] = slotsForEditor
        .slice()
        .sort((a, b) => a.order_index - b.order_index)
        .map((slot) => {
          const slotPlan = mealSlotPlansById[slot.meal_slot_id];
          if (!slotPlan) {
            throw new Error(`Missing plan state for slot ${slot.meal_slot_id}`);
          }

          const slotMacroCreate = (macroType: MacroType): V3CompleteMacroCategoryCreate => {
            const macroKey = macroType as keyof MealSlotPlanState;
            const plan = slotPlan[macroKey];
            const recommendedId = plan.recommendedFoodOptionId;
            const quantityInstruction = instructionFromMacroPlan(plan, t);

            if (typeof recommendedId !== "number") {
              throw new Error(`Missing recommended food for ${macroType} in slot ${slot.meal_slot_id}`);
            }

            const allowedIds = plan.allowedSwapFoodOptionIds.filter((id) => id !== recommendedId);
            const foodIdsInOrder = [recommendedId, ...allowedIds];

            const food_options: V3CompleteMacroCategoryFoodCreate[] = foodIdsInOrder.map((foodId) => {
              const food = catalogByMacro[macroType][foodId];
              if (!food || typeof food.id !== "number") {
                return {
                  name: "",
                  name_hebrew: null,
                  calories: null,
                  protein: null,
                  carbs: null,
                  fat: null,
                  serving_size: quantityInstruction,
                  measurement_type: undefined,
                  notes: null,
                };
              }

              return {
                name: food.name ?? "",
                name_hebrew: food.name_hebrew ?? null,
                calories: food.calories ?? null,
                protein: food.protein ?? null,
                carbs: food.carbs ?? null,
                fat: food.fat ?? null,
                serving_size: quantityInstruction,
                measurement_type: food.measurement_type,
                notes: null,
              };
            });

            return {
              macro_type: macroType,
              quantity_instruction: quantityInstruction,
              calorie_goal: null,
              track_cross_macros: false,
              notes: null,
              food_options,
            };
          };

          const displayName = (slotCustomNames[slot.meal_slot_id] ?? slot.name).trim();
          return {
            name: displayName || t("meals.weeklyMeals.unnamedMeal", "Meal"),
            time_suggestion: slot.time_suggestion ?? null,
            notes: slot.notes ?? null,
            target_calories: null,
            target_protein: null,
            target_carbs: null,
            target_fat: null,
            macro_categories: ["protein", "carb", "fat"].map((m) => slotMacroCreate(m as MacroType)),
          };
        });

      const payload: V3CompleteMealPlanCreate = {
        client_id: clientId,
        name: t("meals.weeklyMeals.planName", "Client meal plan"),
        description: null,
        number_of_meals: slotsForEditor.length,
        total_calories: Math.round(daySummary.targets.calories),
        protein_target: Math.round(daySummary.targets.protein),
        carb_target: Math.round(daySummary.targets.carbs),
        fat_target: Math.round(daySummary.targets.fat),
        start_date: `${planLoadDate}T00:00:00`,
        end_date: null,
        meal_slots: plansPayloadSlots,
      };

      const endpoint = useV3MockBackend ? `${API_BASE_URL}/v3/meals-mock/plans` : `${API_BASE_URL}/v3/meals/plans`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...(useV3MockBackend ? {} : { Authorization: `Bearer ${token}` }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `HTTP ${res.status}`);
      }

      setDraftSlots([]);
      setRemovedSlotIds(new Set());
      seededEmptyPlanRef.current = false;

      // Refresh day view so UI reflects the published plan structure.
      await fetchDayForWeek();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish week plan");
    } finally {
      setLoading(false);
    }
  }, [
    API_BASE_URL,
    clientId,
    daySummary,
    fetchDayForWeek,
    slotsForEditor,
    slotCustomNames,
    setError,
    t,
    token,
    mealSlotPlansById,
    catalogByMacro,
    useV3MockBackend,
    planLoadDate,
  ]);

  const isMobileBlockerText = t("meals.weeklyMeals.mobileBlocker", "This page must be accessed via computer due to complexity.");

  return (
    <Layout currentPage="dashboard">
      {/* Mobile-first: hard block editing on phone */}
      <div className="lg:hidden p-4">
        <Card className="rounded-xl border-border/60 bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("meals.weeklyMeals.mobileTitle", "Desktop only")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{isMobileBlockerText}</CardContent>
        </Card>
      </div>

      <div className="hidden lg:block pb-20 lg:pb-8">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <h1 className="text-2xl lg:text-3xl font-bold">{t("meals.weeklyMeals.title", "Meal plan")}</h1>
              <p className="text-muted-foreground text-sm break-words">
                {t("meals.weeklyMeals.subtitle", {
                  defaultValue:
                    "One template for every day: add or remove meal slots, pick foods and allowed swaps, then save. This is not a different menu per weekday.",
                })}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              {clientId ? (
                <div className="min-w-[220px]">
                  <label className="text-sm font-medium">{t("meals.weeklyMeals.client", "Client")}</label>
                  <div className="w-full mt-1 px-3 py-2 border border-input rounded-lg bg-background text-sm break-words">
                    {clientDisplayName ?? `Client ${clientId}`}
                  </div>
                </div>
              ) : (
                <div className="min-w-[220px]">
                  <label className="text-sm font-medium">{t("meals.weeklyMeals.client", "Client")}</label>
                  <select
                    className="w-full mt-1 px-3 py-2 border border-input rounded-lg bg-background"
                    value={clientId ?? ""}
                    onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">{t("meals.weeklyMeals.selectClient", "Select client...")}</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {error ? (
            <Card className="border-destructive">
              <CardContent className="pt-4 text-sm text-destructive">{error}</CardContent>
            </Card>
          ) : null}

          {loading && (
            <Card>
              <CardContent className="pt-5 pb-5 text-center text-muted-foreground text-sm">{t("common.loading", "Loading...")}</CardContent>
            </Card>
          )}

          {/* Meal editor (primary) + summary sidebar */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 xl:col-span-8 space-y-3 order-2 xl:order-1">
              <Card className="rounded-xl">
                <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                  <CardTitle className="text-base">{t("meals.weeklyMeals.mealSlots", "Meal slots")}</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={addMealSlot} disabled={loading || !clientId}>
                    <Plus className="h-4 w-4 me-2" />
                    {t("meals.weeklyMeals.addMealSlot", "Add meal slot")}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {slotsForEditor.length === 0 ? (
                    <div className="text-muted-foreground text-sm">
                      {t("meals.weeklyMeals.noMeals", 'No meal slots yet. Use "Add meal slot" to start building the plan.')}
                    </div>
                  ) : (
                    slotsForEditor.map((slot) => {
                        const slotPlan = mealSlotPlansById[slot.meal_slot_id] ?? null;
                        const allowedTotal = slotPlan
                          ? slotPlan.protein.allowedSwapFoodOptionIds.length +
                            slotPlan.carb.allowedSwapFoodOptionIds.length +
                            slotPlan.fat.allowedSwapFoodOptionIds.length
                          : 0;
                        const displayName = slotCustomNames[slot.meal_slot_id] ?? slot.name;

                        return (
                          <div key={slot.meal_slot_id} className="rounded-lg border bg-background/40 p-4">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                              <div className="space-y-2 min-w-0 flex-1">
                                <div className="space-y-1">
                                  <label className="text-xs text-muted-foreground" htmlFor={`slot-name-${slot.meal_slot_id}`}>
                                    {t("meals.weeklyMeals.slotName", "Meal name")}
                                  </label>
                                  <Input
                                    id={`slot-name-${slot.meal_slot_id}`}
                                    value={displayName}
                                    onChange={(e) =>
                                      setSlotCustomNames((prev) => ({
                                        ...prev,
                                        [slot.meal_slot_id]: e.target.value,
                                      }))
                                    }
                                    className="font-semibold"
                                    dir={isRtlHe ? "rtl" : "ltr"}
                                  />
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  {slot.time_suggestion ? (
                                    <Badge variant="outline" className="shrink-0">
                                      {slot.time_suggestion}
                                    </Badge>
                                  ) : null}
                                  <div className="text-xs text-muted-foreground">
                                    {t("meals.weeklyMeals.allowedSwapsCount", {
                                      count: allowedTotal,
                                      defaultValue: "Allowed swaps",
                                    })}
                                    : <span className="tabular-nums">{allowedTotal}</span>
                                  </div>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                onClick={() => removeSlot(slot.meal_slot_id)}
                                disabled={loading}
                              >
                                <Trash2 className="h-4 w-4 me-2" />
                                {t("meals.weeklyMeals.removeMealSlot", "Remove")}
                              </Button>
                            </div>

                            <div className="mt-4 space-y-3">
                              {(
                                [
                                  { macro: "protein" as const, labelKey: "meals.weeklyMeals.plannerMacroProtein" },
                                  { macro: "carb" as const, labelKey: "meals.weeklyMeals.plannerMacroCarb" },
                                  { macro: "fat" as const, labelKey: "meals.weeklyMeals.plannerMacroFat" },
                                ] as const
                              ).map((m) => {
                                const macroKey = m.macro;
                                const macroPlan = slotPlan ? slotPlan[macroKey] : null;
                                const recommendedId = macroPlan?.recommendedFoodOptionId ?? null;
                                const recommendedFood = recommendedId ? catalogByMacro[macroKey][recommendedId] : undefined;
                                const allowedIds = macroPlan?.allowedSwapFoodOptionIds ?? [];

                                const allowedFoods = allowedIds
                                  .map((id) => catalogByMacro[macroKey][id])
                                  .filter((f): f is V3FoodOption => Boolean(f && typeof f.id === "number"));

                                const preview =
                                  recommendedFood && macroPlan
                                    ? scaledNutritionForPlanner(
                                        recommendedFood,
                                        macroPlan.quantityMode,
                                        macroPlan.gramsAmount,
                                        macroPlan.portionAmount
                                      )
                                    : null;

                                return (
                                  <div key={`${slot.meal_slot_id}_${macroKey}`} className="rounded-lg border bg-background/60 p-3 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs text-muted-foreground mb-1">
                                          {t(m.labelKey, m.macro === "protein" ? "🍗 Protein" : m.macro === "carb" ? "🍞 Carbs" : "🥑 Fats")}
                                        </div>
                                        <Button
                                          type="button"
                                          className="w-full justify-start gradient-orange text-background hover:opacity-90"
                                          onClick={() => openFoodDialog(macroKey, slot.meal_slot_id, "recommended")}
                                        >
                                          <Search className="h-4 w-4 me-2" />
                                          {recommendedFood
                                            ? isRtlHe
                                              ? recommendedFood.name_hebrew ?? recommendedFood.name
                                              : recommendedFood.name
                                            : t("meals.weeklyMeals.pickFood", "Pick food")}
                                        </Button>
                                      </div>
                                    </div>

                                    <div className="space-y-2">
                                      <div className="text-xs text-muted-foreground">{t("meals.weeklyMeals.quantity", "Fixed quantity")}</div>
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={macroPlan?.quantityMode === "per_100g" ? "default" : "outline"}
                                          className={macroPlan?.quantityMode === "per_100g" ? "gradient-orange text-background hover:opacity-90" : ""}
                                          onClick={() => setMacroQuantityMode(slot.meal_slot_id, macroKey, "per_100g")}
                                          disabled={!macroPlan}
                                        >
                                          {t("meals.weeklyMeals.quantityModePer100g", "Per 100g")}
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={macroPlan?.quantityMode === "per_portion" ? "default" : "outline"}
                                          className={macroPlan?.quantityMode === "per_portion" ? "gradient-orange text-background hover:opacity-90" : ""}
                                          onClick={() => setMacroQuantityMode(slot.meal_slot_id, macroKey, "per_portion")}
                                          disabled={!macroPlan}
                                        >
                                          {t("meals.weeklyMeals.quantityModePerPortion", "Per portion")}
                                        </Button>
                                      </div>
                                      {macroPlan?.quantityMode === "per_100g" ? (
                                        <div className="space-y-1">
                                          <label className="text-xs text-muted-foreground" htmlFor={`grams-${slot.meal_slot_id}-${macroKey}`}>
                                            {t("meals.weeklyMeals.gramsAmountLabel", "Grams")}
                                          </label>
                                          <Input
                                            id={`grams-${slot.meal_slot_id}-${macroKey}`}
                                            type="number"
                                            min={0.01}
                                            step={0.1}
                                            value={macroPlan.gramsAmount}
                                            onChange={(e) => {
                                              const v = parseFloat(e.target.value);
                                              if (!Number.isNaN(v)) setMacroGramsAmount(slot.meal_slot_id, macroKey, v);
                                            }}
                                            dir="ltr"
                                            className="max-w-[140px]"
                                          />
                                        </div>
                                      ) : (
                                        <div className="space-y-1">
                                          <label className="text-xs text-muted-foreground" htmlFor={`portions-${slot.meal_slot_id}-${macroKey}`}>
                                            {t("meals.weeklyMeals.portionsAmountLabel", "Portions")}
                                          </label>
                                          <Input
                                            id={`portions-${slot.meal_slot_id}-${macroKey}`}
                                            type="number"
                                            min={0.01}
                                            step={0.5}
                                            value={macroPlan?.portionAmount ?? 1}
                                            onChange={(e) => {
                                              const v = parseFloat(e.target.value);
                                              if (!Number.isNaN(v)) setMacroPortionAmount(slot.meal_slot_id, macroKey, v);
                                            }}
                                            dir="ltr"
                                            className="max-w-[140px]"
                                          />
                                        </div>
                                      )}
                                    </div>

                                    <div className="grid grid-cols-1 gap-2 items-start">
                                      <div>
                                        <div className="text-xs text-muted-foreground mb-1">{t("meals.weeklyMeals.macroPreview", "Preview")}</div>
                                        <div className="rounded-md border bg-background/50 p-2 text-sm">
                                          {recommendedFood && preview ? (
                                            <div className="flex flex-col gap-1">
                                              <div className="tabular-nums">
                                                {t("meals.calories", "Calories")}: {Math.round(preview.cal)}
                                              </div>
                                              <div className="tabular-nums text-muted-foreground">
                                                {t("meals.weeklyMeals.previewProteinShort", "P")}: {roundQuantity(preview.p)}g ·{" "}
                                                {t("meals.weeklyMeals.previewCarbsShort", "C")}: {roundQuantity(preview.c)}g ·{" "}
                                                {t("meals.weeklyMeals.previewFatShort", "F")}: {roundQuantity(preview.f)}g
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="text-muted-foreground">{t("meals.weeklyMeals.noFoodSelected", "No food selected")}</div>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="space-y-2">
                                      <div className="text-xs text-muted-foreground">{t("meals.weeklyMeals.allowedSwaps", "Allowed swaps")}</div>
                                      {allowedFoods.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">{t("meals.weeklyMeals.noAllowedSwaps", "No allowed swaps selected.")}</div>
                                      ) : (
                                        <div className="flex flex-wrap items-center gap-2">
                                          {allowedFoods.map((f) => {
                                            const name = isRtlHe ? f.name_hebrew ?? f.name : f.name;
                                            return (
                                              <div key={f.id} className="flex items-center gap-2 rounded-full border bg-background px-3 py-1">
                                                <span className="text-xs truncate max-w-[160px]">{name}</span>
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-7 w-7"
                                                  onClick={() => removeAllowedSwapFood(slot.meal_slot_id, macroKey, f.id as number)}
                                                  aria-label={t("common.delete", "Delete")}
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}

                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openFoodDialog(macroKey, slot.meal_slot_id, "allowed")}
                                      >
                                        <Plus className="h-4 w-4 me-2" />
                                        {t("meals.weeklyMeals.addAllowedFood", "Add allowed food")}
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="col-span-12 xl:col-span-4 space-y-3 order-1 xl:order-2">
              {daySummary ? (
                <Card className="rounded-xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t("meals.weeklyMeals.dailyTargets", "Daily targets")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("meals.calories", "Calories")}</span>
                      <span className="font-semibold tabular-nums">{Math.round(daySummary.targets.calories)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("meals.protein", "Protein")}</span>
                      <span className="font-semibold tabular-nums">{Math.round(daySummary.targets.protein)}g</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("meals.carbs", "Carbs")}</span>
                      <span className="font-semibold tabular-nums">{Math.round(daySummary.targets.carbs)}g</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("meals.fats", "Fats")}</span>
                      <span className="font-semibold tabular-nums">{Math.round(daySummary.targets.fat)}g</span>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Button
                type="button"
                className="w-full gradient-orange text-background"
                onClick={publishWeekPlan}
                disabled={loading || !clientId}
              >
                <Save className="h-4 w-4 ms-0 me-2" />
                {t("meals.weeklyMeals.savePlan", "Save meal plan")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={foodDialogOpen} onOpenChange={(open) => setFoodDialogOpen(open)}>
        <DialogContent className="sm:max-w-md w-full max-w-md mx-auto rounded-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t("meals.weeklyMeals.selectFood", "Select food")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">{t("meals.weeklyMeals.search", "Search")}</label>
              <Input
                ref={foodDialogInputRef}
                value={foodDialogQuery}
                onChange={(e) => setFoodDialogQuery(e.target.value)}
                placeholder={t("meals.weeklyMeals.searchPlaceholder", "Type to search...")}
                dir={isRtlHe ? "rtl" : "ltr"}
              />
            </div>

            <div className="max-h-[50vh] overflow-auto rounded-lg border bg-background/60">
              {filteredCatalogItems.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">{t("meals.weeklyMeals.noResults", "No results")}</div>
              ) : (
                <div className="flex flex-col divide-y">
                  {filteredCatalogItems.map((item) => {
                    const selected = (() => {
                      if (typeof item.id !== "number") return false;
                      if (!currentDialogSlotPlan) return false;
                      const macroKey = foodDialogMacroType as keyof MealSlotPlanState;
                      if (foodDialogMode === "recommended") {
                        return currentDialogSlotPlan[macroKey].recommendedFoodOptionId === item.id;
                      }
                      return currentDialogSlotPlan[macroKey].allowedSwapFoodOptionIds.includes(item.id);
                    })();
                    const name = isRtlHe ? item.name_hebrew ?? item.name : item.name;
                    return (
                      <Button
                        key={typeof item.id === "number" ? item.id : name}
                        type="button"
                        variant={selected ? "default" : "ghost"}
                        className="justify-start rounded-none px-3 py-2 w-full"
                        onClick={() => applyFoodSelection(item)}
                      >
                        <div className="flex flex-col w-full items-start">
                          <div className="flex items-center justify-between gap-2 w-full">
                            <span className="truncate text-sm font-semibold">{name}</span>
                            {selected ? <Badge variant="outline">{t("meals.weeklyMeals.selected", "Selected")}</Badge> : null}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {t("meals.calories", "Calories")}: {item.calories ?? 0} ·{" "}
                            {t("meals.protein", "Protein")}: {item.protein ?? 0}g ·{" "}
                            {t("meals.carbs", "Carbs")}: {item.carbs ?? 0}g ·{" "}
                            {t("meals.fats", "Fats")}: {item.fat ?? 0}g
                          </div>
                        </div>
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setFoodDialogOpen(false)} className="w-full sm:w-auto">
                {t("common.cancel", "Cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default TrainerWeeklyMealsPlannerV3;

