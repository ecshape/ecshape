import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, Ruler, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { useProgress } from '../hooks';
import type { ProgressEntry } from '../types';
import { EmptyState, ErrorState, Screen, Skel } from '../ui';
import WeighInSheet, { MEASURES } from '../WeighInSheet';
import { fmtDate, fmtNum, fmtSigned, parseDate } from '../format';
import { ProgressNav, useTT } from './shared';

type Metric = 'weight' | (typeof MEASURES)[number];
const METRICS: Metric[] = ['weight', ...MEASURES];

/** Measures: body weight and tape measurements over time, one metric at a time (SmartGym "Measures"). */
const MeasuresScreen: React.FC = () => {
  const { t, tt } = useTT();
  const progress = useProgress();
  const [metric, setMetric] = useState<Metric>('weight');
  const [adding, setAdding] = useState(false);
  const entries = useMemo(() => progress.data ?? [], [progress.data]);

  const series = (m: Metric) =>
    entries
      .filter((e) => typeof e[m as keyof ProgressEntry] === 'number' && (e[m as keyof ProgressEntry] as number) > 0 && e.id >= 0)
      .map((e) => ({ id: e.id, t: parseDate(e.date)?.getTime() ?? 0, v: e[m as keyof ProgressEntry] as number, date: e.date }));

  const label = (m: Metric) => (m === 'weight' ? t('trainee.progress.weight') : t(`trainee.progress.m_${m}`));
  const unit = (m: Metric) => (m === 'weight' ? t('trainee.common.kg') : t('trainee.common.cm'));
  const rows = series(metric);
  const last = rows[rows.length - 1];
  const first = rows[0];
  const lastWeight = series('weight').slice(-1)[0]?.v;

  const addBtn = (
    <button type="button" onClick={() => setAdding(true)} className="tp-btn tp-btn--primary tp-press max-sm:!h-12 max-sm:!w-12 max-sm:!min-h-0 max-sm:!rounded-full max-sm:!p-0" aria-label={tt('measures.add')}>
      <Plus className="h-5 w-5" /><span className="max-sm:sr-only">{tt('measures.add')}</span>
    </button>
  );

  return (
    <Screen>
      <header className="mb-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="tp-label tp-rise">{t('trainee.progress.eyebrow')}</p>
            <h1 className="tp-title tp-rise mt-2 text-[2.9rem] sm:text-6xl" style={{ ['--i' as string]: 1 }}>{tt('measures.title')}</h1>
          </div>
          <div className="tp-rise" style={{ ['--i' as string]: 2 }}>{addBtn}</div>
        </div>
        <ProgressNav className="tp-rise mt-4 max-w-md" />
      </header>

      {progress.isLoading ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skel key={i} className="h-24" />)}</div>
          <Skel className="mt-4 h-72" />
        </>
      ) : progress.isError ? (
        <ErrorState onRetry={() => progress.refetch()} />
      ) : !entries.length ? (
        <EmptyState icon={Ruler} title={tt('measures.emptyTitle')} body={tt('measures.emptyBody')} action={addBtn} />
      ) : (
        <>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            {tt('measures.pick')}
            <InfoTip label={tt('measures.pick')}>{tt('measures.pickHelp')}</InfoTip>
          </div>
          <div className="grid grid-cols-2 gap-2.5 min-[480px]:grid-cols-3 lg:grid-cols-4">
            {METRICS.filter((m) => m === 'weight' || series(m).length > 0).map((m, i) => {
              const s = series(m);
              const v = s[s.length - 1]?.v;
              const d = s.length > 1 ? s[s.length - 1].v - s[0].v : null;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  aria-pressed={metric === m}
                  className={cn('tp-card tp-press tp-rise p-3 text-start', metric === m && 'ring-2 ring-primary')}
                  style={{ ['--i' as string]: 2 + i }}
                >
                  <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{label(m)}</span>
                    {m === 'weight' ? <Scale className="h-3.5 w-3.5 flex-none" /> : <Ruler className="h-3.5 w-3.5 flex-none" />}
                  </span>
                  <span className="mt-1.5 flex items-baseline gap-1">
                    <span className="tp-num text-2xl leading-none">{v !== undefined ? fmtNum(v, 1) : '-'}</span>
                    {v !== undefined && <span className="text-[11px] text-muted-foreground">{unit(m)}</span>}
                  </span>
                  {d !== null && d !== 0 && <span className={cn('mt-1 block text-[11px] font-semibold', d < 0 ? 'text-[hsl(var(--tp-ok))]' : 'text-primary')}><bdi dir="ltr">{fmtSigned(d)}</bdi></span>}
                </button>
              );
            })}
          </div>

          <section className="tp-card tp-card--hero mt-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="tp-label">{label(metric)}</p>
                {last ? (
                  <p className="mt-1 flex items-baseline gap-1.5">
                    <span className="tp-num text-5xl leading-none">{fmtNum(last.v, 1)}</span>
                    <span className="text-sm text-muted-foreground">{unit(metric)}</span>
                  </p>
                ) : <p className="mt-1 text-sm text-muted-foreground">{tt('measures.noneYet')}</p>}
              </div>
              {first && last && rows.length > 1 && (
                <p className="text-sm text-muted-foreground">
                  <span className={cn('me-1.5 font-bold', last.v - first.v <= 0 ? 'text-[hsl(var(--tp-ok))]' : 'text-primary')}><bdi dir="ltr">{fmtSigned(last.v - first.v)}</bdi> {unit(metric)}</span>
                  {t('trainee.progress.since', { date: fmtDate(first.date, { day: 'numeric', month: 'short', year: 'numeric' }) })}
                </p>
              )}
            </div>
            <div className="-mx-2 mt-4 h-56 sm:h-64" dir="ltr">
              {rows.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="trMeasure" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#F59532" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#D8361E" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="hsl(var(--foreground) / .07)" />
                    <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmtDate(new Date(v))} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
                    <YAxis domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={(v) => fmtNum(v)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip
                      cursor={{ stroke: 'hsl(var(--primary) / .4)' }}
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 14, color: 'hsl(var(--foreground))' }}
                      labelFormatter={(v) => fmtDate(new Date(Number(v)), { day: 'numeric', month: 'long', year: 'numeric' })}
                      formatter={(v) => [`${fmtNum(Number(v), 1)} ${unit(metric)}`, label(metric)]}
                    />
                    <Area type="monotone" dataKey="v" stroke="#E8682A" strokeWidth={3} fill="url(#trMeasure)" dot={{ r: 3, fill: '#E8682A', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#F59532', stroke: 'hsl(var(--card))', strokeWidth: 2 }} animationDuration={800} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">{t('trainee.progress.needMore')}</div>
              )}
            </div>
          </section>

          {rows.length > 0 && (
            <>
              <h2 className="tp-title mb-3 mt-8 text-[1.9rem] sm:text-4xl">{tt('measures.log')}</h2>
              <div className="grid grid-cols-2 gap-2.5 min-[480px]:grid-cols-3 lg:grid-cols-5">
                {[...rows].reverse().map((r, i, arr) => {
                  const prev = arr[i + 1];
                  const d = prev ? r.v - prev.v : null;
                  return (
                    <div key={r.id} className="rounded-2xl bg-foreground/[.05] p-3">
                      <p className="text-[11px] text-muted-foreground">{fmtDate(r.date, { day: 'numeric', month: 'short', year: '2-digit' })}</p>
                      <p className="mt-1 flex items-baseline gap-1">
                        <span className="tp-num text-xl leading-none">{fmtNum(r.v, 1)}</span>
                        <span className="text-[10px] text-muted-foreground">{unit(metric)}</span>
                      </p>
                      {d !== null && d !== 0 && <p className={cn('mt-0.5 text-[11px] font-semibold', d < 0 ? 'text-[hsl(var(--tp-ok))]' : 'text-primary')}><bdi dir="ltr">{fmtSigned(d)}</bdi></p>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      <WeighInSheet open={adding} onOpenChange={setAdding} lastWeight={lastWeight} />
    </Screen>
  );
};

export default MeasuresScreen;
