import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock, Dumbbell, NotebookPen, Play, Target, TrendingUp } from 'lucide-react';
import { InfoTip } from '@/components/ui/info-tip';
import { ExerciseDemo } from '@/components/exercises/ExerciseDemo';
import { exerciseFrames } from '@/lib/exerciseLibrary';
import '@/styles/exercises.css';
import { activePlan, previousSetsFor, sortExercises, todaySessionFor, usePlans, useSessions, useWorkoutDay } from '../hooks';
import type { SetCompletion, WorkoutExercise, WorkoutSession } from '../types';
import { EmptyState, ErrorState, Screen, Sheet, Skel } from '../ui';
import { fmtDate, fmtNum } from '../format';
import BodyMap from '../BodyMap';
import { dayGoal, dayLoad, groupSummary } from './muscles';
import { e1rm, freqLabel, goalLabel, muscleLabel, sessionVolume, useTT } from './shared';

/** "2 sets · 10 reps · 60 kg" lines: consecutive identical sets are grouped. */
export const setLines = (ex: WorkoutExercise, last: SetCompletion[] | undefined) => {
  const rows: { reps: string; weight: number | null }[] = last?.length
    ? last.map((c) => ({ reps: String(c.reps_completed), weight: c.weight_used || null }))
    : Array.from({ length: Math.max(1, ex.target_sets || 1) }, () => ({ reps: ex.target_reps || '', weight: ex.target_weight || null }));
  const out: { count: number; reps: string; weight: number | null }[] = [];
  for (const r of rows) {
    const prev = out[out.length - 1];
    if (prev && prev.reps === r.reps && prev.weight === r.weight) prev.count += 1;
    else out.push({ count: 1, ...r });
  }
  return out;
};

