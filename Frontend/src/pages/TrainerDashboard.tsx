import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowUpRight, BookOpen, ClipboardCheck, Dumbbell, Eye, EyeOff, MessageCircle, Pencil, Plus,
  Search, Sparkles, TrendingUp, UserPlus, Users, UtensilsCrossed, Zap,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { API_BASE_URL } from '../config/api';
import ClientWeightProgress from '../components/ClientWeightProgress';
import UnmatchedQuestionnaires from '../components/meals/UnmatchedQuestionnaires';
import { cn } from '@/lib/utils';
import { studioApi } from '@/lib/studioApi';
import { fmtDate, fmtNum, fmtRelative } from '@/features/trainee/format';
import { InfoTip } from '@/components/ui/info-tip';
import {
  ActionBtn, Avatar, CountUp, EmptyState, ErrorState, Field, PageTitle, Ring, SectionCard, Seg, Sheet, Skel, spotlight,
} from '@/features/trainer/ui';
import { tk, useCockpit, useLibraryStats, type ClientPulse, type FeedItem, type TrainerClient } from '@/features/trainer/hooks';

type Filter = 'all' | 'attention' | 'checked' | 'inactive';

const emptyForm = { username: '', email: '', full_name: '', password: '', confirmPassword: '' };

/** Turns a FastAPI error body into one readable line. */
const readError = async (res: Response, fallback: string) => {
  try {
    const err = await res.clone().json();
    if (err.detail) {
      if (Array.isArray(err.detail)) {
        return err.detail.map((e: { loc?: unknown[]; msg?: string }) => `${Array.isArray(e.loc) ? e.loc.slice(1).join('.') : 'field'}: ${e.msg}`).join('; ');
      }
      return String(err.detail);
    }
    return JSON.stringify(err);
  } catch {
    const text = await res.text().catch(() => '');
    return text || fallback;
  }
};

const greetingKey = () => {
  const h = new Date().getHours();
  return h < 5 ? 'evening' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
};

