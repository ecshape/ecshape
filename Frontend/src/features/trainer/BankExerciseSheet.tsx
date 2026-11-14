import React, { useEffect, useState } from 'react';
import '@/i18n/ticketsStudio';
import { useTranslation } from 'react-i18next';
import { BookOpen, Pencil, Trash2, Video, Weight, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ExerciseDemo } from '@/components/exercises/ExerciseDemo';
import { LevelBars } from '@/components/exercises/ExerciseLibrary';
import { exerciseFrames } from '@/lib/exerciseLibrary';
import { ExerciseMuscleMap } from '@/components/exercises/ExerciseMuscleMap';

export interface BankExercise {
  id: number;
  name: string;
  description: string;
  muscle_group: string;
  equipment_needed?: string;
  instructions?: string;
  video_url?: string;
  image_path?: string;
  category?: string;
  library_id?: string | null;
  created_by: number;
}

export const bankLevel = (e: { description?: string | null }) => {
  const s = e.description || '';
  return /\bexpert\b/.test(s) ? 'expert' : /\bintermediate\b/.test(s) ? 'intermediate' : /\bbeginner\b/.test(s) ? 'beginner' : '';
};

/** Library imports store "level · mechanic · force · also: a, b · credit" in the description; split it back out. */
function parseDescription(e: BankExercise) {
  const parts = (e.description || '').split(' · ').map((s) => s.trim()).filter(Boolean);
  if (!e.library_id) return { secondary: [] as string[], meta: [] as string[], text: e.description || '' };
  const also = parts.find((p) => p.startsWith('also: '));
  return {
    secondary: also ? also.slice(6).split(',').map((s) => s.trim()).filter(Boolean) : [],
    meta: parts.filter((p) => p !== also && ['compound', 'isolation', 'push', 'pull', 'static'].includes(p)),
    text: '',
  };
}

/**
 * Detail panel for an exercise of the trainer's bank (#16), modelled on the library's detail sheet:
 * animated demo, muscles, equipment, level, numbered instructions, edit and delete.
 */
export const BankExerciseSheet: React.FC<{
  exercise: BankExercise | null;
  onClose: () => void;
  muscleLabel: (slug: string) => string;
  onEdit: (e: BankExercise) => void;
  onDelete: (e: BankExercise) => void;
}> = ({ exercise, onClose, muscleLabel, onEdit, onDelete }) => {
  const { t, i18n } = useTranslation();
  const [last, setLast] = useState<BankExercise | null>(exercise);
  useEffect(() => { if (exercise) setLast(exercise); }, [exercise]);
  const e = exercise ?? last;
  const label = (group: 'muscle' | 'equipment' | 'level' | 'meta', key: string) => t(`exerciseLibrary.${group}.${key}`, { defaultValue: key });

  return (
    <DialogPrimitive.Root open={!!exercise} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="tr-xs-overlay" />
        <DialogPrimitive.Content className="tr-xs-panel tp-root focus:outline-none" dir={i18n.dir()}>
          {e && (() => {
            const frames = exerciseFrames(e);
            const level = bankLevel(e);
            const info = parseDescription(e);
            const steps = (e.instructions || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
            return (
              <>
                <div className="relative flex-none">
                  {frames.length > 0 ? (
                    <ExerciseDemo frames={frames} alt={e.name} className="aspect-[4/3] w-full" playing />
                  ) : (
                    <div className="grid aspect-[16/9] w-full place-items-center bg-primary/10 text-primary"><BookOpen className="h-10 w-10" /></div>
                  )}
                  <DialogPrimitive.Close className="tr-xs-close tp-press" aria-label={t('tt.common.close')}>
                    <X className="h-5 w-5" />
                  </DialogPrimitive.Close>
                </div>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
                  <div>
                    <DialogPrimitive.Title className="tp-title pe-12 text-4xl leading-none" style={{ textAlign: 'start' }}><bdi>{e.name}</bdi></DialogPrimitive.Title>
                    <DialogPrimitive.Description className="sr-only">{muscleLabel(e.muscle_group)}</DialogPrimitive.Description>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                      <span className="rounded-full bg-primary px-2.5 py-1 font-semibold text-primary-foreground">{muscleLabel(e.muscle_group)}</span>
                      {info.secondary.map((m) => <span key={m} className="rounded-full bg-primary/12 px-2.5 py-1 text-primary">{label('muscle', m)}</span>)}
                      {e.equipment_needed && <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1"><Weight className="h-3 w-3" />{label('equipment', e.equipment_needed)}</span>}
                      {level && <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"><LevelBars level={level} />{label('level', level)}</span>}
                      {e.category && <span className="rounded-full bg-muted px-2.5 py-1">{e.category}</span>}
                      {info.meta.map((m) => <span key={m} className="rounded-full bg-muted px-2.5 py-1">{label('meta', m)}</span>)}
                    </div>
                  </div>
                  {info.text && <p className="text-sm leading-relaxed text-muted-foreground" dir="auto">{info.text}</p>}
                  <ExerciseMuscleMap primary={[e.muscle_group]} secondary={info.secondary} label={(m) => (m === e.muscle_group ? muscleLabel(m) : label('muscle', m))} />
                  <section>
                    <h3 className="tp-label mb-2.5">{t('tt.bank.instructions')}</h3>
                    {steps.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('banks.exercise.noInstructions')}</p>
                    ) : (
                      <ol className="space-y-3" dir="auto">
                        {steps.map((s, i) => (
                          <li key={i} className="flex gap-3 text-sm leading-relaxed">
                            <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-primary/12 text-xs font-bold text-primary">{i + 1}</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                  {e.video_url && (
                    <a href={e.video_url} target="_blank" rel="noopener noreferrer" className="tp-btn tp-btn--ghost tp-btn--sm tp-press w-full">
                      <Video className="h-4 w-4" />{t('exerciseBank.videoTutorial')}
                    </a>
                  )}
                </div>
                <div className="flex flex-none gap-2 border-t border-border/50 px-5 py-3 sm:px-6">
                  <button type="button" className="tp-btn tp-btn--primary tp-btn--sm tp-press flex-1" onClick={() => onEdit(e)}>
                    <Pencil className="h-4 w-4" />{t('tt.common.edit')}
                  </button>
                  <button type="button" className="tp-icon-btn tp-press text-[hsl(var(--tr-bad))]" onClick={() => onDelete(e)} aria-label={t('tt.common.delete')} title={t('tt.common.delete')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </>
            );
          })()}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default BankExerciseSheet;
