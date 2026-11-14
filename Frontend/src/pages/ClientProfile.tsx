import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, Bell, BellRing, CalendarDays, ClipboardCheck, Clock, Dumbbell, Flame, Heart, History,
  LayoutDashboard, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Ruler, Scale, Target, Trash2, TrendingUp,
  User, Utensils, UtensilsCrossed,
} from 'lucide-react';
import Layout from '../components/Layout';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config/api';
import ClientWeightProgress from '../components/ClientWeightProgress';
import MealHistory from '../components/MealHistory';
import { CheckInsPanel, type CheckInSummaryData } from '@/features/trainer/CheckInsPanel';
import ClientExerciseHistoryMatrix from '../components/ClientExerciseHistoryMatrix';
import NutritionProfileCard from '../components/meals/NutritionProfileCard';
import { cn } from '@/lib/utils';
import { api } from '@/features/trainee/api';
import { dayOf, fmtDate, fmtNum, fmtRelative, fmtSigned, parseDate } from '@/features/trainee/format';
import type { WorkoutSession } from '@/features/trainee/types';
import { ActionBtn, Avatar, BackLink, CountUp, EmptyState, Ring, SectionCard, Skel, TabStrip } from '@/features/trainer/ui';
import TrendChart from '@/features/trainer/TrendChart';

interface Client {
  id: number;
  username: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
  profile?: {
    weight?: number;
    height?: number;
    goals?: string;
    injuries?: string;
    preferences?: string;
    phone?: string;
    address?: string;
    emergency_contact?: string;
  };
}

interface WorkoutPlan {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  updated_at?: string;
  sessions_count?: number;
  completed_sessions?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workout_days?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exercises?: any[];
}

interface MealPlanFoodOption { name: string; name_hebrew?: string }
interface MealPlanMacroCategory { macro_type: 'protein' | 'carb' | 'fat'; quantity_instruction?: string; food_options?: MealPlanFoodOption[] }
interface MealPlanSlot { id?: number; name: string; order_index?: number; time_suggestion?: string; macro_categories?: MealPlanMacroCategory[] }

interface MealPlan {
  id: number;
  title?: string;
  name?: string;
  description?: string;
  total_calories?: number;
  protein_target?: number;
  carb_target?: number;
  fat_target?: number;
  is_active?: boolean;
  created_at: string;
  updated_at?: string;
  meal_slots?: MealPlanSlot[];
}

interface ProgressEntry {
  id: number;
  weight?: number;
  body_fat?: number;
  photo_path?: string;
  photos?: Array<{ id: number; photo_path: string; photo_type: string }>;
  notes?: string;
  recorded_at: string;
  created_at?: string;
  chest?: number;
  waist?: number;
  hips?: number;
  thighs?: number;
  arms?: number;
  right_arm?: number;
  left_arm?: number;
}

interface CheckInSummary {
  today_status: string;
  current_streak: number;
  last_7_days_completion: number;
  completion_rate: number;
  avg_weight?: number | null;
  avg_steps?: number | null;
  avg_sleep_hours?: number | null;
  total_check_ins: number;
  last_check_in?: string | null;
}

type TabId = 'overview' | 'profile' | 'progress' | 'workouts' | 'workoutHistory' | 'meals' | 'nutrition' | 'checkins' | 'notifications';

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

/** API datetimes without a zone are UTC on this endpoint (last_login). */
const utcDate = (value: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);

