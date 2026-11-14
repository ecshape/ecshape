import React, { useMemo, useState } from 'react';
import { EcSpinner } from '@/components/brand/EcLoader';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Dumbbell, Home, Salad, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/features/trainee/api';
import { InfoTip } from '@/components/ui/info-tip';
import { useToast } from '@/hooks/use-toast';
import { LevelBars } from '@/components/exercises/ExerciseLibrary';
import { Seg, Sheet } from './ui';
import { useTrainerClients } from './hooks';
import {
  FOODS, MEAL_TEMPLATES, WORKOUT_TEMPLATES, libName, pick,
  type MealTemplate, type RefFood, type WorkoutTemplate,
} from './planTemplates';

type Kind = 'workout' | 'meal';
interface BankExercise { id: number; library_id?: string | null }
interface BankFood { name: string; name_hebrew?: string | null; calories?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null; measurement_type?: string | null; serving_size?: string | null }

/** Food option payload for a template food: the trainer's own bank item when the name matches, else the reference values. */
function foodOption(ref: RefFood, bank: BankFood[]) {
  const hit = bank.find((b) => {
    const hay = `${b.name ?? ''} ${b.name_hebrew ?? ''}`.toLowerCase();
    return ref.match.some((m) => hay.includes(m));
  });
  if (hit) {
    return {
      name: hit.name, name_hebrew: hit.name_hebrew ?? null, calories: hit.calories ?? null, protein: hit.protein ?? null,
      carbs: hit.carbs ?? null, fat: hit.fat ?? null, serving_size: hit.serving_size ?? null,
      measurement_type: hit.measurement_type === 'per_portion' ? 'per_portion' : 'per_100g',
    };
  }
  return { name: ref.name, name_hebrew: ref.he, calories: ref.kcal, protein: ref.p, carbs: ref.c, fat: ref.f, serving_size: ref.serving ?? null, measurement_type: ref.per };
}

async function assignWorkout(tpl: WorkoutTemplate, clientId: number, lang: string) {
  const ids = [...new Set(tpl.days.flatMap((d) => d.ex.map((e) => e.lib)))];
  await api('/exercise-library/import', { method: 'POST', body: { ids, lang: lang.slice(0, 2) } });
  const bank = await api<BankExercise[]>('/exercises/');
  const byLib = new Map(bank.filter((e) => e.library_id).map((e) => [e.library_id as string, e.id]));
  return api('/v2/workouts/plans/complete', {
    method: 'POST',
    body: {
      client_id: clientId,
      name: pick(tpl.name, lang),
      description: pick(tpl.goal, lang),
      split_type: tpl.split,
      days_per_week: tpl.daysPerWeek,
      duration_weeks: tpl.weeks,
      workout_days: tpl.days.map((d, di) => ({
        name: pick(d.name, lang),
        order_index: di,
        exercises: d.ex
          .filter((e) => byLib.has(e.lib))
          .map((e, ei) => ({ exercise_id: byLib.get(e.lib), order_index: ei, target_sets: e.sets, target_reps: e.reps, rest_seconds: e.rest })),
      })),
    },
  });
}

async function assignMeal(tpl: MealTemplate, clientId: number, lang: string) {
  const bank = await api<BankFood[]>('/v2/meals/meal-bank?include_public=true').catch(() => [] as BankFood[]);
  return api('/v3/meals/plans', {
    method: 'POST',
    body: {
      client_id: clientId,
      name: pick(tpl.name, lang),
      description: pick(tpl.goal, lang),
      number_of_meals: tpl.slots.length,
      total_calories: tpl.kcal,
      protein_target: tpl.p,
      carb_target: tpl.c,
      fat_target: tpl.f,
      start_date: new Date().toISOString(),
      meal_slots: tpl.slots.map((s) => ({
        name: pick(s.name, lang),
        time_suggestion: s.time,
        target_calories: s.kcal,
        macro_categories: s.cats.map((cat) => ({
          macro_type: cat.macro,
          quantity_instruction: pick(cat.qty, lang),
          food_options: cat.foods.map((k, i) => ({ ...foodOption(FOODS[k], bank), order_index: i })),
        })),
      })),
    },
  });
}

