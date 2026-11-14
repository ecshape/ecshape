import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, ArrowRight, Check, ClipboardCheck, Clock, Dumbbell, Flame, MessageCircle, Play, Scale, Sparkles, Trophy, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  activePlan, computeUpNext, useCheckInSummary, useCheckInToday, useConversations, useMealCompletions, useMealDay, usePlans, useProgress, useSessions,
} from './hooks';
import { Bar, CountUp, EmptyState, ErrorState, Ring, Screen, Skel, Sparkline } from './ui';
import CheckInSheet from './CheckInSheet';
import { fmtDate, fmtNum, fmtRelative, fmtSigned, parseDate, todayISO } from './format';

const greetingKey = () => {
  const h = new Date().getHours();
  if (h < 5) return 'trainee.today.greetNight';
  if (h < 12) return 'trainee.today.greetMorning';
  if (h < 18) return 'trainee.today.greetAfternoon';
  return 'trainee.today.greetEvening';
};

const readSeen = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeSeen = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

/** Shows a one-time banner when the coach changed the training or meal plan since the last visit. */
function useCoachUpdates(planSig: string | null, mealSig: string | null) {
  const [dismissed, setDismissed] = useState(0);
  return useMemo(() => {
    const out: ('plan' | 'meals')[] = [];
    const check = (key: string, sig: string | null, kind: 'plan' | 'meals') => {
      if (!sig) return;
      const seen = readSeen(key);
      if (seen === null) writeSeen(key, sig);
      else if (seen !== sig) out.push(kind);
    };
    check('tp.seen.plan', planSig, 'plan');
    check('tp.seen.meals', mealSig, 'meals');
    return {
      updates: out,
      dismiss: () => {
        if (planSig) writeSeen('tp.seen.plan', planSig);
        if (mealSig) writeSeen('tp.seen.meals', mealSig);
        setDismissed((n) => n + 1);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSig, mealSig, dismissed]);
}

const TodayScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const Forward = i18n.language?.startsWith('he') ? ArrowLeft : ArrowRight;
  const today = todayISO();

  const plans = usePlans(true);
  const sessions = useSessions(true);
  const mealDay = useMealDay(today, true);
  const completions = useMealCompletions(today, true);
  const checkIn = useCheckInToday(true);
  const summary = useCheckInSummary();
  const progress = useProgress();
  const convs = useConversations(true);
  const [checkInOpen, setCheckInOpen] = useState(false);

  const plan = activePlan(plans.data);
  const upNext = computeUpNext(plan, sessions.data);
  const firstName = (user?.full_name || '').split(' ')[0];

  const planSig = plan ? `${plan.id}:${plan.updated_at || plan.created_at || ''}:${plan.workout_days.length}` : null;
  const mealSig = mealDay.data?.meal_plan_name ? `${mealDay.data.meal_plan_name}:${mealDay.data.slots.length}` : null;
  const { updates, dismiss } = useCoachUpdates(planSig, mealSig);

  const weights = (progress.data ?? []).filter((e) => typeof e.weight === 'number') as { weight: number; date: string }[];
  const lastWeight = weights.length ? weights[weights.length - 1] : null;
  const monthAgo = Date.now() - 30 * 86400000;
  const baseline = weights.find((w) => (parseDate(w.date)?.getTime() ?? 0) >= monthAgo) ?? weights[0];
  const weightDelta = lastWeight && baseline && baseline !== lastWeight ? lastWeight.weight - baseline.weight : null;

  const conv = convs.data?.[0];
  const lastMsg = conv?.last_message;
  const unread = conv?.unread_count ?? 0;

  const macros = mealDay.data?.daily_macros;
  const slots = mealDay.data?.slots ?? [];
  const doneSlots = new Set((completions.data ?? []).filter((c) => c.is_completed).map((c) => c.meal_slot_id));
  const nextMeal = [...slots].sort((a, b) => a.order_index - b.order_index).find((s) => !doneSlots.has(s.meal_slot_id));

  const workoutLoading = plans.isLoading || sessions.isLoading;

  return (
    <Screen wide>
      <header className="mb-6 lg:mb-8">
        <p className="tp-label tp-rise">{fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="tp-title tp-rise mt-2 text-[3.1rem] sm:text-6xl lg:text-7xl" style={{ ['--i' as string]: 1 }}>
          {t(greetingKey())}
          {firstName && <span className="text-primary">{i18n.language?.startsWith('he') ? ' ' : ', '}{firstName}</span>}
        </h1>
      </header>

      {updates.length > 0 && (
        <div className="tp-card tp-rise mb-4 flex items-center gap-3 p-3 pe-2 sm:p-4" role="status">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t('trainee.today.coachUpdated')}</p>
            <p className="text-sm text-muted-foreground">
              {updates.map((u) => t(u === 'plan' ? 'trainee.today.updatedPlan' : 'trainee.today.updatedMeals')).join(' · ')}
            </p>
          </div>
          <button type="button" onClick={() => { dismiss(); navigate(updates[0] === 'plan' ? '/training' : '/meals'); }} className="tp-btn tp-btn--ghost tp-btn--sm tp-press hidden sm:inline-flex">
            {t('trainee.today.see')}
          </button>
          <button type="button" onClick={dismiss} className="tp-icon-btn tp-press bg-transparent" aria-label={t('trainee.common.dismiss')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Workout hero */}
        <section className="tp-rise lg:col-span-7" style={{ ['--i' as string]: 2 }} aria-label={t('trainee.today.workout')}>
          {workoutLoading ? (
            <Skel className="h-[260px] rounded-[1.5rem]" />
          ) : plans.isError || sessions.isError ? (
            <ErrorState onRetry={() => { plans.refetch(); sessions.refetch(); }} className="h-full" />
          ) : upNext.kind === 'none' ? (
            <EmptyState icon={Dumbbell} title={t('trainee.today.noPlanTitle')} body={t('trainee.today.noPlanBody')} className="h-full" />
          ) : (
            <WorkoutHero upNext={upNext} onGo={() => navigate(`/training/day/${upNext.day.id}`)} Forward={Forward} />
          )}
        </section>

        {/* Nutrition */}
        <section className="tp-rise lg:col-span-5" style={{ ['--i' as string]: 3 }}>
          {mealDay.isLoading ? (
            <Skel className="h-[260px] rounded-[1.5rem]" />
          ) : mealDay.isError ? (
            <ErrorState onRetry={() => mealDay.refetch()} className="h-full" />
          ) : !slots.length ? (
            <EmptyState icon={Flame} title={t('trainee.today.noMealsTitle')} body={t('trainee.today.noMealsBody')} className="h-full" />
          ) : (
            <button type="button" onClick={() => navigate('/meals')} className="tp-card tp-press flex h-full w-full flex-col p-5 text-start sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <span className="tp-label">{t('trainee.today.nutrition')}</span>
                <span className="tp-chip">{t('trainee.today.mealsDone', { done: doneSlots.size, total: slots.length })}</span>
              </div>
              <div className="mt-4 flex items-center gap-5">
                <Ring value={(macros?.consumed.calories ?? 0) / (macros?.targets.calories || 1)} size={118} stroke={11}>
                  <div>
                    <CountUp value={Math.round(macros?.consumed.calories ?? 0)} className="tp-num block text-[1.75rem] leading-none" />
                    <span className="mt-1 block text-[11px] text-muted-foreground">/ {fmtNum(macros?.targets.calories ?? 0)} {t('trainee.common.kcal')}</span>
                  </div>
                </Ring>
                <div className="min-w-0 flex-1 space-y-3">
                  {([
                    ['protein', 'trainee.macros.protein', 'hsl(var(--tp-protein))'],
                    ['carbs', 'trainee.macros.carbs', 'hsl(var(--tp-carbs))'],
                    ['fat', 'trainee.macros.fat', 'hsl(var(--tp-fat))'],
                  ] as const).map(([k, label, color]) => (
                    <div key={k}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                        <span className="font-semibold">{t(label)}</span>
                        <span className="text-muted-foreground" dir="ltr">{fmtNum(macros?.consumed[k] ?? 0)}/{fmtNum(macros?.targets[k] ?? 0)}g</span>
                      </div>
                      <Bar value={(macros?.consumed[k] ?? 0) / (macros?.targets[k] || 1)} color={color} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/50 pt-4 mt-5">
                {nextMeal ? (
                  <span className="min-w-0 text-sm">
                    <span className="text-muted-foreground">{t('trainee.today.nextMeal')} </span>
                    <span className="font-semibold">{nextMeal.name}</span>
                    {nextMeal.time_suggestion && <span className="text-muted-foreground"> · <bdi dir="ltr">{nextMeal.time_suggestion}</bdi></span>}
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--tp-ok))]"><Check className="h-4 w-4" />{t('trainee.today.allMealsDone')}</span>
                )}
                <Forward className="h-5 w-5 flex-none text-muted-foreground" />
              </div>
            </button>
          )}
        </section>

        {/* Check-in */}
        <section className="tp-rise lg:col-span-4" style={{ ['--i' as string]: 4 }}>
          {checkIn.isLoading ? (
            <Skel className="h-[190px] rounded-[1.5rem]" />
          ) : checkIn.data ? (
            <div className="tp-card flex h-full flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="tp-label">{t('trainee.today.checkin')}</span>
                <span className="tp-chip tp-chip--ok"><Check className="h-3.5 w-3.5" />{t('trainee.today.checkinDone')}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label={t('trainee.checkin.weightShort')} value={checkIn.data.weight ? fmtNum(checkIn.data.weight, 1) : '–'} />
                <Metric label={t('trainee.checkin.stepsShort')} value={checkIn.data.steps ? fmtNum(checkIn.data.steps) : '–'} />
                <Metric label={t('trainee.checkin.sleepShort')} value={checkIn.data.sleep_hours ? fmtNum(checkIn.data.sleep_hours) : '–'} />
              </div>
              {!!summary.data?.current_streak && (
                <p className="mt-auto pt-4 text-sm text-muted-foreground">
                  <Trophy className="me-1.5 inline h-4 w-4 text-[hsl(var(--gold))]" />
                  {t('trainee.today.streak', { count: summary.data.current_streak })}
                </p>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => setCheckInOpen(true)} className="tp-card tp-card--hero tp-press flex h-full w-full flex-col p-5 text-start">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_24px_-12px_hsl(var(--primary))]">
                <ClipboardCheck className="h-6 w-6" />
              </span>
              <span className="tp-title mt-4 text-[2rem]">{t('trainee.today.checkinCta')}</span>
              <span className="mt-1 text-sm text-muted-foreground">{t('trainee.today.checkinHint')}</span>
              {summary.data && (
                <span className="mt-auto pt-4 text-xs text-muted-foreground">{t('trainee.today.last7', { count: summary.data.last_7_days_completion })}</span>
              )}
            </button>
          )}
        </section>

        {/* Weight */}
        <section className="tp-rise lg:col-span-4" style={{ ['--i' as string]: 5 }}>
          {progress.isLoading ? (
            <Skel className="h-[190px] rounded-[1.5rem]" />
          ) : (
            <button type="button" onClick={() => navigate('/progress')} className="tp-card tp-press flex h-full w-full flex-col p-5 text-start">
              <div className="flex items-center justify-between">
                <span className="tp-label">{t('trainee.today.weight')}</span>
                <Scale className="h-5 w-5 text-muted-foreground" />
              </div>
              {lastWeight ? (
                <>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <CountUp value={lastWeight.weight} digits={1} className="tp-num text-[2.6rem] leading-none" />
                      <span className="ms-1 text-sm text-muted-foreground">{t('trainee.common.kg')}</span>
                    </div>
                    {weightDelta !== null && (
                      <span className={cn('tp-chip', weightDelta <= 0 ? 'tp-chip--ok' : 'tp-chip--primary')}>
                        <bdi dir="ltr">{fmtSigned(weightDelta)}</bdi> {t('trainee.common.kg')}
                      </span>
                    )}
                  </div>
                  <Sparkline values={weights.slice(-10).map((w) => w.weight)} className="mt-3" height={48} />
                  <span className="mt-2 text-xs text-muted-foreground">{t('trainee.today.lastWeighIn', { when: fmtRelative(lastWeight.date) })}</span>
                </>
              ) : (
                <span className="mt-4 text-sm text-muted-foreground">{t('trainee.today.noWeight')}</span>
              )}
            </button>
          )}
        </section>

        {/* Coach */}
        <section className="tp-rise lg:col-span-4" style={{ ['--i' as string]: 6 }}>
          {convs.isLoading ? (
            <Skel className="h-[190px] rounded-[1.5rem]" />
          ) : (
            <button type="button" onClick={() => navigate('/chat')} className="tp-card tp-press flex h-full w-full flex-col p-5 text-start">
              <div className="flex items-center justify-between gap-2">
                <span className="tp-label">{t('trainee.today.coach')}</span>
                {unread > 0 ? <span className="tp-chip tp-chip--primary">{t('trainee.today.unread', { count: unread })}</span> : <MessageCircle className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-foreground/10 text-sm font-bold">
                  {(conv?.client_name || 'C').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{conv?.client_name || t('trainee.today.yourCoach')}</span>
                  {lastMsg && <span className="block text-xs text-muted-foreground">{fmtRelative(lastMsg.created_at)}</span>}
                </span>
              </div>
              <p className={cn('mt-3 line-clamp-2 text-sm', unread ? 'font-semibold text-foreground' : 'text-muted-foreground')} dir="auto">
                {lastMsg ? `${lastMsg.sender_id === user?.id ? `${t('trainee.today.you')}: ` : ''}${lastMsg.message}` : t('trainee.today.noMessages')}
              </p>
            </button>
          )}
        </section>
      </div>

      <CheckInSheet open={checkInOpen} onOpenChange={setCheckInOpen} lastWeight={lastWeight?.weight} />
    </Screen>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl bg-foreground/[.05] px-2 py-3">
    <div className="tp-num text-2xl leading-none">{value}</div>
    <div className="mt-1 truncate text-[11px] text-muted-foreground">{label}</div>
  </div>
);

const WorkoutHero: React.FC<{
  upNext: Exclude<ReturnType<typeof computeUpNext>, { kind: 'none' }>;
  onGo: () => void;
  Forward: React.ElementType;
}> = ({ upNext, onGo, Forward }) => {
  const { t } = useTranslation();
  const { day, session, kind } = upNext;
  const totalSets = day.workout_exercises.reduce((n, e) => n + (e.target_sets || 0), 0);
  const doneSets = session?.set_completions.length ?? 0;
  const label = kind === 'continue' ? 'trainee.today.inProgress' : kind === 'done' ? 'trainee.today.doneToday' : 'trainee.today.upNext';
  return (
    <button type="button" onClick={onGo} className="tp-card tp-card--accent tp-press relative flex h-full min-h-[260px] w-full flex-col overflow-hidden p-5 text-start sm:p-7">
      <Dumbbell className="pointer-events-none absolute -bottom-10 -end-8 h-56 w-56 -rotate-12 text-white/[.06]" aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <span className="tp-chip tp-chip--onaccent">
          {kind === 'done' ? <Trophy className="h-3.5 w-3.5" /> : <Dumbbell className="h-3.5 w-3.5" />}
          {t(label)}
        </span>
        {day.estimated_duration ? (
          <span className="flex items-center gap-1 text-sm text-white/85"><Clock className="h-4 w-4" />{t('trainee.common.minutes', { count: day.estimated_duration })}</span>
        ) : null}
      </div>
      <h2 className="tp-title mt-5 break-words text-[3.4rem] sm:text-7xl">{day.name}</h2>
      <p className="mt-1 text-white/80">
        {t('trainee.common.exercises', { count: day.workout_exercises.length })} · {t('trainee.common.sets', { count: totalSets })}
      </p>
      <div className="relative mt-auto pt-6">
        {kind === 'continue' && (
          <div className="mb-4">
            <div className="mb-1.5 flex justify-between text-sm text-white/85">
              <span>{t('trainee.today.setsLogged', { done: doneSets, total: totalSets })}</span>
              <span dir="ltr">{Math.round((doneSets / (totalSets || 1)) * 100)}%</span>
            </div>
            <Bar value={doneSets / (totalSets || 1)} />
          </div>
        )}
        {kind === 'done' && session && (
          <p className="mb-4 text-sm text-white/90">
            {t('trainee.today.doneSummary', { sets: session.set_completions.length, minutes: session.duration_minutes || 0 })}
          </p>
        )}
        <span className={cn('tp-btn', kind === 'done' ? 'bg-white/15 text-white' : 'tp-btn--light')}>
          {kind === 'done' ? <Check className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
          {t(kind === 'continue' ? 'trainee.today.continue' : kind === 'done' ? 'trainee.today.review' : 'trainee.today.start')}
          <Forward className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
};

export default TodayScreen;
