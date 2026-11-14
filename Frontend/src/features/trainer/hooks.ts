import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '@/features/trainee/api';
import { addDays, dayOf, parseDate, todayISO, weekStart } from '@/features/trainee/format';
import type { WorkoutSession } from '@/features/trainee/types';
import { studioApi, type Lead } from '@/lib/studioApi';

export interface TrainerClient {
  id: number;
  username: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  last_login?: string | null;
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

export interface TrainerCheckIn {
  id: number;
  client_id: number;
  date: string;
  created_at: string;
  weight?: number | null;
  steps?: number | null;
  sleep_hours?: number | null;
  hunger_level?: number | null;
}

interface MealCompletion {
  id: number;
  client_id: number;
  meal_slot_id: number;
  is_completed: boolean;
  completed_at?: string | null;
  date: string;
}

export const tk = {
  clients: ['trainer', 'clients'] as const,
  status: ['trainer', 'check-in-status'] as const,
  checkIns: (from: string) => ['trainer', 'check-ins', from] as const,
  activity: (id: number) => ['trainer', 'activity', id] as const,
  leads: ['trainer', 'leads', 'new'] as const,
  library: ['trainer', 'library-stats'] as const,
};

const soft = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

export function useTrainerClients() {
  return useQuery({ queryKey: tk.clients, queryFn: () => api<TrainerClient[]>('/users/clients'), staleTime: 30_000 });
}

export function useCheckInStatus() {
  return useQuery({
    queryKey: tk.status,
    queryFn: () => api<{ client_id: number; check_in_status: 'completed' | 'pending' | 'none' }[]>('/check-ins/trainer/dashboard'),
    refetchInterval: 60_000,
  });
}

export function useRecentCheckIns(days = 7) {
  const from = addDays(todayISO(), -(days - 1));
  return useQuery({
    queryKey: tk.checkIns(from),
    queryFn: () => api<TrainerCheckIn[]>(`/check-ins?start_date=${from}`),
    refetchInterval: 60_000,
  });
}

export function useNewLeads() {
  return useQuery({ queryKey: tk.leads, queryFn: () => soft(studioApi.leads('new'), [] as Lead[]), staleTime: 60_000 });
}

/** Legacy stats the old dashboard showed: library size and v1 plan completion. */
export function useLibraryStats() {
  return useQuery({
    queryKey: tk.library,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [ex, plans] = await Promise.all([
        soft(api<unknown[]>('/exercises/'), []),
        soft(api<{ sessions_count: number; completed_sessions: number }[]>('/workouts/plans'), []),
      ]);
      const total = plans.reduce((s, p) => s + (p.sessions_count || 0), 0);
      const done = plans.reduce((s, p) => s + (p.completed_sessions || 0), 0);
      return { exercises: ex.length, planCompletion: total > 0 ? Math.min(100, (done / total) * 100) : 0 };
    },
  });
}

export interface ClientActivity {
  sessions: WorkoutSession[];
  meals: MealCompletion[];
}

/** Per-client sessions and today's meal completions (first 40 clients). */
export function useClientsActivity(clients: TrainerClient[] | undefined) {
  const list = (clients ?? []).slice(0, 40);
  const today = todayISO();
  return useQueries({
    queries: list.map((c) => ({
      queryKey: tk.activity(c.id),
      staleTime: 45_000,
      refetchInterval: 45_000,
      queryFn: async (): Promise<ClientActivity> => {
        const [sessions, meals] = await Promise.all([
          soft(api<WorkoutSession[]>(`/v2/workouts/sessions?client_id=${c.id}`), []),
          soft(api<MealCompletion[]>(`/v3/meals/completions?client_id=${c.id}&date=${today}`), []),
        ]);
        return { sessions: Array.isArray(sessions) ? sessions : [], meals: Array.isArray(meals) ? meals.filter((m) => m.is_completed) : [] };
      },
    })),
    combine: (results) => ({
      byId: new Map(list.map((c, i) => [c.id, results[i]?.data] as const)),
      loading: results.some((r) => r.isLoading),
      stamp: results.map((r) => r.dataUpdatedAt).join(','),
    }),
  });
}

const time = (s?: string | null) => parseDate(s ?? null)?.getTime() ?? 0;

export interface ClientPulse {
  client: TrainerClient;
  checkedInToday: boolean;
  checkInDays7: number;
  workoutsWeek: number;
  mealsToday: number;
  lastActive: number;
  trainingNow: boolean;
}

export type FeedKind = 'checkin' | 'workout' | 'meals' | 'lead' | 'training';
export interface FeedItem {
  id: string;
  kind: FeedKind;
  at: number;
  clientId?: number;
  name: string;
  meta?: { weight?: number | null; count?: number; minutes?: number | null; goal?: string | null };
}

