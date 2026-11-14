import React, { useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { Check, Dumbbell, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import ExerciseDemo from '@/components/exercises/ExerciseDemo';
import { exerciseFrames } from '@/lib/exerciseLibrary';
import '@/styles/exercises.css';
import { Skel } from './ui';

export interface PickableExercise {
  id: number;
  name: string;
  muscle_group?: string | null;
  equipment_needed?: string | null;
  difficulty_level?: string | null;
  description?: string | null;
  library_id?: string | null;
  image_path?: string | null;
  video_url?: string | null;
}

/** Small looping demo for an exercise (library frames, uploaded image, or a designed placeholder). */
export const ExerciseThumb: React.FC<{ exercise?: Partial<PickableExercise> | null; className?: string; alt?: string }> = ({ exercise, className, alt }) => (
  <ExerciseDemo frames={exercise ? exerciseFrames(exercise) : []} alt={alt ?? exercise?.name ?? ''} className={cn('h-full w-full bg-foreground/[.05]', className)} />
);

/**
 * Full-screen exercise picker (bottom sheet on phones): search, muscle filter, animated demo cards.
 * Stays open so several exercises can be added in a row; each card shows how many times it is already in the day.
 */
const ExercisePicker: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  exercises: PickableExercise[];
  loading?: boolean;
  onPick: (e: PickableExercise) => void;
  counts?: Map<number, number>;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
}> = ({ open, onOpenChange, exercises, loading, onPick, counts, title, subtitle }) => {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('all');
  const [added, setAdded] = useState(0);

  useEffect(() => {
    if (open) setAdded(0);
  }, [open]);

  const muscles = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of exercises) if (e.muscle_group) m.set(e.muscle_group, (m.get(e.muscle_group) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [exercises]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return exercises.filter(
      (e) =>
        (muscle === 'all' || e.muscle_group === muscle) &&
        (!s || e.name?.toLowerCase().includes(s) || e.muscle_group?.toLowerCase().includes(s) || t(`exerciseBank.muscleGroups.${e.muscle_group}`, '').toLowerCase().includes(s)),
    );
  }, [exercises, q, muscle, t]);

  const muscleLabel = (m: string) => t(`exerciseBank.muscleGroups.${m}`, m);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <div className="tr-root tp-root tr-picker" dir={i18n.language?.startsWith('he') ? 'rtl' : 'ltr'}>
          <DialogPrimitive.Overlay className="tr-picker-scrim" />
          <DialogPrimitive.Content className="tr-picker-panel focus:outline-none" aria-describedby={undefined}>
            <div className="mx-auto mt-2.5 h-1.5 w-12 flex-none rounded-full bg-foreground/15 md:hidden" />
            <header className="flex-none space-y-3 px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogPrimitive.Title className="tp-title text-4xl">{title ?? t('workoutCreation.selectExercise')}</DialogPrimitive.Title>
                  {subtitle && <p className="mt-1 truncate text-sm text-muted-foreground">{subtitle}</p>}
                </div>
                <DialogPrimitive.Close className="tp-icon-btn tp-press" aria-label={t('trainer.common.close')}>
                  <X className="h-5 w-5" />
                </DialogPrimitive.Close>
              </div>
              <div className="tr-search">
                <Search />
                <input
                  type="search"
                  autoFocus
                  className="tp-input"
                  placeholder={t('workoutCreation.searchExercisePlaceholder', 'Search exercise or muscle group...')}
                  aria-label={t('workoutCreation.searchExercisePlaceholder', 'Search exercise or muscle group...')}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              {muscles.length > 1 && (
                <div className="tp-scroll-x -mx-4 px-4 sm:-mx-6 sm:px-6" role="group" aria-label={t('trainer.builder.muscleFilter')}>
                  {['all', ...muscles].map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={muscle === m}
                      onClick={() => setMuscle(m)}
                      className={cn('tp-chip tp-press min-h-[2.25rem] px-3.5 text-[13px]', muscle === m && '!bg-primary !text-primary-foreground')}
                    >
                      {m === 'all' ? t('trainer.builder.allMuscles') : muscleLabel(m)}
                    </button>
                  ))}
                </div>
              )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
              {loading ? (
                <div className="tr-picker-grid">
                  {Array.from({ length: 8 }, (_, i) => <Skel key={i} className="aspect-[4/5] rounded-[1.25rem]" />)}
                </div>
              ) : exercises.length === 0 ? (
                <Empty icon={Dumbbell} text={t('workoutCreation.noExercisesAvailable', 'No exercises available. Please create exercises first.')} />
              ) : list.length === 0 ? (
                <Empty icon={Search} text={t('workoutCreation.noExercisesMatchSearch', 'No exercises match your search.')} />
              ) : (
                <ul className="tr-picker-grid">
                  {list.map((ex, i) => {
                    const n = counts?.get(ex.id) ?? 0;
                    return (
                      <li key={ex.id} className="tp-rise" style={{ ['--i' as string]: Math.min(i, 12) }}>
                        <button
                          type="button"
                          className="tr-pick w-full"
                          data-added={n > 0 || undefined}
                          onClick={() => {
                            onPick(ex);
                            setAdded((a) => a + 1);
                          }}
                          aria-label={`${t('workoutCreation.addExercise')}: ${ex.name}`}
                        >
                          <span className="tr-pick-media block">
                            <ExerciseThumb exercise={ex} alt="" />
                            <span className="tr-pick-add">{n > 0 ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</span>
                            {n > 1 && <span className="tr-pick-count tp-chip tp-chip--primary !bg-primary !text-white" dir="ltr">×{n}</span>}
                          </span>
                          <span className="block p-3">
                            <span className="line-clamp-2 block text-sm font-bold leading-snug">{ex.name || t('workoutCreation.unnamedExercise', 'Unnamed exercise')}</span>
                            {ex.muscle_group && <span className="mt-1 block truncate text-xs text-muted-foreground">{muscleLabel(ex.muscle_group)}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <footer className="flex flex-none items-center justify-between gap-3 border-t border-border/50 px-4 py-3 sm:px-6">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {added > 0 ? t('trainer.builder.addedCount', { count: added }) : t('trainer.builder.results', { count: list.length })}
              </p>
              <DialogPrimitive.Close className="tp-btn tp-btn--primary tp-btn--sm tp-press">
                <Check className="h-4 w-4" />
                {t('trainer.builder.done')}
              </DialogPrimitive.Close>
            </footer>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

const Empty: React.FC<{ icon: React.ElementType; text: string }> = ({ icon: Icon, text }) => (
  <div className="flex flex-col items-center px-6 py-16 text-center">
    <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/12 text-primary"><Icon className="h-7 w-7" /></span>
    <p className="max-w-xs text-sm text-muted-foreground">{text}</p>
  </div>
);

export default ExercisePicker;
