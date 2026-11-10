import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { API_BASE_URL } from "../../config/api";
import { useToast } from "../../hooks/use-toast";
import type { V3ParsedMenuPdfResponse, V3ParsedSlot, V3ParsedVariant } from "../../types/meals-v3";
import { nextKey, type DraftFood, type DraftVariant, type PlanSlot } from "../../pages/ClientMenuBuilderPage";

type ImportStep = "upload" | "reviewing" | "error";

interface MenuPdfImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: number;
  planId: number | null;
  planSlots: PlanSlot[];
  onImport: (result: { slotId: number; variants: DraftVariant[] }[]) => void;
  /** Called after this dialog creates a plan and/or new slot(s), so the parent page
   * can refetch planId/slots - they didn't exist (or were incomplete) when the page
   * first loaded. */
  onPlanChanged: () => void;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("access_token")}`,
});

const optionKey = (slotRawName: string, optionIndex: number) => `${slotRawName}__${optionIndex}`;

export default function MenuPdfImportDialog({
  open,
  onOpenChange,
  clientId,
  planId,
  planSlots,
  onImport,
  onPlanChanged,
}: MenuPdfImportDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [uploading, setUploading] = useState(false);
  const [parsed, setParsed] = useState<V3ParsedMenuPdfResponse | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploadInlineError, setUploadInlineError] = useState<string | null>(null);

  // Trainer decisions made during review, keyed per-option / per-slot.
  const [slotAssignment, setSlotAssignment] = useState<Record<string, number | null>>({});
  const [optionNameEdits, setOptionNameEdits] = useState<Record<string, string>>({});
  // For sections with no matched slot but a proposed_target - default on, trainer can
  // uncheck to skip importing that meal's options this time instead.
  const [createSlotFor, setCreateSlotFor] = useState<Record<string, boolean>>({});
  const [ensuring, setEnsuring] = useState(false);

  const resetState = () => {
    setStep("upload");
    setUploading(false);
    setParsed(null);
    setParseError(null);
    setUploadInlineError(null);
    setSlotAssignment({});
    setOptionNameEdits({});
    setCreateSlotFor({});
    setEnsuring(false);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file name later
    if (!file) return;

    setUploadInlineError(null);

    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      setUploadInlineError(t("meals.menuBuilder.pdfOnly", "Only PDF files up to 15MB are supported."));
      return;
    }
    const MAX_BYTES = 15 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setUploadInlineError(t("meals.menuBuilder.pdfTooLarge", "This file is too large (max 15MB)."));
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE_URL}/v3/meals/variants/parse-pdf?client_id=${clientId}`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });

      if (res.status === 422) {
        const body = await res.json().catch(() => null);
        setParseError(body?.detail || t("meals.menuBuilder.pdfUnreadable", "Could not read this PDF."));
        setStep("error");
        return;
      }
      if (res.status === 400) {
        const body = await res.json().catch(() => null);
        setUploadInlineError(body?.detail || t("meals.menuBuilder.pdfUploadFailed", "Could not upload this file."));
        return;
      }
      if (!res.ok) {
        setParseError(t("meals.menuBuilder.pdfUploadFailed", "Could not upload this file."));
        setStep("error");
        return;
      }

      const data: V3ParsedMenuPdfResponse = await res.json();
      const hasAnyOptions = data.slots.some((s) => s.variants.length > 0);
      if (!hasAnyOptions) {
        setParseError(
          t(
            "meals.menuBuilder.pdfNoOptions",
            "No meal options could be found in this PDF. You can still add options manually below."
          )
        );
        setStep("error");
        return;
      }

      // Pre-select matched slots where the parser found one.
      const initialAssignment: Record<string, number | null> = {};
      const initialCreateSlot: Record<string, boolean> = {};
      for (const s of data.slots) {
        initialAssignment[s.raw_meal_name] = s.matched_meal_slot_id;
        if (s.matched_meal_slot_id == null && s.proposed_target) {
          initialCreateSlot[s.raw_meal_name] = true;
        }
      }
      setSlotAssignment(initialAssignment);
      setCreateSlotFor(initialCreateSlot);
      setParsed(data);
      setStep("reviewing");
    } catch {
      setUploadInlineError(t("meals.menuBuilder.pdfUploadFailed", "Could not upload this file."));
    } finally {
      setUploading(false);
    }
  };

  const toDraftVariant = (pv: V3ParsedVariant, slotRawName: string): DraftVariant => {
    const macroFood: DraftFood = {
      key: nextKey(),
      name: "Imported from PDF",
      name_hebrew: "מיובא מה-PDF (לעדכן)",
      measurement_type: "per_100g",
      quantity_amount: 100,
      quantity_label: "",
      calories: pv.resolved_calories ?? 0,
      protein: pv.resolved_protein ?? 0,
      carbs: pv.resolved_carbs ?? 0,
      fat: pv.resolved_fat ?? 0,
    };
    const nameKey = optionKey(slotRawName, pv.option_index);
    return {
      key: nextKey(),
      name_hebrew: optionNameEdits[nameKey] ?? pv.name_hebrew ?? `אפשרות ${pv.option_index}`,
      foods: [macroFood],
    };
  };

  // Plan slot ids already picked by OTHER PDF sections in this review session. Two
  // different meals (e.g. Lunch and Dinner) must never both be allowed to target the
  // same plan slot - that's what silently overwrote one meal with another's options.
  const claimedSlotIdsExcluding = (excludeRawName: string): Set<number> => {
    const claimed = new Set<number>();
    for (const [rawName, slotId] of Object.entries(slotAssignment)) {
      if (rawName !== excludeRawName && slotId != null) claimed.add(slotId);
    }
    return claimed;
  };

  const availableSlotsFor = (slot: V3ParsedSlot): PlanSlot[] => {
    const claimed = claimedSlotIdsExcluding(slot.raw_meal_name);
    return planSlots.filter((ps) => !claimed.has(ps.id));
  };

  // True when this section will create its own brand new slot - it can never collide
  // with another section's choice since every proposed slot is new and 1:1 with its
  // own PDF section.
  const willCreateSlot = (slot: V3ParsedSlot): boolean =>
    slot.matched_meal_slot_id == null && !!slot.proposed_target && !!createSlotFor[slot.raw_meal_name];

  const canConfirmSlot = (slot: V3ParsedSlot): boolean => {
    if (willCreateSlot(slot)) return true;
    const assigned = slotAssignment[slot.raw_meal_name];
    if (assigned == null) return false;
    // Must not be a slot some OTHER section has also claimed - prevents one meal's
    // options silently landing on top of (or alongside) a different meal's.
    return !claimedSlotIdsExcluding(slot.raw_meal_name).has(assigned);
  };

  // Creates every still-missing slot (and the plan itself, if needed) for the given
  // sections in one call, returning a lookup from raw meal name to the real slot id -
  // existing slot assignments are passed through unchanged. Never touches any
  // existing slot. Also returns the plan id, since planId may still be null at the
  // time this is called (the very first import for a brand-new client).
  const ensureSlotsFor = async (
    sectionsToCreate: V3ParsedSlot[]
  ): Promise<{ slotIdsByName: Record<string, number>; planId: number }> => {
    const res = await fetch(`${API_BASE_URL}/v3/meals/plans/ensure`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        daily_targets: !planId && parsed?.daily_targets ? parsed.daily_targets : undefined,
        new_slots: sectionsToCreate.map((s, i) => ({
          raw_name: s.raw_meal_name,
          order_index: i,
          target_calories: s.proposed_target!.target_calories,
          target_protein: s.proposed_target!.target_protein,
          target_carbs: s.proposed_target!.target_carbs,
          target_fat: s.proposed_target!.target_fat,
        })),
      }),
    });
    if (!res.ok) throw new Error("ensure_failed");
    const plan = await res.json();
    const slotIdsByName: Record<string, number> = {};
    for (const s of plan.meal_slots ?? []) {
      if (sectionsToCreate.some((sec) => sec.raw_meal_name === s.name)) {
        slotIdsByName[s.name] = s.id;
      }
    }
    onPlanChanged();
    return { slotIdsByName, planId: plan.id };
  };

  // Writes each section's parsed options straight to the database via the same
  // endpoint the manual-entry form uses - the import is only "done" once this
  // succeeds, not merely once the dialog has them in memory.
  const saveVariants = async (
    targetPlanId: number,
    sections: { slotId: number; slot: V3ParsedSlot }[]
  ) => {
    const res = await fetch(`${API_BASE_URL}/v3/meals/plans/${targetPlanId}/variants/manual`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        slots: sections.map(({ slotId, slot }) => ({
          meal_slot_id: slotId,
          variants: slot.variants.map((v) => {
            const draft = toDraftVariant(v, slot.raw_meal_name);
            return {
              name_hebrew: draft.name_hebrew,
              foods: draft.foods.map(({ key, ...rest }) => rest),
            };
          }),
        })),
      }),
    });
    if (!res.ok) throw new Error("save_failed");
    return res.json();
  };

  const handleConfirmSlot = async (slot: V3ParsedSlot) => {
    let targetSlotId = slotAssignment[slot.raw_meal_name];
    let targetPlanId = planId;
    setEnsuring(true);
    try {
      if (willCreateSlot(slot)) {
        const { slotIdsByName, planId: ensuredPlanId } = await ensureSlotsFor([slot]);
        targetSlotId = slotIdsByName[slot.raw_meal_name] ?? null;
        targetPlanId = ensuredPlanId;
      }
      if (targetSlotId == null || targetPlanId == null) return;
      await saveVariants(targetPlanId, [{ slotId: targetSlotId, slot }]);
      onImport([{ slotId: targetSlotId, variants: slot.variants.map((v) => toDraftVariant(v, slot.raw_meal_name)) }]);
      toast({
        title: t("meals.menuBuilder.importedSlot", "Imported {{count}} option(s)", { count: slot.variants.length }),
      });
    } catch {
      toast({ title: t("meals.menuBuilder.saveError", "Could not save"), variant: "destructive" });
    } finally {
      setEnsuring(false);
    }
  };

  const handleConfirmAll = async () => {
    if (!parsed) return;
    const importable = parsed.slots.filter((s) => s.variants.length > 0 && canConfirmSlot(s));
    if (importable.length === 0) return;

    setEnsuring(true);
    try {
      const toCreate = importable.filter((s) => willCreateSlot(s));
      let targetPlanId = planId;
      const slotIdByRawName: Record<string, number> = {};
      for (const s of importable) {
        if (!willCreateSlot(s)) slotIdByRawName[s.raw_meal_name] = slotAssignment[s.raw_meal_name] as number;
      }

      if (toCreate.length > 0) {
        const { slotIdsByName, planId: ensuredPlanId } = await ensureSlotsFor(toCreate);
        Object.assign(slotIdByRawName, slotIdsByName);
        targetPlanId = ensuredPlanId;
      }
      if (targetPlanId == null) return;

      await saveVariants(
        targetPlanId,
        importable.map((s) => ({ slotId: slotIdByRawName[s.raw_meal_name], slot: s }))
      );

      const result = importable.map((s) => ({
        slotId: slotIdByRawName[s.raw_meal_name],
        variants: s.variants.map((v) => toDraftVariant(v, s.raw_meal_name)),
      }));
      onImport(result);
      toast({ title: t("meals.menuBuilder.imported", "Imported and saved") });
      handleClose();
    } catch {
      toast({ title: t("meals.menuBuilder.saveError", "Could not save"), variant: "destructive" });
    } finally {
      setEnsuring(false);
    }
  };

  const allSlotsReady = parsed?.slots.filter((s) => s.variants.length > 0).every(canConfirmSlot) ?? false;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : handleClose())}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("meals.menuBuilder.importPdf", "Import from PDF")}</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {t(
                "meals.menuBuilder.importPdfHelp",
                "Upload the nutrition-plan PDF you prepared. The calorie/macro numbers for each option will be pre-filled automatically; you'll still need to type in the actual food names, since those can't be read reliably from the PDF."
              )}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full h-24 border-dashed"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <FileUp className="h-5 w-5" />
                  <span>{t("meals.menuBuilder.choosePdf", "Choose a PDF file")}</span>
                </div>
              )}
            </Button>
            {uploadInlineError && (
              <p className="text-sm text-destructive">{uploadInlineError}</p>
            )}
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              <span>{parseError}</span>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {t("common.close", "Close")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "reviewing" && parsed && (
          <div className="space-y-5 py-2">
            {!parsed.has_plan && parsed.daily_targets && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs" dir="ltr">
                {t("meals.menuBuilder.proposedDailyTargets", "This client has no plan yet — proposed daily target")}:{" "}
                {Math.round(parsed.daily_targets.total_calories)} kcal ·{" "}
                {Math.round(parsed.daily_targets.protein_target)}g P ·{" "}
                {Math.round(parsed.daily_targets.carb_target)}g C ·{" "}
                {Math.round(parsed.daily_targets.fat_target)}g F
              </div>
            )}

            {parsed.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
                {parsed.warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}

            {parsed.slots.filter((s) => s.variants.length > 0).map((slot) => {
              const available = availableSlotsFor(slot);
              const noSlotsLeft = available.length === 0;
              const canProposeSlot = slot.matched_meal_slot_id == null && !!slot.proposed_target;
              const creatingThisSlot = canProposeSlot && createSlotFor[slot.raw_meal_name];
              return (
              <div key={slot.raw_meal_name} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-medium">{slot.raw_meal_name}</div>
                  {!canProposeSlot && !noSlotsLeft && (
                    <Select
                      value={slotAssignment[slot.raw_meal_name] != null ? String(slotAssignment[slot.raw_meal_name]) : ""}
                      onValueChange={(v) =>
                        setSlotAssignment((prev) => ({ ...prev, [slot.raw_meal_name]: Number(v) }))
                      }
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder={t("meals.menuBuilder.chooseSlot", "Choose a meal slot…")} />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((ps) => (
                          <SelectItem key={ps.id} value={String(ps.id)}>
                            {ps.name}
                            {slot.candidate_meal_slot_ids.includes(ps.id) &&
                              slot.match_confidence !== "exact" &&
                              ` (${t("meals.menuBuilder.suggested", "suggested")})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {canProposeSlot ? (
                  <label className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={!!createSlotFor[slot.raw_meal_name]}
                      onCheckedChange={(checked) =>
                        setCreateSlotFor((prev) => ({ ...prev, [slot.raw_meal_name]: checked === true }))
                      }
                      className="mt-0.5"
                    />
                    <span dir="ltr">
                      {t("meals.menuBuilder.createSlotFor", "Create a meal slot for {{meal}}", { meal: slot.raw_meal_name })}
                      {" — "}
                      {Math.round(slot.proposed_target!.target_calories)} kcal ·{" "}
                      {Math.round(slot.proposed_target!.target_protein)}g P ·{" "}
                      {Math.round(slot.proposed_target!.target_carbs)}g C ·{" "}
                      {Math.round(slot.proposed_target!.target_fat)}g F
                    </span>
                  </label>
                ) : noSlotsLeft ? (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive mt-0.5" />
                    <span>
                      {t(
                        "meals.menuBuilder.noSlotAvailable",
                        "This client's plan has no meal slot left for {{meal}}. Add a meal slot for it on the planner page first, then re-upload this PDF.",
                        { meal: slot.raw_meal_name }
                      )}
                    </span>
                  </div>
                ) : (
                  slot.match_confidence === "none" && (
                    <p className="text-xs text-muted-foreground">
                      {t("meals.menuBuilder.noSlotMatch", "No matching meal slot found automatically — please choose one above.")}
                    </p>
                  )
                )}

                {canProposeSlot && !creatingThisSlot && (
                  <p className="text-xs text-muted-foreground">
                    {t("meals.menuBuilder.slotCreationSkipped", "Unchecked — this meal's options won't be imported.")}
                  </p>
                )}

                <div className="space-y-3">
                  {slot.variants.map((v) => {
                    const nameKey = optionKey(slot.raw_meal_name, v.option_index);
                    const isUnparseable = v.resolved_calories == null;
                    return (
                      <div key={v.option_index} className="rounded-md border bg-background/50 p-3 space-y-2">
                        <Input
                          value={optionNameEdits[nameKey] ?? v.name_hebrew}
                          onChange={(e) =>
                            setOptionNameEdits((prev) => ({ ...prev, [nameKey]: e.target.value }))
                          }
                          className="font-medium"
                        />

                        {v.raw_ingredient_text && (
                          <div className="rounded border bg-muted/40 p-2 text-xs text-muted-foreground whitespace-pre-wrap" dir="rtl">
                            <div className="font-medium mb-1">
                              {t("meals.menuBuilder.pdfReferenceText", "PDF text (reference only)")}
                            </div>
                            {v.raw_ingredient_text}
                          </div>
                        )}

                        {isUnparseable ? (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-600 text-[11px]">
                            {t("meals.menuBuilder.macrosNotFound", "Macros not found — enter below")}
                          </Badge>
                        ) : (
                          <div className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                            {Math.round(v.resolved_calories!)} kcal ·{" "}
                            {Math.round(v.resolved_protein!)}g P ·{" "}
                            {Math.round(v.resolved_carbs!)}g C ·{" "}
                            {Math.round(v.resolved_fat!)}g F
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={ensuring || !canConfirmSlot(slot)}
                    onClick={() => handleConfirmSlot(slot)}
                  >
                    {ensuring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("meals.menuBuilder.useTheseOptions", "Use these options")}
                  </Button>
                </div>
              </div>
              );
            })}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {t("common.close", "Close")}
              </Button>
              <Button type="button" disabled={ensuring || !allSlotsReady} onClick={handleConfirmAll} className="gradient-orange">
                {ensuring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("meals.menuBuilder.importAll", "Import all into form")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
