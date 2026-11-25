/**
 * Studio -> QA -> "Agent access": one key that lets a coding agent read, comment and close QA tickets without a
 * browser sign-in (tools/qa.py). Only its hash is kept on the server; the key is shown once, right after creating it.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, Copy, KeyRound, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { studioApi } from '@/lib/studioApi';
import { parseDate } from '@/features/trainee/format';
import '@/i18n/automations';

const KEY = ['studio', 'qa-agent-key'] as const;

export const QaAgentKey: React.FC = () => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: KEY, queryFn: studioApi.qaAgentKey, enabled: open });
  const when = (iso?: string | null) => {
    const d = iso ? parseDate(iso) : null;
    return d ? d.toLocaleString(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  };

  const create = async () => {
    setBusy(true);
    try {
      const r = await studioApi.createQaAgentKey();
      setFresh(r.key);
      qc.setQueryData(KEY, r);
    } finally { setBusy(false); }
  };
  const revoke = async () => {
    setBusy(true);
    try {
      await studioApi.revokeQaAgentKey();
      setFresh(null);
      qc.setQueryData(KEY, { exists: false });
    } finally { setBusy(false); }
  };
  const copy = async () => {
    if (!fresh) return;
    try { await navigator.clipboard.writeText(fresh); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* select manually */ }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Bot />{t('qaKey.button')}</Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setFresh(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" />{t('qaKey.title')}</DialogTitle>
            <DialogDescription>{t('qaKey.lead')}</DialogDescription>
          </DialogHeader>

          {fresh ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-amber-500">{t('qaKey.once')}</p>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-2">
                <code className="min-w-0 flex-1 select-all break-all text-xs" dir="ltr">{fresh}</code>
                <Button size="sm" variant="ghost" onClick={copy}>{copied ? <Check /> : <Copy />}</Button>
              </div>
              <p className="text-xs text-muted-foreground" dir="ltr">.qa-agent-key → python3 tools/qa.py list</p>
            </div>
          ) : data?.exists ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('qaKey.key')}</dt><dd dir="ltr">ecqa_…{data.last4}</dd>
              <dt className="text-muted-foreground">{t('qaKey.created')}</dt><dd>{when(data.created_at)}</dd>
              <dt className="text-muted-foreground">{t('qaKey.used')}</dt><dd>{when(data.last_used_at)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t('qaKey.none')}</p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {data?.exists && <Button variant="ghost" className="text-destructive" disabled={busy} onClick={revoke}><Trash2 />{t('qaKey.revoke')}</Button>}
            <Button disabled={busy} onClick={create}>{data?.exists ? <><RotateCcw />{t('qaKey.rotate')}</> : <><KeyRound />{t('qaKey.create')}</>}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default QaAgentKey;
