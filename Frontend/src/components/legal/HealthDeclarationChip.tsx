import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HeartPulse } from 'lucide-react';
import { api } from '@/features/trainee/api';
import { Sheet } from '@/features/trainee/ui';
import { cn } from '@/lib/utils';
import { consentCopy, HEALTH_QUESTIONS } from '@/legal/consentText';

interface Decl { declared: boolean; at?: string | null; answers?: Record<string, boolean>; notes?: string | null; needs_medical_clearance?: boolean }

/** Legal audit 2026-11: the coach sees the trainee's health declaration (and when a doctor's approval is needed). */
const HealthDeclarationChip: React.FC<{ clientId: number | string }> = ({ clientId }) => {
  const { i18n } = useTranslation();
  const c = consentCopy(i18n.language || 'he');
  const [d, setD] = useState<Decl | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    api<Decl>(`/privacy/clients/${clientId}/health-declaration`).then((x) => alive && setD(x)).catch(() => alive && setD(null));
    return () => { alive = false; };
  }, [clientId]);
  if (!d) return null;
  const label = !d.declared ? c.declNone : d.needs_medical_clearance ? c.declClearance : c.declOk;
  return (
    <>
      <button type="button" onClick={() => d.declared && setOpen(true)} disabled={!d.declared}
        className={cn('tp-chip tp-press', d.needs_medical_clearance && '!bg-amber-500/15 !text-amber-700 dark:!text-amber-300', d.declared && !d.needs_medical_clearance && 'tp-chip--ok')}>
        <HeartPulse className="h-3.5 w-3.5" />{label}
      </button>
      {d.declared && (
        <Sheet open={open} onOpenChange={setOpen} title={c.declTitle}
          description={d.at ? `${c.declAt}${new Date(d.at).toLocaleDateString(i18n.language)}` : undefined}>
          <ol className="space-y-3 pb-4">
            {HEALTH_QUESTIONS.map((q, i) => (
              <li key={q} className="flex items-start justify-between gap-3">
                <span className="leading-snug">{i + 1}. {c.q[q]}</span>
                <b className={cn('flex-none', d.answers?.[q] ? 'text-amber-600 dark:text-amber-300' : 'text-muted-foreground')}>{d.answers?.[q] ? c.yes : c.no}</b>
              </li>
            ))}
          </ol>
          {d.notes && <p className="whitespace-pre-wrap rounded-2xl bg-foreground/[.05] p-3 text-sm">{d.notes}</p>}
          {d.needs_medical_clearance && <p className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-300">{c.clearance}</p>}
        </Sheet>
      )}
    </>
  );
};

export default HealthDeclarationChip;
