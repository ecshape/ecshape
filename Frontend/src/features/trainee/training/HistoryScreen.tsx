import React, { useMemo, useState } from 'react';
import '@/i18n/ticketsStudio';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock, Dumbbell, History, Layers, Trophy, Weight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { ExerciseDemo } from '@/components/exercises/ExerciseDemo';
import { exerciseFrames } from '@/lib/exerciseLibrary';
import '@/styles/exercises.css';
import { useSessions } from '../hooks';
import type { SetCompletion, WorkoutSession } from '../types';
import { EmptyState, ErrorState, Screen, Skel } from '../ui';
import { dayOf, fmtDate, fmtNum, fmtWeekday, isoDay, parseDate, todayISO } from '../format';
import BodyMap from '../BodyMap';
import { exerciseLoad, type Load } from './muscles';
import { dayIndex, exerciseIndex, sessionVolume, TrainingNav, usePlansAll, useTT } from './shared';

/** Sessions worth showing: finished ones, or days with at least one logged set. */
const visible = (all?: WorkoutSession[]) =>
  (all ?? [])
    .filter((s) => s.is_completed || s.set_completions.length > 0)
    .sort((a, b) => (parseDate(b.started_at)?.getTime() ?? 0) - (parseDate(a.started_at)?.getTime() ?? 0));

