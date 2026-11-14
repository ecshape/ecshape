import React, { useEffect, useMemo, useState } from 'react';
import { parseDate } from '@/features/trainee/format';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check, CheckCheck, ChevronDown, Crosshair, ExternalLink, Flag, GripVertical, KanbanSquare, List, MessageSquare, MousePointerClick, Plus, RotateCcw, Search, Send, Trash2, X,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { StudioHeader } from '@/components/studio/StudioHeader';
import { AgentDraft } from '@/components/studio/AgentDraft';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { InfoTip } from '@/components/ui/info-tip';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { studioApi, type QaPriority, type QaStatus, type QaTicket } from '@/lib/studioApi';
import { AGENT_CHANGED_EVENT, AGENT_OPEN_FORM_EVENT } from '@/lib/agentOps';
import { QA_SPOTLIGHT_KEY } from '@/components/studio/QaCaptureWidget';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import '@/i18n/ticketsStudio';

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

type Tab = 'open' | 'all' | QaStatus;
type Sort = 'newest' | 'oldest' | 'priority' | 'author' | 'updated';
type Area = 'site' | 'studio' | 'trainer' | 'trainee' | 'blog' | 'other';
const TABS: Tab[] = ['open', 'all', ...STATUSES];
const AREAS: Area[] = ['site', 'studio', 'trainer', 'trainee', 'blog', 'other'];
const VIEW_KEY = 'ec-qa-view';

const inTab = (tab: Tab, s: QaStatus) => (tab === 'all' ? true : tab === 'open' ? s === 'new' || s === 'in_progress' : s === tab);

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

/** Which part of the product a ticket is about, from its page. */
function areaOf(page?: string | null): Area {
  const p = pathOf(page).split('?')[0];
  if (!p) return 'other';
  if (p === '/' || /^\/(home|site)(\/|$)/.test(p)) return 'site';
  if (p.startsWith('/blog')) return 'blog';
  if (p.startsWith('/studio')) return 'studio';
  if (/^\/(client|trainee|my-|workout-session|progress)/.test(p)) return 'trainee';
  if (/^\/(trainer|clients?|exercise|meal|create|edit|chat|food)/.test(p)) return 'trainer';
  return 'other';
}

function readView(): 'board' | 'list' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board';
  } catch {
    return 'board';
  }
}

const QaPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<QaTicket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('open');
  const [prio, setPrio] = useState<QaPriority | 'all'>('all');
  const [area, setArea] = useState<Area | 'all'>('all');
  const [author, setAuthor] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [mine, setMine] = useState(false);
  const [view, setViewState] = useState<'board' | 'list'>(readView);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<QaTicket | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', page: '', priority: 'normal' as QaPriority });
  const [comment, setComment] = useState('');
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<QaStatus | null>(null);
  const [params, setParams] = useSearchParams();

  const setView = (v: 'board' | 'list') => {
    setViewState(v);
    setPicked(new Set());
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode */
    }
  };

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

  // Escape closes the sheet; the page behind does not scroll while it is open
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [selected]);

  const open = async (id: number) => {
    setComment('');
    setSelected(await studioApi.ticket(id));
  };
  const closeSheet = () => {
    setSelected(null);
    if (params.get('ticket')) {
      params.delete('ticket');
      setParams(params, { replace: true });
    }
  };
  const patch = async (id: number, data: Partial<QaTicket>) => {
    setTickets((ts) => ts.map((x) => (x.id === id ? { ...x, ...data } : x)));
    const t2 = await studioApi.updateTicket(id, data);
    setTickets((ts) => ts.map((x) => (x.id === t2.id ? { ...x, ...t2 } : x)));
    setSelected((s) => (s && s.id === id ? { ...s, ...t2 } : s));
  };
  const bulk = async (status: QaStatus) => {
    const ids = [...picked];
    setPicked(new Set());
    setTickets((ts) => ts.map((x) => (ids.includes(x.id) ? { ...x, status } : x)));
    await Promise.allSettled(ids.map((id) => studioApi.updateTicket(id, { status })));
    load();
  };

  const locale = i18n.language?.startsWith('he') ? 'he-IL' : i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const fmt = (iso?: string | null) => (iso ? (parseDate(iso) ?? new Date(NaN)).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const ago = (iso?: string | null) => {
    if (!iso) return '';
    const mins = Math.max(1, Math.round((Date.now() - (parseDate(iso)?.getTime() ?? Date.now())) / 60000)); // UTC-aware (r2 R4)
    const base = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
    // Hebrew short forms append "(1)" / "(2)": drop it (r2 R3)
    const rtf = { format: (v: number, u: Intl.RelativeTimeFormatUnit) => base.format(v, u).replace(/\s*\(\d+\)\s*$/, '') };
    if (mins < 60) return rtf.format(-mins, 'minute');
    if (mins < 60 * 24) return rtf.format(-Math.round(mins / 60), 'hour');
    return rtf.format(-Math.round(mins / 1440), 'day');
  };

  const authors = useMemo(() => [...new Set(tickets.map((x) => x.author).filter(Boolean) as string[])].sort(), [tickets]);
  const areasPresent = useMemo(() => AREAS.filter((a) => tickets.some((x) => areaOf(x.page) === a)), [tickets]);

  // Every filter except the status tab (the tabs show counts within the other filters)
  const pool = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tickets
      .filter((x) => prio === 'all' || x.priority === prio)
      .filter((x) => area === 'all' || areaOf(x.page) === area)
      .filter((x) => author === 'all' || x.author === author)
      .filter((x) => !mine || (!!user && x.created_by === user.id))
      .filter((x) => !needle || [x.title, x.body, x.page, x.author, `#${x.id}`].some((v) => (v || '').toLowerCase().includes(needle)));
  }, [tickets, q, prio, area, author, mine, user]);

  const counts = useMemo(() => {
    const c = {} as Record<Tab, number>;
    TABS.forEach((tb) => (c[tb] = pool.filter((x) => inTab(tb, x.status)).length));
    return c;
  }, [pool]);

  const visible = useMemo(() => {
    const list = pool.filter((x) => inTab(tab, x.status));
    const by = (a: QaTicket, b: QaTicket) => {
      switch (sort) {
        case 'oldest':
          return (a.created_at || '').localeCompare(b.created_at || '');
        case 'priority':
          return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (b.created_at || '').localeCompare(a.created_at || '');
        case 'author':
          return (a.author || '').localeCompare(b.author || '') || (b.created_at || '').localeCompare(a.created_at || '');
        case 'updated':
          return (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '');
        default:
          return (b.created_at || '').localeCompare(a.created_at || '');
      }
    };
    return [...list].sort(by);
  }, [pool, tab, sort]);

  const filtered = q.trim() !== '' || prio !== 'all' || area !== 'all' || author !== 'all' || mine;
  const resetFilters = () => {
    setQ('');
    setPrio('all');
    setArea('all');
    setAuthor('all');
    setMine(false);
  };

  const showOnPage = (url?: string | null, selector?: string) => {
    if (selector) sessionStorage.setItem(QA_SPOTLIGHT_KEY, selector);
    const path = pathOf(url);
    if (path.startsWith('/')) navigate(path);
    else if (path) window.open(path, '_blank', 'noopener');
  };

  const sel = selected ? parseBody(selected.body) : null;
  const columns = STATUSES.filter((s) => inTab(tab, s));
  const togglePick = (id: number) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const meta = (x: QaTicket) => (
    <span className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
      {parseBody(x.body).element && <Crosshair className="h-3.5 w-3.5 flex-none text-primary" />}
      <span className="min-w-0 flex-1 truncate" dir="ltr" style={{ textAlign: 'start' }}>{pathOf(x.page) || '—'}</span>
      <span className="flex flex-none items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{x.comment_count}</span>
      <span className="flex-none">{ago(x.created_at)}</span>
    </span>
  );
  const chip = (on: boolean) =>
    cn('flex flex-none items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-all duration-300', on ? 'border-transparent bg-foreground text-background' : 'border-border/70 bg-card/60 text-muted-foreground hover:text-foreground');

  return (
    <Layout currentPage="qa">
      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 md:py-10">
        <StudioHeader
          eyebrow={t('studio.groupStudio')}
          title={t('studio.qa.title')}
          lead={t('studio.qa.subtitle')}
          actions={<Button onClick={() => setCreating(true)}><Plus />{t('studio.qa.new')}</Button>}
        />

        {/* How to report: the floating button + tester guide */}
        <details className="group mb-6 rounded-2xl border border-dashed border-border/70 text-sm text-muted-foreground">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-foreground text-background"><MousePointerClick className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">{t('studio.qa.hint')}</span>
            <span className="flex w-full items-center justify-end gap-1 font-semibold text-foreground sm:w-auto">
              {t('tix.qa.guideTitle')}
              <ChevronDown className="h-4 w-4 transition-transform duration-300 group-open:rotate-180 motion-reduce:transition-none" />
            </span>
          </summary>
          <div className="grid gap-4 border-t border-dashed border-border/70 px-4 py-4 sm:grid-cols-2">
            <p className="sm:col-span-2">{t('tix.qa.guideTip')}</p>
            {(['guideGood', 'guideChecks'] as const).map((k) => (
              <div key={k}>
                <p className="mb-1.5 font-bold text-foreground">{t(`tix.qa.${k}`)}</p>
                <ul className="list-disc space-y-1 ps-5">
                  {(t(`tix.qa.${k === 'guideGood' ? 'guideGoodItems' : 'guideCheckItems'}`, { returnObjects: true }) as string[]).map((li) => <li key={li}>{li}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </details>

        {/* Status tabs with counts */}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label={t('studio.qa.title')}>
          {TABS.map((tb) => (
            <button key={tb} role="tab" aria-selected={tab === tb} onClick={() => { setTab(tb); setPicked(new Set()); }} className={cn(chip(tab === tb), 'px-3.5 py-2')}>
              {tb !== 'open' && tb !== 'all' && <span className="h-2 w-2 rounded-full" style={{ background: STATUS_ACCENT[tb] }} />}
              {tb === 'open' || tb === 'all' ? t(`tix.qa.tabs.${tb}`) : t(`studio.qa.status.${tb}`)}
              <span className={cn('rounded-full px-1.5 text-xs', tab === tb ? 'bg-background/20' : 'bg-muted')}>{counts[tb]}</span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('studio.qa.search')} className="ps-10" aria-label={t('studio.qa.search')} />
          </div>
          {(['all', ...PRIORITIES] as const).map((p) => (
            <button key={p} onClick={() => setPrio(p)} className={chip(prio === p)}>
              {p !== 'all' && <span className={cn('h-2 w-2 rounded-full', PRIORITY_DOT[p])} />}
              {p === 'all' ? t('studio.qa.allPriorities') : t(`studio.qa.priorities.${p}`)}
            </button>
          ))}
          <Select value={area} onValueChange={(v) => setArea(v as Area | 'all')}>
            <SelectTrigger className="!h-9 !w-auto min-w-[9rem] gap-2 !rounded-full bg-card/60" aria-label={t('tix.qa.area')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('tix.qa.allAreas')}</SelectItem>
              {(areasPresent.length ? areasPresent : AREAS).map((a) => <SelectItem key={a} value={a}>{t(`tix.qa.areas.${a}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          {authors.length > 1 && (
            <Select value={author} onValueChange={setAuthor}>
              <SelectTrigger className="!h-9 !w-auto min-w-[9rem] gap-2 !rounded-full bg-card/60" aria-label={t('tix.qa.author')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tix.qa.allAuthors')}</SelectItem>
                {authors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <button onClick={() => setMine((m) => !m)} aria-pressed={mine} className={chip(mine)}>
            <UserAvatar name={user?.full_name} src={user?.avatar_url} className="h-5 w-5 bg-primary text-[9px] text-primary-foreground" />
            {t('tix.qa.mine')}
          </button>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="!h-9 !w-auto min-w-[9rem] gap-2 !rounded-full bg-card/60" aria-label={t('tix.qa.sort')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {(['newest', 'oldest', 'priority', 'updated', 'author'] as Sort[]).map((s) => (
                <SelectItem key={s} value={s}>{t(`tix.qa.sort${s.charAt(0).toUpperCase()}${s.slice(1)}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtered && <Button variant="ghost" size="sm" onClick={resetFilters}><RotateCcw />{t('tix.qa.reset')}</Button>}
          <InfoTip>{t('tix.qa.filterTip')}</InfoTip>
          <div className="ms-auto flex items-center rounded-full border border-border/70 bg-card/60 p-1" role="group" aria-label={t('tix.qa.viewLabel')}>
            {(['board', 'list'] as const).map((v) => {
              const Icon = v === 'board' ? KanbanSquare : List;
              return (
                <button key={v} onClick={() => setView(v)} aria-pressed={view === v} aria-label={t(`tix.qa.${v}`)} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-all duration-300', view === v ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{t(`tix.qa.${v}`)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {view === 'board' ? (
          /* Board: drag a card to another column to change its status */
          <div data-ec-board="qa" className={cn('grid gap-4', columns.length > 2 ? 'md:grid-cols-2 xl:grid-cols-4' : columns.length === 2 ? 'md:grid-cols-2' : '')}>
            {columns.map((col) => {
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
                          className={cn('ec-qa-card group block w-full rounded-[1.1rem] border border-border/60 bg-card p-3.5 text-start transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 motion-reduce:hover:translate-y-0', dragId === x.id && 'opacity-40')}
                        >
                          <span className="flex items-start gap-2">
                            <span className={cn('mt-1.5 h-2 w-2 flex-none rounded-full', PRIORITY_DOT[x.priority])} title={t(`studio.qa.priorities.${x.priority}`)} />
                            <span className="min-w-0 flex-1 font-semibold leading-snug">{x.title}</span>
                            <GripVertical className="h-4 w-4 flex-none text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
                          </span>
                          {parsed.element?.content && <span className="mt-2 line-clamp-2 block rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">“{parsed.element.content}”</span>}
                          <span className="mt-2.5 flex items-center gap-2">
                            {x.author && <UserAvatar name={x.author} src={x.author_avatar} className="h-5 w-5 bg-muted text-[9px] text-muted-foreground" />}
                            {meta(x)}
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
        ) : loaded && visible.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
            <p>{t('tix.qa.noResults')}</p>
            {filtered && <Button variant="link" onClick={resetFilters}>{t('tix.qa.reset')}</Button>}
          </div>
        ) : (
          /* List: dense rows, multi-select for bulk status changes */
          <div className="overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/40">
            <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 text-xs font-semibold text-muted-foreground">
              <Checkbox
                checked={picked.size > 0 && picked.size === visible.length ? true : picked.size > 0 ? 'indeterminate' : false}
                onCheckedChange={(c) => setPicked(c ? new Set(visible.map((x) => x.id)) : new Set())}
                aria-label={t('tix.qa.selectAll')}
              />
              <span>{picked.size ? t('tix.qa.selected', { count: picked.size }) : t('tix.qa.results', { count: visible.length })}</span>
            </div>
            <ul className="divide-y divide-border/50">
              {visible.map((x) => (
                <li key={x.id} data-qa-id={x.id} className={cn('flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30', picked.has(x.id) && 'bg-primary/[.05]')}>
                  <Checkbox checked={picked.has(x.id)} onCheckedChange={() => togglePick(x.id)} aria-label={`#${x.id} ${x.title}`} />
                  <button onClick={() => open(x.id)} className="flex min-w-0 flex-1 flex-col gap-1 text-start sm:flex-row sm:items-center sm:gap-4">
                    <span className="flex min-w-0 items-center gap-2 sm:w-[44%]">
                      <span className={cn('h-2 w-2 flex-none rounded-full', PRIORITY_DOT[x.priority])} title={t(`studio.qa.priorities.${x.priority}`)} />
                      <span className="flex-none text-xs text-muted-foreground">#{x.id}</span>
                      <span className="truncate font-semibold">{x.title}</span>
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="flex flex-none items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-xs font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_ACCENT[x.status] }} />
                        {t(`studio.qa.status.${x.status}`)}
                      </span>
                      {x.author && <UserAvatar name={x.author} src={x.author_avatar} className="h-5 w-5 flex-none bg-muted text-[9px] text-muted-foreground" />}
                      {meta(x)}
                    </span>
                  </button>
                  {x.status !== 'done' && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-none" onClick={() => patch(x.id, { status: 'done' })} aria-label={t('tix.qa.markDone')} title={t('tix.qa.markDone')}>
                      <Check />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Bulk actions bar */}
      {picked.size > 0 && view === 'list' &&
        createPortal(
          <div className="ec-qa-bulk" role="toolbar" aria-label={t('tix.qa.selected', { count: picked.size })}>
            <span className="px-1 font-semibold">{t('tix.qa.selected', { count: picked.size })}</span>
            <Button size="sm" onClick={() => bulk('done')}><CheckCheck />{t('tix.qa.markDone')}</Button>
            <Button size="sm" variant="secondary" onClick={() => bulk('in_progress')}>{t('tix.qa.markInProgress')}</Button>
            <Button size="sm" variant="ghost" onClick={() => bulk('cancelled')}>{t('tix.qa.markCancelled')}</Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPicked(new Set())} aria-label={t('tix.qa.clearSelection')}><X /></Button>
          </div>,
          document.body,
        )}

      {/* Create */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="ec-page-title !text-4xl">{t('studio.qa.new')}</DialogTitle></DialogHeader>
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
            <Input placeholder={t('studio.qa.pagePh')} value={form.page} onChange={(e) => setForm({ ...form, page: e.target.value })} dir="ltr" />
            <AgentDraft kind="qa" field="body" extra={{ title: form.title, page: form.page, priority: form.priority }} value={form.body} onChange={(v) => setForm((f) => ({ ...f, body: v }))}>
              <Textarea rows={4} placeholder={t('studio.qa.bodyPh')} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} dir="auto" />
            </AgentDraft>
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

      {/* Detail sheet (#24): portalled to <body> so no transformed ancestor can pull it down the page.
          Side sheet from the inline-end edge on desktop (full height), bottom sheet on phones. */}
      {selected && sel &&
        createPortal(
          <div className="ec-qa-sheet-backdrop" onClick={closeSheet}>
            <aside className="ec-qa-sheet" role="dialog" aria-modal="true" aria-labelledby="ec-qa-sheet-title" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur">
                <span className="ec-qa-sheet-grip" aria-hidden />
                <div className="flex items-start gap-3 p-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      {selected.author && <UserAvatar name={selected.author} src={selected.author_avatar} className="h-5 w-5 bg-muted text-[9px]" />}
                      <span>#{selected.id} · {fmt(selected.created_at)}{selected.author ? ` · ${selected.author}` : ''}</span>
                    </p>
                    <h2 id="ec-qa-sheet-title" className="ec-page-title mt-1 break-words !text-4xl">{selected.title}</h2>
                  </div>
                  <Button variant="ghost" size="icon" onClick={closeSheet} aria-label={t('tix.common.close')} autoFocus><X /></Button>
                </div>
              </div>

              <div className="space-y-6 p-5 pb-10">
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
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed" dir="auto">{sel.note}</p>
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
                      <div key={c.id} className="flex gap-2.5">
                        <UserAvatar name={c.author} src={c.author_avatar} className="mt-0.5 h-7 w-7 bg-muted text-[10px] text-muted-foreground" />
                        <div className="min-w-0 flex-1 rounded-2xl bg-muted/50 px-4 py-2.5 text-sm">
                          <p className="text-xs text-muted-foreground">{c.author} · {fmt(c.created_at)}</p>
                          <p className="mt-0.5 whitespace-pre-wrap" dir="auto">{c.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!comment.trim()) return;
                      setSelected(await studioApi.commentTicket(selected.id, comment));
                      setComment('');
                      load();
                    }}
                  >
                    <AgentDraft kind="qa" field="comment" contextId={selected.id} value={comment} onChange={setComment}>
                      <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('studio.qa.commentPh')} aria-label={t('tix.qa.commentLabel')} dir="auto" />
                    </AgentDraft>
                    <div className="flex justify-end">
                      <Button type="submit" size="sm" disabled={!comment.trim()}><Send />{t('studio.qa.comment')}</Button>
                    </div>
                  </form>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ms-auto text-destructive"
                    onClick={async () => {
                      if (!window.confirm(t('studio.qa.deleteConfirm'))) return;
                      await studioApi.deleteTicket(selected.id);
                      closeSheet();
                      load();
                    }}
                  >
                    <Trash2 />{t('studio.qa.delete')}
                  </Button>
                </div>
              </div>
            </aside>
          </div>,
          document.body,
        )}
    </Layout>
  );
};

export default QaPage;
