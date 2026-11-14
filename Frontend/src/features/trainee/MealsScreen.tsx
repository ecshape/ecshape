import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeftRight, Check, ChevronLeft, ChevronRight, Clock, Heart, MessageCircle, NotebookPen, Plus, RotateCcw, Search, Trash2, UtensilsCrossed,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MacroType, V3DayViewResponse, V3FoodOption, V3MealLogCreateRequest, V3MealSlotView } from '@/types/meals-v3';
import { useCatalog, useCompleteMeal, useMealCompletions, useMealDay, useMealWrite, useSendCoachMessage } from './hooks';
import { CountUp, EmptyState, ErrorState, Ring, Screen, ScreenHeader, Sheet, Skel } from './ui';
import { addDays, fmtDate, fmtNum, fmtWeekday, haptic, parseDate, todayISO } from './format';
import {
  encodeBankSwap, encodePlanSwap, foodMacros, isOverallCustom, planRows, rowMacros, safeName, slotConsumed, type PlanRow,
} from './mealLogic';

const MACRO_COLOR: Record<string, string> = { protein: 'hsl(var(--tp-protein))', carbs: 'hsl(var(--tp-carbs))', carb: 'hsl(var(--tp-carbs))', fat: 'hsl(var(--tp-fat))' };
const macroKey = (m: MacroType) => (m === 'carb' ? 'carbs' : m);

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
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [swapRow, setSwapRow] = useState<{ slot: V3MealSlotView; row: PlanRow } | null>(null);
  const [customSlot, setCustomSlot] = useState<V3MealSlotView | null>(null);
  const [askSlot, setAskSlot] = useState<V3MealSlotView | null>(null);

  const foodName = (f: { name: string; name_hebrew?: string | null }) => (he ? f.name_hebrew || f.name : f.name);
  const doneIds = new Set((completions.data ?? []).filter((c) => c.is_completed).map((c) => c.meal_slot_id));
  const slots = useMemo(() => [...(day.data?.slots ?? [])].sort((a, b) => a.order_index - b.order_index), [day.data]);
  const macros = day.data?.daily_macros;

  const Prev = he ? ChevronRight : ChevronLeft;
  const Next = he ? ChevronLeft : ChevronRight;
  const strip = Array.from({ length: 7 }, (_, i) => addDays(date, i - 3));

  const onWriteError = () => toast.error(t('trainee.meals.saveError'));

  const completeSlot = (slot: V3MealSlotView, data: V3DayViewResponse) => {
    const hasOverall = data.choices.some((c) => c.meal_slot_id === slot.meal_slot_id && isOverallCustom(c));
    const logs: V3MealLogCreateRequest[] = hasOverall
      ? []
      : planRows(slot, data.choices)
          .filter((r) => !r.choice && !skipped[`${date}:${slot.meal_slot_id}:${r.food.id}`])
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
          <button type="button" onClick={() => navigate('/meals/favorites')} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">
            <Heart className="h-4 w-4" />
            {t('trainee.meals.favorites')}
          </button>
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
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(['protein', 'carbs', 'fat'] as const).map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <Ring value={(macros?.consumed[k] ?? 0) / (macros?.targets[k] || 1)} size={40} stroke={5} color={MACRO_COLOR[k]} />
                      <div className="min-w-0 leading-tight">
                        <span className="block truncate text-[11px] text-muted-foreground">{t(`trainee.macros.${k}`)}</span>
                        <span className="block text-sm font-bold" dir="ltr">{fmtNum(macros?.consumed[k])}<span className="font-normal text-muted-foreground">/{fmtNum(macros?.targets[k])}g</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
                      </p>
                    </div>
                  </div>

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
                                  {f.measurement_type === 'per_portion' ? `${f.quantity_label} ×` : f.quantity_label} · {fmtNum(f.calories)} kcal
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

                    {rows.length > 0 && (
                      <ul className="space-y-1.5">
                        {rows.map((r) => {
                          const key = `${date}:${slot.meal_slot_id}:${r.food.id}`;
                          const isSkipped = !r.choice && !!skipped[key];
                          const eaten = !!r.choice;
                          const m = rowMacros(r);
                          return (
                            <li key={r.food.id} className={cn('flex items-center gap-2 rounded-2xl bg-foreground/[.04] p-1.5 pe-1', isSkipped && 'opacity-50')}>
                              <button
                                type="button"
                                disabled={done}
                                onClick={() => {
                                  haptic(6);
                                  if (eaten && r.choice) write.mutate({ kind: 'delete', id: r.choice.id }, { onError: onWriteError });
                                  else setSkipped((s) => ({ ...s, [key]: !s[key] }));
                                }}
                                aria-pressed={!isSkipped}
                                aria-label={isSkipped ? t('trainee.meals.include') : t('trainee.meals.skip')}
                                className={cn('tp-press grid h-11 w-11 flex-none place-items-center rounded-xl', eaten ? 'bg-[hsl(var(--tp-ok))] text-white' : isSkipped ? 'bg-foreground/[.06]' : 'bg-primary/15 text-primary')}
                              >
                                {!isSkipped && <Check className="h-5 w-5" strokeWidth={3} />}
                              </button>
                              <span className="h-8 w-1 flex-none rounded-full" style={{ background: MACRO_COLOR[r.macro] }} aria-hidden />
                              <div className="min-w-0 flex-1">
                                <p className={cn('truncate font-medium', isSkipped && 'line-through')} dir="auto">{r.swap ? r.swap.displayName : foodName(r.food)}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {t(`trainee.macros.${macroKey(r.macro)}`)} · <span dir="ltr">{r.qty} · {fmtNum(m.calories)} kcal</span>
                                  {r.swap && <> · {t('trainee.meals.swapped')}</>}
                                </p>
                              </div>
                              <button type="button" disabled={done} onClick={() => setSwapRow({ slot, row: r })} className="tp-icon-btn tp-press bg-transparent" aria-label={t('trainee.meals.swap')}>
                                <ArrowLeftRight className="h-4 w-4" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
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
                          <button type="button" onClick={() => completeSlot(slot, data)} disabled={variants.length > 0 && !selected && !rows.length && !extras.length} className="tp-btn tp-btn--primary tp-btn--sm tp-press flex-1 sm:flex-none">
                            <Check className="h-4 w-4" />{t('trainee.meals.complete')}
                          </button>
                          <button type="button" onClick={() => setCustomSlot(slot)} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">
                            <Plus className="h-4 w-4" />{t('trainee.meals.addFood')}
                          </button>
                          <button type="button" onClick={() => setAskSlot(slot)} className="tp-icon-btn tp-press" aria-label={t('trainee.meals.askCoach')}>
                            <MessageCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <SwapSheet target={swapRow} date={date} onClose={() => setSwapRow(null)} foodName={foodName} />
      <CustomFoodSheet slot={customSlot} date={date} onClose={() => setCustomSlot(null)} />
      <AskCoachSheet slot={askSlot} onClose={() => setAskSlot(null)} />
    </Screen>
  );
};

const SwapSheet: React.FC<{ target: { slot: V3MealSlotView; row: PlanRow } | null; date: string; onClose: () => void; foodName: (f: V3FoodOption) => string }> = ({ target, date, onClose, foodName }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const write = useMealWrite(date);
  const catalog = useCatalog(target?.row.macro ?? 'protein', !!target);
  const row = target?.row;
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

  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()} title={t('trainee.meals.swapTitle')} description={row ? t('trainee.meals.swapFor', { food: row.swap ? row.swap.displayName : foodName(row.food), qty: row.qty }) : undefined}>
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
            <p className="py-6 text-center text-sm text-muted-foreground">{t('trainee.meals.noResults')}</p>
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
        </div>
      )}
    </Sheet>
  );
};

const CustomFoodSheet: React.FC<{ slot: V3MealSlotView | null; date: string; onClose: () => void }> = ({ slot, date, onClose }) => {
  const { t } = useTranslation();
  const write = useMealWrite(date);
  const [f, setF] = useState({ name: '', grams: '100', kcal: '', p: '', c: '', fat: '' });
  const num = (s: string) => parseFloat(s.replace(',', '.')) || 0;
  const scale = num(f.grams) / 100;
  const valid = f.name.trim() && num(f.grams) > 0;

  const save = () => {
    if (!slot || !valid) return;
    write.mutate(
      {
        kind: 'log',
        body: {
          date, meal_slot_id: slot.meal_slot_id, macro_type: 'protein', food_option_id: null, quantity: `${num(f.grams)}g`,
          custom_food_name: f.name.trim(), custom_calories: num(f.kcal) * scale, custom_protein: num(f.p) * scale, custom_carbs: num(f.c) * scale, custom_fat: num(f.fat) * scale,
        },
      },
      { onSuccess: () => toast.success(t('trainee.meals.foodAdded')), onError: () => toast.error(t('trainee.meals.saveError')) },
    );
    setF({ name: '', grams: '100', kcal: '', p: '', c: '', fat: '' });
    onClose();
  };

  const field = (k: keyof typeof f, label: string, mode: 'text' | 'decimal' = 'decimal') => (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input className={cn('tp-input', mode === 'decimal' && 'text-center')} inputMode={mode} dir={mode === 'decimal' ? 'ltr' : 'auto'} value={f[k]} onChange={(e) => setF((s) => ({ ...s, [k]: mode === 'decimal' ? e.target.value.replace(/[^\d.,]/g, '') : e.target.value }))} />
    </label>
  );

  return (
    <Sheet
      open={!!slot}
      onOpenChange={(o) => !o && onClose()}
      title={t('trainee.meals.customTitle')}
      description={slot ? t('trainee.meals.customFor', { meal: slot.name }) : undefined}
      footer={
        <button type="button" onClick={save} disabled={!valid} className="tp-btn tp-btn--primary tp-press w-full">
          <Plus className="h-5 w-5" />
          {t('trainee.meals.customSave')}
          {valid && <span className="opacity-80" dir="ltr">· {fmtNum(num(f.kcal) * scale)} kcal</span>}
        </button>
      }
    >
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
      </div>
    </Sheet>
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
