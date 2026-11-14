import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, ExternalLink, Globe, Library, Loader2, Plus, Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExerciseDemo } from './ExerciseDemo';
import { exerciseLibrary, LIBRARY_MUSCLES, type LibraryExercise, type LibraryFacets, type LibrarySource, type LibrarySources } from '@/lib/exerciseLibrary';
import { cn } from '@/lib/utils';

const PAGE = 36;
const LEVELS = ['beginner', 'intermediate', 'expert'] as const;

/** Full-screen browser over the professional exercise library, with multi-select import. */
export function ExerciseLibrary({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (v: boolean) => void; onImported: (created: number) => void }) {
  const { t, i18n } = useTranslation();
  const uiLang = (i18n.language || 'en').slice(0, 2);
  const [facets, setFacets] = useState<LibraryFacets | null>(null);
  const [source, setSource] = useState<LibrarySource>('library');
  const [sources, setSources] = useState<LibrarySources | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [level, setLevel] = useState('');
  const [items, setItems] = useState<LibraryExercise[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<LibraryExercise | null>(null);
  const [importing, setImporting] = useState(false);
  const reqId = useRef(0);

  const label = useCallback((group: 'muscle' | 'equipment' | 'level', key: string) => t(`exerciseLibrary.${group}.${key}`, { defaultValue: key }), [t]);

  useEffect(() => {
    if (open && !facets) exerciseLibrary.facets().then(setFacets).catch(() => setFacets(null));
  }, [open, facets]);

  useEffect(() => {
    if (open) exerciseLibrary.sources().then(setSources).catch(() => setSources(null));
  }, [open, source, total]);

  const load = useCallback(
    async (offset: number) => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const r = await exerciseLibrary.search({
          q: q.trim(),
          muscle,
          equipment,
          level: source === 'wger' ? '' : level,
          source,
          lang: uiLang,
          offset,
          limit: PAGE,
        });
        if (id !== reqId.current) return;
        setError(false);
        setTotal(r.total);
        setItems((prev) => (offset === 0 ? r.items : [...prev, ...r.items]));
      } catch {
        if (id !== reqId.current) return;
        setError(true);
        if (offset === 0) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [q, muscle, equipment, level, source, uiLang]
  );

  useEffect(() => {
    if (!open) return;
    const h = window.setTimeout(() => load(0), q ? 220 : 0);
    return () => window.clearTimeout(h);
  }, [open, load, q]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const doImport = async (ids: string[]) => {
    if (!ids.length) return;
    setImporting(true);
    try {
      const r = await exerciseLibrary.importIds(ids, uiLang);
      setItems((list) => list.map((x) => (ids.includes(x.id) ? { ...x, imported: true } : x)));
      setPicked(new Set());
      onImported(r.created);
    } finally {
      setImporting(false);
    }
  };

  const equipmentKeys = useMemo(() => (facets ? Object.entries(facets.equipment).sort((a, b) => b[1] - a[1]).map(([k]) => k) : []), [facets]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ec-exlib !flex h-[100dvh] !max-h-[100dvh] !w-screen !max-w-[1400px] flex-col !gap-0 !overflow-hidden !rounded-none !p-0 sm:h-[92vh] sm:!max-h-[92vh] sm:!w-[96vw] sm:!rounded-2xl sm:!p-0 !mx-0">
        {/* Header */}
        <div className="ec-exlib-head relative border-b border-border/60 px-5 pb-4 pt-5 sm:px-7">
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary">
              <Library className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-display text-3xl leading-none">{t('exerciseLibrary.title')}</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('banks.exercise.scale', { library: facets?.total ?? sources?.library ?? 873, wger: sources?.wger ?? '800+' })}
              </p>
            </div>
            <div className="relative w-full sm:me-10 sm:w-80">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('exerciseLibrary.search')} className="h-11 ps-10 text-base sm:text-sm" dir="auto" />
            </div>
          </div>

          {/* Source picker */}
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-border/70 bg-card/60 p-1 sm:inline-grid sm:w-auto" role="radiogroup" aria-label={t('banks.exercise.sourceLabel')}>
            {(['library', 'wger'] as LibrarySource[]).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={source === s}
                onClick={() => {
                  setSource(s);
                  setLevel('');
                  setPicked(new Set());
                }}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors',
                  source === s ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {s === 'library' ? <Library className="h-4 w-4 shrink-0" /> : <Globe className="h-4 w-4 shrink-0" />}
                <span className="truncate">{t(`banks.exercise.source.${s}`)}</span>
                <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', source === s ? 'bg-background/20' : 'bg-muted')}>
                  {s === 'library' ? facets?.total ?? 873 : sources?.wger ?? '800+'}
                </span>
              </button>
            ))}
          </div>

          {/* Muscle chips */}
          <div className="ec-exlib-chips mt-4 flex gap-2 overflow-x-auto pb-1">
            <Chip active={!muscle} onClick={() => setMuscle('')}>{t('exerciseLibrary.allMuscles')}</Chip>
            {LIBRARY_MUSCLES.map((m) => (
              <Chip key={m} active={muscle === m} onClick={() => setMuscle(muscle === m ? '' : m)} count={facets?.muscles[m]}>
                {label('muscle', m)}
              </Chip>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className="h-11 rounded-full border border-border/70 bg-card px-3 text-sm sm:h-9">
              <option value="">{t('exerciseLibrary.allEquipment')}</option>
              {equipmentKeys.map((k) => (
                <option key={k} value={k}>{label('equipment', k)}</option>
              ))}
            </select>
            {source === 'library' && LEVELS.map((l) => (
              <Chip key={l} small active={level === l} onClick={() => setLevel(level === l ? '' : l)}>
                <LevelBars level={l} />
                {label('level', l)}
              </Chip>
            ))}
            <span className="ms-auto text-sm text-muted-foreground">{t('exerciseLibrary.results', { count: total })}</span>
          </div>
        </div>

        {/* Grid */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {items.length === 0 && loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-[1.25rem] bg-muted/50" />
              ))}
            </div>
          ) : error && items.length === 0 ? (
            <div className="mx-auto mt-12 flex max-w-md items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {source === 'wger' ? t('banks.exercise.wgerError') : t('banks.exercise.error')}
            </div>
          ) : items.length === 0 ? (
            <p className="py-20 text-center text-muted-foreground">{t('exerciseLibrary.empty')}</p>
          ) : (
            <div className="ec-exlib-grid grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {items.map((x, i) => {
                const on = picked.has(x.id);
                return (
                  <article
                    key={x.id}
                    style={{ animationDelay: `${Math.min(i % PAGE, 12) * 35}ms` }}
                    className={cn('ec-excard group relative overflow-hidden rounded-[1.25rem] border bg-card transition-all duration-500', on ? 'border-primary ring-2 ring-primary/30' : 'border-border/60 hover:border-primary/40')}
                  >
                    <button type="button" className="block w-full text-start" onClick={() => setDetail(x)}>
                      <ExerciseDemo frames={x.frames} alt={x.name} className="aspect-[4/3] w-full" />
                      <div className="p-3.5">
                        <p className="line-clamp-2 min-h-[2.6em] text-sm font-bold leading-snug" dir="auto" style={{ textAlign: 'start' }}>{x.name}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="rounded-full bg-primary/12 px-2 py-0.5 font-semibold text-primary">{label('muscle', x.primaryMuscles[0] || 'other')}</span>
                          {x.equipment && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{label('equipment', x.equipment)}</span>}
                          {x.level ? (
                            <span className="ms-auto"><LevelBars level={x.level} /></span>
                          ) : (
                            x.source === 'wger' && <span className="ms-auto text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">wger</span>
                          )}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      disabled={x.imported}
                      onClick={() => toggle(x.id)}
                      aria-label={x.imported ? t('exerciseLibrary.inBank') : t('exerciseLibrary.select')}
                      className={cn(
                        'absolute end-2 top-2 grid h-11 w-11 place-items-center sm:end-2.5 sm:top-2.5 sm:h-9 sm:w-9 rounded-full border shadow-sm backdrop-blur transition-all duration-300',
                        x.imported ? 'border-success/40 bg-success text-white' : on ? 'scale-110 border-primary bg-primary text-primary-foreground' : 'border-black/10 bg-white/85 text-neutral-700 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100'
                      )}
                    >
                      {x.imported || on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </button>
                    {x.imported && <span className="absolute start-2.5 top-2.5 rounded-full bg-success/90 px-2 py-0.5 text-[10px] font-bold text-white">{t('exerciseLibrary.inBank')}</span>}
                  </article>
                );
              })}
            </div>
          )}
          {items.length < total && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" onClick={() => load(items.length)} disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                {t('exerciseLibrary.more', { count: total - items.length })}
              </Button>
            </div>
          )}
          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            {source === 'wger' ? (
              <a href="https://wger.de" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                {t('banks.exercise.wgerCredit')}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              t('exerciseLibrary.credit')
            )}
          </p>
        </div>

        {/* Selection bar */}
        <div className={cn('ec-exlib-bar flex items-center gap-3 border-t border-border/60 bg-card/95 px-5 py-3 backdrop-blur transition-all duration-500 sm:px-7', picked.size ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0')}>
          <span className="font-semibold">{t('exerciseLibrary.selected', { count: picked.size })}</span>
          <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
            <X />
            {t('exerciseLibrary.clear')}
          </Button>
          <Button className="ms-auto" onClick={() => doImport([...picked])} disabled={importing}>
            {importing ? <Loader2 className="animate-spin" /> : <Plus />}
            {t('exerciseLibrary.addToBank', { count: picked.size })}
          </Button>
        </div>

        {/* Detail */}
        {detail && (
          <div className="ec-exlib-detail absolute inset-0 z-20 flex items-stretch justify-end bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)}>
            <aside className="ec-exlib-sheet flex h-full w-full max-w-xl flex-col overflow-y-auto bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="relative">
                <ExerciseDemo frames={detail.frames} alt={detail.name} className="aspect-[4/3] w-full" playing />
                <button type="button" onClick={() => setDetail(null)} className="absolute end-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-neutral-800 shadow" aria-label={t('common.close', 'Close')}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-5 p-6">
                <div>
                  <h3 className="font-display text-4xl leading-none" dir="auto" style={{ textAlign: 'start' }}>{detail.name}</h3>
                  {detail.name_en && detail.name_en !== detail.name && (
                    <p className="mt-1 text-sm text-muted-foreground" dir="ltr" style={{ textAlign: 'start' }}>{detail.name_en}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    {detail.primaryMuscles.map((m) => <span key={m} className="rounded-full bg-primary px-2.5 py-1 font-semibold text-primary-foreground">{label('muscle', m)}</span>)}
                    {detail.secondaryMuscles.map((m) => <span key={m} className="rounded-full bg-primary/12 px-2.5 py-1 text-primary">{label('muscle', m)}</span>)}
                    {detail.equipment && <span className="rounded-full bg-muted px-2.5 py-1">{label('equipment', detail.equipment)}</span>}
                    {detail.level && <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"><LevelBars level={detail.level} />{label('level', detail.level)}</span>}
                  </div>
                </div>
                {detail.instructions.length === 0 && <p className="text-sm text-muted-foreground">{t('banks.exercise.noInstructions')}</p>}
                <ol className="space-y-3" dir="auto">
                  {detail.instructions.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed">
                      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-primary/12 font-num text-xs text-primary">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
                {detail.source === 'wger' && (
                  <p className="text-[11px] text-muted-foreground">
                    {t('banks.exercise.wgerCredit')}
                    {detail.license_author ? ` · ${detail.license_author}` : ''}
                    {detail.source_url && (
                      <a href={detail.source_url} target="_blank" rel="noopener noreferrer" className="ms-1 inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
                        {t('banks.exercise.viewOnWger')}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </p>
                )}
                <Button className="h-11 w-full" disabled={detail.imported || importing} onClick={async () => { await doImport([detail.id]); setDetail({ ...detail, imported: true }); }}>
                  {detail.imported ? <Check /> : <Plus />}
                  {detail.imported ? t('exerciseLibrary.inBank') : t('exerciseLibrary.addOne')}
                </Button>
              </div>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Chip({ active, onClick, children, count, small }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold transition-all duration-300',
        small ? 'h-11 px-3 text-xs sm:h-9' : 'min-h-11 px-3.5 py-1.5 text-sm sm:min-h-0',
        active ? 'border-transparent bg-foreground text-background' : 'border-border/70 bg-card/60 text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
      {count !== undefined && <span className={cn('rounded-full px-1.5 text-[10px]', active ? 'bg-background/20' : 'bg-muted')}>{count}</span>}
    </button>
  );
}

/** Three bars that fill with difficulty: an icon, not an emoji. */
export function LevelBars({ level }: { level: string }) {
  const n = level === 'expert' ? 3 : level === 'intermediate' ? 2 : 1;
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn('w-[3px] rounded-full', i <= n ? 'bg-primary' : 'bg-muted-foreground/30')} style={{ height: 4 + i * 3 }} />
      ))}
    </span>
  );
}

export default ExerciseLibrary;
