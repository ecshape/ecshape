import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { AlertTriangle, ArrowDown, ArrowUp, ClipboardList, Dumbbell, Plus, Save, Trash2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, BackLink, Field, PageTitle, SectionCard } from '@/features/trainer/ui';
import ExercisePicker, { ExerciseThumb } from '@/features/trainer/ExercisePicker';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config/api';
import { useTranslation } from 'react-i18next';

interface Client {
  id: number;
  full_name: string;
  email: string;
  profile?: {
    injuries?: string;
    goals?: string;
  };
}

interface Exercise {
  id: number;
  name: string;
  description: string;
  muscle_group: string;
  equipment_needed?: string;
  instructions?: string;
  difficulty_level: string;
  library_id?: string | null;
  image_path?: string | null;
}

interface WorkoutExercise {
  exercise_id: number;
  exercise_name: string;
  exercise_description: string;
  muscle_group: string;
  order: number;
  sets: number;
  reps: string;
  weight?: number;
  rest_time: number;
  notes: string;
}

const CreateWorkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  // Get client from location state
  const client = location.state?.client as Client;

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    client_id: client?.id || null,
    sessions_count: 1,
    difficulty_level: 'beginner',
    estimated_duration: '',
    notes: ''
  });

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<WorkoutExercise[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(true);

  // Redirect non-trainers away from trainer-only pages
  useEffect(() => {
    if (user) {
      if (user.role === 'CLIENT') {
        navigate('/', { replace: true });
      }
      // Admin can access (for monitoring purposes)
    }
  }, [user, navigate]);

  // Fetch exercises from database
  useEffect(() => {
    const fetchExercises = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/exercises/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setExercises(data);
        }
      } catch (error) {
        console.error('Error fetching exercises:', error);
      } finally {
        setLoadingExercises(false);
      }
    };

    fetchExercises();
  }, []);

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const addExercise = (exercise: Exercise) => {
    const newWorkoutExercise: WorkoutExercise = {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      exercise_description: exercise.description,
      muscle_group: exercise.muscle_group,
      order: selectedExercises.length + 1,
      sets: 3,
      reps: '10-12',
      rest_time: 60,
      notes: ''
    };

    setSelectedExercises(prev => [...prev, newWorkoutExercise]);
  };

  const removeExercise = (index: number) => {
    setSelectedExercises(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Reorder remaining exercises
      return updated.map((exercise, i) => ({
        ...exercise,
        order: i + 1
      }));
    });
  };

  const updateExercise = (index: number, field: string, value: string | number) => {
    setSelectedExercises(prev => prev.map((exercise, i) => 
      i === index ? { ...exercise, [field]: value } : exercise
    ));
  };

  const moveExercise = (fromIndex: number, toIndex: number) => {
    setSelectedExercises(prev => {
      const updated = [...prev];
      const [movedExercise] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, movedExercise);
      return updated.map((exercise, i) => ({
        ...exercise,
        order: i + 1
      }));
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (selectedExercises.length === 0) {
      setError(t('trainer.builder.errNoExercises'));
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/workouts/plans`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          created_by: user?.id,
          estimated_duration: formData.estimated_duration ? parseInt(formData.estimated_duration) : null,
          exercises: selectedExercises
        }),
      });

      if (response.ok) {
        navigate('/trainer-dashboard?tab=workouts');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || t('workoutCreation.errorCreating'));
      }
    } catch (error) {
      setError(t('trainer.builder.errNetwork'));
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    return formData.name && formData.client_id && selectedExercises.length > 0;
  };

  const counts = new Map<number, number>();
  for (const e of selectedExercises) counts.set(e.exercise_id, (counts.get(e.exercise_id) ?? 0) + 1);
  const byId = new Map(exercises.map((e) => [e.id, e]));

  return (
    <Layout currentPage="dashboard">
      <div className="tr-page">
        <BackLink className="mb-4" />
        <PageTitle
          eyebrow={client ? t('trainer.builder.forClient', { name: client.full_name }) : t('workoutCreation.subtitle')}
          title={t('workoutCreation.title')}
        />

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="tr-grid-2">
            <SectionCard icon={ClipboardList} title={t('workoutCreation.workoutInformation')} info={t('tt.info.planInfo')} className={cn('tp-rise', !client && 'col-span-full')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('workoutCreation.workoutNameRequired')} htmlFor="name" className="sm:col-span-2">
                  <input id="name" className="tp-input" value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} placeholder={t('workoutCreation.workoutNamePlaceholder')} required />
                </Field>
                <Field label={t('workoutCreation.numberOfSessions')} htmlFor="sessions">
                  <input id="sessions" type="number" inputMode="numeric" className="tp-input" value={formData.sessions_count} onChange={(e) => handleInputChange('sessions_count', parseInt(e.target.value))} min="1" max="10" />
                </Field>
                <Field label={t('workoutCreation.estimatedDuration')} htmlFor="duration">
                  <input id="duration" type="number" inputMode="numeric" className="tp-input" value={formData.estimated_duration} onChange={(e) => handleInputChange('estimated_duration', e.target.value)} placeholder={t('trainer.builder.durationPlaceholder')} min="15" />
                </Field>
                <Field label={t('workoutCreation.difficultyLevel')} className="sm:col-span-2">
                  <div className="tr-seg w-full" role="radiogroup" aria-label={t('workoutCreation.difficultyLevel')}>
                    {(['beginner', 'intermediate', 'advanced'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        role="radio"
                        aria-checked={formData.difficulty_level === lvl}
                        onClick={() => handleInputChange('difficulty_level', lvl)}
                        className={cn('tr-seg-btn flex-1 justify-center', formData.difficulty_level === lvl && '!bg-primary !text-primary-foreground')}
                      >
                        {t(`workoutCreation.${lvl}`)}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={t('workoutCreation.description')} htmlFor="description" className="sm:col-span-2">
                  <textarea id="description" className="tp-input tr-textarea !min-h-[4.5rem]" value={formData.description} onChange={(e) => handleInputChange('description', e.target.value)} placeholder={t('workoutCreation.descriptionPlaceholder')} rows={2} />
                </Field>
                <Field label={t('workoutCreation.generalNotes')} htmlFor="notes" className="sm:col-span-2">
                  <input id="notes" className="tp-input" value={formData.notes} onChange={(e) => handleInputChange('notes', e.target.value)} placeholder={t('workoutCreation.generalNotesPlaceholder')} />
                </Field>
              </div>
            </SectionCard>

            {client && (
              <SectionCard icon={User} title={t('workoutCreation.clientInformation')} className="tp-rise" style={{ ['--i' as string]: 1 }}>
                <div className="mb-4 flex items-center gap-3">
                  <Avatar name={client.full_name} seed={client.id} size={52} />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">{client.full_name}</p>
                    <p className="truncate text-sm text-muted-foreground" dir="ltr">{client.email}</p>
                  </div>
                </div>
                <dl className="tr-dl">
                  <div><dt>{t('trainer.builder.goals')}</dt><dd>{client.profile?.goals || t('trainer.common.notSet')}</dd></div>
                  <div>
                    <dt className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />{t('trainer.builder.injuries')}</dt>
                    <dd className={client.profile?.injuries ? 'text-primary' : ''}>{client.profile?.injuries || t('trainer.common.notSet')}</dd>
                  </div>
                </dl>
              </SectionCard>
            )}
          </div>

          <SectionCard
            icon={Dumbbell}
            title={<>{t('workoutCreation.workoutExercises')} <span className="text-muted-foreground" dir="ltr">({selectedExercises.length})</span></>}
            action={
              selectedExercises.length > 0 ? (
                <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press" onClick={() => setPickerOpen(true)}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('workoutCreation.addExercise')}</span>
                </button>
              ) : null
            }
          >
            {selectedExercises.length === 0 ? (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="tp-press flex min-h-[12rem] w-full flex-col items-center justify-center gap-2 rounded-[1.5rem] border-2 border-dashed border-primary/35 px-4 text-center transition-colors hover:border-primary/60 hover:bg-primary/[.04]"
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_24px_-12px_hsl(var(--primary))]"><Plus className="h-6 w-6" /></span>
                <span className="font-bold">{t('workoutCreation.noExercisesSelected')}</span>
                <span className="max-w-xs text-sm text-muted-foreground">{t('trainer.builder.emptyDay')}</span>
              </button>
            ) : (
              <ul className="space-y-3">
                {selectedExercises.map((exercise, index) => {
                  const id = `cw${index}`;
                  return (
                    <li key={`${exercise.exercise_id}-${exercise.order}-${index}`} className="tr-ex tr-ex-enter rounded-[1.25rem] bg-foreground/[.03] shadow-[inset_0_0_0_1px_hsl(var(--foreground)/.06)]">
                      <div className="flex items-start gap-3">
                        <div className="tr-ex-thumb flex-none"><ExerciseThumb exercise={byId.get(exercise.exercise_id) ?? { name: exercise.exercise_name }} /></div>
                        <div className="tr-ex-title-sm min-w-0 flex-1"><Title index={index} ex={exercise} /></div>
                      </div>
                      <div className="min-w-0 space-y-3">
                        <div className="flex items-start gap-2">
                          <div className="tr-ex-title-lg min-w-0 flex-1"><Title index={index} ex={exercise} /></div>
                          <div className="ms-auto flex flex-none items-center">
                            <button type="button" className="tr-handle" disabled={index === 0} onClick={() => moveExercise(index, index - 1)} aria-label={t('trainer.builder.moveUp')} title={t('trainer.builder.moveUp')}><ArrowUp className="h-4 w-4" /></button>
                            <button type="button" className="tr-handle" disabled={index === selectedExercises.length - 1} onClick={() => moveExercise(index, index + 1)} aria-label={t('trainer.builder.moveDown')} title={t('trainer.builder.moveDown')}><ArrowDown className="h-4 w-4" /></button>
                            <button type="button" className="tr-handle tr-handle--danger" onClick={() => removeExercise(index)} aria-label={t('workoutCreation.removeExercise')} title={t('workoutCreation.removeExercise')}><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </div>
                        <div className="tr-ex-params">
                          <Field label={t('workoutCreation.sets')} htmlFor={`${id}s`}>
                            <input id={`${id}s`} type="number" inputMode="numeric" className="tp-input tr-input-sm" value={exercise.sets} onChange={(e) => updateExercise(index, 'sets', parseInt(e.target.value))} min="1" />
                          </Field>
                          <Field label={t('workoutCreation.reps')} htmlFor={`${id}r`}>
                            <input id={`${id}r`} className="tp-input tr-input-sm" dir="ltr" value={exercise.reps} onChange={(e) => updateExercise(index, 'reps', e.target.value)} placeholder="10-12" />
                          </Field>
                          <Field label={t('workoutCreation.weight')} htmlFor={`${id}w`}>
                            <input id={`${id}w`} type="number" inputMode="decimal" className="tp-input tr-input-sm" value={exercise.weight || ''} onChange={(e) => updateExercise(index, 'weight', e.target.value ? parseFloat(e.target.value) : (null as unknown as number))} placeholder={t('trainer.builder.optional')} />
                          </Field>
                          <Field label={t('workoutCreation.rest')} htmlFor={`${id}t`}>
                            <input id={`${id}t`} type="number" inputMode="numeric" className="tp-input tr-input-sm" value={exercise.rest_time} onChange={(e) => updateExercise(index, 'rest_time', parseInt(e.target.value))} min="30" />
                          </Field>
                        </div>
                        <Field label={t('trainer.builder.personalNotes')} htmlFor={`${id}n`}>
                          <textarea id={`${id}n`} className="tp-input tr-textarea !min-h-[3.5rem] text-sm" value={exercise.notes} onChange={(e) => updateExercise(index, 'notes', e.target.value)} placeholder={t('trainer.builder.personalNotesPlaceholder')} rows={2} />
                        </Field>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <div className="tr-actionbar ec-glass">
            <div className="min-w-0 flex-1" aria-live="polite">
              {error ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--tr-bad))]"><AlertTriangle className="h-4 w-4 flex-none" />{error}</p>
              ) : (
                <p className="truncate text-sm text-muted-foreground">{t('trainer.builder.results', { count: selectedExercises.length })}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press" onClick={() => navigate('/trainer-dashboard')} disabled={loading}>{t('workoutCreation.cancel')}</button>
              <button type="submit" className="tp-btn tp-btn--primary tp-btn--sm tp-press" disabled={!isFormValid() || loading}>
                <Save className="h-4 w-4" />
                {loading ? t('workoutCreation.creating') : t('workoutCreation.createWorkoutPlan')}
              </button>
            </div>
          </div>
        </form>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        exercises={exercises}
        loading={loadingExercises}
        counts={counts}
        onPick={(ex) => addExercise(ex as Exercise)}
      />
    </Layout>
  );
};

const Title: React.FC<{ index: number; ex: { exercise_name: string; muscle_group: string } }> = ({ index, ex }) => {
  const { t } = useTranslation();
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2">
        <span className="grid h-6 min-w-6 place-items-center rounded-lg bg-foreground/[.07] px-1 text-xs font-bold tabular-nums">{index + 1}</span>
        <span className="truncate font-bold">{ex.exercise_name}</span>
      </p>
      {ex.muscle_group && <p className="mt-1 text-xs text-muted-foreground">{t(`exerciseBank.muscleGroups.${ex.muscle_group}`, ex.muscle_group)}</p>}
    </div>
  );
};

export default CreateWorkout; 