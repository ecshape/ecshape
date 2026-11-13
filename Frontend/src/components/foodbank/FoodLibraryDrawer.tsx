import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, ExternalLink, Loader2, Plus, Search, X } from 'lucide-react';
import { API_BASE_URL } from '@/config/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { IconOf, MACRO_ICON } from './FoodIcons';
import { FoodPhoto, MacroStats, NovaBadge, NutriScoreBadge, PhotoCredit, PropertyChip } from './FoodParts';
import {
  libraryName,
  normalizeMacroType,
  type LibraryFood,
  type MacroType,
  type MealBankItem,
  type PropertyTag,
} from './foodbankModel';

interface SearchResponse {
  staples: LibraryFood[];
  products: LibraryFood[];
  count: number;
  has_more: boolean;
  library_error: string | null;
}

const LANGS: Array<{ code: 'he' | 'en' | 'fr'; label: string }> = [
  { code: 'he', label: 'עברית' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

const MACROS: MacroType[] = ['protein', 'carb', 'fat'];

export const libraryKey = (source?: string | null, sourceId?: string | null) =>
  source && sourceId ? `${source}:${sourceId}` : '';

function LibraryCard({
  food,
  index,
  lang,
  added,
  adding,
  onAdd,
}: {
  food: LibraryFood;
  index: number;
  lang: string;
  added: boolean;
  adding: boolean;
  onAdd: (food: LibraryFood, macro: MacroType) => void;
}) {
  const { t } = useTranslation();
  const [macro, setMacro] = useState<MacroType>(food.macro_type);
  const name = libraryName(food, lang);
  const tags = food.tags.filter((tag) => tag !== 'vegetarian' || !food.tags.includes('vegan')) as PropertyTag[];

  return (
    <article
      className="fb-lib-card flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card"
      style={{ ['--i' as string]: index }}
    >
      <FoodPhoto
        src={food.image_thumb_url || food.image_url}
        alt={name}
        macro={macro}
        contain={food.source === 'openfoodfacts'}
        iconSize={36}
      >
        <div className="fb-photo__shade" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-2">
          <span className="flex gap-1">
            <NutriScoreBadge grade={food.nutriscore} compact />
            <NovaBadge group={food.source === 'openfoodfacts' ? food.nova_group : null} compact />
          </span>
          <span className="fb-glass rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums">
            {food.kcal !== null ? Math.round(food.kcal) : '—'}
            <span className="ms-0.5 text-[9px] font-normal opacity-80">{t('foodBankPro.kcal')}</span>
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-2">
          <PhotoCredit credit={food.image_url ? food.image_credit : null} className="block" />
        </div>
      </FoodPhoto>

      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <div className="min-w-0">
          <h4 className="line-clamp-2 text-sm font-semibold leading-snug" dir="auto" title={name}>
            {name}
          </h4>
          <p className="truncate text-[11px] text-muted-foreground" dir="auto">
            {[food.brand, food.quantity].filter(Boolean).join(' · ') || t('foodBankPro.library.values')}
          </p>
        </div>
        <MacroStats protein={food.protein} carbs={food.carbs} fat={food.fat} compact />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <PropertyChip key={tag} tag={tag} size="xs" />
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center gap-1.5 pt-1">
          <div className="flex rounded-lg border border-border/70 p-0.5" role="radiogroup" aria-label={t('foodBank.macroType')}>
            {MACROS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={macro === m}
                title={t('foodBankPro.library.addAs', { macro: t(`foodBankPro.macro.${m}`) })}
                onClick={() => setMacro(m)}
                disabled={added}
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-md transition-colors',
                  macro === m ? `fb-macro-badge fb-accent-${m}` : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <IconOf icon={MACRO_ICON[m]} size={14} />
                <span className="sr-only">{t(`foodBankPro.macro.${m}`)}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={added || adding}
            onClick={() => onAdd(food, macro)}
            className={cn(
              'inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              added
                ? 'bg-emerald-500/15 text-emerald-500'
                : 'bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-60',
            )}
          >
            {added ? (
              <>
                <Check className="fb-added h-3.5 w-3.5" />
                <span className="truncate">{t('foodBankPro.library.added')}</span>
              </>
            ) : adding ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="truncate">{t('foodBankPro.library.adding')}</span>
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                <span className="truncate">{t('foodBankPro.library.add')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

function LibrarySkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border/60 bg-card" aria-hidden="true">
          <div className="fb-skel aspect-[16/10]" />
          <div className="space-y-2 p-2.5">
            <div className="fb-skel h-3.5 w-4/5 rounded" />
            <div className="fb-skel h-3 w-1/2 rounded" />
            <div className="fb-skel h-8 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FoodLibraryDrawer({
  open,
  onOpenChange,
  importedKeys,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importedKeys: Set<string>;
  onImported: (item: MealBankItem) => void;
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const uiLang = (i18n.language || 'he').slice(0, 2);
  const isRtl = uiLang === 'he';
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState<'he' | 'en' | 'fr'>(
    (['he', 'en', 'fr'].includes(uiLang) ? uiLang : 'he') as 'he' | 'en' | 'fr',
  );
  const [data, setData] = useState<SearchResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(
    async (q: string, searchLang: string, nextPage: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (nextPage === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const token = localStorage.getItem('access_token');
        const params = new URLSearchParams({ q, lang: searchLang, page: String(nextPage) });
        const res = await fetch(`${API_BASE_URL}/v2/meals/food-library/search?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as SearchResponse;
        setData((prev) =>
          nextPage === 1 || !prev
            ? json
            : {
                ...json,
                staples: prev.staples,
                products: [
                  ...prev.products,
                  ...json.products.filter((p) => !prev.products.some((x) => x.id === p.id)),
                ],
              },
        );
        setPage(nextPage);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setData((prev) => ({
          staples: prev?.staples ?? [],
          products: nextPage === 1 ? [] : prev?.products ?? [],
          count: 0,
          has_more: false,
          library_error: 'unavailable',
        }));
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  // Debounced search (Open Food Facts asks clients to keep search traffic low).
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const handle = window.setTimeout(() => runSearch(q, lang, 1), q ? 450 : 0);
    return () => window.clearTimeout(handle);
  }, [open, query, lang, runSearch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleAdd = async (food: LibraryFood, macro: MacroType) => {
    const key = libraryKey(food.source, food.source_id);
    setAdding((s) => new Set(s).add(key));
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/v2/meals/food-library/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: food.source,
          source_id: food.source_id,
          lang,
          macro_type: macro,
          item: food,
        }),
      });
      if (res.status === 409) {
        setJustAdded((s) => new Set(s).add(key));
        toast({ title: t('foodBankPro.library.already') });
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.detail === 'string' ? err.detail : t('foodBank.errorCreate'));
      }
      const created = (await res.json()) as MealBankItem & { macro_type: string };
      setJustAdded((s) => new Set(s).add(key));
      onImported({ ...created, macro_type: normalizeMacroType(created.macro_type) });
      toast({ title: t('foodBankPro.library.addedToast', { name: libraryName(food, uiLang) }) });
    } catch (err) {
      toast({
        title: t('common.error'),
        description: err instanceof Error ? err.message : t('foodBank.errorCreate'),
        variant: 'destructive',
      });
    } finally {
      setAdding((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  };

  const q = query.trim();
  const staples = data?.staples ?? [];
  const products = data?.products ?? [];
  const isAdded = (f: LibraryFood) => {
    const key = libraryKey(f.source, f.source_id);
    return importedKeys.has(key) || justAdded.has(key);
  };

  const sections = useMemo(
    () => [
      { key: 'staples', title: q ? t('foodBankPro.library.staples') : t('foodBankPro.library.popular'), items: staples },
      { key: 'products', title: t('foodBankPro.library.products'), items: products },
    ],
    [q, staples, products, t],
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fb-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content
          dir={isRtl ? 'rtl' : 'ltr'}
          className="fb-drawer fixed z-50 flex w-full max-w-[min(100vw,46rem)] flex-col border-s border-border bg-background shadow-2xl focus:outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          {/* Header */}
          <div className="border-b border-border/70 px-4 pb-4 pt-5 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-xl font-bold tracking-tight">
                  {t('foodBankPro.library.title')}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {t('foodBankPro.library.subtitle')}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border/70 text-muted-foreground transition hover:rotate-90 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:rotate-0"
                aria-label={t('foodBankPro.library.close')}
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('foodBankPro.library.placeholder')}
                  dir="auto"
                  className="h-11 w-full rounded-xl border border-border bg-card pe-10 ps-9 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
                />
                {loading && (
                  <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
                )}
              </div>
              <div
                className="flex h-11 shrink-0 rounded-xl border border-border bg-card p-1"
                role="radiogroup"
                aria-label={t('foodBankPro.library.language')}
              >
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    role="radio"
                    aria-checked={lang === l.code}
                    onClick={() => setLang(l.code)}
                    className={cn(
                      'rounded-lg px-3 text-xs font-medium transition-colors',
                      lang === l.code ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {data?.library_error && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {t('foodBankPro.library.error')}
              </div>
            )}

            {loading && !data ? (
              <LibrarySkeletonGrid />
            ) : (
              <div className="space-y-6">
                {sections.map((section) =>
                  section.items.length > 0 ? (
                    <section key={section.key}>
                      <div className="mb-2.5 flex items-baseline justify-between gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {section.title}
                        </h3>
                        {section.key === 'products' && data && data.count > 0 && (
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {t('foodBankPro.library.results', { count: data.count })}
                          </span>
                        )}
                      </div>
                      <div
                        key={`${section.key}-${q}-${lang}`}
                        className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', loading && 'opacity-60 transition-opacity')}
                      >
                        {section.items.map((food, i) => (
                          <LibraryCard
                            key={food.id}
                            food={food}
                            index={i}
                            lang={lang}
                            added={isAdded(food)}
                            adding={adding.has(libraryKey(food.source, food.source_id))}
                            onAdd={handleAdd}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null,
                )}

                {q.length < 2 && (
                  <p className="text-center text-xs text-muted-foreground">{t('foodBankPro.library.typeMore')}</p>
                )}
                {q.length >= 2 && !loading && products.length === 0 && !data?.library_error && (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t('foodBankPro.library.noResults')}</p>
                )}
                {loading && data && q.length >= 2 && products.length === 0 && <LibrarySkeletonGrid />}

                {data?.has_more && products.length > 0 && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => runSearch(q, lang, page + 1)}
                      disabled={loadingMore}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-5 text-sm font-medium transition hover:border-primary/50 hover:text-primary active:scale-95 disabled:opacity-60"
                    >
                      {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                      {t('foodBankPro.library.loadMore')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Attribution */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border/70 px-4 py-2.5 text-[11px] text-muted-foreground sm:px-6">
            <a
              href="https://world.openfoodfacts.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium hover:text-foreground"
            >
              {t('foodBankPro.library.dataOff')}
              <ExternalLink className="h-3 w-3" />
              <span className="font-normal opacity-80">({t('foodBankPro.library.dataOffLicense')})</span>
            </a>
            <span>{t('foodBankPro.library.dataStaples')}</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
