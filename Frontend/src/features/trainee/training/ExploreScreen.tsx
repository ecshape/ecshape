import React, { useEffect, useMemo, useState } from 'react';
import { EcSpinner } from '@/components/brand/EcLoader';
import { Compass, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { ExerciseDemo } from '@/components/exercises/ExerciseDemo';
import { libraryFrames, type LibraryExercise } from '@/lib/exerciseLibrary';
import '@/styles/exercises.css';
import { EmptyState, ErrorState, Screen, Sheet, Skel } from '../ui';
import BodyMap from '../BodyMap';
import { MUSCLES, REGION_MUSCLE, regionsOf, type Load, type Region } from './muscles';
import { InstructionSteps } from './SessionPlayer';
import { muscleLabel, regionLabel, TrainingNav, useLibraryBrowse, useTT } from './shared';

const libLoad = (e: Pick<LibraryExercise, 'primaryMuscles' | 'secondaryMuscles'>): Load => {
  const out: Load = {};
  for (const m of e.secondaryMuscles ?? []) for (const r of regionsOf(m)) out[r] = Math.max(out[r] ?? 0, 0.45);
  for (const m of e.primaryMuscles ?? []) for (const r of regionsOf(m)) out[r] = 1;
  return out;
};

const useDebounced = (v: string, ms = 300) => {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = window.setTimeout(() => setD(v), ms);
    return () => window.clearTimeout(id);
  }, [v, ms]);
  return d;
};