/**
 * Ready-made plans (#15): browse workout and meal templates, preview one, assign it to a client in one click.
 * Assigning replaces the client's active plan of that kind (same behaviour as the plan builders).
 */
export const TemplatesSheet: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; initialKind?: Kind }> = ({ open, onOpenChange, initialKind = 'workout' }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'he';
  const { toast } = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [selected, setSelected] = useState<string | null>(null);
  const [clientId, setClientId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const { data: clients = [] } = useTrainerClients();

  React.useEffect(() => {
    if (open) { setKind(initialKind); setSelected(null); }
  }, [open, initialKind]);

  const workout = useMemo(() => WORKOUT_TEMPLATES.find((w) => w.id === selected) ?? null, [selected]);
  const meal = useMemo(() => MEAL_TEMPLATES.find((m) => m.id === selected) ?? null, [selected]);
  const current = kind === 'workout' ? workout : meal;
  const activeClients = clients.filter((c) => c.is_active !== false);

  const assign = async () => {
    if (!current || !clientId) return;
    setBusy(true);
    try {
      if (kind === 'workout' && workout) await assignWorkout(workout, clientId, lang);
      if (kind === 'meal' && meal) await assignMeal(meal, clientId, lang);
      const who = clients.find((c) => c.id === clientId)?.full_name ?? '';
      toast({ title: t('tt.tpl.assigned', { plan: pick(current.name, lang), client: who }) });
      qc.invalidateQueries({ queryKey: ['trainer'] });
      onOpenChange(false);
    } catch (e) {
      toast({ title: t('common.error'), description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const levelLabel = (l: string) => t(`exerciseLibrary.level.${l}`, { defaultValue: l });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={current ? pick(current.name, lang) : t('tt.tpl.title')}
      description={current ? pick(current.goal, lang) : t('tt.tpl.lead')}
      footer={current ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="tr-tpl-client">
            <UserRound className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
            <span className="sr-only">{t('tt.tpl.client')}</span>
            <select value={clientId} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">{t('tt.tpl.pickClient')}</option>
              {activeClients.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.username}</option>)}
            </select>
          </label>
          <button type="button" className="tp-btn tp-btn--primary tp-btn--sm tp-press" disabled={!clientId || busy} onClick={assign}>
            {busy && <EcSpinner className="h-4 w-4" mono />}
            {t('tt.tpl.assign')}
          </button>
        </div>
      ) : undefined}
    >
      {!current ? (
        <div className="space-y-4 pb-2">
          <Seg<Kind>
            value={kind}
            onChange={(k) => { setKind(k); setSelected(null); }}
            label={t('tt.tpl.title')}
            items={[
              { id: 'workout', label: t('tt.tpl.workouts'), icon: Dumbbell, count: WORKOUT_TEMPLATES.length },
              { id: 'meal', label: t('tt.tpl.meals'), icon: Salad, count: MEAL_TEMPLATES.length },
            ]}
          />
          <div className="tr-tpl-grid">
            {kind === 'workout'
              ? WORKOUT_TEMPLATES.map((w) => (
                <button key={w.id} type="button" className="tp-card tr-tpl-card tr-lift text-start" onClick={() => setSelected(w.id)}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="tr-kpi-ico !h-9 !w-9">{w.place === 'home' ? <Home className="h-[18px] w-[18px]" /> : <Dumbbell className="h-[18px] w-[18px]" />}</span>
                    <LevelBars level={w.level} />
                  </span>
                  <span className="mt-3 block font-bold leading-snug">{pick(w.name, lang)}</span>
                  <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{pick(w.goal, lang)}</span>
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    <span className="tp-chip"><CalendarDays className="h-3.5 w-3.5" />{t('tt.tpl.perWeek', { count: w.daysPerWeek })}</span>
                    <span className="tp-chip">{levelLabel(w.level)}</span>
                  </span>
                </button>
              ))
              : MEAL_TEMPLATES.map((m) => (
                <button key={m.id} type="button" className="tp-card tr-tpl-card tr-lift text-start" onClick={() => setSelected(m.id)}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="tr-kpi-ico !h-9 !w-9"><Salad className="h-[18px] w-[18px]" /></span>
                    <span className="tp-num text-lg" dir="ltr">{m.kcal}<span className="ms-0.5 text-xs text-muted-foreground">kcal</span></span>
                  </span>
                  <span className="mt-3 block font-bold leading-snug">{pick(m.name, lang)}</span>
                  <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{pick(m.goal, lang)}</span>
                  <span className="mt-3 flex flex-wrap gap-1.5" dir="ltr">
                    <span className="tp-chip">P {m.p}g</span><span className="tp-chip">C {m.c}g</span><span className="tp-chip">F {m.f}g</span>
                  </span>
                </button>
              ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <button type="button" className="tr-back tp-press" onClick={() => setSelected(null)}>
            <ArrowLeft className="h-4 w-4" />
            {t('tt.tpl.all')}
          </button>
          <p className="flex items-start gap-1.5 rounded-2xl bg-foreground/[.04] p-3 text-xs text-muted-foreground">
            {kind === 'workout' ? t('tt.tpl.workoutNote') : t('tt.tpl.mealNote')}
            <InfoTip>{t('tt.tpl.replaceNote')}</InfoTip>
          </p>
          {workout && (
            <>
              <div className="flex flex-wrap gap-1.5">
                <span className="tp-chip"><CalendarDays className="h-3.5 w-3.5" />{t('tt.tpl.perWeek', { count: workout.daysPerWeek })}</span>
                <span className="tp-chip">{t('tt.tpl.weeks', { count: workout.weeks })}</span>
                <span className="tp-chip">{levelLabel(workout.level)}</span>
              </div>
              <div className="tr-tpl-days">
                {workout.days.map((d, i) => (
                  <section key={i} className="tp-card p-4">
                    <h3 className="mb-2 text-sm font-bold">{pick(d.name, lang)}</h3>
                    <ol className="space-y-1.5 text-sm">
                      {d.ex.map((e, j) => (
                        <li key={j} className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate" dir="ltr">{libName(e.lib)}</span>
                          <span className="flex-none text-xs tabular-nums text-muted-foreground" dir="ltr">{e.sets} x {e.reps}</span>
                        </li>
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            </>
          )}
          {meal && (
            <>
              <div className="grid grid-cols-4 gap-2 text-center" dir="ltr">
                {([['kcal', meal.kcal], ['P', meal.p], ['C', meal.c], ['F', meal.f]] as const).map(([k, v]) => (
                  <div key={String(k)} className="tr-stat !p-2.5"><p className="tp-label">{String(k)}</p><p className="tp-num mt-0.5 text-lg">{String(v)}{k === 'kcal' ? '' : 'g'}</p></div>
                ))}
              </div>
              <div className="tr-tpl-days">
                {meal.slots.map((s, i) => (
                  <section key={i} className="tp-card p-4">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-bold">{pick(s.name, lang)}</h3>
                      <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">{s.time} · {s.kcal} kcal</span>
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {s.cats.map((cat, j) => (
                        <li key={j} className="flex items-baseline gap-2">
                          <span className={cn('tp-chip flex-none', cat.macro === 'protein' && 'tp-chip--primary')}>{t(`foodBankPro.macro.${cat.macro}`)}</span>
                          <span className="min-w-0 text-muted-foreground">
                            {cat.foods.map((k) => (lang.startsWith('he') ? FOODS[k].he : FOODS[k].name)).join(' / ')}
                            <span className="ms-1 text-xs">({pick(cat.qty, lang)})</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
};

export default TemplatesSheet;
