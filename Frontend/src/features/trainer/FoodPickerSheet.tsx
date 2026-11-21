/**
 * Food picker of the menu editor (QA #125): a real popup instead of an inline list. Full search over the coach's bank
 * (Hebrew and English names), macro filter, photo cards with calories and macros, multi-select with a running count.
 * Selection is local until "Done", so closing the popup without confirming changes nothing.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Search, X } from 'lucide-react';
import { FoodPhoto } from '@/components/foodbank/FoodParts';
import '@/components/foodbank/foodbank.css';
import { cn } from '@/lib/utils';
import { Seg, Sheet } from './ui';
import { foodLabel, type BankFood } from './menus';
import type { Macro } from './planTemplates';

type Filter = 'all' | Macro;

const PAGE = 60;

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[֑-ׇ̀-ͯ]/g, '').trim();

export const FoodPickerSheet: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bank: BankFood[];
  macro: Macro;
  selected: number[];
  onDone: (ids: number[]) => void;
}> = ({ open, onOpenChange, bank, macro, selected, onDone }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'he';
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>(macro);
  const [picked, setPicked] = useState<number[]>(selected);
  const [limit, setLimit] = useState(PAGE);
  const more = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setFilter(macro);
    setPicked(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: bank.length, protein: 0, carb: 0, fat: 0 };
    bank.forEach((b) => { c[(b.macro_type ?? 'protein') as Macro] += 1; });
    return c;
  }, [bank]);

  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return bank
      .filter((b) => filter === 'all' || (b.macro_type ?? 'protein') === filter)
      .filter((b) => {
        if (!words.length) return true;
        const hay = norm(`${b.name} ${b.name_hebrew ?? ''}`);
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => foodLabel(a, lang).localeCompare(foodLabel(b, lang), lang));
  }, [bank, q, filter, lang]);

  // Big banks (1,000+ foods): paint the first cards at once, add the next ones as the list scrolls.
  useEffect(() => { setLimit(PAGE); }, [q, filter, open]);
  useEffect(() => {
    const el = more.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, results.length]);

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const byId = useMemo(() => new Map(bank.map((b) => [b.id, b])), [bank]);
  const changed = picked.length !== selected.length || picked.some((id) => !selected.includes(id));

  return (
    <Sheet
      open={open} onOpenChange={onOpenChange} tall
      title={t('menus.pickTitle')}
      description={t('menus.pickLead')}
      footer={
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {picked.length === 0 && <span className="text-xs text-muted-foreground">{t('menus.pickNone')}</span>}
            {picked.map((id) => {
              const b = byId.get(id);
              return b ? (
                <span key={id} className="tp-rise inline-flex flex-none items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary" dir="auto">
                  {foodLabel(b, lang)}
                  <button type="button" onClick={() => toggle(id)} aria-label={t('menus.removeFood')} className="grid h-4 w-4 place-items-center rounded-full hover:bg-primary/15"><X className="h-3 w-3" /></button>
                </span>
              ) : null;
            })}
          </div>
          <button type="button" className="tp-btn tp-btn--primary tp-btn--sm tp-press flex-none" data-testid="food-pick-done"
            onClick={() => { if (changed) onDone(picked); onOpenChange(false); }}>
            <Check className="h-4 w-4" />{t('menus.pickDone', { count: picked.length })}
          </button>
        </div>
      }
    >
      <div className="sticky top-0 z-10 -mx-1 space-y-2.5 bg-[hsl(var(--background))] px-1 pb-3 pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="tp-input h-11 pe-10 ps-10" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('menus.searchBank')} aria-label={t('menus.searchBank')} autoFocus type="search" enterKeyHint="search"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label={t('common.clear', 'Clear')} className="absolute end-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Seg<Filter>
          value={filter} onChange={setFilter} label={t('menus.macro')}
          items={(['all', 'protein', 'carb', 'fat'] as const).map((id) => ({ id, label: id === 'all' ? t('menus.pickAll') : t(`foodBankPro.macro.${id}`), count: counts[id] }))}
        />
      </div>

      {results.length ? (
        <ul className="grid grid-cols-2 gap-2.5 pb-2 sm:grid-cols-3" data-testid="food-pick-grid">
          {results.slice(0, limit).map((b, i) => {
            const on = picked.includes(b.id);
            const name = foodLabel(b, lang);
            const portion = (b.measurement_type ?? '').endsWith('portion');
            return (
              <li key={b.id} className="tp-rise" style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
                <button
                  type="button" onClick={() => toggle(b.id)} aria-pressed={on}
                  className={cn('tp-press group relative block w-full overflow-hidden rounded-2xl bg-card text-start shadow-[inset_0_0_0_1px_hsl(var(--border))] transition-shadow',
                    on && 'shadow-[inset_0_0_0_2px_hsl(var(--primary))]')}
                >
                  <FoodPhoto src={b.image_url} alt={name} macro={(b.macro_type ?? 'protein') as Macro} className="!aspect-[4/3]" iconSize={34} />
                  <span className={cn('absolute end-2 top-2 grid h-7 w-7 place-items-center rounded-full border-2 transition-colors',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-white/80 bg-black/25 text-transparent')}>
                    <Check className="h-4 w-4" />
                  </span>
                  <span className="block p-2.5">
                    <span className="line-clamp-2 block min-h-[2.5em] text-sm font-semibold leading-tight" dir="auto">{name}</span>
                    <span className="mt-1.5 flex items-baseline justify-between gap-1 text-[11px] text-muted-foreground">
                      <span className="tabular-nums" dir="ltr"><b className="text-sm text-foreground">{Math.round(b.calories ?? 0)}</b> {t('foodBankPro.kcal')}</span>
                      <span>{portion ? t('menus.perPortion') : t('menus.per100')}</span>
                    </span>
                    <span className="mt-1 flex gap-1 text-[10px] font-semibold tabular-nums" dir="ltr">
                      <span className="rounded-md bg-[hsl(var(--macro-protein)/.14)] px-1.5 py-0.5 text-[hsl(var(--macro-protein))]">P {Math.round(b.protein ?? 0)}</span>
                      <span className="rounded-md bg-[hsl(var(--macro-carbs)/.14)] px-1.5 py-0.5 text-[hsl(var(--macro-carbs))]">C {Math.round(b.carbs ?? 0)}</span>
                      <span className="rounded-md bg-[hsl(var(--macro-fat)/.14)] px-1.5 py-0.5 text-[hsl(var(--macro-fat))]">F {Math.round(b.fat ?? 0)}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {results.length > limit && <li ref={more} className="col-span-full h-10" aria-hidden />}
        </ul>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">{t('menus.noFood')}</p>
      )}
    </Sheet>
  );
};

export default FoodPickerSheet;