const minutesOf = (s: WorkoutSession) => {
  if (s.duration_minutes) return s.duration_minutes;
  const a = parseDate(s.started_at)?.getTime();
  const b = parseDate(s.completed_at)?.getTime();
  return a && b && b > a ? Math.round((b - a) / 60000) : 0;
};

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** History tab: month calendar, month totals and the session cards. */
const HistoryScreen: React.FC = () => {
  const { t, tt, rtl } = useTT();
  const navigate = useNavigate();
  const sessions = useSessions();
  const plans = usePlansAll();
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [picked, setPicked] = useState<string | null>(null);
  const days = useMemo(() => dayIndex(plans.data), [plans.data]);
  const list = useMemo(() => visible(sessions.data), [sessions.data]);
  const doneDays = useMemo(() => new Set(list.map((s) => dayOf(s.started_at))), [list]);

  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;

  const header = (
    <header className="mb-5">
      <p className="tp-label tp-rise">{t('trainee.training.eyebrow')}</p>
      <h1 className="tp-title tp-rise mt-2 text-[2.9rem] sm:text-6xl" style={{ ['--i' as string]: 1 }}>{tt('history.title')}</h1>
      <TrainingNav className="tp-rise mt-4 max-w-md" />
    </header>
  );

  if (sessions.isLoading) {
    return (
      <Screen>
        {header}
        <Skel className="h-80" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">{[0, 1].map((i) => <Skel key={i} className="h-28" />)}</div>
      </Screen>
    );
  }
  if (sessions.isError) return <Screen>{header}<ErrorState onRetry={() => sessions.refetch()} /></Screen>;
  if (!list.length) {
    return (
      <Screen>
        {header}
        <EmptyState icon={History} title={tt('history.emptyTitle')} body={tt('history.emptyBody')}
          action={<button type="button" onClick={() => navigate('/training')} className="tp-btn tp-btn--primary tp-press">{tt('history.toRoutines')}</button>} />
      </Screen>
    );
  }

  // Calendar grid for the shown month (weeks start on Sunday in he, Monday otherwise).
  const firstDow = rtl ? 0 : 1;
  const start = new Date(month);
  start.setDate(1 - ((month.getDay() - firstDow + 7) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const trimmed = cells.slice(0, cells[35].getMonth() === month.getMonth() ? 42 : 35);
  const today = todayISO();

  const inMonth = list.filter((s) => {
    const d = parseDate(s.started_at);
    return d && d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
  });
  const shown = picked ? list.filter((s) => dayOf(s.started_at) === picked) : inMonth;
  const totalMin = inMonth.reduce((n, s) => n + minutesOf(s), 0);
  const totalVol = inMonth.reduce((n, s) => n + sessionVolume(s), 0);
  const thisMonth = monthStart(new Date()).getTime() === month.getTime();

  const shift = (n: number) => {
    setPicked(null);
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  };

  return (
    <Screen>
      {header}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <section className="tp-card tp-rise p-4 sm:p-5" style={{ ['--i' as string]: 2 }} aria-label={tt('history.calendar')}>
          <div className="mb-3 flex items-center gap-2">
            <button type="button" onClick={() => shift(-1)} className="tp-icon-btn tp-press" aria-label={tt('history.prevMonth')}><Prev className="h-5 w-5" /></button>
            <p className="min-w-0 flex-1 text-center font-bold">{fmtDate(month, { month: 'long', year: 'numeric' })}</p>
            <button type="button" onClick={() => shift(1)} disabled={thisMonth} className="tp-icon-btn tp-press disabled:opacity-30" aria-label={tt('history.nextMonth')}><Next className="h-5 w-5" /></button>
          </div>
          <div className="tr-cal mb-1 text-[11px] text-muted-foreground" aria-hidden>
            {cells.slice(0, 7).map((d) => <span key={d.getDay()} className="!aspect-auto">{fmtWeekday(d, 'narrow')}</span>)}
          </div>
          <div className="tr-cal">
            {trimmed.map((d) => {
              const iso = isoDay(d);
              const out = d.getMonth() !== month.getMonth();
              const done = doneDays.has(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!done}
                  onClick={() => setPicked(picked === iso ? null : iso)}
                  data-done={done}
                  data-today={iso === today}
                  aria-pressed={picked === iso}
                  aria-label={fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}
                  className={cn('tp-press', out && 'opacity-30', picked === iso && 'ring-2 ring-foreground ring-offset-2 ring-offset-card')}
                >
                  <span dir="ltr">{d.getDate()}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/50 pt-4 text-center">
            {[
              { icon: CalendarDays, v: fmtNum(inMonth.length), l: tt('history.sessions') },
              { icon: Clock, v: fmtNum(totalMin), l: t('trainee.player.statMinutesN', { count: totalMin }) },
              { icon: Weight, v: totalVol >= 10000 ? `${fmtNum(totalVol / 1000, 1)}k` : fmtNum(totalVol), l: t('trainee.player.statVolume') },
            ].map((s) => (
              <div key={s.l}>
                <s.icon className="mx-auto h-4 w-4 text-primary" aria-hidden />
                <p className="tp-num mt-1 text-2xl leading-none" dir="ltr">{s.v}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{s.l}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="tp-title text-[1.9rem] sm:text-4xl">{picked ? fmtDate(picked, { weekday: 'long', day: 'numeric', month: 'long' }) : tt('history.list')}</h2>
            {picked && <button type="button" onClick={() => setPicked(null)} className="tp-chip tp-press ms-auto">{tt('history.showMonth')}</button>}
          </div>
          {!shown.length ? (
            <p className="tp-card p-6 text-center text-sm text-muted-foreground">{tt('history.noneThisMonth')}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {shown.map((s, i) => (
                <SessionCard key={s.id} s={s} name={days.get(s.workout_day_id)?.name} i={i} onOpen={() => navigate(`/training/history/${s.id}`)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </Screen>
  );
};

const SessionCard: React.FC<{ s: WorkoutSession; name?: string; i: number; onOpen: () => void }> = ({ s, name, i, onOpen }) => {
  const { t, tt } = useTT();
  const d = parseDate(s.started_at);
  const exCount = new Set(s.set_completions.map((c) => c.workout_exercise_id)).size;
  const min = minutesOf(s);
  return (
    <button type="button" onClick={onOpen} className="tp-card tp-press tp-rise flex w-full items-center gap-3 p-3.5 text-start" style={{ ['--i' as string]: 3 + Math.min(i, 8) }}>
      <span className={cn('grid h-14 w-14 flex-none place-items-center rounded-2xl text-center leading-none', s.is_completed ? 'tr-grad' : 'bg-foreground/[.07]')}>
        <span>
          <span className="tp-num block text-2xl">{d?.getDate()}</span>
          <span className="block text-[10px] font-semibold opacity-85">{fmtDate(s.started_at, { month: 'short' })}</span>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold" dir="auto">{name || tt('history.session')}</span>
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {min > 0 && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{t('trainee.common.minutes', { count: min })}</span>}
          <span className="inline-flex items-center gap-1"><Dumbbell className="h-3 w-3" />{t('trainee.common.exercises', { count: exCount })}</span>
          <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" />{t('trainee.common.sets', { count: s.set_completions.length })}</span>
        </span>
        {!s.is_completed && <span className="tp-chip mt-1.5">{tt('history.unfinished')}</span>}
      </span>
      <span className="text-end">
        <span className="tp-num block text-xl leading-none" dir="ltr">{fmtNum(sessionVolume(s))}</span>
        <span className="text-[10px] text-muted-foreground">{t('trainee.player.statVolume')}</span>
      </span>
    </button>
  );
};

/** One past session: totals, muscles worked and every set per exercise. */
export const SessionDetail: React.FC<{ sessionId: number }> = ({ sessionId }) => {
  const { t, tt, rtl } = useTT();
  const navigate = useNavigate();
  const sessions = useSessions();
  const plans = usePlansAll();
  const Back = rtl ? ArrowRight : ArrowLeft;
  const exIdx = useMemo(() => exerciseIndex(plans.data), [plans.data]);
  const days = useMemo(() => dayIndex(plans.data), [plans.data]);
  const s = sessions.data?.find((x) => x.id === sessionId);

  const bar = (title?: string) => (
    <div className="tr-sessionbar border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <button type="button" onClick={() => navigate('/training/history')} className="tp-icon-btn tp-press" aria-label={t('trainee.common.back')}><Back className="h-5 w-5" /></button>
        <p className="min-w-0 flex-1 truncate text-center font-semibold" dir="auto">{title}</p>
        <span className="w-11" />
      </div>
    </div>
  );

  if (sessions.isLoading || plans.isLoading) return <>{bar()}<Screen><Skel className="h-40" /><Skel className="mt-4 h-64" /></Screen></>;
  if (sessions.isError) return <>{bar()}<Screen><ErrorState onRetry={() => sessions.refetch()} /></Screen></>;
  if (!s) return <>{bar()}<Screen><EmptyState icon={History} title={tt('history.notFound')} /></Screen></>;

  const groups = new Map<number, SetCompletion[]>();
  for (const c of [...s.set_completions].sort((a, b) => a.set_number - b.set_number)) groups.set(c.workout_exercise_id, [...(groups.get(c.workout_exercise_id) ?? []), c]);

  // Personal bests: heavier than anything logged for that exercise in earlier sessions.
  const startedAt = parseDate(s.started_at)?.getTime() ?? 0;
  const before: Record<number, number> = {};
  for (const o of sessions.data ?? []) {
    if ((parseDate(o.started_at)?.getTime() ?? 0) >= startedAt) continue;
    for (const c of o.set_completions) before[c.workout_exercise_id] = Math.max(before[c.workout_exercise_id] ?? 0, c.weight_used || 0);
  }

  const load: Load = {};
  for (const id of groups.keys()) {
    for (const [r, v] of Object.entries(exerciseLoad(exIdx.get(id)?.exercise))) load[r as keyof Load] = Math.max(load[r as keyof Load] ?? 0, v ?? 0);
  }
  const dayName = days.get(s.workout_day_id)?.name;
  const min = minutesOf(s);

  return (
    <>
      {bar(dayName)}
      <div className="tp-screen mx-auto w-full max-w-3xl px-4 pb-16 pt-5 sm:px-6 lg:pt-8">
        <p className="tp-label tp-rise">{fmtDate(s.started_at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h1 className="tp-title tp-rise mt-2 break-words text-[3rem] sm:text-6xl" style={{ ['--i' as string]: 1 }} dir="auto">{dayName || tt('history.session')}</h1>

        <div className="tp-card tp-rise mt-4 grid grid-cols-3 divide-x divide-border/50 text-center rtl:divide-x-reverse" style={{ ['--i' as string]: 2 }}>
          {[
            [min ? fmtNum(min) : '-', t('trainee.player.statMinutesN', { count: min || 0 })],
            [fmtNum(s.set_completions.length), t('trainee.player.statSets')],
            [fmtNum(sessionVolume(s)), t('trainee.player.statVolume')],
          ].map(([v, l]) => (
            <div key={l} className="px-2 py-4">
              <p className="tp-num text-3xl leading-none" dir="ltr">{v}</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>

        {Object.keys(load).length > 0 && (
          <div className="tp-card tp-rise mt-3 p-4" style={{ ['--i' as string]: 3 }}>
            <p className="tp-label mb-2">{tt('routine.muscles')}</p>
            <BodyMap load={load} size="md" className="mx-auto !w-44" />
          </div>
        )}

        <div className="mb-3 mt-8 flex items-center gap-2">
          <h2 className="tp-title text-[1.9rem] sm:text-4xl">{tt('routine.exercises')}</h2>
          <InfoTip label={tt('history.pr')}>{tt('history.prHelp')}</InfoTip>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {[...groups.entries()].map(([id, sets], i) => {
            const ex = exIdx.get(id);
            const name = ex?.exercise?.name || ex?.exercise_name || t('trainee.player.exercise');
            const frames = ex?.exercise ? exerciseFrames(ex.exercise) : [];
            const best = Math.max(...sets.map((c) => c.weight_used || 0));
            const pr = before[id] !== undefined && best > before[id];
            return (
              <div key={id} className="tp-card tp-rise flex gap-3 p-3" style={{ ['--i' as string]: 4 + i }}>
                <span className="relative h-16 w-16 flex-none overflow-hidden rounded-2xl bg-white">
                  {frames.length ? <ExerciseDemo frames={frames} alt={name} className="h-full w-full" /> : <span className="grid h-full w-full place-items-center bg-foreground/[.07] text-muted-foreground"><Dumbbell className="h-5 w-5" /></span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-start gap-1.5 font-bold leading-tight" dir="auto">
                    <span className="min-w-0 flex-1 break-words">{name}</span>
                    {pr && <span className="tp-chip tp-chip--primary flex-none !px-2" title={tt('history.pr')}><Trophy className="h-3 w-3" /><span className="sr-only">{tt('history.pr')}</span></span>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5" dir="ltr">
                    {sets.map((c) => (
                      <span key={c.id} className={cn('tp-chip', pr && c.weight_used === best && 'tp-chip--primary')}>
                        {c.weight_used ? `${fmtNum(c.weight_used, 1)} × ${c.reps_completed}` : `${c.reps_completed} ${t('trainee.player.reps')}`}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {s.notes && <p className="tp-card mt-4 whitespace-pre-line p-4 text-sm" dir="auto">{s.notes}</p>}
      </div>
    </>
  );
};

export default HistoryScreen;