const ClientProfile = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isStaff = user?.role === 'TRAINER' || user?.role === 'ADMIN';

  const initialTab = (params.get('tab') as TabId) || 'overview';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const [client, setClient] = useState<Client | null>(null);
  const [workoutPlans, setWorkoutPlans] = useState<WorkoutPlan[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [progressEntries, setProgressEntries] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mealPlanToDelete, setMealPlanToDelete] = useState<MealPlan | null>(null);
  const [workoutPlanToDelete, setWorkoutPlanToDelete] = useState<WorkoutPlan | null>(null);
  const [actionError, setActionError] = useState('');
  const [checkInSummary, setCheckInSummary] = useState<CheckInSummary | null>(null);
  const [notificationMode, setNotificationMode] = useState<'EVERYTHING' | 'WEEKLY_DIGEST'>('WEEKLY_DIGEST');
  const [notificationSettingLoading, setNotificationSettingLoading] = useState(false);
  const [notificationSettingSaving, setNotificationSettingSaving] = useState(false);

  const changeTab = (tab: TabId) => {
    setActiveTab(tab);
    const next = new URLSearchParams(params);
    if (tab === 'overview') next.delete('tab');
    else next.set('tab', tab);
    setParams(next, { replace: true, state: location.state });
  };

  const historyExerciseOptions = useMemo(() => {
    const activePlan = workoutPlans.length > 0 ? workoutPlans[0] : null;
    if (!activePlan?.exercises) return [];
    const seen = new Set<number>();
    const options: { workout_exercise_id: number; exercise_id: number; exercise_name: string; workout_day_name?: string }[] = [];
    for (const ex of activePlan.exercises) {
      if (seen.has(ex.id)) continue;
      seen.add(ex.id);
      options.push({ workout_exercise_id: ex.id, exercise_id: ex.exercise_id, exercise_name: ex.exercise_name, workout_day_name: ex.workout_day_name });
    }
    return options;
  }, [workoutPlans]);

  const fetchClientData = async () => {
    try {
      const headers = authHeaders();
      if (location.state?.client) {
        setClient(location.state.client);
      } else if (clientId) {
        const response = await fetch(`${API_BASE_URL}/users/${clientId}`, { headers });
        if (response.ok) setClient(await response.json());
      }

      if (clientId && isStaff) {
        setNotificationSettingLoading(true);
        try {
          const notifRes = await fetch(`${API_BASE_URL}/notifications/settings/${clientId}`, { headers });
          if (notifRes.ok) {
            const notifData = await notifRes.json();
            setNotificationMode(notifData.mode === 'EVERYTHING' ? 'EVERYTHING' : 'WEEKLY_DIGEST');
          }
        } catch {
          // keep default
        } finally {
          setNotificationSettingLoading(false);
        }
      }

      if (clientId) {
        const [workoutRes, mealRes, progressRes, checkInSummaryRes] = await Promise.all([
          fetch(`${API_BASE_URL}/v2/workouts/plans?client_id=${clientId}`, { headers }),
          fetch(`${API_BASE_URL}/v2/meals/plans?client_id=${clientId}`, { headers }),
          fetch(`${API_BASE_URL}/progress/?client_id=${clientId}`, { headers }),
          fetch(`${API_BASE_URL}/check-ins/summary?client_id=${clientId}`, { headers }).catch(() => null),
        ]);

        const workoutData = workoutRes.ok ? await workoutRes.json() : [];
        const mealData = mealRes.ok ? await mealRes.json() : [];
        const progressData = progressRes.ok ? await progressRes.json() : [];
        if (checkInSummaryRes?.ok) {
          try {
            setCheckInSummary(await checkInSummaryRes.json());
          } catch (e) {
            console.error('Error parsing check-in summary:', e);
          }
        }

        const byRecent = (a: { updated_at?: string; created_at?: string }, b: { updated_at?: string; created_at?: string }) =>
          new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const normalizedWorkouts = Array.isArray(workoutData) ? workoutData.filter((p: any) => p.is_active !== false).sort(byRecent) : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transformedWorkouts = normalizedWorkouts.map((plan: any) => ({
          ...plan,
          exercises:
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            plan.workout_days?.flatMap((day: any) =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (day.workout_exercises || []).map((ex: any) => ({
                ...ex,
                exercise_name: ex.exercise_name || ex.name,
                sets: ex.target_sets,
                reps: ex.target_reps,
                rest_time: ex.rest_seconds,
                workout_day_name: day.name,
              })),
            ) || [],
          sessions_count: plan.workout_days?.length || 0,
          completed_sessions: 0,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const normalizedMealPlans = Array.isArray(mealData) ? mealData.filter((p: any) => p.is_active !== false).sort(byRecent) : [];

        setWorkoutPlans(transformedWorkouts.slice(0, 1));
        setMealPlans(normalizedMealPlans.slice(0, 1));
        setProgressEntries(Array.isArray(progressData) ? progressData : []);
      }
    } catch (error) {
      console.error('Error fetching client data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, location.state]);

  const sessionsQ = useQuery({
    queryKey: ['trainer', 'client-sessions', clientId],
    enabled: !!clientId && isStaff,
    queryFn: () => api<WorkoutSession[]>(`/v2/workouts/sessions?client_id=${clientId}`).catch(() => [] as WorkoutSession[]),
  });

  const checkInsQ = useQuery({
    queryKey: ['trainer', 'client-check-ins', clientId],
    enabled: !!clientId,
    queryFn: () => api<{ id: number; date: string; weight?: number | null }[]>(`/check-ins?client_id=${clientId}`).catch(() => []),
  });

  const handleCreateWorkout = () => navigate('/create-workout-plan-v2', { state: { client } });
  const handleEditClient = () => navigate(`/client/${clientId}/edit`, { state: { client } });

  if (loading) {
    return (
      <Layout currentPage="dashboard">
        <div className="tr-page" aria-busy="true" aria-label={t('common.loading')}>
          <Skel className="mb-5 h-10 w-28 rounded-full" />
          <Skel className="mb-5 h-64 rounded-[1.5rem]" />
          <Skel className="mb-5 h-12 w-full max-w-2xl rounded-full" />
          <div className="tr-grid-2"><Skel className="h-64 rounded-[1.5rem]" /><Skel className="h-64 rounded-[1.5rem]" /></div>
        </div>
      </Layout>
    );
  }

  if (!client) {
    return (
      <Layout currentPage="dashboard">
        <div className="tr-page tr-page--narrow">
          <EmptyState
            icon={User}
            title={t('trainer.common.notFoundTitle')}
            body={t('clientProfile.clientNotFound')}
            action={<button type="button" className="tp-btn tp-btn--primary tp-press" onClick={() => navigate('/trainer-dashboard')}>{t('clientProfile.backToDashboard')}</button>}
          />
        </div>
      </Layout>
    );
  }

  // Weigh-ins come from progress entries and daily check-ins; one point per day, progress entries win.
  const weightByDay = new Map<string, { t: number; v: number }>();
  for (const c of checkInsQ.data ?? []) {
    const d = parseDate(c.date);
    if (c.weight && d) weightByDay.set(dayOf(c.date), { t: d.getTime(), v: Number(c.weight) });
  }
  for (const e of progressEntries) {
    const d = parseDate(e.recorded_at);
    if (e.weight && d) weightByDay.set(dayOf(e.recorded_at), { t: d.getTime(), v: Number(e.weight) });
  }
  const weights = [...weightByDay.values()].sort((a, b) => a.t - b.t);
  const latestWeight = weights.length ? weights[weights.length - 1].v : null;
  const weightDelta = weights.length > 1 ? weights[weights.length - 1].v - weights[0].v : null;

  const normalizedProgressEntries = progressEntries.map((entry) => ({
    id: entry.id,
    client_id: client.id,
    date: entry.recorded_at || '',
    weight: entry.weight ?? 0,
    photo_path: entry.photo_path,
    photos: entry.photos || (entry.photo_path ? [{ id: 0, photo_path: entry.photo_path, photo_type: 'front' }] : undefined),
    notes: entry.notes,
    chest: entry.chest,
    waist: entry.waist,
    hips: entry.hips,
    thighs: entry.thighs,
    arms: entry.arms,
    right_arm: entry.right_arm,
    left_arm: entry.left_arm,
    created_at: entry.created_at || entry.recorded_at || '',
  }));

  const activeMealPlan = mealPlans[0] ?? null;
  const activeWorkoutPlan = workoutPlans[0] ?? null;

  const openMealPlanEditor = () => navigate('/trainer-weekly-meals-v3', { state: activeMealPlan ? { client, mealPlan: activeMealPlan } : { client } });
  const handleEditWorkoutPlan = () => {
    if (!activeWorkoutPlan) return handleCreateWorkout();
    navigate('/create-workout-plan-v2', { state: { client, workoutPlan: activeWorkoutPlan } });
  };

  const handleDeleteMealPlan = async () => {
    if (!mealPlanToDelete) return;
    try {
      const response = await fetch(`${API_BASE_URL}/v2/meals/plans/${mealPlanToDelete.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!response.ok) throw new Error('Failed to delete meal plan');
      await fetchClientData();
      setMealPlanToDelete(null);
    } catch (error) {
      console.error('Error deleting meal plan:', error);
      setActionError(t('meals.deleteMealPlanError', 'Failed to delete meal plan. Please try again.'));
    }
  };

  const handleDeleteWorkoutPlan = async () => {
    if (!workoutPlanToDelete) return;
    try {
      const response = await fetch(`${API_BASE_URL}/v2/workouts/plans/${workoutPlanToDelete.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!response.ok) throw new Error('Failed to delete workout plan');
      await fetchClientData();
      setWorkoutPlanToDelete(null);
    } catch (error) {
      console.error('Error deleting workout plan:', error);
      setActionError(t('clientProfile.deleteWorkoutError') || 'Failed to delete workout plan');
    }
  };

  const handleNotificationModeChange = async (mode: 'EVERYTHING' | 'WEEKLY_DIGEST') => {
    if (!clientId || mode === notificationMode) return;
    setNotificationSettingSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/settings/${clientId}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ mode }) });
      if (res.ok) setNotificationMode(mode);
    } finally {
      setNotificationSettingSaving(false);
    }
  };

  const lastLogin = client.last_login ? utcDate(client.last_login) : null;
  const memberSince = fmtDate(client.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
  const rate7 = checkInSummary ? checkInSummary.last_7_days_completion / 7 : 0;

  const tabs: { id: TabId; label: string; icon: React.ElementType; staff?: boolean }[] = [
    { id: 'overview', label: t('trainer.client.tabs.overview'), icon: LayoutDashboard },
    { id: 'profile', label: t('clientProfile.profile', 'Profile'), icon: User },
    { id: 'progress', label: t('clientProfile.weightProgress'), icon: TrendingUp },
    { id: 'workouts', label: t('clientProfile.workoutPlans'), icon: Dumbbell },
    { id: 'workoutHistory', label: t('clientProfile.workoutHistory'), icon: History, staff: true },
    { id: 'meals', label: t('clientProfile.mealPlans'), icon: UtensilsCrossed },
    { id: 'nutrition', label: t('clientProfile.nutritionHistory'), icon: Utensils },
    { id: 'checkins', label: t('checkIn.trainer.tabTitle'), icon: ClipboardCheck },
    { id: 'notifications', label: t('notifications.tabTitle', 'Notifications'), icon: Bell, staff: true },
  ];
  const visibleTabs = tabs.filter((tab) => !tab.staff || isStaff);
  const tab = visibleTabs.some((x) => x.id === activeTab) ? activeTab : 'overview';

  return (
    <Layout currentPage="dashboard">
      <div className="tr-page">
        <BackLink to="/trainer-dashboard" className="mb-4" />

        {/* Hero */}
        <section className="tp-card tp-card--hero tr-hero tp-rise mb-5">
          <div className="tr-hero-grid">
            <div className="flex min-w-0 items-center gap-4 sm:gap-5">
              <Avatar name={client.full_name} seed={client.id} size={84} src={(client as { avatar_url?: string | null }).avatar_url} />
              <div className="min-w-0">
                <p className="tp-label">{t('clientProfile.title')}</p>
                <h1 className="tp-title mt-1 break-words text-5xl sm:text-6xl">{client.full_name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {client.is_active ? (
                    <span className="tp-chip tp-chip--ok"><span className="tr-live" aria-hidden />{t('trainer.client.active')}</span>
                  ) : (
                    <span className="tp-chip">{t('trainer.dash.filter.inactive')}</span>
                  )}
                  <span className="tp-chip"><Clock className="h-3.5 w-3.5" />{lastLogin ? t('trainer.client.lastSeen', { when: fmtRelative(lastLogin) }) : t('clientProfile.never')}</span>
                  <span className="tp-chip"><CalendarDays className="h-3.5 w-3.5" />{t('trainer.client.since', { date: memberSince })}</span>
                </div>
              </div>
            </div>
            <div className="tr-actions flex flex-wrap gap-2 max-sm:flex-nowrap">
              {isStaff && <ActionBtn icon={MessageCircle} label={t('trainer.dash.message')} onClick={() => navigate(`/chat?clientId=${client.id}`)} />}
              <ActionBtn icon={Pencil} label={t('clientProfile.editProfile')} onClick={handleEditClient} />
              <button type="button" className="tp-btn tp-btn--primary tp-btn--sm tp-press max-sm:min-w-0 max-sm:flex-1" onClick={handleEditWorkoutPlan}>
                {activeWorkoutPlan ? <Dumbbell className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {activeWorkoutPlan ? t('clientProfile.updateWorkoutPlan') : t('clientProfile.createWorkout')}
              </button>
            </div>
          </div>

          <div className="tr-hero-stats mt-6">
            <div className="tr-stat">
              <p className="tp-label">{t('clientProfile.currentWeight')}</p>
              <p className="tr-stat-v mt-1">
                {latestWeight ? <><CountUp value={latestWeight} digits={1} /> <span className="text-sm text-muted-foreground">{t('trainer.common.kg')}</span></> : '–'}
              </p>
              {weightDelta !== null && <p className={cn('text-xs font-bold', weightDelta <= 0 ? 'text-[hsl(var(--tr-ok))]' : 'text-primary')}><span dir="ltr">{fmtSigned(weightDelta)}</span> {t('trainer.common.kg')}</p>}
            </div>
            <div className="tr-stat">
              <p className="tp-label">{t('trainer.client.streak')}</p>
              <p className="tr-stat-v mt-1 flex items-center gap-1.5"><Flame className="h-5 w-5 text-primary" /><CountUp value={checkInSummary?.current_streak ?? 0} /></p>
              <p className="text-xs text-muted-foreground">{t('trainer.client.days')}</p>
            </div>
            <div className="tr-stat flex items-center justify-between gap-2">
              <div>
                <p className="tp-label">{t('trainer.client.week')}</p>
                <p className="tr-stat-v mt-1" dir="ltr">{checkInSummary?.last_7_days_completion ?? 0}/7</p>
                <p className="text-xs text-muted-foreground">{t('trainer.client.checkIns')}</p>
              </div>
              <Ring value={rate7} size={50} stroke={6} color="hsl(var(--tr-ok))" />
            </div>
            <div className="tr-stat">
              <p className="tp-label">{t('clientProfile.activePlans')}</p>
              <p className="tr-stat-v mt-1"><CountUp value={workoutPlans.length + mealPlans.length} /></p>
              <p className="text-xs text-muted-foreground">{[activeWorkoutPlan && t('trainer.client.training'), activeMealPlan && t('trainer.client.nutrition')].filter(Boolean).join(' · ') || t('trainer.client.noPlans')}</p>
            </div>
          </div>
        </section>

        {actionError && <div className="tr-banner tr-banner--error mb-4" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />{actionError}</div>}

        <div className="tr-tabs">
          <TabStrip<TabId> value={tab} onChange={changeTab} items={visibleTabs} label={t('clientProfile.title')} idPrefix="cp" />
        </div>

        <div id="cp-panel" role="tabpanel" aria-labelledby={`cp-${tab}`} className="tr-tabpanel mt-4" key={tab}>
          {tab === 'overview' && (
            <Overview
              client={client}
              weights={weights}
              summary={checkInSummary}
              sessions={sessionsQ.data ?? []}
              sessionsLoading={sessionsQ.isLoading}
              progress={progressEntries}
              workoutPlan={activeWorkoutPlan}
              mealPlan={activeMealPlan}
              onTab={changeTab}
            />
          )}

          {tab === 'profile' && (
            <div className="tr-grid-2">
              <SectionCard icon={User} title={t('clientProfile.basicInformation', 'Basic Information')}>
                <dl className="tr-dl">
                  <Row icon={Mail} label={t('clientProfile.email')} value={<span dir="ltr">{client.email}</span>} />
                  <Row label={t('clientProfile.username', 'Username')} value={<span dir="ltr">{client.username}</span>} />
                  <Row label={t('clientProfile.fullName', 'Full Name')} value={client.full_name} />
                  <Row label={t('clientProfile.memberSince', 'Member Since')} value={memberSince} />
                  {client.profile?.phone && <Row icon={Phone} label={t('clientProfile.phone')} value={<span dir="ltr">{client.profile.phone}</span>} />}
                  {client.profile?.address && <Row icon={MapPin} label={t('clientProfile.address')} value={client.profile.address} />}
                  {client.profile?.emergency_contact && <Row icon={Heart} label={t('clientProfile.emergencyContact')} value={client.profile.emergency_contact} />}
                </dl>
              </SectionCard>
              <SectionCard icon={Ruler} title={t('clientProfile.physicalInformation', 'Physical Information')} info={t('tt.info.physical')}>
                <dl className="tr-dl">
                  <Row icon={Scale} label={t('clientProfile.currentWeight', 'Current Weight')} value={latestWeight ? `${fmtNum(latestWeight, 1)} ${t('trainer.common.kg')}` : t('clientProfile.notRecorded', 'Not recorded')} />
                  <Row icon={Ruler} label={t('clientProfile.height', 'Height')} value={client.profile?.height ? `${client.profile.height} ${t('trainer.common.cm')}` : t('clientProfile.notRecorded', 'Not recorded')} />
                  {client.profile?.weight ? <Row icon={Target} label={t('clientProfile.targetWeight', 'Target Weight')} value={`${client.profile.weight} ${t('trainer.common.kg')}`} /> : null}
                </dl>
              </SectionCard>
              <SectionCard icon={Target} title={t('clientProfile.goalsAndPreferences', 'Goals & Preferences')} info={t('tt.info.goals')} className="col-span-full">
                <dl className="tr-dl">
                  <Row label={t('clientProfile.goals', 'Fitness Goals')} value={client.profile?.goals || t('clientProfile.notSpecified', 'Not specified')} />
                  <Row label={t('clientProfile.preferences', 'Preferences')} value={client.profile?.preferences || t('clientProfile.notSpecified', 'Not specified')} />
                  <Row
                    icon={AlertTriangle}
                    label={t('clientProfile.injuries', 'Injuries / Medical Conditions')}
                    value={<span className={client.profile?.injuries ? 'text-primary' : ''}>{client.profile?.injuries || t('clientProfile.noneReported', 'None reported')}</span>}
                  />
                </dl>
              </SectionCard>
            </div>
          )}

          {tab === 'progress' && (
            <div className="tr-legacy">
              <ClientWeightProgress clientId={clientId!} progressEntries={normalizedProgressEntries} onProgressUpdate={fetchClientData} isTrainer={user?.role === 'TRAINER'} />
            </div>
          )}

          {tab === 'workouts' && (
            activeWorkoutPlan ? (
              <SectionCard
                icon={Dumbbell}
                title={activeWorkoutPlan.name}
                info={t('tt.info.workoutPlan')}
                action={
                  <div className="flex items-center gap-1">
                    <span className="tp-chip tp-chip--primary me-1 hidden sm:inline-flex">{t('clientProfile.activePlan')}</span>
                    <button type="button" className="tp-icon-btn tp-press" onClick={handleEditWorkoutPlan} aria-label={t('clientProfile.updateWorkoutPlan')} title={t('clientProfile.updateWorkoutPlan')} data-testid="workout-plan-action">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="tp-icon-btn tp-press hover:!bg-[hsl(var(--tr-bad)/.14)] hover:text-[hsl(var(--tr-bad))]" onClick={() => setWorkoutPlanToDelete(activeWorkoutPlan)} aria-label={t('clientProfile.deleteWorkout')} title={t('clientProfile.deleteWorkout')}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                }
              >
                <div data-testid="workout-plan-card" dir={i18n.language === 'he' ? 'rtl' : 'ltr'}>
                  {activeWorkoutPlan.description && <p className="-mt-2 mb-4 text-sm text-muted-foreground">{activeWorkoutPlan.description}</p>}
                  {activeWorkoutPlan.workout_days?.length ? (
                    <div className="tr-grid-3">
                      {activeWorkoutPlan.workout_days.map((day, di) => (
                        <div key={day.id || day.order_index} className="tp-rise rounded-[1.25rem] bg-foreground/[.04] p-4 shadow-[inset_0_0_0_1px_hsl(var(--foreground)/.06)]" style={{ ['--i' as string]: di }}>
                          <div className="mb-3 flex items-center gap-3">
                            <span className="tr-day-num bg-gradient-to-br from-[#F59532] to-[#D8361E] text-white">{di + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-bold" dir="auto">{day.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {t('trainer.client.exercisesCount', { count: day.workout_exercises?.length ?? 0 })}
                                {day.estimated_duration ? ` · ${day.estimated_duration} ${t('clientProfile.minutesShort')}` : ''}
                              </p>
                            </div>
                          </div>
                          {day.workout_exercises?.length ? (
                            <ol className="space-y-1.5">
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {day.workout_exercises.map((exercise: any, ei: number) => (
                                <li key={exercise.id || exercise.order_index} className="flex gap-2.5 rounded-xl bg-background/60 px-3 py-2">
                                  <span className="w-4 flex-none pt-0.5 text-xs font-bold tabular-nums text-muted-foreground">{ei + 1}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold">{exercise.exercise?.name || exercise.exercise_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {[
                                        exercise.target_sets ? t('clientProfile.setsShort', { count: exercise.target_sets }) : null,
                                        exercise.target_reps || null,
                                        exercise.rest_seconds ? t('clientProfile.restShort', { seconds: exercise.rest_seconds }) : null,
                                      ].filter(Boolean).join(' · ') || t('clientProfile.noWorkoutDetails')}
                                    </p>
                                    {exercise.notes ? <p className="mt-0.5 text-xs text-primary">{t('clientProfile.notePrefix')} {exercise.notes}</p> : null}
                                  </div>
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <p className="text-xs text-muted-foreground">{t('clientProfile.noWorkoutPlanExercises')}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('clientProfile.noWorkoutPlanExercises')}</p>
                  )}
                </div>
              </SectionCard>
            ) : (
              <div data-testid="workout-plan-empty">
                <EmptyState
                  icon={Dumbbell}
                  title={t('clientProfile.noWorkoutPlanTitle')}
                  body={t('clientProfile.noWorkoutPlanDescription')}
                  action={<button type="button" data-testid="workout-plan-action" className="tp-btn tp-btn--primary tp-press" onClick={handleCreateWorkout}><Plus className="h-4 w-4" />{t('clientProfile.createNewWorkout')}</button>}
                />
              </div>
            )
          )}

          {tab === 'workoutHistory' && isStaff && (
            activeWorkoutPlan ? (
              <div className="tr-legacy"><ClientExerciseHistoryMatrix clientId={Number(clientId)} exercises={historyExerciseOptions} /></div>
            ) : (
              <EmptyState icon={History} title={t('clientProfile.noWorkoutPlanTitle')} body={t('clientProfile.noWorkoutPlanDescription')} />
            )
          )}

          {tab === 'meals' && (
            <div className="space-y-4">
              {clientId && <div className="tr-legacy"><NutritionProfileCard clientId={clientId} /></div>}
              {activeMealPlan ? (
                <SectionCard
                  icon={UtensilsCrossed}
                  title={activeMealPlan.name || activeMealPlan.title}
                  info={t('tt.info.mealPlan')}
                  action={
                    <div className="flex items-center gap-1">
                      <span className="tp-chip tp-chip--primary me-1 hidden sm:inline-flex">{t('clientProfile.activePlan')}</span>
                      <button type="button" className="tp-icon-btn tp-press" onClick={openMealPlanEditor} aria-label={t('clientProfile.updateMealPlan')} title={t('clientProfile.updateMealPlan')}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" className="tp-icon-btn tp-press hover:!bg-[hsl(var(--tr-bad)/.14)] hover:text-[hsl(var(--tr-bad))]" onClick={() => setMealPlanToDelete(activeMealPlan)} aria-label={t('meals.deleteMealPlan')} title={t('meals.deleteMealPlan')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  }
                >
                  {activeMealPlan.description && <p className="-mt-2 mb-3 text-sm text-muted-foreground">{activeMealPlan.description}</p>}
                  <div className="mb-4 flex flex-wrap gap-2">
                    {activeMealPlan.total_calories ? <span className="tp-chip tp-chip--primary"><Flame className="h-3.5 w-3.5" />{fmtNum(activeMealPlan.total_calories)} {t('meals.calories')}</span> : null}
                    {activeMealPlan.protein_target ? <span className="tp-chip">{activeMealPlan.protein_target}g {t('meals.protein')}</span> : null}
                    {activeMealPlan.carb_target ? <span className="tp-chip">{activeMealPlan.carb_target}g {t('meals.carbs')}</span> : null}
                    {activeMealPlan.fat_target ? <span className="tp-chip">{activeMealPlan.fat_target}g {t('meals.fat')}</span> : null}
                    <span className="tp-chip"><Clock className="h-3.5 w-3.5" />{t('clientProfile.lastUpdated')} {fmtDate(activeMealPlan.updated_at || activeMealPlan.created_at)}</span>
                  </div>
                  {activeMealPlan.meal_slots?.length ? (
                    <div className="tr-grid-3">
                      {activeMealPlan.meal_slots.map((meal, index) => (
                        <div key={meal.id || index} className="tp-rise rounded-[1.25rem] bg-foreground/[.04] p-4 shadow-[inset_0_0_0_1px_hsl(var(--foreground)/.06)]" style={{ ['--i' as string]: index }}>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <h4 className="font-bold">{meal.name}</h4>
                            {meal.time_suggestion && <span className="tp-chip">{meal.time_suggestion}</span>}
                          </div>
                          <div className="space-y-2">
                            {meal.macro_categories?.map((macro, mi) => (
                              <div key={mi} className="text-sm">
                                <span className="font-semibold">{t(`meals.${macro.macro_type === 'carb' ? 'carbs' : macro.macro_type}`, macro.macro_type)}: </span>
                                <span className="text-muted-foreground">{macro.quantity_instruction || t('clientProfile.noQuantitySet')}</span>
                                {!!macro.food_options?.length && (
                                  <span className="block text-xs text-muted-foreground">{macro.food_options.map((f) => f.name_hebrew || f.name).join(' · ')}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('clientProfile.noMealsConfigured')}</p>
                  )}
                  <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press mt-4" onClick={() => navigate(`/client/${client.id}/favorites`)}>
                    <Heart className="h-4 w-4" />{t('meals.favorites.title', 'Favorite foods')}
                  </button>
                </SectionCard>
              ) : (
                <EmptyState
                  icon={UtensilsCrossed}
                  title={t('clientProfile.noMealPlanTitle')}
                  body={t('clientProfile.noMealPlanDescription')}
                  action={<button type="button" className="tp-btn tp-btn--primary tp-press" onClick={openMealPlanEditor}><Plus className="h-4 w-4" />{t('clientProfile.createNewMealPlan')}</button>}
                />
              )}
            </div>
          )}

          {tab === 'nutrition' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press" onClick={openMealPlanEditor}>
                  <Utensils className="h-4 w-4" />
                  {activeMealPlan ? t('clientProfile.updateMealPlan') : t('clientProfile.createNewMealPlan')}
                </button>
              </div>
              <div className="tr-legacy"><MealHistory clientId={client.id} /></div>
            </div>
          )}

          {tab === 'checkins' && <CheckInsPanel clientId={client.id} summary={checkInSummary as CheckInSummaryData | null} />}

          {tab === 'notifications' && isStaff && (
            <SectionCard icon={BellRing} title={t('notifications.notifyMeAboutClient', 'Notify me about this client')} info={t('tt.info.notify')}>
              <p className="-mt-2 mb-4 max-w-2xl text-sm text-muted-foreground">
                {t('notifications.notifyMeAboutClientDescription', 'Choose how you want to be notified when this client logs weight, completes meals, or completes training.')}
              </p>
              {notificationSettingLoading ? (
                <div className="grid gap-3 sm:grid-cols-2"><Skel className="h-28" /><Skel className="h-28" /></div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('notifications.notificationPreference', 'Notification preference')}>
                  {([
                    { mode: 'EVERYTHING', icon: BellRing, title: t('notifications.modeEverything', 'Everything'), body: t('notifications.modeEverythingDescription', 'Get notified immediately when they log weight, complete a meal, or complete a workout.') },
                    { mode: 'WEEKLY_DIGEST', icon: CalendarDays, title: t('notifications.modeWeeklyDigest', 'Weekly digest'), body: t('notifications.modeWeeklyDigestDescription', 'Get one weekly summary (e.g. missed training sessions, days without meal log).') },
                  ] as const).map((o) => {
                    const on = notificationMode === o.mode;
                    return (
                      <button
                        key={o.mode}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={notificationSettingSaving}
                        onClick={() => handleNotificationModeChange(o.mode)}
                        className={cn(
                          'tp-press flex gap-3 rounded-[1.25rem] p-4 text-start transition-colors',
                          on ? 'bg-primary/10 shadow-[inset_0_0_0_1.5px_hsl(var(--primary))]' : 'bg-foreground/[.04] shadow-[inset_0_0_0_1px_hsl(var(--foreground)/.07)] hover:bg-foreground/[.07]',
                        )}
                      >
                        <span className={cn('grid h-10 w-10 flex-none place-items-center rounded-xl', on ? 'bg-primary text-primary-foreground' : 'bg-foreground/[.07]')}>
                          <o.icon className="h-5 w-5" />
                        </span>
                        <span>
                          <span className="block font-bold">{o.title}</span>
                          <span className="mt-1 block text-sm text-muted-foreground">{o.body}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          )}
        </div>
      </div>

      <AlertDialog open={!!mealPlanToDelete} onOpenChange={(o) => !o && setMealPlanToDelete(null)}>
        <AlertDialogContent className="rounded-[1.5rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('meals.deleteMealPlan', 'Delete Meal Plan')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('meals.deleteMealPlanConfirm', 'Are you sure you want to delete this meal plan? This action cannot be undone.')}
              {mealPlanToDelete && <span className="mt-2 block font-semibold">{mealPlanToDelete.name || mealPlanToDelete.title}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('meals.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMealPlan} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('meals.delete', 'Delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!workoutPlanToDelete} onOpenChange={(o) => !o && setWorkoutPlanToDelete(null)}>
        <AlertDialogContent className="rounded-[1.5rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('clientProfile.deleteWorkout')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('clientProfile.confirmDeleteWorkout') || 'Are you sure you want to delete this workout plan?'}
              {workoutPlanToDelete && <span className="mt-2 block font-semibold">{workoutPlanToDelete.name}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('meals.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWorkoutPlan} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('meals.delete', 'Delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

const Row: React.FC<{ label: React.ReactNode; value: React.ReactNode; icon?: React.ElementType }> = ({ label, value, icon: Icon }) => (
  <div>
    <dt className="flex items-center gap-1.5">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</dt>
    <dd>{value}</dd>
  </div>
);

/* ------------------------------------------------------------------ overview */

type TimelineItem = { id: string; at: number; icon: React.ElementType; tone: string; title: string; detail?: string };

const Overview: React.FC<{
  client: Client;
  weights: { t: number; v: number }[];
  summary: CheckInSummary | null;
  sessions: WorkoutSession[];
  sessionsLoading: boolean;
  progress: ProgressEntry[];
  workoutPlan: WorkoutPlan | null;
  mealPlan: MealPlan | null;
  onTab: (t: TabId) => void;
}> = ({ client, weights, summary, sessions, sessionsLoading, progress, workoutPlan, mealPlan, onTab }) => {
  const { t } = useTranslation();

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];
    for (const s of sessions) {
      if (s.is_completed) {
        items.push({
          id: `s${s.id}`, at: parseDate(s.completed_at || s.started_at)?.getTime() ?? 0, icon: Dumbbell, tone: 'text-primary',
          title: t('trainer.client.tl.workout'), detail: s.duration_minutes ? t('trainer.dash.feed.minutes', { count: s.duration_minutes }) : undefined,
        });
      }
    }
    for (const p of progress) {
      items.push({
        id: `p${p.id}`, at: parseDate(p.recorded_at)?.getTime() ?? 0, icon: p.photo_path || p.photos?.length ? Activity : Scale, tone: 'text-[hsl(var(--tr-ok))]',
        title: p.weight ? t('trainer.client.tl.weight', { kg: fmtNum(p.weight, 1) }) : t('trainer.client.tl.progress'), detail: p.notes || undefined,
      });
    }
    if (workoutPlan) items.push({ id: 'wp', at: parseDate(workoutPlan.updated_at || workoutPlan.created_at)?.getTime() ?? 0, icon: Dumbbell, tone: 'text-[hsl(var(--gold))]', title: t('trainer.client.tl.workoutPlan'), detail: workoutPlan.name });
    if (mealPlan) items.push({ id: 'mp', at: parseDate(mealPlan.updated_at || mealPlan.created_at)?.getTime() ?? 0, icon: UtensilsCrossed, tone: 'text-[hsl(var(--gold))]', title: t('trainer.client.tl.mealPlan'), detail: mealPlan.name || mealPlan.title });
    items.push({ id: 'join', at: parseDate(client.created_at)?.getTime() ?? 0, icon: User, tone: 'text-muted-foreground', title: t('trainer.client.tl.joined') });
    return items.filter((i) => i.at > 0).sort((a, b) => b.at - a.at).slice(0, 12);
  }, [sessions, progress, workoutPlan, mealPlan, client.created_at, t]);

  // Workouts per week, last 8 weeks
  const weekly = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7 * 7 - ((now.getDay() + 6) % 7));
    const buckets = Array.from({ length: 8 }, () => 0);
    for (const s of sessions) {
      if (!s.is_completed) continue;
      const d = parseDate(s.completed_at || s.started_at);
      if (!d) continue;
      const w = Math.floor((d.getTime() - start.getTime()) / (7 * 86400000));
      if (w >= 0 && w < 8) buckets[w]++;
    }
    return buckets;
  }, [sessions]);
  const maxWeek = Math.max(1, ...weekly);
  const lastWorkout = sessions.filter((s) => s.is_completed).map((s) => parseDate(s.completed_at || s.started_at)?.getTime() ?? 0).sort((a, b) => b - a)[0];

  return (
    <div className="tr-grid-2">
      <SectionCard
        icon={TrendingUp}
        title={t('trainer.client.weightTrend')}
        info={t('tt.info.weightTrend')}
        action={<button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press" onClick={() => onTab('progress')}>{t('trainer.client.details')}</button>}
      >
        {weights.length > 1 ? (
          <TrendChart points={weights} unit={t('trainer.common.kg')} label={t('trainer.client.weightTrend')} />
        ) : (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary"><Scale className="h-6 w-6" /></span>
            <p className="font-semibold">{t('trainer.client.noWeights')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('trainer.client.noWeightsBody')}</p>
          </div>
        )}
      </SectionCard>

      <SectionCard icon={Activity} title={t('trainer.client.consistency')} info={t('tt.info.consistency')}>
        <div className="grid grid-cols-[auto_1fr] items-center gap-5">
          <Ring value={summary ? summary.completion_rate / 100 : 0} size={112} stroke={11} color="hsl(var(--tr-ok))">
            <span>
              <span className="tr-stat-v block text-2xl"><CountUp value={summary?.completion_rate ?? 0} />%</span>
              <span className="text-[10px] text-muted-foreground">{t('trainer.client.checkIns')}</span>
            </span>
          </Ring>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Mini label={t('trainer.client.avgSleep')} value={summary?.avg_sleep_hours != null ? fmtNum(summary.avg_sleep_hours, 1) : '–'} />
            <Mini label={t('trainer.client.avgSteps')} value={summary?.avg_steps != null ? fmtNum(summary.avg_steps) : '–'} />
            <Mini label={t('trainer.client.totalCheckIns')} value={fmtNum(summary?.total_check_ins ?? 0)} />
            <Mini label={t('trainer.client.lastWorkout')} value={lastWorkout ? fmtRelative(new Date(lastWorkout)) : '–'} />
          </dl>
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="tp-label">{t('trainer.client.workoutsPerWeek')}</span>
            <span>{t('trainer.client.last8')}</span>
          </div>
          {sessionsLoading ? (
            <Skel className="h-16" />
          ) : (
            <div className="tr-bars h-16" dir="ltr" role="img" aria-label={t('trainer.client.workoutsPerWeek')}>
              {weekly.map((n, i) => (
                <span key={i} data-today={i === 7 || undefined} data-on={n > 0 || undefined} style={{ height: `${Math.max(6, (n / maxWeek) * 100)}%`, ['--i' as string]: i }} title={String(n)} />
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard icon={History} title={t('trainer.client.timeline')} info={t('tt.info.timeline')} className="col-span-full">
        {timeline.length ? (
          <ol className="tr-timeline space-y-1">
            {timeline.map((it, i) => (
              <li key={it.id} className="tp-rise relative" style={{ ['--i' as string]: Math.min(i, 10) }}>
                <span className={cn('tr-timeline-node', it.tone)} aria-hidden />
                <div className="flex items-start gap-3 rounded-2xl px-2 py-2.5 hover:bg-foreground/[.03]">
                  <span className={cn('grid h-9 w-9 flex-none place-items-center rounded-xl bg-foreground/[.06]', it.tone)}><it.icon className="h-[18px] w-[18px]" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{it.title}</p>
                    {it.detail && <p className="truncate text-xs text-muted-foreground">{it.detail}</p>}
                  </div>
                  <time className="flex-none text-xs text-muted-foreground" dateTime={new Date(it.at).toISOString()} title={fmtDate(new Date(it.at), { day: 'numeric', month: 'long', year: 'numeric' })}>
                    {dayOf(new Date(it.at).toISOString()) === dayOf(new Date().toISOString()) ? fmtRelative(new Date(it.at)) : fmtDate(new Date(it.at))}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{t('trainer.dash.noActivity')}</p>
        )}
      </SectionCard>
    </div>
  );
};

const Mini: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-xl bg-foreground/[.04] px-3 py-2">
    <dt className="text-[11px] text-muted-foreground">{label}</dt>
    <dd className="font-bold tabular-nums">{value}</dd>
  </div>
);

export default ClientProfile;
