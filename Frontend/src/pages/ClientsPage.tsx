import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownAZ, Dumbbell, LayoutGrid, List, MessageCircle, MoreHorizontal, Pencil, Search, TrendingUp, UserPlus, Users, UtensilsCrossed,
} from 'lucide-react';
import '@/i18n/ticketsStudio';
import '@/i18n/ticketsQa3';
import Layout from '../components/Layout';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PortalSelect } from '@/components/ui/portal-select';
import { cn } from '@/lib/utils';
import { fmtRelative } from '@/features/trainee/format';
import { Avatar, EmptyState, ErrorState, PageTitle, Seg, Skel } from '@/features/trainer/ui';
import { tk, useCockpit, type ClientPulse, type TrainerClient } from '@/features/trainer/hooks';
import { AddClientSheet, ClientCard, ProgressDialogBody } from './TrainerDashboard';

type Filter = 'all' | 'attention' | 'checked' | 'inactive';
type Sort = 'activity' | 'name' | 'newest' | 'consistency';
type View = 'cards' | 'list';

const VIEW_KEY = 'ec-clients-view';
const readView = (): View => {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards'; } catch { return 'cards'; }
};

/**
 * QA #73: a full section for managing trainees (the dashboard keeps its short list). Search, status filters, sorting,
 * cards or a compact list, and every action on a client one tap away; works from phones to wide screens.
 */
const ClientsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cockpit = useCockpit();
  const { pulses } = cockpit;
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('activity');
  const [search, setSearch] = useState('');
  const [view, setViewState] = useState<View>(readView);
  const [addOpen, setAddOpen] = useState(false);
  const [progressClient, setProgressClient] = useState<TrainerClient | null>(null);
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  };

  const counts = useMemo(() => ({
    all: pulses.length,
    attention: pulses.filter((p) => p.client.is_active && !p.checkedInToday).length,
    checked: pulses.filter((p) => p.checkedInToday).length,
    inactive: pulses.filter((p) => !p.client.is_active).length,
  }), [pulses]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = pulses.filter((p) => {
      if (filter === 'attention' && !(p.client.is_active && !p.checkedInToday)) return false;
      if (filter === 'checked' && !p.checkedInToday) return false;
      if (filter === 'inactive' && p.client.is_active) return false;
      if (!q) return true;
      const c = p.client;
      return c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.username.toLowerCase().includes(q)
        || (c.profile?.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000');
    });
    const by: Record<Sort, (a: ClientPulse, b: ClientPulse) => number> = {
      activity: (a, b) => Number(b.trainingNow) - Number(a.trainingNow) || b.lastActive - a.lastActive,
      name: (a, b) => a.client.full_name.localeCompare(b.client.full_name),
      newest: (a, b) => +new Date(b.client.created_at) - +new Date(a.client.created_at),
      consistency: (a, b) => b.checkInDays7 - a.checkInDays7 || b.workoutsWeek - a.workoutsWeek,
    };
    return [...list].sort(by[sort]);
  }, [pulses, filter, search, sort]);

  return (
    <Layout currentPage="clients">
      <div className="tr-page">
        <PageTitle
          eyebrow={t('qa3.clients.eyebrow', { count: pulses.length })}
          title={t('qa3.clients.title')}
          actions={
            <button type="button" onClick={() => setAddOpen(true)} className="tp-btn tp-btn--primary tp-press max-sm:!min-h-11 max-sm:flex-1">
              <UserPlus className="h-4 w-4" />
              {t('client.addClient')}
            </button>
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="tr-search min-w-0 flex-1 basis-60 sm:max-w-sm">
            <Search />
            <input type="search" className="tp-input" placeholder={t('qa3.clients.search')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('qa3.clients.search')} />
          </div>
          <PortalSelect
            icon={ArrowDownAZ}
            label={t('qa3.clients.sortLabel')}
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            options={(['activity', 'name', 'newest', 'consistency'] as Sort[]).map((s) => ({ value: s, label: t(`qa3.clients.sort.${s}`) }))}
          />
          <div className="ms-auto flex rounded-full bg-foreground/[.05] p-1" role="group" aria-label={t('qa3.clients.viewLabel')}>
            {([['cards', LayoutGrid], ['list', List]] as const).map(([v, Icon]) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} title={t(`qa3.clients.view.${v}`)} aria-label={t(`qa3.clients.view.${v}`)}
                className={cn('grid h-9 w-9 place-items-center rounded-full transition-colors', view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        <Seg<Filter>
          className="mb-5"
          label={t('trainer.dash.filterLabel')}
          value={filter}
          onChange={setFilter}
          memoryKey="clients-filter"
          items={[
            { id: 'all', label: t('trainer.dash.filter.all'), count: counts.all },
            { id: 'attention', label: t('trainer.dash.filter.attention'), count: counts.attention },
            { id: 'checked', label: t('trainer.dash.filter.checked'), count: counts.checked },
            { id: 'inactive', label: t('trainer.dash.filter.inactive'), count: counts.inactive },
          ]}
        />

        {cockpit.error ? (
          <ErrorState onRetry={cockpit.refetch} />
        ) : cockpit.loading ? (
          <div className="tr-clients">{Array.from({ length: 6 }, (_, i) => <Skel key={i} className="h-[13.5rem] rounded-[1.5rem]" />)}</div>
        ) : pulses.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('trainer.dash.emptyTitle')}
            body={t('trainer.dash.emptyBody')}
            action={<button type="button" onClick={() => setAddOpen(true)} className="tp-btn tp-btn--primary tp-press"><UserPlus className="h-4 w-4" />{t('client.addClient')}</button>}
          />
        ) : visible.length === 0 ? (
          <EmptyState icon={Search} title={t('trainerDashboard.noClientsFound')} body={t('trainer.dash.noMatchBody')} />
        ) : view === 'cards' ? (
          <div className="tr-clients">
            {visible.map((p, i) => <ClientCard key={p.client.id} pulse={p} index={i} loadingActivity={cockpit.activityLoading} onProgress={() => setProgressClient(p.client)} />)}
          </div>
        ) : (
          <ClientList pulses={visible} onProgress={setProgressClient} navigate={navigate} />
        )}
      </div>

      <Dialog open={!!progressClient} onOpenChange={(o) => !o && setProgressClient(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('client.viewProgress')}</DialogTitle>
            <DialogDescription>{progressClient?.full_name}</DialogDescription>
          </DialogHeader>
          {progressClient && <ProgressDialogBody client={progressClient} />}
        </DialogContent>
      </Dialog>
      <AddClientSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onDone={() => {
          qc.invalidateQueries({ queryKey: tk.clients });
          qc.invalidateQueries({ queryKey: ['trainer', 'overview'] });
        }}
      />
    </Layout>
  );
};

/** Compact list: one row per trainee (a table on wide screens, stacked rows on phones). */
const ClientList: React.FC<{ pulses: ClientPulse[]; onProgress: (c: TrainerClient) => void; navigate: ReturnType<typeof useNavigate> }> = ({ pulses, onProgress, navigate }) => {
  const { t } = useTranslation();
  const open = (c: TrainerClient, tab?: string) => navigate(`/client/${c.id}${tab ? `?tab=${tab}` : ''}`, { state: { client: c } });
  return (
    <div className="tp-card overflow-hidden p-0">
      <div className="hidden grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)_auto] gap-3 border-b border-border/50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:grid">
        <span>{t('qa3.clients.col.client')}</span>
        <span>{t('qa3.clients.col.checkins')}</span>
        <span>{t('qa3.clients.col.workouts')}</span>
        <span>{t('qa3.clients.col.meals')}</span>
        <span>{t('qa3.clients.col.lastActive')}</span>
        <span className="sr-only">{t('qa3.clients.col.actions')}</span>
      </div>
      <ul className="divide-y divide-border/50">
        {pulses.map((p) => {
          const c = p.client;
          return (
            <li key={c.id} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[.03] md:grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)_auto]', !c.is_active && 'opacity-60')}>
              <button type="button" onClick={() => open(c)} className="flex min-w-0 items-center gap-3 rounded-xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar name={c.full_name} seed={c.id} size={42} live={p.trainingNow} src={(c as { avatar_url?: string | null }).avatar_url} />
                <span className="min-w-0">
                  <span className="block truncate font-bold" dir="auto">{c.full_name}</span>
                  <span className="block truncate text-xs text-muted-foreground" dir="ltr">{c.email}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground md:hidden">
                    {t('qa3.clients.mobileLine', { checkins: p.checkInDays7, workouts: p.workoutsWeek })} · {p.lastActive ? fmtRelative(new Date(p.lastActive)) : '—'}
                  </span>
                </span>
              </button>
              <span className="hidden md:block">
                <span className="flex gap-1" aria-label={t('qa3.clients.checkinsAria', { count: p.checkInDays7 })}>
                  {Array.from({ length: 7 }, (_, i) => <i key={i} className={cn('h-2 w-2 rounded-full', i < p.checkInDays7 ? 'bg-primary' : 'bg-foreground/10')} />)}
                </span>
              </span>
              <span className="hidden font-num text-lg md:block">{p.workoutsWeek}</span>
              <span className="hidden font-num text-lg md:block">{p.mealsToday}</span>
              <span className="hidden truncate text-sm text-muted-foreground md:block">{p.trainingNow ? t('qa3.clients.trainingNow') : p.lastActive ? fmtRelative(new Date(p.lastActive)) : '—'}</span>
              <span className="flex items-center gap-1">
                <button type="button" className="tp-icon-btn tp-press" onClick={() => navigate(`/chat?clientId=${c.id}`)} aria-label={t('trainer.dash.message')} title={t('trainer.dash.message')}><MessageCircle className="h-4 w-4" /></button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="tp-icon-btn tp-press" aria-label={t('qa3.clients.more')} title={t('qa3.clients.more')}><MoreHorizontal className="h-4 w-4" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[13rem]">
                    <DropdownMenuItem onSelect={() => open(c, 'workouts')}><Dumbbell className="me-2 h-4 w-4" />{t('trainer.dash.openPlan')}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => open(c, 'meals')}><UtensilsCrossed className="me-2 h-4 w-4" />{t('qa3.clients.menu')}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onProgress(c)}><TrendingUp className="me-2 h-4 w-4" />{t('client.viewProgress')}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => navigate(`/client/${c.id}/edit`, { state: { client: c } })}><Pencil className="me-2 h-4 w-4" />{t('trainer.dash.edit')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ClientsPage;
