import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Dumbbell, Flag, History, Info, Minus, Play, Plus, RotateCcw, SkipForward, Timer, Trophy, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { ExerciseDemo } from '@/components/exercises/ExerciseDemo';
import { exerciseFrames } from '@/lib/exerciseLibrary';
import '@/styles/exercises.css';
import {
  previousSetsFor, sortExercises, todaySessionFor, useDeleteSet, useFinishWorkout, useLogSet, useSessions, useWorkoutDay,
} from '../hooks';
import type { SetCompletion, WorkoutExercise, WorkoutSession } from '../types';
import { CountUp, EmptyState, ErrorState, Ring, Screen, Sheet, Skel } from '../ui';
import { dayOf, fmtClock, fmtDate, fmtNum, haptic, parseDate, prefersReducedMotion, todayISO } from '../format';
import BodyMap from '../BodyMap';
import { exerciseLoad, exerciseMuscles } from './muscles';
import { muscleLabel, sessionStart, setVolume, useTT } from './shared';

const repsFloor = (r?: string | null) => (r || '').match(/\d+/)?.[0] ?? '';
const youtubeId = (url?: string | null) => url?.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{6,})/)?.[1] ?? null;
const DEFAULT_REST = 90;

type Rest = { endsAt: number; total: number; next?: string } | null;
type Summary = { minutes: number; sets: number; volume: number; prs: string[]; sessionId?: number };

/**
 * Exercise screen + workout session (SmartGym style): one exercise at a time ("2 of 7"), swipe or up/down
 * to move, editable sets table, rest timer. "Start workout session" turns on the duration timer and set logging.
 * Sets are written with the existing set-completion API (filed under today's session for the day).
 */
