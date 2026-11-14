import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Award, Camera, Flag, ImageIcon, Lock, Plus, Ruler, Scale, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCheckInSummary, useDeleteProgress, useProgress, useSessions } from './hooks';
import type { ProgressEntry } from './types';
import { CountUp, EmptyState, ErrorState, Screen, ScreenHeader, SectionTitle, Sheet, Skel } from './ui';
import WeighInSheet, { MEASURES } from './WeighInSheet';
import { apiBlobUrl } from './api';
import { fmtDate, fmtNum, fmtSigned, parseDate } from './format';
import { ProgressNav } from './training/shared';

type Range = '1m' | '3m' | 'all';

const photoList = (e: ProgressEntry) => {
  if (e.photos?.length) return e.photos.map((p) => ({ key: `${p.id}`, path: p.photo_path, type: ['front', 'side', 'back'].includes((p.photo_type || '').toLowerCase()) ? p.photo_type.toLowerCase() : 'front' }));
  return e.photo_path ? [{ key: `l${e.id}`, path: e.photo_path, type: 'front' }] : [];
};

const blobCache = new Map<string, Promise<string>>();
const usePhoto = (path?: string) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    const file = path.split('/').pop()!;
    if (!blobCache.has(file)) blobCache.set(file, apiBlobUrl(`/files/media/progress_photos/${file}`));
    let alive = true;
    blobCache.get(file)!.then((u) => alive && setUrl(u)).catch(() => {
      blobCache.delete(file);
    });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
};

const Photo: React.FC<{ path: string; className?: string; alt: string }> = ({ path, className, alt }) => {
  const url = usePhoto(path);
  return url ? <img src={url} alt={alt} className={cn('h-full w-full object-cover', className)} loading="lazy" /> : <div className={cn('tp-skel h-full w-full rounded-none', className)} />;
};

