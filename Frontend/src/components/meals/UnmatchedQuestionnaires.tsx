import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_BASE_URL } from "../../config/api";
import { useToast } from "../../hooks/use-toast";
import type { V3NutritionProfile } from "../../types/meals-v3";

interface ClientOption {
  id: number;
  full_name: string;
  email: string;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("access_token")}`,
  "Content-Type": "application/json",
});

export default function UnmatchedQuestionnaires({ clients }: { clients: ClientOption[] }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [items, setItems] = useState<V3NutritionProfile[]>([]);
  const [selection, setSelection] = useState<Record<number, string>>({});
  const [linkingId, setLinkingId] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v3/meals/questionnaire/unmatched`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  const link = async (profileId: number) => {
    const clientId = selection[profileId];
    if (!clientId) return;
    setLinkingId(profileId);
    try {
      const res = await fetch(`${API_BASE_URL}/v3/meals/questionnaire/${profileId}/link`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ client_id: Number(clientId) }),
      });
      if (res.status === 409) {
        toast({
          title: t("meals.questionnaire.alreadyHasProfile", "This client already has a questionnaire"),
          variant: "destructive",
        });
        return;
      }
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((p) => p.id !== profileId));
      toast({ title: t("meals.questionnaire.linked", "Questionnaire linked") });
    } catch {
      toast({ title: t("meals.favorites.saveError", "Could not save"), variant: "destructive" });
    } finally {
      setLinkingId(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <Card className="mb-8 border-amber-500/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {t("meals.questionnaire.unmatchedTitle", "Questionnaires waiting for a client")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            "meals.questionnaire.unmatchedSubtitle",
            "The email in these form responses doesn't match any client. Choose the right client to link each one."
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border p-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{item.full_name || "—"}</div>
              <div className="text-xs text-muted-foreground truncate" dir="ltr">
                {item.email}
              </div>
            </div>
            <Select
              value={selection[item.id] ?? ""}
              onValueChange={(v) => setSelection((s) => ({ ...s, [item.id]: v }))}
            >
              <SelectTrigger className="sm:w-56">
                <SelectValue placeholder={t("meals.questionnaire.chooseClient", "Choose client")} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => link(item.id)}
              disabled={!selection[item.id] || linkingId === item.id}
            >
              <Link2 className="h-4 w-4 me-1" />
              {t("meals.questionnaire.link", "Link")}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
