import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from './api';
import { dayOf, todayISO, weekStart, parseDate } from './format';
import type {
  CheckIn, CheckInSummary, Conversation, ProgressEntry, SetCompletion, WorkoutDay, WorkoutPlan, WorkoutSession,
} from './types';
import type { V3DayViewResponse, V3MealCompletionStatusResponse, V3MealLogCreateRequest, V3FoodOption, MacroType } from '@/types/meals-v3';

/* ------------------------------------------------------------------ keys */

export const qk = {
  all: ['trainee'] as const,
  plans: ['trainee', 'plans'] as const,
  sessions: ['trainee', 'sessions'] as const,
  day: (id: number) => ['trainee', 'day', id] as const,
  mealDay: (date: string) => ['trainee', 'meal-day', date] as const,
  mealCompletions: (date: string) => ['trainee', 'meal-completions', date] as const,
  catalog: (macro: MacroType) => ['trainee', 'catalog', macro] as const,
  checkInToday: ['trainee', 'check-in', 'today'] as const,
  checkInSummary: ['trainee', 'check-in', 'summary'] as const,
  progress: ['trainee', 'progress'] as const,
  conversations: ['trainee', 'conversations'] as const,
};

/** Live screens poll lightly so the coach's changes show up without a reload. */
export const LIVE = { refetchInterval: 45_000, refetchOnWindowFocus: true } as const;

/* ------------------------------------------------------------------ workouts */

export function usePlans(live = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.plans,
    enabled: !!user?.id,
    queryFn: () => api<WorkoutPlan[]>(`/v2/workouts/plans?client_id=${user!.id}`),
    ...(live ? LIVE : { refetchInterval: 60_000 }),
  });
}

export function useSessions(live = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.sessions,
    enabled: !!user?.id,
    queryFn: () => api<WorkoutSession[]>(`/v2/workouts/sessions?client_id=${user!.id}`),
    ...(live ? LIVE : {}),
  });
}

export function useWorkoutDay(dayId: number) {
  return useQuery({
    queryKey: qk.day(dayId),
    enabled: Number.isFinite(dayId) && dayId > 0,
    queryFn: () => api<WorkoutDay>(`/v2/workouts/days/${dayId}`),
    refetchInterval: 60_000,
  });
}

export const activePlan = (plans?: WorkoutPlan[] | null) =>
  plans?.length ? plans.find((p) => p.is_active) ?? plans[0] : null;

export const sortedDays = (plan?: WorkoutPlan | null) =>
  plan ? [...plan.workout_days].sort((a, b) => a.order_index - b.order_index) : [];

export const sortExercises = (day?: WorkoutDay | null) =>
  day ? [...day.workout_exercises].sort((a, b) => a.order_index - b.order_index) : [];

const byStartDesc = (a: WorkoutSession, b: WorkoutSession) =>
  (parseDate(b.started_at)?.getTime() ?? 0) - (parseDate(a.started_at)?.getTime() ?? 0);

/** Today's session for a workout day (the backend files every set logged today under it). */
export const todaySessionFor = (sessions: WorkoutSession[] | undefined, dayId: number) => {
  const today = todayISO();
  return (sessions ?? []).filter((s) => s.workout_day_id === dayId && dayOf(s.started_at) === today).sort(byStartDesc)[0] ?? null;
};

export const completedThisWeek = (sessions: WorkoutSession[] | undefined, dayId: number) => {
  const start = weekStart().getTime();
  return (sessions ?? []).some((s) => s.workout_day_id === dayId && s.is_completed && (parseDate(s.completed_at || s.started_at)?.getTime() ?? 0) >= start);
};

export const lastCompleted = (sessions: WorkoutSession[] | undefined, dayId?: number) =>
  (sessions ?? []).filter((s) => s.is_completed && (dayId === undefined || s.workout_day_id === dayId)).sort(byStartDesc)[0] ?? null;

/** Last performance of an exercise before today, ordered by set number. */
export const previousSetsFor = (sessions: WorkoutSession[] | undefined, workoutExerciseId: number) => {
  const today = todayISO();
  for (const s of [...(sessions ?? [])].sort(byStartDesc)) {
    if (dayOf(s.started_at) === today) continue;
    const sets = s.set_completions.filter((c) => c.workout_exercise_id === workoutExerciseId);
    if (sets.length) return { date: s.started_at, sets: [...sets].sort((a, b) => a.set_number - b.set_number) };
  }
  return null;
};

export type UpNext =
  | { kind: 'none' }
  | { kind: 'start' | 'continue' | 'done'; day: WorkoutDay; session: WorkoutSession | null };

