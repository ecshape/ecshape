import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Check, CheckCircle2, ClipboardCheck, Clock, Flame, Footprints, Moon, Scale, Sun, Utensils, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/config/api';
import { InfoTip } from '@/components/ui/info-tip';
import { addDays, fmtDate, fmtNum, fmtSigned, isoDay, todayISO } from '@/features/trainee/format';
import { CountUp, EmptyState, Ring, Sheet, Skel } from './ui';
import { TrendChart } from './TrendChart';

export interface CheckInSummaryData {
  today_status: 'completed' | 'pending' | 'none';
  current_streak: number;
  last_7_days_completion: number;
  completion_rate: number;
  avg_weight?: number | null;
  avg_steps?: number | null;
  avg_sleep_hours?: number | null;
  avg_hunger_level?: number | null;
  total_check_ins: number;
  first_check_in?: string | null;
  last_check_in?: string | null;
}

interface CheckIn {
  id: number;
  date: string;
  weight?: number | null;
  steps?: number | null;
  walked_10000_steps?: boolean | null;
  sun_exposure_10min?: boolean | null;
  hunger_level?: number | null;
  sleep_hours?: number | null;
  created_at: string;
}

const dayKey = (s: string) => s.slice(0, 10);
const PAGE = 12;

/** Small labelled tile with an info tip, used for every metric on the tab. */
const Tile: React.FC<{ icon: React.ElementType; label: string; info: string; children: React.ReactNode; aside?: React.ReactNode; accent?: boolean; className?: string }> = ({
  icon: Icon, label, info, children, aside, accent, className,
}) => (
  <div className={cn('tp-card tr-ci-tile', accent && 'tp-card--accent', className)}>
    <div className="flex items-start justify-between gap-2">
      <span className="tr-kpi-ico !h-9 !w-9"><Icon className="h-[18px] w-[18px]" /></span>
      {aside}
    </div>
    <div className="min-w-0">
      <div className="tr-ci-value">{children}</div>
      <p className={cn('mt-1 flex items-center gap-1 text-xs font-semibold', accent ? 'text-white/85' : 'text-muted-foreground')}>
        <span className="truncate">{label}</span>
        <InfoTip>{info}</InfoTip>
      </p>
    </div>
  </div>
);

const YesNo: React.FC<{ value: boolean | null | undefined }> = ({ value }) => {
  const { t } = useTranslation();
  if (value === null || value === undefined) return <span className="tp-chip">{t('checkIn.notAnswered')}</span>;
  return value ? (
    <span className="tp-chip tp-chip--ok"><Check className="h-3.5 w-3.5" />{t('checkIn.yes')}</span>
  ) : (
    <span className="tp-chip"><X className="h-3.5 w-3.5" />{t('checkIn.no')}</span>
  );
};

/**
 * Check-ins tab of the client profile: KPI tiles, weight trend, a 5-week calendar strip and compact history cards.
 * A card opens the full check-in in a sheet.
 */
