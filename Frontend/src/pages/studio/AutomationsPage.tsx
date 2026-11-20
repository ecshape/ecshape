/**
 * Studio -> Automations. A coach's rules: one trigger (no workout for N days, new trainee, weight change…) and a
 * chain of actions (task, alert, chat message as the coach, webhook). The list on the side switches each one on/off;
 * the canvas shows the selected flow as connected nodes, editable in place, with a dry "test run" that shows who
 * matches right now and the exact message each one would get. Everything saves on its own (optimistic, debounced).
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, BellRing, CheckSquare, Copy, FlaskConical, Link2, MessageCircle, Play, Plus, Trash2, Zap,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { StudioHeader } from '@/components/studio/StudioHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { PortalSelect } from '@/components/ui/portal-select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { optimisticQuery } from '@/lib/optimistic';
import {
  automationsApi, type Automation, type AutomationAction, type AutomationActionType, type AutomationTest, type AutomationTrigger, type TaskPriority,
} from '@/lib/studioApi';
import { cn } from '@/lib/utils';
import '@/i18n/automations';

const AUTOMATIONS_KEY = ['studio', 'automations'] as const;

const TRIGGERS: AutomationTrigger[] = ['no_workout', 'no_app', 'no_checkin', 'new_client', 'weight_change', 'milestone', 'unanswered_chat'];
const ACTIONS: AutomationActionType[] = ['task', 'chat', 'notify_client', 'notify_coach', 'webhook'];
const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'normal', 'low'];

const ACTION_ICON: Record<AutomationActionType, React.ElementType> = {
  task: CheckSquare, chat: MessageCircle, notify_client: BellRing, notify_coach: Bell, webhook: Link2,
};
const ACTION_TONE: Record<AutomationActionType, string> = {
  task: 'bg-primary/15 text-primary',
  chat: 'bg-emerald-500/15 text-emerald-500',
  notify_client: 'bg-sky-500/15 text-sky-500',
  notify_coach: 'bg-amber-500/15 text-amber-500',
  webhook: 'bg-violet-500/15 text-violet-500',
};
const DEFAULT_CONFIG: Record<AutomationTrigger, Automation['config']> = {
  no_workout: { days: 4 }, no_app: { days: 5 }, no_checkin: { days: 3 }, new_client: { hours: 48 },
  weight_change: { kg: 2, days: 7, direction: 'any' }, milestone: {}, unanswered_chat: { hours: 12 },
};

const AutomationsPage = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: autos = [], isPending } = useQuery({ queryKey: AUTOMATIONS_KEY, queryFn: automationsApi.list });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = autos.find((a) => a.id === selectedId) || autos[0] || null;
  const [test, setTest] = useState<{ id: number; data: AutomationTest } | null>(null);
  const [testing, setTesting] = useState(false);

  const nameOf = (a: Automation) => (a.template && a.name === a.template ? t(`auto.templateNames.${a.template}`, a.name) : a.name);
  const fail = () => toast({ title: t('common.error'), variant: 'destructive' });

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
      () => automationsApi.update(a.id, { enabled }), fail);
  };

  const create = async (trigger: AutomationTrigger) => {
    const draft = { name: t(`auto.triggers.${trigger}`), trigger, config: DEFAULT_CONFIG[trigger], actions: [{ type: 'task', title: t(`auto.triggers.${trigger}`), priority: 'normal' }] as AutomationAction[], enabled: false };
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

  const remove = (a: Automation) => {
    if (!window.confirm(t('auto.deleteConfirm'))) return;
    setSelectedId(null);
    void optimisticQuery<Automation[], void>(qc, AUTOMATIONS_KEY, (ls) => ls?.filter((x) => x.id !== a.id), () => automationsApi.remove(a.id), fail);
  };

  const runTest = async (a: Automation) => {
    setTesting(true);
    try { setTest({ id: a.id, data: await automationsApi.test(a.id) }); } catch { fail(); } finally { setTesting(false); }
  };
  const runNow = async (a: Automation) => {
    if (!window.confirm(t('auto.runNowConfirm'))) return;
    try {
      const r = await automationsApi.run(a.id);
      toast({ title: r.fired ? t('auto.fired', { count: r.fired }) : t('auto.noMatches') });
      qc.invalidateQueries({ queryKey: AUTOMATIONS_KEY });
      qc.invalidateQueries({ queryKey: ['studio', 'tasks'] });
    } catch { fail(); }
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
              <DropdownMenuTrigger asChild><Button><Plus />{t('auto.new')}</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {TRIGGERS.map((tr) => (
                  <DropdownMenuItem key={tr} onSelect={() => void create(tr)} className="gap-2 py-2.5"><Zap className="h-4 w-4 text-primary" />{t(`auto.triggers.${tr}`)}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />

        {isPending && !autos.length ? (
          <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="h-[28rem] animate-pulse rounded-[1.5rem] bg-card" />
            <div className="h-[28rem] animate-pulse rounded-[1.5rem] bg-card" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
            {/* Rules */}
            <aside className="ec-glass h-fit overflow-hidden rounded-[1.5rem] border border-border/60 lg:sticky lg:top-24">
              <ul className="max-h-[70vh] divide-y divide-border/50 overflow-y-auto">
                {autos.map((a) => {
                  const Icon = ACTION_ICON[a.actions[0]?.type || 'task'];
                  const on = selected?.id === a.id;
                  return (
                    <li key={a.id} className={cn('relative flex items-center gap-3 px-4 py-3.5 transition-colors', on ? 'bg-primary/[.07]' : 'hover:bg-muted/40')}>
                      {on && <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-primary" />}
                      <button type="button" onClick={() => setSelectedId(a.id)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', ACTION_TONE[a.actions[0]?.type || 'task'])}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{nameOf(a)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.runs ? t('auto.runs', { count: a.runs }) : t('auto.never')} · {a.actions.length} {t('auto.then').toLowerCase()}
                          </span>
                        </span>
                      </button>
                      <Switch checked={a.enabled} onCheckedChange={(v) => toggle(a, v)} aria-label={a.enabled ? t('auto.on') : t('auto.off')} />
                    </li>
                  );
                })}
              </ul>
            </aside>

            {/* Flow */}
            {selected && (
              <section className="overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/40">
                <div
                  className="relative min-h-[30rem] px-4 py-8 sm:px-8"
                  style={{ backgroundImage: 'radial-gradient(hsl(var(--muted-foreground) / .22) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
                >
                  <div className="mx-auto flex max-w-md flex-col items-center">
                    <TriggerNode a={selected} onConfig={(config) => patch(selected.id, { config }, 600)} />
                    {selected.actions.map((act, i) => (
                      <React.Fragment key={i}>
                        <Connector onAdd={(type) => patch(selected.id, { actions: insertAt(selected.actions, i, type, t) })} />
                        <ActionNode
                          act={act}
                          onChange={(next) => patch(selected.id, { actions: selected.actions.map((x, j) => (j === i ? next : x)) }, 600)}
                          onRemove={() => patch(selected.id, { actions: selected.actions.filter((_, j) => j !== i) })}
                          onDuplicate={() => patch(selected.id, { actions: [...selected.actions.slice(0, i + 1), { ...act }, ...selected.actions.slice(i + 1)] })}
                        />
                      </React.Fragment>
                    ))}
                    <Connector last onAdd={(type) => patch(selected.id, { actions: insertAt(selected.actions, selected.actions.length, type, t) })} />
                  </div>
                </div>

                {test && test.id === selected.id && (
                  <div className="border-t border-border/60 bg-background/60 px-5 py-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <b>{test.data.matches ? t('auto.matches', { count: test.data.matches }) : t('auto.noMatches')}</b>
                      <span className="text-xs text-muted-foreground">{t('auto.previewNote')}</span>
                    </div>
                    <ul className="space-y-2">
                      {test.data.preview.map((p) => (
                        <li key={p.client_id} className="rounded-xl border border-border/50 bg-card/70 p-3 text-sm">
                          <b className="block">{p.name}</b>
                          {p.actions.filter((x) => x.text).map((x, k) => (
                            <span key={k} className="mt-1 flex gap-2 text-muted-foreground"><span className="shrink-0">{t(`auto.actions.${x.type}`)}:</span><span className="text-foreground">{x.text}</span></span>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Bar */}
                <div className="flex flex-wrap items-center gap-3 border-t border-border/60 bg-background/70 px-4 py-3 backdrop-blur">
                  <Switch checked={selected.enabled} onCheckedChange={(v) => toggle(selected, v)} />
                  <Input
                    value={nameOf(selected)}
                    onChange={(e) => patch(selected.id, { name: e.target.value }, 700)}
                    aria-label={t('auto.name')}
                    className="h-9 min-w-0 flex-1 basis-48 font-semibold"
                  />
                  <span className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex">
                    <span className={cn('h-2 w-2 rounded-full', selected.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />{t('auto.liveNote')}
                  </span>
                  <div className="ms-auto flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(selected)}><Trash2 />{t('auto.delete')}</Button>
                    <Button variant="secondary" size="sm" onClick={() => void runNow(selected)}><Play />{t('auto.runNow')}</Button>
                    <Button size="sm" onClick={() => void runTest(selected)} disabled={testing}><FlaskConical />{testing ? t('auto.testing') : t('auto.test')}</Button>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

function insertAt(list: AutomationAction[], i: number, type: AutomationActionType, t: (k: string) => string): AutomationAction[] {
  const fresh: AutomationAction =
    type === 'task' ? { type, title: '{name}', priority: 'normal' }
      : type === 'webhook' ? { type, url: 'https://' }
        : type === 'notify_client' || type === 'notify_coach' ? { type, title: t(`auto.actions.${type}`), text: '' }
          : { type, text: '' };
  return [...list.slice(0, i), fresh, ...list.slice(i)];
}

const Node: React.FC<{ tone: string; icon: React.ElementType; title: React.ReactNode; tools?: React.ReactNode; children?: React.ReactNode; accent?: boolean }> = ({ tone, icon: Icon, title, tools, children, accent }) => (
  <div className={cn('group relative w-full rounded-2xl border bg-card shadow-[0_10px_30px_-18px_rgba(0,0,0,.45)] transition-shadow hover:shadow-[0_16px_40px_-18px_rgba(0,0,0,.55)]', accent ? 'border-primary/40' : 'border-border/70')}>
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

const ActionNode: React.FC<{ act: AutomationAction; onChange: (a: AutomationAction) => void; onRemove: () => void; onDuplicate: () => void }> = ({ act, onChange, onRemove, onDuplicate }) => {
  const { t } = useTranslation();
  const Icon = ACTION_ICON[act.type];
  const tools = (
    <span className="flex gap-1 opacity-60 transition-opacity group-hover:opacity-100">
      <button type="button" onClick={onDuplicate} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-muted" aria-label="duplicate"><Copy className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={onRemove} className="grid h-7 w-7 place-items-center rounded-lg text-destructive hover:bg-destructive/10" aria-label={t('auto.delete')}><Trash2 className="h-3.5 w-3.5" /></button>
    </span>
  );
  return (
    <Node tone={ACTION_TONE[act.type]} icon={Icon} title={t(`auto.actions.${act.type}`)} tools={tools}>
      <p className="text-xs text-muted-foreground">{t(`auto.actionHelp.${act.type}`)}</p>
      {(act.type === 'task' || act.type === 'notify_client' || act.type === 'notify_coach') && (
        <Input value={act.title || ''} onChange={(e) => onChange({ ...act, title: e.target.value })} placeholder={t('auto.f.title')} dir="auto" />
      )}
      {(act.type === 'chat' || act.type === 'notify_client' || act.type === 'notify_coach') && (
        <Textarea value={act.text || ''} onChange={(e) => onChange({ ...act, text: e.target.value })} placeholder={t('auto.f.text')} rows={3} dir="auto" />
      )}
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
      {act.type !== 'webhook' && <p className="text-[11px] text-muted-foreground/80">{t('auto.vars')}</p>}
    </Node>
  );
};

const Connector: React.FC<{ onAdd: (t: AutomationActionType) => void; last?: boolean }> = ({ onAdd, last }) => {
  const { t } = useTranslation();
  return (
    <div className="relative flex h-14 flex-col items-center">
      <span className={cn('w-px flex-1 bg-gradient-to-b from-primary/60 to-border', last && 'max-h-4')} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('auto.addAction')} className="z-[1] grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-all hover:scale-110 hover:border-primary hover:text-primary">
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
      {!last && <span className="w-px flex-1 bg-border" />}
    </div>
  );
};

export default AutomationsPage;
