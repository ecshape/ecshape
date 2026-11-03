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
import { API_BASE_URL } from "../../config/api";
import { useToast } from "../../hooks/use-toast";
import type { V3ParsedMenuPdfResponse, V3ParsedSlot, V3ParsedVariant } from "../../types/meals-v3";
import { nextKey, type DraftFood, type DraftVariant, type PlanSlot } from "../../pages/ClientMenuBuilderPage";

type ImportStep = "upload" | "reviewing" | "error";

interface MenuPdfImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: number;
  planSlots: PlanSlot[];
  onImport: (result: { slotId: number; variants: DraftVariant[] }[]) => void;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("access_token")}`,
});

const optionKey = (slotRawName: string, optionIndex: number) => `${slotRawName}__${optionIndex}`;

export default function MenuPdfImportDialog({
  open,
  onOpenChange,
  planId,
  planSlots,
  onImport,
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

  const resetState = () => {
    setStep("upload");
    setUploading(false);
    setParsed(null);
    setParseError(null);
    setUploadInlineError(null);
    setSlotAssignment({});
    setOptionNameEdits({});
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
      const res = await fetch(`${API_BASE_URL}/v3/meals/plans/${planId}/variants/parse-pdf`, {
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
      for (const s of data.slots) {
        initialAssignment[s.raw_meal_name] = s.matched_meal_slot_id;
      }
      setSlotAssignment(initialAssignment);
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

  const canConfirmSlot = (slot: V3ParsedSlot): boolean => slotAssignment[slot.raw_meal_name] != null;

  const handleConfirmSlot = (slot: V3ParsedSlot) => {
    const targetSlotId = slotAssignment[slot.raw_meal_name];
    if (targetSlotId == null) return;
    const variants = slot.variants.map((v) => toDraftVariant(v, slot.raw_meal_name));
    onImport([{ slotId: targetSlotId, variants }]);
    toast({
      title: t("meals.menuBuilder.importedSlot", "Imported {{count}} option(s)", { count: variants.length }),
    });
  };

  const handleConfirmAll = () => {
    if (!parsed) return;
    const importable = parsed.slots.filter((s) => s.variants.length > 0 && canConfirmSlot(s));
    if (importable.length === 0) return;
    const result = importable.map((s) => ({
      slotId: slotAssignment[s.raw_meal_name] as number,
      variants: s.variants.map((v) => toDraftVariant(v, s.raw_meal_name)),
    }));
    onImport(result);
    toast({ title: t("meals.menuBuilder.imported", "Imported into the form below") });
    handleClose();
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
            {parsed.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
                {parsed.warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}

            {parsed.slots.filter((s) => s.variants.length > 0).map((slot) => (
              <div key={slot.raw_meal_name} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-medium">{slot.raw_meal_name}</div>
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
                      {planSlots.map((ps) => (
                        <SelectItem key={ps.id} value={String(ps.id)}>
                          {ps.name}
                          {slot.candidate_meal_slot_ids.includes(ps.id) &&
                            slot.match_confidence !== "exact" &&
                            ` (${t("meals.menuBuilder.suggested", "suggested")})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {slot.match_confidence === "none" && (
                  <p className="text-xs text-muted-foreground">
                    {t("meals.menuBuilder.noSlotMatch", "No matching meal slot found automatically — please choose one above.")}
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
                    disabled={!canConfirmSlot(slot)}
                    onClick={() => handleConfirmSlot(slot)}
                  >
                    {t("meals.menuBuilder.useTheseOptions", "Use these options")}
                  </Button>
                </div>
              </div>
            ))}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {t("common.close", "Close")}
              </Button>
              <Button type="button" disabled={!allSlotsReady} onClick={handleConfirmAll} className="gradient-orange">
                {t("meals.menuBuilder.importAll", "Import all into form")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
