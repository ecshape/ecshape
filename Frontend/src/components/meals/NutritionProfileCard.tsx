import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ClipboardList, NotebookPen, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE_URL } from "../../config/api";
import { useToast } from "../../hooks/use-toast";
import type { V3NutritionProfile } from "../../types/meals-v3";

type ProfileField = "food_preferences" | "training_times" | "must_keep_foods" | "extra_foods";

const FIELDS: { key: ProfileField; labelKey: string; fallback: string }[] = [
  { key: "training_times", labelKey: "meals.questionnaire.trainingTimes", fallback: "Training times" },
  { key: "food_preferences", labelKey: "meals.questionnaire.foodPreferences", fallback: "Food preferences" },
  { key: "must_keep_foods", labelKey: "meals.questionnaire.mustKeepFoods", fallback: "Foods they won't give up" },
  { key: "extra_foods", labelKey: "meals.questionnaire.extraFoods", fallback: "Extra foods (not in the list)" },
];

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("access_token")}`,
  "Content-Type": "application/json",
});

const emptyDraft = (): Record<ProfileField, string> => ({
  food_preferences: "",
  training_times: "",
  must_keep_foods: "",
  extra_foods: "",
});

interface NutritionProfileCardProps {
  clientId: number | string;
}

export default function NutritionProfileCard({ clientId }: NutritionProfileCardProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isRtlHe = (i18n.language || "").toLowerCase().startsWith("he");

  const [profile, setProfile] = useState<V3NutritionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE_URL}/v3/meals/questionnaire?client_id=${clientId}`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: V3NutritionProfile | null) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const startEdit = () => {
    const next = emptyDraft();
    for (const { key } of FIELDS) next[key] = profile?.[key] ?? "";
    setDraft(next);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v3/meals/questionnaire?client_id=${clientId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error();
      setProfile(await res.json());
      setEditing(false);
      toast({ title: t("meals.favorites.saved", "Saved") });
    } catch {
      toast({ title: t("meals.favorites.saveError", "Could not save"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const submittedAt = profile?.submitted_at
    ? new Date(profile.submitted_at).toLocaleDateString(isRtlHe ? "he-IL" : "en-GB")
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {t("meals.questionnaire.title", "Nutrition questionnaire")}
          </CardTitle>
          <div className="flex items-center gap-2">
            {profile?.source === "google_form" && submittedAt && (
              <Badge variant="outline">
                {t("meals.questionnaire.fromForm", "From Google Form")} · {submittedAt}
              </Badge>
            )}
            {!editing && !loading && (
              <Button variant="ghost" size="sm" onClick={startEdit}>
                <Pencil className="h-4 w-4 me-1" />
                {profile ? t("common.edit", "Edit") : t("meals.questionnaire.fillIn", "Fill in")}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        ) : editing ? (
          <div className="space-y-3">
            {FIELDS.map(({ key, labelKey, fallback }) => (
              <div key={key} className="space-y-1">
                <label className="text-sm font-medium">{t(labelKey, fallback)}</label>
                <Textarea
                  value={draft[key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  rows={2}
                />
              </div>
            ))}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button onClick={save} disabled={saving}>
                {t("common.save", "Save")}
              </Button>
            </div>
          </div>
        ) : !profile ? (
          <p className="text-sm text-muted-foreground">
            {t("meals.questionnaire.empty", "No questionnaire yet. It will appear here when the client submits the Google Form, or you can fill it in.")}
          </p>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(({ key, labelKey, fallback }) => (
              <div key={key} className="space-y-0.5">
                <dt className="text-xs font-medium text-muted-foreground">{t(labelKey, fallback)}</dt>
                <dd className="text-sm whitespace-pre-wrap">{profile[key] || "—"}</dd>
              </div>
            ))}
          </dl>
        )}

        {profile?.extra_foods && !editing && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="flex-1 min-w-0">
              {t(
                "meals.questionnaire.extraFoodsHint",
                "Keep these extra foods in mind when you build the client's meal options."
              )}
            </span>
            <Button variant="outline" size="sm" onClick={() => navigate("/meal-bank")}>
              {t("meals.questionnaire.openFoodBank", "Food bank")}
            </Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Button variant="outline" onClick={() => navigate(`/client/${clientId}/favorites`)}>
            {t("meals.favorites.button", "Favorites")}
          </Button>
          <Button onClick={() => navigate(`/client/${clientId}/menu-builder`)} className="gradient-orange">
            <NotebookPen className="h-4 w-4 me-2" />
            {t("meals.menuBuilder.button", "Build meal options")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
