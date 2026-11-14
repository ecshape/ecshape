import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, Clock, Dumbbell, Flag, History, Info, NotebookPen, Plus, RotateCcw, SkipForward, Trophy, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SetCompletion, WorkoutExercise, WorkoutSession } from './types';
import { ExerciseDemo } from '@/components/exercises/ExerciseDemo';
import { exerciseFrames } from '@/lib/exerciseLibrary';
import '@/styles/exercises.css';
import {
  previousSetsFor, sortExercises, todaySessionFor, useDeleteSet, useFinishWorkout, useLogSet, useSessions, useWorkoutDay,
} from './hooks';
import { Bar, CountUp, EmptyState, ErrorState, Ring, Screen, Sheet, Skel } from './ui';
import { dayOf, fmtClock, fmtDate, fmtNum, haptic, parseDate, todayISO } from './format';

const repsFloor = (r?: string | null) => {
  const m = (r || '').match(/\d+/);
  return m ? m[0] : '';
};

const youtubeId = (url?: string | null) => {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{6,})/);
  return m ? m[1] : null;
};

type Rest = { endsAt: number; total: number; exName: string } | null;

const WorkoutPlayer: React.FC<{ dayId: number }> = ({ dayId }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const rtl = i18n.language?.startsWith('he');
  const Back = rtl ? ArrowRight : ArrowLeft;

  const dayQ = useWorkoutDay(dayId);
  const sessionsQ = useSessions();
  const logSet = useLogSet();
  const deleteSet = useDeleteSet();
  const finish = useFinishWorkout();

  const day = dayQ.data;
  const exercises = useMemo(() => sortExercises(day), [day]);
  const session = todaySessionFor(sessionsQ.data, dayId);
  const logged = session?.set_completions ?? [];

  const [drafts, setDrafts] = useState<Record<string, { w?: string; r?: string }>>({});
  const [extra, setExtra] = useState<Record<number, number>>({});
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [rest, setRest] = useState<Rest>(null);
  const [info, setInfo] = useState<WorkoutExercise | null>(null);
  const [history, setHistory] = useState<WorkoutExercise | null>(null);
  const [celebrate, setCelebrate] = useState<null | { minutes: number; sets: number; volume: number; prs: number }>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const setsFor = (exId: number) => logged.filter((c) => c.workout_exercise_id === exId).sort((a, b) => a.set_number - b.set_number);
  const totalTarget = exercises.reduce((n, e) => n + (e.target_sets || 0), 0);
  const doneCount = logged.length;
  const currentEx = exercises.find((e) => setsFor(e.id).length < (e.target_sets || 1));
  const allDone = exercises.length > 0 && !currentEx;
  const isOpen = (e: WorkoutExercise) => open[e.id] ?? e.id === currentEx?.id;

  const startedAt = session ? parseDate(session.started_at)?.getTime() ?? null : null;
  const elapsed = startedAt && !session?.is_completed ? (now - startedAt) / 1000 : null;

  const maxBefore = useMemo(() => {
    // Heaviest weight per exercise before today (for "new record" detection).
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
    return { w: w === '' ? '' : String(w), r: String(r) };
  };

  const value = (ex: WorkoutExercise, n: number, k: 'w' | 'r') => drafts[`${ex.id}-${n}`]?.[k] ?? defaults(ex, n)[k];
  const setDraft = (ex: WorkoutExercise, n: number, k: 'w' | 'r', v: string) =>
    setDrafts((d) => ({ ...d, [`${ex.id}-${n}`]: { ...d[`${ex.id}-${n}`], [k]: v } }));

  const doLog = (ex: WorkoutExercise, n: number) => {
    const w = parseFloat(value(ex, n, 'w').replace(',', '.'));
    const r = parseInt(value(ex, n, 'r'), 10);
    if (!Number.isFinite(r) || r <= 0) {
      toast.error(t('trainee.player.needReps'));
      return;
    }
    haptic(12);
    logSet.mutate(
      { dayId, workoutExerciseId: ex.id, setNumber: n, reps: r, weight: Number.isFinite(w) ? w : 0 },
      { onError: () => toast.error(t('trainee.player.logError')) },
    );
    if (ex.rest_seconds > 0) setRest({ endsAt: Date.now() + ex.rest_seconds * 1000, total: ex.rest_seconds, exName: ex.exercise?.name || ex.exercise_name || '' });
    const willFinish = setsFor(ex.id).length + 1 >= (ex.target_sets || 1);
    if (willFinish) setOpen((o) => ({ ...o, [ex.id]: false }));
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
    const minutes = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : 0;
    const volume = logged.reduce((v, c) => v + (c.weight_used || 0) * (c.reps_completed || 0), 0);
    const prs = exercises.filter((e) => {
      const best = Math.max(0, ...setsFor(e.id).map((c) => c.weight_used || 0));
      return maxBefore[e.id] !== undefined && best > maxBefore[e.id];
    }).length;
    setRest(null);
    finish.mutate(
      { dayId },
      {
        onSuccess: () => {
          haptic([20, 60, 20, 60, 40]);
          setCelebrate({ minutes, sets: logged.length, volume, prs });
        },
        onError: () => toast.error(t('trainee.player.finishError')),
      },
    );
  };

  if (dayQ.isLoading) {
    return (
      <Screen>
        <Skel className="mb-3 h-4 w-28" />
        <Skel className="mb-6 h-16 w-56" />
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skel key={i} className="h-24" />)}</div>
      </Screen>
    );
  }
  if (dayQ.isError || !day) {
    return (
      <Screen>
        <ErrorState onRetry={() => dayQ.refetch()} />
      </Screen>
    );
  }

  return (
    <>
      {/* Sticky player bar */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl lg:top-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <button type="button" onClick={() => navigate('/training')} className="tp-icon-btn tp-press" aria-label={t('trainee.common.back')}>
            <Back className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{day.name}</p>
            <p className="text-xs text-muted-foreground" dir="ltr" style={{ textAlign: rtl ? 'right' : 'left' }}>
              {session?.is_completed ? t('trainee.player.completedShort') : elapsed !== null ? fmtClock(elapsed) : t('trainee.player.notStarted')}
            </p>
          </div>
          <Ring value={doneCount / (totalTarget || 1)} size={44} stroke={5}>
            <span className="tp-num text-[11px]" dir="ltr">{doneCount}/{totalTarget}</span>
          </Ring>
        </div>
      </div>

      <div className="tp-screen mx-auto w-full max-w-3xl px-4 pb-10 pt-5 sm:px-6 lg:pt-8">
        <p className="tp-label tp-rise">{day.workout_plan_name}</p>
        <h1 className="tp-title tp-rise mt-2 break-words text-[3.2rem] sm:text-7xl" style={{ ['--i' as string]: 1 }}>{day.name}</h1>
        <div className="tp-rise mt-3 flex flex-wrap gap-2" style={{ ['--i' as string]: 2 }}>
          <span className="tp-chip"><Dumbbell className="h-3.5 w-3.5" />{t('trainee.common.exercises', { count: exercises.length })}</span>
          <span className="tp-chip">{t('trainee.common.sets', { count: totalTarget })}</span>
          {day.estimated_duration ? <span className="tp-chip"><Clock className="h-3.5 w-3.5" />{t('trainee.common.minutes', { count: day.estimated_duration })}</span> : null}
          {session?.is_completed && <span className="tp-chip tp-chip--ok"><Check className="h-3.5 w-3.5" />{t('trainee.player.completedToday')}</span>}
        </div>
        <div className="tp-rise mt-4" style={{ ['--i' as string]: 3 }}>
          <Bar value={doneCount / (totalTarget || 1)} />
        </div>

        {day.notes && (
          <div className="tp-card tp-rise mt-5 flex gap-3 p-4" style={{ ['--i' as string]: 3 }}>
            <NotebookPen className="mt-0.5 h-5 w-5 flex-none text-primary" />
            <div className="min-w-0">
              <p className="tp-label">{t('trainee.training.coachNotes')}</p>
              <p className="mt-1 whitespace-pre-line text-sm" dir="auto">{day.notes}</p>
            </div>
          </div>
        )}

        {!exercises.length ? (
          <EmptyState className="mt-6" icon={Dumbbell} title={t('trainee.player.emptyTitle')} body={t('trainee.player.emptyBody')} />
        ) : (
          <ol className="mt-6 space-y-3">
            {exercises.map((ex, i) => {
              const done = setsFor(ex.id);
              const target = ex.target_sets || 1;
              const count = Math.max(target, done.length ? Math.max(...done.map((d) => d.set_number)) : 0) + (extra[ex.id] ?? 0);
              const finished = done.length >= target;
              const prev = previousSetsFor(sessionsQ.data, ex.id);
              const name = ex.exercise?.name || ex.exercise_name || t('trainee.player.exercise');
              const expanded = isOpen(ex);
              return (
                <li key={ex.id} className={cn('tp-card tp-rise overflow-hidden', ex.id === currentEx?.id && 'ring-2 ring-primary/70')} style={{ ['--i' as string]: 4 + i }}>
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [ex.id]: !expanded }))}
                    aria-expanded={expanded}
                    className="tp-press flex w-full items-center gap-3 p-4 text-start sm:p-5"
                  >
                    {ex.exercise && exerciseFrames(ex.exercise).length > 0 ? (
                      <span className="relative h-14 w-14 flex-none overflow-hidden rounded-2xl">
                        <ExerciseDemo frames={exerciseFrames(ex.exercise)} alt={name} className="h-full w-full" />
                        <span className={cn('tp-num absolute bottom-0.5 end-0.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px]', finished ? 'bg-[hsl(var(--tp-ok))] text-white' : 'bg-black/70 text-white')} dir="ltr">
                          {finished ? <Check className="h-3 w-3" /> : i + 1}
                        </span>
                      </span>
                    ) : (
                      <span className={cn('tp-num grid h-12 w-12 flex-none place-items-center rounded-2xl text-xl', finished ? 'bg-[hsl(var(--tp-ok))] text-white' : 'bg-foreground/[.07]')} dir="ltr">
                        {finished ? <Check className="h-6 w-6" /> : i + 1}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="break-words text-lg font-bold leading-tight" dir="auto">{name}</span>
                        {ex.group_name && <span className="tp-chip tp-chip--primary">{ex.group_name}</span>}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        <span dir="ltr" className="inline-block">{target} × {ex.target_reps}{ex.target_weight ? ` · ${fmtNum(ex.target_weight, 1)} kg` : ''}</span>
                        {ex.rest_seconds ? <> · {t('trainee.player.rest', { time: fmtClock(ex.rest_seconds) })}</> : null}
                        {ex.tempo ? <> · {t('trainee.player.tempo', { tempo: ex.tempo })}</> : null}
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-2">
                      <span className="tp-num text-sm text-muted-foreground" dir="ltr">{done.length}/{target}</span>
                      <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform duration-300', expanded && 'rotate-180')} />
                    </span>
                  </button>

                  {expanded && (
                    <div className="border-t border-border/50 px-3 pb-4 pt-3 sm:px-5">
                      {ex.notes && (
                        <p className="mb-3 rounded-2xl bg-primary/10 px-3 py-2 text-sm" dir="auto">
                          <span className="font-semibold text-primary">{t('trainee.player.coachSays')} </span>
                          {ex.notes}
                        </p>
                      )}
                      <div className="mb-2 grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <span className="text-center">{t('trainee.player.set')}</span>
                        <span className="text-center">{t('trainee.common.kg')}</span>
                        <span className="text-center">{t('trainee.player.reps')}</span>
                        <span />
                      </div>
                      <div className="space-y-2">
                        {Array.from({ length: count }, (_, k) => k + 1).map((n) => {
                          const c = done.find((d) => d.set_number === n);
                          const p = prev?.sets.find((s) => s.set_number === n);
                          return (
                            <div key={n} className={cn('grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-2 rounded-2xl p-1 transition-colors', c && 'bg-[hsl(var(--tp-ok)/.08)]')}>
                              <span className="text-center leading-tight">
                                <span className="tp-num block text-lg">{n}</span>
                                {p && <span className="block text-[10px] text-muted-foreground" dir="ltr">{fmtNum(p.weight_used, 1)}×{p.reps_completed}</span>}
                              </span>
                              {c ? (
                                <>
                                  <span className="tp-num grid h-12 place-items-center text-xl" dir="ltr">{fmtNum(c.weight_used, 1)}</span>
                                  <span className="tp-num grid h-12 place-items-center text-xl" dir="ltr">{c.reps_completed}</span>
                                </>
                              ) : (
                                <>
                                  <input
                                    className="tp-input h-12 px-1 text-center text-lg font-bold"
                                    inputMode="decimal"
                                    enterKeyHint="next"
                                    dir="ltr"
                                    aria-label={`${t('trainee.player.set')} ${n} ${t('trainee.common.kg')}`}
                                    value={value(ex, n, 'w')}
                                    placeholder="0"
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={(e) => setDraft(ex, n, 'w', e.target.value.replace(/[^\d.,]/g, ''))}
                                  />
                                  <input
                                    className="tp-input h-12 px-1 text-center text-lg font-bold"
                                    inputMode="numeric"
                                    enterKeyHint="done"
                                    dir="ltr"
                                    aria-label={`${t('trainee.player.set')} ${n} ${t('trainee.player.reps')}`}
                                    value={value(ex, n, 'r')}
                                    placeholder="0"
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={(e) => setDraft(ex, n, 'r', e.target.value.replace(/\D/g, ''))}
                                    onKeyDown={(e) => e.key === 'Enter' && doLog(ex, n)}
                                  />
                                </>
                              )}
                              <button
                                type="button"
                                className="tp-check tp-press"
                                data-done={!!c}
                                data-ready={!c && n === done.length + 1}
                                onClick={() => (c ? undo(ex, c) : doLog(ex, n))}
                                aria-label={c ? t('trainee.player.unlog', { n }) : t('trainee.player.log', { n })}
                              >
                                <Check className="h-6 w-6" strokeWidth={3} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setExtra((x) => ({ ...x, [ex.id]: (x[ex.id] ?? 0) + 1 }))} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">
                          <Plus className="h-4 w-4" />{t('trainee.player.addSet')}
                        </button>
                        <button type="button" onClick={() => setHistory(ex)} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">
                          <History className="h-4 w-4" />{t('trainee.player.history')}
                        </button>
                        {(ex.exercise?.instructions || ex.exercise?.description || ex.video_url || ex.exercise?.video_url || (ex.exercise && exerciseFrames(ex.exercise).length > 0)) && (
                          <button type="button" onClick={() => setInfo(ex)} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">
                            <Info className="h-4 w-4" />{t('trainee.player.howTo')}
                          </button>
                        )}
                      </div>
                      {prev && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          {t('trainee.player.lastTime', { date: fmtDate(prev.date) })}{' '}
                          <span dir="ltr" className="inline-block">{prev.sets.map((s) => `${fmtNum(s.weight_used, 1)}×${s.reps_completed}`).join('  ')}</span>
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/85 backdrop-blur-xl lg:start-[264px]" style={{ paddingBottom: 'max(.75rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pt-3 sm:px-6">
          {session?.is_completed ? (
            <>
              <span className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-[hsl(var(--tp-ok))]"><Trophy className="h-5 w-5 flex-none" /><span className="truncate">{t('trainee.player.completedToday')}</span></span>
              <button type="button" onClick={() => finish.mutate({ dayId, completed: false })} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">
                <RotateCcw className="h-4 w-4" />{t('trainee.player.reopen')}
              </button>
            </>
          ) : (
            <>
              <div className="hidden min-w-0 flex-1 sm:block">
                <p className="text-sm font-semibold">{allDone ? t('trainee.player.allDone') : t('trainee.today.setsLogged', { done: doneCount, total: totalTarget })}</p>
              </div>
              <button
                type="button"
                onClick={doFinish}
                disabled={finish.isPending}
                className={cn('tp-btn tp-press w-full sm:w-auto', allDone || doneCount > 0 ? 'tp-btn--primary' : 'tp-btn--ghost', allDone && 'animate-pulse motion-reduce:animate-none')}
              >
                <Flag className="h-5 w-5" />
                {t('trainee.player.finish')}
              </button>
            </>
          )}
        </div>
      </div>

      {rest && <RestTimer rest={rest} onChange={setRest} />}

      <Sheet open={!!info} onOpenChange={(o) => !o && setInfo(null)} title={info?.exercise?.name || info?.exercise_name || ''} description={[info?.exercise?.muscle_group, info?.exercise?.equipment_needed].filter(Boolean).join(' · ') || undefined}>
        {info && <ExerciseInfo ex={info} />}
      </Sheet>
      <Sheet open={!!history} onOpenChange={(o) => !o && setHistory(null)} title={t('trainee.player.historyTitle')} description={history?.exercise?.name || history?.exercise_name || undefined}>
        {history && <ExerciseHistory sessions={sessionsQ.data ?? []} exId={history.id} />}
      </Sheet>

      {celebrate && <Celebration stats={celebrate} dayName={day.name} onClose={() => { setCelebrate(null); navigate('/'); }} onStay={() => setCelebrate(null)} />}
    </>
  );
};

const RestTimer: React.FC<{ rest: NonNullable<Rest>; onChange: (r: Rest) => void }> = ({ rest, onChange }) => {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  const buzzed = useRef(false);
  useEffect(() => {
    buzzed.current = false;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [rest.endsAt]);
  const left = Math.max(0, (rest.endsAt - now) / 1000);
  useEffect(() => {
    if (left <= 0 && !buzzed.current) {
      buzzed.current = true;
      haptic([40, 80, 40]);
      const id = window.setTimeout(() => onChange(null), 2500);
      return () => window.clearTimeout(id);
    }
  }, [left, onChange]);
  const over = left <= 0;
  return (
    <div className="tp-rest" role="timer" aria-live="polite">
      <div className={cn('tp-card flex items-center gap-3 rounded-[1.5rem] p-2.5 pe-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,.9)]', over && 'ring-2 ring-[hsl(var(--tp-ok))]')}>
        <Ring value={left / rest.total} size={52} stroke={5} color={over ? 'hsl(var(--tp-ok))' : undefined}>
          <span className="tp-num text-xs" dir="ltr">{over ? <Check className="h-5 w-5 text-[hsl(var(--tp-ok))]" /> : Math.ceil(left)}</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{over ? t('trainee.player.restOver') : t('trainee.player.resting')}</p>
          <p className="tp-num text-2xl leading-none" dir="ltr" style={{ textAlign: 'inherit' }}>{fmtClock(left)}</p>
        </div>
        {!over && (
          <>
            <button type="button" onClick={() => onChange({ ...rest, endsAt: rest.endsAt + 15000, total: rest.total + 15 })} className="tp-icon-btn tp-press text-xs font-bold" aria-label={t('trainee.player.add15')}>
              <span dir="ltr">+15</span>
            </button>
            <button type="button" onClick={() => onChange(null)} className="tp-icon-btn tp-press" aria-label={t('trainee.player.skipRest')}>
              <SkipForward className="h-5 w-5 rtl:-scale-x-100" />
            </button>
          </>
        )}
        {over && (
          <button type="button" onClick={() => onChange(null)} className="tp-icon-btn tp-press" aria-label={t('trainee.common.close')}>
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
};

const ExerciseInfo: React.FC<{ ex: WorkoutExercise }> = ({ ex }) => {
  const { t } = useTranslation();
  const url = ex.video_url || ex.exercise?.video_url;
  const yt = youtubeId(url);
  const frames = ex.exercise ? exerciseFrames(ex.exercise) : [];
  return (
    <div className="space-y-4 pb-2">
      {frames.length > 0 && <ExerciseDemo frames={frames} alt={ex.exercise?.name || ''} className="aspect-[4/3] w-full rounded-2xl" playing />}
      {yt ? (
        <div className="aspect-video overflow-hidden rounded-2xl bg-black">
          <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${yt}`} title={ex.exercise?.name || 'video'} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      ) : url ? (
        <video className="w-full rounded-2xl bg-black" src={url} controls playsInline />
      ) : null}
      {ex.exercise?.description && <p className="text-sm leading-relaxed" dir="auto">{ex.exercise.description}</p>}
      {ex.exercise?.instructions && (
        <div>
          <p className="tp-label mb-1">{t('trainee.player.instructions')}</p>
          <p className="whitespace-pre-line text-sm leading-relaxed" dir="auto">{ex.exercise.instructions}</p>
        </div>
      )}
    </div>
  );
};

const ExerciseHistory: React.FC<{ sessions: WorkoutSession[]; exId: number }> = ({ sessions, exId }) => {
  const { t } = useTranslation();
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
        <span className="tp-num text-2xl" dir="ltr">{fmtNum(best, 1)} kg</span>
      </div>
      {rows.map(({ s, sets }) => (
        <div key={s.id} className="rounded-2xl bg-foreground/[.05] p-3">
          <p className="mb-2 text-sm font-semibold">{fmtDate(s.started_at, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <div className="flex flex-wrap gap-1.5" dir="ltr">
            {sets.map((c) => (
              <span key={c.id} className={cn('tp-chip', c.weight_used === best && 'tp-chip--primary')}>{fmtNum(c.weight_used, 1)} × {c.reps_completed}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const Celebration: React.FC<{ stats: { minutes: number; sets: number; volume: number; prs: number }; dayName: string; onClose: () => void; onStay: () => void }> = ({ stats, dayName, onClose, onStay }) => {
  const { t } = useTranslation();
  const pieces = useMemo(
    () => Array.from({ length: 42 }, (_, i) => ({ r: `${(i * 360) / 42 + (i % 3) * 7}deg`, dist: `${-140 - (i % 7) * 34}px`, d: (i % 6) * 40 })),
    [],
  );
  return (
    <div className="tp-celebrate" role="dialog" aria-modal="true" aria-labelledby="tp-done-title">
      <div className="tp-burst" aria-hidden>
        {pieces.map((p, i) => <i key={i} style={{ ['--r' as string]: p.r, ['--dist' as string]: p.dist, ['--d' as string]: p.d }} />)}
      </div>
      <div className="tp-card tp-pop relative w-full max-w-md p-6 text-center sm:p-8">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-[1.6rem] bg-primary text-primary-foreground shadow-[0_20px_40px_-16px_hsl(var(--primary))]">
          <Trophy className="h-10 w-10" />
        </span>
        <p className="tp-label mt-5">{dayName}</p>
        <h2 id="tp-done-title" className="tp-title mt-1 text-6xl">{t('trainee.player.doneTitle')}</h2>
        <p className="mt-2 text-muted-foreground">{t('trainee.player.doneBody')}</p>
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
        {stats.prs > 0 && <p className="tp-chip tp-chip--primary mt-4">{t('trainee.player.records', { count: stats.prs })}</p>}
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" onClick={onClose} className="tp-btn tp-btn--primary tp-press w-full">{t('trainee.player.backToday')}</button>
          <button type="button" onClick={onStay} className="tp-btn tp-btn--ghost tp-press w-full">{t('trainee.player.stay')}</button>
        </div>
      </div>
    </div>
  );
};

export default WorkoutPlayer;
