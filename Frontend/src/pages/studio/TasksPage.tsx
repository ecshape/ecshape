/**
 * Studio -> Tasks. The coach's inbox: tasks created by automations ("Dana hasn't trained for 5 days", a WhatsApp
 * message ready to send) and by hand. QA #122 made it a real work surface: today's progress ring, live counters,
 * quick add, due dates, grouping by priority or date, source filter, inline edit, one-tap WhatsApp for automation
 * messages, and a small burst when a task is done. Every change is optimistic — the row moves at once.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock, CalendarDays, Check, Flame, Inbox, ListChecks, MessageCircle, Pencil, Plus, RotateCcw, Search, Trash2, User, Zap,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { StudioHeader } from '@/components/studio/StudioHeader';
import { Burst, useBurst } from '@/components/studio/Burst';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PortalSelect } from '@/components/ui/portal-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CountUp, Ring } from '@/features/trainee/ui';
import { useToast } from '@/hooks/use-toast';
import { tempId } from '@/lib/optimistic';
import { automationsApi, type CoachTask, type TaskPriority } from '@/lib/studioApi';
import { useTrainerClients } from '@/features/trainer/hooks';
import { parseDate } from '@/features/trainee/format';
import { cn } from '@/lib/utils';
import '@/i18n/automations';
import '@/styles/automations.css';

type View = 'open' | 'done' | 'all';
type Source = 'all' | 'auto' | 'manual';
type Group = 'priority' | 'due';
const KEY = ['studio', 'tasks', 'all'] as const;
const ORDER: TaskPriority[] = ['urgent', 'high', 'normal', 'low'];
const DOT: Record<TaskPriority, string> = { urgent: 'bg-red-500', high: 'bg-orange-500', normal: 'bg-sky-500', low: 'bg-muted-foreground/60' };
const EDGE: Record<TaskPriority, string> = { urgent: 'before:bg-red-500', high: 'before:bg-orange-500', normal: 'before:bg-sky-500/70', low: 'before:bg-border' };
const WA = /https:\/\/wa\.me\/\S+/;

const dayStart = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const DAY = 86_400_000;
type DueKind = 'overdue' | 'today' | 'tomorrow' | 'later' | 'none';
function dueKind(iso?: string | null): DueKind {
  const d = iso ? parseDate(iso) : null;
  if (!d) return 'none';
  const t0 = dayStart().getTime();
  const t = dayStart(d).getTime();
  if (t < t0) return 'overdue';
  if (t === t0) return 'today';
  if (t === t0 + DAY) return 'tomorrow';
  return 'later';
}
/** Local yyyy-mm-dd <-> ISO at 09:00 local time. */
const toInput = (iso?: string | null) => { const d = iso ? parseDate(iso) : null; return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''; };
const fromInput = (v: string) => (v ? new Date(`${v}T09:00:00`).toISOString() : null);

const TasksPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('open');
  const [source, setSource] = useState<Source>('all');
  const [group, setGroup] = useState<Group>('priority');
  const [q, setQ] = useState('');
  const [quick, setQuick] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CoachTask | null>(null);
  const [ringBurst, fireRing] = useBurst();
  const { data: tasks = [], isPending } = useQuery({ queryKey: KEY, queryFn: () => automationsApi.tasks('all'), refetchInterval: 60_000 });
  const clients = useTrainerClients().data || [];
  const fail = () => toast({ title: t('common.error'), variant: 'destructive' });

  const locale = i18n.language?.startsWith('he') ? 'he-IL' : i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const when = (iso?: string | null) => {
    const d = iso ? parseDate(iso) : null;
    return d ? d.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  const dueLabel = (iso?: string | null) => {
    const k = dueKind(iso);
    if (k === 'none') return '';
    if (k === 'today') return t('tasks.dueToday');
    if (k === 'tomorrow') return t('tasks.dueTomorrow');
    const d = parseDate(iso!)!;
    return (k === 'overdue' ? `${t('tasks.overdue')} · ` : '') + d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  };

  // Counters + today's progress
  const open = tasks.filter((x) => x.status === 'open');
  const t0 = dayStart().getTime();
  const doneToday = tasks.filter((x) => x.status !== 'open' && x.done_at && (parseDate(x.done_at)?.getTime() ?? 0) >= t0).length;
  const doneWeek = tasks.filter((x) => x.status !== 'open' && x.done_at && (parseDate(x.done_at)?.getTime() ?? 0) >= t0 - 6 * DAY).length;
  const dueToday = open.filter((x) => ['today', 'overdue'].includes(dueKind(x.due_at))).length;
  const urgent = open.filter((x) => x.priority === 'urgent').length;
  const progress = doneToday + open.length ? doneToday / (doneToday + open.length) : 1;

  const visible = useMemo(() => {
    const n = q.trim().toLowerCase();
    return tasks
      .filter((x) => view === 'all' || (view === 'open' ? x.status === 'open' : x.status !== 'open'))
      .filter((x) => source === 'all' || (source === 'auto' ? !!x.automation_id : !x.automation_id))
      .filter((x) => !n || [x.title, x.client_name, x.body].some((v) => (v || '').toLowerCase().includes(n)));
  }, [tasks, q, view, source]);

  const groups = useMemo(() => {
    if (group === 'priority') return ORDER.map((p) => ({ key: p, label: t(`tasks.priority.${p}`), dot: DOT[p], items: visible.filter((x) => x.priority === p) })).filter((g) => g.items.length);
    const kinds: DueKind[] = ['overdue', 'today', 'tomorrow', 'later', 'none'];
    const label: Record<DueKind, string> = { overdue: t('tasks.overdue'), today: t('tasks.dueToday'), tomorrow: t('tasks.dueTomorrow'), later: t('tasks.later'), none: t('tasks.noDue') };
    const dot: Record<DueKind, string> = { overdue: 'bg-red-500', today: 'bg-primary', tomorrow: 'bg-amber-500', later: 'bg-sky-500', none: 'bg-muted-foreground/50' };
    return kinds.map((k) => ({ key: k, label: label[k], dot: dot[k], items: visible.filter((x) => dueKind(x.due_at) === k).sort((a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority)) })).filter((g) => g.items.length);
  }, [visible, group, t]);

  /* ---- mutations (optimistic on the single "all" list) */
  const local = (fn: (ls: CoachTask[]) => CoachTask[]) => qc.setQueryData<CoachTask[]>(KEY, (ls) => fn(ls || []));
  const update = (task: CoachTask, data: Partial<CoachTask>) => {
    const prev = qc.getQueryData<CoachTask[]>(KEY);
    local((ls) => ls.map((x) => (x.id === task.id ? { ...x, ...data } : x)));
    automationsApi.updateTask(task.id, data)
      .then((made) => { local((ls) => ls.map((x) => (x.id === task.id ? made : x))); qc.invalidateQueries({ queryKey: ['trainer', 'overview'] }); })
      .catch(() => { qc.setQueryData(KEY, prev); fail(); });
  };
  const setStatus = (task: CoachTask, status: CoachTask['status']) => {
    update(task, { status, done_at: status === 'open' ? null : new Date().toISOString() });
    if (status === 'done') fireRing();
  };
  const remove = (task: CoachTask) => {
    const prev = qc.getQueryData<CoachTask[]>(KEY);
    local((ls) => ls.filter((x) => x.id !== task.id));
    automationsApi.deleteTask(task.id).catch(() => { qc.setQueryData(KEY, prev); fail(); });
  };
  const add = (data: { title: string; body?: string; client_id?: number | null; priority: TaskPriority; due_at?: string | null }) => {
    const tid = tempId();
    const client = clients.find((c) => c.id === data.client_id);
    local((ls) => [{ id: tid, kind: 'manual', status: 'open', created_at: new Date().toISOString(), client_name: client?.full_name, ...data }, ...ls]);
    automationsApi.createTask(data)
      .then((made) => local((ls) => ls.map((x) => (x.id === tid ? made : x))))
      .catch(() => { local((ls) => ls.filter((x) => x.id !== tid)); fail(); });
    setView('open');
  };
  const quickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const title = quick.trim();
    if (!title) return;
    add({ title, priority: 'normal' });
    setQuick('');
  };

  const tiles = [
    { icon: ListChecks, label: t('tasks.stats.open'), value: open.length, tone: 'text-primary bg-primary/12' },
    { icon: Flame, label: t('tasks.stats.urgent'), value: urgent, tone: 'text-red-500 bg-red-500/12' },
    { icon: AlarmClock, label: t('tasks.stats.today'), value: dueToday, tone: 'text-amber-500 bg-amber-500/12' },
    { icon: Check, label: t('tasks.stats.doneWeek'), value: doneWeek, tone: 'text-success bg-success/12' },
  ];

  return (
    <Layout currentPage="tasks">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:py-10">
        <StudioHeader
          eyebrow={t('studio.groupBusiness')}
          title={t('tasks.title')}
          lead={t('tasks.lead')}
          actions={
            <>
              <Button variant="secondary" onClick={() => navigate('/studio/automations')}><Zap />{t('tasks.automations')}</Button>
              <Button onClick={() => setAdding(true)} data-testid="task-new"><Plus />{t('tasks.add')}</Button>
            </>
          }
        />

        {/* Today */}
        <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
          <div className="tp-card tp-card--hero flex items-center gap-5 p-5">
            <Burst k={ringBurst}>
              <Ring value={progress} size={104} stroke={10}>
                <span className="text-center" dir="ltr"><span className="font-num block text-3xl leading-none"><CountUp value={Math.round(progress * 100)} />%</span></span>
              </Ring>
            </Burst>
            <div className="min-w-0">
              <p className="tp-label">{t('tasks.progress')}</p>
              <p className="mt-1 text-lg font-bold leading-snug">{open.length ? t('tasks.progressText', { done: doneToday, total: doneToday + open.length }) : t('tasks.allDone')}</p>
            </div>
          </div>
          <div className="ec-stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map(({ icon: Icon, label, value, tone }) => (
              <div key={label} className="tp-card flex flex-col justify-between gap-3 p-4">
                <span className={cn('grid h-9 w-9 place-items-center rounded-xl', tone)}><Icon className="h-4 w-4" /></span>
                <span><span className="font-num block text-[2rem] leading-none" dir="ltr"><CountUp value={value} /></span><span className="mt-1 block text-xs text-muted-foreground">{label}</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick add + search */}
        <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_16rem]">
          <form onSubmit={quickAdd} className="relative">
            <Plus className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={t('tasks.quickPh')} className="ps-11" aria-label={t('tasks.add')} data-testid="task-quick" />
          </form>
          <div className="relative">
            <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('tasks.search')} className="ps-11" />
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {(['open', 'done', 'all'] as const).map((v) => {
            const n = v === 'open' ? open.length : v === 'done' ? tasks.length - open.length : tasks.length;
            return (
              <button
                key={v} type="button" onClick={() => setView(v)}
                className={cn('rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                  view === v ? 'border-transparent bg-foreground text-background' : 'border-border/70 bg-card/60 text-muted-foreground hover:text-foreground')}
              >
                {t(`tasks.${v}`)}<span className={cn('ms-2 rounded-full px-1.5 text-xs', view === v ? 'bg-background/20' : 'bg-muted')}>{n}</span>
              </button>
            );
          })}
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <PortalSelect
            value={source} onChange={(v) => setSource(v as Source)} label={t('tasks.filterAll')}
            options={[{ value: 'all', label: t('tasks.filterAll') }, { value: 'auto', label: t('tasks.filterAuto') }, { value: 'manual', label: t('tasks.filterManual') }]}
          />
          <div className="ms-auto inline-flex rounded-full bg-muted/60 p-0.5 text-xs font-semibold" role="radiogroup" aria-label={t('tasks.groupBy')}>
            {(['priority', 'due'] as const).map((g) => (
              <button key={g} type="button" role="radio" aria-checked={group === g} onClick={() => setGroup(g)}
                className={cn('rounded-full px-3 py-1.5 transition-colors', group === g ? 'bg-foreground text-background' : 'text-muted-foreground')}>
                {g === 'priority' ? t('tasks.byPriority') : t('tasks.byDue')}
              </button>
            ))}
          </div>
        </div>

        {isPending && !tasks.length ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 ec-skel rounded-2xl bg-card" />)}</div>
        ) : !visible.length ? (
          <div className="ec-enter flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-border px-6 py-16 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-3xl bg-success/12 text-success"><Inbox className="h-8 w-8" /></span>
            <p className="text-lg font-bold">{t('tasks.empty')}</p>
            <Button variant="secondary" size="sm" onClick={() => navigate('/studio/automations')}><Zap />{t('tasks.automations')}</Button>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((g) => (
              <section key={g.key}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <span className={cn('h-2.5 w-2.5 rounded-full', g.dot)} />{g.label}
                  <span className="text-muted-foreground">{g.items.length}</span>
                </h2>
                <ul className="ec-stagger space-y-2">
                  {g.items.map((x) => (
                    <TaskRow
                      key={x.id} task={x} dueLabel={dueLabel(x.due_at)} due={dueKind(x.due_at)} created={when(x.created_at)}
                      onToggle={() => setStatus(x, x.status === 'open' ? 'done' : 'open')}
                      onPriority={(p) => update(x, { priority: p })}
                      onEdit={() => setEditing(x)}
                      onRemove={() => remove(x)}
                      onProfile={() => navigate(`/client/${x.client_id}`)}
                      onChat={() => navigate(`/chat?clientId=${x.client_id}`)}
                      onWhatsapp={() => { if (x.status === 'open') setStatus(x, 'done'); }}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <TaskDialog
        open={adding || !!editing} task={editing} clients={clients}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSave={(data) => {
          if (editing) update(editing, data); else add(data);
          setAdding(false); setEditing(null);
        }}
      />
    </Layout>
  );
};

const TaskRow: React.FC<{
  task: CoachTask; dueLabel: string; due: DueKind; created: string;
  onToggle: () => void; onPriority: (p: TaskPriority) => void; onEdit: () => void; onRemove: () => void;
  onProfile: () => void; onChat: () => void; onWhatsapp: () => void;
}> = ({ task: x, dueLabel, due, created, onToggle, onPriority, onEdit, onRemove, onProfile, onChat, onWhatsapp }) => {
  const { t } = useTranslation();
  const [burst, fire] = useBurst();
  const open = x.status === 'open';
  const wa = x.body?.match(WA)?.[0];
  const body = wa ? x.body!.replace(WA, '').trim() : x.body;
  const initials = (x.client_name || '').split(' ').map((s) => s[0]).join('').slice(0, 2);
  return (
    <li className={cn('group relative flex items-start gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-4 ps-5 transition-[opacity,border-color] hover:border-border',
      'before:absolute before:inset-y-3 before:start-0 before:w-1 before:rounded-full', EDGE[x.priority], !open && 'opacity-60')}>
      <Burst k={burst}>
        <button
          type="button" onClick={() => { if (open) fire(); onToggle(); }}
          aria-label={open ? t('tasks.markDone') : t('tasks.reopen')}
          className={cn('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
            open ? 'border-border hover:border-success hover:bg-success/10' : 'ec-bump border-success bg-success text-white')}
        >
          {!open && <Check className="h-3.5 w-3.5" />}
        </button>
      </Burst>
      <div className="min-w-0 flex-1">
        <b className={cn('block', !open && 'line-through')} dir="auto">{x.title}</b>
        {body && <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground" dir="auto">{body}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {x.client_name && (
            <button type="button" onClick={onProfile} className="inline-flex items-center gap-1.5 font-semibold text-foreground/80 hover:text-primary">
              {x.client_avatar ? <img src={x.client_avatar} alt="" className="h-5 w-5 rounded-full object-cover" /> : <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">{initials}</span>}
              <span dir="auto">{x.client_name}</span>
            </button>
          )}
          {dueLabel && (
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold', due === 'overdue' && open ? 'bg-red-500/12 text-red-500' : due === 'today' ? 'bg-primary/12 text-primary' : 'bg-muted')}>
              <CalendarDays className="h-3 w-3" />{dueLabel}
            </span>
          )}
          <span className="inline-flex items-center gap-1">{x.automation_id ? <><Zap className="h-3 w-3" />{t('tasks.fromAutomation')}</> : t('tasks.manual')}</span>
          <span>{created}</span>
        </div>
        {wa && open && (
          <a href={wa} target="_blank" rel="noopener noreferrer" onClick={onWhatsapp}
            className="tp-press mt-2.5 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-3.5 py-1.5 text-sm font-bold text-white shadow-sm hover:brightness-110">
            <WhatsAppIcon className="h-4 w-4" />{t('tasks.openWhatsapp')}
          </a>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t('auto.f.priority')}><span className={cn('h-2.5 w-2.5 rounded-full', DOT[x.priority])} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ORDER.map((p) => (
              <DropdownMenuItem key={p} onSelect={() => onPriority(p)} className="gap-2"><span className={cn('h-2.5 w-2.5 rounded-full', DOT[p])} />{t(`tasks.priority.${p}`)}{x.priority === p && <Check className="ms-auto h-3.5 w-3.5" />}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {x.client_id && (
          <>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onProfile} aria-label={t('tasks.openProfile')}><User /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onChat} aria-label={t('tasks.openChat')}><MessageCircle /></Button>
          </>
        )}
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} aria-label={t('tasks.edit')}><Pencil /></Button>
        {!open && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onToggle} aria-label={t('tasks.reopen')}><RotateCcw /></Button>}
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onRemove} aria-label={t('tasks.delete')}><Trash2 /></Button>
      </div>
    </li>
  );
};

const TaskDialog: React.FC<{
  open: boolean; task: CoachTask | null; clients: { id: number; full_name: string }[]; onClose: () => void;
  onSave: (d: { title: string; body?: string; client_id?: number | null; priority: TaskPriority; due_at?: string | null }) => void;
}> = ({ open, task, clients, onClose, onSave }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [client, setClient] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [due, setDue] = useState('');
  const key = task?.id ?? 'new';
  useEffect(() => {
    if (!open) return;
    setTitle(task?.title || ''); setBody(task?.body || ''); setClient(task?.client_id ? String(task.client_id) : '');
    setPriority(task?.priority || 'normal'); setDue(toInput(task?.due_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), body: body.trim() || undefined, ...(task ? {} : { client_id: client ? Number(client) : null }), priority, due_at: fromInput(due) });
  };
  const today = toInput(new Date().toISOString());
  const tomorrow = toInput(new Date(Date.now() + DAY).toISOString());
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{task ? t('tasks.edit') : t('tasks.add')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('tasks.titlePh')} dir="auto" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('tasks.bodyPh')} rows={3} dir="auto" />
          {!task && (
            <PortalSelect
              value={client} onChange={setClient} label={t('tasks.client')} className="w-full justify-between"
              options={[{ value: '', label: t('tasks.noClient') }, ...clients.map((c) => ({ value: String(c.id), label: c.full_name }))]}
            />
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="me-1 text-xs font-bold text-muted-foreground">{t('tasks.due')}</span>
            {[{ v: '', l: t('tasks.noDue') }, { v: today, l: t('tasks.dueToday') }, { v: tomorrow, l: t('tasks.dueTomorrow') }].map((o) => (
              <button key={o.l} type="button" onClick={() => setDue(o.v)}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold', due === o.v ? 'border-transparent bg-foreground text-background' : 'border-border/70 text-muted-foreground')}>{o.l}</button>
            ))}
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} dir="ltr" aria-label={t('tasks.due')}
              className="h-8 rounded-full border border-border/70 bg-transparent px-3 text-xs" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ORDER.map((p) => (
              <button
                key={p} type="button" onClick={() => setPriority(p)}
                className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold', priority === p ? 'border-transparent bg-foreground text-background' : 'border-border/70 text-muted-foreground')}
              ><span className={cn('h-2 w-2 rounded-full', DOT[p])} />{t(`tasks.priority.${p}`)}</button>
            ))}
          </div>
          <Button type="submit" className="w-full" disabled={!title.trim()}>{task ? t('tasks.saveEdit') : t('tasks.save')}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TasksPage;
