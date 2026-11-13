import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, MessageSquare, Flag, Send } from 'lucide-react';
import Layout from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { studioApi, type QaPriority, type QaStatus, type QaTicket } from '@/lib/studioApi';
import { cn } from '@/lib/utils';

const STATUSES: QaStatus[] = ['new', 'in_progress', 'done', 'cancelled'];
const PRIORITIES: QaPriority[] = ['low', 'normal', 'high'];
const STATUS_TONE: Record<QaStatus, string> = {
  new: 'bg-primary text-primary-foreground',
  in_progress: 'bg-[hsl(var(--gold)/.18)] text-[hsl(var(--gold))]',
  done: 'bg-success/15 text-success',
  cancelled: 'bg-muted text-muted-foreground',
};
const PRIORITY_DOT: Record<QaPriority, string> = { low: 'bg-muted-foreground/50', normal: 'bg-[hsl(var(--gold))]', high: 'bg-destructive' };

const QaPage = () => {
  const { t, i18n } = useTranslation();
  const [tickets, setTickets] = useState<QaTicket[]>([]);
  const [filter, setFilter] = useState<QaStatus | 'all'>('all');
  const [selected, setSelected] = useState<QaTicket | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', page: '', priority: 'normal' as QaPriority });
  const [comment, setComment] = useState('');

  const load = () => studioApi.tickets().then(setTickets).catch(() => setTickets([]));
  useEffect(() => {
    load();
  }, []);

  const open = async (id: number) => setSelected(await studioApi.ticket(id));
  const patch = async (data: Partial<QaTicket>) => {
    if (!selected) return;
    const t2 = await studioApi.updateTicket(selected.id, data);
    setSelected(t2);
    setTickets((ts) => ts.map((x) => (x.id === t2.id ? { ...x, ...t2 } : x)));
  };

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString(i18n.language?.startsWith('he') ? 'he-IL' : i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  const visible = tickets.filter((x) => filter === 'all' || x.status === filter);

  return (
    <Layout currentPage="qa">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-10">
        <PageHeader
          eyebrow={t('studio.groupStudio')}
          title={t('studio.qa.title')}
          description={t('studio.qa.subtitle')}
          actions={<Button onClick={() => setCreating(true)}><Plus />{t('studio.qa.new')}</Button>}
        />

        <div className="mb-6 flex flex-wrap gap-2">
          {(['all', ...STATUSES] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={cn('flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-300', filter === s ? 'border-transparent bg-foreground text-background' : 'border-border/70 bg-card/60 text-muted-foreground hover:text-foreground')}>
              {s === 'all' ? t('studio.qa.all') : t(`studio.qa.status.${s}`)}
              <span className={cn('rounded-full px-1.5 text-xs', filter === s ? 'bg-background/20' : 'bg-muted')}>{s === 'all' ? tickets.length : tickets.filter((x) => x.status === s).length}</span>
            </button>
          ))}
        </div>

        {/* Board: one column per status on desktop */}
        {tickets.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border py-20 text-center text-lg text-muted-foreground">{t('studio.qa.empty')}</div>
        ) : (
          <div className={cn('grid gap-4', filter === 'all' ? 'md:grid-cols-2 xl:grid-cols-4' : '')}>
            {(filter === 'all' ? STATUSES : [filter]).map((col) => (
              <div key={col} className="rounded-[1.5rem] bg-muted/30 p-3">
                <p className="mb-3 flex items-center justify-between px-2 text-sm font-bold">
                  {t(`studio.qa.status.${col}`)}
                  <span className="text-muted-foreground">{visible.filter((x) => x.status === col).length}</span>
                </p>
                <div className="ec-stagger space-y-2">
                  {visible.filter((x) => x.status === col).map((x) => (
                    <button key={x.id} onClick={() => open(x.id)} className="ec-card block w-full rounded-[1.1rem] border border-border/60 bg-card p-4 text-start transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40">
                      <span className="flex items-start gap-2">
                        <span className={cn('mt-1.5 h-2 w-2 flex-none rounded-full', PRIORITY_DOT[x.priority])} />
                        <span className="font-semibold leading-snug">{x.title}</span>
                      </span>
                      <span className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="truncate" dir="auto">{x.page || '—'}</span>
                        <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{x.comment_count}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-display text-4xl font-bold">{t('studio.qa.new')}</DialogTitle></DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!form.title.trim()) return;
              await studioApi.createTicket(form);
              setForm({ title: '', body: '', page: '', priority: 'normal' });
              setCreating(false);
              load();
            }}
          >
            <Input required placeholder={t('studio.qa.titleField')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input placeholder={t('studio.qa.pagePh')} value={form.page} onChange={(e) => setForm({ ...form, page: e.target.value })} />
            <Textarea rows={4} placeholder={t('studio.qa.bodyPh')} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <button type="button" key={p} onClick={() => setForm({ ...form, priority: p })} className={cn('flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all', form.priority === p ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>
                  <span className={cn('h-2 w-2 rounded-full', PRIORITY_DOT[p])} />{t(`studio.qa.priorities.${p}`)}
                </button>
              ))}
            </div>
            <Button type="submit" className="w-full"><Flag />{t('studio.qa.create')}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <p className="text-xs text-muted-foreground">#{selected.id} · {fmt(selected.created_at)}</p>
                <DialogTitle className="font-display text-4xl font-bold leading-none">{selected.title}</DialogTitle>
              </DialogHeader>
              {selected.page && <p className="text-sm text-muted-foreground" dir="auto">{t('studio.qa.page')}: {selected.page}</p>}
              {selected.body && <p className="whitespace-pre-wrap rounded-2xl bg-muted/50 p-4">{selected.body}</p>}
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button key={s} onClick={() => patch({ status: s })} className={cn('rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all', selected.status === s ? STATUS_TONE[s] : 'bg-muted/60 text-muted-foreground hover:text-foreground')}>{t(`studio.qa.status.${s}`)}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map((p) => (
                  <button key={p} onClick={() => patch({ priority: p })} className={cn('flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold', selected.priority === p ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>
                    <span className={cn('h-2 w-2 rounded-full', PRIORITY_DOT[p])} />{t(`studio.qa.priorities.${p}`)}
                  </button>
                ))}
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">{t('studio.qa.comments')}</p>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {(selected.comments || []).map((c) => (
                    <div key={c.id} className="rounded-2xl bg-muted/50 px-4 py-2.5 text-sm">
                      <p className="text-xs text-muted-foreground">{c.author} · {fmt(c.created_at)}</p>
                      <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  ))}
                </div>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!comment.trim()) return;
                    setSelected(await studioApi.commentTicket(selected.id, comment));
                    setComment('');
                    load();
                  }}
                >
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('studio.qa.commentPh')} />
                  <Button type="submit" size="icon" aria-label={t('studio.qa.comment')}><Send /></Button>
                </form>
              </div>
              <Button
                variant="ghost"
                className="justify-self-start text-destructive"
                onClick={async () => {
                  if (!window.confirm(t('studio.qa.deleteConfirm'))) return;
                  await studioApi.deleteTicket(selected.id);
                  setSelected(null);
                  load();
                }}
              >
                <Trash2 />{t('studio.qa.delete')}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default QaPage;