/** "What do I train now?": continue today's session, celebrate a finished one, or the next day in the rotation. */
export function computeUpNext(plan: WorkoutPlan | null, sessions: WorkoutSession[] | undefined): UpNext {
  const days = sortedDays(plan);
  if (!days.length) return { kind: 'none' };
  const ids = new Set(days.map((d) => d.id));
  const today = todayISO();
  const todays = (sessions ?? []).filter((s) => ids.has(s.workout_day_id) && dayOf(s.started_at) === today).sort(byStartDesc);
  const open = todays.find((s) => !s.is_completed && s.set_completions.length > 0);
  if (open) return { kind: 'continue', day: days.find((d) => d.id === open.workout_day_id)!, session: open };
  const done = todays.find((s) => s.is_completed);
  if (done) return { kind: 'done', day: days.find((d) => d.id === done.workout_day_id)!, session: done };
  const last = (sessions ?? []).filter((s) => ids.has(s.workout_day_id) && s.is_completed).sort(byStartDesc)[0];
  if (!last) return { kind: 'start', day: days[0], session: null };
  const idx = days.findIndex((d) => d.id === last.workout_day_id);
  return { kind: 'start', day: days[(idx + 1) % days.length], session: null };
}

let tempId = -1;

type LogSetVars = { dayId: number; workoutExerciseId: number; setNumber: number; reps: number; weight: number; performedName?: string | null; performedLibraryId?: string | null };

/** Logs a set optimistically into today's session; rolls back if the server refuses. */
export function useLogSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['trainee', 'set'],
    mutationFn: (v: LogSetVars) =>
      api<SetCompletion>('/v2/workouts/set-completions', {
        method: 'POST',
        body: {
          workout_exercise_id: v.workoutExerciseId,
          set_number: v.setNumber,
          reps_completed: v.reps,
          weight_used: v.weight,
          performed_exercise_name: v.performedName ?? null,
          performed_library_id: v.performedLibraryId ?? null,
        },
      }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.sessions });
      const prev = qc.getQueryData<WorkoutSession[]>(qk.sessions);
      const now = new Date().toISOString();
      const row: SetCompletion = {
        id: tempId--, workout_exercise_id: v.workoutExerciseId, set_number: v.setNumber,
        reps_completed: v.reps, weight_used: v.weight, completed_at: now, pending: true,
        performed_exercise_name: v.performedName ?? null, performed_library_id: v.performedLibraryId ?? null,
      };
      qc.setQueryData<WorkoutSession[]>(qk.sessions, (old = []) => {
        const s = todaySessionFor(old, v.dayId);
        if (s) return old.map((x) => (x.id === s.id ? { ...x, set_completions: [...x.set_completions, row] } : x));
        return [...old, { id: tempId--, client_id: 0, workout_day_id: v.dayId, started_at: now, is_completed: false, set_completions: [row] }];
      });
      return { prev, tempRowId: row.id };
    },
    onSuccess: (saved, _v, ctx) => {
      qc.setQueryData<WorkoutSession[]>(qk.sessions, (old = []) =>
        old.map((s) => {
          if (!s.set_completions.some((c) => c.id === ctx?.tempRowId)) return s;
          return {
            ...s,
            id: s.id < 0 && saved.workout_session_id ? saved.workout_session_id : s.id,
            set_completions: s.set_completions.map((c) => (c.id === ctx?.tempRowId ? { ...saved } : c)),
          };
        }),
      );
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.sessions, ctx.prev);
    },
    onSettled: () => settleWhenIdle(qc, ['trainee', 'set'], qk.sessions),
  });
}

