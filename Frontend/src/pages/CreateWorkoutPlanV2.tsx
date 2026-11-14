import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, ArrowDown, ArrowUp, CalendarDays, ClipboardList, Clock, Dumbbell, Layers, Plus, Save, Trash2, User,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Layout from '../components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '../config/api';
import { cn } from '@/lib/utils';
import { Avatar, BackLink, Field, PageTitle, SectionCard } from '@/features/trainer/ui';
import ExercisePicker, { ExerciseThumb, type PickableExercise } from '@/features/trainer/ExercisePicker';

interface WorkoutExercise {
  /** Existing workout exercise id: sent back so the server edits it in place (its logged sets stay attached). */
  id?: number;
  exercise_id: number;
  exercise_name?: string;
  order_index: number;
  target_sets: number | null;
  target_reps: string;
  target_weight: number | null;
  rest_seconds: number | null;
  notes: string;
  group_name?: string;
  video_url?: string | null;
  /** Stable key for list animations (not sent to the API). */
  _key?: string;
}

interface WorkoutDay {
  /** Existing day id (sessions of the client hang on it) */
  id?: number;
  name: string;
  day_type: string;
  order_index: number;
  notes: string;
  estimated_duration: number | null;
  exercises: WorkoutExercise[];
}

interface WorkoutSplit {
  id: number;
  name: string;
  description?: string;
  days_per_week?: number | null;
}

interface WorkoutPlanFormData {
  client_id: number;
  name: string;
  description: string;
  split_type: string | null;
  days_per_week: number | null;
  duration_weeks: number | null;
  notes: string;
  is_active: boolean;
  workout_days: WorkoutDay[];
}

let keySeq = 0;
const nextKey = () => `ex${++keySeq}`;

