import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Phone, Mail, MessageCircle, Trash2, UserPlus, Sparkles, Inbox, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AGENT_CHANGED_EVENT, AGENT_OPEN_FORM_EVENT, askAgent } from '@/lib/agentOps';
import Layout from '@/components/Layout';
import { StudioHeader } from '@/components/studio/StudioHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { studioApi, type Lead, type LeadStatus } from '@/lib/studioApi';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { DEFAULT_CONTENT, toSiteLang } from '@/site/content';

const STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'converted', 'lost'];
const STATUS_TONE: Record<LeadStatus, string> = {
  new: 'bg-primary text-primary-foreground',
  contacted: 'bg-[hsl(var(--gold)/.18)] text-[hsl(var(--gold))]',
  qualified: 'bg-sky-500/15 text-sky-400',
  converted: 'bg-success/15 text-success',
  lost: 'bg-muted text-muted-foreground',
};

const formatDate = (iso?: string | null, lng = 'he') => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(lng === 'he' ? 'he-IL' : lng === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const ProspectsPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '', email: '', message: '' });

  const load = () =>
    studioApi
      .leads()
      .then((l) => {
        setLeads(l);
        if (selectedId === null && l.length) setSelectedId(l[0].id);
      })
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const onChanged = () => load();
    const onForm = (e: Event) => { if ((e as CustomEvent).detail?.form === 'prospect') setCreating(true); };
    window.addEventListener(AGENT_CHANGED_EVENT, onChanged);
    window.addEventListener(AGENT_OPEN_FORM_EVENT, onForm);
    return () => {
      window.removeEventListener(AGENT_CHANGED_EVENT, onChanged);
      window.removeEventListener(AGENT_OPEN_FORM_EVENT, onForm);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agent EC opens the form with ?new=prospect
  useEffect(() => {
    if (params.get('new') === 'prospect') {
      setCreating(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const create = async () => {
    if (!draft.name.trim()) return;
    const lead = await studioApi.createLead({ ...draft, source: 'studio' });
    setLeads((ls) => [lead, ...ls]);
    setSelectedId(lead.id);
    setCreating(false);
    setDraft({ name: '', phone: '', email: '', message: '' });
    toast({ title: t('studio.prospects.saved') });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length };
    STATUSES.forEach((s) => (c[s] = leads.filter((l) => l.status === s).length));
    return c;
  }, [leads]);

  const visible = leads.filter((l) => {
    if (filter !== 'all' && l.status !== filter) return false;
    if (!q) return true;
    const needle = q.toLowerCase();
    return [l.name, l.phone, l.email].some((v) => (v || '').toLowerCase().includes(needle));
  });
  const selected = leads.find((l) => l.id === selectedId) || null;

  useEffect(() => {
    setNotes(selected?.notes || '');
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = async (id: number, data: Partial<Lead>, quiet = false) => {
    const updated = await studioApi.updateLead(id, data);
    setLeads((ls) => ls.map((l) => (l.id === id ? updated : l)));
    if (!quiet) toast({ title: t('studio.prospects.saved') });
  };

  const remove = async (id: number) => {
    if (!window.confirm(t('studio.prospects.deleteConfirm'))) return;
    await studioApi.deleteLead(id);
    setLeads((ls) => ls.filter((l) => l.id !== id));
    setSelectedId(null);
  };

  // Goal / program labels come from the site form, in the current language
  const formLabels = DEFAULT_CONTENT[toSiteLang(i18n.language)].form;
  const label = (group: 'goals' | 'programs', value?: string | null) =>
    (value && formLabels[group].find((o) => o.value === value)?.label) || value || '—';

  const waHref = (l: Lead) => (l.phone ? `https://wa.me/${l.phone.replace(/[^\d]/g, '').replace(/^0/, '972')}` : undefined);

  return (
    <Layout currentPage="prospects">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-10">
        <StudioHeader
          eyebrow={t('studio.groupBusiness')}
          title={t('studio.prospects.title')}
          lead={t('studio.prospects.subtitle')}
          actions={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('studio.prospects.search')} className="ps-11" />
            </div>
            <Button onClick={() => setCreating(true)}><Plus />{t('studio.prospects.new')}</Button>
            </div>
          }
        />

        {/* Status filter chips */}
        <div className="mb-6 flex flex-wrap gap-2">
          {(['all', ...STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-300',
                filter === s ? 'border-transparent bg-foreground text-background' : 'border-border/70 bg-card/60 text-muted-foreground hover:text-foreground'
              )}
            >
              {s === 'all' ? t('studio.prospects.all') : t(`studio.prospects.status.${s}`)}
              <span className={cn('rounded-full px-1.5 text-xs', filter === s ? 'bg-background/20' : 'bg-muted')}>{counts[s] || 0}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-[1.5rem] bg-card" />
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-border py-20 text-center text-muted-foreground">
            <Inbox className="h-10 w-10" />
            <p className="max-w-sm">{t('studio.prospects.empty')}</p>
          </div>
        ) : (
          <div data-ec-board="prospects" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            {/* List */}
            <div className="ec-stagger space-y-2">
              {visible.map((l) => (
                <button
                  key={l.id}
                  data-lead-id={l.id}
                  onClick={() => setSelectedId(l.id)}
                  className={cn(
                    'ec-card flex w-full items-center gap-4 rounded-[1.25rem] border p-4 text-start transition-all duration-300',
                    l.id === selectedId ? 'border-primary/60 bg-primary/[.06]' : 'border-border/60 bg-card hover:border-border'
                  )}
                >
                  <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-primary/12 font-num text-xl text-primary">{(l.name || '?').charAt(0)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-bold">{l.name}</span>
                      {l.lang && <span className="rounded-md bg-muted px-1.5 text-[10px] font-bold uppercase text-muted-foreground">{l.lang}</span>}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground" dir="ltr" style={{ textAlign: 'start' }}>{l.phone || l.email}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1.5">
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', STATUS_TONE[l.status])}>{t(`studio.prospects.status.${l.status}`)}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(l.created_at, i18n.language)}</span>
                  </span>
                </button>
              ))}
            </div>

            {/* Detail */}
            {selected && (
              <div key={selected.id} className="ec-glass animate-fade-in self-start rounded-[1.75rem] p-6 lg:sticky lg:top-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('studio.prospects.received')} · {formatDate(selected.created_at, i18n.language)}</p>
                    <h2 className="font-display mt-1 text-5xl">{selected.name}</h2>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(selected.id)} aria-label={t('studio.prospects.delete')}><Trash2 /></Button>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {selected.phone && <Button asChild size="sm"><a href={`tel:${selected.phone}`}><Phone />{t('studio.prospects.call')}</a></Button>}
                  {waHref(selected) && <Button asChild size="sm" variant="secondary"><a href={waHref(selected)} target="_blank" rel="noopener"><MessageCircle />{t('studio.prospects.whatsapp')}</a></Button>}
                  {selected.email && <Button asChild size="sm" variant="outline"><a href={`mailto:${selected.email}`}><Mail />{t('studio.prospects.email')}</a></Button>}
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  {[
                    [t('studio.prospects.goal'), label('goals', selected.goal)],
                    [t('studio.prospects.program'), label('programs', selected.program)],
                    [t('studio.prospects.phone'), selected.phone || '—'],
                    [t('studio.prospects.source'), selected.source || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-2xl bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">{k}</p>
                      <p className="mt-0.5 truncate font-semibold capitalize">{v}</p>
                    </div>
                  ))}
                </div>

                {selected.message && (
                  <div className="mt-3 rounded-2xl bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">{t('studio.prospects.message')}</p>
                    <p className="mt-1 whitespace-pre-wrap">{selected.message}</p>
                  </div>
                )}

                <p className="mb-2 mt-6 text-sm font-semibold">{t('common.status')}</p>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => update(selected.id, { status: s })}
                      className={cn('rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all duration-300', selected.status === s ? STATUS_TONE[s] + ' scale-105' : 'bg-muted/60 text-muted-foreground hover:text-foreground')}
                    >
                      {t(`studio.prospects.status.${s}`)}
                    </button>
                  ))}
                </div>

                <p className="mb-2 mt-6 text-sm font-semibold">{t('studio.prospects.notes')}</p>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('studio.prospects.notesPh')} rows={4} />
                <div className="mt-3 flex flex-wrap justify-between gap-2">
                  <Button variant="outline" size="sm" onClick={() => askAgent(`${t('studio.prospects.askAgent')}: ${selected.name} (#${selected.id})`)}>
                    <Sparkles />{t('studio.prospects.askAgent')}
                  </Button>
                  <div className="flex gap-2">
                    {selected.status !== 'converted' && (
                      <Button variant="secondary" size="sm" onClick={async () => { await update(selected.id, { status: 'converted' }, true); navigate('/trainer-dashboard'); }}>
                        <UserPlus />{t('studio.prospects.createClient')}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => update(selected.id, { notes })} disabled={notes === (selected.notes || '')}>{t('studio.prospects.save')}</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('studio.prospects.new')}</DialogTitle></DialogHeader>
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); create(); }}>
            <Input autoFocus required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t('studio.prospects.name')} />
            <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder={t('studio.prospects.phone')} dir="ltr" />
            <Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder={t('studio.prospects.emailLabel')} dir="ltr" />
            <Textarea value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} placeholder={t('studio.prospects.message')} rows={3} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={!draft.name.trim()}>{t('studio.prospects.save')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default ProspectsPage;
