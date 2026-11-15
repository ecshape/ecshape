import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeftRight, Loader2, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Heart, MessageCircle, Minus, NotebookPen, Plus, RotateCcw, Search, Sparkles, Trash2, UtensilsCrossed,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { mediaUrl } from '@/lib/mediaUrl';
import type { MacroType, V3DayViewResponse, V3FoodOption, V3MealLogCreateRequest, V3MealSlotView } from '@/types/meals-v3';
import { useCatalog, useCompleteMeal, useFoodBank, useMealCompletions, useMealDay, useMealWrite, useSendCoachMessage } from './hooks';
import AddMealSheet from './AddMealSheet';
import { useTranslatedMap } from './useTranslated';
import { FoodThumb, HitRow, useDebounced } from './AddMealSheet';
import { useFoodSearch, useLocalizedHits, useLogSaved, useSavedMeals, type FoodHit } from './mealTools';
import { CountUp, EmptyState, ErrorState, Ring, Screen, ScreenHeader, Sheet, Skel } from './ui';
import { addDays, fmtDate, fmtNum, fmtWeekday, haptic, parseDate, todayISO } from './format';
import {
  encodeBankSwap, encodePlanSwap, foodMacros, isOverallCustom, planRows, rowMacros, safeName, slotConsumed, type PlanRow,
} from './mealLogic';

const MACRO_COLOR: Record<string, string> = { protein: 'hsl(var(--tp-protein))', carbs: 'hsl(var(--tp-carbs))', carb: 'hsl(var(--tp-carbs))', fat: 'hsl(var(--tp-fat))' };
const macroKey = (m: MacroType) => (m === 'carb' ? 'carbs' : m);

type RowGroup = { macro: PlanRow['macro']; rows: PlanRow[]; eaten?: PlanRow };
/** Plan rows grouped by macro category: the foods of a category are alternatives. */
const groupRows = (rows: PlanRow[]): RowGroup[] => {
  const out: RowGroup[] = [];
  for (const r of rows) {
    let g = out.find((x) => x.macro === r.macro);
    if (!g) out.push((g = { macro: r.macro, rows: [] }));
    g.rows.push(r);
    if (r.choice && !g.eaten) g.eaten = r;
  }
  return out;
};

/** QA #60: planned foods the trainee removed from a day's meal ("date:slot:macro" keys), kept on this device. */
const REMOVED_KEY = 'ec-meal-removed';
const loadRemoved = (): Record<string, true> => {
  try {
    const all = JSON.parse(localStorage.getItem(REMOVED_KEY) || '{}') as Record<string, true>;
    // Forget anything older than 60 days so the list stays small.
    const cutoff = addDays(todayISO(), -60);
    return Object.fromEntries(Object.entries(all).filter(([k]) => k.slice(0, 10) >= cutoff)) as Record<string, true>;
  } catch { return {}; }
};

const MealsScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const he = i18n.language?.startsWith('he');
  const today = todayISO();
  const [date, setDate] = useState(today);
  const day = useMealDay(date, date === today);
  const completions = useMealCompletions(date, date === today);
  const write = useMealWrite(date);
  const complete = useCompleteMeal(date);
  /** Foods in one category are alternatives: the trainee eats ONE of them (default: the first). */
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [swapRow, setSwapRow] = useState<{ slot: V3MealSlotView; row: PlanRow } | null>(null);
  /** Add-a-meal launcher (photo / barcode / manual / saved). slot null = free entry outside the plan. */
  const [addTarget, setAddTarget] = useState<{ slot: V3MealSlotView | null } | null>(null);
  const [manualTarget, setManualTarget] = useState<{ slot: V3MealSlotView | null } | null>(null);
  const savedMeals = useSavedMeals();
  const logSaved = useLogSaved(date);
  const [askSlot, setAskSlot] = useState<V3MealSlotView | null>(null);
  /** QA #45: finished meals fold to their header; the trainee can unfold one. */
  const [unfolded, setUnfolded] = useState<Record<number, boolean>>({});
  const [removed, setRemoved] = useState<Record<string, true>>(loadRemoved);
  useEffect(() => { try { localStorage.setItem(REMOVED_KEY, JSON.stringify(removed)); } catch { /* private mode */ } }, [removed]);
  /** QA #59: the food group whose alternatives are open (one at a time). */
  const [altOpen, setAltOpen] = useState<string | null>(null);

  /** Food names in the app language: the Hebrew name when there is one, else a cached translation (QA #43). */
  const untranslated = useMemo(() => {
    const out: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (typeof o.name === 'string' && 'name_hebrew' in o && !(he && o.name_hebrew)) out.push(o.name);
        Object.values(o).forEach(walk);
      }
    };
    walk(day.data?.slots);
    return out;
  }, [day.data, he]);
  const trNames = useTranslatedMap(untranslated);
  const foodName = (f: { name: string; name_hebrew?: string | null }) => (he && f.name_hebrew ? f.name_hebrew : trNames[f.name] || f.name);
  const doneIds = new Set((completions.data ?? []).filter((c) => c.is_completed).map((c) => c.meal_slot_id));
  const slots = useMemo(() => [...(day.data?.slots ?? [])].sort((a, b) => a.order_index - b.order_index), [day.data]);
  const macros = day.data?.daily_macros;
  /** Foods added outside the plan (no meal slot). They are already inside the day's totals. */
  const freeEntries = useMemo(() => (day.data?.choices ?? []).filter((c) => c.meal_slot_id == null && !!c.custom_food_name), [day.data]);

  const Prev = he ? ChevronRight : ChevronLeft;
  const Next = he ? ChevronLeft : ChevronRight;
  const strip = Array.from({ length: 7 }, (_, i) => addDays(date, i - 3));

  const onWriteError = () => toast.error(t('trainee.meals.saveError'));
  const pickKey = (slotId: number, macro: string) => `${date}:${slotId}:${macro}`;
  const pickOf = (g: RowGroup, slot: V3MealSlotView) =>
    g.eaten ?? g.rows.find((r) => r.food.id === picks[pickKey(slot.meal_slot_id, g.macro)]) ?? g.rows[0];

  const visibleGroups = (slot: V3MealSlotView, data: V3DayViewResponse) =>
    groupRows(planRows(slot, data.choices)).filter((g) => !removed[pickKey(slot.meal_slot_id, g.macro)]);

  /** QA #60: remove a planned food from today's meal (un-logs it if it was eaten), with undo. */
  const removeGroup = (slot: V3MealSlotView, g: RowGroup, name: string) => {
    const key = pickKey(slot.meal_slot_id, g.macro);
    haptic(8);
    if (g.eaten?.choice) write.mutate({ kind: 'delete', id: g.eaten.choice.id }, { onError: onWriteError });
    setRemoved((r) => ({ ...r, [key]: true }));
    toast(t('trainee.meals.rowRemoved', { name }), {
      action: { label: t('trainee.meals.undo'), onClick: () => setRemoved((r) => { const n = { ...r }; delete n[key]; return n; }) },
    });
  };
  const restoreSlot = (slot: V3MealSlotView) => {
    haptic(6);
    const prefix = `${date}:${slot.meal_slot_id}:`;
    setRemoved((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith(prefix))) as Record<string, true>);
  };

  /** QA #59: one tap = eaten (logged now); the meal completes by itself once every food group is eaten. */
  const eatGroup = (slot: V3MealSlotView, data: V3DayViewResponse, g: RowGroup) => {
    const r = pickOf(g, slot);
    haptic(10);
    if (g.eaten?.choice) {
      write.mutate({ kind: 'delete', id: g.eaten.choice.id }, { onError: onWriteError });
      return;
    }
    const remaining = visibleGroups(slot, data).filter((x) => !x.eaten && x.macro !== g.macro).length;
    write.mutate(
      { kind: 'log', body: { date, meal_slot_id: slot.meal_slot_id, macro_type: r.macro, food_option_id: r.food.id, quantity: r.qty } },
      {
        onSuccess: () => {
          if (remaining === 0) {
            haptic([10, 30, 10]);
            complete.mutate({ slotId: slot.meal_slot_id, done: true, logs: [] }, { onError: onWriteError });
          }
        },
        onError: onWriteError,
      },
    );
  };

  const completeSlot = (slot: V3MealSlotView, data: V3DayViewResponse) => {
    // Extra foods are added on top of the plan: they never cancel the planned foods.
    const logs: V3MealLogCreateRequest[] = visibleGroups(slot, data)
          .filter((g) => !g.eaten)
          .map((g) => pickOf(g, slot))
          .map((r) => ({ date, meal_slot_id: slot.meal_slot_id, macro_type: r.macro, food_option_id: r.food.id, quantity: r.qty }));
    haptic([10, 30, 10]);
    complete.mutate({ slotId: slot.meal_slot_id, done: true, logs }, { onError: onWriteError });
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow={day.data?.meal_plan_name || t('trainee.meals.eyebrow')}
        title={t('trainee.meals.title')}
        actions={
          <>
            <button type="button" onClick={() => setAddTarget({ slot: null })} className="tp-btn tp-btn--primary tp-btn--sm tp-press">
              <Plus className="h-4 w-4" />
              {t('trainee.mealTools.logMeal')}
            </button>
            <button type="button" onClick={() => navigate('/meals/favorites')} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">
              <Heart className="h-4 w-4" />
              {t('trainee.meals.favorites')}
            </button>
          </>
        }
      />

      {/* Day strip */}
      <div className="tp-card tp-rise mb-4 flex items-center gap-1 p-1.5 sm:p-2" style={{ ['--i' as string]: 2 }}>
        <button type="button" onClick={() => setDate(addDays(date, -1))} className="tp-icon-btn tp-press flex-none bg-transparent" aria-label={t('trainee.meals.prevDay')}>
          <Prev className="h-5 w-5" />
        </button>
        <div className="grid min-w-0 flex-1 grid-cols-7 gap-0.5">
          {strip.map((iso) => {
            const d = parseDate(iso)!;
            const sel = iso === date;
            return (
              <button key={iso} type="button" onClick={() => setDate(iso)} aria-pressed={sel} className={cn('tp-press flex min-h-[3.5rem] min-w-0 flex-col items-center justify-center rounded-2xl', sel ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-foreground/5')}>
                <span className="text-[10px] font-semibold">{fmtWeekday(d, 'narrow')}</span>
                <span className={cn('tp-num text-lg leading-tight', iso === today && !sel && 'text-primary')}>{d.getDate()}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setDate(addDays(date, 1))} className="tp-icon-btn tp-press flex-none bg-transparent" aria-label={t('trainee.meals.nextDay')}>
          <Next className="h-5 w-5" />
        </button>
      </div>
      {date !== today && (
        <div className="mb-4 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <button type="button" onClick={() => setDate(today)} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">{t('trainee.meals.backToToday')}</button>
        </div>
      )}

      {day.isLoading ? (
        <div className="space-y-3">
          <Skel className="h-44" />
          {[0, 1, 2].map((i) => <Skel key={i} className="h-40" />)}
        </div>
      ) : day.isError ? (
        <ErrorState onRetry={() => day.refetch()} />
      ) : !slots.length || !day.data ? (
        <EmptyState icon={UtensilsCrossed} title={t('trainee.today.noMealsTitle')} body={t('trainee.today.noMealsBody')} />
      ) : (
        <>
          {/* Macro summary */}
          <section className="tp-card tp-card--hero tp-rise p-5 sm:p-6" style={{ ['--i' as string]: 3 }}>
            <div className="flex flex-wrap items-center gap-5 sm:gap-8">
              <Ring value={(macros?.consumed.calories ?? 0) / (macros?.targets.calories || 1)} size={132} stroke={12}>
                <div>
                  <CountUp value={Math.round(macros?.consumed.calories ?? 0)} className="tp-num block text-[2rem] leading-none" />
                  <span className="mt-1 block text-[11px] text-muted-foreground">/ {fmtNum(macros?.targets.calories)} {t('trainee.common.kcal')}</span>
                </div>
              </Ring>
              <div className="min-w-0 flex-1">
                <p className="tp-label">{t('trainee.meals.remaining')}</p>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <CountUp value={Math.max(0, Math.round(macros?.remaining.calories ?? 0))} className="tp-num text-4xl" />
                  <span className="text-sm text-muted-foreground">{t('trainee.common.kcal')}</span>
                </p>
              </div>
            </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {(['protein', 'carbs', 'fat'] as const).map((k) => (
                    <div key={k} className="flex min-w-0 flex-col items-center gap-1 rounded-2xl bg-foreground/[.05] px-1 py-2 text-center sm:flex-row sm:gap-2 sm:px-2 sm:text-start">
                      <Ring value={(macros?.consumed[k] ?? 0) / (macros?.targets[k] || 1)} size={36} stroke={4} color={MACRO_COLOR[k]} />
                      <div className="min-w-0 leading-tight">
                        <span className="block truncate text-[11px] text-muted-foreground">{t(`trainee.macros.${k}`)}</span>
                        <span className="block text-xs font-bold sm:text-sm" dir="ltr">{fmtNum(macros?.consumed[k])}<span className="font-normal text-muted-foreground">/{fmtNum(macros?.targets[k])}g</span></span>
                      </div>
                    </div>
                  ))}
                </div>
          </section>

          <ol className="mt-4 space-y-3">
            {slots.map((slot, i) => {
              const data = day.data!;
              const done = doneIds.has(slot.meal_slot_id);
              const consumed = slotConsumed(slot, data);
              const variants = slot.variants ?? [];
              const selected = variants.find((v) => v.id === slot.selected_variant_id) ?? null;
              const rows = planRows(slot, data.choices);
              const extras = data.choices.filter((c) => c.meal_slot_id === slot.meal_slot_id && isOverallCustom(c));
              const folded = done && !unfolded[slot.meal_slot_id];
              const allGroups = groupRows(rows);
              const groups = allGroups.filter((g) => !removed[pickKey(slot.meal_slot_id, g.macro)]);
              const removedCount = allGroups.length - groups.length;
              const groupCount = groups.length;
              const eatenCount = groups.filter((g) => g.eaten).length;
              const toggleFold = () => { haptic(4); setUnfolded((u) => ({ ...u, [slot.meal_slot_id]: !u[slot.meal_slot_id] })); };
              return (
                <li key={slot.meal_slot_id} className={cn('tp-card tp-rise overflow-hidden', done && 'ring-1 ring-[hsl(var(--tp-ok)/.5)]')} style={{ ['--i' as string]: 4 + i }}>
                  <div className="flex items-start gap-3 p-4 sm:p-5">
                    <span className={cn('grid h-12 w-12 flex-none place-items-center rounded-2xl', done ? 'bg-[hsl(var(--tp-ok))] text-white' : 'bg-foreground/[.07]')}>
                      {done ? <Check className="h-6 w-6" strokeWidth={3} /> : <span className="tp-num text-xl">{i + 1}</span>}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="tp-title break-words text-[2rem]" dir="auto">{slot.name}</h3>
                        {slot.time_suggestion && <span className="tp-chip"><Clock className="h-3 w-3" /><span dir="ltr">{slot.time_suggestion}</span></span>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <span dir="ltr" className="inline-block">{fmtNum(consumed)} / {fmtNum(slot.target_calories)}</span> {t('trainee.common.kcal')}
                        {slot.target_protein ? <> · {t('trainee.macros.proteinShort', { g: fmtNum(slot.target_protein) })}</> : null}
                        {groupCount > 0 && !done && <> · <span className="font-semibold text-foreground" dir="ltr">{eatenCount}/{groupCount}</span></>}
                      </p>
                    </div>
                    {/* QA #58: add food and ask the coach are small icons next to the meal title */}
                    {!done && (
                      <div className="flex flex-none items-center gap-1">
                        <button type="button" onClick={() => setAddTarget({ slot })} className="tp-icon-btn tp-press !bg-primary/15 !text-primary" aria-label={t('trainee.meals.addFood')} title={t('trainee.meals.addFood')} data-testid="meal-add">
                          <Plus className="h-5 w-5" />
                        </button>
                        <button type="button" onClick={() => setAskSlot(slot)} className="tp-icon-btn tp-press" aria-label={t('trainee.meals.askCoach')} title={t('trainee.meals.askCoach')}>
                          <MessageCircle className="h-5 w-5" />
                        </button>
                      </div>
                    )}
                    {done && (
                      <button
                        type="button" onClick={toggleFold}
                        className="tp-icon-btn tp-press flex-none" aria-expanded={!folded} aria-controls={`meal-body-${slot.meal_slot_id}`}
                        aria-label={folded ? t('trainee.mealsFold.show') : t('trainee.mealsFold.hide')} title={folded ? t('trainee.mealsFold.show') : t('trainee.mealsFold.hide')}
                        data-testid="meal-fold"
                      >
                        <ChevronDown className={cn('h-5 w-5 transition-transform duration-300', !folded && 'rotate-180')} />
                      </button>
                    )}
                  </div>

                  <div id={`meal-body-${slot.meal_slot_id}`} className={cn('grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none', folded ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100')} aria-hidden={folded || undefined} {...(folded ? { inert: '' } : {}) as Record<string, string>}>
                  <div className="min-h-0 overflow-hidden">
                  <div className="space-y-3 px-4 pb-4 sm:px-5">
                    {slot.notes && (
                      <p className="flex gap-2 rounded-2xl bg-primary/10 px-3 py-2 text-sm" dir="auto">
                        <NotebookPen className="mt-0.5 h-4 w-4 flex-none text-primary" />
                        <span className="min-w-0">{slot.notes}</span>
                      </p>
                    )}

                    {variants.length > 0 && (
                      <div>
                        <p className="tp-label mb-2">{t('trainee.meals.options')}</p>
                        <div className="tp-scroll-x -mx-4 px-4 sm:-mx-5 sm:px-5">
                          {[...variants].sort((a, b) => a.variant_index - b.variant_index).map((v, vi) => {
                            const sel = v.id === slot.selected_variant_id;
                            return (
                              <button
                                key={v.id}
                                type="button"
                                disabled={done}
                                onClick={() => {
                                  if (sel) return;
                                  haptic();
                                  write.mutate({ kind: 'variant', variantId: v.id }, { onError: onWriteError });
                                }}
                                aria-pressed={sel}
                                className={cn('tp-press flex w-[min(15rem,72vw)] flex-col rounded-2xl p-3.5 text-start', sel ? 'bg-primary/15 ring-2 ring-primary' : 'bg-foreground/[.05] hover:bg-foreground/[.08]', done && !sel && 'opacity-50')}
                              >
                                <span className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-muted-foreground">{t('trainee.meals.option', { n: vi + 1 })}</span>
                                  {sel && <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-3.5 w-3.5" /></span>}
                                </span>
                                <span className="mt-1 line-clamp-2 font-bold leading-snug" dir="auto">{he ? v.name_hebrew : v.foods.map((f) => f.name).join(', ')}</span>
                                <span className="mt-auto pt-2 text-xs text-muted-foreground" dir="ltr">
                                  {fmtNum(v.computed_calories)} kcal · P{fmtNum(v.computed_protein)} · C{fmtNum(v.computed_carbs)} · F{fmtNum(v.computed_fat)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {!selected && !done && <p className="mt-2 text-sm text-muted-foreground">{t('trainee.meals.chooseOption')}</p>}
                        {selected && (
                          <ul className="mt-3 divide-y divide-border/40 rounded-2xl bg-foreground/[.04]">
                            {selected.foods.map((f) => (
                              <li key={f.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                                <span className="min-w-0 truncate font-medium" dir="auto">{foodName(f)}</span>
                                <span className="flex-none text-sm text-muted-foreground" dir="ltr">
                                  {f.measurement_type === 'per_portion' ? `×${f.quantity_label}` : f.quantity_label} · {fmtNum(f.calories)} kcal
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {selected && selected.fit_status !== 'ok' && selected.note_hebrew && he && (
                          <p className="mt-2 flex gap-2 rounded-2xl bg-[hsl(var(--gold)/.12)] px-3 py-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-[hsl(var(--gold))]" />{selected.note_hebrew}</p>
                        )}
                      </div>
                    )}

                    {groups.length > 0 && (
                      <ul className="space-y-2" data-testid="meal-rows">
                        {groups.map((g) => {
                          const key = pickKey(slot.meal_slot_id, g.macro);
                          const r = pickOf(g, slot);
                          const eaten = !!g.eaten;
                          const m = rowMacros(r);
                          const alts = g.rows.filter((x) => x.food.id !== r.food.id);
                          const open = altOpen === key && alts.length > 0 && !done;
                          const choose = (alt: PlanRow) => {
                            haptic(6);
                            if (g.eaten?.choice) {
                              write.mutate(
                                { kind: 'replace', deleteId: g.eaten.choice.id, body: { date, meal_slot_id: slot.meal_slot_id, macro_type: alt.macro, food_option_id: alt.food.id, quantity: alt.qty } },
                                { onError: onWriteError },
                              );
                            } else setPicks((p) => ({ ...p, [key]: alt.food.id }));
                            setAltOpen(null);
                          };
                          return (
                            <li key={g.macro} className={cn('overflow-hidden rounded-2xl transition-colors', eaten ? 'bg-[hsl(var(--tp-ok)/.09)]' : 'bg-foreground/[.04]')}>
                              <div className="flex items-center gap-3 p-2">
                                {/* QA #59: one tap = eaten (tap again to undo) */}
                                <button
                                  type="button"
                                  disabled={done}
                                  onClick={() => eatGroup(slot, data, g)}
                                  aria-pressed={eaten}
                                  aria-label={eaten ? t('trainee.mealsFold.uneat', { name: foodName(r.food) }) : t('trainee.mealsFold.eat', { name: foodName(r.food) })}
                                  className={cn('tp-press grid h-12 w-12 flex-none place-items-center rounded-full transition-all', eaten ? 'bg-[hsl(var(--tp-ok))] text-white shadow-[0_10px_22px_-12px_hsl(var(--tp-ok))]' : 'text-transparent shadow-[inset_0_0_0_2.5px_hsl(var(--foreground)/.22)] hover:shadow-[inset_0_0_0_2.5px_hsl(var(--primary))] hover:text-primary/40')}
                                  data-testid="meal-eat"
                                >
                                  <Check className={cn('h-6 w-6', eaten && 'tp-pop-in')} strokeWidth={3} />
                                </button>
                                <button
                                  type="button"
                                  disabled={done || !alts.length}
                                  onClick={() => setAltOpen(open ? null : key)}
                                  aria-expanded={open}
                                  className="flex min-w-0 flex-1 items-center gap-3 text-start disabled:cursor-default"
                                >
                                  <span className="relative flex-none">
                                    <FoodThumb name={r.food.name} src={r.food.image_url} needsImage={!r.food.image_url} className="h-12 w-12 rounded-xl" />
                                    {alts.length > 0 && !done && (
                                      <span className="absolute -bottom-1 -end-1 flex items-center gap-0.5 rounded-full bg-card px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground shadow ring-1 ring-border/60" aria-label={t('trainee.meals.orInstead')}>
                                        <ArrowLeftRight className="h-3 w-3" />{alts.length}
                                      </span>
                                    )}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className={cn('block truncate font-semibold', eaten && 'text-[hsl(var(--tp-ok))]')} dir="auto">{r.swap ? r.swap.displayName : foodName(r.food)}</span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                      <span className="me-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: MACRO_COLOR[r.macro] }} aria-hidden />
                                      {t(`trainee.macros.${macroKey(r.macro)}`)} · <bdi dir="ltr">{fmtNum(m.calories)} kcal</bdi> · <bdi>{r.qty}</bdi>
                                      {r.swap && <> · {t('trainee.meals.swapped')}</>}
                                    </span>
                                  </span>
                                </button>
                                {!done && (
                                  <div className="flex flex-none flex-col">
                                  <button type="button" onClick={() => setSwapRow({ slot, row: r })} className="tp-icon-btn tp-press !h-8 !w-8 bg-transparent text-muted-foreground" aria-label={t('trainee.meals.swap')} title={t('trainee.meals.swap')}>
                                    <Search className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeGroup(slot, g, r.swap ? r.swap.displayName : foodName(r.food))}
                                    className="tp-icon-btn tp-press !h-8 !w-8 bg-transparent text-muted-foreground hover:!text-destructive"
                                    aria-label={t('trainee.meals.removeRow', { name: r.swap ? r.swap.displayName : foodName(r.food) })}
                                    title={t('trainee.common.delete')}
                                    data-testid="meal-row-remove"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                  </div>
                                )}
                              </div>
                              {open && (
                                <div className="tp-scroll-x flex gap-2 px-2 pb-2.5" role="listbox" aria-label={t('trainee.meals.orInstead')}>
                                  {alts.map((alt) => {
                                    const am = rowMacros(alt);
                                    return (
                                      <button key={alt.food.id} type="button" role="option" aria-selected={false} onClick={() => choose(alt)} className="tp-press w-[6.5rem] flex-none overflow-hidden rounded-xl bg-card text-start ring-1 ring-border/60 hover:ring-primary/60">
                                        <FoodThumb name={alt.food.name} src={alt.food.image_url} needsImage={!alt.food.image_url} className="aspect-[4/3] w-full rounded-none" />
                                        <span className="block p-1.5">
                                          <span className="line-clamp-2 block text-[11px] font-bold leading-tight" dir="auto">{foodName(alt.food)}</span>
                                          <span className="block text-[10px] text-muted-foreground" dir="ltr">{alt.qty} · {fmtNum(am.calories)}</span>
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {removedCount > 0 && !done && (
                      <button type="button" onClick={() => restoreSlot(slot)} className="tp-press flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="meal-rows-restore">
                        <RotateCcw className="h-3.5 w-3.5" />{t('trainee.meals.restoreRows', { count: removedCount })}
                      </button>
                    )}

                    {extras.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-foreground/[.04] p-1.5 ps-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium" dir="auto">{c.custom_food_name}</p>
                          <p className="text-xs text-muted-foreground" dir="ltr" style={{ textAlign: 'inherit' }}>{c.quantity ? `${c.quantity} · ` : ''}{fmtNum(c.custom_calories)} kcal</p>
                        </div>
                        <button type="button" disabled={done} onClick={() => write.mutate({ kind: 'delete', id: c.id }, { onError: onWriteError })} className="tp-icon-btn tp-press bg-transparent text-muted-foreground" aria-label={t('trainee.common.delete')}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {done ? (
                        <>
                          <span className="tp-chip tp-chip--ok me-auto"><Check className="h-3.5 w-3.5" />{t('trainee.meals.completed')}</span>
                          <button type="button" onClick={() => complete.mutate({ slotId: slot.meal_slot_id, done: false }, { onError: onWriteError })} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">
                            <RotateCcw className="h-4 w-4" />{t('trainee.meals.reopen')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => completeSlot(slot, data)} disabled={variants.length > 0 && !selected && !rows.length && !extras.length} className="tp-btn tp-btn--primary tp-btn--sm tp-press flex-1" data-testid="meal-all">
                            <Check className="h-4 w-4" />{rows.length && eatenCount > 0 ? t('trainee.mealsFold.ateRest') : t('trainee.mealsFold.ateAll')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {day.data && (
        <section className="mt-6" aria-label={t('trainee.mealTools.outsidePlan')}>
          {!!savedMeals.data?.length && date === today && (
            <div className="mb-4">
              <p className="tp-label mb-2">{t('trainee.mealTools.quickLog')}</p>
              <div className="tp-scroll-x -mx-4 px-4">
                {savedMeals.data.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={logSaved.isPending}
                    onClick={() => { haptic(); logSaved.mutate({ id: m.id, slotId: null }, { onSuccess: () => toast.success(t('trainee.mealTools.logged')), onError: onWriteError }); }}
                    className="tp-press flex flex-none items-center gap-2 rounded-full bg-primary/12 px-4 py-2.5 text-sm font-semibold text-primary"
                  >
                    <Heart className="h-4 w-4" /><span className="max-w-[10rem] truncate" dir="auto">{m.name}</span><span className="opacity-70" dir="ltr">{fmtNum(m.totals.calories)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* QA #57: no separate "outside the plan" card; foods added freely are simply listed when there are some */}
          {freeEntries.length > 0 && (
          <div className="tp-card overflow-hidden">
            <p className="tp-label px-4 pb-1 pt-4 sm:px-5">{t('trainee.mealTools.outsidePlan')}</p>
              <ul className="space-y-2 px-4 pb-4 sm:px-5" data-testid="free-entries">
                {freeEntries.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-2xl bg-primary/[.07] p-1.5 ps-3.5">
                    <Sparkles className="h-4 w-4 flex-none text-primary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" dir="auto">{c.custom_food_name} <span className="tp-chip tp-chip--primary ms-1 align-middle">{t('trainee.mealTools.freeTag')}</span></p>
                      <p className="text-xs text-muted-foreground" dir="ltr" style={{ textAlign: 'inherit' }}>{c.quantity ? `${c.quantity} · ` : ''}{fmtNum(c.custom_calories)} kcal · P{fmtNum(c.custom_protein)} C{fmtNum(c.custom_carbs)} F{fmtNum(c.custom_fat)}</p>
                    </div>
                    <button type="button" onClick={() => write.mutate({ kind: 'delete', id: c.id }, { onError: onWriteError })} className="tp-icon-btn tp-press bg-transparent text-muted-foreground" aria-label={t('trainee.common.delete')}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
          </div>
          )}
        </section>
      )}

      <SwapSheet target={swapRow} date={date} onClose={() => setSwapRow(null)} foodName={foodName} />
      <AddMealSheet
        open={!!addTarget}
        slot={addTarget?.slot ?? null}
        date={date}
        onClose={() => setAddTarget(null)}
        onManual={() => { setManualTarget(addTarget); setAddTarget(null); }}
      />
      <AddFoodSheet open={!!manualTarget} slot={manualTarget?.slot ?? null} date={date} day={day.data ?? null} onClose={() => setManualTarget(null)} foodName={foodName} />
      <AskCoachSheet slot={askSlot} onClose={() => setAskSlot(null)} />
    </Screen>
  );
};

const SwapSheet: React.FC<{ target: { slot: V3MealSlotView; row: PlanRow } | null; date: string; onClose: () => void; foodName: (f: V3FoodOption) => string }> = ({ target, date, onClose, foodName }) => {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const write = useMealWrite(date);
  const catalog = useCatalog(target?.row.macro ?? 'protein', !!target);
  const row = target?.row;
  // QA #61: beyond the coach's list, search the whole food database (staples, USDA, Open Food Facts).
  const dq = useDebounced(q.trim(), 300);
  const db = useFoodSearch(dq, (i18n.language || 'en').slice(0, 2), !!target && dq.length >= 2);
  const dbHits: FoodHit[] = useLocalizedHits(db.data && dq.length >= 2 ? [...db.data.recent, ...db.data.coach, ...db.data.foods, ...db.data.products] : []);
  const dbSearching = dq.length >= 2 && (db.isFetching || db.data?.query !== dq);
  const list = (catalog.data ?? []).filter((f) => {
    const s = q.trim().toLowerCase();
    return !s || f.name.toLowerCase().includes(s) || (f.name_hebrew || '').toLowerCase().includes(s);
  });

  const pick = (food: V3FoodOption, source: 'plan' | 'bank') => {
    if (!target || !row || typeof food.id !== 'number') return;
    const base = { date, meal_slot_id: target.slot.meal_slot_id, macro_type: row.macro, quantity: row.qty };
    const body: V3MealLogCreateRequest =
      source === 'plan' && food.id === row.food.id
        ? { ...base, food_option_id: food.id }
        : (() => {
            const m = foodMacros(food, row.qty);
            const name = safeName(foodName(food));
            return {
              ...base,
              food_option_id: null,
              custom_food_name: source === 'plan' ? encodePlanSwap(row.food.id, food.id, name) : encodeBankSwap(row.food.id, food.id, name),
              custom_calories: m.calories,
              custom_protein: m.protein,
              custom_carbs: m.carbs,
              custom_fat: m.fat,
            };
          })();
    haptic();
    write.mutate({ kind: 'replace', deleteId: row.choice?.id, body }, { onError: () => toast.error(t('trainee.meals.saveError')) });
    setQ('');
    onClose();
  };

  /** A food from the database, at the plan row's amount (portions of a per-100 g food use its serving weight). */
  const pickHit = (h: FoodHit) => {
    if (!target || !row) return;
    const food: V3FoodOption = {
      name: h.display_name || h.name, calories: h.calories, protein: h.protein, carbs: h.carbs, fat: h.fat,
      measurement_type: h.unit === 'portion' ? 'per_portion' : 'per_100g',
      serving_size: h.serving_grams ? `${Math.round(h.serving_grams)}g` : null,
    };
    let qty = row.qty;
    if (h.unit === 'g' && row.food.measurement_type === 'per_portion') {
      const count = parseFloat(String(row.qty).replace(',', '.')) || 1;
      qty = `${Math.round(count * (h.serving_grams || 100))}g`;
    }
    const m = foodMacros(food, qty);
    const base = h.display_name || h.name;
    const name = h.brand && h.source === 'product' && !base.includes(h.brand) ? `${base} · ${h.brand}` : base;
    haptic();
    write.mutate(
      {
        kind: 'replace',
        deleteId: row.choice?.id,
        body: {
          date, meal_slot_id: target.slot.meal_slot_id, macro_type: row.macro, quantity: qty, food_option_id: null,
          custom_food_name: encodeBankSwap(row.food.id, 0, safeName(name)),
          custom_calories: m.calories, custom_protein: m.protein, custom_carbs: m.carbs, custom_fat: m.fat,
        },
      },
      { onError: () => toast.error(t('trainee.meals.saveError')) },
    );
    setQ('');
    onClose();
  };

  return (
    <Sheet tall open={!!target} onOpenChange={(o) => !o && onClose()} title={t('trainee.meals.swapTitle')} description={row ? t('trainee.meals.swapFor', { food: row.swap ? row.swap.displayName : foodName(row.food), qty: row.qty }) : undefined}>
      {row && (
        <div className="space-y-3 pb-2">
          {row.swap && (
            <button type="button" onClick={() => pick(row.food, 'plan')} className="tp-press flex w-full items-center gap-3 rounded-2xl bg-primary/10 p-3 text-start">
              <RotateCcw className="h-5 w-5 flex-none text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">{t('trainee.meals.backToPlan')}</span>
                <span className="block truncate font-semibold" dir="auto">{foodName(row.food)}</span>
              </span>
            </button>
          )}
          <label className="relative block">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className="tp-input ps-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('trainee.meals.search')} dir="auto" />
          </label>
          {catalog.isLoading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skel key={i} className="h-14" />)}</div>
          ) : catalog.isError ? (
            <ErrorState compact onRetry={() => catalog.refetch()} />
          ) : !list.length ? (
            !dbHits.length && !dbSearching && <p className="py-6 text-center text-sm text-muted-foreground">{t('trainee.meals.noResults')}</p>
          ) : (
            <ul className="space-y-1.5">
              {list.slice(0, 80).map((f) => {
                const m = foodMacros(f, row.qty);
                return (
                  <li key={f.id ?? f.name}>
                    <button type="button" onClick={() => pick(f, 'bank')} className="tp-press flex min-h-[3.5rem] w-full items-center gap-3 rounded-2xl bg-foreground/[.04] px-3.5 py-2 text-start hover:bg-foreground/[.08]">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium" dir="auto">{foodName(f)}</span>
                        <span className="block text-xs text-muted-foreground" dir="ltr" style={{ textAlign: 'inherit' }}>{row.qty} · {fmtNum(m.calories)} kcal · P{fmtNum(m.protein)} C{fmtNum(m.carbs)} F{fmtNum(m.fat)}</span>
                      </span>
                      <ArrowLeftRight className="h-4 w-4 flex-none text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {dq.length >= 2 && (dbSearching || dbHits.length > 0) && (
            <section aria-live="polite" data-testid="swap-db">
              <p className="tp-label mb-1.5 mt-2 flex items-center gap-2">
                {t('trainee.meals.fromDatabase')}
                {dbSearching && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label={t('trainee.mealTools.searching')} />}
              </p>
              <ul className="space-y-1.5">
                {dbHits.slice(0, 40).map((h) => <HitRow key={h.id} hit={h} aiImages={!!db.data?.ai_images} onPick={() => pickHit(h)} />)}
              </ul>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
};

type AddTab = 'menu' | 'bank' | 'custom';

const AddFoodSheet: React.FC<{ open: boolean; slot: V3MealSlotView | null; date: string; day: V3DayViewResponse | null; onClose: () => void; foodName: (f: V3FoodOption) => string }> = ({ open, slot, date, day, onClose, foodName }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AddTab>('menu');
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<V3FoodOption | null>(null);
  const [amount, setAmount] = useState(100);
  const write = useMealWrite(date);
  const bank = useFoodBank(open && tab === 'bank');

  // Every food the coach put in today's plan, this meal first.
  const menu = useMemo(() => {
    if (!day) return [] as V3FoodOption[];
    const ordered = slot ? [slot, ...day.slots.filter((s) => s.meal_slot_id !== slot.meal_slot_id)] : day.slots;
    const seen = new Set<string>();
    const out: V3FoodOption[] = [];
    for (const s of ordered)
      for (const c of s.categories)
        for (const f of c.recommended_foods ?? []) {
          const k = (f.name || '').toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ ...f, macro_type: c.macro_type });
        }
    return out;
  }, [day, slot]);

  const source = tab === 'menu' ? menu : bank.data ?? [];
  const needle = q.trim().toLowerCase();
  const list = source.filter((f) => !needle || f.name.toLowerCase().includes(needle) || (f.name_hebrew || '').toLowerCase().includes(needle));
  const portion = chosen?.measurement_type === 'per_portion';
  const qty = portion ? `${amount}` : `${amount}g`;
  const preview = chosen ? foodMacros(chosen, qty) : null;

  const close = () => {
    setChosen(null);
    setQ('');
    onClose();
  };
  const choose = (f: V3FoodOption) => {
    haptic(6);
    setChosen(f);
    setAmount(f.measurement_type === 'per_portion' ? 1 : 100);
  };
  const addChosen = () => {
    if (!chosen || !preview) return;
    write.mutate(
      {
        kind: 'log',
        body: {
          date, meal_slot_id: slot?.meal_slot_id ?? null, macro_type: slot ? (chosen.macro_type as MacroType) || 'protein' : null, food_option_id: null,
          quantity: portion ? `×${amount}` : qty, custom_food_name: safeName(foodName(chosen)),
          custom_calories: preview.calories, custom_protein: preview.protein, custom_carbs: preview.carbs, custom_fat: preview.fat,
        },
      },
      { onSuccess: () => toast.success(t('trainee.meals.foodAdded')), onError: () => toast.error(t('trainee.meals.saveError')) },
    );
    close();
  };

  const tabs: { id: AddTab; label: string }[] = [
    { id: 'menu', label: t('trainee.meals.tabMenu') },
    { id: 'bank', label: t('trainee.meals.tabBank') },
    { id: 'custom', label: t('trainee.meals.tabCustom') },
  ];

  return (
    <Sheet
      tall
      open={open}
      onOpenChange={(o) => !o && close()}
      title={t('trainee.meals.addFood')}
      description={slot ? t('trainee.meals.customFor', { meal: slot.name }) : t('trainee.mealTools.outsideBody')}
      footer={
        tab !== 'custom' && chosen && preview ? (
          <button type="button" onClick={addChosen} className="tp-btn tp-btn--primary tp-press w-full">
            <Plus className="h-5 w-5" />
            {t('trainee.meals.customSave')}
            <span className="opacity-80" dir="ltr">· {fmtNum(preview.calories)} kcal</span>
          </button>
        ) : undefined
      }
    >
      <div className="tp-seg mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-foreground/[.06] p-1" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => { setTab(x.id); setChosen(null); }} className={cn('tp-press rounded-xl py-2 text-sm font-semibold', tab === x.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'custom' ? (
        <CustomFoodForm slot={slot} date={date} onDone={close} />
      ) : chosen && preview ? (
        <div className="space-y-4 pb-2">
          <button type="button" onClick={() => setChosen(null)} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">{t('trainee.meals.backToList')}</button>
          <div className="flex items-center gap-3">
            {chosen.image_url ? <img src={mediaUrl(chosen.image_url)} alt="" className="h-16 w-16 flex-none rounded-2xl object-cover" /> : <span className="grid h-16 w-16 flex-none place-items-center rounded-2xl bg-foreground/[.06]"><UtensilsCrossed className="h-6 w-6 text-muted-foreground" /></span>}
            <div className="min-w-0">
              <p className="truncate text-lg font-bold" dir="auto">{foodName(chosen)}</p>
              {chosen.macro_type && <p className="text-xs text-muted-foreground">{t(`trainee.macros.${macroKey(chosen.macro_type as MacroType)}`)}</p>}
            </div>
          </div>
          <div className="flex items-center justify-center gap-4">
            <button type="button" className="tp-icon-btn tp-press" onClick={() => setAmount((a) => Math.max(portion ? 0.5 : 10, +(a - (portion ? 0.5 : 10)).toFixed(1)))} aria-label="-"><Minus className="h-5 w-5" /></button>
            <span className="tp-num min-w-[6rem] text-center text-4xl" dir="ltr">{portion ? `×${amount}` : `${amount}g`}</span>
            <button type="button" className="tp-icon-btn tp-press" onClick={() => setAmount((a) => +(a + (portion ? 0.5 : 10)).toFixed(1))} aria-label="+"><Plus className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center" dir="ltr">
            {([['kcal', preview.calories], ['P', preview.protein], ['C', preview.carbs], ['F', preview.fat]] as const).map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-foreground/[.05] py-2"><span className="tp-num block text-xl">{fmtNum(v)}</span><span className="text-[11px] text-muted-foreground">{k}</span></div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3 pb-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className="tp-input ps-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('trainee.meals.search')} dir="auto" />
          </label>
          {tab === 'bank' && bank.isLoading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skel key={i} className="h-14" />)}</div>
          ) : tab === 'bank' && bank.isError ? (
            <ErrorState compact onRetry={() => bank.refetch()} />
          ) : !list.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{tab === 'menu' && !menu.length ? t('trainee.meals.menuEmpty') : t('trainee.meals.noResults')}</p>
          ) : (
            <ul className="space-y-1.5">
              {list.slice(0, 120).map((f) => {
                const m = foodMacros(f, f.measurement_type === 'per_portion' ? '1' : '100g');
                return (
                  <li key={`${f.id ?? ''}-${f.name}`}>
                    <button type="button" onClick={() => choose(f)} className="tp-press flex min-h-[3.5rem] w-full items-center gap-3 rounded-2xl bg-foreground/[.04] px-2 py-2 text-start hover:bg-foreground/[.08]">
                      {f.image_url ? <img src={mediaUrl(f.image_url)} alt="" loading="lazy" className="h-11 w-11 flex-none rounded-xl object-cover" /> : <span className="h-11 w-1.5 flex-none rounded-full" style={{ background: MACRO_COLOR[f.macro_type || 'protein'] }} aria-hidden />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium" dir="auto">{foodName(f)}</span>
                        <span className="block text-xs text-muted-foreground" dir="ltr" style={{ textAlign: 'inherit' }}>{f.measurement_type === 'per_portion' ? '×1' : '100g'} · {fmtNum(m.calories)} kcal · P{fmtNum(m.protein)} C{fmtNum(m.carbs)} F{fmtNum(m.fat)}</span>
                      </span>
                      <Plus className="h-4 w-4 flex-none text-primary" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
};

const CustomFoodForm: React.FC<{ slot: V3MealSlotView | null; date: string; onDone: () => void }> = ({ slot, date, onDone }) => {
  const { t } = useTranslation();
  const write = useMealWrite(date);
  const [f, setF] = useState({ name: '', grams: '100', kcal: '', p: '', c: '', fat: '' });
  const num = (s: string) => parseFloat(s.replace(',', '.')) || 0;
  const scale = num(f.grams) / 100;
  const valid = f.name.trim() && num(f.grams) > 0;

  const save = () => {
    if (!valid) return;
    write.mutate(
      {
        kind: 'log',
        body: {
          date, meal_slot_id: slot?.meal_slot_id ?? null, macro_type: slot ? 'protein' : null, food_option_id: null, quantity: `${num(f.grams)}g`,
          custom_food_name: f.name.trim(), custom_calories: num(f.kcal) * scale, custom_protein: num(f.p) * scale, custom_carbs: num(f.c) * scale, custom_fat: num(f.fat) * scale,
        },
      },
      { onSuccess: () => toast.success(t('trainee.meals.foodAdded')), onError: () => toast.error(t('trainee.meals.saveError')) },
    );
    setF({ name: '', grams: '100', kcal: '', p: '', c: '', fat: '' });
    onDone();
  };

  const field = (k: keyof typeof f, label: string, mode: 'text' | 'decimal' = 'decimal') => (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input className={cn('tp-input', mode === 'decimal' && 'text-center')} inputMode={mode} dir={mode === 'decimal' ? 'ltr' : 'auto'} value={f[k]} onChange={(e) => setF((s) => ({ ...s, [k]: mode === 'decimal' ? e.target.value.replace(/[^\d.,]/g, '') : e.target.value }))} />
    </label>
  );

  return (
    <div className="space-y-4 pb-2 pt-1">
      {field('name', t('trainee.meals.customName'), 'text')}
      {field('grams', t('trainee.meals.customGrams'))}
      <p className="tp-label">{t('trainee.meals.per100')}</p>
      <div className="grid grid-cols-2 gap-3">
        {field('kcal', t('trainee.common.kcal'))}
        {field('p', t('trainee.macros.protein'))}
        {field('c', t('trainee.macros.carbs'))}
        {field('fat', t('trainee.macros.fat'))}
      </div>
      <button type="button" onClick={save} disabled={!valid} className="tp-btn tp-btn--primary tp-press w-full">
        <Plus className="h-5 w-5" />
        {t('trainee.meals.customSave')}
        {valid && <span className="opacity-80" dir="ltr">· {fmtNum(num(f.kcal) * scale)} kcal</span>}
      </button>
    </div>
  );
};

const AskCoachSheet: React.FC<{ slot: V3MealSlotView | null; onClose: () => void }> = ({ slot, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const send = useSendCoachMessage();
  const [msg, setMsg] = useState('');
  const submit = () => {
    if (!slot || !msg.trim()) return;
    send.mutate(`${slot.name}: ${msg.trim()}`, {
      onSuccess: () => toast.success(t('trainee.meals.askSent'), { action: { label: t('trainee.meals.openChat'), onClick: () => navigate('/chat') } }),
      onError: () => toast.error(t('trainee.meals.askError')),
    });
    setMsg('');
    onClose();
  };
  return (
    <Sheet
      open={!!slot}
      onOpenChange={(o) => !o && onClose()}
      title={t('trainee.meals.askCoach')}
      description={slot?.name}
      footer={
        <button type="button" onClick={submit} disabled={!msg.trim()} className="tp-btn tp-btn--primary tp-press w-full">
          <MessageCircle className="h-5 w-5" />
          {t('trainee.meals.askSend')}
        </button>
      }
    >
      <textarea autoFocus className="tp-input mb-2 mt-1 min-h-[8rem] py-3" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t('trainee.meals.askPlaceholder')} dir="auto" />
    </Sheet>
  );
};

export default MealsScreen;
