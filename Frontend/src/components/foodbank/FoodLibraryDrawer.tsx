import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EcSpinner } from '@/components/brand/EcLoader';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, ExternalLink, Info, Layers, Plus, Search, X } from 'lucide-react';
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

type Source = 'all' | 'usda' | 'off';
type UsdaError = 'rate_limited' | 'unavailable' | 'no_translation' | null;

interface SearchResponse {
  staples: LibraryFood[];
  staples_total?: number;
  generic: LibraryFood[];
  generic_count: number;
  generic_error: UsdaError;
  generic_query: string | null;
  generic_has_more: boolean;
  usda_demo_key?: boolean;
  products: LibraryFood[];
  count: number;
  products_has_more?: boolean;
  has_more: boolean;
  library_error: string | null;
}

interface StarterPack {
  key: string;
  count: number;
  already: number;
  preview: string[];
}

const LANGS: Array<{ code: 'he' | 'en' | 'fr'; label: string }> = [
  { code: 'he', label: 'עברית' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

const SOURCES: Source[] = ['all', 'usda', 'off'];
const MACROS: MacroType[] = ['protein', 'carb', 'fat'];

export const libraryKey = (source?: string | null, sourceId?: string | null) =>
  source && sourceId ? `${source}:${sourceId}` : '';

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

function SourceBadge({ source }: { source: LibraryFood['source'] }) {
  const { t } = useTranslation();
  return (
    <span className="fb-glass rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
      {t(`banks.food.badge.${source}`)}
    </span>
  );
}

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
  // USDA descriptions are long and precise: always show the original under a translated name.
  const subtitle =
    food.source === 'usda'
      ? name !== food.name_en
        ? food.name_en
        : t('foodBankPro.library.values')
      : [food.brand, food.quantity].filter(Boolean).join(' · ') || t('foodBankPro.library.values');

  return (
    <article
      className="fb-lib-card flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card"
      style={{ ['--i' as string]: index }}
    >
      <FoodPhoto
        src={food.image_thumb_url || food.image_url}
        alt={name}
        macro={macro}
        category={food.category}
        contain={food.source === 'openfoodfacts'}
        iconSize={36}
      >
        <div className="fb-photo__shade" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-2">
          <span className="flex flex-wrap gap-1">
            {food.source === 'usda' ? (
              <SourceBadge source="usda" />
            ) : (
              <>
                <NutriScoreBadge grade={food.nutriscore} compact />
                <NovaBadge group={food.source === 'openfoodfacts' ? food.nova_group : null} compact />
              </>
            )}
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
          <p className="line-clamp-2 text-[11px] text-muted-foreground" dir="auto" title={subtitle}>
            {subtitle}
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
        <div className="mt-auto flex flex-col gap-1.5 pt-1 sm:flex-row sm:items-center">
          <div
            className="flex rounded-lg border border-border/70 p-0.5"
            role="radiogroup"
            aria-label={t('foodBank.macroType')}
          >
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
                  'grid h-10 flex-1 place-items-center rounded-md transition-colors sm:h-7 sm:w-7 sm:flex-none',
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
              'inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8',
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
                <EcSpinner className="h-3.5 w-3.5" mono />
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

function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'info'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm',
        tone === 'warn'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
          : 'border-border/70 bg-muted/40 text-muted-foreground',
      )}
    >
      {tone === 'warn' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function StarterPacks({
  packs,
  busy,
  onImport,
}: {
  packs: StarterPack[];
  busy: string | null;
  onImport: (key: string) => void;
}) {
  const { t } = useTranslation();
  if (!packs.length) return null;
  return (
    <section>
      <div className="mb-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('banks.food.packs.title')}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('banks.food.packs.subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {packs.map((pack, i) => {
          const missing = pack.count - pack.already;
          const done = missing <= 0;
          return (
            <article
              key={pack.key}
              className="fb-lib-card flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-3"
              style={{ ['--i' as string]: i }}
            >
              <div className="flex items-start gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                  <Layers className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold leading-snug">{t(`banks.food.packs.${pack.key}.title`)}</h4>
                  <p className="text-xs text-muted-foreground">{t(`banks.food.packs.${pack.key}.description`)}</p>
                </div>
              </div>
              <p className="line-clamp-1 text-[11px] text-muted-foreground" dir="auto">
                {pack.preview.join(' · ')}
              </p>
              <div className="mt-auto flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {t('banks.food.packs.count', { count: pack.count })}
                  {pack.already > 0 && !done && <> · {t('banks.food.packs.already', { count: pack.already })}</>}
                </span>
                <button
                  type="button"
                  disabled={done || busy !== null}
                  onClick={() => onImport(pack.key)}
                  className={cn(
                    'ms-auto inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all active:scale-95 sm:h-9',
                    done
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-60',
                  )}
                >
                  {busy === pack.key ? (
                    <EcSpinner className="h-3.5 w-3.5" mono />
                  ) : done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {done ? t('banks.food.packs.allIn') : t('banks.food.packs.add', { count: missing })}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
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
  const [source, setSource] = useState<Source>('all');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const [packs, setPacks] = useState<StarterPack[]>([]);
  const [packBusy, setPackBusy] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(async (q: string, searchLang: string, src: Source, nextPage: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (nextPage === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ q, lang: searchLang, page: String(nextPage), source: src });
      const res = await fetch(`${API_BASE_URL}/v2/meals/food-library/search?${params}`, {
        headers: authHeaders(),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as SearchResponse;
      json.generic = json.generic ?? [];
      const merge = (prev: LibraryFood[], next: LibraryFood[]) => [
        ...prev,
        ...next.filter((p) => !prev.some((x) => x.id === p.id)),
      ];
      setData((prev) =>
        nextPage === 1 || !prev
          ? json
          : {
              ...json,
              staples: prev.staples,
              generic: merge(prev.generic, json.generic),
              products: merge(prev.products, json.products),
            },
      );
      setPage(nextPage);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setData((prev) => ({
        staples: prev?.staples ?? [],
        generic: nextPage === 1 ? [] : prev?.generic ?? [],
        generic_count: 0,
        generic_error: 'unavailable',
        generic_query: null,
        generic_has_more: false,
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
  }, []);

  const loadPacks = useCallback(async (packLang: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/v2/meals/food-library/packs?lang=${packLang}`, { headers: authHeaders() });
      if (res.ok) setPacks(((await res.json()) as { packs: StarterPack[] }).packs);
    } catch {
      /* packs are optional */
    }
  }, []);

  // Debounced search (Open Food Facts and USDA ask clients to keep search traffic low).
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const handle = window.setTimeout(() => runSearch(q, lang, source, 1), q ? 450 : 0);
    return () => window.clearTimeout(handle);
  }, [open, query, lang, source, runSearch]);

  useEffect(() => {
    if (open) loadPacks(lang);
  }, [open, lang, loadPacks]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleAdd = async (food: LibraryFood, macro: MacroType) => {
    const key = libraryKey(food.source, food.source_id);
    setAdding((s) => new Set(s).add(key));
    try {
      const res = await fetch(`${API_BASE_URL}/v2/meals/food-library/import`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
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

  const handlePack = async (packKey: string) => {
    setPackBusy(packKey);
    try {
      const res = await fetch(`${API_BASE_URL}/v2/meals/food-library/packs/${packKey}/import`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { created: number; skipped: number; items: Array<MealBankItem & { macro_type: string }> };
      json.items.forEach((item) => {
        onImported({ ...item, macro_type: normalizeMacroType(item.macro_type) });
        setJustAdded((s) => new Set(s).add(libraryKey(item.source, item.source_id)));
      });
      toast({
        title: t('banks.food.packs.done', { count: json.created }),
        description: json.skipped ? t('banks.food.packs.skipped', { count: json.skipped }) : undefined,
      });
      loadPacks(lang);
    } catch {
      toast({ title: t('common.error'), description: t('banks.food.packs.error'), variant: 'destructive' });
    } finally {
      setPackBusy(null);
    }
  };

  const q = query.trim();
  const staples = data?.staples ?? [];
  const generic = data?.generic ?? [];
  const products = data?.products ?? [];
  const staplesTotal = data?.staples_total ?? staples.length;
  const isAdded = (f: LibraryFood) => {
    const key = libraryKey(f.source, f.source_id);
    return importedKeys.has(key) || justAdded.has(key);
  };
  const searched = q.length >= 2;
  const useUsda = source !== 'off';
  const useOff = source !== 'usda';
  const nothing = searched && !loading && generic.length === 0 && products.length === 0;

  const sections = useMemo(
    () => [
      {
        key: 'staples',
        title: q ? t('foodBankPro.library.staples') : t('banks.food.allStaples', { count: staplesTotal }),
        items: staples,
        count: 0,
      },
      { key: 'generic', title: t('banks.food.sectionUsda'), items: generic, count: data?.generic_count ?? 0 },
      { key: 'products', title: t('banks.food.sectionOff'), items: products, count: data?.count ?? 0 },
    ],
    [q, staples, generic, products, staplesTotal, data?.generic_count, data?.count, t],
  );

  const usdaNotice = () => {
    if (!searched || !useUsda || !data) return null;
    switch (data.generic_error) {
      case 'rate_limited':
        return (
          <Notice>
            {t('banks.food.usdaRateLimited')}
            {data.usda_demo_key && <span className="mt-1 block text-xs opacity-80">{t('banks.food.usdaDemoKey')}</span>}
          </Notice>
        );
      case 'unavailable':
        return <Notice>{t('banks.food.usdaUnavailable')}</Notice>;
      case 'no_translation':
        return <Notice tone="info">{t('banks.food.usdaNoTranslation')}</Notice>;
      default:
        return data.generic_query && data.generic_query.toLowerCase() !== q.toLowerCase() ? (
          <Notice tone="info">
            <span dir="auto">{t('banks.food.searchedAs', { query: data.generic_query })}</span>
          </Notice>
        ) : null;
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fb-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content
          dir={isRtl ? 'rtl' : 'ltr'}
          className="fb-drawer fixed z-50 flex w-full max-w-[min(100vw,46rem)] flex-col border-s border-border bg-background shadow-2xl focus:outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            if (window.matchMedia('(min-width: 640px)').matches) inputRef.current?.focus();
          }}
        >
          {/* Header */}
          <div className="border-b border-border/70 px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-xl font-bold tracking-tight">
                  {t('foodBankPro.library.title')}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {t('banks.food.scale', { count: staplesTotal || 199 })}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border/70 text-muted-foreground transition hover:rotate-90 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:rotate-0"
                aria-label={t('foodBankPro.library.close')}
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('foodBankPro.library.placeholder')}
                  dir="auto"
                  className="h-11 w-full rounded-xl border border-border bg-card pe-10 ps-9 text-base outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/30 sm:text-sm"
                />
                {loading && (
                  <EcSpinner className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2" />
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
                      'flex-1 rounded-lg px-3 text-xs font-medium transition-colors',
                      lang === l.code ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Source picker */}
            <div
              className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1"
              role="radiogroup"
              aria-label={t('banks.food.sourceLabel')}
            >
              {SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={source === s}
                  onClick={() => setSource(s)}
                  className={cn(
                    'flex min-h-11 flex-col items-center justify-center rounded-lg px-1.5 py-1 text-center leading-tight transition-colors',
                    source === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="text-xs font-semibold">{t(`banks.food.source.${s}`)}</span>
                  <span className={cn('text-[10px]', source === s ? 'opacity-90' : 'opacity-70')}>
                    {t(`banks.food.sourceHint.${s}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {searched && useOff && data?.library_error && <Notice>{t('foodBankPro.library.error')}</Notice>}
            {usdaNotice()}

            {loading && !data ? (
              <LibrarySkeletonGrid />
            ) : (
              <div className="space-y-6">
                {!searched && <StarterPacks packs={packs} busy={packBusy} onImport={handlePack} />}

                {sections.map((section) =>
                  section.items.length > 0 ? (
                    <section key={section.key}>
                      <div className="mb-2.5 flex items-baseline justify-between gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {section.title}
                        </h3>
                        {section.count > 0 && (
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {t('foodBankPro.library.results', { count: section.count })}
                          </span>
                        )}
                      </div>
                      <div
                        key={`${section.key}-${q}-${lang}-${source}`}
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

                {!searched && (
                  <p className="text-center text-xs text-muted-foreground">{t('banks.food.typeMore')}</p>
                )}
                {nothing && !data?.library_error && !data?.generic_error && (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t('foodBankPro.library.noResults')}</p>
                )}
                {loading && data && searched && generic.length === 0 && products.length === 0 && <LibrarySkeletonGrid />}

                {data?.has_more && (generic.length > 0 || products.length > 0) && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => runSearch(q, lang, source, page + 1)}
                      disabled={loadingMore}
                      className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-medium transition hover:border-primary/50 hover:text-primary active:scale-95 disabled:opacity-60"
                    >
                      {loadingMore && <EcSpinner className="h-4 w-4" mono />}
                      {t('foodBankPro.library.loadMore')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Attribution */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/70 px-4 py-2.5 text-[11px] text-muted-foreground sm:px-6">
            <a
              href="https://fdc.nal.usda.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-6 items-center gap-1 font-medium hover:text-foreground"
            >
              {t('banks.food.dataUsda')}
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://world.openfoodfacts.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-6 items-center gap-1 font-medium hover:text-foreground"
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
