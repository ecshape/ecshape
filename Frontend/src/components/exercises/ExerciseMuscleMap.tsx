import React from 'react';
import { useTranslation } from 'react-i18next';
import BodyMap from '@/features/trainee/BodyMap';
import { exerciseLoad } from '@/features/trainee/training/muscles';
import '@/i18n/ticketsStudio';

/**
 * Front / back body with the worked muscles lit (primary full, secondary softer), the same map as in the trainee's
 * training plans (QA #32). Used in the exercise bank and library pop-ups.
 */
export const ExerciseMuscleMap: React.FC<{ primary: string[]; secondary?: string[]; label?: (m: string) => string }> = ({ primary, secondary = [], label }) => {
  const { t } = useTranslation();
  const load = exerciseLoad({ primary_muscles: primary, secondary_muscles: secondary } as Parameters<typeof exerciseLoad>[0]);
  if (!Object.keys(load).length) return null;
  const names = [...primary, ...secondary].map((m) => (label ? label(m) : m));
  return (
    <section className="tp-card flex items-center gap-4 p-4">
      <BodyMap load={load} size="md" className="!w-40 flex-none" title={names.join(', ')} />
      <div className="min-w-0 space-y-2 text-sm">
        <p className="tp-label">{t('exerciseLibrary.musclesWorked', { defaultValue: 'Muscles worked' })}</p>
        <p className="flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 flex-none rounded-full bg-primary" />{primary.map((m) => (label ? label(m) : m)).join(', ')}</p>
        {secondary.length > 0 && (
          <p className="flex items-center gap-2 text-muted-foreground"><i className="inline-block h-2.5 w-2.5 flex-none rounded-full bg-primary/45" />{secondary.map((m) => (label ? label(m) : m)).join(', ')}</p>
        )}
      </div>
    </section>
  );
};

export default ExerciseMuscleMap;
