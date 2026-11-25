/**
 * Studio -> Automations. A coach's rules: one trigger (no workout for N days, new trainee, weight change…), who it
 * applies to (everyone or chosen trainees) and a chain of actions (task, in-app alert, chat message, email, WhatsApp,
 * webhook). QA #123 made it a control room: live stats, the connected channels (WhatsApp Cloud API, email, webhooks),
 * a plain-language summary of each rule, an activity feed of what fired, and the name editable in place (QA #118).
 * Everything saves on its own (optimistic, debounced).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertCircle, Bell, BellRing, Check, CheckCircle2, CheckSquare, Copy, FlaskConical, Link2, Mail, MessageCircle,
  Pencil, Play, Plug, Plus, Search, Send, Trash2, Users, Zap,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { StudioHeader } from '@/components/studio/StudioHeader';
import { Burst, useBurst } from '@/components/studio/Burst';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { PortalSelect } from '@/components/ui/portal-select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CountUp } from '@/features/trainee/ui';
import { parseDate } from '@/features/trainee/format';
import { useTrainerClients } from '@/features/trainer/hooks';
import { useToast } from '@/hooks/use-toast';
import { optimisticQuery } from '@/lib/optimistic';
import {
  automationsApi, type Automation, type AutomationAction, type AutomationActionType, type AutomationTest, type AutomationTrigger,
  type Integrations, type TaskPriority,
} from '@/lib/studioApi';
import { cn } from '@/lib/utils';
import '@/i18n/automations';
import '@/styles/automations.css';
import { useConfirm } from '@/components/ConfirmDialog';

const AUTOMATIONS_KEY = ['studio', 'automations'] as const;
const STATS_KEY = ['studio', 'automations', 'stats'] as const;
const ACTIVITY_KEY = ['studio', 'automations', 'activity'] as const;
const INTEGRATIONS_KEY = ['studio', 'automations', 'integrations'] as const;

const TRIGGERS: AutomationTrigger[] = ['no_workout', 'no_app', 'no_checkin', 'new_client', 'weight_change', 'milestone', 'unanswered_chat'];
const ACTIONS: AutomationActionType[] = ['chat', 'whatsapp', 'email', 'notify_client', 'task', 'notify_coach', 'webhook'];
const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'normal', 'low'];
const VARS = ['first_name', 'name', 'days', 'coach'] as const;

const ACTION_ICON: Record<AutomationActionType, React.ElementType> = {
  task: CheckSquare, chat: MessageCircle, notify_client: BellRing, notify_coach: Bell, webhook: Link2, email: Mail, whatsapp: WhatsAppIcon,
};
const ACTION_TONE: Record<AutomationActionType, string> = {
  task: 'bg-primary/15 text-primary',
  chat: 'bg-sky-500/15 text-sky-500',
  notify_client: 'bg-indigo-500/15 text-indigo-400',
  notify_coach: 'bg-amber-500/15 text-amber-500',
  webhook: 'bg-violet-500/15 text-violet-500',
  email: 'bg-rose-500/15 text-rose-500',
  whatsapp: 'bg-[#25D366]/15 text-[#25D366]',
};
const DEFAULT_CONFIG: Record<AutomationTrigger, Automation['config']> = {
  no_workout: { days: 4 }, no_app: { days: 5 }, no_checkin: { days: 3 }, new_client: { hours: 48 },
  weight_change: { kg: 2, days: 7, direction: 'any' }, milestone: {}, unanswered_chat: { hours: 12 },
};

const AutomationsPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [askConfirm, confirmDialog] = useConfirm();
  const qc = useQueryClient();
  const { data: autos = [], isPending } = useQuery({ queryKey: AUTOMATIONS_KEY, queryFn: automationsApi.list });
  const { data: stats } = useQuery({ queryKey: STATS_KEY, queryFn: automationsApi.stats, refetchInterval: 120_000 });
  const { data: activity = [] } = useQuery({ queryKey: ACTIVITY_KEY, queryFn: () => automationsApi.activity(30), refetchInterval: 120_000 });
  const { data: integ } = useQuery({ queryKey: INTEGRATIONS_KEY, queryFn: automationsApi.integrations });
  const clients = (useTrainerClients().data || []).filter((c) => c.is_active !== false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = autos.find((a) => a.id === selectedId) || autos[0] || null;
  const [test, setTest] = useState<{ id: number; data: AutomationTest } | null>(null);
  const [testing, setTesting] = useState(false);
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'email' | null>(null);
  const [burst, fireBurst] = useBurst();

  const nameOf = (a: Automation) => (a.template && a.name === a.template ? t(`auto.templateNames.${a.template}`, a.name) : a.name);
  const fail = () => toast({ title: t('common.error'), variant: 'destructive' });
  const refreshSide = () => { qc.invalidateQueries({ queryKey: STATS_KEY }); qc.invalidateQueries({ queryKey: ACTIVITY_KEY }); };

  // Optimistic patch: the list and canvas change now; the server catches up (debounced for typing).
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<number, Partial<Automation>>>({});
  const patch = (id: number, data: Partial<Automation>, debounce = 0) => {
    qc.setQueryData<Automation[]>(AUTOMATIONS_KEY, (ls) => ls?.map((a) => (a.id === id ? { ...a, ...data } : a)));
    pending.current[id] = { ...pending.current[id], ...data };
    clearTimeout(timers.current[id]);
    const flush = () => {
      const body = pending.current[id];
      delete pending.current[id];
      if (!body) return;
      const { name, config, actions, enabled } = body;
      automationsApi.update(id, { name, config, actions, enabled }).catch(() => { fail(); qc.invalidateQueries({ queryKey: AUTOMATIONS_KEY }); });
    };
    if (debounce) timers.current[id] = setTimeout(flush, debounce); else flush();
  };
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const toggle = (a: Automation, enabled: boolean) => {
    void optimisticQuery<Automation[], Automation>(qc, AUTOMATIONS_KEY, (ls) => ls?.map((x) => (x.id === a.id ? { ...x, enabled } : x)),
      () => automationsApi.update(a.id, { enabled }), fail).then(refreshSide);
  };

  const create = async (trigger: AutomationTrigger) => {
    const draft = { name: t(`auto.triggers.${trigger}`), trigger, config: DEFAULT_CONFIG[trigger], actions: [{ type: 'chat', text: '' }] as AutomationAction[], enabled: false };
    const tid = -Date.now();
    qc.setQueryData<Automation[]>(AUTOMATIONS_KEY, (ls) => [...(ls || []), { ...draft, id: tid, runs: 0 }]);
    setSelectedId(tid);
    try {
      const made = await automationsApi.create(draft);
      qc.setQueryData<Automation[]>(AUTOMATIONS_KEY, (ls) => ls?.map((a) => (a.id === tid ? made : a)));
      setSelectedId((cur) => (cur === tid ? made.id : cur));
    } catch {
      qc.setQueryData<Automation[]>(AUTOMATIONS_KEY, (ls) => ls?.filter((a) => a.id !== tid));
      fail();
    }
  };

  const duplicate = async (a: Automation) => {
    try {
      const made = await automationsApi.create({ name: t('auto.copyOf', { name: nameOf(a) }), trigger: a.trigger, config: a.config, actions: a.actions, enabled: false });
      qc.setQueryData<Automation[]>(AUTOMATIONS_KEY, (ls) => [...(ls || []), made]);
      setSelectedId(made.id);
    } catch { fail(); }
  };

  const remove = async (a: Automation) => {
    if (!(await askConfirm({ body: t('auto.deleteConfirm') }))) return;
    setSelectedId(null);
    void optimisticQuery<Automation[], void>(qc, AUTOMATIONS_KEY, (ls) => ls?.filter((x) => x.id !== a.id), () => automationsApi.remove(a.id), fail).then(refreshSide);
  };

  const runTest = async (a: Automation) => {
    setTesting(true);
    try { setTest({ id: a.id, data: await automationsApi.test(a.id) }); } catch { fail(); } finally { setTesting(false); }
  };
  const runNow = async (a: Automation) => {
    if (!(await askConfirm({ body: t('auto.runNowConfirm'), title: t('auto.runNow'), confirmLabel: t('auto.runNow'), destructive: false }))) return;
    try {
      const r = await automationsApi.run(a.id);
      if (r.fired) fireBurst();
      toast({ title: r.fired ? t('auto.fired', { count: r.fired }) : t('auto.noMatches') });
      qc.invalidateQueries({ queryKey: AUTOMATIONS_KEY });
      qc.invalidateQueries({ queryKey: ['studio', 'tasks'] });
      refreshSide();
    } catch { fail(); }
  };

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return autos.filter((a) => !n || nameOf(a).toLowerCase().includes(n) || t(`auto.triggers.${a.trigger}`).toLowerCase().includes(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autos, q, i18n.language]);

  const locale = i18n.language?.startsWith('he') ? 'he-IL' : i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const when = (iso?: string | null) => {
    const d = iso ? parseDate(iso) : null;
    return d ? d.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };

  return (
    <Layout currentPage="automations">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-10">
        <StudioHeader
          eyebrow={t('studio.groupBusiness')}
          title={t('auto.title')}
          lead={t('auto.lead')}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button data-testid="auto-new"><Plus />{t('auto.new')}</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <p className="px-2 pb-1 pt-1.5 text-xs font-semibold text-muted-foreground">{t('auto.pickTrigger')}</p>
                {TRIGGERS.map((tr) => (
                  <DropdownMenuItem key={tr} onSelect={() => void create(tr)} className="gap-3 py-2.5">
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-primary/12 text-primary"><Zap className="h-4 w-4" /></span>
                    <span className="min-w-0"><b className="block text-sm">{t(`auto.triggers.${tr}`)}</b><span className="block text-xs text-muted-foreground">{t(`auto.triggerWhy.${tr}`)}</span></span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />

        {/* Live numbers */}
        <div className="ec-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="tp-card tp-card--accent relative overflow-hidden p-4 sm:p-5">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold text-white/85">{t('auto.stats.active')}</span><Zap className="h-4 w-4 text-white/80" /></div>
            <div className="mt-3 font-num text-[2.6rem] leading-none" dir="ltr"><CountUp value={stats?.active ?? autos.filter((a) => a.enabled).length} /><span className="ms-1 text-lg text-white/70">/ {stats?.total ?? autos.length}</span></div>
            <p className="mt-1 text-xs text-white/75">{t('auto.stats.activeHint')}</p>
          </div>
          <div className="tp-card p-4 sm:p-5">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold text-muted-foreground">{t('auto.stats.week')}</span><Activity className="h-4 w-4 text-primary" /></div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <span className="font-num text-[2.6rem] leading-none" dir="ltr"><CountUp value={stats?.fired_week ?? 0} /></span>
              <span className="au-bars w-28 text-primary" dir="ltr" aria-hidden>
                {(stats?.fired_14d ?? Array(14).fill(0)).map((v, i, arr) => (
                  <span key={i} style={{ height: `${Math.max(6, (v / Math.max(1, ...arr)) * 100)}%`, '--i': i } as React.CSSProperties} />
                ))}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('auto.stats.weekHint')}</p>
          </div>
          <div className="tp-card p-4 sm:p-5">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold text-muted-foreground">{t('auto.stats.messages')}</span><Send className="h-4 w-4 text-sky-500" /></div>
            <div className="mt-3 font-num text-[2.6rem] leading-none" dir="ltr"><CountUp value={stats?.messages_14d ?? 0} /></div>
            <p className="mt-1 text-xs text-muted-foreground">{t('auto.stats.messagesHint')}</p>
          </div>
          <button type="button" onClick={() => navigate('/studio/tasks')} className="tp-card tr-lift p-4 text-start sm:p-5">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold text-muted-foreground">{t('auto.stats.tasks')}</span><CheckSquare className="h-4 w-4 text-amber-500" /></div>
            <div className="mt-3 font-num text-[2.6rem] leading-none" dir="ltr"><CountUp value={stats?.open_tasks ?? 0} /></div>
            <p className="mt-1 text-xs text-muted-foreground">{t('auto.stats.tasksHint')}</p>
          </button>
        </div>

        {/* Channels */}
        <section className="mb-6">
          <div className="mb-2 flex items-center gap-2"><Plug className="h-4 w-4 text-primary" /><h2 className="text-sm font-bold">{t('auto.channels.title')}</h2><span className="text-xs text-muted-foreground">{t('auto.channels.lead')}</span></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ChannelCard
              icon={WhatsAppIcon} tone={ACTION_TONE.whatsapp} title="WhatsApp"
              status={integ?.whatsapp.connected ? 'on' : 'half'}
              text={integ?.whatsapp.connected ? t('auto.channels.waOn', { phone: integ.whatsapp.display_phone || integ.whatsapp.phone_number_id }) : t('auto.channels.waOff')}
              action={integ?.whatsapp.connected ? t('auto.channels.manage') : t('auto.channels.connect')}
              onAction={() => setChannel('whatsapp')}
            />
            <ChannelCard
              icon={Mail} tone={ACTION_TONE.email} title={t('auto.channels.email')}
              status={integ?.email.mode ? 'on' : 'off'}
              text={integ?.email.mode === 'own' ? t('auto.channels.emailOwn', { from: integ.email.from_email }) : integ?.email.mode === 'platform' ? t('auto.channels.emailPlatform') : t('auto.channels.emailOff')}
              action={integ?.email.mode ? t('auto.channels.manage') : t('auto.channels.connect')}
              onAction={() => setChannel('email')}
            />
            <ChannelCard icon={BellRing} tone={ACTION_TONE.notify_client} title={t('auto.channels.app')} status="on" text={t('auto.channels.appText')} />
            <ChannelCard
              icon={Link2} tone={ACTION_TONE.webhook} title="Zapier · Make · n8n" status={integ?.webhook.count ? 'on' : 'off'}
              text={integ?.webhook.count ? t('auto.channels.hooksOn', { count: integ.webhook.count }) : t('auto.channels.hooksOff')}
            />
          </div>
        </section>

        {isPending && !autos.length ? (
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="h-[28rem] ec-skel rounded-[1.5rem] bg-card" />
            <div className="h-[28rem] ec-skel rounded-[1.5rem] bg-card" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* Rules */}
            <aside className="ec-glass h-fit overflow-hidden rounded-[1.5rem] border border-border/60 lg:sticky lg:top-24">
              <div className="border-b border-border/50 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('auto.search')} className="h-9 ps-9" />
                </div>
              </div>
              <ul className="max-h-[62vh] divide-y divide-border/50 overflow-y-auto">
                {shown.map((a) => {
                  const Icon = ACTION_ICON[a.actions[0]?.type || 'task'];
                  const on = selected?.id === a.id;
                  return (
                    <li key={a.id} className={cn('relative flex items-center gap-3 px-4 py-3.5 transition-colors', on ? 'bg-primary/[.07]' : 'hover:bg-muted/40')}>
                      {on && <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-primary" />}
                      <button type="button" onClick={() => setSelectedId(a.id)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                        <span className={cn('relative grid h-9 w-9 shrink-0 place-items-center rounded-xl', ACTION_TONE[a.actions[0]?.type || 'task'])}>
                          <Icon className="h-4 w-4" />
                          {a.enabled && <span className="au-live absolute -end-0.5 -top-0.5 ring-2 ring-card" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold" dir="auto">{nameOf(a)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.runs ? t('auto.runs', { count: a.runs }) : t('auto.never')} · {a.actions.length} {t('auto.then').toLowerCase()}
                          </span>
                        </span>
                      </button>
                      <Switch checked={a.enabled} onCheckedChange={(v) => toggle(a, v)} aria-label={a.enabled ? t('auto.on') : t('auto.off')} />
                    </li>
                  );
                })}
                {!shown.length && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{t('auto.noResults')}</li>}
              </ul>
            </aside>

            {/* Flow */}
            {selected && (
              <section className="overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/40">
                {/* QA #118: the name is the title, edited in place */}
                <div className="border-b border-border/60 bg-background/60 px-4 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="group flex min-w-0 flex-1 basis-60 items-center gap-2">
                      <input
                        key={selected.id}
                        value={nameOf(selected)}
                        onChange={(e) => patch(selected.id, { name: e.target.value }, 700)}
                        onBlur={(e) => { if (!e.target.value.trim()) patch(selected.id, { name: t(`auto.triggers.${selected.trigger}`) }); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        aria-label={t('auto.name')}
                        className="au-title-input min-w-0 flex-1 text-xl font-bold sm:text-2xl"
                        data-testid="auto-name"
                      />
                      <Pencil className="h-4 w-4 flex-none text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
                    </label>
                    <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold', selected.enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>
                      {selected.enabled ? <span className="au-live" /> : <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />}
                      {selected.enabled ? t('auto.live') : t('auto.off')}
                    </span>
                    <Switch checked={selected.enabled} onCheckedChange={(v) => toggle(selected, v)} aria-label={t('auto.on')} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground" dir="auto">{summary(selected, clients.length, t)}</p>
                </div>

                <div
                  className="relative min-h-[28rem] px-4 py-8 sm:px-8"
                  style={{ backgroundImage: 'radial-gradient(hsl(var(--muted-foreground) / .2) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
                >
                  <div className="mx-auto flex max-w-md flex-col items-center">
                    <TriggerNode a={selected} onConfig={(config) => patch(selected.id, { config }, 600)} />
                    <Wire live={selected.enabled} />
                    <AudienceNode a={selected} clients={clients} onConfig={(config) => patch(selected.id, { config })} />
                    {selected.actions.map((act, i) => (
                      <React.Fragment key={i}>
                        <Connector live={selected.enabled} onAdd={(type) => patch(selected.id, { actions: insertAt(selected.actions, i, type, t) })} />
                        <ActionNode
                          act={act} integ={integ} onConnect={setChannel}
                          onChange={(next) => patch(selected.id, { actions: selected.actions.map((x, j) => (j === i ? next : x)) }, 600)}
                          onRemove={() => patch(selected.id, { actions: selected.actions.filter((_, j) => j !== i) })}
                          onDuplicate={() => patch(selected.id, { actions: [...selected.actions.slice(0, i + 1), { ...act }, ...selected.actions.slice(i + 1)] })}
                        />
                      </React.Fragment>
                    ))}
                    <Connector last live={selected.enabled} onAdd={(type) => patch(selected.id, { actions: insertAt(selected.actions, selected.actions.length, type, t) })} />
                  </div>
                </div>

                {test && test.id === selected.id && (
                  <div className="ec-enter border-t border-border/60 bg-background/60 px-5 py-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <b>{test.data.matches ? t('auto.matches', { count: test.data.matches }) : t('auto.noMatches')}</b>
                      <span className="text-xs text-muted-foreground">{t('auto.previewNote')}</span>
                    </div>
                    <ul className="space-y-2">
                      {test.data.preview.map((p) => (
                        <li key={p.client_id} className="rounded-xl border border-border/50 bg-card/70 p-3 text-sm">
                          <b className="block">{p.name}</b>
                          {p.actions.filter((x) => x.text).map((x, k) => (
                            <span key={k} className="mt-1 flex gap-2 text-muted-foreground"><span className="shrink-0">{t(`auto.actions.${x.type}`)}:</span><span className="text-foreground" dir="auto">{x.text}</span></span>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Bar */}
                <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-background/70 px-4 py-3 backdrop-blur">
                  <span className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex">{t('auto.liveNote')}</span>
                  <div className="ms-auto flex flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(selected)}><Trash2 />{t('auto.delete')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => void duplicate(selected)}><Copy />{t('auto.duplicate')}</Button>
                    <Button variant="secondary" size="sm" onClick={() => void runTest(selected)} disabled={testing}><FlaskConical />{testing ? t('auto.testing') : t('auto.test')}</Button>
                    <Burst k={burst}><Button size="sm" onClick={() => void runNow(selected)}><Play />{t('auto.runNow')}</Button></Burst>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* Activity */}
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><h2 className="text-sm font-bold">{t('auto.activity.title')}</h2></div>
          {!activity.length ? (
            <p className="rounded-[1.25rem] border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t('auto.activity.empty')}</p>
          ) : (
            <ol className="ec-stagger grid gap-2 md:grid-cols-2">
              {activity.slice(0, 12).map((f) => {
                const auto = autos.find((a) => a.id === f.automation_id);
                const ok = f.result.every((r) => r.ok);
                return (
                  <li key={f.id} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/70 p-3">
                    <span className={cn('mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-xl', ok ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive')}>
                      {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block"><b dir="auto">{f.client_name}</b> <span className="text-muted-foreground">·</span> <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setSelectedId(f.automation_id)}>{auto ? nameOf(auto) : f.automation}</button></span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {f.result.map((r, k) => {
                          const Icon = ACTION_ICON[r.type] || Zap;
                          return (
                            <span key={k} title={r.error || undefined} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', r.ok ? 'bg-foreground/[.06] text-muted-foreground' : 'bg-destructive/10 text-destructive')}>
                              <Icon className="h-3 w-3" />{t(`auto.actions.${r.type}`)}{r.mode === 'manual' && ` · ${t('auto.activity.manual')}`}{!r.ok && ` · ${r.error || t('common.error')}`}
                            </span>
                          );
                        })}
                      </span>
                    </span>
                    <span className="flex-none text-[11px] text-muted-foreground">{when(f.fired_at)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      <ChannelDialog kind={channel} integ={integ} onClose={() => setChannel(null)} onSaved={(d) => qc.setQueryData<Integrations>(INTEGRATIONS_KEY, d)} onRemoved={() => qc.invalidateQueries({ queryKey: INTEGRATIONS_KEY })} />
      {confirmDialog}
    </Layout>
  );
};

/** One plain sentence: "When … → 2 actions, for all 14 trainees." */
function summary(a: Automation, clientCount: number, t: (k: string, o?: Record<string, unknown>) => string) {
  const ids = a.config?.client_ids || [];
  const who = ids.length ? t('auto.audience.some', { count: ids.length }) : t('auto.audience.allCount', { count: clientCount });
  const acts = a.actions.map((x) => t(`auto.actions.${x.type}`)).join(' → ');
  return t('auto.summary', { trigger: t(`auto.triggers.${a.trigger}`), actions: acts || '—', who });
}

function insertAt(list: AutomationAction[], i: number, type: AutomationActionType, t: (k: string) => string): AutomationAction[] {
  const fresh: AutomationAction =
    type === 'task' ? { type, title: '{name}', priority: 'normal' }
      : type === 'webhook' ? { type, url: 'https://' }
        : type === 'notify_client' || type === 'notify_coach' || type === 'email' ? { type, title: t(`auto.actions.${type}`), text: '' }
          : { type, text: '' };
  return [...list.slice(0, i), fresh, ...list.slice(i)];
}

const ChannelCard: React.FC<{ icon: React.ElementType; tone: string; title: string; text: string; status: 'on' | 'half' | 'off'; action?: string; onAction?: () => void }> = ({ icon: Icon, tone, title, text, status, action, onAction }) => (
  <div className="tp-card flex items-start gap-3 p-4">
    <span className={cn('grid h-10 w-10 flex-none place-items-center rounded-xl', tone)}><Icon className="h-5 w-5" /></span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2 font-bold">
        {title}
        {status === 'on' ? <span className="au-live" /> : <span className={cn('h-2 w-2 rounded-full', status === 'half' ? 'bg-amber-500' : 'bg-muted-foreground/40')} />}
      </span>
      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{text}</span>
      {action && onAction && <button type="button" onClick={onAction} className="mt-2 text-xs font-bold text-primary hover:underline">{action}</button>}
    </span>
  </div>
);

const Node: React.FC<{ tone: string; icon: React.ElementType; title: React.ReactNode; tools?: React.ReactNode; children?: React.ReactNode; accent?: boolean }> = ({ tone, icon: Icon, title, tools, children, accent }) => (
  <div className={cn('group tp-rise relative w-full rounded-2xl border bg-card shadow-[0_10px_30px_-18px_rgba(0,0,0,.45)] transition-shadow hover:shadow-[0_16px_40px_-18px_rgba(0,0,0,.55)]', accent ? 'border-primary/40' : 'border-border/70')}>
    <div className={cn('flex items-center gap-2 rounded-t-2xl border-b border-border/50 px-4 py-2.5', accent && 'bg-primary/[.06]')}>
      <span className={cn('grid h-7 w-7 place-items-center rounded-lg', tone)}><Icon className="h-3.5 w-3.5" /></span>
      <b className="min-w-0 flex-1 truncate text-sm">{title}</b>
      {tools}
    </div>
    <div className="space-y-2.5 px-4 py-3">{children}</div>
  </div>
);

const Num: React.FC<{ value?: number; onChange: (v: number) => void; unit: string; step?: number }> = ({ value, onChange, unit, step = 1 }) => (
  <span className="inline-flex items-center overflow-hidden rounded-xl border border-border/70 bg-background">
    <input
      type="number" min={0} step={step} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))}
      className="h-9 w-16 bg-transparent text-center font-semibold tabular-nums outline-none" dir="ltr"
    />
    <span className="border-s border-border/70 bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground">{unit}</span>
  </span>
);

const TriggerNode: React.FC<{ a: Automation; onConfig: (c: Automation['config']) => void }> = ({ a, onConfig }) => {
  const { t } = useTranslation();
  const c = a.config || {};
  const set = (k: keyof Automation['config'], v: unknown) => onConfig({ ...c, [k]: v });
  return (
    <Node accent tone="bg-primary text-primary-foreground" icon={Zap} title={<>{t('auto.trigger')} · {t(`auto.triggers.${a.trigger}`)}</>}>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{t(`auto.triggerHelp.${a.trigger}`)}</span>
        {['no_workout', 'no_app', 'no_checkin'].includes(a.trigger) && <Num value={c.days} onChange={(v) => set('days', v)} unit={t('auto.days')} />}
        {['new_client', 'unanswered_chat'].includes(a.trigger) && <Num value={c.hours} onChange={(v) => set('hours', v)} unit={t('auto.hours')} />}
        {a.trigger === 'weight_change' && (
          <>
            <Num value={c.kg} step={0.5} onChange={(v) => set('kg', v)} unit={t('auto.kg')} />
            <span>{t('auto.within')}</span>
            <Num value={c.days} onChange={(v) => set('days', v)} unit={t('auto.days')} />
            <PortalSelect
              value={c.direction || 'any'} onChange={(v) => set('direction', v)} label={t('auto.trigger')}
              options={(['any', 'down', 'up'] as const).map((d) => ({ value: d, label: t(`auto.direction.${d}`) }))}
            />
          </>
        )}
      </div>
    </Node>
  );
};

/** QA #123 personalisation: everyone, or only the trainees picked here. */
const AudienceNode: React.FC<{ a: Automation; clients: { id: number; full_name: string; username?: string }[]; onConfig: (c: Automation['config']) => void }> = ({ a, clients, onConfig }) => {
  const { t } = useTranslation();
  const ids = a.config?.client_ids || [];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const setIds = (next: number[]) => onConfig({ ...a.config, client_ids: next });
  const list = clients.filter((c) => !q.trim() || (c.full_name || c.username || '').toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Node tone="bg-foreground/[.08] text-foreground" icon={Users} title={t('auto.audience.title')}>
      <div className="inline-flex rounded-full bg-muted/60 p-0.5 text-xs font-semibold" role="radiogroup">
        <button type="button" role="radio" aria-checked={!ids.length} onClick={() => { setIds([]); setOpen(false); }} className={cn('rounded-full px-3 py-1.5 transition-colors', !ids.length ? 'bg-foreground text-background' : 'text-muted-foreground')}>{t('auto.audience.all')}</button>
        <button type="button" role="radio" aria-checked={!!ids.length || open} onClick={() => setOpen(true)} className={cn('rounded-full px-3 py-1.5 transition-colors', ids.length || open ? 'bg-foreground text-background' : 'text-muted-foreground')}>{t('auto.audience.pick')}</button>
      </div>
      {!!ids.length && (
        <div className="flex flex-wrap gap-1.5">
          {ids.map((id) => {
            const c = clients.find((x) => x.id === id);
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary" dir="auto">
                {c?.full_name || c?.username || `#${id}`}
                <button type="button" onClick={() => setIds(ids.filter((x) => x !== id))} aria-label={t('auto.delete')} className="opacity-70 hover:opacity-100">×</button>
              </span>
            );
          })}
        </div>
      )}
      {(open || !!ids.length) && (
        <div className="rounded-xl border border-border/60 bg-background p-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('auto.audience.search')} className="h-9" />
          <ul className="mt-1.5 max-h-44 overflow-y-auto">
            {list.map((c) => {
              const on = ids.includes(c.id);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => setIds(on ? ids.filter((x) => x !== c.id) : [...ids, c.id])}
                    className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm', on ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60')}>
                    <span className={cn('grid h-4 w-4 place-items-center rounded border text-[10px]', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                    <span className="truncate" dir="auto">{c.full_name || c.username}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Node>
  );
};

const ActionNode: React.FC<{
  act: AutomationAction; integ?: Integrations; onConnect: (k: 'whatsapp' | 'email') => void;
  onChange: (a: AutomationAction) => void; onRemove: () => void; onDuplicate: () => void;
}> = ({ act, integ, onConnect, onChange, onRemove, onDuplicate }) => {
  const { t } = useTranslation();
  const Icon = ACTION_ICON[act.type];
  const textRef = useRef<HTMLTextAreaElement>(null);
  const insertVar = (v: string) => {
    const el = textRef.current;
    const token = `{${v}}`;
    const cur = act.text || '';
    if (!el) { onChange({ ...act, text: cur + token }); return; }
    const s = el.selectionStart ?? cur.length;
    const e = el.selectionEnd ?? cur.length;
    onChange({ ...act, text: cur.slice(0, s) + token + cur.slice(e) });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  };
  const tools = (
    <span className="flex gap-1 opacity-60 transition-opacity group-hover:opacity-100">
      <button type="button" onClick={onDuplicate} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-muted" aria-label={t('auto.duplicate')}><Copy className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={onRemove} className="grid h-7 w-7 place-items-center rounded-lg text-destructive hover:bg-destructive/10" aria-label={t('auto.delete')}><Trash2 className="h-3.5 w-3.5" /></button>
    </span>
  );
  const hasTitle = act.type === 'task' || act.type === 'notify_client' || act.type === 'notify_coach' || act.type === 'email';
  const hasText = act.type === 'chat' || act.type === 'notify_client' || act.type === 'notify_coach' || act.type === 'email' || act.type === 'whatsapp';
  return (
    <Node tone={ACTION_TONE[act.type]} icon={Icon} title={t(`auto.actions.${act.type}`)} tools={tools}>
      <p className="text-xs text-muted-foreground">{t(`auto.actionHelp.${act.type}`)}</p>
      {act.type === 'whatsapp' && !integ?.whatsapp.connected && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          {t('auto.waManual')} <button type="button" className="font-bold underline" onClick={() => onConnect('whatsapp')}>{t('auto.channels.connect')}</button>
        </p>
      )}
      {act.type === 'email' && !integ?.email.mode && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          {t('auto.emailOff')} <button type="button" className="font-bold underline" onClick={() => onConnect('email')}>{t('auto.channels.connect')}</button>
        </p>
      )}
      {hasTitle && <Input value={act.title || ''} onChange={(e) => onChange({ ...act, title: e.target.value })} placeholder={act.type === 'email' ? t('auto.f.subject') : t('auto.f.title')} dir="auto" />}
      {hasText && <Textarea ref={textRef} value={act.text || ''} onChange={(e) => onChange({ ...act, text: e.target.value })} placeholder={t('auto.f.text')} rows={3} dir="auto" />}
      {act.type === 'task' && (
        <div className="flex flex-wrap gap-1.5">
          {PRIORITIES.map((p) => (
            <button
              key={p} type="button" onClick={() => onChange({ ...act, priority: p })}
              className={cn('rounded-full border px-3 py-1 text-xs font-semibold transition-colors', (act.priority || 'normal') === p ? 'border-transparent bg-foreground text-background' : 'border-border/70 text-muted-foreground hover:text-foreground')}
            >{t(`tasks.priority.${p}`)}</button>
          ))}
        </div>
      )}
      {act.type === 'webhook' && <Input value={act.url || ''} onChange={(e) => onChange({ ...act, url: e.target.value })} placeholder={t('auto.f.url')} dir="ltr" />}
      {hasText && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">{t('auto.insert')}</span>
          {VARS.map((v) => (
            <button key={v} type="button" onClick={() => insertVar(v)} className="rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">{t(`auto.var.${v}`)}</button>
          ))}
        </div>
      )}
    </Node>
  );
};

const Wire: React.FC<{ live: boolean }> = ({ live }) => (
  <div className="flex h-10 flex-col items-center"><span className={cn('au-wire', live && 'au-wire--live')} /></div>
);

const Connector: React.FC<{ onAdd: (t: AutomationActionType) => void; last?: boolean; live?: boolean }> = ({ onAdd, last, live }) => {
  const { t } = useTranslation();
  return (
    <div className="relative flex h-14 flex-col items-center">
      <span className={cn('au-wire', live && 'au-wire--live', last && 'max-h-4')} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('auto.addAction')} className="z-[1] grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-[transform,border-color,color] hover:scale-110 hover:border-primary hover:text-primary">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-72">
          {ACTIONS.map((a) => {
            const Icon = ACTION_ICON[a];
            return (
              <DropdownMenuItem key={a} onSelect={() => onAdd(a)} className="gap-3 py-2">
                <span className={cn('grid h-8 w-8 place-items-center rounded-lg', ACTION_TONE[a])}><Icon className="h-4 w-4" /></span>
                <span><b className="block text-sm">{t(`auto.actions.${a}`)}</b><span className="text-xs text-muted-foreground">{t(`auto.actionHelp.${a}`)}</span></span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {!last && <span className={cn('au-wire', live && 'au-wire--live')} />}
    </div>
  );
};

/* ------------------------------------------------------------------ channel set-up */

const ChannelDialog: React.FC<{
  kind: 'whatsapp' | 'email' | null; integ?: Integrations; onClose: () => void; onSaved: (d: Integrations) => void; onRemoved: () => void;
}> = ({ kind, integ, onClose, onSaved, onRemoved }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [wa, setWa] = useState({ phone_number_id: '', token: '', template: '', lang: 'he', country_code: '972' });
  const [em, setEm] = useState({ sender_name: '', reply_to: '', host: '', port: 587, username: '', password: '', from_email: '' });
  const [own, setOwn] = useState(false);

  useEffect(() => {
    if (!kind || !integ) return;
    setErr('');
    setWa({ phone_number_id: integ.whatsapp.phone_number_id, token: '', template: integ.whatsapp.template, lang: integ.whatsapp.lang || 'he', country_code: integ.whatsapp.country_code || '972' });
    setEm({ sender_name: integ.email.sender_name, reply_to: integ.email.reply_to, host: integ.email.host, port: integ.email.port || 587, username: integ.email.username, password: '', from_email: integ.email.from_email });
    setOwn(!!integ.email.host);
  }, [kind, integ]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const d = kind === 'whatsapp'
        ? await automationsApi.connectWhatsapp({ ...wa, token: wa.token || undefined })
        : await automationsApi.saveEmail(own ? { ...em, password: em.password || undefined } : { sender_name: em.sender_name, reply_to: em.reply_to });
      onSaved(d);
      toast({ title: t('auto.channels.saved') });
      onClose();
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!kind) return;
    try { await automationsApi.disconnect(kind); onRemoved(); onClose(); } catch { setErr(t('common.error')); }
  };
  const connected = kind === 'whatsapp' ? integ?.whatsapp.connected : !!integ?.email.host;

  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{kind === 'whatsapp' ? <WhatsAppIcon className="h-5 w-5 text-[#25D366]" /> : <Mail className="h-5 w-5 text-rose-500" />}{kind === 'whatsapp' ? t('auto.wa.title') : t('auto.em.title')}</DialogTitle>
          <DialogDescription>{kind === 'whatsapp' ? t('auto.wa.lead') : t('auto.em.lead')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {kind === 'whatsapp' ? (
            <>
              <ol className="list-decimal space-y-1 rounded-xl bg-muted/50 py-3 pe-3 ps-8 text-xs text-muted-foreground">
                <li>{t('auto.wa.step1')}</li><li>{t('auto.wa.step2')}</li><li>{t('auto.wa.step3')}</li>
              </ol>
              <Field label={t('auto.wa.phoneId')}><Input dir="ltr" value={wa.phone_number_id} onChange={(e) => setWa({ ...wa, phone_number_id: e.target.value.trim() })} placeholder="123456789012345" required /></Field>
              <Field label={t('auto.wa.token')} hint={integ?.whatsapp.last4 ? t('auto.keepSecret', { last4: integ.whatsapp.last4 }) : undefined}>
                <Input dir="ltr" type="password" autoComplete="off" value={wa.token} onChange={(e) => setWa({ ...wa, token: e.target.value })} placeholder="EAAG…" required={!integ?.whatsapp.last4} />
              </Field>
              <div className="grid grid-cols-[1fr_6rem_5rem] gap-2">
                <Field label={t('auto.wa.template')} hint={t('auto.wa.templateHint')}><Input dir="ltr" value={wa.template} onChange={(e) => setWa({ ...wa, template: e.target.value.trim() })} placeholder="coach_update" /></Field>
                <Field label={t('auto.wa.lang')}><Input dir="ltr" value={wa.lang} onChange={(e) => setWa({ ...wa, lang: e.target.value.trim() })} placeholder="he" /></Field>
                <Field label={t('auto.wa.cc')}><Input dir="ltr" value={wa.country_code} onChange={(e) => setWa({ ...wa, country_code: e.target.value.replace(/\D/g, '') })} placeholder="972" /></Field>
              </div>
            </>
          ) : (
            <>
              <Field label={t('auto.em.sender')}><Input value={em.sender_name} onChange={(e) => setEm({ ...em, sender_name: e.target.value })} placeholder={t('auto.em.senderPh')} /></Field>
              <Field label={t('auto.em.replyTo')}><Input dir="ltr" type="email" value={em.reply_to} onChange={(e) => setEm({ ...em, reply_to: e.target.value })} placeholder="coach@example.com" /></Field>
              <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-sm">
                <span><b className="block">{t('auto.em.own')}</b><span className="text-xs text-muted-foreground">{t('auto.em.ownHint')}</span></span>
                <Switch checked={own} onCheckedChange={setOwn} />
              </label>
              {own && (
                <div className="ec-enter space-y-3">
                  <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                    <Field label={t('auto.em.host')}><Input dir="ltr" value={em.host} onChange={(e) => setEm({ ...em, host: e.target.value.trim() })} placeholder="smtp.gmail.com" required /></Field>
                    <Field label={t('auto.em.port')}><Input dir="ltr" type="number" value={em.port} onChange={(e) => setEm({ ...em, port: Number(e.target.value) || 587 })} /></Field>
                  </div>
                  <Field label={t('auto.em.user')}><Input dir="ltr" value={em.username} onChange={(e) => setEm({ ...em, username: e.target.value.trim() })} placeholder="you@gmail.com" required /></Field>
                  <Field label={t('auto.em.password')} hint={integ?.email.has_password ? t('auto.keepSecretShort') : t('auto.em.passwordHint')}>
                    <Input dir="ltr" type="password" autoComplete="off" value={em.password} onChange={(e) => setEm({ ...em, password: e.target.value })} required={!integ?.email.has_password} />
                  </Field>
                </div>
              )}
              {!own && <p className="text-xs text-muted-foreground">{integ?.email.mode === 'platform' || (integ?.email.mode === 'own' && !own) ? t('auto.em.platformOk') : t('auto.em.platformOff')}</p>}
            </>
          )}
          {err && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {connected && <Button type="button" variant="ghost" className="text-destructive" onClick={() => void disconnect()}>{t('auto.channels.disconnect')}</Button>}
            <Button type="submit" className="ms-auto" disabled={busy}>{busy ? t('auto.channels.checking') : t('auto.channels.save')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <span className="text-xs font-bold text-muted-foreground">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
  </label>
);

export default AutomationsPage;
