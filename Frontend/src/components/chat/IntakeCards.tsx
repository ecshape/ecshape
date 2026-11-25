import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChefHat, ClipboardList, Clock, Loader2, RefreshCw, Shuffle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/features/trainee/api';
import { Sheet } from '@/features/trainee/ui';
import { FoodThumb } from '@/features/trainee/AddMealSheet';
import type { ChatMessage } from './api';
import './chatCardsI18n';

/**
 * QA #134: food-preferences form in the chat -> menu of 4-5 options per meal (built from the coach's foods, amounts
 * fitted to the trainee's targets) -> the trainee replaces meals / products and confirms it into their meal plan.
 */
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const GOALS = ['lose', 'gain', 'maintain', 'recomp'] as const;
const DIETS = ['kosher', 'vegetarian', 'vegan', 'pescatarian', 'gluten_free', 'lactose_free'] as const;
const ACTIVITY = ['low', 'moderate', 'high'] as const;

type Answers = {
  goal: (typeof GOALS)[number]; diet: string[]; allergies: string; dislikes: string; likes: string;
  meals: Record<string, string>; sex: 'male' | 'female' | null; age: string; height: string; weight: string;
  activity: (typeof ACTIVITY)[number]; notes: string;
};
type Item = { food_id: number; name: string; name_hebrew?: string | null; macro: string; group?: string | null; qty: string; image?: string | null; kcal: number; p: number };
type Option = { name: string; items: Item[]; kcal: number; p: number; c: number; f: number };
type Slot = { key: string; name: string; time?: string; kcal: number; p?: number; options: Option[] };
type Menu = { name: string; goal: string; targets: { kcal: number; p: number; c: number; f: number }; slots: Slot[] };
export type IntakeCardData =
  | { kind: 'nutrition_intake'; status: 'pending' | 'answered'; lang?: string; answers?: Partial<Answers> }
  | { kind: 'nutrition_intake_reply'; request_id: number; answers?: Partial<Answers> }
  | { kind: 'menu_options'; status: 'pending' | 'accepted'; menu: Menu };

export const isIntakeCard = (c: unknown) => ['nutrition_intake', 'nutrition_intake_reply', 'menu_options'].includes(String((c as { kind?: string } | null)?.kind));

const Chip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode; role?: string }> = ({ on, onClick, children, role = 'radio' }) => (
  <button
    type="button" role={role} aria-checked={on} onClick={onClick}
    className={cn('tp-chip tp-press !min-h-[2.5rem] !px-3.5 text-[13px]', on && '!bg-primary !text-primary-foreground')}
  >
    {on && role === 'checkbox' && <Check className="h-3.5 w-3.5" />}
    {children}
  </button>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <span className="tp-label mb-2 block">{label}</span>
    {children}
  </div>
);

/* ------------------------------------------------------------------ the form */