const SessionPlayer: React.FC<{ dayId: number }> = ({ dayId }) => {
  const { t, tt, rtl } = useTT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const Back = rtl ? ArrowRight : ArrowLeft;

  const dayQ = useWorkoutDay(dayId);
  const sessionsQ = useSessions();
  const logSet = useLogSet();
  const deleteSet = useDeleteSet();
  const finish = useFinishWorkout();

  const day = dayQ.data;
  const exercises = useMemo(() => sortExercises(day), [day]);
  const live = todaySessionFor(sessionsQ.data, dayId);
  const logged = live?.set_completions ?? [];
  const completed = !!live?.is_completed;

  const [idx, setIdx] = useState(() => Math.max(0, Number(params.get('ex')) || 0));
  const [dir, setDir] = useState<'next' | 'prev' | null>(null);
  const [startMs, setStartMs] = useState<number | null>(() => sessionStart.get(dayId));
  const [drafts, setDrafts] = useState<Record<string, { w?: string; r?: string }>>({});
  const [extra, setExtra] = useState<Record<number, number>>({});
  const [rest, setRest] = useState<Rest>(null);
  const [info, setInfo] = useState(false);
  const [history, setHistory] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [now, setNow] = useState(Date.now());
  const touch = useRef<{ x: number; y: number } | null>(null);

  // A session with sets logged today (e.g. started on another device) counts as started.
  const serverStart = live && !completed && logged.length ? parseDate(live.started_at)?.getTime() ?? null : null;
  const started = !completed && (startMs ?? serverStart) !== null;
  const begin = started ? (startMs ?? serverStart)! : null;

  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [started]);

  useEffect(() => {
    if (exercises.length && idx > exercises.length - 1) setIdx(exercises.length - 1);
  }, [exercises.length, idx]);

  const go = (to: number) => {
    if (to < 0 || to >= exercises.length || to === idx) return;
    setDir(to > idx ? 'next' : 'prev');
    setIdx(to);
    haptic(6);
    const p = new URLSearchParams(params);
    if (to) p.set('ex', String(to));
    else p.delete('ex');
    setParams(p, { replace: true });
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  const setsFor = (exId: number) => logged.filter((c) => c.workout_exercise_id === exId).sort((a, b) => a.set_number - b.set_number);
  const countFor = (ex: WorkoutExercise) => {
    const done = setsFor(ex.id);
    const maxLogged = done.length ? Math.max(...done.map((d) => d.set_number)) : 0;
    return Math.max(1, maxLogged, Math.max(1, ex.target_sets || 1) + (extra[ex.id] ?? 0));
  };
  const totalTarget = exercises.reduce((n, e) => n + countFor(e), 0);

  const maxBefore = useMemo(() => {
    const m: Record<number, number> = {};
    const today = todayISO();
    for (const s of sessionsQ.data ?? []) {
      if (dayOf(s.started_at) === today) continue;
      for (const c of s.set_completions) m[c.workout_exercise_id] = Math.max(m[c.workout_exercise_id] ?? 0, c.weight_used || 0);
    }
    return m;
  }, [sessionsQ.data]);

  const defaults = (ex: WorkoutExercise, n: number) => {
    const mine = setsFor(ex.id);
    const prevSame = previousSetsFor(sessionsQ.data, ex.id)?.sets.find((s) => s.set_number === n);
    const lastMine = mine[mine.length - 1];
    const w = lastMine?.weight_used ?? prevSame?.weight_used ?? ex.target_weight ?? '';
    const r = prevSame?.reps_completed ?? lastMine?.reps_completed ?? repsFloor(ex.target_reps);
    return { w: w === '' || w === null ? '' : String(w), r: String(r) };
  };
  const value = (ex: WorkoutExercise, n: number, k: 'w' | 'r') => drafts[`${ex.id}-${n}`]?.[k] ?? defaults(ex, n)[k];
  const setDraft = (ex: WorkoutExercise, n: number, k: 'w' | 'r', v: string) =>
    setDrafts((d) => ({ ...d, [`${ex.id}-${n}`]: { ...d[`${ex.id}-${n}`], [k]: v } }));

  const restFor = (ex: WorkoutExercise) => ex.rest_seconds || DEFAULT_REST;
  const startRest = (ex: WorkoutExercise, next?: string) => setRest({ endsAt: Date.now() + restFor(ex) * 1000, total: restFor(ex), next });

  const startSession = () => {
    setStartMs(sessionStart.set(dayId));
    haptic([14, 40, 14]);
  };

  const doLog = (ex: WorkoutExercise, n: number) => {
    const w = parseFloat(value(ex, n, 'w').replace(',', '.'));
    const r = parseInt(value(ex, n, 'r'), 10);
    if (!Number.isFinite(r) || r <= 0) {
      toast.error(t('trainee.player.needReps'));
      return;
    }
    if (!started) startSession();
    haptic(14);
    logSet.mutate(
      { dayId, workoutExerciseId: ex.id, setNumber: n, reps: r, weight: Number.isFinite(w) ? w : 0 },
      { onError: () => toast.error(t('trainee.player.logError')) },
    );
    const doneAfter = setsFor(ex.id).length + 1;
    const i = exercises.findIndex((e) => e.id === ex.id);
    const nextName = doneAfter < countFor(ex)
      ? tt('player.nextSet', { n: doneAfter + 1 })
      : exercises[i + 1] ? exercises[i + 1].exercise?.name || exercises[i + 1].exercise_name || '' : undefined;
    startRest(ex, nextName);
  };

  const undo = (ex: WorkoutExercise, c: SetCompletion) => {
    if (c.pending || c.id < 0) return;
    haptic(6);
    deleteSet.mutate(c.id, {
      onSuccess: () =>
        toast(t('trainee.player.setRemoved'), {
          action: { label: t('trainee.player.undo'), onClick: () => logSet.mutate({ dayId, workoutExerciseId: ex.id, setNumber: c.set_number, reps: c.reps_completed, weight: c.weight_used }) },
        }),
      onError: () => toast.error(t('trainee.player.logError')),
    });
  };

  const doFinish = () => {
    const minutes = begin ? Math.max(1, Math.round((Date.now() - begin) / 60000)) : 0;
    const volume = logged.reduce((v, c) => v + setVolume(c), 0);
    const prs = exercises
      .filter((e) => {
        const best = Math.max(0, ...setsFor(e.id).map((c) => c.weight_used || 0));
        return maxBefore[e.id] !== undefined && best > maxBefore[e.id];
      })
      .map((e) => e.exercise?.name || e.exercise_name || '');
    setRest(null);
    setConfirmEnd(false);
    finish.mutate(
      { dayId, startedMs: begin ?? undefined },
      {
        onSuccess: (s) => {
          haptic([20, 60, 20, 60, 40]);
          sessionStart.clear(dayId);
          setStartMs(null);
          setSummary({ minutes, sets: logged.length, volume, prs, sessionId: s?.id });
        },
        onError: () => toast.error(t('trainee.player.finishError')),
      },
    );
  };

  const cancelSession = () => {
    sessionStart.clear(dayId);
    setStartMs(null);
    setRest(null);
    setConfirmEnd(false);
  };

  const reopen = () => {
    finish.mutate({ dayId, completed: false });
    setStartMs(sessionStart.set(dayId, parseDate(live?.started_at)?.getTime() ?? Date.now()));
  };

  if (dayQ.isLoading) {
    return (
      <Screen>
        <Skel className="mb-4 h-10 w-40" />
        <Skel className="aspect-[4/3] w-full" />
        <Skel className="mt-4 h-10 w-56" />
        <Skel className="mt-4 h-56" />
      </Screen>
    );
  }
  if (dayQ.isError || !day) return <Screen><ErrorState onRetry={() => dayQ.refetch()} /></Screen>;
  if (!exercises.length) {
    return <Screen><EmptyState icon={Dumbbell} title={t('trainee.player.emptyTitle')} body={t('trainee.player.emptyBody')} /></Screen>;
  }

  const i = Math.min(idx, exercises.length - 1);
  const ex = exercises[i];
  const name = ex.exercise?.name || ex.exercise_name || t('trainee.player.exercise');
  const frames = ex.exercise ? exerciseFrames(ex.exercise) : [];
  const done = setsFor(ex.id);
  const count = countFor(ex);
  const nextSet = Array.from({ length: count }, (_, k) => k + 1).find((n) => !done.some((d) => d.set_number === n));
  const exDone = nextSet === undefined;
  const allDone = exercises.every((e) => setsFor(e.id).length >= countFor(e));
  const prev = previousSetsFor(sessionsQ.data, ex.id);
  const elapsed = begin ? (now - begin) / 1000 : 0;
  const removable = count > Math.max(1, done.length ? Math.max(...done.map((d) => d.set_number)) : 0);

  const onTouchStart = (e: React.TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(i + ((dx < 0) !== rtl ? 1 : -1));
  };

  let fab: React.ReactNode = null;
  if (completed) fab = null;
  else if (!started) {
    fab = (
      <button type="button" onClick={startSession} className="tr-grad tp-press inline-flex min-h-[3.4rem] items-center gap-2.5 rounded-full px-7 text-base font-extrabold shadow-[0_18px_40px_-14px_rgba(216,54,30,.9)]">
        <Play className="h-5 w-5 fill-current" />{tt('hero.title')}
      </button>
    );
  } else if (!exDone) {
    fab = (
      <button type="button" onClick={() => doLog(ex, nextSet!)} className="tr-grad tp-press inline-flex min-h-[3.4rem] items-center gap-2.5 rounded-full px-7 text-base font-extrabold shadow-[0_18px_40px_-14px_rgba(216,54,30,.9)]">
        <Check className="h-5 w-5" strokeWidth={3} />{tt('player.logSet', { n: nextSet })}
      </button>
    );
  } else if (!allDone && i < exercises.length - 1) {
    fab = (
      <button type="button" onClick={() => go(i + 1)} className="tr-grad tp-press inline-flex min-h-[3.4rem] items-center gap-2.5 rounded-full px-7 text-base font-extrabold shadow-[0_18px_40px_-14px_rgba(216,54,30,.9)]">
        {tt('player.nextExercise')}<ChevronDown className="h-5 w-5" />
      </button>
    );
  } else {
    fab = (
      <button type="button" onClick={doFinish} disabled={finish.isPending} className="tr-grad tp-press inline-flex min-h-[3.4rem] items-center gap-2.5 rounded-full px-7 text-base font-extrabold shadow-[0_18px_40px_-14px_rgba(216,54,30,.9)] disabled:opacity-60">
        <Flag className="h-5 w-5" />{t('trainee.player.finish')}
      </button>
    );
  }

  return (
    <>
      <div className="tr-sessionbar border-b border-border/40 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5 sm:px-6">
          <button type="button" onClick={() => navigate(`/training/day/${dayId}`)} className="tp-icon-btn tp-press" aria-label={t('trainee.common.back')}>
            <Back className="h-5 w-5" />
          </button>
          <p className="min-w-0 flex-1 text-center font-semibold" aria-live="polite">
            <span className="tp-num text-lg">{tt('player.of', { i: i + 1, n: exercises.length })}</span>
          </p>
          <div className="tr-stage-nav">
            <button type="button" className="tp-press" onClick={() => go(i - 1)} disabled={i === 0} aria-label={tt('player.prev')}><ChevronUp className="h-5 w-5" /></button>
            <button type="button" className="tp-press" onClick={() => go(i + 1)} disabled={i === exercises.length - 1} aria-label={tt('player.next')}><ChevronDown className="h-5 w-5" /></button>
          </div>
        </div>
        {(started || completed) && (
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pb-2.5 sm:px-6">
            {completed ? (
              <>
                <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-[hsl(var(--tp-ok))]"><Trophy className="h-4 w-4 flex-none" /><span className="truncate">{t('trainee.player.completedToday')}</span></span>
                <button type="button" onClick={reopen} className="tp-icon-btn tp-press" aria-label={t('trainee.player.reopen')}><RotateCcw className="h-4 w-4" /></button>
              </>
            ) : (
              <>
                <span className="tr-live flex-none" aria-hidden />
                <span className="tp-num text-xl leading-none" dir="ltr" role="timer" aria-label={tt('player.duration')}>{fmtClock(elapsed)}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  <span dir="ltr">{logged.length}/{totalTarget}</span> {tt('player.setsDone')}
                </span>
                <button type="button" onClick={() => setConfirmEnd(true)} className="tp-btn tp-btn--ghost tp-btn--sm tp-press !min-h-[2.4rem] !px-3.5" aria-label={tt('player.end')}>
                  <Flag className="h-4 w-4" /><span className="max-[359px]:sr-only">{tt('player.endShort')}</span>
                </button>
              </>
            )}
          </div>
        )}
        <div className="h-0.5 w-full bg-foreground/[.06]">
          <div className="tr-grad h-full transition-[width] duration-700" style={{ width: `${(Math.min(logged.length, totalTarget) / (totalTarget || 1)) * 100}%` }} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-36 pt-4 sm:px-6 lg:pt-6">
        <div key={ex.id} className={cn(dir === 'next' && 'tr-slide-next', dir === 'prev' && 'tr-slide-prev')}>
          <div className="tr-stage aspect-[4/3] w-full sm:aspect-[16/10]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {frames.length ? (
              <ExerciseDemo frames={frames} alt={name} className="h-full w-full" playing />
            ) : (
              <span className="grid h-full w-full place-items-center bg-card text-muted-foreground"><Dumbbell className="h-12 w-12" /></span>
            )}
            {exDone && <span className="absolute end-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--tp-ok))] text-white shadow-lg"><Check className="h-5 w-5" strokeWidth={3} /></span>}
          </div>

          <div className="mt-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {ex.group_name && <span className="tp-chip tp-chip--primary mb-1.5">{ex.group_name}</span>}
              <h1 className="text-[1.65rem] font-extrabold leading-tight sm:text-3xl" dir="auto">{name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {exerciseMuscles(ex.exercise).primary.map((m) => muscleLabel(tt, m)).join(' · ')}
                {ex.tempo ? <> · {t('trainee.player.tempo', { tempo: ex.tempo })}</> : null}
              </p>
            </div>
            <button type="button" onClick={() => setHistory(true)} className="tp-icon-btn tp-press" aria-label={t('trainee.player.history')}><History className="h-5 w-5" /></button>
            <button type="button" onClick={() => setInfo(true)} className="tp-icon-btn tp-press !bg-primary/15 !text-primary" aria-label={t('trainee.player.howTo')}><Info className="h-5 w-5" /></button>
          </div>

          {ex.notes && (
            <p className="mt-3 rounded-2xl bg-primary/10 px-3.5 py-2.5 text-sm" dir="auto">
              <span className="font-semibold text-primary">{t('trainee.player.coachSays')} </span>{ex.notes}
            </p>
          )}

          <div className="mb-2 mt-6 flex items-center gap-2">
            <h2 className="tp-title text-[1.9rem]">{tt('player.sets')}</h2>
            <InfoTip label={tt('player.sets')}>{started ? tt('player.setsHelpLive') : tt('player.setsHelp')}</InfoTip>
            <span className="ms-auto text-xs text-muted-foreground" dir="ltr">{ex.target_sets} × {ex.target_reps}</span>
          </div>
          <div className="tp-card p-3 sm:p-4">
            <div className={cn('tr-sets mb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground', !started && 'tr-sets--view')}>
              <span />
              <span>{t('trainee.player.reps')}</span>
              <span>{tt('player.weight')}</span>
              <span />
            </div>
            {Array.from({ length: count }, (_, k) => k + 1).map((n) => {
              const c = done.find((d) => d.set_number === n);
              const p = prev?.sets.find((s) => s.set_number === n);
              return (
                <div key={n} className={cn('tr-sets rounded-2xl py-1 transition-colors', !started && 'tr-sets--view', c && 'bg-[hsl(var(--tp-ok)/.08)]')}>
                  <span className="text-center">
                    <span className="tr-setno" data-done={!!c} dir="ltr">{n}</span>
                    {p && !c && <span className="mt-0.5 block text-[10px] text-muted-foreground" dir="ltr">{fmtNum(p.weight_used, 1)}×{p.reps_completed}</span>}
                  </span>
                  {c ? (
                    <>
                      <span className="tr-cell grid place-items-center" dir="ltr">{c.reps_completed}</span>
                      <span className="tr-cell grid place-items-center" dir="ltr">{fmtNum(c.weight_used, 1)}</span>
                    </>
                  ) : (
                    <>
                      <input
                        className="tr-cell" inputMode="numeric" enterKeyHint="next" dir="ltr" placeholder="0"
                        aria-label={`${t('trainee.player.set')} ${n} ${t('trainee.player.reps')}`}
                        value={value(ex, n, 'r')}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setDraft(ex, n, 'r', e.target.value.replace(/\D/g, ''))}
                      />
                      <input
                        className="tr-cell" inputMode="decimal" enterKeyHint="done" dir="ltr" placeholder="0"
                        aria-label={`${t('trainee.player.set')} ${n} ${t('trainee.common.kg')}`}
                        value={value(ex, n, 'w')}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setDraft(ex, n, 'w', e.target.value.replace(/[^\d.,]/g, ''))}
                        onKeyDown={(e) => e.key === 'Enter' && started && doLog(ex, n)}
                      />
                    </>
                  )}
                  {started || c ? (
                    <button
                      type="button" className="tp-check tp-press" data-done={!!c} data-ready={!c && n === nextSet}
                      onClick={() => (c ? undo(ex, c) : doLog(ex, n))}
                      aria-label={c ? t('trainee.player.unlog', { n }) : t('trainee.player.log', { n })}
                    >
                      <Check className="h-6 w-6" strokeWidth={3} />
                    </button>
                  ) : <span />}
                </div>
              );
            })}
            <div className="mt-2 flex items-center justify-center gap-2 border-t border-border/50 pt-3">
              <button type="button" onClick={() => setExtra((x) => ({ ...x, [ex.id]: (x[ex.id] ?? 0) - 1 }))} disabled={!removable} className="tp-icon-btn tp-press disabled:opacity-30" aria-label={tt('player.removeSet')}>
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[4.5rem] text-center text-xs text-muted-foreground">{t('trainee.common.sets', { count })}</span>
              <button type="button" onClick={() => setExtra((x) => ({ ...x, [ex.id]: (x[ex.id] ?? 0) + 1 }))} className="tp-icon-btn tp-press" aria-label={t('trainee.player.addSet')}>
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-foreground/[.05] px-4 py-2.5">
              <Timer className="h-5 w-5 flex-none text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{tt('player.rest')}</span>
              <span className="tp-num flex-1 text-center text-2xl" dir="ltr">{fmtClock(restFor(ex))}</span>
              <button type="button" onClick={() => startRest(ex)} className="tp-btn tp-btn--sm tp-press !min-h-[2.4rem] bg-primary/15 text-primary" aria-label={tt('player.startRest')}>
                <Play className="h-4 w-4 fill-current" /><span className="max-[359px]:sr-only">{tt('player.restStart')}</span>
              </button>
            </div>
          </div>

          {prev && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t('trainee.player.lastTime', { date: fmtDate(prev.date) })}{' '}
              <span dir="ltr" className="inline-block">{prev.sets.map((s) => `${fmtNum(s.weight_used, 1)}×${s.reps_completed}`).join('  ')}</span>
            </p>
          )}

          {/* Up next strip: the rest of the routine as small cards */}
          <div className="mt-6">
            <p className="tp-label mb-2">{tt('player.routine')}</p>
            <div className="tp-scroll-x">
              {exercises.map((e, k) => {
                const f = e.exercise ? exerciseFrames(e.exercise) : [];
                const fin = setsFor(e.id).length >= countFor(e);
                return (
                  <button
                    key={e.id} type="button" onClick={() => go(k)}
                    className={cn('tp-press relative h-16 w-16 overflow-hidden rounded-2xl bg-white', k === i ? 'ring-2 ring-primary' : 'opacity-80')}
                    aria-label={`${k + 1}. ${e.exercise?.name || e.exercise_name || ''}`}
                    aria-current={k === i ? 'step' : undefined}
                  >
                    {f[0] ? <img src={f[0]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center bg-card text-muted-foreground"><Dumbbell className="h-5 w-5" /></span>}
                    <span className={cn('tp-num absolute bottom-0.5 end-0.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] text-white', fin ? 'bg-[hsl(var(--tp-ok))]' : 'bg-black/70')} dir="ltr">
                      {fin ? <Check className="h-3 w-3" /> : k + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {fab && <div className="tr-float">{fab}</div>}
      {rest && <RestOverlay rest={rest} onChange={setRest} />}

      <Sheet open={info} onOpenChange={setInfo} title={name} description={[ex.exercise?.equipment || ex.exercise?.equipment_needed, ex.exercise?.level].filter(Boolean).join(' · ') || undefined}>
        <ExerciseDetails ex={ex} />
      </Sheet>
      <Sheet open={history} onOpenChange={setHistory} title={t('trainee.player.historyTitle')} description={name}>
        <ExerciseHistory sessions={sessionsQ.data ?? []} exId={ex.id} />
      </Sheet>
      <Sheet
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title={logged.length ? tt('player.endTitle') : tt('player.cancelTitle')}
        description={logged.length ? tt('player.endBody', { done: logged.length, total: totalTarget }) : tt('player.cancelBody')}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            {logged.length ? (
              <button type="button" onClick={doFinish} disabled={finish.isPending} className="tp-btn tp-btn--primary tp-press flex-1"><Flag className="h-5 w-5" />{t('trainee.player.finish')}</button>
            ) : (
              <button type="button" onClick={cancelSession} className="tp-btn tp-btn--primary tp-press flex-1"><X className="h-5 w-5" />{tt('player.cancelSession')}</button>
            )}
            <button type="button" onClick={() => setConfirmEnd(false)} className="tp-btn tp-btn--ghost tp-press flex-1">{tt('player.keepGoing')}</button>
          </div>
        }
      >
        <span />
      </Sheet>

      {summary && (
        <SummaryOverlay
          stats={summary}
          dayName={day.name}
          onClose={() => navigate('/training')}
          onHistory={summary.sessionId ? () => navigate(`/training/history/${summary.sessionId}`) : undefined}
        />
      )}
    </>
  );
};

/* ------------------------------------------------------------------ rest */

const RestOverlay: React.FC<{ rest: NonNullable<Rest>; onChange: (r: Rest) => void }> = ({ rest, onChange }) => {
  const { t, tt } = useTT();
  const [now, setNow] = useState(Date.now());
  const buzzed = useRef(false);
  useEffect(() => {
    buzzed.current = false;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [rest.endsAt]);
  const left = Math.max(0, (rest.endsAt - now) / 1000);
  const over = left <= 0;
  useEffect(() => {
    if (over && !buzzed.current) {
      buzzed.current = true;
      haptic([40, 80, 40]);
      const id = window.setTimeout(() => onChange(null), 1800);
      return () => window.clearTimeout(id);
    }
  }, [over, onChange]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onChange(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange]);
  return (
    <div className="tr-rest-overlay tp-root" role="dialog" aria-modal="true" aria-label={t('trainee.player.resting')}>
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <p className="tp-label">{over ? t('trainee.player.restOver') : t('trainee.player.resting')}</p>
        <Ring value={left / rest.total} size={232} stroke={12} color={over ? 'hsl(var(--tp-ok))' : '#E8682A'} className="mt-5">
          <span role="timer" aria-live="off">
            {over ? <Check className="mx-auto h-16 w-16 text-[hsl(var(--tp-ok))]" /> : <span className="tp-num block text-7xl leading-none" dir="ltr">{fmtClock(left)}</span>}
          </span>
        </Ring>
        {rest.next && <p className="mt-5 text-sm text-muted-foreground">{tt('player.upNext')} <span className="font-semibold text-foreground" dir="auto">{rest.next}</span></p>}
        <div className="mt-6 flex items-center gap-3">
          <button type="button" onClick={() => onChange({ ...rest, endsAt: Math.max(Date.now(), rest.endsAt - 15000) })} className="tp-icon-btn tp-press !h-14 !w-14 text-sm font-bold" aria-label={tt('player.minus15')}><span dir="ltr">−15</span></button>
          <button type="button" onClick={() => onChange(null)} className="tp-btn tp-btn--primary tp-press min-w-[9rem]">
            <SkipForward className="h-5 w-5 rtl:-scale-x-100" />{t('trainee.player.skipRest')}
          </button>
          <button type="button" onClick={() => onChange({ ...rest, endsAt: rest.endsAt + 15000, total: rest.total + 15 })} className="tp-icon-btn tp-press !h-14 !w-14 text-sm font-bold" aria-label={t('trainee.player.add15')}><span dir="ltr">+15</span></button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ info + history */

export const ExerciseDetails: React.FC<{ ex: WorkoutExercise }> = ({ ex }) => {
  const { t, tt } = useTT();
  const e = ex.exercise;
  const url = ex.video_url || e?.video_url;
  const yt = youtubeId(url);
  const frames = e ? exerciseFrames(e) : [];
  const { primary, secondary } = exerciseMuscles(e);
  const steps = e?.library_instructions ?? [];
  return (
    <div className="space-y-4 pb-2">
      {frames.length > 0 && <ExerciseDemo frames={frames} alt={e?.name || ''} className="aspect-[4/3] w-full rounded-2xl" playing />}
      {yt ? (
        <div className="aspect-video overflow-hidden rounded-2xl bg-black">
          <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${yt}`} title={e?.name || 'video'} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      ) : url ? <video className="w-full rounded-2xl bg-black" src={url} controls playsInline /> : null}
      {(primary.length > 0 || secondary.length > 0) && (
        <div className="flex items-center gap-4 rounded-2xl bg-foreground/[.04] p-3">
          <BodyMap load={exerciseLoad(e)} size="md" className="!w-28 flex-none" />
          <div className="min-w-0 space-y-2 text-sm">
            {primary.length > 0 && <div><p className="tp-label">{tt('routine.primary')}</p><p className="mt-0.5 font-semibold">{primary.map((m) => muscleLabel(tt, m)).join(', ')}</p></div>}
            {secondary.length > 0 && <div><p className="tp-label">{tt('routine.secondary')}</p><p className="mt-0.5 text-muted-foreground">{secondary.map((m) => muscleLabel(tt, m)).join(', ')}</p></div>}
          </div>
        </div>
      )}
      {e?.description && <p className="text-sm leading-relaxed" dir="auto">{e.description}</p>}
      {e?.instructions ? (
        <div>
          <p className="tp-label mb-1">{t('trainee.player.instructions')}</p>
          <p className="whitespace-pre-line text-sm leading-relaxed" dir="auto">{e.instructions}</p>
        </div>
      ) : steps.length > 0 ? (
        <InstructionSteps steps={steps} />
      ) : null}
    </div>
  );
};

/** Library steps are in English: mark them so screen readers and layout use the right language. */
export const InstructionSteps: React.FC<{ steps: string[] }> = ({ steps }) => {
  const { t, tt, lang } = useTT();
  return (
    <div>
      <p className="tp-label mb-2 flex items-center gap-1.5">
        {t('trainee.player.instructions')}
        {lang !== 'en' && <InfoTip label={t('trainee.player.instructions')}>{tt('explore.englishOnly')}</InfoTip>}
      </p>
      <ol className="space-y-2" lang="en" dir="ltr">
        {steps.map((s, k) => (
          <li key={k} className="flex gap-3 text-sm leading-relaxed">
            <span className="tp-num grid h-6 w-6 flex-none place-items-center rounded-full bg-primary/15 text-xs text-primary">{k + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

export const ExerciseHistory: React.FC<{ sessions: WorkoutSession[]; exId: number }> = ({ sessions, exId }) => {
  const { t } = useTT();
  const rows = sessions
    .map((s) => ({ s, sets: s.set_completions.filter((c) => c.workout_exercise_id === exId).sort((a, b) => a.set_number - b.set_number) }))
    .filter((r) => r.sets.length)
    .sort((a, b) => (parseDate(b.s.started_at)?.getTime() ?? 0) - (parseDate(a.s.started_at)?.getTime() ?? 0));
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">{t('trainee.player.noHistory')}</p>;
  const best = Math.max(...rows.flatMap((r) => r.sets.map((c) => c.weight_used || 0)));
  return (
    <div className="space-y-2 pb-2">
      <div className="tp-card flex items-center justify-between p-4">
        <span className="text-sm text-muted-foreground">{t('trainee.player.best')}</span>
        <span className="tp-num text-2xl" dir="ltr">{fmtNum(best, 1)} {t('trainee.common.kg')}</span>
      </div>
      {rows.map(({ s, sets }) => (
        <div key={s.id} className="rounded-2xl bg-foreground/[.05] p-3">
          <p className="mb-2 text-sm font-semibold">{fmtDate(s.started_at, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <div className="flex flex-wrap gap-1.5" dir="ltr">
            {sets.map((c) => <span key={c.id} className={cn('tp-chip', c.weight_used === best && 'tp-chip--primary')}>{fmtNum(c.weight_used, 1)} × {c.reps_completed}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ finish */

const SummaryOverlay: React.FC<{ stats: Summary; dayName: string; onClose: () => void; onHistory?: () => void }> = ({ stats, dayName, onClose, onHistory }) => {
  const { t, tt } = useTT();
  const pieces = useMemo(() => Array.from({ length: 42 }, (_, i) => ({ r: `${(i * 360) / 42 + (i % 3) * 7}deg`, dist: `${-140 - (i % 7) * 34}px`, d: (i % 6) * 40 })), []);
  return (
    <div className="tp-celebrate" role="dialog" aria-modal="true" aria-labelledby="tr-done-title">
      <div className="tp-burst" aria-hidden>{pieces.map((p, i) => <i key={i} style={{ ['--r' as string]: p.r, ['--dist' as string]: p.dist, ['--d' as string]: p.d }} />)}</div>
      <div className="tp-card tp-pop relative w-full max-w-md p-6 text-center sm:p-8">
        <span className="tr-grad mx-auto grid h-20 w-20 place-items-center rounded-[1.6rem] shadow-[0_20px_40px_-16px_rgba(216,54,30,.9)]"><Trophy className="h-10 w-10" /></span>
        <p className="tp-label mt-5" dir="auto">{dayName}</p>
        <h2 id="tr-done-title" className="tp-title mt-1 text-6xl">{t('trainee.player.doneTitle')}</h2>
        <div className="mt-6 grid grid-cols-3 gap-2">
          {[
            [stats.minutes, t('trainee.player.statMinutes')],
            [stats.sets, t('trainee.player.statSets')],
            [stats.volume, t('trainee.player.statVolume')],
          ].map(([v, l]) => (
            <div key={String(l)} className="rounded-2xl bg-foreground/[.06] px-2 py-3">
              <CountUp value={Number(v)} className="tp-num block text-3xl leading-none" duration={1400} />
              <span className="mt-1 block truncate text-[11px] text-muted-foreground">{l}</span>
            </div>
          ))}
        </div>
        {stats.prs.length > 0 && (
          <div className="mt-4 rounded-2xl bg-primary/10 p-3 text-start">
            <p className="flex items-center gap-1.5 text-sm font-bold text-primary"><Trophy className="h-4 w-4" />{t('trainee.player.records', { count: stats.prs.length })}</p>
            <p className="mt-1 text-sm" dir="auto">{stats.prs.join(' · ')}</p>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" onClick={onClose} className="tp-btn tp-btn--primary tp-press w-full">{tt('summary.done')}</button>
          {onHistory && <button type="button" onClick={onHistory} className="tp-btn tp-btn--ghost tp-press w-full">{tt('summary.viewSession')}</button>}
        </div>
      </div>
    </div>
  );
};

export default SessionPlayer;
