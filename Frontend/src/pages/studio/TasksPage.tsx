/**
 * Studio -> Tasks. The coach's inbox: tasks created by automations ("Dana hasn't trained for 5 days") and by hand,
 * grouped by urgency. Done / reopen / delete are optimistic — the row moves at once, the server follows.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, Inbox, MessageCircle, Plus, RotateCcw, Search, Trash2, User, Zap } from 'lucide-react';
import Layout from '@/components/Layout';
import { StudioHeader } from '@/components/studio/StudioHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PortalSelect } from '@/components/ui/portal-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { optimisticQuery, tempId } from '@/lib/optimistic';
import { automationsApi, type CoachTask, type TaskPriority } from '@/lib/studioApi';
import { useTrainerClients } from '@/features/trainer/hooks';
import { parseDate } from '@/features/trainee/format';
import { cn } from '@/lib/utils';
import '@/i18n/automations';

type View = 'open' | 'done' | 'all';
const tasksKey = (v: View) => ['studio', 'tasks', v] as const;
const ORDER: TaskPriority[] = ['urgent', 'high', 'normal', 'low'];
const DOT: Record<TaskPriority, string> = { urgent: 'bg-red-500', high: 'bg-orange-500', normal: 'bg-sky-500', low: 'bg-muted-foreground/60' };

const TasksPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('open');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const key = tasksKey(view);
  const { data: tasks = [], isPending } = useQuery({ queryKey: key, queryFn: () => automationsApi.tasks(view), refetchInterval: 60_000 });
  const clients = useTrainerClients().data || [];
  const fail = () => toast({ title: t('common.error'), variant: 'destructive' });

  const visible = useMemo(() => {
    const n = q.trim().toLowerCase();
    return tasks.filter((x) => !n || [x.title, x.client_name, x.body].some((v) => (v || '').toLowerCase().includes(n)));
  }, [tasks, q]);
  const groups = ORDER.map((p) => ({ p, items: visible.filter((x) => x.priority === p) })).filter((g) => g.items.length);

  const setStatus = (task: CoachTask, status: CoachTask['status']) => {
    const leaves = view !== 'all' && view !== status;
    void optimisticQuery<CoachTask[], CoachTask>(qc, key,
      (ls) => (leaves ? ls?.filter((x) => x.id !== task.id) : ls?.map((x) => (x.id === task.id ? { ...x, status } : x))),
      () => automationsApi.updateTask(task.id, { status }), fail)
      .then(() => { qc.invalidateQueries({ queryKey: ['studio', 'tasks'] }); qc.invalidateQueries({ queryKey: ['trainer', 'overview'] }); });
  };
  const remove = (task: CoachTask) =>
    void optimisticQuery<CoachTask[], void>(qc, key, (ls) => ls?.filter((x) => x.id !== task.id), () => automationsApi.deleteTask(task.id), fail);

  const locale = i18n.language?.startsWith('he') ? 'he-IL' : i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const when = (iso?: string | null) => {
    const d = iso ? parseDate(iso) : null;
    return d ? d.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };

  return (
    <Layout currentPage="tasks">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:py-10">
        <StudioHeader
          eyebrow={t('studio.groupBusiness')}
          title={t('tasks.title')}
          lead={t('tasks.lead')}
          actions={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('tasks.search')} className="ps-11" />
              </div>
              <Button onClick={() => setAdding(true)}><Plus />{t('tasks.add')}</Button>
            </div>
          }
        />

        <div className="mb-6 flex flex-wrap gap-2">
          {(['open', 'done', 'all'] as const).map((v) => (
            <button
              key={v} type="button" onClick={() => setView(v)}
              className={cn('rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-300',
                view === v ? 'border-transparent bg-foreground text-background' : 'border-border/70 bg-card/60 text-muted-foreground hover:text-foreground')}
            >
              {t(`tasks.${v}`)}{view === v && <span className="ms-2 rounded-full bg-background/20 px-1.5 text-xs">{tasks.length}</span>}
            </button>
          ))}
        </div>

        {isPending && !tasks.length ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />)}</div>
        ) : !visible.length ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-border py-20 text-center text-muted-foreground">
            <Inbox className="h-10 w-10" /><p>{t('tasks.empty')}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((g) => (
              <section key={g.p}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <span className={cn('h-2.5 w-2.5 rounded-full', DOT[g.p])} />{t(`tasks.priority.${g.p}`)}
                  <span className="text-muted-foreground">{g.items.length}</span>
                </h2>
                <ul className="ec-stagger space-y-2">
                  {g.items.map((x) => (
                    <li key={x.id} className={cn('group flex items-start gap-3 rounded-2xl border border-border/60 bg-card/70 p-4 transition-all', x.status !== 'open' && 'opacity-60')}>
                      <button
                        type="button" onClick={() => setStatus(x, x.status === 'open' ? 'done' : 'open')}
                        aria-label={x.status === 'open' ? t('tasks.markDone') : t('tasks.reopen')}
                        className={cn('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-all',
                          x.status === 'open' ? 'border-border hover:border-emerald-500 hover:bg-emerald-500/10' : 'border-emerald-500 bg-emerald-500 text-white')}
                      >
                        {x.status !== 'open' && <Check className="h-3.5 w-3.5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <b className={cn('block', x.status !== 'open' && 'line-through')} dir="auto">{x.title}</b>
                        {x.body && <p className="mt-0.5 text-sm text-muted-foreground" dir="auto">{x.body}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {x.client_name && <span className="font-semibold text-foreground/80">{x.client_name}</span>}
                          <span className="inline-flex items-center gap-1">{x.automation_id ? <><Zap className="h-3 w-3" />{t('tasks.fromAutomation')}</> : t('tasks.manual')}</span>
                          <span>{when(x.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                        {x.client_id && (
                          <>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate(`/client/${x.client_id}`)} aria-label={t('tasks.openProfile')}><User /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate(`/chat?clientId=${x.client_id}`)} aria-label={t('tasks.openChat')}><MessageCircle /></Button>
                          </>
                        )}
                        {x.status === 'open'
                          ? <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500" onClick={() => setStatus(x, 'done')} aria-label={t('tasks.markDone')}><CheckCircle2 /></Button>
                          : <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setStatus(x, 'open')} aria-label={t('tasks.reopen')}><RotateCcw /></Button>}
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(x)} aria-label={t('tasks.delete')}><Trash2 /></Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <AddTask
        open={adding} onClose={() => setAdding(false)} clients={clients}
        onAdd={(data) => {
          setAdding(false);
          const tid = tempId();
          const client = clients.find((c) => c.id === data.client_id);
          const local: CoachTask = { id: tid, kind: 'manual', status: 'open', created_at: new Date().toISOString(), client_name: client?.full_name, ...data };
          const openKey = tasksKey('open');
          qc.setQueryData<CoachTask[]>(openKey, (ls) => [local, ...(ls || [])]);
          automationsApi.createTask(data)
            .then((made) => qc.setQueryData<CoachTask[]>(openKey, (ls) => ls?.map((x) => (x.id === tid ? made : x))))
            .catch(() => { qc.setQueryData<CoachTask[]>(openKey, (ls) => ls?.filter((x) => x.id !== tid)); fail(); });
          setView('open');
        }}
      />
    </Layout>
  );
};

const AddTask: React.FC<{
  open: boolean; onClose: () => void; clients: { id: number; full_name: string }[];
  onAdd: (d: { title: string; body?: string; client_id?: number | null; priority: TaskPriority }) => void;
}> = ({ open, onClose, clients, onAdd }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [client, setClient] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), body: body.trim() || undefined, client_id: client ? Number(client) : null, priority });
    setTitle(''); setBody(''); setClient(''); setPriority('normal');
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{t('tasks.add')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('tasks.titlePh')} dir="auto" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('tasks.bodyPh')} rows={3} dir="auto" />
          <PortalSelect
            value={client} onChange={setClient} label={t('tasks.client')} className="w-full justify-between"
            options={[{ value: '', label: t('tasks.noClient') }, ...clients.map((c) => ({ value: String(c.id), label: c.full_name }))]}
          />
          <div className="flex flex-wrap gap-1.5">
            {ORDER.map((p) => (
              <button
                key={p} type="button" onClick={() => setPriority(p)}
                className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold', priority === p ? 'border-transparent bg-foreground text-background' : 'border-border/70 text-muted-foreground')}
              ><span className={cn('h-2 w-2 rounded-full', DOT[p])} />{t(`tasks.priority.${p}`)}</button>
            ))}
          </div>
          <Button type="submit" className="w-full" disabled={!title.trim()}>{t('tasks.save')}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TasksPage;
