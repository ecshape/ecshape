import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, ChefHat, Clock, Loader2, Salad, Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/features/trainee/api';
import { Sheet } from '@/features/trainee/ui';
import { FoodThumb } from '@/features/trainee/AddMealSheet';
import { MEAL_TEMPLATES, pick } from '@/features/trainer/planTemplates';
import { buildMealPlanBody } from '@/features/trainer/TemplatesSheet';
import type { ChatMessage } from './api';
import './chatCardsI18n';

/** QA #54: the coach sends a weekly menu as a card; the client goes through it meal by meal and confirms. */
type PlanFood = { name: string; name_hebrew?: string | null; calories?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null; serving_size?: string | null; measurement_type?: string };
type PlanCat = { macro_type: 'protein' | 'carb' | 'fat'; quantity_instruction?: string | null; food_options: PlanFood[] };
type PlanSlot = { name: string; time_suggestion?: string | null; target_calories?: number | null; macro_categories: PlanCat[] };
type MenuPlan = { name: string; description?: string | null; meal_slots: PlanSlot[] };
type MenuSummary = { template_id?: string; name: string; goal?: string; kcal?: number; p?: number; c?: number; f?: number; meals?: number };
export type MenuCardData =
  | { kind: 'menu_proposal'; status: 'pending' | 'accepted'; menu: MenuSummary; plan: MenuPlan; choices?: Record<string, number> }
  | { kind: 'menu_reply'; request_id: number; name?: string };

const MACRO_VAR: Record<string, string> = { protein: '--macro-protein', carb: '--macro-carbs', carbs: '--macro-carbs', fat: '--macro-fat' };
const macroKey = (m: string) => (m === 'carb' ? 'carbs' : m);

const MacroChips: React.FC<{ m: MenuSummary; own?: boolean }> = ({ m, own }) => {
  const { t } = useTranslation();
  return (
    <span className="mt-1.5 flex flex-wrap gap-1 text-[11px] font-semibold" dir="ltr">
      {m.kcal ? <span className={cn('rounded-full px-2 py-0.5', own ? 'bg-white/20' : 'bg-foreground/[.07]')}>{m.kcal} kcal</span> : null}
      {([['p', 'protein'], ['c', 'carb'], ['f', 'fat']] as const).map(([k, macro]) => m[k] ? (
        <span key={k} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: own ? 'rgba(255,255,255,.2)' : `hsl(var(${MACRO_VAR[macro]}) / .15)`, color: own ? undefined : `hsl(var(${MACRO_VAR[macro]}))` }}>
          {t(`trainee.macros.${macroKey(macro)}`)} {m[k]}g
        </span>
      ) : null)}
    </span>
  );
};

/* ------------------------------------------------------------------ card in the thread */

export const MenuCardView: React.FC<{ m: ChatMessage; own: boolean }> = ({ m, own }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const card = m.card as MenuCardData | undefined;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (!card) return null;

  if (card.kind === 'menu_reply') {
    return (
      <div className={cn('mb-1.5 flex items-center gap-3 rounded-2xl p-2', own ? 'bg-white/15' : 'bg-foreground/[.05]')}>
        <span className={cn('grid h-11 w-11 place-items-center rounded-2xl', own ? 'bg-white/20' : 'bg-[hsl(var(--macro-fat)/.18)] text-[hsl(var(--macro-fat))]')}><Check className="h-5 w-5" strokeWidth={3} /></span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold">{t('chatCards.menu.approved')}</span>
          {card.name && <span className="block truncate opacity-80" dir="auto">{card.name}</span>}
        </span>
      </div>
    );
  }

  const accepted = done || card.status === 'accepted';
  const isClient = user?.role === 'CLIENT';
  return (
    <div className={cn('mb-1.5 w-[min(19rem,72vw)] overflow-hidden rounded-2xl', own ? 'bg-white/15' : 'bg-foreground/[.04]')} data-testid="menu-card">
      <div className={cn('flex items-center gap-3 p-3', own ? '' : 'bg-gradient-to-br from-primary/15 to-transparent')}>
        <span className={cn('grid h-12 w-12 flex-none place-items-center rounded-2xl', own ? 'bg-white/20' : 'bg-primary text-primary-foreground shadow-[0_10px_22px_-12px_hsl(var(--primary))]')}><Salad className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[11px] font-bold uppercase tracking-wider', own ? 'text-white/75' : 'text-primary')}>{t('chatCards.menu.label')}</span>
          <span className="block font-bold leading-snug" dir="auto">{card.menu.name}</span>
          <span className={cn('block text-xs', own ? 'text-white/75' : 'text-muted-foreground')}>{t('chatCards.menu.meals', { count: card.plan.meal_slots.length })}</span>
        </span>
      </div>
      <div className="px-3 pb-3">
        {card.menu.goal && <p className={cn('text-xs leading-relaxed', own ? 'text-white/85' : 'text-muted-foreground')} dir="auto">{card.menu.goal}</p>}
        <MacroChips m={card.menu} own={own} />
        {accepted ? (
          <span className={cn('mt-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold', own ? 'bg-white/20' : 'bg-[hsl(var(--macro-fat)/.18)] text-[hsl(var(--macro-fat))]')}><Check className="h-3.5 w-3.5" />{t('chatCards.menu.approvedShort')}</span>
        ) : isClient ? (
          <button type="button" onClick={() => setOpen(true)} className="tp-btn tp-btn--primary tp-btn--sm tp-press mt-2.5 w-full" data-testid="menu-review">
            <ChefHat className="h-4 w-4" />{t('chatCards.menu.review')}
          </button>
        ) : (
          <span className={cn('mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold', own ? 'text-white/80' : 'text-muted-foreground')}><Clock className="h-3.5 w-3.5" />{t('chatCards.menu.waiting')}</span>
        )}
      </div>
      {isClient && !accepted && <MenuReviewSheet open={open} onOpenChange={setOpen} messageId={m.id} card={card} onDone={() => { setDone(true); setOpen(false); }} />}
    </div>
  );
};