/** Explore: read-only browse of the exercise library, filtered by tapping a muscle on the body map. */
const ExploreScreen: React.FC = () => {
  const { t, tt } = useTT();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [open, setOpen] = useState<LibraryExercise | null>(null);
  const dq = useDebounced(q);
  const lib = useLibraryBrowse(dq, muscle);
  const items = useMemo(() => lib.data?.pages.flatMap((p) => p.items) ?? [], [lib.data]);
  const total = lib.data?.pages[0]?.total ?? 0;
  const selected = useMemo(() => (muscle ? (Object.keys(REGION_MUSCLE) as Region[]).filter((r) => REGION_MUSCLE[r] === muscle) : []), [muscle]);

  const pick = (m: string) => setMuscle((cur) => (cur === m ? '' : m));

  return (
    <Screen>
      <header className="mb-5">
        <p className="tp-label tp-rise">{t('trainee.training.eyebrow')}</p>
        <h1 className="tp-title tp-rise mt-2 text-[2.9rem] sm:text-6xl" style={{ ['--i' as string]: 1 }}>{tt('explore.title')}</h1>
        <TrainingNav className="tp-rise mt-4 max-w-md" />
      </header>

      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <aside className="tp-card tp-rise min-w-0 p-4 lg:sticky lg:top-20" style={{ ['--i' as string]: 2 }}>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            {tt('explore.byMuscle')}
            <InfoTip label={tt('explore.byMuscle')}>{tt('explore.byMuscleHelp')}</InfoTip>
          </p>
          <BodyMap
            load={{}}
            size="md"
            className="mx-auto !w-full max-w-[13rem] lg:max-w-[16rem]"
            selected={selected}
            onPick={(r) => pick(REGION_MUSCLE[r])}
            labelFor={(r) => regionLabel(tt, r)}
            title={tt('explore.byMuscle')}
            animate={false}
          />
          <div className="tp-scroll-x -mx-4 mt-3 px-4 lg:mx-0 lg:flex-wrap lg:gap-1.5 lg:px-0">
            {MUSCLES.map((m) => (
              <button key={m} type="button" onClick={() => pick(m)} aria-pressed={muscle === m} className={cn('tp-chip tp-press !min-h-[2.25rem] !px-3', muscle === m && 'tp-chip--primary ring-1 ring-primary')}>
                {muscleLabel(tt, m)}
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          <label className="relative block">
            <span className="sr-only">{tt('explore.search')}</span>
            <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tt('explore.search')}
              className="h-12 w-full rounded-full border border-border/60 bg-card pe-11 ps-12 text-base outline-none focus:border-primary"
              dir="auto"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} className="absolute end-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5" aria-label={tt('explore.clear')}>
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          <div className="mb-3 mt-4 flex min-h-[2rem] flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {!lib.isLoading && <span>{tt('explore.count', { count: total })}</span>}
            {muscle && (
              <button type="button" onClick={() => setMuscle('')} className="tp-chip tp-chip--primary tp-press">
                {muscleLabel(tt, muscle)}<X className="h-3 w-3" /><span className="sr-only">{tt('explore.clear')}</span>
              </button>
            )}
          </div>

          {lib.isLoading ? (
            <div className="tr-ex-grid">{Array.from({ length: 8 }, (_, i) => <Skel key={i} className="aspect-[4/5]" />)}</div>
          ) : lib.isError ? (
            <ErrorState onRetry={() => lib.refetch()} />
          ) : !items.length ? (
            <EmptyState icon={Compass} title={tt('explore.emptyTitle')} body={tt('explore.emptyBody')} />
          ) : (
            <>
              <div className="tr-ex-grid">
                {items.map((e) => (
                  <button key={e.id} type="button" onClick={() => setOpen(e)} className="tp-card tp-press flex flex-col overflow-hidden text-start">
                    <span className="block aspect-[4/3] w-full bg-white">
                      <ExerciseDemo frames={e.frames?.length ? e.frames : libraryFrames(e.id)} alt={e.name} className="h-full w-full" />
                    </span>
                    <span className="flex flex-1 flex-col p-2.5">
                      <span className="line-clamp-2 text-sm font-bold leading-snug" lang="en" dir="ltr">{e.name}</span>
                      <span className="mt-auto truncate pt-1 text-[11px] text-primary">{(e.primaryMuscles ?? []).map((m) => muscleLabel(tt, m)).join(', ')}</span>
                    </span>
                  </button>
                ))}
              </div>
              {lib.hasNextPage && (
                <div className="mt-5 flex justify-center">
                  <button type="button" onClick={() => lib.fetchNextPage()} disabled={lib.isFetchingNextPage} className="tp-btn tp-btn--ghost tp-press">
                    {lib.isFetchingNextPage && <EcSpinner className="h-4 w-4" mono />}{tt('explore.more')}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={<span lang="en" dir="ltr">{open?.name}</span>} description={open ? [open.equipment && tt(`equipment.${open.equipment.replace(/\s+/g, '_')}`, { defaultValue: open.equipment }), open.level && tt(`level.${open.level}`, { defaultValue: open.level })].filter(Boolean).join(' · ') : undefined}>
        {open && <LibraryDetail e={open} />}
      </Sheet>
    </Screen>
  );
};

const LibraryDetail: React.FC<{ e: LibraryExercise }> = ({ e }) => {
  const { tt } = useTT();
  return (
    <div className="space-y-4 pb-2">
      <ExerciseDemo frames={e.frames?.length ? e.frames : libraryFrames(e.id)} alt={e.name} className="aspect-[4/3] w-full rounded-2xl bg-white" playing />
      <div className="flex items-center gap-4 rounded-2xl bg-foreground/[.04] p-3">
        <BodyMap load={libLoad(e)} size="md" className="!w-28 flex-none" />
        <div className="min-w-0 space-y-2 text-sm">
          {e.primaryMuscles?.length > 0 && <div><p className="tp-label">{tt('routine.primary')}</p><p className="mt-0.5 font-semibold">{e.primaryMuscles.map((m) => muscleLabel(tt, m)).join(', ')}</p></div>}
          {e.secondaryMuscles?.length > 0 && <div><p className="tp-label">{tt('routine.secondary')}</p><p className="mt-0.5 text-muted-foreground">{e.secondaryMuscles.map((m) => muscleLabel(tt, m)).join(', ')}</p></div>}
        </div>
      </div>
      {e.instructions?.length > 0 && <InstructionSteps steps={e.instructions} />}
      <p className="text-xs text-muted-foreground">{tt('explore.askCoach')}</p>
    </div>
  );
};

export default ExploreScreen;
