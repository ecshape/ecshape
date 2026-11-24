import React, { useId, useRef, useState } from 'react';
import '@/i18n/ticketsQa3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Droplets, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { api } from './api';
import { fmtNum, todayISO } from './format';

/** QA #135: water tracker on the Today screen. Every tap on + adds half a litre and the bottle fills up. */
type Water = { day: string; ml: number; goal_ml: number; step_ml: number };

const waterKey = (day: string) => ['trainee', 'water', day] as const;

const litres = (ml: number) => fmtNum(Math.round(ml / 100) / 10, 1);

const WaterCard: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const day = todayISO();
  const key = waterKey(day);
  const q = useQuery({ queryKey: key, queryFn: () => api<Water>(`/check-ins/water?day=${day}`) });
  const pending = useRef(0);
  const [splash, setSplash] = useState(0);
  const clip = useId().replace(/:/g, '');

  const step = q.data?.step_ml ?? 500;
  const goal = q.data?.goal_ml ?? 3000;
  const ml = q.data?.ml ?? 0;
  const pct = Math.min(1, goal ? ml / goal : 0);
  const reached = ml >= goal;

  const change = (delta: number) => {
    if (delta < 0 && ml <= 0) return;
    if (delta > 0) setSplash((n) => n + 1);
    if (delta > 0 && ml < goal && ml + delta >= goal) toast.success(t('qa7.water.done'));
    // optimistic: the bottle fills at once; each tap is sent as +/- step (additive on the server), undone only if refused
    const bump = (d: number) => qc.setQueryData<Water>(key, (prev) => ({ day, goal_ml: goal, step_ml: step, ...prev, ml: Math.max(0, Math.min(10000, (prev?.ml ?? 0) + d)) }));
    void qc.cancelQueries({ queryKey: key });
    bump(delta);
    pending.current += 1;
    api<Water>('/check-ins/water', { method: 'POST', body: { day, delta_ml: delta } })
      .then((server) => { if (pending.current === 1) qc.setQueryData(key, server); })
      .catch(() => { bump(-delta); toast.error(t('qa7.water.saveError')); })
      .finally(() => { pending.current -= 1; });
  };

  // bottle body (viewBox 0 0 64 120): neck at the top, rounded body below
  const bottle = 'M24 4h16v12c0 4 4 6 8 10s6 9 6 14v66c0 6-5 10-11 10H21c-6 0-11-4-11-10V40c0-5 2-10 6-14s8-6 8-10z';
  const top = 26; // the water fills from y=116 up to y=26
  const level = 116 - (116 - top) * pct;

  return (
    <section className={cn('tp-rise lg:col-span-12', className)} style={style} aria-label={t('qa7.water.title')}>
      <div className="tp-card flex items-center gap-4 p-4 sm:gap-6 sm:p-5">
        <svg viewBox="0 0 64 120" className="h-28 w-[60px] flex-none sm:h-32" aria-hidden>
          <defs>
            <clipPath id={`wb${clip}`}><path d={bottle} /></clipPath>
          </defs>
          <path d={bottle} className="fill-foreground/[.06]" />
          <g clipPath={`url(#wb${clip})`}>
            <g className="tp-water" style={{ transform: `translateY(${level}px)` }}>
              <path className="tp-water__wave fill-sky-400/70" d="M-64 0q16-5 32 0t32 0 32 0 32 0 32 0v120h-160z" />
              <rect y="3" width="64" height="120" className="fill-sky-500" />
            </g>
          </g>
          <path d={bottle} fill="none" className="stroke-foreground/25" strokeWidth="2" />
          {splash > 0 && <circle key={splash} cx="32" cy={Math.max(top, level) - 4} r="3" className="tp-water__drop fill-sky-300" />}
        </svg>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="tp-label">{t('qa7.water.title')}</span>
            <Droplets className="h-4 w-4 text-sky-500" />
          </div>
          <p className="mt-2 leading-none" aria-live="polite">
            <bdi dir="ltr" className="tp-num text-[2.4rem]">{litres(ml)}</bdi>
            <span className="ms-1 text-sm text-muted-foreground">/ <bdi dir="ltr">{litres(goal)}</bdi> {t('qa7.water.l')}</span>
          </p>
          <p className={cn('mt-2 text-xs', reached ? 'font-semibold text-sky-500' : 'text-muted-foreground')}>
            {reached ? t('qa7.water.done') : t('qa7.water.left', { left: litres(goal - ml) })}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full bg-sky-500 transition-[width] duration-500 ease-out" style={{ width: `${pct * 100}%` }} />
          </div>
        </div>

        <div className="flex flex-none flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => change(step)}
            className="tp-press grid h-16 w-16 place-items-center rounded-full bg-sky-500 text-white shadow-[0_14px_28px_-12px_rgb(14_165_233/.9)]"
            aria-label={t('qa7.water.add')}
            data-testid="water-add"
          >
            <span className="flex flex-col items-center leading-none">
              <Plus className="h-6 w-6" strokeWidth={2.6} />
              <bdi dir="ltr" className="mt-0.5 text-[11px] font-bold">{litres(step)}{t('qa7.water.l')}</bdi>
            </span>
          </button>
          <button
            type="button"
            onClick={() => change(-step)}
            disabled={ml <= 0}
            className="tp-press grid h-8 w-8 place-items-center rounded-full bg-foreground/[.07] text-muted-foreground disabled:opacity-40"
            aria-label={t('qa7.water.remove')}
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default WaterCard;