const TrainerDashboard = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { user } = useAuth();
  const cockpit = useCockpit();
  const lib = useLibraryStats();
  const { data: overview } = useQuery({ queryKey: ['trainer', 'overview'], queryFn: () => studioApi.overview(), staleTime: 30_000 });

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [progressClient, setProgressClient] = useState<TrainerClient | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { clients, pulses, feed, checkedIn, active, workoutsWeek, workoutsPerDay, leads } = cockpit;
  const total = clients.length;

  const counts = useMemo(
    () => ({
      all: pulses.length,
      attention: pulses.filter((p) => p.client.is_active && !p.checkedInToday).length,
      checked: pulses.filter((p) => p.checkedInToday).length,
      inactive: pulses.filter((p) => !p.client.is_active).length,
    }),
    [pulses],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pulses
      .filter((p) => {
        if (filter === 'attention' && !(p.client.is_active && !p.checkedInToday)) return false;
        if (filter === 'checked' && !p.checkedInToday) return false;
        if (filter === 'inactive' && p.client.is_active) return false;
        if (!q) return true;
        const c = p.client;
        return c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.username.toLowerCase().includes(q);
      })
      .sort((a, b) => Number(b.trainingNow) - Number(a.trainingNow) || b.lastActive - a.lastActive);
  }, [pulses, filter, search]);

  const firstName = (user?.full_name || '').split(' ')[0];

  return (
    <Layout currentPage="dashboard">
      <div className="tr-page">
        <PageTitle
          eyebrow={
            <span className="inline-flex items-center gap-2">
              <span className="tr-live" aria-hidden />
              {fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          }
          title={t(`trainer.dash.greeting.${greetingKey()}`)}
          accent={firstName || t('trainer.dash.headline')}
          actions={
            <>
              <ActionBtn icon={Dumbbell} label={t('trainer.dash.newPlan')} onClick={() => navigate('/create-workout-plan-v2')} className="sm:!min-h-12 sm:!px-5 sm:!text-[.95rem]" />
              <button type="button" onClick={() => setAddOpen(true)} className="tp-btn tp-btn--primary tp-press max-sm:!min-h-11 max-sm:min-w-0 max-sm:flex-1">
                <UserPlus className="h-4 w-4" />
                {t('client.addClient')}
              </button>
            </>
          }
        />

        <UnmatchedQuestionnaires clients={clients as never} />

        {/* KPIs */}
        <section className="tr-kpis mb-6 lg:mb-8" aria-label={t('trainer.dash.kpis')}>
          <div className="tp-card tp-card--accent tr-kpi tp-rise" style={{ ['--i' as string]: 0 }}>
            <div className="flex items-start justify-between gap-2">
              <span className="tr-kpi-ico"><Users className="h-5 w-5" /></span>
              <span className="tp-chip tp-chip--onaccent">{t('trainer.dash.activeOf', { active, total })}</span>
            </div>
            <div>
              <div className="tr-kpi-value">{cockpit.loading ? '–' : <CountUp value={total} />}</div>
              <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-white/85">{t('trainerDashboard.totalClients')}<InfoTip>{t('tt.info.kpiClients')}</InfoTip></p>
            </div>
          </div>

          <div className="tp-card tr-kpi tp-rise" style={{ ['--i' as string]: 1 }}>
            <div className="flex items-start justify-between gap-2">
              <span className="tr-kpi-ico"><ClipboardCheck className="h-5 w-5" /></span>
              <Ring value={total ? checkedIn / total : 0} size={58} stroke={7} color="hsl(var(--tr-ok))">
                <span className="text-[11px] font-bold tabular-nums">{total ? Math.round((checkedIn / total) * 100) : 0}%</span>
              </Ring>
            </div>
            <div>
              <div className="tr-kpi-value">
                {cockpit.loading ? '–' : <CountUp value={checkedIn} />}
                <span className="text-xl text-muted-foreground">/{fmtNum(total)}</span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">{t('trainer.dash.checkInsToday')}<InfoTip>{t('tt.info.kpiCheckins')}</InfoTip></p>
            </div>
          </div>

          <div className="tp-card tr-kpi tp-rise" style={{ ['--i' as string]: 2 }}>
            <div className="flex items-start justify-between gap-3">
              <span className="tr-kpi-ico"><Zap className="h-5 w-5" /></span>
              <div className="tr-bars w-24" dir="ltr" role="img" aria-label={t('trainer.dash.workoutsChart')}>
                {workoutsPerDay.map((d, i) => {
                  const max = Math.max(1, ...workoutsPerDay.map((x) => x.count));
                  return (
                    <span
                      key={d.day}
                      data-today={d.today || undefined}
                      data-on={d.count > 0 || undefined}
                      style={{ height: `${Math.max(8, (d.count / max) * 100)}%`, ['--i' as string]: i }}
                      title={`${fmtDate(d.day, { weekday: 'short' })}: ${d.count}`}
                    />
                  );
                })}
              </div>
            </div>
            <div>
              <div className="tr-kpi-value">{cockpit.activityLoading && !workoutsWeek ? '–' : <CountUp value={workoutsWeek} />}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">{t('trainer.dash.workoutsWeek')}<InfoTip>{t('tt.info.kpiWorkouts')}</InfoTip></span>
                {lib.data && lib.data.planCompletion > 0 && (
                  <span className="block text-xs">{t('trainerDashboard.workoutCompletion')} {fmtNum(lib.data.planCompletion, 1)}%</span>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/studio/prospects')}
            className="tp-card tr-kpi tr-lift tp-rise text-start"
            style={{ ['--i' as string]: 3 }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="tr-kpi-ico"><Sparkles className="h-5 w-5" /></span>
              <ArrowUpRight className="h-5 w-5 text-muted-foreground rtl:-scale-x-100" />
            </div>
            <div>
              <div className="tr-kpi-value"><CountUp value={overview?.leads_new ?? leads.length} /></div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('trainer.dash.newProspects')}
                {overview && <span className="block text-xs">{t('trainer.dash.openProspects', { count: overview.leads_open })}</span>}
              </p>
            </div>
          </button>
        </section>

        <div className="tr-cockpit">
          {/* Clients */}
          <section aria-labelledby="tr-clients-title" className="min-w-0">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h2 id="tr-clients-title" className="tp-title flex items-center gap-2 text-[2.6rem] sm:text-5xl">{t('client.yourClients')}<InfoTip>{t('tt.info.clients')}</InfoTip></h2>
              <div className="tr-search w-full sm:w-72">
                <Search />
                <input
                  type="search"
                  className="tp-input"
                  placeholder={t('client.searchClients')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label={t('client.searchClients')}
                />
              </div>
            </div>
            <Seg<Filter>
              className="mb-4"
              label={t('trainer.dash.filterLabel')}
              value={filter}
              onChange={setFilter}
              memoryKey="dash-filter"
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
              <div className="tr-clients">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skel key={i} className="h-[13.5rem] rounded-[1.5rem]" />
                ))}
              </div>
            ) : total === 0 ? (
              <EmptyState
                icon={Users}
                title={t('trainer.dash.emptyTitle')}
                body={t('trainer.dash.emptyBody')}
                action={
                  <button type="button" onClick={() => setAddOpen(true)} className="tp-btn tp-btn--primary tp-press">
                    <UserPlus className="h-4 w-4" />
                    {t('client.addClient')}
                  </button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState icon={Search} title={t('trainerDashboard.noClientsFound')} body={t('trainer.dash.noMatchBody')} />
            ) : (
              <div className="tr-clients">
                {visible.map((p, i) => (
                  <ClientCard
                    key={p.client.id}
                    pulse={p}
                    index={i}
                    loadingActivity={cockpit.activityLoading}
                    onProgress={() => setProgressClient(p.client)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Today + quick actions */}
          <aside className="tr-aside" aria-label={t('trainer.dash.sideLabel')}>
            <SectionCard
              icon={Activity}
              title={t('trainer.dash.today')}
              info={t('tt.info.today')}
              className="tp-rise"
              style={{ ['--i' as string]: 2 }}
              action={<span className="tp-chip tp-chip--ok"><span className="tr-live" aria-hidden />{t('trainer.dash.live')}</span>}
            >
              <TodayFeed items={feed} loading={cockpit.loading || cockpit.activityLoading} />
            </SectionCard>

            <SectionCard icon={Zap} title={t('trainer.dash.quick')} info={t('tt.info.quick')} className="tp-rise" style={{ ['--i' as string]: 3 }}>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: Dumbbell, label: t('trainer.dash.newPlan'), to: '/create-workout-plan-v2' },
                  { icon: BookOpen, label: t('navigation.exercises'), to: '/exercises', meta: lib.data ? fmtNum(lib.data.exercises) : undefined },
                  { icon: UtensilsCrossed, label: t('foodBank.title'), to: '/meal-bank' },
                  { icon: MessageCircle, label: t('navigation.chat'), to: '/chat' },
                ].map((a) => (
                  <button
                    key={a.to}
                    type="button"
                    onClick={() => navigate(a.to)}
                    onPointerMove={spotlight}
                    className="tr-spot tp-press flex min-h-[5.5rem] flex-col justify-between gap-2 rounded-[1.1rem] bg-foreground/[.04] p-3 text-start shadow-[inset_0_0_0_1px_hsl(var(--foreground)/.06)] hover:bg-foreground/[.07]"
                  >
                    <span className="flex items-center justify-between">
                      <a.icon className="h-5 w-5 text-primary" />
                      {a.meta && <span className="text-xs font-bold tabular-nums text-muted-foreground">{a.meta}</span>}
                    </span>
                    <span className="text-sm font-bold leading-tight">{a.label}</span>
                  </button>
                ))}
              </div>
            </SectionCard>
          </aside>
        </div>
      </div>

      <Dialog open={!!progressClient} onOpenChange={(o) => !o && setProgressClient(null)}>
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto rounded-[1.75rem]">
          <DialogHeader>
            <DialogTitle className="tp-title text-4xl">{t('trainerDashboard.weightProgress')}</DialogTitle>
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

/* ------------------------------------------------------------------ client card */

const ClientCard: React.FC<{ pulse: ClientPulse; index: number; loadingActivity: boolean; onProgress: () => void }> = ({ pulse, index, loadingActivity, onProgress }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const c = pulse.client;
  const open = (tab?: string) => navigate(`/client/${c.id}${tab ? `?tab=${tab}` : ''}`, { state: { client: c } });
  const consistency = pulse.checkInDays7 / 7;

  return (
    <article
      className={cn('tp-card tr-lift tr-spot tp-rise flex flex-col gap-4 p-4 sm:p-5', !c.is_active && 'opacity-70')}
      style={{ ['--i' as string]: Math.min(index, 8) }}
      onPointerMove={spotlight}
    >
      <div className="flex items-start gap-3.5">
        <Avatar name={c.full_name} seed={c.id} size={54} live={pulse.trainingNow} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => open()} className="block max-w-full truncate rounded-md text-start text-lg font-bold leading-tight hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {c.full_name}
          </button>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {pulse.trainingNow
              ? <span className="font-semibold text-[hsl(var(--tr-ok))]">{t('trainer.dash.trainingNow')}</span>
              : pulse.lastActive
                ? t('trainer.dash.lastActive', { when: fmtRelative(new Date(pulse.lastActive)) })
                : t('trainer.dash.noActivity')}
          </p>
        </div>
        <Ring value={consistency} size={54} stroke={6} color={consistency >= 0.7 ? 'hsl(var(--tr-ok))' : 'hsl(var(--primary))'} className="flex-none">
          <span className="text-[11px] font-bold leading-none tabular-nums" dir="ltr">{pulse.checkInDays7}/7</span>
        </Ring>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {!c.is_active ? (
          <span className="tp-chip">{t('trainer.dash.filter.inactive')}</span>
        ) : pulse.checkedInToday ? (
          <span className="tp-chip tp-chip--ok"><ClipboardCheck className="h-3.5 w-3.5" />{t('trainer.dash.checkedIn')}</span>
        ) : (
          <span className="tp-chip"><ClipboardCheck className="h-3.5 w-3.5" />{t('trainer.dash.noCheckIn')}</span>
        )}
        {loadingActivity ? (
          <Skel className="h-6 w-28 rounded-full" />
        ) : (
          <>
            <span className={cn('tp-chip', pulse.workoutsWeek > 0 && 'tp-chip--primary')}>
              <Dumbbell className="h-3.5 w-3.5" />
              {t('trainer.dash.workoutsCount', { count: pulse.workoutsWeek })}
            </span>
            {pulse.mealsToday > 0 && (
              <span className="tp-chip"><UtensilsCrossed className="h-3.5 w-3.5" />{t('trainer.dash.mealsCount', { count: pulse.mealsToday })}</span>
            )}
          </>
        )}
      </div>

      <div className="mt-auto flex items-center gap-1.5">
        <button type="button" onClick={() => open()} className="tp-btn tp-btn--primary tp-btn--sm tp-press min-w-0 flex-1">
          <span className="truncate">{t('trainer.dash.profile')}</span>
        </button>
        <IconAction label={t('trainer.dash.message')} icon={MessageCircle} onClick={() => navigate(`/chat?clientId=${c.id}`)} />
        <IconAction label={t('trainer.dash.openPlan')} icon={Dumbbell} onClick={() => open('workouts')} />
        <IconAction label={t('client.viewProgress')} icon={TrendingUp} onClick={onProgress} />
        <IconAction label={t('trainer.dash.edit')} icon={Pencil} onClick={() => navigate(`/client/${c.id}/edit`, { state: { client: c } })} />
      </div>
    </article>
  );
};

const IconAction: React.FC<{ label: string; icon: React.ElementType; onClick: () => void }> = ({ label, icon: Icon, onClick }) => (
  <button type="button" onClick={onClick} className="tp-icon-btn tp-press" aria-label={label} title={label}>
    <Icon className="h-[18px] w-[18px]" />
  </button>
);

/* ------------------------------------------------------------------ today feed */

const FEED_ICON: Record<FeedItem['kind'], { icon: React.ElementType; tone: string }> = {
  checkin: { icon: ClipboardCheck, tone: 'tr-tone-ok' },
  workout: { icon: Dumbbell, tone: 'tr-tone-primary' },
  training: { icon: Activity, tone: 'tr-tone-primary' },
  meals: { icon: UtensilsCrossed, tone: 'tr-tone-gold' },
  lead: { icon: UserPlus, tone: 'tr-tone-info' },
};

const TodayFeed: React.FC<{ items: FeedItem[]; loading: boolean }> = ({ items, loading }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (loading && !items.length) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skel className="h-9 w-9 flex-none rounded-[.8rem]" />
            <div className="flex-1 space-y-1.5"><Skel className="h-3.5 w-3/4" /><Skel className="h-3 w-1/3" /></div>
          </div>
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary"><Activity className="h-6 w-6" /></span>
        <p className="font-semibold">{t('trainer.dash.feedEmpty')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('trainer.dash.feedEmptyBody')}</p>
      </div>
    );
  }
  return (
    <ul className="tr-feed -mx-1 space-y-0.5">
      {items.map((it, i) => {
        const { icon: Icon, tone } = FEED_ICON[it.kind];
        const detail =
          it.kind === 'checkin' && it.meta?.weight ? t('trainer.dash.feed.weight', { kg: fmtNum(it.meta.weight, 1) })
            : it.kind === 'workout' && it.meta?.minutes ? t('trainer.dash.feed.minutes', { count: it.meta.minutes })
              : it.kind === 'lead' && it.meta?.goal ? it.meta.goal
                : null;
        return (
          <li key={it.id} className="tp-rise" style={{ ['--i' as string]: Math.min(i, 10) }}>
            <button
              type="button"
              className="tr-feed-item tp-press"
              onClick={() => (it.clientId ? navigate(`/client/${it.clientId}`) : navigate('/studio/prospects'))}
            >
              <span className={cn('tr-feed-dot', tone)}><Icon className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug">
                  <b className="font-bold">{it.name}</b>{' '}
                  <span className="text-muted-foreground">{t(`trainer.dash.feed.${it.kind}`, { count: it.meta?.count ?? 0 })}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {it.kind === 'training' && <span className="tr-live" aria-hidden />}
                  {fmtRelative(new Date(it.at))}
                  {detail && <><span aria-hidden>·</span><span className="truncate">{detail}</span></>}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

/* ------------------------------------------------------------------ dialogs */

const ProgressDialogBody: React.FC<{ client: TrainerClient }> = ({ client }) => {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['trainer', 'progress', client.id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/progress/?client_id=${client.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } });
      return res.ok ? res.json() : [];
    },
  });
  if (q.isLoading) {
    return (
      <div className="space-y-3 py-4" aria-label={t('trainerDashboard.loading')}>
        <Skel className="h-40" />
        <Skel className="h-24" />
      </div>
    );
  }
  return <ClientWeightProgress clientId={String(client.id)} progressEntries={q.data ?? []} onProgressUpdate={() => q.refetch()} isTrainer />;
};

const PasswordInput: React.FC<{ id: string; value: string; onChange: (v: string) => void }> = ({ id, value, onChange }) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} className="tp-input pe-12" value={value} onChange={(e) => onChange(e.target.value)} required autoComplete="new-password" />
      <button
        type="button"
        className="absolute end-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? t('trainer.common.hidePassword') : t('trainer.common.showPassword')}
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
};

