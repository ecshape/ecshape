import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ClipboardList, Compass, History, LineChart, Ruler } from 'lucide-react';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import type { LibraryExercise } from '@/lib/exerciseLibrary';
import { api } from '../api';
import { todayISO } from '../format';
import type { SetCompletion, WorkoutExercise, WorkoutPlan, WorkoutSession } from '../types';
import { dayFrequency, muscleKey, type Goal, type Region } from './muscles';
import './i18n';
import './training.css';

/** t() scoped to trainee.training2 plus the usual helpers. */
export const useTT = () => {
  const { t, i18n } = useTranslation();
  const tt = (k: string, o?: Record<string, unknown>) => String(t(`trainee.training2.${k}`, o as never));
  const rtl = !!i18n.language?.startsWith('he');
  return { t, tt, i18n, rtl, lang: (i18n.language || 'he').slice(0, 2) };
};

type TT = ReturnType<typeof useTT>['tt'];

export const muscleLabel = (tt: TT, m: string) => tt(`muscle.${muscleKey(m)}`, { defaultValue: m.replace(/_/g, ' ') });
export const regionLabel = (tt: TT, r: Region) => tt(`region.${r}`);
export const goalLabel = (tt: TT, g: Goal | null) => (g ? tt(`goal.${g}`) : tt('goal.general'));
export const freqLabel = (tt: TT, plan: WorkoutPlan | null | undefined) => {
  const f = dayFrequency(plan);
  return f.kind === 'times' ? tt('freq.times', { count: f.count }) : tt('freq.rotation', { count: f.perWeek });
};

/** Segmented sub navigation (Routines / History / Explore, Overview / Measures). Icon-only under 360px. */
export const SubNav: React.FC<{ items: { to: string; label: string; icon: React.ElementType; match?: (p: string) => boolean }[]; className?: string; label: string }> = ({
  items, className, label,
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <nav className={`tt-seg ${className ?? ''}`} aria-label={label}>
      {items.map((it) => {
        const on = it.match ? it.match(pathname) : pathname === it.to;
        return (
          <button key={it.to} type="button" className="tp-press" aria-current={on ? 'page' : undefined} onClick={() => !on && navigate(it.to)}>
            <it.icon className="h-4 w-4 flex-none" aria-hidden />
            <span className="truncate max-[359px]:sr-only">{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export const TrainingNav: React.FC<{ className?: string }> = ({ className }) => {
  const { tt } = useTT();
  return (
    <SubNav
      className={className}
      label={tt('nav.label')}
      items={[
        { to: '/training', label: tt('nav.routines'), icon: ClipboardList },
        { to: '/training/history', label: tt('nav.history'), icon: History, match: (p) => p.startsWith('/training/history') },
        { to: '/training/explore', label: tt('nav.explore'), icon: Compass },
      ]}
    />
  );
};

export const ProgressNav: React.FC<{ className?: string }> = ({ className }) => {
  const { tt } = useTT();
  return (
    <SubNav
      className={className}
      label={tt('nav.progressLabel')}
      items={[
        { to: '/progress', label: tt('nav.overview'), icon: LineChart },
        { to: '/progress/measures', label: tt('nav.measures'), icon: Ruler },
      ]}
    />
  );
};

/** Client-only page in the trainee shell (trainers and admins go to their dashboards). */
export const TraineePage: React.FC<{ current: string; immersive?: boolean; children: React.ReactNode }> = ({ current, immersive, children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (user?.role === 'ADMIN') navigate('/admin', { replace: true });
    else if (user?.role === 'TRAINER') navigate('/trainer-dashboard', { replace: true });
  }, [user, navigate]);
  if (!user || user.role !== 'CLIENT') return null;
  return <Layout currentPage={current} immersive={immersive}>{children}</Layout>;
};

/* ------------------------------------------------------------------ data */

/** All plans, including past ones (history needs their exercise names). */
export function usePlansAll() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['trainee', 'plans', 'all'],
    enabled: !!user?.id,
    staleTime: 60_000,
    // include_history: the archive of removed days / exercises, so old sessions still show their names
    queryFn: () => api<WorkoutPlan[]>(`/v2/workouts/plans?client_id=${user!.id}&active_only=false&include_history=true`),
  });
}

export function useLibraryBrowse(q: string, muscle: string) {
  return useInfiniteQuery({
    queryKey: ['trainee', 'library', q, muscle],
    initialPageParam: 0,
    staleTime: 10 * 60_000,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ offset: String(pageParam), limit: '24' });
      if (q.trim()) qs.set('q', q.trim());
      if (muscle) qs.set('muscle', muscle);
      return api<{ total: number; items: LibraryExercise[] }>(`/exercise-library/browse?${qs}`);
    },
    getNextPageParam: (last, pages) => {
      const n = pages.reduce((a, p) => a + p.items.length, 0);
      return n < last.total ? n : undefined;
    },
  });
}

/** workout_exercise_id -> exercise row, across all plans. */
export const exerciseIndex = (plans?: WorkoutPlan[] | null) => {
  const m = new Map<number, WorkoutExercise & { dayName: string }>();
  for (const p of plans ?? []) for (const d of p.workout_days) for (const e of d.workout_exercises) m.set(e.id, { ...e, dayName: d.name });
  return m;
};

export const dayIndex = (plans?: WorkoutPlan[] | null) => {
  const m = new Map<number, { name: string; planName: string }>();
  for (const p of plans ?? []) for (const d of p.workout_days) m.set(d.id, { name: d.name, planName: p.name });
  return m;
};

export const setVolume = (c: Pick<SetCompletion, 'weight_used' | 'reps_completed'>) => (c.weight_used || 0) * (c.reps_completed || 0);
export const sessionVolume = (s: WorkoutSession) => s.set_completions.reduce((v, c) => v + setVolume(c), 0);
/** Estimated one-rep max (Epley). */
export const e1rm = (c: Pick<SetCompletion, 'weight_used' | 'reps_completed'>) => (c.weight_used || 0) * (1 + (c.reps_completed || 0) / 30);

/* ------------------------------------------------------------------ local session start */

const startKey = (dayId: number) => `ec.tr.start.${dayId}.${todayISO()}`;

/** When the trainee pressed "Start workout session" today (local clock, so the timer never drifts with server time zones). */
export const sessionStart = {
  get(dayId: number): number | null {
    try {
      const v = Number(localStorage.getItem(startKey(dayId)));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      return null;
    }
  },
  set(dayId: number, ms = Date.now()) {
    try {
      localStorage.setItem(startKey(dayId), String(ms));
    } catch {
      /* storage unavailable */
    }
    return ms;
  },
  clear(dayId: number) {
    try {
      localStorage.removeItem(startKey(dayId));
    } catch {
      /* storage unavailable */
    }
  },
};
