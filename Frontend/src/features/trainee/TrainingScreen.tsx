import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, Clock, Dumbbell, NotebookPen, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  activePlan, completedThisWeek, computeUpNext, lastCompleted, sortExercises, sortedDays, todaySessionFor, usePlans, useSessions,
} from './hooks';
import { CountUp, EmptyState, ErrorState, Screen, ScreenHeader, SectionTitle, Skel } from './ui';
import { dayOf, fmtDate, fmtNum, fmtRelative, fmtWeekday, isoDay, parseDate, todayISO, weekStart } from './format';

const TrainingScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const Forward = i18n.language?.startsWith('he') ? ArrowLeft : ArrowRight;
  const plans = usePlans(true);
  const sessions = useSessions(true);
  const plan = activePlan(plans.data);
  const days = sortedDays(plan);
  const upNext = computeUpNext(plan, sessions.data);

  if (plans.isLoading || sessions.isLoading) {
    return (
      <Screen>
        <Skel className="mb-3 h-4 w-32" />
        <Skel className="mb-8 h-16 w-64" />
        <div className="grid grid-cols-3 gap-3"><Skel className="h-24" /><Skel className="h-24" /><Skel className="h-24" /></div>
        <div className="mt-8 space-y-3">{[0, 1, 2].map((i) => <Skel key={i} className="h-28" />)}</div>
      </Screen>
    );
  }
  if (plans.isError) return <Screen><ErrorState onRetry={() => plans.refetch()} /></Screen>;
  if (!plan || !days.length) {
    return (
      <Screen>
        <ScreenHeader eyebrow={t('trainee.training.eyebrow')} title={t('trainee.training.title')} />
        <EmptyState icon={Dumbbell} title={t('trainee.today.noPlanTitle')} body={t('trainee.today.noPlanBody')} />
      </Screen>
    );
  }

  const all = sessions.data ?? [];
  const dayIds = new Set(days.map((d) => d.id));
  const ws = weekStart();
  const completed = all.filter((s) => s.is_completed && dayIds.has(s.workout_day_id));
  const doneThisWeek = completed.filter((s) => (parseDate(s.completed_at || s.started_at)?.getTime() ?? 0) >= ws.getTime()).length;
  const doneDates = new Set(completed.map((s) => dayOf(s.completed_at || s.started_at)));
  const startDate = parseDate(plan.start_date || plan.created_at);
  const weekNo = startDate ? Math.max(1, Math.floor((Date.now() - startDate.getTime()) / (7 * 86400000)) + 1) : null;
  const target = plan.days_per_week || days.length;
  const recent = [...completed].sort((a, b) => (parseDate(b.started_at)?.getTime() ?? 0) - (parseDate(a.started_at)?.getTime() ?? 0)).slice(0, 5);
  const today = todayISO();

  return (
    <Screen>
      <ScreenHeader eyebrow={t('trainee.training.eyebrow')} title={plan.name} />
      {plan.description && <p className="-mt-3 mb-6 max-w-xl text-muted-foreground" dir="auto">{plan.description}</p>}

      <div className="tp-rise grid grid-cols-3 gap-2 sm:gap-3" style={{ ['--i' as string]: 2 }}>
        <Stat label={t('trainee.training.thisWeek')} value={<><CountUp value={doneThisWeek} /><span className="text-muted-foreground">/{fmtNum(target)}</span></>} />
        <Stat
          label={t('trainee.training.week')}
          value={weekNo ? <><CountUp value={Math.min(weekNo, plan.duration_weeks || weekNo)} />{plan.duration_weeks ? <span className="text-muted-foreground">/{fmtNum(plan.duration_weeks)}</span> : null}</> : '–'}
        />
        <Stat label={t('trainee.training.total')} value={<CountUp value={completed.length} />} />
      </div>

      {/* Week strip */}
      <div className="tp-card tp-rise mt-3 grid grid-cols-7 gap-1 p-2 sm:p-3" style={{ ['--i' as string]: 3 }} aria-label={t('trainee.training.weekStrip')}>
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i);
          const iso = isoDay(d);
          const done = doneDates.has(iso);
          const isToday = iso === today;
          return (
            <div key={iso} className={cn('flex flex-col items-center gap-1.5 rounded-2xl py-2', isToday && 'bg-foreground/[.06]')}>
              <span className={cn('text-[11px] font-semibold', isToday ? 'text-primary' : 'text-muted-foreground')}>{fmtWeekday(d, 'narrow')}</span>
              <span className={cn('grid h-8 w-8 place-items-center rounded-full text-sm font-bold', done ? 'bg-primary text-primary-foreground' : isToday ? 'ring-2 ring-primary/60' : 'bg-foreground/[.06] text-muted-foreground')}>
                {done ? <Check className="h-4 w-4" /> : d.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {plan.notes && (
        <div className="tp-card tp-rise mt-3 flex gap-3 p-4" style={{ ['--i' as string]: 4 }}>
          <NotebookPen className="mt-0.5 h-5 w-5 flex-none text-primary" />
          <div className="min-w-0">
            <p className="tp-label">{t('trainee.training.coachNotes')}</p>
            <p className="mt-1 whitespace-pre-line text-sm" dir="auto">{plan.notes}</p>
          </div>
        </div>
      )}

      <SectionTitle>{t('trainee.training.days')}</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {days.map((day, i) => {
          const isNext = upNext.kind !== 'none' && upNext.day.id === day.id && upNext.kind !== 'done';
          const live = todaySessionFor(all, day.id);
          const inProgress = live && !live.is_completed && live.set_completions.length > 0;
          const doneWeek = completedThisWeek(all, day.id);
          const last = lastCompleted(all, day.id);
          const exs = sortExercises(day);
          const sets = exs.reduce((n, e) => n + (e.target_sets || 0), 0);
          return (
            <button
              key={day.id}
              type="button"
              onClick={() => navigate(`/training/day/${day.id}`)}
              className={cn('tp-card tp-press tp-rise group flex w-full flex-col p-4 text-start sm:p-5', isNext && 'ring-2 ring-primary')}
              style={{ ['--i' as string]: 4 + i }}
            >
              <div className="flex items-start gap-4">
                <span className={cn('tp-num grid h-14 w-14 flex-none place-items-center rounded-2xl text-2xl', doneWeek ? 'bg-primary text-primary-foreground' : 'bg-foreground/[.07]')} dir="ltr">
                  {doneWeek ? <Check className="h-6 w-6" /> : String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="tp-title break-words text-[2rem]">{day.name}</h3>
                    {isNext && !inProgress && <span className="tp-chip tp-chip--primary">{t('trainee.today.upNext')}</span>}
                    {inProgress && <span className="tp-chip tp-chip--primary">{t('trainee.today.inProgress')}</span>}
                    {doneWeek && <span className="tp-chip tp-chip--ok">{t('trainee.training.doneThisWeek')}</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t('trainee.common.exercises', { count: exs.length })} · {t('trainee.common.sets', { count: sets })}
                    {day.estimated_duration ? <> · <Clock className="mb-0.5 inline h-3.5 w-3.5" /> {t('trainee.common.minutes', { count: day.estimated_duration })}</> : null}
                  </p>
                </div>
                <span className={cn('grid h-11 w-11 flex-none place-items-center rounded-full transition-colors', isNext ? 'bg-primary text-primary-foreground' : 'bg-foreground/[.07] group-hover:bg-foreground/[.12]')}>
                  {isNext ? <Play className="h-4 w-4 fill-current" /> : <Forward className="h-4 w-4" />}
                </span>
              </div>
              <p className="mt-3 line-clamp-1 text-sm text-foreground/75" dir="auto">
                {exs.map((e) => e.exercise?.name || e.exercise_name).filter(Boolean).join(' · ')}
              </p>
              {last && <p className="mt-1 text-xs text-muted-foreground">{t('trainee.training.lastDone', { when: fmtRelative(last.completed_at || last.started_at) })}</p>}
            </button>
          );
        })}
      </div>

      {recent.length > 0 && (
        <>
          <SectionTitle>{t('trainee.training.history')}</SectionTitle>
          <div className="tp-card divide-y divide-border/50">
            {recent.map((s) => {
              const day = days.find((d) => d.id === s.workout_day_id);
              const volume = s.set_completions.reduce((v, c) => v + (c.weight_used || 0) * (c.reps_completed || 0), 0);
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-foreground/[.06] text-center leading-none">
                    <span>
                      <span className="tp-num block text-lg">{parseDate(s.started_at)?.getDate()}</span>
                      <span className="block text-[10px] text-muted-foreground">{fmtDate(s.started_at, { month: 'short' })}</span>
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{day?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('trainee.common.sets', { count: s.set_completions.length })}
                      {s.duration_minutes ? ` · ${t('trainee.common.minutes', { count: s.duration_minutes })}` : ''}
                    </p>
                  </div>
                  {volume > 0 && (
                    <span className="text-end">
                      <span className="tp-num block text-lg leading-none">{fmtNum(volume)}</span>
                      <span className="text-[11px] text-muted-foreground">{t('trainee.training.volumeKg')}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Screen>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="tp-card px-3 py-4 sm:px-5">
    <div className="tp-num text-[1.9rem] leading-none sm:text-4xl"><span dir="ltr" className="inline-block">{value}</span></div>
    <div className="mt-1.5 truncate text-xs text-muted-foreground sm:text-sm">{label}</div>
  </div>
);

export default TrainingScreen;