const AddClientSheet: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }> = ({ open, onOpenChange, onDone }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof emptyForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError(t('trainerDashboard.passwordsDoNotMatch'));
      return;
    }
    setBusy(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/auth/register/client`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.username, email: form.email, full_name: form.full_name, password: form.password, role: 'CLIENT' }),
      });
      if (!res.ok) {
        setError(await readError(res, t('trainerDashboard.failedToRegisterClient')));
        return;
      }
      const client = await res.json();
      const assign = await fetch(`${API_BASE_URL}/users/clients/${client.id}/assign`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!assign.ok) {
        setError(await readError(assign, t('trainerDashboard.clientRegisteredButFailedToAssign')));
        return;
      }
      onOpenChange(false);
      setForm(emptyForm);
      onDone();
    } catch (err) {
      setError(`${t('trainerDashboard.unexpectedError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('trainerDashboard.addNewClient')}
      description={t('trainerDashboard.registerNewClient')}
      footer={
        <div className="flex gap-2">
          <button type="button" className="tp-btn tp-btn--ghost tp-press flex-1" onClick={() => onOpenChange(false)}>{t('trainerDashboard.cancel')}</button>
          <button type="submit" form="tr-add-client" className="tp-btn tp-btn--primary tp-press flex-1" disabled={busy}>
            <Plus className="h-4 w-4" />
            {busy ? t('trainerDashboard.adding') : t('trainerDashboard.addClient')}
          </button>
        </div>
      }
    >
      <form id="tr-add-client" onSubmit={submit} className="space-y-4 pb-2 pt-2">
        <Field label={t('trainerDashboard.fullName')} htmlFor="ac-name">
          <input id="ac-name" className="tp-input" value={form.full_name} onChange={(e) => set('full_name')(e.target.value)} required autoComplete="off" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('trainerDashboard.username')} htmlFor="ac-user">
            <input id="ac-user" className="tp-input" value={form.username} onChange={(e) => set('username')(e.target.value)} required autoComplete="off" dir="ltr" />
          </Field>
          <Field label={t('trainerDashboard.email')} htmlFor="ac-email">
            <input id="ac-email" type="email" className="tp-input" value={form.email} onChange={(e) => set('email')(e.target.value)} required autoComplete="off" dir="ltr" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('trainerDashboard.password')} htmlFor="ac-pw">
            <PasswordInput id="ac-pw" value={form.password} onChange={set('password')} />
          </Field>
          <Field label={t('trainerDashboard.confirmPassword')} htmlFor="ac-pw2">
            <PasswordInput id="ac-pw2" value={form.confirmPassword} onChange={set('confirmPassword')} />
          </Field>
        </div>
        {error && <div className="tr-banner tr-banner--error" role="alert">{error}</div>}
      </form>
    </Sheet>
  );
};

export default TrainerDashboard;
