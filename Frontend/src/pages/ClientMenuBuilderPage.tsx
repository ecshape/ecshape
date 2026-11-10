import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, FileUp, NotebookPen, Plus, Save, Trash2 } from "lucide-react";
import Layout from "../components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_BASE_URL } from "../config/api";
import { useToast } from "../hooks/use-toast";
import MenuPdfImportDialog from "../components/meals/MenuPdfImportDialog";
import type {
  MeasurementType,
  V3ManualVariantFoodInput,
  V3ManualVariantInput,
} from "../types/meals-v3";

export type PlanSlot = {
  id: number;
  name: string;
  order_index: number;
  target_calories: number | null;
  target_protein: number | null;
  target_carbs: number | null;
  target_fat: number | null;
};

export type DraftFood = V3ManualVariantFoodInput & { key: string };
export type DraftVariant = Omit<V3ManualVariantInput, "foods"> & { key: string; foods: DraftFood[] };

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("access_token")}`,
  "Content-Type": "application/json",
});

let keySeq = 0;
export const nextKey = () => `k${++keySeq}`;

const emptyFood = (): DraftFood => ({
  key: nextKey(),
  name: "",
  name_hebrew: "",
  measurement_type: "per_100g",
  quantity_amount: 100,
  quantity_label: "",
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
});

const emptyVariant = (index: number): DraftVariant => ({
  key: nextKey(),
  name_hebrew: `אפשרות ${index + 1}`,
  foods: [emptyFood()],
});

const sumFoods = (foods: DraftFood[]) =>
  foods.reduce(
    (acc, f) => ({
      calories: acc.calories + (Number(f.calories) || 0),
      protein: acc.protein + (Number(f.protein) || 0),
      carbs: acc.carbs + (Number(f.carbs) || 0),
      fat: acc.fat + (Number(f.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

const ClientMenuBuilderPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null); // slot id currently saving
  const [planId, setPlanId] = useState<number | null>(null);
  const [slots, setSlots] = useState<PlanSlot[]>([]);
  const [draftsBySlot, setDraftsBySlot] = useState<Record<number, DraftVariant[]>>({});
  const [showPdfImport, setShowPdfImport] = useState(false);

  const loadPlan = useCallback(async (cancelledRef?: { cancelled: boolean }) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v3/meals/plans?client_id=${clientId}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      const plans = await res.json();
      const plan = plans?.[0];
      if (cancelledRef?.cancelled) return;
      if (!plan) {
        setSlots([]);
        setPlanId(null);
        return;
      }
      setPlanId(plan.id);
      const planSlots: PlanSlot[] = (plan.meal_slots ?? [])
        .map((s: PlanSlot) => ({
          id: s.id,
          name: s.name,
          order_index: s.order_index,
          target_calories: s.target_calories ?? null,
          target_protein: s.target_protein ?? null,
          target_carbs: s.target_carbs ?? null,
          target_fat: s.target_fat ?? null,
        }))
        .sort((a: PlanSlot, b: PlanSlot) => a.order_index - b.order_index);
      setSlots(planSlots);

      const variantsRes = await fetch(`${API_BASE_URL}/v3/meals/variants?client_id=${clientId}`, {
        headers: authHeaders(),
      });
      const existingVariants = variantsRes.ok ? await variantsRes.json() : [];
      const bySlot: Record<number, DraftVariant[]> = {};
      for (const slot of planSlots) {
        const forSlot = existingVariants
          .filter((v: { meal_slot_id: number }) => v.meal_slot_id === slot.id)
          .sort((a: { variant_index: number }, b: { variant_index: number }) => a.variant_index - b.variant_index);
        bySlot[slot.id] = forSlot.length
          ? forSlot.map((v: { name_hebrew: string; foods: V3ManualVariantFoodInput[] }) => ({
              key: nextKey(),
              name_hebrew: v.name_hebrew,
              foods: v.foods.map((f) => ({ ...f, key: nextKey() })),
            }))
          : [emptyVariant(0)];
      }
      if (!cancelledRef?.cancelled) setDraftsBySlot(bySlot);
    } catch {
      if (!cancelledRef?.cancelled) {
        toast({ title: t("meals.menuBuilder.loadError", "Could not load the meal plan"), variant: "destructive" });
      }
    } finally {
      if (!cancelledRef?.cancelled) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    const cancelledRef = { cancelled: false };
    loadPlan(cancelledRef);
    return () => {
      cancelledRef.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const updateVariants = useCallback((slotId: number, updater: (prev: DraftVariant[]) => DraftVariant[]) => {
    setDraftsBySlot((prev) => ({ ...prev, [slotId]: updater(prev[slotId] ?? []) }));
  }, []);

  const handlePdfImport = useCallback((imported: { slotId: number; variants: DraftVariant[] }[]) => {
    setDraftsBySlot((prev) => {
      const next = { ...prev };
      for (const { slotId, variants } of imported) {
        // Append after whatever's already there - imported options never silently
        // replace existing drafts. The trainer can delete placeholders they don't want
        // with the same Trash2 control already in the form.
        next[slotId] = [...(prev[slotId] ?? []), ...variants];
      }
      return next;
    });
  }, []);

  const addOption = (slotId: number) =>
    updateVariants(slotId, (prev) => [...prev, emptyVariant(prev.length)]);

  const removeOption = (slotId: number, variantKey: string) =>
    updateVariants(slotId, (prev) => prev.filter((v) => v.key !== variantKey));

  const updateOptionName = (slotId: number, variantKey: string, name_hebrew: string) =>
    updateVariants(slotId, (prev) =>
      prev.map((v) => (v.key === variantKey ? { ...v, name_hebrew } : v))
    );

  const addFood = (slotId: number, variantKey: string) =>
    updateVariants(slotId, (prev) =>
      prev.map((v) => (v.key === variantKey ? { ...v, foods: [...v.foods, emptyFood()] } : v))
    );

  const removeFood = (slotId: number, variantKey: string, foodKey: string) =>
    updateVariants(slotId, (prev) =>
      prev.map((v) =>
        v.key === variantKey ? { ...v, foods: v.foods.filter((f) => f.key !== foodKey) } : v
      )
    );

  const updateFood = (
    slotId: number,
    variantKey: string,
    foodKey: string,
    field: keyof DraftFood,
    value: string | number
  ) =>
    updateVariants(slotId, (prev) =>
      prev.map((v) =>
        v.key === variantKey
          ? {
              ...v,
              foods: v.foods.map((f) => (f.key === foodKey ? { ...f, [field]: value } : f)),
            }
          : v
      )
    );

  const saveSlot = async (slot: PlanSlot) => {
    if (!planId) return;
    const variants = draftsBySlot[slot.id] ?? [];
    const cleanVariants = variants
      .map((v) => ({
        name_hebrew: v.name_hebrew.trim(),
        foods: v.foods
          .filter((f) => f.name_hebrew.trim())
          .map(({ key, ...rest }) => rest),
      }))
      .filter((v) => v.name_hebrew && v.foods.length > 0);

    if (cleanVariants.length === 0) {
      toast({
        title: t("meals.menuBuilder.emptySlot", "Add at least one option with a food before saving"),
        variant: "destructive",
      });
      return;
    }

    setSaving(slot.id);
    try {
      const res = await fetch(`${API_BASE_URL}/v3/meals/plans/${planId}/variants/manual`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          slots: [{ meal_slot_id: slot.id, variants: cleanVariants }],
        }),
      });
      if (!res.ok) throw new Error();
      toast({ title: t("meals.menuBuilder.saved", "Saved") });
    } catch {
      toast({ title: t("meals.menuBuilder.saveError", "Could not save"), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const slotTargetLabel = (slot: PlanSlot) => {
    if (slot.target_calories == null) return null;
    return (
      <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
        {t("meals.menuBuilder.target", "Target")}: {Math.round(slot.target_calories)} kcal
        {slot.target_protein != null && <> · {Math.round(slot.target_protein)}g P</>}
        {slot.target_carbs != null && <> · {Math.round(slot.target_carbs)}g C</>}
        {slot.target_fat != null && <> · {Math.round(slot.target_fat)}g F</>}
      </span>
    );
  };

  const goBack = () => navigate(`/client/${clientId}`);

  return (
    <Layout currentPage="dashboard">
      <div className="max-w-3xl mx-auto px-4 py-4 sm:py-6 pb-24 space-y-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label={t("common.back", "Back")}>
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </Button>
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h1 className="text-xl font-bold flex items-center gap-2">
                <NotebookPen className="h-5 w-5 text-primary" />
                {t("meals.menuBuilder.title", "Build meal options")}
              </h1>
              {clientId && (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowPdfImport(true)}>
                  <FileUp className="h-3.5 w-3.5 me-1" />
                  {t("meals.menuBuilder.importPdf", "Import from PDF")}
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                "meals.menuBuilder.subtitle",
                "Type in the meal options you prepared for this client, meal by meal."
              )}
            </p>
          </div>
        </div>

        {clientId && (
          <MenuPdfImportDialog
            open={showPdfImport}
            onOpenChange={setShowPdfImport}
            clientId={Number(clientId)}
            planId={planId}
            planSlots={slots}
            onImport={handlePdfImport}
            onPlanChanged={() => loadPlan()}
          />
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : !planId ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t("meals.menuBuilder.noPlan", "This client has no active meal plan yet.")}
            </CardContent>
          </Card>
        ) : (
          slots.map((slot) => {
            const variants = draftsBySlot[slot.id] ?? [];
            return (
              <Card key={slot.id}>
                <CardHeader className="pb-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{slot.name}</CardTitle>
                    {slotTargetLabel(slot)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {variants.map((variant) => {
                    const totals = sumFoods(variant.foods);
                    return (
                      <div key={variant.key} className="rounded-lg border p-3 space-y-3">
                        <div className="flex items-center gap-2">
                          <Input
                            value={variant.name_hebrew}
                            onChange={(e) => updateOptionName(slot.id, variant.key, e.target.value)}
                            placeholder={t("meals.menuBuilder.optionName", "Option name")}
                            className="font-medium"
                          />
                          {variants.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeOption(slot.id, variant.key)}
                              aria-label={t("meals.menuBuilder.removeOption", "Remove option")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        <div className="space-y-2">
                          {variant.foods.map((food) => (
                            <div
                              key={food.key}
                              className="grid grid-cols-2 sm:grid-cols-[1fr_auto_1fr_repeat(4,5rem)_auto] gap-2 items-center"
                            >
                              <Input
                                value={food.name_hebrew}
                                onChange={(e) =>
                                  updateFood(slot.id, variant.key, food.key, "name_hebrew", e.target.value)
                                }
                                placeholder={t("meals.menuBuilder.foodName", "Food name")}
                                className="col-span-2 sm:col-span-1"
                              />
                              <Select
                                value={food.measurement_type}
                                onValueChange={(v) =>
                                  updateFood(
                                    slot.id,
                                    variant.key,
                                    food.key,
                                    "measurement_type",
                                    v as MeasurementType
                                  )
                                }
                              >
                                <SelectTrigger className="w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="per_100g">
                                    {t("meals.menuBuilder.per100g", "grams")}
                                  </SelectItem>
                                  <SelectItem value="per_portion">
                                    {t("meals.menuBuilder.perPortion", "portions")}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                value={food.quantity_label}
                                onChange={(e) =>
                                  updateFood(slot.id, variant.key, food.key, "quantity_label", e.target.value)
                                }
                                placeholder={t("meals.menuBuilder.quantityLabel", 'e.g. 135 ג\'')}
                              />
                              <Input
                                type="number"
                                inputMode="decimal"
                                dir="ltr"
                                value={food.calories}
                                onChange={(e) =>
                                  updateFood(
                                    slot.id,
                                    variant.key,
                                    food.key,
                                    "calories",
                                    Number(e.target.value)
                                  )
                                }
                                placeholder="kcal"
                                className="tabular-nums"
                              />
                              <Input
                                type="number"
                                inputMode="decimal"
                                dir="ltr"
                                value={food.protein}
                                onChange={(e) =>
                                  updateFood(slot.id, variant.key, food.key, "protein", Number(e.target.value))
                                }
                                placeholder="P"
                                className="tabular-nums"
                              />
                              <Input
                                type="number"
                                inputMode="decimal"
                                dir="ltr"
                                value={food.carbs}
                                onChange={(e) =>
                                  updateFood(slot.id, variant.key, food.key, "carbs", Number(e.target.value))
                                }
                                placeholder="C"
                                className="tabular-nums"
                              />
                              <Input
                                type="number"
                                inputMode="decimal"
                                dir="ltr"
                                value={food.fat}
                                onChange={(e) =>
                                  updateFood(slot.id, variant.key, food.key, "fat", Number(e.target.value))
                                }
                                placeholder="F"
                                className="tabular-nums"
                              />
                              {variant.foods.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeFood(slot.id, variant.key, food.key)}
                                  aria-label={t("meals.menuBuilder.removeFood", "Remove food")}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addFood(slot.id, variant.key)}
                          >
                            <Plus className="h-3.5 w-3.5 me-1" />
                            {t("meals.menuBuilder.addFood", "Add food")}
                          </Button>
                          <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                            {Math.round(totals.calories)} kcal · {Math.round(totals.protein)}g P ·{" "}
                            {Math.round(totals.carbs)}g C · {Math.round(totals.fat)}g F
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-between pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => addOption(slot.id)}>
                      <Plus className="h-3.5 w-3.5 me-1" />
                      {t("meals.menuBuilder.addOption", "Add option")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="gradient-orange"
                      disabled={saving === slot.id}
                      onClick={() => saveSlot(slot)}
                    >
                      <Save className="h-3.5 w-3.5 me-1" />
                      {saving === slot.id
                        ? t("common.saving", "Saving...")
                        : t("meals.menuBuilder.save", "Save")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </Layout>
  );
};

export default ClientMenuBuilderPage;