/* ------------------------------------------------------------------ client: meal-by-meal review */

const MenuReviewSheet: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; messageId: number; card: Extract<MenuCardData, { kind: 'menu_proposal' }>; onDone: () => void }> = ({ open, onOpenChange, messageId, card, onDone }) => {
  const { t, i18n } = useTranslation();
  const he = (i18n.language || '').startsWith('he');
  const slots = card.plan.meal_slots;
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slot = slots[step];
  const last = step === slots.length - 1;
  const foodName = (f: PlanFood) => (he && f.name_hebrew ? f.name_hebrew : f.name);

  const go = (to: number) => { setDir(to > step ? 'next' : 'prev'); setStep(to); };
  const approve = async () => {
    const nextApproved = new Set(approved).add(step);
    setApproved(nextApproved);
    if (!last) return go(step + 1);
    setBusy(true);
    setError(null);
    try {
      await api(`/v2/chat/menu-proposal/${messageId}/accept`, { method: 'POST', body: { choices, message: t('chatCards.menu.acceptMsg', { name: card.menu.name }) } });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const kcalOf = (f: PlanFood) => (f.calories ? `${Math.round(f.calories)} kcal${f.measurement_type === 'per_portion' ? ` / ${f.serving_size || t('chatCards.menu.portion')}` : ' / 100g'}` : '');

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={card.menu.name}
      description={t('chatCards.menu.reviewHelp')}
      footer={
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => go(step - 1)} disabled={step === 0} className="tp-icon-btn tp-press disabled:opacity-30" aria-label={t('chatCards.menu.prev')}><ArrowLeft className="h-5 w-5 rtl:rotate-180" /></button>
          <button type="button" onClick={approve} disabled={busy} className="tp-btn tp-btn--primary tp-press flex-1" data-testid="menu-approve">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : last ? <Sparkles className="h-5 w-5" /> : <Check className="h-5 w-5" />}
            {last ? t('chatCards.menu.confirm') : t('chatCards.menu.approveMeal')}
            {!last && <ArrowRight className="h-4 w-4 opacity-80 rtl:rotate-180" />}
          </button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        {/* progress: one segment per meal */}
        <div className="flex items-center gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={slots.length} aria-valuenow={approved.size} aria-label={t('chatCards.menu.progress', { done: approved.size, total: slots.length })}>
          {slots.map((s, i) => (
            <button key={i} type="button" onClick={() => go(i)} className={cn('h-1.5 flex-1 rounded-full transition-colors', approved.has(i) ? 'bg-[hsl(var(--macro-fat))]' : i === step ? 'bg-primary' : 'bg-foreground/10')} aria-label={s.name} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t('chatCards.menu.step', { n: step + 1, total: slots.length })}</p>

        <div key={step} className={cn(dir === 'next' ? 'tr-slide-next' : 'tr-slide-prev')}>
          <div className="mb-3 flex items-end justify-between gap-2">
            <h3 className="tp-title text-[2rem] leading-none" dir="auto">{slot.name}</h3>
            <span className="flex flex-none items-center gap-2 text-xs text-muted-foreground">
              {slot.time_suggestion && <span className="tp-chip"><Clock className="h-3 w-3" /><span dir="ltr">{slot.time_suggestion}</span></span>}
              {slot.target_calories ? <span dir="ltr">{slot.target_calories} kcal</span> : null}
            </span>
          </div>
          <div className="space-y-3">
            {slot.macro_categories.map((cat, ci) => {
              const key = `${step}-${ci}`;
              const chosen = choices[key] ?? 0;
              const v = MACRO_VAR[cat.macro_type] ?? '--primary';
              return (
                <section key={ci} className="rounded-2xl bg-foreground/[.035] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: `hsl(var(${v}))` }} aria-hidden />
                    <span className="text-sm font-bold">{t(`trainee.macros.${macroKey(cat.macro_type)}`)}</span>
                    {cat.quantity_instruction && <span className="ms-auto truncate text-xs text-muted-foreground" dir="auto">{cat.quantity_instruction}</span>}
                  </div>
                  <div className="tp-scroll-x -mx-1 flex gap-2 px-1 pb-0.5" role="radiogroup" aria-label={t(`trainee.macros.${macroKey(cat.macro_type)}`)}>
                    {cat.food_options.map((f, fi) => {
                      const on = chosen === fi;
                      return (
                        <button
                          key={fi} type="button" role="radio" aria-checked={on}
                          onClick={() => setChoices((c) => ({ ...c, [key]: fi }))}
                          className={cn('tp-press relative w-[7.25rem] flex-none overflow-hidden rounded-2xl bg-card text-start ring-1 transition-shadow', on ? 'ring-2 ring-primary shadow-[0_12px_26px_-16px_hsl(var(--primary))]' : 'ring-border/60')}
                        >
                          <FoodThumb name={f.name} needsImage className="aspect-[4/3] w-full rounded-none" />
                          {on && <span className="absolute end-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>}
                          {fi === 0 && <span className="absolute start-1.5 top-1.5 rounded-full bg-black/55 px-1.5 text-[9px] font-bold leading-4 text-white">{t('chatCards.menu.coachPick')}</span>}
                          <span className="block p-2">
                            <span className="line-clamp-2 block text-xs font-bold leading-tight" dir="auto">{foodName(f)}</span>
                            <span className="mt-0.5 block text-[10px] text-muted-foreground" dir="ltr">{kcalOf(f)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ coach: send a menu from the composer */

export const MenuSendButton: React.FC<{ clientId: number; clientName: string; onSent: (m: ChatMessage) => void }> = ({ clientId, clientName, onSent }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'he';
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string>(MEAL_TEMPLATES[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tpl = useMemo(() => MEAL_TEMPLATES.find((x) => x.id === sel), [sel]);

  const send = async () => {
    if (!tpl) return;
    setBusy(true);
    setError(null);
    try {
      const plan = await buildMealPlanBody(tpl, lang);
      const menu: MenuSummary = { template_id: tpl.id, name: pick(tpl.name, lang), goal: pick(tpl.goal, lang), kcal: tpl.kcal, p: tpl.p, c: tpl.c, f: tpl.f, meals: tpl.slots.length };
      const msg = await api<ChatMessage>('/v2/chat/menu-proposal', { method: 'POST', body: { client_id: clientId, message: t('chatCards.menu.sendMsg', { name: menu.name }), menu, plan } });
      onSent(msg);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t('chatCards.menu.sendButton')} title={t('chatCards.menu.sendButton')} data-testid="menu-send-open"
      >
        <Salad className="h-5 w-5" />
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t('chatCards.menu.sendTitle')}
        description={t('chatCards.menu.sendHelp', { name: clientName })}
        footer={
          <button type="button" onClick={send} disabled={busy || !tpl} className="tp-btn tp-btn--primary tp-press w-full" data-testid="menu-send">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}{t('chatCards.menu.sendTo', { name: clientName })}
          </button>
        }
      >
        <div className="space-y-2 pb-2" role="radiogroup" aria-label={t('chatCards.menu.sendTitle')}>
          {MEAL_TEMPLATES.map((x) => {
            const on = x.id === sel;
            return (
              <button
                key={x.id} type="button" role="radio" aria-checked={on} onClick={() => setSel(x.id)}
                className={cn('tp-press flex w-full items-start gap-3 rounded-2xl p-3 text-start ring-1 transition-shadow', on ? 'bg-primary/[.07] ring-2 ring-primary' : 'bg-foreground/[.035] ring-transparent hover:ring-border')}
              >
                <span className={cn('grid h-11 w-11 flex-none place-items-center rounded-2xl', on ? 'bg-primary text-primary-foreground' : 'bg-foreground/[.07]')}><Salad className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold" dir="auto">{pick(x.name, lang)}</span>
                  <span className="block text-xs leading-relaxed text-muted-foreground" dir="auto">{pick(x.goal, lang)}</span>
                  <MacroChips m={{ name: '', kcal: x.kcal, p: x.p, c: x.c, f: x.f }} />
                  <span className="mt-1.5 block truncate text-[11px] text-muted-foreground" dir="auto">{x.slots.map((s) => pick(s.name, lang)).join(' · ')}</span>
                </span>
                {on && <Check className="mt-1 h-5 w-5 flex-none text-primary" />}
              </button>
            );
          })}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      </Sheet>
    </>
  );
};

export default MenuCardView;
