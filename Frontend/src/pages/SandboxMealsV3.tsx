import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Layout from "../components/Layout";
import MacroRings, { MACRO_COLORS } from "../components/meals/MacroRings";
import { API_BASE_URL } from "../config/api";
import {
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  MessageSquare,
  Plus,
  RefreshCw,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import type {
  MacroType,
  V3ClientMealChoiceResponse,
  V3DayViewResponse,
  V3FoodOption,
  V3MacroTotals,
  V3MealCompletionStatusResponse,
  V3MealLogCreateRequest,
  V3MealSlotView,
} from "../types/meals-v3";

const parseGrams = (value: string): number => {
  const match = value.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const n = parseFloat(match[1]);
  return Number.isFinite(n) ? n : 0;
};

const normalizeQuantityInstruction = (value?: string | null): string => {
  if (!value) return "100g";
  const trimmed = value.trim();
  if (!trimmed) return "100g";
  return trimmed;
};

const clampToPercent = (percent: number): number => {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, percent));
};

const ZERO_TOTALS: V3MacroTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

const addTotals = (a: V3MacroTotals, b: V3MacroTotals): V3MacroTotals => ({
  calories: a.calories + b.calories,
  protein: a.protein + b.protein,
  carbs: a.carbs + b.carbs,
  fat: a.fat + b.fat,
});

/** Menu numbers show at most one decimal, and never a trailing ".0". */
const formatMacro = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const percentOf = (consumed: number, target: number): number =>
  target > 0 ? clampToPercent((consumed / target) * 100) : 0;

