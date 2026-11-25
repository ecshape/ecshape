/**
 * Ready-made menus of the food bank (QA #120 / #121).
 *
 * One sheet, three screens: the gallery ("My menus" with create / edit / delete, then the ECShape menus), a menu's
 * preview with "assign to a trainee", and the editor. Every food is a bank item: the ECShape menus are resolved
 * against the coach's bank (a missing food is added to it on save / assign, and the preview says which).
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, Copy, Pencil, Plus, Salad, Sparkles, Trash2, UserRound, WandSparkles, X,
} from 'lucide-react';
import { EcSpinner } from '@/components/brand/EcLoader';
import { PortalSelect } from '@/components/ui/portal-select';
import { useConfirm } from '@/components/ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Sheet } from './ui';
import { FoodPickerSheet } from './FoodPickerSheet';
import { api } from '@/features/trainee/api';
import { useTrainerClients } from './hooks';
import { FOODS, MEAL_TEMPLATES, pick, type Macro, type MealTemplate } from './planTemplates';
import {
  assignMenu, bankKey, emptyMenu, foodLabel, matchRef, materializeBuiltin, menusApi, menusKey, missingRefs,
  useBankFoods, useMenus, type BankFood, type Menu, type MenuCat, type MenuSlot,
} from './menus';
import '@/i18n/menus';

type View =
  | { kind: 'list' }
  | { kind: 'mine'; id: number }
  | { kind: 'builtin'; id: string }
  | { kind: 'edit'; draft: Menu }
  | { kind: 'ai' };

interface AiDraft { menu: Menu; engine: string | null; client: string | null; errors?: string[] }

const MACROS: Macro[] = ['protein', 'carb', 'fat'];
const MACRO_TONE: Record<Macro, string> = {
  protein: 'bg-[hsl(var(--macro-protein)/.15)] text-[hsl(var(--macro-protein))]',
  carb: 'bg-[hsl(var(--macro-carbs)/.15)] text-[hsl(var(--macro-carbs))]',
  fat: 'bg-[hsl(var(--macro-fat)/.15)] text-[hsl(var(--macro-fat))]',
};

export const MenusSheet: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; onBankChanged?: () => void }> = ({ open, onOpenChange, onBankChanged }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'he';
  const { toast } = useToast();
  const qc = useQueryClient();
  const [askConfirm, confirmDialog] = useConfirm();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [clientId, setClientId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const { data: menus = [], isPending: menusLoading } = useMenus(open);
  const { data: bank = [] } = useBankFoods(open);
  const { data: clients = [] } = useTrainerClients();
  const activeClients = clients.filter((c) => c.is_active !== false);

  React.useEffect(() => { if (open) setView({ kind: 'list' }); }, [open]);

  const mine = view.kind === 'mine' ? menus.find((m) => m.id === view.id) ?? null : null;
  const builtin = view.kind === 'builtin' ? MEAL_TEMPLATES.find((m) => m.id === view.id) ?? null : null;
  const fail = (e: unknown) => toast({ title: t('common.error'), description: e instanceof Error ? e.message : String(e), variant: 'destructive' });

  const bankChanged = (next: BankFood[]) => {
    qc.setQueryData(bankKey, next);
    onBankChanged?.();
  };

  /** A built-in menu as a bank menu (adds its missing foods to the bank). */
  const fromBuiltin = async (tpl: MealTemplate) => {
    const before = bank.length;
    const { menu, bank: after } = await materializeBuiltin(tpl, lang, bank);
    if (after.length !== before) bankChanged(after);
    return { menu, bank: after };
  };

  const assign = async () => {
    if (!clientId) return;
    setBusy(true);
    try {
      let menu = mine;
      let foods = bank;
      if (builtin) ({ menu, bank: foods } = await fromBuiltin(builtin));
      if (!menu) return;
      await assignMenu(menu, foods, clientId);
      const who = clients.find((c) => c.id === clientId)?.full_name ?? '';
      toast({ title: t('tt.tpl.assigned', { plan: menu.name, client: who }) });
      qc.invalidateQueries({ queryKey: ['trainer'] });
      onOpenChange(false);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const copyBuiltin = async (tpl: MealTemplate) => {
    setBusy(true);
    try { setView({ kind: 'edit', draft: (await fromBuiltin(tpl)).menu }); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const save = async (draft: Menu) => {
    setBusy(true);
    try {
      const saved = draft.id ? await menusApi.update(draft.id, draft) : await menusApi.create(draft);
      qc.setQueryData<Menu[]>(menusKey, (ls = []) => [saved, ...ls.filter((m) => m.id !== saved.id)]);
      toast({ title: t('menus.saved') });
      setView({ kind: 'mine', id: saved.id! });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const remove = async (m: Menu) => {
    if (!m.id || !(await askConfirm({ body: t('menus.deleteConfirm', { name: m.name }) }))) return;
    const prev = qc.getQueryData<Menu[]>(menusKey);
    qc.setQueryData<Menu[]>(menusKey, (ls = []) => ls.filter((x) => x.id !== m.id));
    setView({ kind: 'list' });
    menusApi.remove(m.id).catch((e) => { qc.setQueryData(menusKey, prev); fail(e); });
  };

  const duplicate = (m: Menu) => setView({ kind: 'edit', draft: { ...m, id: undefined, name: t('menus.copyOf', { name: m.name }) } });

  const title =
    view.kind === 'ai' ? t('menus.aiTitle')
      : view.kind === 'edit' ? (view.draft.id ? t('menus.editTitle') : t('menus.newTitle'))
      : mine ? mine.name : builtin ? pick(builtin.name, lang) : t('tt.tpl.mealButton');
  const description =
    view.kind === 'ai' ? t('menus.aiLead')
      : view.kind === 'edit' ? t('menus.editLead')
      : mine ? mine.goal : builtin ? pick(builtin.goal, lang) : t('menus.lead');

  const footer = mine || builtin ? (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <PortalSelect
        className="flex-1 bg-foreground/[.06]" icon={UserRound} label={t('tt.tpl.client')} placeholder={t('tt.tpl.pickClient')}
        value={clientId === '' ? '' : String(clientId)} onChange={(v) => setClientId(v ? Number(v) : '')}
        options={activeClients.map((c) => ({ value: String(c.id), label: c.full_name || c.username }))}
      />
      <button type="button" className="tp-btn tp-btn--primary tp-btn--sm tp-press" disabled={!clientId || busy} onClick={assign}>
        {busy && <EcSpinner className="h-4 w-4" mono />}{t('tt.tpl.assign')}
      </button>
    </div>
  ) : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description} footer={footer} tall={view.kind === 'edit'}>
      {view.kind === 'list' && (
        <div className="space-y-6 pb-2">
          <section>
            <h3 className="tp-label mb-2.5">{t('menus.mine')}</h3>
            <div className="tr-tpl-grid">
              <button
                type="button" onClick={() => setView({ kind: 'edit', draft: emptyMenu(lang) })}
                className="tp-press tr-lift flex min-h-[9.5rem] flex-col items-center justify-center gap-2 rounded-[1.25rem] border-2 border-dashed border-primary/35 bg-primary/[.04] p-4 text-center text-primary"
                data-testid="menu-new"
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground"><Plus className="h-5 w-5" /></span>
                <b>{t('menus.new')}</b>
                <span className="text-xs text-muted-foreground">{t('menus.newHint')}</span>
              </button>
              <button
                type="button" onClick={() => setView({ kind: 'ai' })}
                className="tp-press tr-lift flex min-h-[9.5rem] flex-col items-center justify-center gap-2 rounded-[1.25rem] bg-gradient-to-br from-primary/[.14] to-primary/[.03] p-4 text-center shadow-[inset_0_0_0_1px_hsl(var(--primary)/.3)]"
                data-testid="menu-ai"
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl text-white" style={{ background: 'var(--tr-grad)' }}><WandSparkles className="h-5 w-5" /></span>
                <b className="text-primary">{t('menus.aiNew')}</b>
                <span className="text-xs text-muted-foreground">{t('menus.aiHint')}</span>
              </button>
              {menusLoading && !menus.length && [0, 1].map((i) => <div key={i} className="ec-skel min-h-[9.5rem] rounded-[1.25rem] bg-card" />)}
              {menus.map((m, i) => (
                <MenuTile
                  key={m.id} i={i} name={m.name} goal={m.goal} kcal={m.kcal} p={m.p} c={m.c} f={m.f} meals={m.slots.length}
                  onOpen={() => setView({ kind: 'mine', id: m.id! })}
                  tools={
                    <>
                      <IconBtn label={t('menus.edit')} onClick={() => setView({ kind: 'edit', draft: m })}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                      <IconBtn label={t('menus.delete')} danger onClick={() => void remove(m)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                    </>
                  }
                />
              ))}
            </div>
          </section>
          <section>
            <h3 className="tp-label mb-1 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" />{t('menus.library')}</h3>
            <p className="mb-2.5 text-xs text-muted-foreground">{t('menus.libraryLead')}</p>
            <div className="tr-tpl-grid">
              {MEAL_TEMPLATES.map((m, i) => (
                <MenuTile
                  key={m.id} i={i} name={pick(m.name, lang)} goal={pick(m.goal, lang)} kcal={m.kcal} p={m.p} c={m.c} f={m.f} meals={m.slots.length}
                  onOpen={() => setView({ kind: 'builtin', id: m.id })}
                  tools={<IconBtn label={t('menus.copyEdit')} onClick={() => void copyBuiltin(m)}><Copy className="h-3.5 w-3.5" /></IconBtn>}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      {(mine || builtin) && (
        <div className="space-y-4 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="tr-back tp-press" onClick={() => setView({ kind: 'list' })}><ArrowLeft className="h-4 w-4" />{t('tt.tpl.all')}</button>
            <div className="flex flex-wrap gap-1.5">
              {mine ? (
                <>
                  <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press" onClick={() => setView({ kind: 'edit', draft: mine })}><Pencil className="h-4 w-4" />{t('menus.edit')}</button>
                  <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press" onClick={() => duplicate(mine)}><Copy className="h-4 w-4" />{t('menus.duplicate')}</button>
                  <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press text-destructive" onClick={() => void remove(mine)}><Trash2 className="h-4 w-4" />{t('menus.delete')}</button>
                </>
              ) : builtin && (
                <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press" disabled={busy} onClick={() => void copyBuiltin(builtin)}><Copy className="h-4 w-4" />{t('menus.copyEdit')}</button>
              )}
            </div>
          </div>
          <MacroRow kcal={(mine || builtin)!.kcal} p={(mine || builtin)!.p} c={(mine || builtin)!.c} f={(mine || builtin)!.f} />
          {builtin && <BuiltinNote tpl={builtin} bank={bank} />}
          <div className="tr-tpl-days">
            {mine
              ? mine.slots.map((s, i) => <SlotPreview key={i} slot={s} bank={bank} />)
              : builtin!.slots.map((s, i) => (
                <SlotPreview
                  key={i} bank={bank}
                  slot={{ name: pick(s.name, lang), time: s.time, kcal: s.kcal, cats: s.cats.map((c) => ({ macro: c.macro, qty: pick(c.qty, lang), foods: [] })) }}
                  refs={s.cats.map((c) => c.foods as string[])}
                />
              ))}
          </div>
          <p className="text-xs text-muted-foreground">{t('tt.tpl.replaceNote')}</p>
        </div>
      )}

      {view.kind === 'ai' && (
        <AiBuilder
          clients={activeClients} defaultClient={clientId} bankEmpty={!bank.length}
          onBack={() => setView({ kind: 'list' })}
          onDraft={(d, cid) => {
            if (cid) setClientId(cid);
            toast({ title: d.engine ? t('menus.aiDone', { engine: d.engine }) : t('menus.aiFallback'), description: d.engine ? undefined : d.errors?.[0] });
            setView({ kind: 'edit', draft: d.menu });
          }}
        />
      )}

      {view.kind === 'edit' && (
        <MenuEditor
          key={view.draft.id ?? 'new'} initial={view.draft} bank={bank} busy={busy}
          onCancel={() => setView(view.draft.id ? { kind: 'mine', id: view.draft.id } : { kind: 'list' })}
          onSave={(m) => void save(m)}
        />
      )}
      {confirmDialog}
    </Sheet>
  );
};

/* ------------------------------------------------------------------ pieces */

const IconBtn: React.FC<{ label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }> = ({ label, onClick, danger, children }) => (
  <button
    type="button" aria-label={label} title={label}
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={cn('tp-press grid h-8 w-8 place-items-center rounded-xl bg-foreground/[.06] transition-colors', danger ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-primary/10 hover:text-primary')}
  >{children}</button>
);

const MenuTile: React.FC<{
  i: number; name: string; goal: string; kcal: number; p: number; c: number; f: number; meals: number; onOpen: () => void; tools?: React.ReactNode;
}> = ({ i, name, goal, kcal, p, c, f, meals, onOpen, tools }) => {
  const { t } = useTranslation();
  return (
    <div
      role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="tp-card tr-tpl-card tr-lift tp-rise cursor-pointer text-start" style={{ '--i': i } as React.CSSProperties}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="tr-kpi-ico !h-9 !w-9"><Salad className="h-[18px] w-[18px]" /></span>
        <span className="flex items-center gap-1">{tools}</span>
      </span>
      <span className="mt-3 flex items-baseline justify-between gap-2">
        <b className="min-w-0 truncate leading-snug" dir="auto">{name}</b>
        <span className="tp-num flex-none text-lg">{kcal || '—'}<span className="ms-1 text-xs text-muted-foreground">{t('foodBankPro.kcal')}</span></span>
      </span>
      {goal && <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground" dir="auto">{goal}</span>}
      <span className="mt-3 grid grid-cols-4 gap-1.5 text-center">
        <span className="rounded-lg bg-muted/60 px-1 py-1.5"><span className="block text-[10px] text-muted-foreground">{t('menus.meals')}</span><span className="block text-sm font-semibold tabular-nums">{meals}</span></span>
        {([['protein', p], ['carb', c], ['fat', f]] as const).map(([k, v]) => (
          <span key={k} className="rounded-lg bg-muted/60 px-1 py-1.5">
            <span className="block text-[10px] text-muted-foreground">{t(`foodBankPro.macro.${k}`)}</span>
            <span className="block text-sm font-semibold tabular-nums">{v}<span className="ms-0.5 text-[10px] font-normal text-muted-foreground">{t('foodBankPro.g')}</span></span>
          </span>
        ))}
      </span>
    </div>
  );
};

const MacroRow: React.FC<{ kcal: number; p: number; c: number; f: number }> = ({ kcal, p, c, f }) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-4 gap-2 text-center" dir="ltr">
      {([['kcal', kcal], ['protein', p], ['carb', c], ['fat', f]] as const).map(([k, v]) => (
        <div key={k} className="tr-stat !p-2.5"><p className="tp-label">{k === 'kcal' ? t('foodBankPro.kcal') : t(`foodBankPro.macro.${k}`)}</p><p className="tp-num mt-0.5 text-lg">{v}{k === 'kcal' ? '' : t('foodBankPro.g')}</p></div>
      ))}
    </div>
  );
};

const BuiltinNote: React.FC<{ tpl: MealTemplate; bank: BankFood[] }> = ({ tpl, bank }) => {
  const { t, i18n } = useTranslation();
  const missing = missingRefs(tpl, bank);
  return (
    <p className="rounded-2xl bg-foreground/[.04] p-3 text-xs text-muted-foreground">
      {missing.length
        ? t('menus.missingNote', { count: missing.length, foods: missing.map((k) => (i18n.language.startsWith('he') ? FOODS[k].he : FOODS[k].name)).join(', ') })
        : t('menus.allInBank')}
    </p>
  );
};

const SlotPreview: React.FC<{ slot: MenuSlot; bank: BankFood[]; refs?: string[][] }> = ({ slot, bank, refs }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'he';
  const byId = useMemo(() => new Map(bank.map((b) => [b.id, b])), [bank]);
  return (
    <section className="tp-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold" dir="auto">{slot.name}</h3>
        <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">{slot.time}{slot.kcal ? ` · ${slot.kcal} ${t('foodBankPro.kcal')}` : ''}</span>
      </div>
      <ul className="space-y-2 text-sm">
        {slot.cats.map((cat, j) => {
          const names = refs
            ? refs[j].map((k) => { const hit = matchRef(FOODS[k], bank); return { label: hit ? foodLabel(hit, lang) : lang.startsWith('he') ? FOODS[k].he : FOODS[k].name, added: !hit }; })
            : cat.foods.map((id) => byId.get(id)).filter((b): b is BankFood => !!b).map((b) => ({ label: foodLabel(b, lang), added: false }));
          return (
            <li key={j} className="flex items-start gap-2">
              <span className={cn('tp-chip flex-none', MACRO_TONE[cat.macro])}>{t(`foodBankPro.macro.${cat.macro}`)}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                {names.map((n, k) => (
                  <span key={k} className={cn('rounded-full px-2 py-0.5 text-xs', n.added ? 'border border-dashed border-primary/50 text-primary' : 'bg-foreground/[.06]')} title={n.added ? t('menus.willAdd') : undefined} dir="auto">
                    {n.label}{n.added && ' +'}
                  </span>
                ))}
                {cat.qty && <span className="text-xs text-muted-foreground">({cat.qty})</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/* ------------------------------------------------------------------ editor */

const MenuEditor: React.FC<{ initial: Menu; bank: BankFood[]; busy: boolean; onCancel: () => void; onSave: (m: Menu) => void }> = ({ initial, bank, busy, onCancel, onSave }) => {
  const { t } = useTranslation();
  const [m, setM] = useState<Menu>(() => JSON.parse(JSON.stringify(initial)));
  const kcal = m.slots.reduce((a, s) => a + (Number(s.kcal) || 0), 0);
  const foodsCount = m.slots.reduce((a, s) => a + s.cats.reduce((b, c) => b + c.foods.length, 0), 0);
  const canSave = !!m.name.trim() && foodsCount > 0 && !busy;

  const setSlot = (i: number, s: Partial<MenuSlot>) => setM((x) => ({ ...x, slots: x.slots.map((y, j) => (j === i ? { ...y, ...s } : y)) }));
  const setCat = (i: number, k: number, c: Partial<MenuCat>) => setSlot(i, { cats: m.slots[i].cats.map((y, j) => (j === k ? { ...y, ...c } : y)) });
  const move = (i: number, d: -1 | 1) => setM((x) => {
    const s = [...x.slots];
    const j = i + d;
    if (j < 0 || j >= s.length) return x;
    [s[i], s[j]] = [s[j], s[i]];
    return { ...x, slots: s };
  });

  return (
    <form
      className="space-y-4 pb-2"
      onSubmit={(e) => { e.preventDefault(); if (canSave) onSave({ ...m, name: m.name.trim(), kcal: kcal || m.kcal }); }}
    >
      <div className="space-y-2">
        <input className="tp-input text-base font-bold" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} placeholder={t('menus.namePh')} aria-label={t('menus.name')} autoFocus />
        <textarea className="tp-input min-h-[4.5rem] py-2.5 text-sm" value={m.goal} onChange={(e) => setM({ ...m, goal: e.target.value })} placeholder={t('menus.goalPh')} aria-label={t('menus.goal')} rows={2} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="tr-stat !p-2.5 text-center"><p className="tp-label">{t('foodBankPro.kcal')}</p><p className="tp-num mt-0.5 text-lg" dir="ltr">{kcal}</p></div>
        {(['p', 'c', 'f'] as const).map((k) => (
          <label key={k} className="tr-stat !p-2.5 text-center">
            <span className="tp-label block">{t(`foodBankPro.macro.${k === 'p' ? 'protein' : k === 'c' ? 'carb' : 'fat'}`)}</span>
            <input
              type="number" min={0} inputMode="numeric" dir="ltr" value={m[k] || ''} placeholder="0"
              onChange={(e) => setM({ ...m, [k]: Math.max(0, Number(e.target.value) || 0) })}
              className="tp-num mt-0.5 w-full bg-transparent text-center text-lg outline-none"
            />
          </label>
        ))}
      </div>

      <ol className="space-y-3">
        {m.slots.map((s, i) => (
          <li key={i} className="tp-card tp-rise space-y-3 p-3.5" style={{ '--i': i } as React.CSSProperties}>
            <div className="flex flex-wrap items-center gap-2">
              <input className="tp-input h-10 min-w-0 flex-1 basis-40 font-semibold" value={s.name} onChange={(e) => setSlot(i, { name: e.target.value })} aria-label={t('menus.mealName')} placeholder={t('menus.mealName')} />
              <input type="time" className="tp-input h-10 w-[6.5rem]" dir="ltr" value={s.time} onChange={(e) => setSlot(i, { time: e.target.value })} aria-label={t('menus.time')} />
              <span className="inline-flex h-10 items-center overflow-hidden rounded-xl bg-foreground/[.05]">
                <input type="number" min={0} dir="ltr" className="h-full w-16 bg-transparent text-center font-semibold tabular-nums outline-none" value={s.kcal || ''} placeholder="0" onChange={(e) => setSlot(i, { kcal: Math.max(0, Number(e.target.value) || 0) })} aria-label={t('foodBankPro.kcal')} />
                <span className="px-2 text-xs text-muted-foreground">{t('foodBankPro.kcal')}</span>
              </span>
              <span className="ms-auto flex gap-1">
                <IconBtn label={t('menus.up')} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn label={t('menus.down')} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                {m.slots.length > 1 && <IconBtn danger label={t('menus.removeMeal')} onClick={() => setM({ ...m, slots: m.slots.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></IconBtn>}
              </span>
            </div>
            {s.cats.map((c, k) => (
              <CatEditor
                key={k} cat={c} bank={bank}
                onChange={(next) => setCat(i, k, next)}
                onRemove={() => setSlot(i, { cats: s.cats.filter((_, j) => j !== k) })}
              />
            ))}
            {s.cats.length < 6 && (
              <div className="flex flex-wrap gap-1.5">
                {MACROS.map((mc) => (
                  <button key={mc} type="button" className="tp-press inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary"
                    onClick={() => setSlot(i, { cats: [...s.cats, { macro: mc, qty: '', foods: [] }] })}>
                    <Plus className="h-3 w-3" />{t(`foodBankPro.macro.${mc}`)}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      {m.slots.length < 10 && (
        <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press w-full"
          onClick={() => setM({ ...m, slots: [...m.slots, { name: t('menus.mealN', { n: m.slots.length + 1 }), time: '', kcal: 0, cats: [{ macro: 'protein', qty: '', foods: [] }] }] })}>
          <Plus className="h-4 w-4" />{t('menus.addMeal')}
        </button>
      )}

      <div className="sticky bottom-0 -mx-1 flex gap-2 bg-gradient-to-t from-background via-background/95 to-transparent px-1 pb-1 pt-4">
        <button type="button" className="tp-btn tp-btn--ghost tp-press flex-1" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="submit" className="tp-btn tp-btn--primary tp-press flex-[2]" disabled={!canSave} data-testid="menu-save">
          {busy ? <EcSpinner className="h-4 w-4" mono /> : <Check className="h-4 w-4" />}{t('menus.save')}
        </button>
      </div>
      {!foodsCount && <p className="text-center text-xs text-muted-foreground">{t('menus.needFood')}</p>}
    </form>
  );
};

const CatEditor: React.FC<{ cat: MenuCat; bank: BankFood[]; onChange: (c: Partial<MenuCat>) => void; onRemove: () => void }> = ({ cat, bank, onChange, onRemove }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'he';
  const [picking, setPicking] = useState(false);
  const byId = useMemo(() => new Map(bank.map((b) => [b.id, b])), [bank]);
  const toggle = (id: number) => onChange({ foods: cat.foods.includes(id) ? cat.foods.filter((x) => x !== id) : [...cat.foods, id] });

  return (
    <div className="rounded-2xl bg-foreground/[.035] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full bg-background/70 p-0.5" role="radiogroup" aria-label={t('menus.macro')}>
          {MACROS.map((mc) => (
            <button key={mc} type="button" role="radio" aria-checked={cat.macro === mc} onClick={() => onChange({ macro: mc })}
              className={cn('rounded-full px-2.5 py-1 text-xs font-semibold transition-colors', cat.macro === mc ? MACRO_TONE[mc] : 'text-muted-foreground')}>
              {t(`foodBankPro.macro.${mc}`)}
            </button>
          ))}
        </span>
        <input className="tp-input h-9 min-w-0 flex-1 basis-28 text-sm" value={cat.qty} onChange={(e) => onChange({ qty: e.target.value })} placeholder={t('menus.qtyPh')} aria-label={t('menus.qty')} />
        <IconBtn danger label={t('menus.removeGroup')} onClick={onRemove}><X className="h-3.5 w-3.5" /></IconBtn>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {cat.foods.map((id) => {
          const b = byId.get(id);
          if (!b) return null;
          return (
            <span key={id} className="tp-rise inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs font-semibold shadow-sm" dir="auto">
              {foodLabel(b, lang)}
              <button type="button" onClick={() => toggle(id)} aria-label={t('menus.removeFood')} className="grid h-4 w-4 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-3 w-3" /></button>
            </span>
          );
        })}
        {/* QA #125: a full search popup with photos, not an inline list */}
        <button type="button" onClick={() => setPicking(true)} aria-haspopup="dialog" data-testid="menu-add-food"
          className="tp-press inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/15">
          <Plus className="h-3 w-3" />{t('menus.addFood')}
        </button>
      </div>
      <FoodPickerSheet open={picking} onOpenChange={setPicking} bank={bank} macro={cat.macro} selected={cat.foods} onDone={(foods) => onChange({ foods })} />
    </div>
  );
};

/* ------------------------------------------------------------------ AI builder (QA #125) */

const AiBuilder: React.FC<{
  clients: { id: number; full_name?: string | null; username: string }[];
  defaultClient: number | '';
  bankEmpty: boolean;
  onBack: () => void;
  onDraft: (d: AiDraft, clientId: number | '') => void;
}> = ({ clients, defaultClient, bankEmpty, onBack, onDraft }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [clientId, setClientId] = useState<number | ''>(defaultClient);
  const [kcal, setKcal] = useState(2000);
  const [meals, setMeals] = useState(5);
  const [wishes, setWishes] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const d = await api<AiDraft>('/v3/meals/menus/ai-draft', {
        method: 'POST',
        body: { client_id: clientId || null, kcal, meals, wishes, lang: (i18n.language || 'he').slice(0, 2) },
      });
      onDraft(d, clientId);
    } catch (e) {
      toast({ title: t('common.error'), description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <form className="space-y-4 pb-2" onSubmit={(e) => { e.preventDefault(); if (!busy && !bankEmpty) void run(); }}>
      <button type="button" className="tr-back tp-press" onClick={onBack}><ArrowLeft className="h-4 w-4" />{t('tt.tpl.all')}</button>
      <div className="space-y-1.5">
        <span className="tp-label block">{t('menus.aiClient')}</span>
        <PortalSelect
          className="bg-foreground/[.06]" icon={UserRound} label={t('menus.aiClient')} placeholder={t('menus.aiNoClient')}
          value={clientId === '' ? '' : String(clientId)} onChange={(v) => setClientId(v ? Number(v) : '')}
          options={[{ value: '', label: t('menus.aiNoClient') }, ...clients.map((c) => ({ value: String(c.id), label: c.full_name || c.username }))]}
        />
        <span className="block text-xs text-muted-foreground">{t('menus.aiClientHint')}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="tr-stat !p-3">
          <span className="tp-label block">{t('menus.aiKcal')}</span>
          <input type="number" min={800} max={6000} step={50} dir="ltr" inputMode="numeric" value={kcal}
            onChange={(e) => setKcal(Math.max(0, Number(e.target.value) || 0))} onBlur={() => setKcal((k) => Math.min(6000, Math.max(800, k)))}
            className="tp-num mt-1 w-full bg-transparent text-2xl outline-none" />
        </label>
        <div className="tr-stat !p-3">
          <span className="tp-label block">{t('menus.meals')}</span>
          <div className="mt-1.5 flex gap-1" role="radiogroup" aria-label={t('menus.meals')}>
            {[3, 4, 5, 6].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={meals === n} onClick={() => setMeals(n)}
                className={cn('tp-press h-9 flex-1 rounded-xl text-sm font-bold tabular-nums transition-colors', meals === n ? 'bg-primary text-primary-foreground' : 'bg-foreground/[.06] text-muted-foreground')}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label className="block space-y-1.5">
        <span className="tp-label">{t('menus.aiWishes')}</span>
        <textarea className="tp-input min-h-[6rem] py-2.5 text-sm" value={wishes} onChange={(e) => setWishes(e.target.value)} placeholder={t('menus.aiWishesPh')} rows={3} maxLength={1500} />
      </label>
      {bankEmpty && <p className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{t('menus.aiEmptyBank')}</p>}
      <button type="submit" className="tp-btn tp-btn--primary tp-press w-full" disabled={busy || bankEmpty} data-testid="menu-ai-run">
        {busy ? <EcSpinner className="h-4 w-4" mono /> : <Sparkles className="h-4 w-4" />}{busy ? t('menus.aiBusy') : t('menus.aiRun')}
      </button>
      <p className="text-center text-xs text-muted-foreground">{t('menus.aiNote')}</p>
    </form>
  );
};

export default MenusSheet;
