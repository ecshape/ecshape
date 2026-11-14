import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Dumbbell, Play, Quote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { activePlan, completedThisWeek, computeUpNext, lastCompleted, sortExercises, sortedDays, todaySessionFor, usePlans, useSessions } from './hooks';
import { EmptyState, ErrorState, Screen, Skel } from './ui';
import { fmtNum, fmtRelative, parseDate, weekStart } from './format';
import BodyMap from './BodyMap';
import { dayGoal, dayLoad } from './training/muscles';
import { freqLabel, goalLabel, TrainingNav, useTT } from './training/shared';

/** Training tab: the coach's routines (workout days), SmartGym style, with a one-tap session start. */
const TrainingScreen: React.FC = () => {
  const { t, tt } = useTT();
  const navigate = useNavigate();
  const plans = usePlans(true);
  const sessions = useSessions(true);
  const plan = activePlan(plans.data);
  const days = sortedDays(plan);
  const upNext = computeUpNext(plan, sessions.data);

  const header = (
    <header className="mb-5">
      <p className="tp-label tp-rise">{plan?.name || t('trainee.training.eyebrow')}</p>
      <h1 className="tp-title tp-rise mt-2 text-[2.9rem] sm:text-6xl" style={{ ['--i' as string]: 1 }}>{tt('routines.title')}</h1>
      <TrainingNav className="tp-rise mt-4 max-w-md" />
    </header>
  );

  if (plans.isLoading || sessions.isLoading) {
    return (
      <Screen>
        {header}
        <Skel className="h-28" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">{[0, 1, 2].map((i) => <Skel key={i} className="h-36" />)}</div>
      </Screen>
    );
  }
  if (plans.isError) return <Screen>{header}<ErrorState onRetry={() => plans.refetch()} /></Screen>;
  if (!plan || !days.length) {
    return (
      <Screen>
        {header}
        <EmptyState icon={Dumbbell} title={t('trainee.today.noPlanTitle')} body={t('trainee.today.noPlanBody')} />
      </Screen>
    );
  }

  const all = sessions.data ?? [];
  const dayIds = new Set(days.map((d) => d.id));
  const ws = weekStart().getTime();
  const doneThisWeek = all.filter((s) => s.is_completed && dayIds.has(s.workout_day_id) && (parseDate(s.completed_at || s.started_at)?.getTime() ?? 0) >= ws).length;
  const target = plan.days_per_week || days.length;
  const heroDay = upNext.kind === 'none' ? days[0] : upNext.day;
  const heroSub =
    upNext.kind === 'continue' ? tt('hero.continue', { name: heroDay.name })
      : upNext.kind === 'done' ? tt('hero.doneToday', { name: heroDay.name })
        : tt('hero.next', { name: heroDay.name });

  return (
    <Screen>
      {header}

      {plan.notes && (
        <figure className="tp-rise mb-5 flex gap-3" style={{ ['--i' as string]: 2 }}>
          <Quote className="mt-1 h-5 w-5 flex-none text-primary rtl:-scale-x-100" aria-hidden />
          <div className="min-w-0">
            <p className="tp-label">{tt('routines.fromCoach')}</p>
            <blockquote className="mt-1 line-clamp-4 whitespace-pre-line text-[1.05rem] italic leading-relaxed text-foreground/90" dir="auto">{plan.notes}</blockquote>
          </div>
        </figure>
      )}

      <button
        type="button"
        onClick={() => navigate(upNext.kind === 'done' ? `/training/day/${heroDay.id}` : `/training/day/${heroDay.id}/session`)}
        className="tr-hero tr-grad tp-press tp-rise flex w-full items-center gap-4 p-5 text-start sm:p-6"
        style={{ ['--i' as string]: 3 }}
      >
        <span className="relative z-[1] min-w-0 flex-1">
          <span className="block text-[1.45rem] font-extrabold leading-tight sm:text-2xl">
            {upNext.kind === 'continue' ? tt('hero.continueTitle') : upNext.kind === 'done' ? tt('hero.doneTitle') : tt('hero.title')}
          </span>
          <span className="mt-1 block truncate text-sm text-white/85" dir="auto">{heroSub}</span>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-black/20 px-2.5 py-1 text-xs font-bold">
            <span dir="ltr">{fmtNum(doneThisWeek)}/{fmtNum(target)}</span> {tt('hero.thisWeek')}
          </span>
        </span>
        <span className="tr-play relative z-[1]" aria-hidden>
          {upNext.kind === 'done' ? <Check className="h-6 w-6" /> : <Play className="h-6 w-6 fill-current rtl:-scale-x-100" />}
        </span>
      </button>

      <div className="mb-3 mt-8 flex items-center gap-2">
        <h2 className="tp-title text-[1.9rem] sm:text-4xl">{tt('routines.list')}</h2>
        <InfoTip label={tt('routines.list')}>{tt('routines.listHelp')}</InfoTip>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {days.map((day, i) => {
          const exs = sortExercises(day);
          const goal = dayGoal(exs);
          const isNext = upNext.kind !== 'none' && upNext.kind !== 'done' && upNext.day.id === day.id;
          const live = todaySessionFor(all, day.id);
          const inProgress = live && !live.is_completed && live.set_completions.length > 0;
          const doneWeek = completedThisWeek(all, day.id);
          const last = lastCompleted(all, day.id);
          return (
            <button
              key={day.id}
              type="button"
              onClick={() => navigate(`/training/day/${day.id}`)}
              className={cn('tp-card tp-press tp-rise tr-routine w-full', isNext && 'ring-2 ring-primary/80')}
              style={{ ['--i' as string]: 4 + i }}
            >
              <span className="flex-none rounded-2xl bg-foreground/[.04] p-1.5">
                <BodyMap load={dayLoad(exs)} size="thumb" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="tr-goal block truncate">{goalLabel(tt, goal)}</span>
                <span className="tp-title mt-0.5 block break-words text-[2.1rem]" dir="auto">{day.name}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{freqLabel(tt, plan)}</span>
                <span className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="tp-chip">{t('trainee.common.exercises', { count: exs.length })}</span>
                  {isNext && !inProgress && <span className="tp-chip tp-chip--primary">{t('trainee.today.upNext')}</span>}
                  {inProgress && <span className="tp-chip tp-chip--primary">{t('trainee.today.inProgress')}</span>}
                  {doneWeek && <span className="tp-chip tp-chip--ok"><Check className="h-3 w-3" />{t('trainee.training.doneThisWeek')}</span>}
                </span>
                {last && <span className="mt-1.5 block text-xs text-muted-foreground">{t('trainee.training.lastDone', { when: fmtRelative(last.completed_at || last.started_at) })}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </Screen>
  );
};

export default TrainingScreen;