const formatDayLabel = (isoDate: string, hebrew: boolean): string =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString(hebrew ? "he-IL" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * The four numeric columns of the menu table, in fixed left-to-right order.
 * Calories gets a wider column because its header carries the "kcal" suffix.
 */
const MACRO_COLUMNS = [
  { key: "calories", color: MACRO_COLORS.calories, unit: "", width: "w-[4.25rem] sm:w-20" },
  { key: "protein", color: MACRO_COLORS.protein, unit: "g", width: "w-[3.25rem] sm:w-16" },
  { key: "carbs", color: MACRO_COLORS.carbs, unit: "g", width: "w-[3.25rem] sm:w-16" },
  { key: "fat", color: MACRO_COLORS.fat, unit: "g", width: "w-[3.25rem] sm:w-16" },
] as const;

const COLUMN_CLASS = "shrink-0 text-center tabular-nums";

/** One planned food line inside a meal (plan row, possibly swapped for another food). */
type MealPlanRow = {
  key: string;
  macroType: MacroType;
  planFood: V3FoodOption & { id: number };
  rowChoice?: V3ClientMealChoiceResponse;
  deselectionKey: string;
  isDeselected: boolean;
  displayName: string;
  quantityLabel: string;
  planned: V3MacroTotals;
  consumed: V3MacroTotals;
  hasLog: boolean;
};

/** A free-text food the trainee added to the meal via "Add Food". */
type MealCustomRow = {
  key: string;
  choice: V3ClientMealChoiceResponse;
  displayName: string;
  quantityLabel: string;
  consumed: V3MacroTotals;
};

type MealView = {
  rows: MealPlanRow[];
  customRows: MealCustomRow[];
  planned: V3MacroTotals;
  consumed: V3MacroTotals;
};

/** Which entry the swap dialog should pre-select for a row (plan food, or the food swapped in). */
const swapEntryKeyForRow = (row: MealPlanRow): string => {
  const { planFood, rowChoice } = row;
  if (!rowChoice || rowChoice.food_option_id === planFood.id) return `p-${planFood.id}`;
  const swapped = parseRowSwapCustom(rowChoice.custom_food_name);
  if (swapped?.kind === "plan") return `p-${swapped.targetPlanFoodId}`;
  if (swapped?.kind === "bank") return `b-${swapped.bankId}`;
  return `p-${planFood.id}`;
};

const macroLabel = (t: ReturnType<typeof useTranslation>["t"], macroType: MacroType): string => {
  switch (macroType) {
    case "protein":
      return t("meals.protein", "Protein");
    case "carb":
      return t("meals.carbs", "Carbs");
    case "fat":
      return t("meals.fats", "Fats");
    default:
      return macroType;
  }
};

/** Row-tagged swaps encode plan-row + target so MealBank ids never collide with FoodOption ids. */
const V3_ROW_SWAP_PREFIX = "__V3MROW_";

type ParsedRowSwap =
  | { kind: "plan"; rowId: number; targetPlanFoodId: number; displayName: string }
  | { kind: "bank"; rowId: number; bankId: number; displayName: string };

const safeSwapDisplayName = (name: string): string => name.replace(/__/g, " ").trim() || "Food";

const encodeRowPlanSwap = (rowId: number, targetPlanFoodId: number, displayName: string): string =>
  `${V3_ROW_SWAP_PREFIX}${rowId}__P_${targetPlanFoodId}__${displayName}`;

const encodeRowBankSwap = (rowId: number, bankId: number, displayName: string): string =>
  `${V3_ROW_SWAP_PREFIX}${rowId}__B_${bankId}__${displayName}`;

const parseRowSwapCustom = (customName: string | null | undefined): ParsedRowSwap | null => {
  if (!customName?.startsWith(V3_ROW_SWAP_PREFIX)) return null;
  const rest = customName.slice(V3_ROW_SWAP_PREFIX.length);
  const planM = rest.match(/^(\d+)__P_(\d+)__(.+)$/);
  if (planM) {
    return {
      kind: "plan",
      rowId: Number(planM[1]),
      targetPlanFoodId: Number(planM[2]),
      displayName: planM[3],
    };
  }
  const bankM = rest.match(/^(\d+)__B_(\d+)__(.+)$/);
  if (bankM) {
    return {
      kind: "bank",
      rowId: Number(bankM[1]),
      bankId: Number(bankM[2]),
      displayName: bankM[3],
    };
  }
  return null;
};

const isOverallSlotCustomFoodName = (customName: string | null | undefined): boolean => {
  if (!customName?.trim()) return false;
  return parseRowSwapCustom(customName) === null;
};

const findChoiceForPlanFoodRow = (
  choices: V3ClientMealChoiceResponse[] | undefined,
  mealSlotId: number,
  planRowFoodId: number
): V3ClientMealChoiceResponse | undefined =>
  choices?.find((c) => {
    if (c.meal_slot_id !== mealSlotId) return false;
    if (c.food_option_id === planRowFoodId) return true;
    const p = parseRowSwapCustom(c.custom_food_name);
    return p?.rowId === planRowFoodId;
  });

export type MealMenuV3Mode = "mock" | "real";

export type MealMenuV3Props = {
  mode?: MealMenuV3Mode;
  /** When true, render only the meal UI (parent supplies `Layout`). */
  embedded?: boolean;
};

export const MealMenuV3: React.FC<MealMenuV3Props> = ({ mode = "real", embedded = false }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const accessToken = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const v3MealsBase = mode === "mock" ? `${API_BASE_URL}/v3/meals-mock` : `${API_BASE_URL}/v3/meals`;

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [dayView, setDayView] = useState<V3DayViewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [logInProgressKey, setLogInProgressKey] = useState<string | null>(null);

  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customDialogSlot, setCustomDialogSlot] = useState<V3MealSlotView | null>(null);
  const [customFoodName, setCustomFoodName] = useState("");
  const [customCalories, setCustomCalories] = useState("0");
  const [customProtein, setCustomProtein] = useState("0");
  const [customCarbs, setCustomCarbs] = useState("0");
  const [customFat, setCustomFat] = useState("0");
  const [customGramsInput, setCustomGramsInput] = useState("100");
  const [customSaving, setCustomSaving] = useState(false);

  const [askTrainerOpen, setAskTrainerOpen] = useState(false);
  const [askTrainerSlot, setAskTrainerSlot] = useState<V3MealSlotView | null>(null);
  const [askTrainerMacroType, setAskTrainerMacroType] = useState<MacroType>("protein");
  const [askTrainerMessage, setAskTrainerMessage] = useState("");
  const [askTrainerSaving, setAskTrainerSaving] = useState(false);

  const [completedMealSlotIds, setCompletedMealSlotIds] = useState<Record<number, boolean>>({});
  const [deselectedMealCategoryKeys, setDeselectedMealCategoryKeys] = useState<Record<string, boolean>>({});
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const swipeDeletingRef = React.useRef(false);

  const [swapOpen, setSwapOpen] = useState(false);
  const [swapSlot, setSwapSlot] = useState<V3MealSlotView | null>(null);
  const [swapMacroType, setSwapMacroType] = useState<MacroType>("protein");
  const [swapQuery, setSwapQuery] = useState("");
  const [swapSaving, setSwapSaving] = useState(false);
  const [swapSelectedEntryKey, setSwapSelectedEntryKey] = useState<string | null>(null);
  const [swapCatalogFoods, setSwapCatalogFoods] = useState<V3FoodOption[]>([]);
  const [swapCatalogLoading, setSwapCatalogLoading] = useState(false);
  const [swapRowPlanFoodId, setSwapRowPlanFoodId] = useState<number | null>(null);
  const swapSearchInputRef = useRef<HTMLInputElement | null>(null);

  const [summaryPage, setSummaryPage] = useState(0);
  const [daySummaryOpen, setDaySummaryOpen] = useState(false);
  const [notesSlot, setNotesSlot] = useState<V3MealSlotView | null>(null);
  const [resettingSlotId, setResettingSlotId] = useState<number | null>(null);
  const summaryPagerRef = useRef<HTMLDivElement | null>(null);

  const isRtlHe = (i18n.language || "").toLowerCase().startsWith("he");

  const getLocalizedFoodName = useCallback(
    (food: V3FoodOption): string => {
      if (isRtlHe) return food.name_hebrew || food.name;
      return food.name;
    },
    [isRtlHe]
  );

  const computeRecommendedDisplayMacros = useCallback(
    (food: V3FoodOption, quantityInstruction?: string | null) => {
      const quantity = normalizeQuantityInstruction(quantityInstruction);
      const grams = parseGrams(quantity);

      const measurementType = food.measurement_type;
      const scale = measurementType === "per_portion" ? grams : grams / 100;

      return {
        calories: (food.calories ?? 0) * scale,
        protein: (food.protein ?? 0) * scale,
        carbs: (food.carbs ?? 0) * scale,
        fat: (food.fat ?? 0) * scale,
      };
    },
    []
  );

  const fetchDayView = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === "real" && !accessToken) {
        throw new Error("Missing access token");
      }

      const res = await fetch(`${v3MealsBase}/day?date=${selectedDate}`, {
        method: "GET",
        headers: mode === "real" && accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as V3DayViewResponse;
      setDayView(data);

      if (mode === "real") {
        const compRes = await fetch(`${API_BASE_URL}/v3/meals/completions?date=${selectedDate}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (compRes.ok) {
          const rows = (await compRes.json()) as V3MealCompletionStatusResponse[];
          setCompletedMealSlotIds(
            rows.reduce<Record<number, boolean>>((acc, row) => {
              acc[row.meal_slot_id] = row.is_completed;
              return acc;
            }, {})
          );
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load day");
    } finally {
      setLoading(false);
    }
  }, [accessToken, mode, selectedDate, v3MealsBase]);

  useEffect(() => {
    fetchDayView();
  }, [fetchDayView]);

  useEffect(() => {
    if (!swapOpen) {
      setSwapCatalogFoods([]);
      setSwapCatalogLoading(false);
      return;
    }

    let cancelled = false;

    const loadCatalog = async () => {
      setSwapCatalogLoading(true);
      try {
        if (mode === "real" && !accessToken) {
          setSwapCatalogFoods([]);
          return;
        }
        const url = `${v3MealsBase}/catalog?macro_type=${swapMacroType}&include_public=true`;
        const res = await fetch(url, {
          headers: mode === "real" && accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });
        if (!res.ok) {
          if (!cancelled) setSwapCatalogFoods([]);
          return;
        }
        const data = (await res.json()) as V3FoodOption[];
        if (!cancelled) setSwapCatalogFoods(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setSwapCatalogFoods([]);
      } finally {
        if (!cancelled) setSwapCatalogLoading(false);
      }
    };

    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [accessToken, mode, swapMacroType, swapOpen, v3MealsBase]);

  useEffect(() => {
    if (swapOpen) {
      window.setTimeout(() => swapSearchInputRef.current?.focus(), 50);
    }
  }, [swapOpen]);

  // Reset per-day sandbox state when the date changes.
  useEffect(() => {
    setCompletedMealSlotIds({});
    setDeselectedMealCategoryKeys({});
  }, [selectedDate]);

  const logPlanFood = useCallback(
    async (slot: V3MealSlotView, macroType: MacroType, foodOptionId: number, quantityInstruction?: string | null) => {
      const key = `${slot.meal_slot_id}:${macroType}`;
      setLogInProgressKey(key);
      try {
        const payload: V3MealLogCreateRequest = {
          date: selectedDate,
          meal_slot_id: slot.meal_slot_id,
          macro_type: macroType,
          food_option_id: foodOptionId,
          quantity: normalizeQuantityInstruction(quantityInstruction),
        };

        const res = await fetch(`${v3MealsBase}/logs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(mode === "real" && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.detail || `HTTP ${res.status}`);
        }

        await fetchDayView();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save log");
      } finally {
        setLogInProgressKey(null);
      }
    },
    [accessToken, fetchDayView, mode, selectedDate, v3MealsBase]
  );

  const logRowEncodedSwap = useCallback(
    async (
      slot: V3MealSlotView,
      macroType: MacroType,
      customFoodName: string,
      quantity: string,
      macros: { calories: number; protein: number; carbs: number; fat: number }
    ) => {
      const key = `${slot.meal_slot_id}:${macroType}`;
      setLogInProgressKey(key);
      try {
        const payload: V3MealLogCreateRequest = {
          date: selectedDate,
          meal_slot_id: slot.meal_slot_id,
          macro_type: macroType,
          food_option_id: null,
          quantity,
          custom_food_name: customFoodName,
          custom_calories: macros.calories,
          custom_protein: macros.protein,
          custom_carbs: macros.carbs,
          custom_fat: macros.fat,
        };

        const res = await fetch(`${v3MealsBase}/logs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(mode === "real" && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.detail || `HTTP ${res.status}`);
        }

        await fetchDayView();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save log");
      } finally {
        setLogInProgressKey(null);
      }
    },
    [accessToken, fetchDayView, mode, selectedDate, v3MealsBase]
  );

  const deleteMealLog = useCallback(
    async (mealSlotId: number, macroType: MacroType, planRowFoodId?: number | null) => {
      try {
        if (typeof planRowFoodId === "number") {
          const rowChoice = findChoiceForPlanFoodRow(dayView?.choices, mealSlotId, planRowFoodId);
          if (!rowChoice) return;

          if (mode === "mock") {
            const payload: V3MealLogCreateRequest = {
              date: selectedDate,
              meal_slot_id: mealSlotId,
              macro_type: macroType,
              food_option_id: rowChoice.food_option_id,
              quantity: rowChoice.quantity,
              custom_food_name: rowChoice.custom_food_name,
              custom_calories: rowChoice.custom_calories,
              custom_protein: rowChoice.custom_protein,
              custom_carbs: rowChoice.custom_carbs,
              custom_fat: rowChoice.custom_fat,
            };

            const res = await fetch(`${v3MealsBase}/logs`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!res.ok) {
              const detail = await res.json().catch(() => null);
              throw new Error(detail?.detail || `HTTP ${res.status}`);
            }

            await fetchDayView();
            return;
          }

          if (!accessToken) return;

          const res = await fetch(`${API_BASE_URL}/v3/meals/logs/${rowChoice.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!res.ok) {
            const detail = await res.json().catch(() => null);
            throw new Error(detail?.detail || `HTTP ${res.status}`);
          }

          await fetchDayView();
          return;
        }

        if (mode === "mock") {
          const payload: V3MealLogCreateRequest = {
            date: selectedDate,
            meal_slot_id: mealSlotId,
            macro_type: macroType,
            food_option_id: null,
            quantity: null,
          };

          const res = await fetch(`${v3MealsBase}/logs`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const detail = await res.json().catch(() => null);
            throw new Error(detail?.detail || `HTTP ${res.status}`);
          }

          await fetchDayView();
          return;
        }

        if (!dayView || !accessToken) return;

        const customChoice = dayView.choices.find(
          (c) =>
            c.meal_slot_id === mealSlotId &&
            c.food_option_id == null &&
            Boolean((c.custom_food_name ?? "").trim()) &&
            isOverallSlotCustomFoodName(c.custom_food_name)
        );

        if (customChoice) {
          const res = await fetch(`${API_BASE_URL}/v3/meals/logs/${customChoice.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!res.ok) {
            const detail = await res.json().catch(() => null);
            throw new Error(detail?.detail || `HTTP ${res.status}`);
          }

          await fetchDayView();
          return;
        }

        const slot = dayView.slots.find((s) => s.meal_slot_id === mealSlotId) ?? null;
        const category = slot?.categories.find((c) => c.macro_type === macroType) ?? null;
        const chosenFoodId = typeof category?.chosen_food?.food_option_id === "number" ? category?.chosen_food?.food_option_id : null;
        if (!chosenFoodId) return;

        const chosenChoice = dayView.choices.find(
          (c) => c.meal_slot_id === mealSlotId && c.food_option_id === chosenFoodId
        );
        if (!chosenChoice) return;

        const res = await fetch(`${API_BASE_URL}/v3/meals/logs/${chosenChoice.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.detail || `HTTP ${res.status}`);
        }

        await fetchDayView();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete log");
      }
    },
    [accessToken, dayView, fetchDayView, mode, selectedDate, v3MealsBase]
  );

  const applyMealCompletion = useCallback(
    async (slot: V3MealSlotView) => {
      const mealSlotHasCustomOverall =
        mode === "mock"
          ? (dayView?.choices?.length
              ? dayView!.choices.some(
                  (c) =>
                    c.meal_slot_id === slot.meal_slot_id &&
                    c.food_option_id == null &&
                    Boolean((c.custom_food_name ?? "").trim()) &&
                    isOverallSlotCustomFoodName(c.custom_food_name)
                )
              : slot.categories.some((c) => {
                  const ch = c.chosen_food;
                  if (!ch) return false;
                  return (
                    ch.food_option_id == null &&
                    Boolean((ch.custom_food_name ?? "").trim()) &&
                    isOverallSlotCustomFoodName(ch.custom_food_name)
                  );
                }))
          : Boolean(
              dayView?.choices.some(
                (c) =>
                  c.meal_slot_id === slot.meal_slot_id &&
                  c.food_option_id == null &&
                  Boolean((c.custom_food_name ?? "").trim()) &&
                  isOverallSlotCustomFoodName(c.custom_food_name)
              )
            );

      // If the trainee logged a "custom food overall", the mock already stores it under one macro
      // but computes all macro totals, so we should not add defaults on top.
      if (mealSlotHasCustomOverall) {
        if (mode === "real") {
          if (!accessToken) return;
          const completionRes = await fetch(`${API_BASE_URL}/v3/meals/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              meal_slot_id: slot.meal_slot_id,
              date: selectedDate,
              is_completed: true,
              completion_method: "manual",
            }),
          });

          if (!completionRes.ok) {
            const detail = await completionRes.json().catch(() => null);
            throw new Error(detail?.detail || `HTTP ${completionRes.status}`);
          }
        }

        await fetchDayView();
        return;
      }

      const logsToCreate: Array<Pick<V3MealLogCreateRequest, "macro_type" | "food_option_id" | "quantity">> = [];

      for (const cat of slot.categories) {
        const sortedFoods = [...(cat.recommended_foods ?? [])].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
        for (const planFood of sortedFoods) {
          if (typeof planFood.id !== "number") continue;
          const rowDeselect = `${selectedDate}:${slot.meal_slot_id}:${cat.macro_type}:${planFood.id}`;
          if (deselectedMealCategoryKeys[rowDeselect]) continue;
          const existing = findChoiceForPlanFoodRow(dayView?.choices, slot.meal_slot_id, planFood.id);
          if (existing) continue;

          logsToCreate.push({
            macro_type: cat.macro_type,
            food_option_id: planFood.id,
            quantity: normalizeQuantityInstruction(cat.quantity_instruction),
          });
        }
      }

      try {
        for (const entry of logsToCreate) {
          const key = `${slot.meal_slot_id}:${entry.macro_type}`;
          setLogInProgressKey(key);

          const payload: V3MealLogCreateRequest = {
            date: selectedDate,
            meal_slot_id: slot.meal_slot_id,
            macro_type: entry.macro_type,
            food_option_id: entry.food_option_id as number,
            quantity: entry.quantity,
            custom_food_name: undefined,
            custom_calories: undefined,
            custom_protein: undefined,
            custom_carbs: undefined,
            custom_fat: undefined,
          };

          const res = await fetch(`${v3MealsBase}/logs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(mode === "real" && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const detail = await res.json().catch(() => null);
            throw new Error(detail?.detail || `HTTP ${res.status}`);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save completion");
      } finally {
        setLogInProgressKey(null);
      }

      if (mode === "real") {
        if (!accessToken) return;
        const completionRes = await fetch(`${API_BASE_URL}/v3/meals/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            meal_slot_id: slot.meal_slot_id,
            date: selectedDate,
            is_completed: true,
            completion_method: "manual",
          }),
        });

        if (!completionRes.ok) {
          const detail = await completionRes.json().catch(() => null);
          throw new Error(detail?.detail || `HTTP ${completionRes.status}`);
        }
      }

      await fetchDayView();
    },
    [accessToken, deselectedMealCategoryKeys, fetchDayView, mode, selectedDate, v3MealsBase, dayView]
  );

  const openCustomDialogForSlot = useCallback((slot: V3MealSlotView) => {
    setCustomDialogSlot(slot);

    setCustomFoodName("");
    setCustomCalories("0");
    setCustomProtein("0");
    setCustomCarbs("0");
    setCustomFat("0");
    setCustomGramsInput("100");

    setCustomDialogOpen(true);
  }, []);

  const submitCustomFood = useCallback(async () => {
    if (!customDialogSlot) return;
    setCustomSaving(true);
    try {
      const grams = parseGrams(customGramsInput);
      if (!grams || grams <= 0) {
        throw new Error("Invalid grams amount");
      }

      // Trainee enters macros for 100g, we scale them to the chosen grams.
      const scale = grams / 100;
      const baseCalories = Number(customCalories) || 0;
      const baseProtein = Number(customProtein) || 0;
      const baseCarbs = Number(customCarbs) || 0;
      const baseFat = Number(customFat) || 0;

      const quantityInstruction = `${grams}g`;

      // Backend contract requires a `macro_type`. For "custom food overall",
      // we store it under protein and render it as the meal-slot custom choice in the UI.

      const payload: V3MealLogCreateRequest = {
        date: selectedDate,
        meal_slot_id: customDialogSlot.meal_slot_id,
        macro_type: "protein",
        food_option_id: null,
        custom_food_name: customFoodName || t("meals.custom", "Custom"),
        custom_calories: baseCalories * scale,
        custom_protein: baseProtein * scale,
        custom_carbs: baseCarbs * scale,
        custom_fat: baseFat * scale,
        quantity: quantityInstruction,
      };

      const res = await fetch(`${v3MealsBase}/logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(mode === "real" && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `HTTP ${res.status}`);
      }

      setCustomDialogOpen(false);
      setCustomDialogSlot(null);
      await fetchDayView();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save custom food");
    } finally {
      setCustomSaving(false);
    }
  }, [
    customDialogSlot,
    customCalories,
    customCarbs,
    customFat,
    customFoodName,
    customProtein,
    customGramsInput,
    fetchDayView,
    selectedDate,
    t,
  ]);

  const openAskTrainerDialog = useCallback((slot: V3MealSlotView) => {
    const proteinCat = slot.categories.find((c) => c.macro_type === "protein");

    setAskTrainerSlot(slot);
    setAskTrainerMacroType(proteinCat?.macro_type ?? "protein");
    setAskTrainerMessage("");
    setAskTrainerOpen(true);
  }, []);

  const submitAskTrainer = useCallback(async () => {
    if (!askTrainerSlot) return;
    setAskTrainerSaving(true);
    try {
      if (mode === "mock") {
        const entry = {
          date: selectedDate,
          meal_slot_id: askTrainerSlot.meal_slot_id,
          meal_slot_name: askTrainerSlot.name,
          macro_type: askTrainerMacroType,
          message: askTrainerMessage,
        };

        const key = "mealsV3Mock_chat_links";
        const prevRaw = localStorage.getItem(key);
        const prev = prevRaw ? (JSON.parse(prevRaw) as unknown[]) : [];
        localStorage.setItem(key, JSON.stringify([...prev, entry]));

        toast({
          title: t("meals.askTrainerLinkedTitle", "Sent to trainer (mock)"),
          description: t("meals.askTrainerLinkedDesc", "Saved locally in sandbox mode."),
        });

        setAskTrainerOpen(false);
        setAskTrainerSlot(null);
        return;
      }

      if (!user || !accessToken) {
        throw new Error("Missing auth");
      }

      const context = `${askTrainerSlot.name} (${macroLabel(t, askTrainerMacroType)})`;
      const messageText = `${context}: ${askTrainerMessage}`;

      const res = await fetch(`${API_BASE_URL}/v2/chat/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          client_id: user.id,
          message: messageText,
          progress_entry_id: null,
        }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `HTTP ${res.status}`);
      }

      toast({
        title: t("meals.askTrainerLinkedTitle", "Sent to trainer"),
        description: t("meals.askTrainerLinkedDesc", "Saved in your chat."),
      });

      setAskTrainerOpen(false);
      setAskTrainerSlot(null);
      navigate("/chat");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link to chat");
    } finally {
      setAskTrainerSaving(false);
    }
  }, [
    accessToken,
    askTrainerMacroType,
    askTrainerMessage,
    askTrainerSlot,
    navigate,
    mode,
    selectedDate,
    t,
    toast,
    user,
  ]);

  type SwapPickSource = "plan" | "bank";

  const submitSwapPick = useCallback(
    async (source: SwapPickSource, food: V3FoodOption, quantityInstruction?: string | null) => {
      if (!swapSlot || typeof swapRowPlanFoodId !== "number" || typeof food.id !== "number") return;
      const rowId = swapRowPlanFoodId;
      const qty = normalizeQuantityInstruction(quantityInstruction);
      setSwapSaving(true);
      try {
        const existingRow = findChoiceForPlanFoodRow(dayView?.choices, swapSlot.meal_slot_id, rowId);
        if (existingRow) {
          await deleteMealLog(swapSlot.meal_slot_id, swapMacroType, rowId);
        }

        if (source === "plan") {
          if (food.id === rowId) {
            await logPlanFood(swapSlot, swapMacroType, food.id, qty);
          } else {
            const display = safeSwapDisplayName(getLocalizedFoodName(food));
            const m = computeRecommendedDisplayMacros(food, qty);
            await logRowEncodedSwap(swapSlot, swapMacroType, encodeRowPlanSwap(rowId, food.id, display), qty, {
              calories: m.calories,
              protein: m.protein,
              carbs: m.carbs,
              fat: m.fat,
            });
          }
        } else {
          const display = safeSwapDisplayName(getLocalizedFoodName(food));
          const m = computeRecommendedDisplayMacros(food, qty);
          await logRowEncodedSwap(swapSlot, swapMacroType, encodeRowBankSwap(rowId, food.id, display), qty, {
            calories: m.calories,
            protein: m.protein,
            carbs: m.carbs,
            fat: m.fat,
          });
        }

        setSwapOpen(false);
        setSwapSlot(null);
        setSwapRowPlanFoodId(null);
        setSwapQuery("");
        setSwapSelectedEntryKey(null);
      } finally {
        setSwapSaving(false);
      }
    },
    [
      computeRecommendedDisplayMacros,
      deleteMealLog,
      getLocalizedFoodName,
      logPlanFood,
      logRowEncodedSwap,
      dayView?.choices,
      swapMacroType,
      swapRowPlanFoodId,
      swapSlot,
    ]
  );

  const formatQuantityLabel = useCallback(
    (quantity: string | null | undefined, food?: V3FoodOption | null): string => {
      const raw = normalizeQuantityInstruction(quantity);
      const amount = parseGrams(raw);
      if (amount <= 0) return raw;
      if (food?.measurement_type !== "per_portion") {
        return `${formatMacro(amount)} ${t("meals.gramsShort", "g")}`;
      }
      const unit = amount === 1 ? t("meals.qtyUnitOne", "Qty") : t("meals.qtyUnit", "Qty");
      return `${formatMacro(amount)} ${unit}`;
    },
    [t]
  );

  /** Flattens a meal slot into printable table rows plus its planned/consumed totals. */
  const buildMealView = useCallback(
    (slot: V3MealSlotView): MealView => {
      const rows: MealPlanRow[] = [];
      let planned = ZERO_TOTALS;
      let consumed = ZERO_TOTALS;

      for (const cat of slot.categories) {
        const planFoods = [...(cat.recommended_foods ?? [])]
          .filter((f): f is V3FoodOption & { id: number } => typeof f.id === "number")
          .sort((a, b) => a.id - b.id);

        const quantityText = normalizeQuantityInstruction(cat.quantity_instruction);

        for (const planFood of planFoods) {
          const rowChoice = findChoiceForPlanFoodRow(dayView?.choices, slot.meal_slot_id, planFood.id);
          const deselectionKey = `${selectedDate}:${slot.meal_slot_id}:${cat.macro_type}:${planFood.id}`;
          const isDeselected = Boolean(deselectedMealCategoryKeys[deselectionKey]);

          let displayName = getLocalizedFoodName(planFood);
          let quantityLabel = formatQuantityLabel(quantityText, planFood);
          let rowConsumed = ZERO_TOTALS;

          if (rowChoice) {
            const encoded = parseRowSwapCustom(rowChoice.custom_food_name);
            if (encoded) {
              displayName = encoded.displayName;
              rowConsumed = {
                calories: rowChoice.custom_calories ?? 0,
                protein: rowChoice.custom_protein ?? 0,
                carbs: rowChoice.custom_carbs ?? 0,
                fat: rowChoice.custom_fat ?? 0,
              };
              quantityLabel = formatQuantityLabel(rowChoice.quantity ?? quantityText, planFood);
            } else if (typeof rowChoice.food_option_id === "number") {
              const targetFood = cat.recommended_foods.find((f) => f.id === rowChoice.food_option_id) ?? planFood;
              displayName = getLocalizedFoodName(targetFood);
              rowConsumed = computeRecommendedDisplayMacros(targetFood, rowChoice.quantity ?? quantityText);
              quantityLabel = formatQuantityLabel(rowChoice.quantity ?? quantityText, targetFood);
            }
          }

          const rowPlanned = isDeselected ? ZERO_TOTALS : computeRecommendedDisplayMacros(planFood, quantityText);

          planned = addTotals(planned, rowPlanned);
          consumed = addTotals(consumed, rowConsumed);

          rows.push({
            key: `${cat.macro_type}-${planFood.id}`,
            macroType: cat.macro_type,
            planFood,
            rowChoice,
            deselectionKey,
            isDeselected,
            displayName,
            quantityLabel,
            planned: rowPlanned,
            consumed: rowConsumed,
            hasLog: Boolean(rowChoice),
          });
        }
      }

      const customRows: MealCustomRow[] = (dayView?.choices ?? [])
        .filter(
          (c) =>
            c.meal_slot_id === slot.meal_slot_id &&
            c.food_option_id == null &&
            Boolean((c.custom_food_name ?? "").trim()) &&
            isOverallSlotCustomFoodName(c.custom_food_name)
        )
        .map((choice) => {
          const macros: V3MacroTotals = {
            calories: choice.custom_calories ?? 0,
            protein: choice.custom_protein ?? 0,
            carbs: choice.custom_carbs ?? 0,
            fat: choice.custom_fat ?? 0,
          };
          consumed = addTotals(consumed, macros);
          return {
            key: `custom-${choice.id}`,
            choice,
            displayName: choice.custom_food_name ?? t("meals.custom", "Custom"),
            quantityLabel: formatQuantityLabel(choice.quantity),
            consumed: macros,
          };
        });

      return { rows, customRows, planned, consumed };
    },
    [
      computeRecommendedDisplayMacros,
      dayView?.choices,
      deselectedMealCategoryKeys,
      formatQuantityLabel,
      getLocalizedFoodName,
      selectedDate,
      t,
    ]
  );

  /** Clears every logged line of a meal so the trainee can start the meal over. */
  const resetMeal = useCallback(
    async (slot: V3MealSlotView, view: MealView) => {
      setResettingSlotId(slot.meal_slot_id);
      try {
        for (const row of view.rows) {
          if (row.hasLog) {
            await deleteMealLog(slot.meal_slot_id, row.macroType, row.planFood.id);
          }
        }
        if (view.customRows.length > 0) {
          await deleteMealLog(slot.meal_slot_id, "protein");
        }
        setDeselectedMealCategoryKeys((prev) => {
          const next = { ...prev };
          const prefix = `${selectedDate}:${slot.meal_slot_id}:`;
          Object.keys(next).forEach((k) => {
            if (k.startsWith(prefix)) delete next[k];
          });
          return next;
        });
        setCompletedMealSlotIds((prev) => ({ ...prev, [slot.meal_slot_id]: false }));
      } finally {
        setResettingSlotId(null);
      }
    },
    [deleteMealLog, selectedDate]
  );

  const copyMeal = useCallback(
    async (slot: V3MealSlotView, view: MealView) => {
      const lines = [
        `${slot.name} ג€” ${formatDayLabel(selectedDate, isRtlHe)}`,
        ...view.rows
          .filter((r) => !r.isDeselected)
          .map((r) => `ג€¢ ${r.displayName} (${r.quantityLabel})`),
        ...view.customRows.map((r) => `ג€¢ ${r.displayName} (${r.quantityLabel})`),
        `${t("meals.calories", "Calories")}: ${formatMacro(view.consumed.calories)}/${formatMacro(view.planned.calories)}`,
        `${t("meals.protein", "Protein")}: ${formatMacro(view.consumed.protein)}/${formatMacro(view.planned.protein)}g`,
        `${t("meals.carbs", "Carbs")}: ${formatMacro(view.consumed.carbs)}/${formatMacro(view.planned.carbs)}g`,
        `${t("meals.fats", "Fats")}: ${formatMacro(view.consumed.fat)}/${formatMacro(view.planned.fat)}g`,
      ];

      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        toast({ title: t("meals.copied", "Copied to clipboard") });
      } catch {
        setError(t("meals.copyFailed", "Could not copy this meal"));
      }
    },
    [isRtlHe, selectedDate, t, toast]
  );

  const totals = useMemo(() => dayView?.daily_macros, [dayView]);

  const dateLabel = useMemo(() => {
    const todayIso = new Date().toISOString().split("T")[0];
    if (selectedDate === todayIso) return t("meals.today", "Today");
    return formatDayLabel(selectedDate, isRtlHe);
  }, [isRtlHe, selectedDate, t]);

  const goToDay = useCallback(
    (offsetDays: number) => {
      const d = new Date(`${selectedDate}T12:00:00`);
      d.setDate(d.getDate() + offsetDays);
      setSelectedDate(d.toISOString().split("T")[0]);
    },
    [selectedDate]
  );

  const orderedSlots = useMemo(
    () => (dayView?.slots ?? []).slice().sort((a, b) => a.order_index - b.order_index),
    [dayView?.slots]
  );

  /** Day-summary dialog + per-meal headers read from the same computed views. */
  const mealViews = useMemo(
    () => orderedSlots.map((slot) => ({ slot, view: buildMealView(slot) })),
    [buildMealView, orderedSlots]
  );

  const summaryLines = totals
    ? ([
        {
          key: "calories" as const,
          label: t("meals.kcalLabel", "Kcal"),
          consumed: totals.consumed.calories,
          target: totals.targets.calories,
          unit: t("meals.kcalUnit", "kcal"),
        },
        {
          key: "protein" as const,
          label: t("meals.protein", "Protein"),
          consumed: totals.consumed.protein,
          target: totals.targets.protein,
          unit: "g",
        },
        {
          key: "carbs" as const,
          label: t("meals.carbs", "Carbs"),
          consumed: totals.consumed.carbs,
          target: totals.targets.carbs,
          unit: "g",
        },
        {
          key: "fat" as const,
          label: t("meals.fats", "Fats"),
          consumed: totals.consumed.fat,
          target: totals.targets.fat,
          unit: "g",
        },
      ])
    : [];

  const inner = (
    <div className="pb-24 lg:pb-8 bg-background min-h-full">
        {/* Menu title bar */}
        <div className="relative flex items-center justify-center border-b border-border/60 px-3 py-3">
          <h1 className="text-lg font-bold">{t("meals.menuTitle", "Menu")}</h1>
          <button
            type="button"
            onClick={() => setDaySummaryOpen(true)}
            aria-label={t("meals.daySummary", "Day summary")}
            className="absolute end-2 p-2 rounded-lg transition-colors hover:bg-secondary"
            style={{ color: MACRO_COLORS.calories }}
          >
            <ClipboardList className="h-6 w-6" />
          </button>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Day switcher + active plan name */}
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
            {/* dir=ltr: chevrons stay "earlier left / later right" under page RTL */}
            <div className="flex items-center gap-3" dir="ltr">
              <Button
                variant="secondary"
                size="icon"
                className="h-10 w-10 rounded-xl"
                onClick={() => goToDay(-1)}
                aria-label={t("meals.prevDay", "Previous day")}
              >
                <ChevronLeft className="h-5 w-5" style={{ color: MACRO_COLORS.calories }} />
              </Button>
              <span dir="auto" className="text-xl font-semibold min-w-[84px] text-center">
                {dateLabel}
              </span>
              <Button
                variant="secondary"
                size="icon"
                className="h-10 w-10 rounded-xl"
                onClick={() => goToDay(1)}
                aria-label={t("meals.nextDay", "Next day")}
              >
                <ChevronRight className="h-5 w-5" style={{ color: MACRO_COLORS.calories }} />
              </Button>
            </div>

            {dayView?.meal_plan_name ? (
              <span
                dir="auto"
                className="text-xl font-semibold truncate max-w-[45%] text-end"
                style={{ color: MACRO_COLORS.calories }}
              >
                {dayView.meal_plan_name}
              </span>
            ) : null}
          </div>

          {loading && (
            <p className="px-4 py-3 text-sm text-muted-foreground">{t("common.loading", "Loading...")}</p>
          )}

          {error && <p className="px-4 py-3 text-sm text-destructive">{error}</p>}

          {/* Daily macros: page 1 = rings, page 2 = remaining breakdown */}
          {totals && (
            <div className="border-b border-border/60 pb-3">
              <div
                ref={summaryPagerRef}
                dir="ltr"
                className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const page = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
                  if (page !== summaryPage) setSummaryPage(page);
                }}
              >
                {/* Page 1 - totals list + concentric rings */}
                <div className="w-full shrink-0 snap-center px-4 py-4">
                  <div className="flex items-center justify-between gap-4" dir="ltr">
                    <div className="min-w-0 space-y-1.5">
                      {summaryLines.map((line) => (
                        <div key={line.key} className="flex items-baseline gap-2 text-lg sm:text-xl">
                          <span className="font-medium">{line.label}</span>
                          <span className="font-semibold tabular-nums" style={{ color: MACRO_COLORS[line.key] }}>
                            {formatMacro(line.consumed)}/{formatMacro(line.target)}
                            {line.unit}
                          </span>
                        </div>
                      ))}
                    </div>

                    <MacroRings
                      className="shrink-0 h-40 w-40 sm:h-48 sm:w-48"
                      label={t("meals.macros", "Macros")}
                      rings={summaryLines.map((line) => ({
                        key: line.key,
                        percent: percentOf(line.consumed, line.target),
                      }))}
                    />
                  </div>
                </div>

                {/* Page 2 - what is still left for the day */}
                <div className="w-full shrink-0 snap-center px-4 py-4">
                  <div className="text-sm font-medium text-muted-foreground mb-3">
                    {t("meals.remainingToday", "Remaining today")}
                  </div>
                  <div className="space-y-3">
                    {summaryLines.map((line) => {
                      const left = Math.max(0, line.target - line.consumed);
                      return (
                        <div key={line.key}>
                          <div className="flex items-baseline justify-between text-sm">
                            <span className="font-medium">{line.label}</span>
                            <span className="tabular-nums font-semibold" style={{ color: MACRO_COLORS[line.key] }}>
                              {formatMacro(left)}
                              {line.unit}
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-[width] duration-500"
                              style={{
                                width: `${percentOf(line.consumed, line.target)}%`,
                                backgroundColor: MACRO_COLORS[line.key],
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 pt-1" dir="ltr">
                {[0, 1].map((page) => (
                  <button
                    key={page}
                    type="button"
                    aria-label={t("meals.summaryPage", "Summary page {{n}}", { n: page + 1 })}
                    aria-current={summaryPage === page}
                    onClick={() => {
                      const el = summaryPagerRef.current;
                      if (el) el.scrollTo({ left: page * el.clientWidth, behavior: "smooth" });
                    }}
                    className="h-2 w-2 rounded-full transition-colors"
                    style={{
                      backgroundColor: summaryPage === page ? MACRO_COLORS.calories : "hsl(var(--muted-foreground) / 0.4)",
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {mealViews.length ? (
            <div>
              {mealViews.map(({ slot, view }) => {
                const isCompleted = Boolean(completedMealSlotIds[slot.meal_slot_id]);
                const isResetting = resettingSlotId === slot.meal_slot_id;

                return (
                  <section
                    key={slot.meal_slot_id}
                    className={`border-b border-border/60 ${isCompleted ? "bg-emerald-500/[0.06]" : ""}`}
                  >
                    <div className="px-4 pt-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 dir="auto" className="text-lg sm:text-xl font-bold leading-snug break-words">
                            {slot.name}
                          </h2>
                          {slot.time_suggestion ? (
                            <div className="text-xs text-muted-foreground mt-0.5">{slot.time_suggestion}</div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0" style={{ color: MACRO_COLORS.calories }}>
                          <button
                            type="button"
                            className="p-2 rounded-lg transition-colors hover:bg-secondary disabled:opacity-40"
                            aria-label={t("meals.resetMeal", "Reset meal")}
                            disabled={loading || isResetting}
                            onClick={() => void resetMeal(slot, view)}
                          >
                            <RefreshCw className={`h-[22px] w-[22px] ${isResetting ? "animate-spin" : ""}`} />
                          </button>
                          <button
                            type="button"
                            className="p-2 rounded-lg transition-colors hover:bg-secondary"
                            aria-label={t("meals.mealNotes", "Meal notes")}
                            onClick={() => setNotesSlot(slot)}
                          >
                            <StickyNote className="h-[22px] w-[22px]" />
                          </button>
                          <button
                            type="button"
                            className="p-2 rounded-lg transition-colors hover:bg-secondary"
                            aria-label={t("meals.copyMeal", "Copy meal")}
                            onClick={() => void copyMeal(slot, view)}
                          >
                            <Copy className="h-[22px] w-[22px]" />
                          </button>
                        </div>
                      </div>

                      {/* Meal totals: consumed / planned, aligned with the food columns below */}
                      <div className="mt-3 flex items-end">
                        <div className="flex-1 min-w-0" />
                        <div className="flex" dir="ltr">
                          {MACRO_COLUMNS.map((column) => (
                            <div key={column.key} className={`${COLUMN_CLASS} ${column.width}`}>
                              <div className="text-[10px] sm:text-xs font-medium tracking-tight whitespace-nowrap tabular-nums">
                                {formatMacro(view.consumed[column.key])}/{formatMacro(view.planned[column.key])}
                                {column.key === "calories" ? t("meals.kcalUnit", "kcal") : column.unit}
                              </div>
                              <div
                                className="mt-1 mx-auto h-[3px] w-8 rounded-full"
                                style={{ backgroundColor: column.color }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2">
                      {view.rows.map((row) => {
                        const values = row.hasLog ? row.consumed : row.planned;

                        return (
                          <div
                            key={row.key}
                            role="button"
                            tabIndex={0}
                            aria-label={t("meals.swapFood", "Swap food")}
                            className={`flex items-center gap-2 px-4 py-3 border-t border-border/40 text-start transition-colors ${
                              isCompleted ? "" : "cursor-pointer hover:bg-secondary/40"
                            } ${row.isDeselected ? "opacity-40" : ""}`}
                            onClick={() => {
                              if (isCompleted) return;
                              setSwapSlot(slot);
                              setSwapMacroType(row.macroType);
                              setSwapRowPlanFoodId(row.planFood.id);
                              setSwapSelectedEntryKey(swapEntryKeyForRow(row));
                              setSwapQuery("");
                              setSwapOpen(true);
                            }}
                            onKeyDown={(e) => {
                              if (isCompleted) return;
                              if (e.key !== "Enter" && e.key !== " ") return;
                              e.preventDefault();
                              setSwapSlot(slot);
                              setSwapMacroType(row.macroType);
                              setSwapRowPlanFoodId(row.planFood.id);
                              setSwapSelectedEntryKey(swapEntryKeyForRow(row));
                              setSwapQuery("");
                              setSwapOpen(true);
                            }}
                            onTouchStart={(e) => {
                              if (isCompleted || e.touches.length !== 1) return;
                              touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                              swipeDeletingRef.current = false;
                            }}
                            onTouchEnd={(e) => {
                              if (isCompleted) return;
                              const start = touchStartRef.current;
                              if (!start || swipeDeletingRef.current) return;
                              if (e.changedTouches.length !== 1) return;

                              const dx = e.changedTouches[0].clientX - start.x;
                              const dy = e.changedTouches[0].clientY - start.y;

                              if (Math.abs(dx) > 70 && Math.abs(dy) < 60) {
                                swipeDeletingRef.current = true;
                                if (row.hasLog) {
                                  void deleteMealLog(slot.meal_slot_id, row.macroType, row.planFood.id);
                                }
                                setDeselectedMealCategoryKeys((prev) => ({ ...prev, [row.deselectionKey]: true }));
                              }

                              touchStartRef.current = null;
                              swipeDeletingRef.current = false;
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div
                                dir="auto"
                                className={`text-[15px] font-semibold leading-snug break-words ${
                                  row.isDeselected ? "line-through" : ""
                                }`}
                              >
                                {row.displayName}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                                {row.quantityLabel}
                              </div>
                            </div>

                            <div className="flex items-center" dir="ltr">
                              {MACRO_COLUMNS.map((column) => (
                                <div
                                  key={column.key}
                                  className={`${COLUMN_CLASS} ${column.width} text-[15px] ${
                                    row.hasLog ? "font-semibold" : "font-normal text-muted-foreground"
                                  }`}
                                >
                                  {formatMacro(values[column.key])}
                                  {column.unit}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {view.customRows.map((row) => (
                        <div
                          key={row.key}
                          className="flex items-center gap-2 px-4 py-3 border-t border-border/40"
                        >
                          <div className="flex-1 min-w-0">
                            <div dir="auto" className="text-[15px] font-semibold leading-snug break-words">
                              {row.displayName}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                              <span className="tabular-nums">{row.quantityLabel}</span>
                              <span>ֲ·</span>
                              <span>{t("meals.custom", "Custom")}</span>
                            </div>
                          </div>

                          <div className="flex items-center" dir="ltr">
                            {MACRO_COLUMNS.map((column) => (
                              <div key={column.key} className={`${COLUMN_CLASS} ${column.width} text-[15px] font-semibold`}>
                                {formatMacro(row.consumed[column.key])}
                                {column.unit}
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            className="p-2 -me-2 rounded-lg text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                            aria-label={t("common.delete", "Delete")}
                            disabled={isCompleted}
                            onClick={() => void deleteMealLog(slot.meal_slot_id, "protein")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between px-4 py-3 border-t border-border/40" dir="ltr">
                      <button
                        type="button"
                        className="text-lg font-medium disabled:opacity-40"
                        style={{ color: MACRO_COLORS.calories }}
                        disabled={loading || isCompleted}
                        onClick={() => openCustomDialogForSlot(slot)}
                      >
                        <Plus className="inline h-5 w-5 align-[-3px]" /> {t("meals.addFood", "Add Food")}
                      </button>

                      <button
                        type="button"
                        className="text-lg font-medium disabled:opacity-60"
                        style={{ color: isCompleted ? "#22C55E" : MACRO_COLORS.calories }}
                        disabled={loading || isCompleted}
                        onClick={async () => {
                          if (mode === "mock") {
                            setCompletedMealSlotIds((prev) => ({ ...prev, [slot.meal_slot_id]: true }));
                          }
                          await applyMealCompletion(slot);
                        }}
                      >
                        {isCompleted ? (
                          <>
                            <Check className="inline h-5 w-5 align-[-3px]" /> {t("meals.completed", "Completed")}
                          </>
                        ) : (
                          t("meals.complete", "Complete")
                        )}
                      </button>
                    </div>

                    <div className="px-4 pb-3">
                      <button
                        type="button"
                        className="text-sm text-muted-foreground inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                        onClick={() => openAskTrainerDialog(slot)}
                        disabled={loading}
                      >
                        <MessageSquare className="h-4 w-4" />
                        {t("meals.askTrainer", "Ask trainer")}
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            !loading && (
              <p className="px-4 py-10 text-center text-muted-foreground">{t("meals.noMeals", "No meals")}</p>
            )
          )}

          <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
            <DialogContent className="sm:max-w-md w-full max-w-md mx-auto rounded-xl overflow-hidden">
              <DialogHeader>
                <DialogTitle>{t("meals.addCustomFood", "Add custom food")}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium" htmlFor="customGramsInput">
                      {t("meals.amountEaten", "Amount eaten (grams)")}
                    </label>
                    <Input
                      id="customGramsInput"
                      inputMode="decimal"
                      value={customGramsInput}
                      onChange={(e) => setCustomGramsInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="customFoodName">
                    {t("meals.foodName", "Food name")}
                  </label>
                  <Input
                    id="customFoodName"
                    value={customFoodName}
                    onChange={(e) => setCustomFoodName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="customCalories">
                      {t("meals.calories", "Calories")}
                    </label>
                    <Input id="customCalories" inputMode="decimal" value={customCalories} onChange={(e) => setCustomCalories(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="customProtein">
                      {t("meals.protein", "Protein")} (g)
                    </label>
                    <Input id="customProtein" inputMode="decimal" value={customProtein} onChange={(e) => setCustomProtein(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="customCarbs">
                      {t("meals.carbs", "Carbs")} (g)
                    </label>
                    <Input id="customCarbs" inputMode="decimal" value={customCarbs} onChange={(e) => setCustomCarbs(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="customFat">
                      {t("meals.fats", "Fats")} (g)
                    </label>
                    <Input id="customFat" inputMode="decimal" value={customFat} onChange={(e) => setCustomFat(e.target.value)} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setCustomDialogOpen(false)} disabled={customSaving}>
                    {t("common.cancel", "Cancel")}
                  </Button>
                    <Button
                      className="gradient-orange text-background flex-1"
                      onClick={submitCustomFood}
                      disabled={customSaving || Boolean(customDialogSlot ? completedMealSlotIds[customDialogSlot.meal_slot_id] : false)}
                    >
                    {customSaving ? t("common.loading", "Loading...") : t("common.submit", "Submit")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={askTrainerOpen} onOpenChange={setAskTrainerOpen}>
            <DialogContent className="sm:max-w-md w-full max-w-md mx-auto rounded-xl overflow-hidden">
              <DialogHeader>
                <DialogTitle>{t("meals.askTrainer", "Ask trainer")}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-md border bg-background/60 p-3">
                  <div className="text-sm text-muted-foreground">{t("meals.linkContext", "Context")}</div>
                  <div className="text-sm font-semibold break-words mt-1">
                    {askTrainerSlot ? askTrainerSlot.name : ""}{" "}
                    <span className="text-muted-foreground font-normal">{macroLabel(t, askTrainerMacroType)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="askTrainerMsg">
                    {t("meals.messageToTrainer", "Message")}
                  </label>
                  <Textarea
                    id="askTrainerMsg"
                    value={askTrainerMessage}
                    onChange={(e) => setAskTrainerMessage(e.target.value)}
                    placeholder={t("meals.typeMessage", "Type your question")}
                  />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setAskTrainerOpen(false)} disabled={askTrainerSaving}>
                    {t("common.cancel", "Cancel")}
                  </Button>
                  <Button className="gradient-orange text-background flex-1" onClick={submitAskTrainer} disabled={askTrainerSaving}>
                    {askTrainerSaving ? t("common.loading", "Loading...") : t("common.submit", "Submit")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={swapOpen}
            onOpenChange={(open) => {
              setSwapOpen(open);
              if (!open) {
                setSwapRowPlanFoodId(null);
                setSwapSelectedEntryKey(null);
              }
            }}
          >
            <DialogContent className="sm:max-w-md w-full max-w-md mx-auto rounded-xl overflow-hidden">
              <DialogHeader>
                <DialogTitle>{t("meals.foodBank", "Food bank")}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-md border bg-background/60 p-3">
                  <div className="text-sm text-muted-foreground">{t("meals.chooseCategory", "Category")}</div>
                  <div className="text-base font-semibold mt-1">{macroLabel(t, swapMacroType)}</div>
                </div>

                {(() => {
                  if (!swapSlot || typeof swapRowPlanFoodId !== "number") return null;
                  const slotCompleted = Boolean(completedMealSlotIds[swapSlot.meal_slot_id]);
                  const rowChoice = findChoiceForPlanFoodRow(
                    dayView?.choices,
                    swapSlot.meal_slot_id,
                    swapRowPlanFoodId
                  );
                  if (!rowChoice) return null;

                  return (
                    <Button
                      variant="destructive"
                      className="w-full"
                      disabled={swapSaving || slotCompleted}
                      onClick={async () => {
                        if (slotCompleted) return;
                        await deleteMealLog(swapSlot.meal_slot_id, swapMacroType, swapRowPlanFoodId);
                        setSwapOpen(false);
                      }}
                    >
                      <Trash2 className="h-4 w-4 me-2" />
                      {t("common.delete", "Delete")}
                    </Button>
                  );
                })()}

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="swapSearch">
                    {t("meals.searchFood", "Search food")}
                  </label>
                  <Input
                    ref={swapSearchInputRef}
                    id="swapSearch"
                    value={swapQuery}
                    onChange={(e) => setSwapQuery(e.target.value)}
                    placeholder={t("meals.searchPlaceholder", "Type to search...")}
                    dir={isRtlHe ? "rtl" : "ltr"}
                  />
                </div>

                <div className="max-h-[45vh] overflow-auto rounded-lg border bg-background/60">
                  {(() => {
                    const category = swapSlot?.categories.find((c) => c.macro_type === swapMacroType) ?? null;
                    const planFoods =
                      category?.recommended_foods?.filter((f): f is V3FoodOption & { id: number } => typeof f.id === "number") ??
                      [];
                    type SwapListEntry = { key: string; source: SwapPickSource; food: V3FoodOption & { id: number } };
                    const planEntries: SwapListEntry[] = planFoods.map((f) => ({
                      key: `p-${f.id}`,
                      source: "plan",
                      food: f,
                    }));
                    const bankEntries: SwapListEntry[] = swapCatalogFoods
                      .filter((f): f is V3FoodOption & { id: number } => typeof f.id === "number")
                      .map((f) => ({ key: `b-${f.id}`, source: "bank", food: f }));
                    const merged = [...planEntries, ...bankEntries].sort((a, b) =>
                      getLocalizedFoodName(a.food).localeCompare(getLocalizedFoodName(b.food), isRtlHe ? "he" : "en", {
                        sensitivity: "base",
                      })
                    );
                    const quantityInstruction = category?.quantity_instruction ?? null;
                    const q = swapQuery.trim().toLowerCase();

                    const filtered = !q
                      ? merged
                      : merged.filter((entry) => {
                          const label =
                            (isRtlHe ? entry.food.name_hebrew ?? entry.food.name : entry.food.name ?? "") ?? "";
                          return label.toLowerCase().includes(q);
                        });

                    if (filtered.length === 0 && !swapCatalogLoading) {
                      return (
                        <div className="p-3 text-sm text-muted-foreground">{t("meals.noResults", "No results")}</div>
                      );
                    }

                    if (filtered.length === 0 && swapCatalogLoading) {
                      return (
                        <div className="p-4 text-sm text-muted-foreground text-center">{t("common.loading")}</div>
                      );
                    }

                    return (
                      <div className="flex flex-col p-1 gap-1">
                        {swapCatalogLoading ? (
                          <div className="px-2 py-1 text-xs text-muted-foreground text-center">
                            {t("meals.loadingMealBank", "Loading full meal bankג€¦")}
                          </div>
                        ) : null}
                        {filtered.map((entry) => {
                          const { food, key, source } = entry;
                          const isSelected = swapSelectedEntryKey === key;
                          const display = computeRecommendedDisplayMacros(food, quantityInstruction);
                          const macroValue =
                            swapMacroType === "protein"
                              ? display.protein
                              : swapMacroType === "carb"
                                ? display.carbs
                                : display.fat;

                          return (
                            <Button
                              key={key}
                              type="button"
                              variant={isSelected ? "default" : "ghost"}
                              className="justify-start rounded-lg px-3 h-auto py-2 w-full"
                              onClick={() => void submitSwapPick(source, food, quantityInstruction)}
                              disabled={swapSaving || Boolean(completedMealSlotIds[swapSlot?.meal_slot_id ?? -1])}
                            >
                              <div className="flex flex-col w-full items-start gap-1">
                                <div className="w-full flex items-center justify-between gap-2">
                                  <span className="truncate">
                                    {source === "bank" ? (
                                      <span className="me-1 text-xs text-muted-foreground font-normal">
                                        {t("meals.bank", "Bank")}
                                      </span>
                                    ) : null}
                                    {getLocalizedFoodName(food)}
                                  </span>
                                  {isSelected ? <Check className="h-4 w-4 shrink-0" /> : null}
                                </div>
                                <div className="text-xs text-muted-foreground w-full">
                                  {t("meals.calories", "Calories")}: {Math.round(display.calories)} ֲ·{" "}
                                  {macroLabel(t, swapMacroType)}: {Math.round(macroValue)}g
                                </div>
                              </div>
                            </Button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                <Button variant="outline" className="w-full" onClick={() => setSwapOpen(false)} disabled={swapSaving}>
                  {t("common.cancel", "Cancel")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={Boolean(notesSlot)} onOpenChange={(open) => !open && setNotesSlot(null)}>
            <DialogContent className="sm:max-w-md w-full max-w-md mx-auto rounded-xl overflow-hidden">
              <DialogHeader>
                <DialogTitle>{t("meals.mealNotes", "Meal notes")}</DialogTitle>
              </DialogHeader>

              {(() => {
                if (!notesSlot) return null;
                const categoryNotes = notesSlot.categories
                  .filter((c) => Boolean(c.notes?.trim()))
                  .map((c) => ({ macroType: c.macro_type, notes: c.notes as string }));
                const hasNotes = Boolean(notesSlot.notes?.trim()) || categoryNotes.length > 0;

                return (
                  <div className="space-y-4">
                    <div className="text-base font-semibold" dir="auto">
                      {notesSlot.name}
                    </div>

                    {hasNotes ? (
                      <div className="space-y-3">
                        {notesSlot.notes?.trim() ? (
                          <p className="text-sm whitespace-pre-wrap" dir="auto">
                            {notesSlot.notes}
                          </p>
                        ) : null}
                        {categoryNotes.map((entry) => (
                          <div key={entry.macroType} className="rounded-md border bg-background/60 p-3">
                            <div className="text-xs text-muted-foreground">{macroLabel(t, entry.macroType)}</div>
                            <p className="text-sm whitespace-pre-wrap mt-1" dir="auto">
                              {entry.notes}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("meals.noNotes", "Your trainer did not add notes to this meal.")}
                      </p>
                    )}

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        const slot = notesSlot;
                        setNotesSlot(null);
                        openAskTrainerDialog(slot);
                      }}
                    >
                      <MessageSquare className="h-4 w-4 me-2" />
                      {t("meals.askTrainer", "Ask trainer")}
                    </Button>
                  </div>
                );
              })()}
            </DialogContent>
          </Dialog>

          <Dialog open={daySummaryOpen} onOpenChange={setDaySummaryOpen}>
            <DialogContent className="sm:max-w-md w-full max-w-md mx-auto rounded-xl overflow-hidden">
              <DialogHeader>
                <DialogTitle>{t("meals.daySummary", "Day summary")}</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="text-sm text-muted-foreground" dir="auto">
                  {formatDayLabel(selectedDate, isRtlHe)}
                </div>

                <div className="max-h-[50vh] overflow-auto divide-y divide-border/60">
                  {mealViews.map(({ slot, view }) => (
                    <div key={slot.meal_slot_id} className="py-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0 text-sm font-medium truncate" dir="auto">
                        {slot.name}
                      </div>
                      <div className="flex items-center" dir="ltr">
                        {MACRO_COLUMNS.map((column) => (
                          <div
                            key={column.key}
                            className={`${COLUMN_CLASS} ${column.width} text-xs font-semibold`}
                            style={{ color: column.color }}
                          >
                            {formatMacro(view.consumed[column.key])}
                            {column.unit}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {totals ? (
                  <div className="rounded-md border bg-background/60 p-3 flex items-center gap-2">
                    <div className="flex-1 text-sm font-semibold">{t("meals.dailyTargets", "Daily totals")}</div>
                    <div className="flex items-center" dir="ltr">
                      {MACRO_COLUMNS.map((column) => (
                        <div
                          key={column.key}
                          className={`${COLUMN_CLASS} ${column.width} text-xs font-semibold`}
                          style={{ color: column.color }}
                        >
                          {formatMacro(totals.consumed[column.key])}
                          {column.unit}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <Button variant="outline" className="w-full" onClick={() => setDaySummaryOpen(false)}>
                  {t("common.close", "Close")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Meal variants UI removed: trainee can swap any food already via the existing meal-slot swap dialog. */}
        </div>
      </div>
  );

  if (embedded) return inner;

  return <Layout currentPage="meals">{inner}</Layout>;
};

/** Dev/sandbox route: same UI as production meals; use `?mock=1` only if you need the isolated mock API. */
const SandboxMealsV3: React.FC = () => {
  const [params] = useSearchParams();
  const mock = params.get("mock") === "1" || params.get("mock") === "true";
  return <MealMenuV3 mode={mock ? "mock" : "real"} />;
};

export default SandboxMealsV3;