/** Everything the cockpit shows, derived from the queries above. */
export function useCockpit() {
  const clientsQ = useTrainerClients();
  const statusQ = useCheckInStatus();
  const checkInsQ = useRecentCheckIns(7);
  const leadsQ = useNewLeads();
  const activity = useClientsActivity(clientsQ.data);

  const derived = useMemo(() => {
    const clients = clientsQ.data ?? [];
    const today = todayISO();
    const wk = weekStart().getTime();
    const statusMap = new Map((statusQ.data ?? []).map((s) => [s.client_id, s.check_in_status]));
    const checkIns = checkInsQ.data ?? [];
    const byClientDays = new Map<number, Set<string>>();
    const lastCheckIn = new Map<number, number>();
    for (const c of checkIns) {
      const d = dayOf(c.date);
      if (!byClientDays.has(c.client_id)) byClientDays.set(c.client_id, new Set());
      byClientDays.get(c.client_id)!.add(d);
      lastCheckIn.set(c.client_id, Math.max(lastCheckIn.get(c.client_id) ?? 0, dayOf(c.created_at) === dayOf(c.date) ? time(c.created_at) : time(c.date)));
    }

    const days7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const workoutsPerDay = new Map(days7.map((d) => [d, 0]));
    const feed: FeedItem[] = [];
    const recentCut = Date.now() - 2 * 86400000;

    const pulses: ClientPulse[] = clients.map((client) => {
      const act = activity.byId.get(client.id);
      const sessions = act?.sessions ?? [];
      let workoutsWeek = 0;
      let last = Math.max(time(client.last_login), lastCheckIn.get(client.id) ?? 0);
      let trainingNow = false;
      for (const s of sessions) {
        const started = time(s.started_at);
        const done = time(s.completed_at);
        last = Math.max(last, started, done);
        if (s.is_completed) {
          const d = dayOf(s.completed_at || s.started_at);
          if (workoutsPerDay.has(d)) workoutsPerDay.set(d, (workoutsPerDay.get(d) ?? 0) + 1);
          if ((done || started) >= wk) workoutsWeek++;
          if ((done || started) >= recentCut) {
            feed.push({ id: `w${s.id}`, kind: 'workout', at: done || started, clientId: client.id, name: client.full_name, meta: { minutes: s.duration_minutes } });
          }
        } else if (dayOf(s.started_at) === today && Date.now() - started < 3 * 3600000) {
          trainingNow = true;
          feed.push({ id: `t${s.id}`, kind: 'training', at: started, clientId: client.id, name: client.full_name });
        }
      }
      const meals = act?.meals ?? [];
      if (meals.length) {
        const at = Math.max(...meals.map((m) => time(m.completed_at)), 0);
        last = Math.max(last, at);
        feed.push({ id: `m${client.id}`, kind: 'meals', at: at || Date.now() - 1, clientId: client.id, name: client.full_name, meta: { count: meals.length } });
      }
      return {
        client,
        checkedInToday: statusMap.get(client.id) === 'completed',
        checkInDays7: byClientDays.get(client.id)?.size ?? 0,
        workoutsWeek,
        mealsToday: meals.length,
        lastActive: last,
        trainingNow,
      };
    });

    const names = new Map(clients.map((c) => [c.id, c.full_name]));
    for (const c of checkIns) {
      // Back-filled check-ins (entered later for an earlier day) are placed on their own day.
      const at = dayOf(c.created_at) === dayOf(c.date) ? time(c.created_at) : time(c.date) + 12 * 3600000;
      if (at >= recentCut) feed.push({ id: `c${c.id}`, kind: 'checkin', at, clientId: c.client_id, name: names.get(c.client_id) ?? '', meta: { weight: c.weight } });
    }
    const leads = leadsQ.data ?? [];
    for (const l of leads) {
      const at = time(l.created_at);
      if (at >= Date.now() - 7 * 86400000) feed.push({ id: `l${l.id}`, kind: 'lead', at, name: l.name, meta: { goal: l.goal } });
    }
    feed.sort((a, b) => b.at - a.at);

    const checkedIn = pulses.filter((p) => p.checkedInToday).length;
    return {
      clients,
      pulses,
      feed: feed.slice(0, 16),
      checkedIn,
      active: clients.filter((c) => c.is_active).length,
      workoutsWeek: pulses.reduce((s, p) => s + p.workoutsWeek, 0),
      workoutsPerDay: days7.map((d) => ({ day: d, count: workoutsPerDay.get(d) ?? 0, today: d === today })),
      leads,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientsQ.data, statusQ.data, checkInsQ.data, leadsQ.data, activity.stamp]);

  return {
    ...derived,
    loading: clientsQ.isLoading,
    activityLoading: activity.loading || checkInsQ.isLoading,
    error: clientsQ.isError,
    refetch: () => {
      clientsQ.refetch();
      statusQ.refetch();
      checkInsQ.refetch();
      leadsQ.refetch();
    },
  };
}
