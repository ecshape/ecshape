import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../../config/api";
import { Save } from "lucide-react";
import type { V3MealSlotTargets } from "../../types/meals-v3";

export type MealTargetsSlot = {
  meal_slot_id: number;
  name: string;
  target_calories?: number | null;
  target_protein?: number | null;
  target_carbs?: number | null;
  target_fat?: number | null;
};

export type DailyTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type Props = {
  planId: number | null;
  slots: MealTargetsSlot[];
  initialDaily?: DailyTargets | null;
  /** Lifts editor state up so the planner can include targets in its own publish payload. */
  onChange?: (state: { daily: DailyTargets; perSlot: V3MealSlotTargets[] }) => void;
  /** When false, hides the save button (planner saves targets via its own publish call). */
  showSave?: boolean;
  onSaved?: () => void;
};

const DEFAULT_SPLIT_3 = [25, 40, 35];

function splitFor(count: number): number[] {
  if (count === 3) return [...DEFAULT_SPLIT_3];
  if (count <= 0) return [];
  const even = 100 / count;
  return Array.from({ length: count }, () => even);
}

function toNum(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export default function MealTargetsEditor({
  planId,
  slots,
  initialDaily,
  onChange,
  showSave = true,
  onSaved,
}: Props) {
  const { t } = useTranslation();

  const [daily, setDaily] = useState<DailyTargets>({
    calories: initialDaily?.calories ?? 0,
    protein: initialDaily?.protein ?? 0,
    carbs: initialDaily?.carbs ?? 0,
    fat: initialDaily?.fat ?? 0,
  });

  const [perSlot, setPerSlot] = useState<V3MealSlotTargets[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // `initialDaily` arrives asynchronously (the day view is fetched after mount), so the
  // useState initializer above sees null. Hydrate once when it lands, but never overwrite
  // values the trainer has already typed.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !initialDaily) return;
    hydratedRef.current = true;
    setDaily({
      calories: initialDaily.calories,
      protein: initialDaily.protein,
      carbs: initialDaily.carbs,
      fat: initialDaily.fat,
    });
  }, [initialDaily]);

  // Re-seed only when the set of slots actually changes, not when a slot is renamed —
  // otherwise a keystroke in the meal-name field would discard hand-tuned targets.
  const slotsKey = slots.map((s) => s.meal_slot_id).join(",");

  // Seed per-slot rows from existing targets, falling back to the default split.
  // Keyed on slot identity so a later refresh of daily targets (e.g. after a save)
  // cannot silently discard per-meal numbers the trainer tuned by hand.
  const seededSlotsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (seededSlotsKeyRef.current === slotsKey) return;
    if (slots.length === 0) return;
    // Wait for the day view unless the slots already carry saved targets, otherwise the
    // percentage split would be computed against a daily target of zero.
    const slotsHaveTargets = slots.some((s) => s.target_calories != null);
    if (!initialDaily && !slotsHaveTargets) return;
    seededSlotsKeyRef.current = slotsKey;

    const percentages = splitFor(slots.length);
    setPerSlot(
      slots.map((slot, index) => {
        const hasExisting = slot.target_calories != null;
        if (hasExisting) {
          return {
            meal_slot_id: slot.meal_slot_id,
            target_calories: Math.round(slot.target_calories ?? 0),
            target_protein: slot.target_protein ?? 0,
            target_carbs: slot.target_carbs ?? 0,
            target_fat: slot.target_fat ?? 0,
          };
        }
        const share = (percentages[index] ?? 0) / 100;
        return {
          meal_slot_id: slot.meal_slot_id,
          target_calories: Math.round((initialDaily?.calories ?? 0) * share),
          target_protein: Math.round((initialDaily?.protein ?? 0) * share),
          target_carbs: Math.round((initialDaily?.carbs ?? 0) * share),
          target_fat: Math.round((initialDaily?.fat ?? 0) * share),
        };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsKey, slots.length, initialDaily?.calories, initialDaily?.protein, initialDaily?.carbs, initialDaily?.fat]);

  useEffect(() => {
    onChange?.({ daily, perSlot });
  }, [daily, perSlot, onChange]);

  const drift = useMemo(() => {
    const summed = perSlot.reduce((acc, row) => acc + (row.target_calories || 0), 0);
    return summed - daily.calories;
  }, [perSlot, daily.calories]);

  const recalcFromSplit = useCallback(() => {
    const percentages = splitFor(slots.length);
    setPerSlot(
      slots.map((slot, index) => {
        const share = (percentages[index] ?? 0) / 100;
        return {
          meal_slot_id: slot.meal_slot_id,
          target_calories: Math.round(daily.calories * share),
          target_protein: Math.round(daily.protein * share),
          target_carbs: Math.round(daily.carbs * share),
          target_fat: Math.round(daily.fat * share),
        };
      })
    );
  }, [slots, daily]);

  const updateSlotField = useCallback(
    (index: number, field: keyof V3MealSlotTargets, value: string) => {
      setPerSlot((prev) =>
        prev.map((row, i) => (i === index ? { ...row, [field]: toNum(value) } : row))
      );
    },
    []
  );

  const save = useCallback(async () => {
    if (!planId) return;
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_BASE_URL}/v3/meals/plans/${planId}/targets`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          total_calories: Math.round(daily.calories),
          protein_target: daily.protein,
          carb_target: daily.carbs,
          fat_target: daily.fat,
          meal_targets: perSlot,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `HTTP ${res.status}`);
      }
      setSavedAt(Date.now());
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save targets");
    } finally {
      setSaving(false);
    }
  }, [planId, daily, perSlot, onSaved]);

  const dailyFields: Array<{ key: keyof DailyTargets; label: string }> = [
    { key: "calories", label: t("meals.calories", "Calories") },
    { key: "protein", label: t("meals.protein", "Protein") },
    { key: "carbs", label: t("meals.carbs", "Carbs") },
    { key: "fat", label: t("meals.fats", "Fats") },
  ];

  const slotFields: Array<{ key: keyof V3MealSlotTargets; label: string }> = [
    { key: "target_calories", label: t("meals.calories", "Calories") },
    { key: "target_protein", label: t("meals.protein", "Protein") },
    { key: "target_carbs", label: t("meals.carbs", "Carbs") },
    { key: "target_fat", label: t("meals.fats", "Fats") },
  ];

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {t("meals.targets.title", "Daily targets")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {dailyFields.map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-xs text-muted-foreground">{field.label}</label>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                dir="ltr"
                className="text-end tabular-nums"
                value={daily[field.key]}
                onChange={(e) =>
                  setDaily((prev) => ({ ...prev, [field.key]: toNum(e.target.value) }))
                }
              />
            </div>
          ))}
        </div>

        {slots.length > 0 ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {t("meals.targets.perMeal", "Per meal")}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={recalcFromSplit}>
                {t("meals.targets.recalcFromSplit", "Recalculate from split")}
              </Button>
            </div>

            <div className="space-y-3">
              {slots.map((slot, index) => (
                <div key={slot.meal_slot_id ?? index} className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">{slot.name}</div>
                  <div className="grid grid-cols-4 gap-2">
                    {slotFields.map((field) => (
                      <Input
                        key={field.key}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        dir="ltr"
                        aria-label={`${slot.name} ${field.label}`}
                        className="text-end tabular-nums"
                        value={perSlot[index]?.[field.key] ?? 0}
                        onChange={(e) => updateSlotField(index, field.key, e.target.value)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div
              className={`text-xs tabular-nums ${
                drift === 0 ? "text-muted-foreground" : "text-destructive"
              }`}
              dir="ltr"
            >
              {t("meals.targets.drift", "Drift")}: {drift > 0 ? "+" : ""}
              {Math.round(drift)} kcal
            </div>
          </>
        ) : null}

        {error ? <div className="text-xs text-destructive">{error}</div> : null}

        {showSave ? (
          <Button
            type="button"
            className="w-full gradient-orange text-background"
            onClick={save}
            disabled={saving || !planId}
          >
            <Save className="h-4 w-4 ms-0 me-2" />
            {savedAt && !saving
              ? t("meals.favorites.saved", "Saved")
              : t("meals.targets.save", "Save targets")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