export const CheckInsPanel: React.FC<{ clientId: number; summary: CheckInSummaryData | null }> = ({ clientId, summary }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<CheckIn | null>(null);
  const [shown, setShown] = useState(PAGE);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['trainer', 'checkins', clientId],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/check-ins?client_id=${clientId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as CheckIn[];
    },
    staleTime: 30_000,
  });

  const sorted = useMemo(() => [...list].sort((a, b) => b.date.localeCompare(a.date)), [list]);
  const byDay = useMemo(() => new Map(sorted.map((c) => [dayKey(c.date), c])), [sorted]);

  const weights = useMemo(
    () => sorted.filter((c) => typeof c.weight === 'number' && c.weight > 0).map((c) => ({ t: new Date(dayKey(c.date)).getTime(), v: c.weight as number })),
    [sorted],
  );
  const weightDelta = weights.length > 1 ? weights[0].v - weights[weights.length - 1].v : null;

  // Last 7 days (oldest first) for the mini bars, last 35 days for the calendar strip.
  const today = todayISO();
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const steps7 = last7.map((d) => byDay.get(d)?.steps ?? 0);
  const sleep7 = last7.map((d) => byDay.get(d)?.sleep_hours ?? 0);
  const weeks = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 34);
    return Array.from({ length: 35 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return isoDay(d);
    });
  }, []);

  const s = summary;
  const status = s?.today_status ?? 'none';

  const MiniBars: React.FC<{ values: number[]; label: string }> = ({ values, label }) => {
    const max = Math.max(1, ...values);
    return (
      <div className="tr-bars w-20 !h-8" dir="ltr" role="img" aria-label={label}>
        {values.map((v, i) => (
          <span key={i} data-on={v > 0 || undefined} data-today={i === values.length - 1 || undefined} style={{ height: `${Math.max(8, (v / max) * 100)}%`, ['--i' as string]: i }} />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* KPI tiles */}
      <section className="tr-ci-grid" aria-label={t('checkIn.trainer.summary')}>
        <Tile
          icon={status === 'completed' ? CheckCircle2 : Clock}
          label={t('checkIn.todayStatus')}
          info={t('tt.ci.info.today')}
          accent={status === 'completed'}
        >
          <span className="text-2xl">{status === 'completed' ? t('checkIn.completed') : status === 'pending' ? t('checkIn.pending') : t('checkIn.none')}</span>
        </Tile>
        <Tile
          icon={Flame}
          label={t('checkIn.streak')}
          info={t('tt.ci.info.streak')}
          aside={
            <div className="flex gap-1" dir="ltr" aria-hidden>
              {last7.map((d) => <span key={d} className={cn('h-2 w-2 rounded-full', byDay.has(d) ? 'bg-primary' : 'bg-foreground/12')} />)}
            </div>
          }
        >
          <CountUp value={s?.current_streak ?? 0} />
          <span className="ms-1 text-sm text-muted-foreground">{t('trainer.client.days')}</span>
        </Tile>
        <Tile
          icon={ClipboardCheck}
          label={t('checkIn.completionRate')}
          info={t('tt.ci.info.rate')}
          aside={<Ring value={(s?.completion_rate ?? 0) / 100} size={44} stroke={5} color="hsl(var(--tr-ok))" />}
        >
          <CountUp value={s?.completion_rate ?? 0} digits={0} />%
        </Tile>
        <Tile icon={CalendarDays} label={t('tt.ci.total')} info={t('tt.ci.info.total')}>
          <CountUp value={s?.total_check_ins ?? 0} />
          {s?.first_check_in && <span className="ms-1.5 text-xs font-sans text-muted-foreground">{t('tt.ci.since', { date: fmtDate(s.first_check_in) })}</span>}
        </Tile>
        <Tile
          icon={Scale}
          label={t('checkIn.avgWeight')}
          info={t('tt.ci.info.weight')}
          aside={weightDelta !== null ? <span className={cn('tp-chip', weightDelta <= 0 ? 'tp-chip--ok' : 'tp-chip--primary')} dir="ltr">{fmtSigned(weightDelta)}</span> : undefined}
        >
          {s?.avg_weight ? <><CountUp value={s.avg_weight} digits={1} /><span className="ms-1 text-sm text-muted-foreground">{t('trainer.common.kg')}</span></> : '–'}
        </Tile>
        <Tile icon={Footprints} label={t('checkIn.avgSteps')} info={t('tt.ci.info.steps')} aside={<MiniBars values={steps7} label={t('tt.ci.last7')} />}>
          {s?.avg_steps ? fmtNum(Math.round(s.avg_steps)) : '–'}
        </Tile>
        <Tile icon={Moon} label={t('checkIn.avgSleep')} info={t('tt.ci.info.sleep')} aside={<MiniBars values={sleep7} label={t('tt.ci.last7')} />}>
          {s?.avg_sleep_hours ? <>{fmtNum(s.avg_sleep_hours, 1)}<span className="ms-0.5 text-sm text-muted-foreground">{t('tt.ci.h')}</span></> : '–'}
        </Tile>
        <Tile
          icon={Utensils}
          label={t('tt.ci.avgHunger')}
          info={t('tt.ci.info.hunger')}
          aside={s?.avg_hunger_level ? <Ring value={s.avg_hunger_level / 10} size={44} stroke={5} /> : undefined}
        >
          {s?.avg_hunger_level ? <>{fmtNum(s.avg_hunger_level, 1)}<span className="text-sm text-muted-foreground">/10</span></> : '–'}
        </Tile>
      </section>

      <div className="tr-grid-2">
        {/* Weight trend */}
        <section className="tp-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold">{t('tt.ci.weightTrend')}<InfoTip>{t('tt.ci.info.trend')}</InfoTip></h3>
            {weights[0] && <span className="tp-num text-xl">{fmtNum(weights[0].v, 1)} <span className="text-xs text-muted-foreground">{t('trainer.common.kg')}</span></span>}
          </div>
          {isLoading ? <Skel className="h-[150px]" /> : weights.length > 1 ? (
            <TrendChart points={weights} unit={t('trainer.common.kg')} height={150} label={t('tt.ci.weightTrend')} />
          ) : (
            <p className="grid h-[150px] place-items-center text-sm text-muted-foreground">{t('tt.ci.noWeights')}</p>
          )}
        </section>

        {/* 5-week calendar */}
        <section className="tp-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold">{t('tt.ci.calendar')}<InfoTip>{t('tt.ci.info.calendar')}</InfoTip></h3>
            <span className="text-xs text-muted-foreground">{t('tt.ci.last35', { count: weeks.filter((d) => byDay.has(d)).length })}</span>
          </div>
          <div className="tr-ci-cal" dir="ltr">
            {weeks.map((d) => {
              const c = byDay.get(d);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!c}
                  onClick={() => c && setOpen(c)}
                  className="tr-ci-day"
                  data-on={!!c || undefined}
                  data-today={d === today || undefined}
                  aria-label={`${fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}${c ? '' : ` · ${t('checkIn.noCheckIn')}`}`}
                  title={fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}
                >
                  {Number(d.slice(8, 10))}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* History */}
      <section>
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold">{t('checkIn.trainer.history')}<InfoTip>{t('tt.ci.info.history')}</InfoTip></h3>
        {isLoading ? (
          <div className="tr-ci-list">{Array.from({ length: 6 }).map((_, i) => <Skel key={i} className="h-24" />)}</div>
        ) : sorted.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={t('checkIn.noCheckIns')} body={t('tt.ci.emptyBody')} />
        ) : (
          <>
            <div className="tr-ci-list">
              {sorted.slice(0, shown).map((c) => (
                <button key={c.id} type="button" className="tp-card tr-ci-card tr-lift text-start" onClick={() => setOpen(c)}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-bold">{fmtDate(dayKey(c.date), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <CheckCircle2 className="h-4 w-4 flex-none text-[hsl(var(--tr-ok))]" aria-hidden />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                    <span className="tr-ci-mini"><Scale className="h-3.5 w-3.5" /><b>{c.weight ? fmtNum(c.weight, 1) : '–'}</b></span>
                    <span className="tr-ci-mini"><Footprints className="h-3.5 w-3.5" /><b>{c.steps ? fmtNum(c.steps) : '–'}</b></span>
                    <span className="tr-ci-mini"><Moon className="h-3.5 w-3.5" /><b>{c.sleep_hours ?? '–'}</b></span>
                  </div>
                </button>
              ))}
            </div>
            {sorted.length > shown && (
              <div className="mt-4 flex justify-center">
                <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press" onClick={() => setShown((n) => n + PAGE)}>
                  {t('tt.common.showMore', { count: sorted.length - shown })}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <Sheet
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? fmtDate(dayKey(open.date), { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
        description={open ? `${t('checkIn.submittedAt')}: ${fmtDate(open.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : undefined}
      >
        {open && (
          <div className="space-y-4 pb-2">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="tr-stat"><p className="tp-label flex items-center gap-1"><Scale className="h-3.5 w-3.5" />{t('checkIn.weight')}</p><p className="tr-stat-v mt-1">{open.weight ? <>{fmtNum(open.weight, 1)} <span className="text-sm text-muted-foreground">{t('trainer.common.kg')}</span></> : '–'}</p></div>
              <div className="tr-stat"><p className="tp-label flex items-center gap-1"><Footprints className="h-3.5 w-3.5" />{t('checkIn.steps')}</p><p className="tr-stat-v mt-1">{open.steps ? fmtNum(open.steps) : '–'}</p></div>
              <div className="tr-stat flex items-center justify-between gap-2">
                <div><p className="tp-label flex items-center gap-1"><Moon className="h-3.5 w-3.5" />{t('tt.ci.sleep')}</p><p className="tr-stat-v mt-1">{open.sleep_hours ?? '–'}<span className="text-sm text-muted-foreground">{open.sleep_hours ? t('tt.ci.h') : ''}</span></p></div>
                {open.sleep_hours ? <Ring value={Math.min(1, open.sleep_hours / 9)} size={42} stroke={5} color="hsl(var(--tr-info))" /> : null}
              </div>
              <div className="tr-stat flex items-center justify-between gap-2">
                <div><p className="tp-label flex items-center gap-1"><Utensils className="h-3.5 w-3.5" />{t('tt.ci.hunger')}</p><p className="tr-stat-v mt-1">{open.hunger_level ?? '–'}<span className="text-sm text-muted-foreground">{open.hunger_level ? '/10' : ''}</span></p></div>
                {open.hunger_level ? <Ring value={open.hunger_level / 10} size={42} stroke={5} /> : null}
              </div>
            </div>
            <div className="tr-ci-yesno">
              <span className="flex items-center gap-2 text-sm"><Footprints className="h-4 w-4 text-muted-foreground" />{t('tt.ci.walked')}</span>
              <YesNo value={open.walked_10000_steps} />
            </div>
            <div className="tr-ci-yesno">
              <span className="flex items-center gap-2 text-sm"><Sun className="h-4 w-4 text-muted-foreground" />{t('tt.ci.sun')}</span>
              <YesNo value={open.sun_exposure_10min} />
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};

export default CheckInsPanel;