const IntakeSheet: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; messageId: number; onDone: () => void }> = ({ open, onOpenChange, messageId, onDone }) => {
  const { t } = useTranslation();
  const [a, setA] = useState<Answers>({
    goal: 'maintain', diet: [], allergies: '', dislikes: '', likes: '', meals: {}, sex: null, age: '', height: '', weight: '', activity: 'moderate', notes: '',
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((x) => ({ ...x, [k]: v }));
  const num = (v: string) => v.replace(/[^\d.]/g, '').slice(0, 5);

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/v2/chat/nutrition-intake/${messageId}/answer`, {
        method: 'POST',
        body: { answers: { ...a, age: Number(a.age) || null, height: Number(a.height) || null, weight: Number(a.weight) || null } },
      });
      toast.success(t('chatCards.intake.sent'));
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('chatCards.intake.title')}
      description={t('chatCards.intake.help')}
      footer={
        <button type="button" onClick={submit} disabled={busy} className="tp-btn tp-btn--primary tp-press w-full" data-testid="intake-submit">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}{t('chatCards.intake.submit')}
        </button>
      }
    >
      <div className="space-y-6 pb-2">
        <Field label={t('chatCards.intake.goal')}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('chatCards.intake.goal')}>
            {GOALS.map((g) => <Chip key={g} on={a.goal === g} onClick={() => set('goal', g)}>{t(`chatCards.intake.goals.${g}`)}</Chip>)}
          </div>
        </Field>
        <Field label={t('chatCards.intake.diet')}>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('chatCards.intake.diet')}>
            {DIETS.map((d) => (
              <Chip key={d} role="checkbox" on={a.diet.includes(d)} onClick={() => set('diet', a.diet.includes(d) ? a.diet.filter((x) => x !== d) : [...a.diet, d])}>
                {t(`chatCards.intake.diets.${d}`)}
              </Chip>
            ))}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('chatCards.intake.allergies')}>
            <input className="tp-input" value={a.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder={t('chatCards.intake.allergiesPh')} />
          </Field>
          <Field label={t('chatCards.intake.dislikes')}>
            <input className="tp-input" value={a.dislikes} onChange={(e) => set('dislikes', e.target.value)} placeholder={t('chatCards.intake.dislikesPh')} />
          </Field>
        </div>
        <Field label={t('chatCards.intake.likes')}>
          <input className="tp-input" value={a.likes} onChange={(e) => set('likes', e.target.value)} placeholder={t('chatCards.intake.likesPh')} />
        </Field>
        <Field label={t('chatCards.intake.perMeal')}>
          <div className="grid gap-3 sm:grid-cols-2">
            {SLOTS.map((s) => (
              <label key={s} className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t(`chatCards.intake.slots.${s}`)}</span>
                <input className="tp-input" value={a.meals[s] ?? ''} onChange={(e) => set('meals', { ...a.meals, [s]: e.target.value })} placeholder={t(`chatCards.intake.mealPh.${s}`)} />
              </label>
            ))}
          </div>
        </Field>
        <Field label={t('chatCards.intake.body')}>
          <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t('chatCards.intake.sex')}>
            {(['female', 'male'] as const).map((s) => <Chip key={s} on={a.sex === s} onClick={() => set('sex', s)}>{t(`chatCards.intake.sexes.${s}`)}</Chip>)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['age', 'height', 'weight'] as const).map((k) => (
              <label key={k} className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t(`chatCards.intake.${k}`)}</span>
                <input className="tp-input text-center" inputMode="decimal" dir="ltr" value={a[k]} onChange={(e) => set(k, num(e.target.value))} />
              </label>
            ))}
          </div>
        </Field>
        <Field label={t('chatCards.intake.activity')}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('chatCards.intake.activity')}>
            {ACTIVITY.map((x) => <Chip key={x} on={a.activity === x} onClick={() => set('activity', x)}>{t(`chatCards.intake.activities.${x}`)}</Chip>)}
          </div>
        </Field>
        <Field label={t('chatCards.intake.notes')}>
          <textarea className="tp-input min-h-[5rem] py-3" value={a.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ the menu */

const MenuOptionsSheet: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; messageId: number; menu: Menu; onMenu: (m: Menu) => void; onDone: () => void }> = ({ open, onOpenChange, messageId, menu, onMenu, onDone }) => {
  const { t, i18n } = useTranslation();
  const he = (i18n.language || '').startsWith('he');
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const slot = menu.slots[tab];
  const label = (i: Item) => (he && i.name_hebrew ? i.name_hebrew : i.name);

  const swap = async (option: number, item?: number) => {
    const key = `${tab}-${option}-${item ?? 'all'}`;
    setBusy(key);
    try {
      const m = await api<ChatMessage>(`/v2/chat/menu-options/${messageId}/swap`, { method: 'POST', body: { slot: tab, option, item: item ?? null } });
      const next = (m.card as { menu?: Menu } | null)?.menu;
      if (next) onMenu(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  };
  const confirm = async () => {
    setBusy('confirm');
    try {
      await api(`/v2/chat/menu-options/${messageId}/accept`, { method: 'POST', body: { message: t('chatCards.menu.acceptMsg', { name: menu.name }) } });
      toast.success(t('chatCards.intake.confirmed'));
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={menu.name}
      description={t('chatCards.intake.menuHelp', { kcal: menu.targets.kcal, p: menu.targets.p })}
      footer={
        <button type="button" onClick={confirm} disabled={!!busy} className="tp-btn tp-btn--primary tp-press w-full" data-testid="menu-options-confirm">
          {busy === 'confirm' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}{t('chatCards.intake.confirm')}
        </button>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="tp-scroll-x -mx-1 flex gap-2 px-1" role="tablist">
          {menu.slots.map((s, i) => (
            <button key={s.key} type="button" role="tab" aria-selected={i === tab} onClick={() => setTab(i)}
              className={cn('tp-chip tp-press flex-none !min-h-[2.5rem] !px-3.5', i === tab && '!bg-primary !text-primary-foreground')}>
              {s.name}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {slot.time && <span className="tp-chip"><Clock className="h-3 w-3" /><span dir="ltr">{slot.time}</span></span>}
          <span>{t('chatCards.intake.slotTarget', { kcal: slot.kcal, count: slot.options.length })}</span>
        </p>
        <ol className="space-y-3">
          {slot.options.map((o, oi) => (
            <li key={oi} className="rounded-2xl bg-foreground/[.035] p-3" aria-busy={busy?.startsWith(`${tab}-${oi}-`) || undefined}>
              <div className="mb-2 flex items-start gap-2">
                <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">{oi + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold leading-snug" dir="auto">{o.name}</span>
                  <span className="block text-[11px] text-muted-foreground" dir="ltr">{Math.round(o.kcal)} kcal · P {Math.round(o.p)}g · C {Math.round(o.c)}g · F {Math.round(o.f)}g</span>
                </span>
                <button type="button" onClick={() => swap(oi)} disabled={!!busy} className="tp-btn tp-btn--ghost tp-btn--sm tp-press flex-none" aria-label={t('chatCards.intake.swapMeal')} title={t('chatCards.intake.swapMeal')}>
                  {busy === `${tab}-${oi}-all` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
                  <span className="hidden min-[420px]:inline">{t('chatCards.intake.swapMeal')}</span>
                </button>
              </div>
              <ul className="space-y-1.5">
                {o.items.map((it, ii) => (
                  <li key={`${it.food_id}-${ii}`} className="flex items-center gap-2.5 rounded-xl bg-card p-1.5 ring-1 ring-border/50">
                    <FoodThumb name={it.name} label={label(it)} src={it.image} needsImage className="h-10 w-10 flex-none rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold" dir="auto">{label(it)}</span>
                      <span className="block text-[11px] text-muted-foreground"><span dir="auto">{it.qty}</span> · <span dir="ltr">{Math.round(it.kcal)} kcal</span></span>
                    </span>
                    <button type="button" onClick={() => swap(oi, ii)} disabled={!!busy} className="tp-icon-btn tp-press !h-9 !w-9 flex-none" aria-label={t('chatCards.intake.swapItem', { name: label(it) })} title={t('chatCards.intake.swapItem', { name: label(it) })}>
                      {busy === `${tab}-${oi}-${ii}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ card in the thread */

export const IntakeCardView: React.FC<{ m: ChatMessage; own: boolean }> = ({ m, own }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [card, setCard] = useState(m.card as IntakeCardData | undefined);
  const [open, setOpen] = useState(false);
  React.useEffect(() => { setCard(m.card as IntakeCardData | undefined); }, [m.card]);
  if (!card) return null;
  const isClient = user?.role === 'CLIENT';
  const box = cn('mb-1.5 w-[min(19rem,72vw)] overflow-hidden rounded-2xl', own ? 'bg-white/15' : 'bg-foreground/[.04]');
  const head = (Icon: React.ElementType, kicker: string, title: string, sub?: string) => (
    <div className={cn('flex items-center gap-3 p-3', own ? '' : 'bg-gradient-to-br from-primary/15 to-transparent')}>
      <span className={cn('grid h-12 w-12 flex-none place-items-center rounded-2xl', own ? 'bg-white/20' : 'bg-primary text-primary-foreground shadow-[0_10px_22px_-12px_hsl(var(--primary))]')}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[11px] font-bold uppercase tracking-wider', own ? 'text-white/75' : 'text-primary')}>{kicker}</span>
        <span className="block font-bold leading-snug" dir="auto">{title}</span>
        {sub && <span className={cn('block text-xs', own ? 'text-white/75' : 'text-muted-foreground')}>{sub}</span>}
      </span>
    </div>
  );
  const status = (done: boolean, doneText: string) => done ? (
    <span className={cn('mt-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold', own ? 'bg-white/20' : 'bg-[hsl(var(--macro-fat)/.18)] text-[hsl(var(--macro-fat))]')}><Check className="h-3.5 w-3.5" />{doneText}</span>
  ) : (
    <span className={cn('mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold', own ? 'text-white/80' : 'text-muted-foreground')}><Clock className="h-3.5 w-3.5" />{t('chatCards.intake.waiting')}</span>
  );

  if (card.kind === 'nutrition_intake_reply') {
    const a = card.answers || {};
    const bits = [a.goal && t(`chatCards.intake.goals.${a.goal}`), ...(a.diet || []).map((d) => t(`chatCards.intake.diets.${d}`)), a.allergies, a.dislikes].filter(Boolean);
    return (
      <div className={box}>
        {head(ClipboardList, t('chatCards.intake.label'), t('chatCards.intake.answered'), bits.join(' · ') || undefined)}
        {!isClient && <p className="px-3 pb-3 text-xs text-muted-foreground">{t('chatCards.intake.building')}</p>}
      </div>
    );
  }

  if (card.kind === 'nutrition_intake') {
    const done = card.status !== 'pending';
    return (
      <div className={box} data-testid="intake-card">
        {head(ClipboardList, t('chatCards.intake.label'), t('chatCards.intake.title'), t('chatCards.intake.cardSub'))}
        <div className="px-3 pb-3">
          {done ? status(true, t('chatCards.intake.answeredShort')) : isClient ? (
            <button type="button" onClick={() => setOpen(true)} className="tp-btn tp-btn--primary tp-btn--sm tp-press mt-1 w-full" data-testid="intake-open">
              <ClipboardList className="h-4 w-4" />{t('chatCards.intake.open')}
            </button>
          ) : status(false, '')}
        </div>
        {isClient && !done && <IntakeSheet open={open} onOpenChange={setOpen} messageId={m.id} onDone={() => { setOpen(false); setCard({ ...card, status: 'answered' }); }} />}
      </div>
    );
  }

  const menu = card.menu;
  const accepted = card.status === 'accepted';
  return (
    <div className={box} data-testid="menu-options-card">
      {head(ChefHat, t('chatCards.intake.menuLabel'), menu.name, t('chatCards.intake.menuSub', { kcal: menu.targets.kcal, meals: menu.slots.length }))}
      <div className="px-3 pb-3">
        <p className={cn('text-xs leading-relaxed', own ? 'text-white/85' : 'text-muted-foreground')}>{menu.slots.map((s) => `${s.name} (${s.options.length})`).join(' · ')}</p>
        {accepted ? status(true, t('chatCards.menu.approvedShort')) : isClient ? (
          <button type="button" onClick={() => setOpen(true)} className="tp-btn tp-btn--primary tp-btn--sm tp-press mt-2.5 w-full" data-testid="menu-options-open">
            <ChefHat className="h-4 w-4" />{t('chatCards.intake.openMenu')}
          </button>
        ) : status(false, '')}
      </div>
      {isClient && !accepted && (
        <MenuOptionsSheet
          open={open} onOpenChange={setOpen} messageId={m.id} menu={menu}
          onMenu={(next) => setCard({ ...card, menu: next })}
          onDone={() => { setOpen(false); setCard({ ...card, status: 'accepted' }); }}
        />
      )}
    </div>
  );
};

/** Coach: send the form by hand (from the menu sheet in the composer). */
export async function sendIntake(clientId: number, lang: string): Promise<ChatMessage> {
  return api<ChatMessage>('/v2/chat/nutrition-intake/send', { method: 'POST', body: { client_id: clientId, lang: (lang || 'he').slice(0, 2) } });
}

export default IntakeCardView;