const RoutineScreen: React.FC<{ dayId: number }> = ({ dayId }) => {
  const { t, tt, rtl } = useTT();
  const navigate = useNavigate();
  const dayQ = useWorkoutDay(dayId);
  const plans = usePlans();
  const sessionsQ = useSessions();
  const [progressOpen, setProgressOpen] = useState(false);
  const Back = rtl ? ArrowRight : ArrowLeft;
  const Chevron = rtl ? ChevronLeft : ChevronRight;

  const day = dayQ.data;
  const exs = useMemo(() => sortExercises(day), [day]);
  const plan = (plans.data ?? []).find((p) => p.id === day?.workout_plan_id) ?? activePlan(plans.data);
  const live = todaySessionFor(sessionsQ.data, dayId);
  const inProgress = !!live && !live.is_completed && live.set_completions.length > 0;

  if (dayQ.isLoading) {
    return (
      <Screen>
        <Skel className="mb-3 h-4 w-28" />
        <Skel className="mb-6 h-16 w-56" />
        <Skel className="h-24" />
        <div className="mt-6 space-y-3">{[0, 1, 2].map((i) => <Skel key={i} className="h-24" />)}</div>
      </Screen>
    );
  }
  if (dayQ.isError || !day) return <Screen><ErrorState onRetry={() => dayQ.refetch()} /></Screen>;

  const goal = dayGoal(exs);
  const groups = groupSummary(exs);
  const totalSets = exs.reduce((n, e) => n + (e.target_sets || 0), 0);
  const assigned = plan?.start_date || plan?.created_at;
  const start = (i = 0) => navigate(`/training/day/${dayId}/session${i ? `?ex=${i}` : ''}`);

  return (
    <>
      <div className="tr-sessionbar border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <button type="button" onClick={() => navigate('/training')} className="tp-icon-btn tp-press" aria-label={t('trainee.common.back')}>
            <Back className="h-5 w-5" />
          </button>
          <p className="min-w-0 flex-1 truncate text-center font-semibold" dir="auto">{day.name}</p>
          <button type="button" onClick={() => setProgressOpen(true)} className="tp-icon-btn tp-press" aria-label={tt('routine.progress')}>
            <TrendingUp className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="tp-screen mx-auto w-full max-w-3xl px-4 pb-32 pt-5 sm:px-6 lg:pt-8">
        <p className="tp-label tp-rise" dir="auto">{day.workout_plan_name}</p>
        <h1 className="tp-title tp-rise mt-2 break-words text-[3.2rem] sm:text-7xl" style={{ ['--i' as string]: 1 }} dir="auto">{day.name}</h1>

        <div className="tp-card tp-rise mt-4 grid grid-cols-2 divide-x divide-border/50 rtl:divide-x-reverse" style={{ ['--i' as string]: 2 }}>
          <div className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{tt('routine.frequency')}</p>
            <p className="mt-1 font-bold">{freqLabel(tt, plan)}</p>
          </div>
          <div className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Target className="h-3.5 w-3.5" />{tt('routine.goal')}
              <InfoTip label={tt('routine.goal')}>{tt('routine.goalHelp')}</InfoTip>
            </p>
            <p className="mt-1 font-bold text-primary">{goalLabel(tt, goal)}</p>
          </div>
        </div>

        <div className="tp-rise mt-3 flex flex-wrap gap-2" style={{ ['--i' as string]: 3 }}>
          <span className="tp-chip"><Dumbbell className="h-3.5 w-3.5" />{t('trainee.common.exercises', { count: exs.length })}</span>
          <span className="tp-chip">{t('trainee.common.sets', { count: totalSets })}</span>
          {day.estimated_duration ? <span className="tp-chip"><Clock className="h-3.5 w-3.5" />{t('trainee.common.minutes', { count: day.estimated_duration })}</span> : null}
        </div>

        {day.notes && (
          <div className="tp-card tp-rise mt-4 flex gap-3 p-4" style={{ ['--i' as string]: 3 }}>
            <NotebookPen className="mt-0.5 h-5 w-5 flex-none text-primary" />
            <div className="min-w-0">
              <p className="tp-label">{t('trainee.training.coachNotes')}</p>
              <p className="mt-1 whitespace-pre-line text-sm" dir="auto">{day.notes}</p>
            </div>
          </div>
        )}

        <div className="mb-3 mt-8 flex items-center justify-between gap-3">
          <h2 className="tp-title text-[1.9rem] sm:text-4xl">{tt('routine.exercises')}</h2>
          {exs.length > 0 && (
            <button type="button" onClick={() => start()} className="tp-btn tp-btn--primary tp-btn--sm tp-press">
              <Play className="h-4 w-4 fill-current" />{inProgress ? tt('routine.continue') : tt('routine.start')}
            </button>
          )}
        </div>

        {!exs.length ? (
          <EmptyState icon={Dumbbell} title={t('trainee.player.emptyTitle')} body={t('trainee.player.emptyBody')} />
        ) : (
          <ol className="grid gap-2.5 sm:grid-cols-2">
            {exs.map((ex, i) => {
              const name = ex.exercise?.name || ex.exercise_name || t('trainee.player.exercise');
              const frames = ex.exercise ? exerciseFrames(ex.exercise) : [];
              const prev = previousSetsFor(sessionsQ.data, ex.id);
              const lines = setLines(ex, prev?.sets);
              return (
                <li key={ex.id} className="tp-rise" style={{ ['--i' as string]: 4 + i }}>
                  <button type="button" onClick={() => start(i)} className="tp-card tp-press flex h-full w-full items-center gap-3 p-3 text-start">
                    <span className="relative h-[4.5rem] w-[4.5rem] flex-none overflow-hidden rounded-2xl bg-white">
                      {frames.length ? <ExerciseDemo frames={frames} alt={name} className="h-full w-full" /> : <span className="grid h-full w-full place-items-center bg-foreground/[.07] text-muted-foreground"><Dumbbell className="h-6 w-6" /></span>}
                      <span className="tp-num absolute bottom-1 start-1 grid h-5 min-w-5 place-items-center rounded-full bg-black/70 px-1 text-[11px] text-white" dir="ltr">{i + 1}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-bold leading-tight" dir="auto">{name}</span>
                      <span className="mt-1 block space-y-0.5 text-[13px] text-muted-foreground">
                        {lines.slice(0, 3).map((l, k) => (
                          <span key={k} className="block">
                            {tt('routine.setLine', { count: l.count, reps: l.reps })}
                            {l.weight ? <> · <span dir="ltr" className="inline-block">{fmtNum(l.weight, 1)} {t('trainee.common.kg')}</span></> : null}
                          </span>
                        ))}
                      </span>
                      {prev && <span className="mt-1 block text-[11px] text-primary/90">{tt('routine.fromLast', { date: fmtDate(prev.date) })}</span>}
                    </span>
                    <Chevron className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <button type="button" onClick={() => setProgressOpen(true)} className="tp-card tp-press mt-4 flex w-full items-center gap-3 p-4 text-start">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-primary/15 text-primary"><TrendingUp className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{tt('routine.progress')}</span>
            <span className="block text-xs text-muted-foreground">{tt('routine.progressSub')}</span>
          </span>
          <Chevron className="h-4 w-4 text-muted-foreground" aria-hidden />
        </button>

        {groups.length > 0 && (
          <>
            <h2 className="tp-title mb-3 mt-8 text-[1.9rem] sm:text-4xl">{tt('routine.muscles')}</h2>
            <div className="tp-card p-5">
              <BodyMap load={dayLoad(exs)} size="lg" title={groups.map((g) => muscleLabel(tt, g.key)).join(', ')} />
              <p className="mt-3 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full tr-grad" />{tt('routine.primary')}</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full tr-grad opacity-40" />{tt('routine.secondary')}</span>
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {groups.map((g) => (
                <div key={g.key} className="tp-card p-3.5">
                  <p className="truncate font-bold">{muscleLabel(tt, g.key)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t('trainee.common.exercises', { count: g.exercises })}</p>
                  <p className="mt-2 flex items-baseline gap-3">
                    <span><span className="tp-num text-2xl">{fmtNum(g.sets)}</span> <span className="text-[11px] text-muted-foreground">{tt('routine.setsShort')}</span></span>
                    {g.reps > 0 && <span><span className="tp-num text-2xl">{fmtNum(g.reps)}</span> <span className="text-[11px] text-muted-foreground">{tt('routine.repsShort')}</span></span>}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {assigned && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {tt('routine.assigned')}
            <span className="mt-0.5 block font-semibold text-foreground/85">{fmtDate(assigned, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </p>
        )}
      </div>

      {exs.length > 0 && (
        <div className="tr-float">
          <button type="button" onClick={() => start()} className="tr-grad tp-press inline-flex min-h-[3.4rem] items-center gap-2.5 rounded-full px-7 text-base font-extrabold shadow-[0_18px_40px_-14px_rgba(216,54,30,.9)]">
            <Play className="h-5 w-5 fill-current" />
            {inProgress ? tt('hero.continueTitle') : tt('hero.title')}
          </button>
        </div>
      )}

      <Sheet open={progressOpen} onOpenChange={setProgressOpen} title={tt('routine.progress')} description={day.name}>
        <RoutineProgress sessions={(sessionsQ.data ?? []).filter((s) => s.workout_day_id === dayId)} exercises={exs} />
      </Sheet>
    </>
  );
};

/** Volume per session and best set per exercise for one routine. */
export const RoutineProgress: React.FC<{ sessions: WorkoutSession[]; exercises: WorkoutExercise[] }> = ({ sessions, exercises }) => {
  const { t, tt } = useTT();
  const rows = sessions
    .filter((s) => s.set_completions.length)
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map((s) => ({ label: fmtDate(s.started_at), volume: Math.round(sessionVolume(s)) }));
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">{tt('routine.noProgress')}</p>;
  const bests = exercises
    .map((ex) => {
      const sets = sessions.flatMap((s) => s.set_completions.filter((c) => c.workout_exercise_id === ex.id).map((c) => ({ c, at: s.started_at })));
      if (!sets.length) return null;
      const best = sets.reduce((a, b) => (e1rm(b.c) > e1rm(a.c) ? b : a));
      return { ex, best };
    })
    .filter(Boolean) as { ex: WorkoutExercise; best: { c: SetCompletion; at: string } }[];
  return (
    <div className="space-y-4 pb-2">
      <div className="tp-card p-3">
        <p className="mb-2 px-1 text-sm font-semibold">{tt('routine.volumeChart')}</p>
        <div className="h-48" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--foreground) / .08)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'hsl(var(--foreground) / .05)' }}
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }}
                formatter={(v: number) => [`${fmtNum(v)} ${t('trainee.common.kg')}`, tt('routine.volume')]}
              />
              <Bar dataKey="volume" fill="#E8682A" radius={[8, 8, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {bests.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            {tt('routine.bestSets')}
            <InfoTip label={tt('routine.bestSets')}>{tt('routine.bestSetsHelp')}</InfoTip>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {bests.map(({ ex, best }) => (
              <div key={ex.id} className="rounded-2xl bg-foreground/[.05] p-3">
                <p className="line-clamp-2 text-sm font-semibold" dir="auto">{ex.exercise?.name || ex.exercise_name}</p>
                <p className="tp-num mt-1 text-xl" dir="ltr">{fmtNum(best.c.weight_used, 1)} × {best.c.reps_completed}</p>
                <p className="text-[11px] text-muted-foreground">{fmtDate(best.at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutineScreen;