const ProgressScreen: React.FC = () => {
  const { t } = useTranslation();
  const progress = useProgress();
  const sessions = useSessions();
  const summary = useCheckInSummary();
  const del = useDeleteProgress();
  const [range, setRange] = useState<Range>('3m');
  const [adding, setAdding] = useState(false);
  const [viewer, setViewer] = useState<ProgressEntry | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const entries = progress.data ?? [];
  const weighed = entries.filter((e) => typeof e.weight === 'number') as (ProgressEntry & { weight: number })[];
  const first = weighed[0];
  const last = weighed[weighed.length - 1];
  const change = first && last ? last.weight - first.weight : 0;

  const chart = useMemo(() => {
    const cutoff = range === 'all' ? 0 : Date.now() - (range === '1m' ? 31 : 92) * 86400000;
    return weighed
      .filter((e) => (parseDate(e.date)?.getTime() ?? 0) >= cutoff)
      .map((e) => ({ t: parseDate(e.date)?.getTime() ?? 0, w: e.weight }));
  }, [weighed, range]);

  const workoutsDone = (sessions.data ?? []).filter((s) => s.is_completed).length;
  const milestones = useMemo(() => {
    const lost = first && last ? first.weight - last.weight : 0;
    const items: { id: string; label: string; done: boolean }[] = [
      { id: 'first', label: t('trainee.progress.msFirst'), done: weighed.length > 0 },
      ...[1, 3, 5, 10].map((kg) => ({ id: `kg${kg}`, label: t('trainee.progress.msLost', { kg }), done: lost >= kg })),
      ...[1, 10, 25, 50].map((n) => ({ id: `w${n}`, label: t('trainee.progress.msWorkouts', { count: n }), done: workoutsDone >= n })),
      { id: 'streak7', label: t('trainee.progress.msStreak', { count: 7 }), done: (summary.data?.current_streak ?? 0) >= 7 },
    ];
    const done = items.filter((i) => i.done);
    const next = items.filter((i) => !i.done).slice(0, 2);
    return [...done, ...next];
  }, [first, last, weighed.length, workoutsDone, summary.data, t]);

  const measureCards = MEASURES.map((k) => {
    const rows = entries.filter((e) => typeof e[k] === 'number' && (e[k] as number) > 0);
    if (!rows.length) return null;
    const a = rows[0][k] as number;
    const b = rows[rows.length - 1][k] as number;
    return { k, value: b, delta: rows.length > 1 ? b - a : null };
  }).filter(Boolean) as { k: (typeof MEASURES)[number]; value: number; delta: number | null }[];

  const withPhotos = [...entries].reverse().filter((e) => photoList(e).length);

  if (progress.isLoading) {
    return (
      <Screen>
        <Skel className="mb-3 h-4 w-28" />
        <Skel className="mb-8 h-16 w-56" />
        <Skel className="h-72" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><Skel className="h-24" /><Skel className="h-24" /><Skel className="h-24" /></div>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow={t('trainee.progress.eyebrow')}
        title={t('trainee.progress.title')}
        actions={
          <button type="button" onClick={() => setAdding(true)} className="tp-btn tp-btn--primary tp-press">
            <Plus className="h-5 w-5" />
            {t('trainee.progress.add')}
          </button>
        }
        className="!mb-4 lg:!mb-5"
      />
      <ProgressNav className="tp-rise mb-6 max-w-md" />

      {progress.isError ? (
        <ErrorState onRetry={() => progress.refetch()} />
      ) : !weighed.length ? (
        <EmptyState
          icon={Scale}
          title={t('trainee.progress.emptyTitle')}
          body={t('trainee.progress.emptyBody')}
          action={<button type="button" onClick={() => setAdding(true)} className="tp-btn tp-btn--primary tp-press"><Plus className="h-5 w-5" />{t('trainee.progress.add')}</button>}
        />
      ) : (
        <>
          <section className="tp-card tp-card--hero tp-rise p-5 sm:p-7" style={{ ['--i' as string]: 2 }}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="tp-label">{t('trainee.progress.current')}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <CountUp value={last.weight} digits={1} className="tp-num text-6xl leading-none sm:text-7xl" />
                  <span className="text-muted-foreground">{t('trainee.common.kg')}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {weighed.length > 1 && (
                    <span className={cn('me-2 font-bold', change <= 0 ? 'text-[hsl(var(--tp-ok))]' : 'text-primary')}>
                      <bdi dir="ltr">{fmtSigned(change)}</bdi> {t('trainee.common.kg')}
                    </span>
                  )}
                  {t('trainee.progress.since', { date: fmtDate(first.date, { day: 'numeric', month: 'short', year: 'numeric' }) })}
                </p>
              </div>
              <div className="flex rounded-full bg-foreground/[.07] p-1" role="tablist" aria-label={t('trainee.progress.range')}>
                {(['1m', '3m', 'all'] as Range[]).map((r) => (
                  <button key={r} type="button" role="tab" aria-selected={range === r} onClick={() => setRange(r)} className={cn('tp-press min-h-[2.75rem] rounded-full px-4 text-sm font-semibold', range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                    {t(`trainee.progress.range_${r}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="-mx-2 mt-5 h-56 sm:h-64" dir="ltr">
              {chart.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="tpWeight" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="hsl(var(--foreground) / .07)" />
                    <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmtDate(new Date(v))} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
                    <YAxis domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={(v) => fmtNum(v)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip
                      cursor={{ stroke: 'hsl(var(--primary) / .4)' }}
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 14, color: 'hsl(var(--foreground))' }}
                      labelFormatter={(v) => fmtDate(new Date(Number(v)), { day: 'numeric', month: 'long', year: 'numeric' })}
                      formatter={(v) => [`${fmtNum(Number(v), 1)} ${t('trainee.common.kg')}`, t('trainee.progress.weight')]}
                    />
                    <Area type="monotone" dataKey="w" stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#tpWeight)" dot={false} activeDot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2 }} animationDuration={900} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">{t('trainee.progress.needMore')}</div>
              )}
            </div>
          </section>

          {measureCards.length > 0 && (
            <>
              <SectionTitle>{t('trainee.progress.measurements')}</SectionTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {measureCards.map((m, i) => (
                  <div key={m.k} className="tp-card tp-rise p-4" style={{ ['--i' as string]: i }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-muted-foreground">{t(`trainee.progress.m_${m.k}`)}</span>
                      <Ruler className="h-4 w-4 flex-none text-muted-foreground" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="tp-num text-3xl">{fmtNum(m.value, 1)}</span>
                      <span className="text-xs text-muted-foreground">{t('trainee.common.cm')}</span>
                    </div>
                    {m.delta !== null && <span className={cn('tp-chip mt-2', m.delta <= 0 ? 'tp-chip--ok' : '')}><bdi dir="ltr">{fmtSigned(m.delta)}</bdi> {t('trainee.common.cm')}</span>}
                  </div>
                ))}
              </div>
            </>
          )}

          <SectionTitle>{t('trainee.progress.milestones')}</SectionTitle>
          <div className="tp-scroll-x -mx-4 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {milestones.map((m) => (
              <div key={m.id} className={cn('tp-card flex w-40 flex-col gap-3 p-4 sm:w-44', !m.done && 'opacity-60')}>
                <span className={cn('grid h-11 w-11 place-items-center rounded-2xl', m.done ? 'bg-primary text-primary-foreground' : 'bg-foreground/[.07] text-muted-foreground')}>
                  {m.done ? <Award className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                </span>
                <span className="text-sm font-semibold leading-snug">{m.label}</span>
                <span className="mt-auto text-[11px] text-muted-foreground">{m.done ? t('trainee.progress.achieved') : t('trainee.progress.nextGoal')}</span>
              </div>
            ))}
          </div>

          <SectionTitle>{t('trainee.progress.photos')}</SectionTitle>
          {withPhotos.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {withPhotos.map((e) => {
                const p = photoList(e)[0];
                return (
                  <button key={e.id} type="button" onClick={() => setViewer(e)} className="tp-press relative aspect-[3/4] overflow-hidden rounded-2xl bg-foreground/[.05]">
                    <Photo path={p.path} alt={fmtDate(e.date)} />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 text-start text-xs font-semibold text-white">{fmtDate(e.date)}</span>
                    {photoList(e).length > 1 && <span className="absolute end-1.5 top-1.5 rounded-full bg-black/60 px-1.5 text-[10px] font-bold text-white">{photoList(e).length}</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="tp-card tp-press flex w-full items-center gap-4 p-4 text-start">
              <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-foreground/[.07]"><Camera className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block font-semibold">{t('trainee.progress.noPhotosTitle')}</span>
                <span className="block text-sm text-muted-foreground">{t('trainee.progress.noPhotosBody')}</span>
              </span>
            </button>
          )}

          <SectionTitle>{t('trainee.progress.history')}</SectionTitle>
          <ul className="tp-card divide-y divide-border/50">
            {[...weighed].reverse().map((e, i, arr) => {
              const prev = arr[i + 1];
              const d = prev ? e.weight - prev.weight : null;
              const nMeasures = MEASURES.filter((k) => typeof e[k] === 'number').length;
              const pending = e.id < 0;
              return (
                <li key={e.id} className={cn('flex items-center gap-3 px-4 py-3', pending && 'opacity-60')}>
                  <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-foreground/[.06] text-center leading-none">
                    <span>
                      <span className="tp-num block text-lg">{parseDate(e.date)?.getDate()}</span>
                      <span className="block text-[10px] text-muted-foreground">{fmtDate(e.date, { month: 'short' })}</span>
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2">
                      <span className="tp-num text-xl">{fmtNum(e.weight, 1)}</span>
                      <span className="text-xs text-muted-foreground">{t('trainee.common.kg')}</span>
                      {d !== null && d !== 0 && <span className={cn('text-xs font-semibold', d < 0 ? 'text-[hsl(var(--tp-ok))]' : 'text-primary')} dir="ltr"><bdi dir="ltr">{fmtSigned(d)}</bdi></span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" dir="auto">
                      {[nMeasures ? t('trainee.progress.nMeasures', { count: nMeasures }) : null, photoList(e).length ? t('trainee.progress.nPhotos', { count: photoList(e).length }) : null, e.notes].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {photoList(e).length > 0 && (
                    <button type="button" onClick={() => setViewer(e)} className="tp-icon-btn tp-press bg-transparent" aria-label={t('trainee.progress.viewPhotos')}>
                      <ImageIcon className="h-5 w-5" />
                    </button>
                  )}
                  {!pending &&
                    (confirmId === e.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmId(null);
                          del.mutate(e.id, { onError: () => toast.error(t('trainee.progress.deleteError')) });
                        }}
                        className="tp-btn tp-btn--sm tp-press bg-destructive text-destructive-foreground"
                      >
                        {t('trainee.progress.confirmDelete')}
                      </button>
                    ) : (
                      <button type="button" onClick={() => setConfirmId(e.id)} className="tp-icon-btn tp-press bg-transparent text-muted-foreground" aria-label={t('trainee.common.delete')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ))}
                </li>
              );
            })}
          </ul>
          {first && (
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Flag className="h-3.5 w-3.5" />
              {t('trainee.progress.startedAt', { weight: fmtNum(first.weight, 1), date: fmtDate(first.date, { day: 'numeric', month: 'long', year: 'numeric' }) })}
            </p>
          )}
        </>
      )}

      <WeighInSheet open={adding} onOpenChange={setAdding} lastWeight={last?.weight} />
      <Sheet open={!!viewer} onOpenChange={(o) => !o && setViewer(null)} title={viewer ? fmtDate(viewer.date, { day: 'numeric', month: 'long', year: 'numeric' }) : ''} description={viewer?.weight ? `${fmtNum(viewer.weight, 1)} ${t('trainee.common.kg')}` : undefined}>
        {viewer && (
          <div className="grid grid-cols-1 gap-3 pb-2 min-[480px]:grid-cols-2">
            {photoList(viewer).map((p) => (
              <figure key={p.key} className="overflow-hidden rounded-2xl bg-foreground/[.05]">
                <div className="aspect-[3/4]"><Photo path={p.path} alt={t(`trainee.progress.photo_${p.type}`)} /></div>
                <figcaption className="px-3 py-2 text-xs font-semibold text-muted-foreground">{t(`trainee.progress.photo_${p.type}`)}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </Sheet>
    </Screen>
  );
};

export default ProgressScreen;
