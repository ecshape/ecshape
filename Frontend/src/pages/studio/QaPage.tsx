import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Crosshair, ExternalLink, Flag, GripVertical, MessageSquare, MousePointerClick, Plus, Search, Send, Trash2, X } from 'lucide-react';
import Layout from '@/components/Layout';
import { StudioHeader } from '@/components/studio/StudioHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { studioApi, type QaPriority, type QaStatus, type QaTicket } from '@/lib/studioApi';
import { AGENT_CHANGED_EVENT, AGENT_OPEN_FORM_EVENT, askAgent } from '@/lib/agentOps';
import { QA_SPOTLIGHT_KEY } from '@/components/studio/QaCaptureWidget';
import { cn } from '@/lib/utils';

const STATUSES: QaStatus[] = ['new', 'in_progress', 'done', 'cancelled'];
const PRIORITIES: QaPriority[] = ['low', 'normal', 'high'];
const STATUS_ACCENT: Record<QaStatus, string> = {
  new: 'hsl(var(--primary))',
  in_progress: 'hsl(var(--gold))',
  done: 'hsl(var(--success))',
  cancelled: 'hsl(var(--muted-foreground))',
};
const PRIORITY_DOT: Record<QaPriority, string> = { low: 'bg-muted-foreground/50', normal: 'bg-[hsl(var(--gold))]', high: 'bg-destructive' };
const PRIORITY_RANK: Record<QaPriority, number> = { high: 0, normal: 1, low: 2 };

/** Tickets captured with the QA button carry structured lines; turn them back into fields. */
function parseBody(body?: string | null) {
  if (!body) return { note: '', element: null as null | { target?: string; type?: string; content?: string; selector?: string; url?: string } };
  const lines = body.split('\n');
  const pick = (k: string) => lines.find((l) => l.startsWith(`${k}: `))?.slice(k.length + 2);
  const selector = pick('Selector');
  if (!selector) return { note: body, element: null };
  const idx = lines.findIndex((l) => l.trim() === 'Requested change:');
  const note = idx >= 0 ? lines.slice(idx + 1).join('\n').trim() : '';
  return {
    note: note === '(to be specified)' ? '' : note,
    element: { target: pick('Target'), type: pick('Type'), content: pick('Content')?.replace(/^“|”$/g, ''), selector, url: pick('Page') },
  };
}

const pathOf = (url?: string | null) => {
  if (!url) return '';
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search : url;
  } catch {
    return url;
  }
};

const QaPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<QaTicket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [prio, setPrio] = useState<QaPriority | 'all'>('all');
  const [selected, setSelected] = useState<QaTicket | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', page: '', priority: 'normal' as QaPriority });
  const [comment, setComment] = useState('');
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<QaStatus | null>(null);
  const [params, setParams] = useSearchParams();

  const load = () => studioApi.tickets().then(setTickets).catch(() => setTickets([])).finally(() => setLoaded(true));

  useEffect(() => {
    load();
    const onChanged = () => load();
    const onForm = (e: Event) => { if ((e as CustomEvent).detail?.form === 'qa_ticket') setCreating(true); };
    window.addEventListener(AGENT_CHANGED_EVENT, onChanged);
    window.addEventListener(AGENT_OPEN_FORM_EVENT, onForm);
    return () => {
      window.removeEventListener(AGENT_CHANGED_EVENT, onChanged);
      window.removeEventListener(AGENT_OPEN_FORM_EVENT, onForm);
    };
  }, []);

  // Agent EC opens the form with ?new=qa_ticket; a ticket link opens with ?ticket=ID
  useEffect(() => {
    if (params.get('new') === 'qa_ticket') {
      setCreating(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
    const tid = Number(params.get('ticket'));
    if (tid) open(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const open = async (id: number) => setSelected(await studioApi.ticket(id));
  const patch = async (id: number, data: Partial<QaTicket>) => {
    setTickets((ts) => ts.map((x) => (x.id === id ? { ...x, ...data } : x)));
    const t2 = await studioApi.updateTicket(id, data);
    setTickets((ts) => ts.map((x) => (x.id === t2.id ? { ...x, ...t2 } : x)));
    if (selected?.id === id) setSelected((s) => (s ? { ...s, ...t2 } : s));
  };

  const locale = i18n.language?.startsWith('he') ? 'he-IL' : i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const ago = (iso?: string | null) => {
    if (!iso) return '';
    const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
    if (mins < 60) return rtf.format(-mins, 'minute');
    if (mins < 60 * 24) return rtf.format(-Math.round(mins / 60), 'hour');
    return rtf.format(-Math.round(mins / 1440), 'day');
  };

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tickets
      .filter((x) => prio === 'all' || x.priority === prio)
      .filter((x) => !needle || [x.title, x.body, x.page].some((v) => (v || '').toLowerCase().includes(needle)))
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (b.created_at || '').localeCompare(a.created_at || ''));
  }, [tickets, q, prio]);

  const showOnPage = (url?: string | null, selector?: string) => {
    if (selector) sessionStorage.setItem(QA_SPOTLIGHT_KEY, selector);
    const path = pathOf(url);
    if (path.startsWith('/')) navigate(path);
    else if (path) window.open(path, '_blank', 'noopener');
  };

  const sel = selected ? parseBody(selected.body) : null;

  return (
    <Layout currentPage="qa">
      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 md:py-10">
        <StudioHeader
          eyebrow={t('studio.groupStudio')}
          title={t('studio.qa.title')}
          lead={t('studio.qa.subtitle')}
          actions={<Button onClick={() => setCreating(true)}><Plus />{t('studio.qa.new')}</Button>}
        />

        {/* How to report: the floating button */}
        <div className="ec-qa-hint mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border/70 px-4 py-3 text-sm text-muted-foreground">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background"><MousePointerClick className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">{t('studio.qa.hint')}</span>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('studio.qa.search')} className="ps-10" />
          </div>
          {(['all', ...PRIORITIES] as const).map((p) => (
            <button key={p} onClick={() => setPrio(p)} className={cn('flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-all duration-300', prio === p ? 'border-transparent bg-foreground text-background' : 'border-border/70 bg-card/60 text-muted-foreground hover:text-foreground')}>
              {p !== 'all' && <span className={cn('h-2 w-2 rounded-full', PRIORITY_DOT[p])} />}
              {p === 'all' ? t('studio.qa.allPriorities') : t(`studio.qa.priorities.${p}`)}
            </button>
          ))}
        </div>

        {/* Board: drag a card to another column to change its status */}
        <div data-ec-board="qa" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((col) => {
            const items = visible.filter((x) => x.status === col);
            return (
              <section
                key={col}
                onDragOver={(e) => { if (dragId !== null) { e.preventDefault(); setOverCol(col); } }}
                onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = dragId;
                  setDragId(null);
                  setOverCol(null);
                  if (id !== null && tickets.find((x) => x.id === id)?.status !== col) patch(id, { status: col });
                }}
                className={cn('ec-qa-col flex min-h-[220px] flex-col rounded-[1.5rem] bg-muted/30 p-3 transition-all duration-300', overCol === col && 'is-over')}
                style={{ ['--col' as string]: STATUS_ACCENT[col] }}
              >
                <p className="mb-3 flex items-center gap-2 px-2 text-sm font-bold">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_ACCENT[col] }} />
                  {t(`studio.qa.status.${col}`)}
                  <span className="ms-auto rounded-full bg-background/60 px-2 text-xs text-muted-foreground">{items.length}</span>
                </p>
                <div className="ec-stagger flex-1 space-y-2">
                  {items.map((x) => {
                    const parsed = parseBody(x.body);
                    return (
                      <button
                        key={x.id}
                        data-qa-id={x.id}
                        draggable
                        onDragStart={(e) => { setDragId(x.id); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragEnd={() => { setDragId(null); setOverCol(null); }}
                        onClick={() => open(x.id)}
                        className={cn('ec-qa-card group block w-full rounded-[1.1rem] border border-border/60 bg-card p-3.5 text-start transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40', dragId === x.id && 'opacity-40')}
                      >
                        <span className="flex items-start gap-2">
                          <span className={cn('mt-1.5 h-2 w-2 flex-none rounded-full', PRIORITY_DOT[x.priority])} title={t(`studio.qa.priorities.${x.priority}`)} />
                          <span className="min-w-0 flex-1 font-semibold leading-snug">{x.title}</span>
                          <GripVertical className="h-4 w-4 flex-none text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
                        </span>
                        {parsed.element?.content && <span className="mt-2 line-clamp-2 block rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">“{parsed.element.content}”</span>}
                        <span className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {parsed.element && <Crosshair className="h-3.5 w-3.5 text-primary" />}
                          <span className="min-w-0 flex-1 truncate" dir="ltr" style={{ textAlign: 'start' }}>{pathOf(x.page) || '—'}</span>
                          <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{x.comment_count}</span>
                          <span>{ago(x.created_at)}</span>
                        </span>
                      </button>
                    );
                  })}
                  {items.length === 0 && loaded && <p className="px-2 py-6 text-center text-xs text-muted-foreground/70">{dragId !== null ? t('studio.qa.dropHere') : t('studio.qa.emptyCol')}</p>}
                </div>
              </section>
            );
          })}
        </div>
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

      {/* Detail: side sheet */}
      {selected && sel && (
        <div className="ec-qa-sheet-backdrop fixed inset-0 z-[2147483001] bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <aside className="ec-qa-sheet absolute inset-y-0 end-0 flex w-full max-w-xl flex-col overflow-y-auto bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-border/60 bg-background/95 p-5 backdrop-blur">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">#{selected.id} · {fmt(selected.created_at)}{selected.author ? ` · ${selected.author}` : ''}</p>
                <h2 className="font-display mt-1 text-4xl leading-none">{selected.title}</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelected(null)} aria-label={t('common.close', 'Close')}><X /></Button>
            </div>

            <div className="space-y-6 p-5">
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button key={s} onClick={() => patch(selected.id, { status: s })} className={cn('flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all duration-300', selected.status === s ? 'bg-foreground text-background' : 'bg-muted/60 text-muted-foreground hover:text-foreground')}>
                    <span className="h-2 w-2 rounded-full" style={{ background: STATUS_ACCENT[s] }} />
                    {t(`studio.qa.status.${s}`)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{t('studio.qa.priority')}</span>
                {PRIORITIES.map((p) => (
                  <button key={p} onClick={() => patch(selected.id, { priority: p })} className={cn('flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-all', selected.priority === p ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>
                    <span className={cn('h-2 w-2 rounded-full', PRIORITY_DOT[p])} />{t(`studio.qa.priorities.${p}`)}
                  </button>
                ))}
              </div>

              {sel.note && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('studio.qa.request')}</p>
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{sel.note}</p>
                </div>
              )}

              {sel.element && (
                <div className="ec-qa-element rounded-2xl border border-primary/30 bg-primary/[.05] p-4">
                  <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary"><Crosshair className="h-4 w-4" />{t('studio.qa.element')}</p>
                  {sel.element.content && <p className="text-[15px]">“{sel.element.content}”</p>}
                  <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground" dir="ltr" style={{ textAlign: 'start' }}>{sel.element.selector}</p>
                  <Button size="sm" className="mt-3" onClick={() => showOnPage(sel.element?.url || selected.page, sel.element?.selector)}>
                    <ExternalLink />{t('studio.qa.showOnPage')}
                  </Button>
                </div>
              )}

              {!sel.element && selected.page && (
                <Button variant="outline" size="sm" onClick={() => showOnPage(selected.page)}>
                  <ExternalLink />{t('studio.qa.page')}: <span dir="ltr">{pathOf(selected.page)}</span>
                </Button>
              )}

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('studio.qa.comments')}</p>
                <div className="space-y-2">
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

              <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                <Button variant="outline" size="sm" onClick={() => askAgent(`${t('studio.qa.askAgent')}: #${selected.id} ${selected.title}`)}>
                  {t('studio.qa.askAgent')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ms-auto text-destructive"
                  onClick={async () => {
                    if (!window.confirm(t('studio.qa.deleteConfirm'))) return;
                    await studioApi.deleteTicket(selected.id);
                    setSelected(null);
                    load();
                  }}
                >
                  <Trash2 />{t('studio.qa.delete')}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </Layout>
  );
};

export default QaPage;