export function useDeleteSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['trainee', 'set'],
    mutationFn: (id: number) => api(`/v2/workouts/set-completions/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.sessions });
      const prev = qc.getQueryData<WorkoutSession[]>(qk.sessions);
      qc.setQueryData<WorkoutSession[]>(qk.sessions, (old = []) =>
        old.map((s) => ({ ...s, set_completions: s.set_completions.filter((c) => c.id !== id) })),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.sessions, ctx.prev),
    onSettled: () => settleWhenIdle(qc, ['trainee', 'set'], qk.sessions),
  });
}

/** Marks today's session for a day as finished (creates it first when nothing was logged). */
export function useFinishWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dayId, completed = true, startedMs }: { dayId: number; completed?: boolean; startedMs?: number }) => {
      const sessions = qc.getQueryData<WorkoutSession[]>(qk.sessions);
      let s = todaySessionFor(sessions, dayId);
      if (!s || s.id < 0) {
        const fresh = await api<WorkoutSession[]>(`/v2/workouts/sessions?workout_day_id=${dayId}`).catch(() => [] as WorkoutSession[]);
        s = todaySessionFor(fresh, dayId);
      }
      let id = s?.id;
      const startedAt = s?.started_at ?? new Date().toISOString();
      if (!id || id < 0) {
        const created = await api<WorkoutSession>('/v2/workouts/sessions', { method: 'POST', body: { workout_day_id: dayId, started_at: startedAt } });
        id = created.id;
      }
      const started = startedMs ?? parseDate(startedAt)?.getTime() ?? Date.now();
      const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));
      return api<WorkoutSession>(`/v2/workouts/sessions/${id}`, {
        method: 'PUT',
        body: completed
          ? { is_completed: true, completed_at: new Date().toISOString(), duration_minutes: Math.min(minutes, 240) }
          : { is_completed: false, completed_at: null },
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.sessions }),
  });
}

function settleWhenIdle(qc: QueryClient, mutationKey: readonly unknown[], queryKey: readonly unknown[]) {
  // Refetch only once the last pending write lands, so rapid taps never flicker.
  if (qc.isMutating({ mutationKey: [...mutationKey] }) <= 1) qc.invalidateQueries({ queryKey: [...queryKey] });
}

/* ------------------------------------------------------------------ meals */

export function useMealDay(date: string, live = false) {
  return useQuery({
    queryKey: qk.mealDay(date),
    queryFn: () => api<V3DayViewResponse>(`/v3/meals/day?date=${date}`),
    ...(live ? LIVE : { refetchInterval: 60_000 }),
  });
}

export function useMealCompletions(date: string, live = false) {
  return useQuery({
    queryKey: qk.mealCompletions(date),
    queryFn: () => api<V3MealCompletionStatusResponse[]>(`/v3/meals/completions?date=${date}`),
    ...(live ? LIVE : {}),
  });
}

/** The whole food bank (all macros) for "Add food". */
export function useFoodBank(enabled: boolean) {
  return useQuery({
    queryKey: ['trainee', 'food-bank'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => api<V3FoodOption[]>(`/v3/meals/catalog?include_public=true`),
  });
}

export function useCatalog(macro: MacroType, enabled: boolean) {
  return useQuery({
    queryKey: qk.catalog(macro),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => api<V3FoodOption[]>(`/v3/meals/catalog?macro_type=${macro}&include_public=true`),
  });
}

const setCompletionCache = (qc: QueryClient, date: string, slotId: number, done: boolean) =>
  qc.setQueryData<V3MealCompletionStatusResponse[]>(qk.mealCompletions(date), (old = []) => {
    const has = old.some((r) => r.meal_slot_id === slotId);
    if (has) return old.map((r) => (r.meal_slot_id === slotId ? { ...r, is_completed: done } : r));
    return [...old, { id: -slotId, client_id: 0, meal_slot_id: slotId, date, is_completed: done }];
  });

/** Completes (or reopens) a meal. Pending plan rows are logged first, exactly like before. */
export function useCompleteMeal(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slotId, done, logs }: { slotId: number; done: boolean; logs?: V3MealLogCreateRequest[] }) => {
      for (const l of logs ?? []) await api('/v3/meals/logs', { method: 'POST', body: l as unknown as Record<string, unknown> });
      return api<V3MealCompletionStatusResponse>('/v3/meals/completions', {
        method: 'POST',
        body: { meal_slot_id: slotId, date, is_completed: done, completion_method: 'manual' },
      });
    },
    onMutate: async ({ slotId, done }) => {
      await qc.cancelQueries({ queryKey: qk.mealCompletions(date) });
      const prev = qc.getQueryData(qk.mealCompletions(date));
      setCompletionCache(qc, date, slotId, done);
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.mealCompletions(date), ctx.prev),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.mealCompletions(date) });
      qc.invalidateQueries({ queryKey: qk.mealDay(date) });
    },
  });
}

/** Generic meal write (log food, delete a log, choose an option) followed by a refresh of the day. */
export function useMealWrite(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['trainee', 'meal-write'],
    mutationFn: async (op:
      | { kind: 'log'; body: V3MealLogCreateRequest }
      | { kind: 'delete'; id: number }
      | { kind: 'replace'; deleteId?: number; body: V3MealLogCreateRequest }
      | { kind: 'variant'; variantId: number }) => {
      if (op.kind === 'log') return api('/v3/meals/logs', { method: 'POST', body: op.body as unknown as Record<string, unknown> });
      if (op.kind === 'delete') return api(`/v3/meals/logs/${op.id}`, { method: 'DELETE' });
      if (op.kind === 'replace') {
        if (op.deleteId) await api(`/v3/meals/logs/${op.deleteId}`, { method: 'DELETE' });
        return api('/v3/meals/logs', { method: 'POST', body: op.body as unknown as Record<string, unknown> });
      }
      return api('/v3/meals/variants/select', { method: 'POST', body: { variant_id: op.variantId, date } });
    },
    onMutate: async (op) => {
      if (op.kind !== 'variant' && op.kind !== 'delete') return {};
      await qc.cancelQueries({ queryKey: qk.mealDay(date) });
      const prev = qc.getQueryData<V3DayViewResponse>(qk.mealDay(date));
      qc.setQueryData<V3DayViewResponse>(qk.mealDay(date), (old) => {
        if (!old) return old;
        if (op.kind === 'delete') return { ...old, choices: old.choices.filter((c) => c.id !== op.id) };
        return {
          ...old,
          slots: old.slots.map((s) => (s.variants?.some((v) => v.id === op.variantId) ? { ...s, selected_variant_id: op.variantId } : s)),
        };
      });
      return { prev };
    },
    onError: (_e, _op, ctx) => ctx?.prev && qc.setQueryData(qk.mealDay(date), ctx.prev),
    onSettled: () => settleWhenIdle(qc, ['trainee', 'meal-write'], qk.mealDay(date)),
  });
}

/* ------------------------------------------------------------------ check-ins */

/** Tolerant: a failing check-in endpoint never breaks the home screen. */
export function useCheckInToday(live = false) {
  return useQuery({
    queryKey: qk.checkInToday,
    queryFn: () => api<CheckIn | null>('/check-ins/today').catch((e) => (e instanceof ApiError && e.status < 500 ? null : Promise.reject(e))),
    ...(live ? LIVE : {}),
  });
}

export function useCheckInSummary() {
  return useQuery({
    queryKey: qk.checkInSummary,
    queryFn: () => api<CheckInSummary>('/check-ins/summary').catch(() => null),
  });
}

export type CheckInInput = Omit<CheckIn, 'id' | 'date'>;

/** Corrects an existing check-in (A2A trainee F2). */
export function useUpdateCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...v }: CheckInInput & { id: number }) => api<CheckIn>(`/check-ins/${id}`, { method: 'PUT', body: v }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.checkInToday });
      qc.invalidateQueries({ queryKey: qk.checkInSummary });
    },
  });
}

export function useCreateCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CheckInInput) => api<CheckIn>('/check-ins', { method: 'POST', body: { ...v, date: `${todayISO()}T12:00:00` } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.checkInToday });
      const prev = qc.getQueryData(qk.checkInToday);
      qc.setQueryData(qk.checkInToday, { id: -1, date: todayISO(), ...v });
      return { prev };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(qk.checkInToday, ctx?.prev ?? null),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.checkInToday });
      qc.invalidateQueries({ queryKey: qk.checkInSummary });
    },
  });
}

/* ------------------------------------------------------------------ progress */

export function useProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.progress,
    enabled: !!user?.id,
    queryFn: async () => {
      const rows = await api<ProgressEntry[]>(`/progress/?client_id=${user!.id}`);
      return [...rows].sort((a, b) => (parseDate(a.date)?.getTime() ?? 0) - (parseDate(b.date)?.getTime() ?? 0) || a.id - b.id);
    },
  });
}

export type NewEntry = {
  weight: number;
  notes?: string;
  measures: Partial<Record<'chest' | 'waist' | 'hips' | 'thighs' | 'right_arm' | 'left_arm', number>>;
  photos: Partial<Record<'front' | 'side' | 'back', File>>;
};

export function useAddProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: NewEntry) => {
      const fd = new FormData();
      fd.append('weight', String(v.weight));
      if (v.notes) fd.append('notes', v.notes);
      for (const [k, val] of Object.entries(v.measures)) if (val !== undefined && !Number.isNaN(val)) fd.append(k, String(val));
      for (const [k, f] of Object.entries(v.photos)) if (f) fd.append(`photo_${k}`, f);
      return api<ProgressEntry>('/progress/weight', { method: 'POST', body: fd });
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.progress });
      const prev = qc.getQueryData<ProgressEntry[]>(qk.progress);
      qc.setQueryData<ProgressEntry[]>(qk.progress, (old = []) => [
        ...old,
        { id: tempId--, client_id: 0, date: todayISO(), weight: v.weight, notes: v.notes, photos: [], ...v.measures },
      ]);
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.progress, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.progress }),
  });
}

export function useDeleteProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/progress/weight/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.progress });
      const prev = qc.getQueryData<ProgressEntry[]>(qk.progress);
      qc.setQueryData<ProgressEntry[]>(qk.progress, (old = []) => old.filter((e) => e.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.progress, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.progress }),
  });
}

/* ------------------------------------------------------------------ coach */

export function useConversations(live = false) {
  return useQuery({
    queryKey: qk.conversations,
    queryFn: () => api<Conversation[]>('/v2/chat/conversations').catch(() => [] as Conversation[]),
    refetchInterval: live ? 30_000 : 60_000,
  });
}

export function useSendCoachMessage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => api('/v2/chat/messages', { method: 'POST', body: { client_id: user?.id, message, progress_entry_id: null } }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.conversations }),
  });
}