const authHeaders = (json = false): Record<string, string> => {
  const token = localStorage.getItem('access_token');
  const h: Record<string, string> = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

const CreateWorkoutPlanV2: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const client = location.state?.client;
  const existingPlan = location.state?.workoutPlan;
  const isEditing = Boolean(existingPlan);
  const dayLabel = (n: number) => t('trainer.builder.dayN', { n });

  const [formData, setFormData] = useState<WorkoutPlanFormData>({
    client_id: client?.id || 0,
    name: '',
    description: '',
    split_type: null,
    days_per_week: null,
    duration_weeks: 8,
    notes: '',
    is_active: true,
    workout_days: [{ name: dayLabel(1), day_type: 'custom', order_index: 0, notes: '', estimated_duration: null, exercises: [] }],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [clients, setClients] = useState<any[]>([]);
  const [exercises, setExercises] = useState<PickableExercise[]>([]);
  const [exercisesLoading, setExercisesLoading] = useState(true);
  const [workoutSplits, setWorkoutSplits] = useState<WorkoutSplit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newSplitName, setNewSplitName] = useState('');
  const [newSplitDescription, setNewSplitDescription] = useState('');
  const [newSplitDaysPerWeek, setNewSplitDaysPerWeek] = useState<number | null>(null);
  const [showCreateSplitDialog, setShowCreateSplitDialog] = useState(false);
  const hasHydratedExistingPlan = useRef(false);

  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  useEffect(() => {
    if (user?.role === 'CLIENT') navigate('/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (client?.id && formData.client_id !== client.id) setFormData((prev) => ({ ...prev, client_id: client.id }));
  }, [client, formData.client_id]);

  useEffect(() => {
    fetchExercises();
    fetchWorkoutSplits();
    if (!client && user?.role === 'TRAINER') fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, user]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('createSplit') === 'true') {
      setShowCreateSplitDialog(true);
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, navigate, location.pathname]);

  useEffect(() => {
    if (!existingPlan || hasHydratedExistingPlan.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mappedDays: WorkoutDay[] = (existingPlan.workout_days || []).map((day: any, idx: number) => ({
      id: day.id,
      name: day.name,
      day_type: day.day_type || 'custom',
      order_index: idx,
      notes: day.notes || '',
      estimated_duration: day.estimated_duration ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exercises: (day.workout_exercises || []).map((exercise: any, exerciseIndex: number) => ({
        id: exercise.id,
        exercise_id: exercise.exercise_id,
        exercise_name: exercise.exercise?.name || exercise.exercise_name || '',
        order_index: exerciseIndex,
        target_sets: exercise.target_sets ?? null,
        target_reps: exercise.target_reps ?? '',
        target_weight: exercise.target_weight ?? null,
        rest_seconds: exercise.rest_seconds ?? null,
        tempo: exercise.tempo ?? '',
        notes: exercise.notes ?? '',
        group_name: exercise.group_name ?? '',
        video_url: exercise.video_url || exercise.exercise?.video_url || null,
        _key: nextKey(),
      })),
    }));
    setFormData({
      client_id: client?.id || existingPlan.client_id,
      name: existingPlan.name || '',
      description: existingPlan.description || '',
      split_type: existingPlan.split_type || null,
      days_per_week: existingPlan.days_per_week ?? null,
      duration_weeks: existingPlan.duration_weeks ?? null,
      notes: existingPlan.notes || '',
      is_active: existingPlan.is_active ?? true,
      workout_days: mappedDays.length ? mappedDays : [{ name: dayLabel(1), day_type: 'custom', order_index: 0, notes: '', estimated_duration: null, exercises: [] }],
    });
    hasHydratedExistingPlan.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingPlan, client]);

  const fetchClients = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/clients`, { headers: authHeaders() });
      if (response.ok) setClients(await response.json());
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    }
  };

  const fetchExercises = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/exercises/`, { headers: authHeaders() });
      if (response.ok) setExercises(await response.json());
    } catch (err) {
      console.error('Failed to fetch exercises:', err);
    } finally {
      setExercisesLoading(false);
    }
  };

  const fetchWorkoutSplits = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/workout-splits/`, { headers: authHeaders() });
      if (response.ok) setWorkoutSplits(await response.json());
    } catch (err) {
      console.error('Failed to fetch workout splits:', err);
    }
  };

  const createWorkoutSplit = async () => {
    if (!newSplitName.trim()) {
      setError(t('trainer.builder.errSplitName'));
      return;
    }
    try {
      setError('');
      const response = await fetch(`${API_BASE_URL}/workout-splits/`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ name: newSplitName.trim(), description: newSplitDescription?.trim() || null, days_per_week: newSplitDaysPerWeek || null }),
      });
      if (response.ok) {
        const newSplit = await response.json();
        setWorkoutSplits((s) => [...s, newSplit]);
        setFormData((f) => ({ ...f, split_type: String(newSplit.id) }));
        setNewSplitName('');
        setNewSplitDescription('');
        setNewSplitDaysPerWeek(null);
        setShowCreateSplitDialog(false);
      } else {
        let errorMessage = t('trainer.builder.errSplit');
        try {
          const contentType = response.headers.get('content-type');
          if (contentType?.includes('application/json')) errorMessage = (await response.json()).detail || errorMessage;
          else errorMessage = (await response.text()) || errorMessage;
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
        }
        setError(errorMessage);
      }
    } catch (err) {
      console.error('Failed to create workout split:', err);
      setError(`${t('trainer.builder.errSplit')}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /* ---------- immutable day / exercise updates ---------- */

  const patchDays = (fn: (days: WorkoutDay[]) => WorkoutDay[]) => setFormData((f) => ({ ...f, workout_days: fn(f.workout_days) }));
  const reindex = (list: WorkoutExercise[]) => list.map((ex, idx) => ({ ...ex, order_index: idx }));

  const addExerciseToDay = (dayIndex: number, exercise: PickableExercise) =>
    patchDays((days) =>
      days.map((d, i) =>
        i !== dayIndex
          ? d
          : {
              ...d,
              exercises: [
                ...d.exercises,
                {
                  exercise_id: exercise.id,
                  exercise_name: exercise.name,
                  order_index: d.exercises.length,
                  // sensible defaults: an exercise without sets / reps blocked the trainee's session (A2A cross M6)
                  target_sets: 3,
                  target_reps: '10',
                  target_weight: null,
                  rest_seconds: 90,
                  notes: '',
                  group_name: '',
                  video_url: exercise.video_url || null,
                  _key: nextKey(),
                },
              ],
            },
      ),
    );

  const updateWorkoutDay = <K extends keyof WorkoutDay>(dayIndex: number, field: K, value: WorkoutDay[K]) =>
    patchDays((days) => days.map((d, i) => (i === dayIndex ? { ...d, [field]: value } : d)));

  const updateExercise = <K extends keyof WorkoutExercise>(dayIndex: number, exerciseIndex: number, field: K, value: WorkoutExercise[K]) =>
    patchDays((days) => days.map((d, i) => (i !== dayIndex ? d : { ...d, exercises: d.exercises.map((ex, j) => (j === exerciseIndex ? { ...ex, [field]: value } : ex)) })));

  const removeExercise = (dayIndex: number, exerciseIndex: number) =>
    patchDays((days) => days.map((d, i) => (i !== dayIndex ? d : { ...d, exercises: reindex(d.exercises.filter((_, j) => j !== exerciseIndex)) })));

  const moveExercise = (dayIndex: number, from: number, to: number) =>
    patchDays((days) =>
      days.map((d, i) => {
        if (i !== dayIndex || to < 0 || to >= d.exercises.length) return d;
        const list = [...d.exercises];
        const [m] = list.splice(from, 1);
        list.splice(to, 0, m);
        return { ...d, exercises: reindex(list) };
      }),
    );

  const addWorkoutDay = () => {
    patchDays((days) => [...days, { name: dayLabel(days.length + 1), day_type: 'custom', order_index: days.length, notes: '', estimated_duration: null, exercises: [] }]);
    setSelectedDay(formData.workout_days.length);
  };

  const removeWorkoutDay = (dayIndex: number) => {
    if (formData.workout_days.length <= 1) return;
    patchDays((days) => days.filter((_, i) => i !== dayIndex).map((d, i) => ({ ...d, order_index: i })));
    setSelectedDay((s) => Math.max(0, s >= dayIndex ? s - 1 : s));
  };

  const sanitizeString = (value?: string | null) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError('');
      if (!formData.client_id || formData.client_id === 0) {
        setError(t('workoutCreation.errorSelectClient'));
        setLoading(false);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        client_id: formData.client_id,
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        days_per_week: formData.days_per_week || null,
        duration_weeks: formData.duration_weeks || null,
        notes: formData.notes?.trim() || null,
        workout_days: formData.workout_days.map((day, dayIdx) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dayPayload: any = {
            id: day.id,
            name: day.name.trim(),
            order_index: dayIdx,
            notes: sanitizeString(day.notes) || null,
            estimated_duration: day.estimated_duration || null,
            exercises: day.exercises.map((exercise, exerciseIdx) => ({
              id: exercise.id,
              exercise_id: exercise.exercise_id,
              order_index: exerciseIdx,
              target_sets: exercise.target_sets && exercise.target_sets >= 1 ? exercise.target_sets : 3,
              target_reps: sanitizeString(exercise.target_reps) || '10',
              target_weight: exercise.target_weight || null,
              rest_seconds: exercise.rest_seconds && exercise.rest_seconds >= 0 ? exercise.rest_seconds : null,
              notes: sanitizeString(exercise.notes) || null,
              group_name: sanitizeString(exercise.group_name) || null,
              video_url: exercise.video_url || null,
            })),
          };
          if (day.day_type) dayPayload.day_type = day.day_type; // unknown / "None" values are normalised by the API
          return dayPayload;
        }),
      };
      // Only valid enum values go to split_type; a workout split id stays local (backend defaults to CUSTOM).
      if (formData.split_type) {
        const validSplitTypes = ['push_pull_legs', 'upper_lower', 'full_body', 'bro_split', 'custom'];
        if (validSplitTypes.includes(formData.split_type)) payload.split_type = formData.split_type;
      }

      const response = await fetch(`${API_BASE_URL}/v2/workouts/plans/complete`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify(payload) });
      if (!response.ok) {
        let errorMessage = t('workoutCreation.errorCreating');
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          try {
            const errorData = await response.json();
            if (errorData.detail) {
              errorMessage = Array.isArray(errorData.detail)
                ? errorData.detail.map((err: { loc?: string[]; msg?: string }) => `${err.loc?.join('.')}: ${err.msg}`).join(', ')
                : errorData.detail;
            }
          } catch {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
        } else {
          const text = await response.text();
          errorMessage = `Server error: ${response.status} ${response.statusText}. ${text.substring(0, 100)}`;
        }
        throw new Error(errorMessage);
      }
      navigate('/trainer-dashboard');
    } catch (err) {
      console.error('Failed to create workout plan:', err);
      setError((err as Error).message || t('workoutCreation.errorCreating'));
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () =>
    formData.client_id > 0 &&
    formData.name.trim() !== '' &&
    formData.workout_days.length > 0 &&
    formData.workout_days.every((day) => day.name.trim() !== '' && day.exercises.length > 0);

  const dayIndex = Math.min(selectedDay, formData.workout_days.length - 1);
  const day = formData.workout_days[dayIndex];
  const dayCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const ex of day?.exercises ?? []) m.set(ex.exercise_id, (m.get(ex.exercise_id) ?? 0) + 1);
    return m;
  }, [day]);
  const selectedClient = client || clients.find((c) => c.id === formData.client_id);
  const totalExercises = formData.workout_days.reduce((s, d) => s + d.exercises.length, 0);

  return (
    <Layout currentPage="dashboard">
      <div className="tr-page">
        <BackLink className="mb-4" />
        <PageTitle
          eyebrow={selectedClient ? t('trainer.builder.forClient', { name: selectedClient.full_name }) : t('workoutCreation.subtitle')}
          title={isEditing ? t('workoutCreation.updateTitle') : t('workoutCreation.title')}
          lead={t('trainer.builder.summary', { days: formData.workout_days.length, exercises: totalExercises })}
        />

        {error && (
          <div className="tr-banner tr-banner--error mb-4" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            {error}
          </div>
        )}

        {/* Plan */}
        <SectionCard icon={ClipboardList} title={t('workoutCreation.planInformation', 'Plan information')} info={t('tt.info.planInfo')} className="tp-rise mb-5">
          <div className="grid gap-4 md:grid-cols-2">
            {client ? (
              <div className="flex items-center gap-3 rounded-[1.1rem] bg-foreground/[.04] p-3 md:col-span-2">
                <Avatar name={client.full_name} seed={client.id} size={44} src={(client as { avatar_url?: string | null }).avatar_url} />
                <div className="min-w-0">
                  <p className="tp-label">{t('workoutCreation.clientName')}</p>
                  <p className="truncate font-bold">{client.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground" dir="ltr">{client.email}</p>
                </div>
              </div>
            ) : (
              <Field label={`${t('workoutCreation.selectClient')} *`} htmlFor="client" className="md:col-span-2">
                <div className="relative">
                  <User className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <select
                    id="client"
                    className="tp-input appearance-none ps-11"
                    value={formData.client_id}
                    onChange={(e) => setFormData({ ...formData, client_id: parseInt(e.target.value) })}
                  >
                    <option value={0}>{t('workoutCreation.selectClientPlaceholder')}</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>
                    ))}
                  </select>
                </div>
              </Field>
            )}
            <Field label={t('workoutCreation.planNameRequired')} htmlFor="name">
              <input id="name" className="tp-input" placeholder={t('workoutCreation.planNamePlaceholder')} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </Field>
            <Field label={t('workoutCreation.durationWeeks')} htmlFor="duration_weeks" info={t('tt.info.duration')}>
              <input id="duration_weeks" type="number" inputMode="numeric" min={1} className="tp-input" placeholder="8" value={formData.duration_weeks || ''} onChange={(e) => setFormData({ ...formData, duration_weeks: parseInt(e.target.value) || null })} />
            </Field>
            <Field label={t('workoutCreation.description')} htmlFor="description" className="md:col-span-2">
              <textarea id="description" className="tp-input tr-textarea !min-h-[4.5rem]" rows={2} placeholder={t('workoutCreation.descriptionPlaceholder')} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </Field>
            <Field label={t('workoutCreation.splitType', 'Workout split')} hint={t('workoutCreation.splitHint')} className="md:col-span-2">
              <div className="flex gap-2">
                <Select
                  value={formData.split_type ? String(formData.split_type) : ''}
                  onValueChange={(value) => {
                    const selectedSplit = workoutSplits.find((s) => s.id === parseInt(value));
                    setFormData({ ...formData, split_type: value || null, days_per_week: selectedSplit?.days_per_week ?? null });
                  }}
                >
                  <SelectTrigger className="h-12 flex-1 rounded-2xl border-0 bg-foreground/[.05] shadow-[inset_0_0_0_1px_hsl(var(--foreground)/.1)]">
                    <SelectValue placeholder={t('workoutCreation.selectSplit')} />
                  </SelectTrigger>
                  <SelectContent>
                    {workoutSplits.map((split) => (
                      <SelectItem key={split.id} value={String(split.id)}>
                        {split.name}
                        {split.days_per_week ? ` (${split.days_per_week} ${t('workoutCreation.daysPerWeek')})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button type="button" className="tp-btn tp-btn--ghost tp-press" onClick={() => setShowCreateSplitDialog(true)}>
                  <Layers className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('workoutCreation.createSplit')}</span>
                </button>
              </div>
            </Field>
          </div>
        </SectionCard>

        {/* Builder */}
        <div className="tr-builder">
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="tp-label">{t('workoutCreation.workoutDays')} <span dir="ltr">({formData.workout_days.length})</span></p>
            </div>
            <div className="tr-days" role="tablist" aria-label={t('workoutCreation.workoutDays')}>
              {formData.workout_days.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === dayIndex}
                  data-invalid={d.exercises.length === 0 || !d.name.trim() || undefined}
                  onClick={() => setSelectedDay(i)}
                  className="tr-day"
                >
                  <span className="tr-day-num">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold" dir="auto">{d.name || dayLabel(i + 1)}</span>
                    <span className="block text-xs text-muted-foreground">{t('trainer.client.exercisesCount', { count: d.exercises.length })}</span>
                  </span>
                </button>
              ))}
              <button type="button" onClick={addWorkoutDay} className="tr-day tp-press justify-center border-2 border-dashed border-foreground/15 !bg-transparent !shadow-none text-sm font-bold text-muted-foreground hover:border-primary/60 hover:text-primary">
                <Plus className="h-4 w-4" />
                {t('workoutCreation.addDay')}
              </button>
            </div>
          </div>

          {day && (
            <div className="tr-tabpanel min-w-0 space-y-4" key={dayIndex} role="tabpanel">
              <SectionCard
                icon={CalendarDays}
                title={day.name || dayLabel(dayIndex + 1)}
                info={t('tt.info.day')}
                action={
                  formData.workout_days.length > 1 ? (
                    <button type="button" className="tr-handle tr-handle--danger" onClick={() => removeWorkoutDay(dayIndex)} aria-label={t('workoutCreation.removeDay')} title={t('workoutCreation.removeDay')}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null
                }
              >
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
                  <Field label={`${t('workoutCreation.dayName')} *`} htmlFor="day-name" error={day.name.trim() === '' ? t('workoutCreation.errorDayName') : undefined}>
                    <input id="day-name" className="tp-input" placeholder={t('workoutCreation.dayNamePlaceholder')} value={day.name} onChange={(e) => updateWorkoutDay(dayIndex, 'name', e.target.value)} required />
                  </Field>
                  <Field label={t('workoutCreation.estimatedDuration')} htmlFor="day-dur" info={t('tt.info.dayDuration')}>
                    <div className="relative">
                      <Clock className="pointer-events-none absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input id="day-dur" type="number" inputMode="numeric" className="tp-input pe-11" placeholder="60" value={day.estimated_duration || ''} onChange={(e) => updateWorkoutDay(dayIndex, 'estimated_duration', parseInt(e.target.value) || null)} />
                    </div>
                  </Field>
                  <Field label={t('workoutCreation.dayNotes')} htmlFor="day-notes" className="md:col-span-2">
                    <textarea id="day-notes" className="tp-input tr-textarea !min-h-[4rem]" rows={2} placeholder={t('workoutCreation.dayNotesPlaceholder')} value={day.notes} onChange={(e) => updateWorkoutDay(dayIndex, 'notes', e.target.value)} />
                  </Field>
                </div>
              </SectionCard>

              <ul className="space-y-3">
                {day.exercises.map((exercise, exerciseIndex) => {
                  const lib = exerciseById.get(exercise.exercise_id);
                  const id = `d${dayIndex}e${exerciseIndex}`;
                  return (
                    <li key={exercise._key ?? `${exercise.exercise_id}-${exerciseIndex}`} className="tp-card tr-ex tr-ex-enter">
                      <div className="flex items-start gap-3">
                        <div className="tr-ex-thumb flex-none"><ExerciseThumb exercise={lib ?? { name: exercise.exercise_name }} /></div>
                        <div className="tr-ex-title-sm min-w-0 flex-1">
                          <ExerciseTitle index={exerciseIndex} name={exercise.exercise_name || lib?.name} muscle={lib?.muscle_group} />
                        </div>
                      </div>
                      <div className="min-w-0 space-y-3">
                        <div className="flex items-start gap-2">
                          <div className="tr-ex-title-lg min-w-0 flex-1">
                            <ExerciseTitle index={exerciseIndex} name={exercise.exercise_name || lib?.name} muscle={lib?.muscle_group} />
                          </div>
                          <div className="ms-auto flex flex-none items-center">
                            <button type="button" className="tr-handle" disabled={exerciseIndex === 0} onClick={() => moveExercise(dayIndex, exerciseIndex, exerciseIndex - 1)} aria-label={t('trainer.builder.moveUp')} title={t('trainer.builder.moveUp')}>
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button type="button" className="tr-handle" disabled={exerciseIndex === day.exercises.length - 1} onClick={() => moveExercise(dayIndex, exerciseIndex, exerciseIndex + 1)} aria-label={t('trainer.builder.moveDown')} title={t('trainer.builder.moveDown')}>
                              <ArrowDown className="h-4 w-4" />
                            </button>
                            <button type="button" className="tr-handle tr-handle--danger" onClick={() => removeExercise(dayIndex, exerciseIndex)} aria-label={t('workoutCreation.removeExercise')} title={t('workoutCreation.removeExercise')}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="tr-ex-params">
                          <Field label={t('workoutCreation.sets')} htmlFor={`${id}s`} info={t('tt.info.sets')}>
                            <input id={`${id}s`} type="number" inputMode="numeric" min={1} max={10} className="tp-input tr-input-sm" placeholder={t('workoutCreation.setsPlaceholder')} value={exercise.target_sets ?? ''} onChange={(e) => updateExercise(dayIndex, exerciseIndex, 'target_sets', e.target.value ? parseInt(e.target.value) : null)} />
                          </Field>
                          <Field label={t('workoutCreation.reps')} htmlFor={`${id}r`} info={t('tt.info.reps')}>
                            <input id={`${id}r`} className="tp-input tr-input-sm" placeholder="8-12" dir="ltr" value={exercise.target_reps} onChange={(e) => updateExercise(dayIndex, exerciseIndex, 'target_reps', e.target.value)} />
                          </Field>
                          <Field label={t('workoutCreation.weight')} htmlFor={`${id}w`}>
                            <input id={`${id}w`} type="number" inputMode="decimal" step="0.5" className="tp-input tr-input-sm" placeholder="60" value={exercise.target_weight || ''} onChange={(e) => updateExercise(dayIndex, exerciseIndex, 'target_weight', parseFloat(e.target.value) || null)} />
                          </Field>
                          <Field label={t('workoutCreation.rest')} htmlFor={`${id}t`}>
                            <input id={`${id}t`} type="number" inputMode="numeric" step="15" className="tp-input tr-input-sm" placeholder="90" value={exercise.rest_seconds ?? ''} onChange={(e) => updateExercise(dayIndex, exerciseIndex, 'rest_seconds', e.target.value ? parseInt(e.target.value) : null)} />
                          </Field>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                          <Field label={t('workoutCreation.groupName')} htmlFor={`${id}g`}>
                            <input id={`${id}g`} className="tp-input tr-input-sm" placeholder={t('workoutCreation.groupNamePlaceholder')} title={t('workoutCreation.groupNameHint')} value={exercise.group_name || ''} onChange={(e) => updateExercise(dayIndex, exerciseIndex, 'group_name', e.target.value)} />
                          </Field>
                          <Field label={t('workoutCreation.exerciseNotes')} htmlFor={`${id}n`}>
                            <input id={`${id}n`} className="tp-input tr-input-sm" placeholder={t('workoutCreation.exerciseNotesPlaceholder')} value={exercise.notes} onChange={(e) => updateExercise(dayIndex, exerciseIndex, 'notes', e.target.value)} />
                          </Field>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className={cn(
                  'tp-press flex w-full flex-col items-center justify-center gap-2 rounded-[1.5rem] border-2 border-dashed px-4 text-center transition-colors hover:border-primary/60 hover:bg-primary/[.04]',
                  day.exercises.length ? 'min-h-[4.5rem] border-foreground/15 sm:flex-row' : 'min-h-[12rem] border-primary/35',
                )}
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_24px_-12px_hsl(var(--primary))]"><Plus className="h-5 w-5" /></span>
                <span>
                  <span className="block font-bold">{t('workoutCreation.addExercise')}</span>
                  {!day.exercises.length && <span className="mt-1 block max-w-xs text-sm text-muted-foreground">{t('trainer.builder.emptyDay')}</span>}
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="tr-actionbar ec-glass">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {isFormValid() ? (
              <span className="font-semibold text-foreground">{t('trainer.builder.summary', { days: formData.workout_days.length, exercises: totalExercises })}</span>
            ) : (
              t('workoutCreation.formValidationMessage')
            )}
          </p>
          <div className="flex gap-2">
            <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press" onClick={() => navigate(-1)}>{t('workoutCreation.cancel')}</button>
            <button type="button" className="tp-btn tp-btn--primary tp-btn--sm tp-press" onClick={handleSubmit} disabled={!isFormValid() || loading}>
              <Save className="h-4 w-4" />
              {loading
                ? t(isEditing ? 'workoutCreation.updating' : 'workoutCreation.creating')
                : t(isEditing ? 'workoutCreation.updateWorkoutPlan' : 'workoutCreation.createWorkoutPlan')}
            </button>
          </div>
        </div>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        exercises={exercises}
        loading={exercisesLoading}
        counts={dayCounts}
        subtitle={day?.name}
        onPick={(ex) => addExerciseToDay(dayIndex, ex)}
      />

      <Dialog open={showCreateSplitDialog} onOpenChange={setShowCreateSplitDialog}>
        <DialogContent className="rounded-[1.75rem]">
          <DialogHeader>
            <DialogTitle className="tp-title text-4xl">{t('workoutCreation.createNewSplit')}</DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-4">
            <Field label={`${t('workoutCreation.splitName')} *`} htmlFor="split-name">
              <input id="split-name" className="tp-input" placeholder={t('workoutCreation.splitNamePlaceholder')} value={newSplitName} onChange={(e) => setNewSplitName(e.target.value)} />
            </Field>
            <Field label={t('workoutCreation.description')} htmlFor="split-desc">
              <textarea id="split-desc" className="tp-input tr-textarea !min-h-[4rem]" rows={2} placeholder={t('workoutCreation.splitDescriptionPlaceholder')} value={newSplitDescription} onChange={(e) => setNewSplitDescription(e.target.value)} />
            </Field>
            <Field label={t('workoutCreation.daysPerWeek')} htmlFor="split-days">
              <input id="split-days" type="number" inputMode="numeric" min={1} max={7} className="tp-input" placeholder="6" value={newSplitDaysPerWeek || ''} onChange={(e) => setNewSplitDaysPerWeek(e.target.value ? parseInt(e.target.value) : null)} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press" onClick={() => setShowCreateSplitDialog(false)}>{t('trainer.common.cancel')}</button>
              <button type="button" className="tp-btn tp-btn--primary tp-btn--sm tp-press" onClick={createWorkoutSplit} disabled={!newSplitName.trim()}>
                <Plus className="h-4 w-4" />
                {t('workoutCreation.create')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

const ExerciseTitle: React.FC<{ index: number; name?: string; muscle?: string | null }> = ({ index, name, muscle }) => {
  const { t } = useTranslation();
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2">
        <span className="grid h-6 min-w-6 place-items-center rounded-lg bg-foreground/[.07] px-1 text-xs font-bold tabular-nums">{index + 1}</span>
        <span className="truncate font-bold">{name || t('workoutCreation.unnamedExercise')}</span>
      </p>
      {muscle && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Dumbbell className="h-3.5 w-3.5" />{t(`exerciseBank.muscleGroups.${muscle}`, muscle)}</p>}
    </div>
  );
};

export default CreateWorkoutPlanV2;
