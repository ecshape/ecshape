import { useCallback, useEffect, useMemo, useState } from 'react';
import { EcSpinner } from '@/components/brand/EcLoader';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileText,
  Globe2,
  Instagram,
  LayoutDashboard,
  Plus,
  Repeat2,
  Save,
  Search,
  SearchCheck,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { StudioHeader } from '@/components/studio/StudioHeader';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArticleEditor } from '@/components/studio/seo/ArticleEditor';
import { RankMathPanel, ScoreBadge, useSeoAnalysis, type RankMathContext } from '@/components/studio/seo/RankMathPanel';
import { AGENT_NEW_ARTICLE_EVENT, askAgent, useAgentChanged, useAgentForm } from '@/lib/agentOps';
import { analyzeSeo } from '@/lib/seo/analysis';
import { articlePath, EMPTY_ARTICLE_SEO, isLive, type Article, type ArticleSeo } from '@/lib/seo/articles';
import { studioApi, type AgentModelOption, type PageSeoFields, type SeoRedirect, type SeoSettings } from '@/lib/studioApi';
import { cn } from '@/lib/utils';
import { DEFAULT_CONTENT, SITE_LANGS, toSiteLang, type SiteLang } from '@/site/content';

type SeoTab = 'dashboard' | 'articles' | 'pages' | 'redirects' | 'indexation' | 'stats';
const TABS: { id: SeoTab; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'articles', icon: FileText },
  { id: 'pages', icon: Globe2 },
  { id: 'redirects', icon: Repeat2 },
  { id: 'indexation', icon: SearchCheck },
  { id: 'stats', icon: BarChart3 },
];
const LANG_LABEL: Record<SiteLang, string> = { he: 'עברית', en: 'English', fr: 'Français' };

type EditorState = { article: Article | null; brief: { topic: string; keyword: string } | null; lang: SiteLang } | null;

const articleScore = (a: Article, host: string) =>
  analyzeSeo({
    keyword: a.seo.focusKeyword,
    seoTitle: a.seo.title,
    title: a.title,
    description: a.seo.description,
    slug: a.slug,
    html: a.contentHtml,
    coverAlt: a.coverAlt,
    siteHost: host,
  }).score;

/** Visible text of a site page, as HTML the analyzer can read (headings + paragraphs). */
function contentToHtml(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value.trim().length > 2 && !/^(https?:|\/|#)/.test(value) ? `<p>${value.replace(/</g, '&lt;')}</p>` : '';
  if (Array.isArray(value)) return value.map((v) => contentToHtml(v, depth + 1)).join('');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !k.startsWith('__') && k !== 'meta')
      .map(([k, v]) => (depth === 0 && typeof v === 'object' && v && 'title' in v && typeof (v as { title: unknown }).title === 'string' ? `<h2>${(v as { title: string }).title}</h2>` : '') + (k === 'title' && depth === 1 ? '' : contentToHtml(v, depth + 1)))
      .join('');
  }
  return '';
}

const SeoPage = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<SeoTab>('dashboard');
  const [settings, setSettings] = useState<SeoSettings>({});
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<AgentModelOption[]>([]);
  const [editor, setEditor] = useState<EditorState>(null);
  const uiLang = toSiteLang(i18n.language);
  const host = typeof window !== 'undefined' ? window.location.host : '';

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([studioApi.seo(), studioApi.articles()]);
      setSettings(s || {});
      setArticles(a || []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    studioApi.agentModels().then(setModels).catch(() => setModels([]));
  }, [load]);
  useAgentChanged(load);

  const recommended = models.find((m) => m.recommended) || models[0];
  const aiReady = models.length > 0;

  const openNew = useCallback((brief: { topic: string; keyword: string } | null = null, lang: SiteLang = uiLang) => setEditor({ article: null, brief, lang }), [uiLang]);
  useAgentForm('article', () => openNew());

  /* `?article=topic&keyword=&lang=` (agent navigation) and the in-page agent event */
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const topic = p.get('article');
    if (!topic) return;
    openNew({ topic, keyword: p.get('keyword') || '' }, toSiteLang(p.get('lang') || uiLang));
    navigate({ pathname: location.pathname }, { replace: true });
  }, [location.search, location.pathname, navigate, openNew, uiLang]);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ topic: string; keyword?: string; lang?: string }>).detail;
      if (d?.topic) openNew({ topic: d.topic, keyword: d.keyword || '' }, toSiteLang(d.lang || uiLang));
    };
    window.addEventListener(AGENT_NEW_ARTICLE_EVENT, on);
    return () => window.removeEventListener(AGENT_NEW_ARTICLE_EVENT, on);
  }, [openNew, uiLang]);

  const saveSettings = async (next: SeoSettings) => {
    setSettings(next);
    try {
      await studioApi.saveSeo(next);
      toast.success(t('studio.seo.saved'));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (editor) {
    return (
      <Layout currentPage="seo">
        <ArticleEditor
          key={editor.article?.id || `new-${editor.brief?.topic || ''}`}
          article={editor.article}
          lang={editor.lang}
          aiReady={aiReady}
          aiEngine={recommended?.label}
          aiModel={recommended?.value}
          autoBrief={editor.brief}
          onBack={() => {
            setEditor(null);
            setTab('articles');
          }}
          onSaved={(saved) => setArticles((list) => [saved, ...list.filter((a) => a.id !== saved.id)])}
          onDeleted={(id) => {
            setArticles((list) => list.filter((a) => a.id !== id));
            setEditor(null);
          }}
        />
      </Layout>
    );
  }

  return (
    <Layout currentPage="seo">
      <div className="ec-seo" data-ec-seo>
        <StudioHeader
          eyebrow={t('studio.groupStudio')}
          title={t('studio.seo.title')}
          lead={t('studio.seo.subtitle')}
          actions={
            <>
              <Button variant="outline" onClick={() => askAgent(t('studio.seo.agentAudit'))}>
                <Sparkles />
                {t('studio.seo.askAgent')}
              </Button>
              <Button onClick={() => openNew()}>
                <Plus />
                {t('studio.seo.newArticle')}
              </Button>
            </>
          }
        />

        <nav className="ec-seo-tabs" role="tablist" aria-label={t('studio.seo.title')}>
          {TABS.map(({ id, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={cn(tab === id && 'is-active')} onClick={() => setTab(id)}>
              <Icon size={16} />
              <span>{t(`studio.seo.tabs.${id}`)}</span>
              {id === 'articles' && articles.length ? <small>{articles.length}</small> : null}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="ec-seo-loading">
            <EcSpinner mono />
          </div>
        ) : (
          <div className="ec-seo-panel" key={tab}>
            {tab === 'dashboard' ? <Dashboard articles={articles} settings={settings} host={host} aiReady={aiReady} onOpen={(a) => setEditor({ article: a, brief: null, lang: a.lang })} onNew={() => openNew()} onTab={setTab} /> : null}
            {tab === 'articles' ? <ArticlesBoard articles={articles} host={host} onOpen={(a) => setEditor({ article: a, brief: null, lang: a.lang })} onNew={() => openNew()} /> : null}
            {tab === 'pages' ? <PagesSeo settings={settings} onSave={saveSettings} /> : null}
            {tab === 'redirects' ? <RedirectsBoard settings={settings} onSave={saveSettings} /> : null}
            {tab === 'indexation' ? <Indexation articles={articles} settings={settings} onSave={saveSettings} /> : null}
            {tab === 'stats' ? <Connections settings={settings} onSave={saveSettings} /> : null}
          </div>
        )}
      </div>
    </Layout>
  );
};

/* ------------------------------------------------------------------ dashboard */
const Dashboard = ({
  articles,
  settings,
  host,
  aiReady,
  onOpen,
  onNew,
  onTab,
}: {
  articles: Article[];
  settings: SeoSettings;
  host: string;
  aiReady: boolean;
  onOpen: (a: Article) => void;
  onNew: () => void;
  onTab: (tab: SeoTab) => void;
}) => {
  const { t } = useTranslation();
  const scored = useMemo(() => articles.map((a) => ({ a, score: articleScore(a, host) })), [articles, host]);
  const live = articles.filter((a) => isLive(a)).length;
  const drafts = articles.filter((a) => a.status === 'draft').length;
  const avg = scored.length ? Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length) : 0;
  const toImprove = scored.filter((x) => x.score < 80).sort((x, y) => x.score - y.score).slice(0, 5);
  const pagesDone = SITE_LANGS.filter((l) => settings.pages?.[l]?.title && settings.pages?.[l]?.description).length;

  const connections = [
    { id: 'analytics', ok: Boolean(settings.analytics_id), tab: 'stats' as SeoTab },
    { id: 'searchConsole', ok: Boolean(settings.search_console), tab: 'indexation' as SeoTab },
    { id: 'ai', ok: aiReady, href: '/studio/preferences#ai-keys' },
  ];

  return (
    <div className="ec-seo-dash">
      <div className="ec-seo-kpis">
        <article className="ec-seo-kpi">
          <span>{t('studio.seo.kpi.live')}</span>
          <b>{live}</b>
          <small>{t('studio.seo.kpi.drafts', { count: drafts })}</small>
        </article>
        <article className="ec-seo-kpi">
          <span>{t('studio.seo.kpi.avgScore')}</span>
          <b className="ec-seo-kpi-score">{scored.length ? <ScoreBadge score={avg} size="lg" /> : '—'}</b>
          <small>{t('studio.seo.kpi.avgScoreHint')}</small>
        </article>
        <article className="ec-seo-kpi">
          <span>{t('studio.seo.kpi.pages')}</span>
          <b>
            {pagesDone}/{SITE_LANGS.length}
          </b>
          <small>{t('studio.seo.kpi.pagesHint')}</small>
        </article>
        <article className="ec-seo-kpi">
          <span>{t('studio.seo.kpi.redirects')}</span>
          <b>{settings.redirects?.length || 0}</b>
          <small>{t('studio.seo.kpi.redirectsHint')}</small>
        </article>
      </div>

      <div className="ec-seo-dash-grid">
        <section className="ec-seo-card">
          <header>
            <h2>{t('studio.seo.dash.toImprove')}</h2>
            <button type="button" className="ec-seo-link" onClick={() => onTab('articles')}>
              {t('studio.seo.dash.allArticles')}
              <ArrowRight size={14} className="rtl:-scale-x-100" />
            </button>
          </header>
          {toImprove.length ? (
            <ul className="ec-seo-list">
              {toImprove.map(({ a, score }) => (
                <li key={a.id}>
                  <button type="button" onClick={() => onOpen(a)}>
                    <ScoreBadge score={score} size="sm" />
                    <span dir="auto">{a.title || t('studio.seo.untitled')}</span>
                    <ArrowRight size={14} className="rtl:-scale-x-100" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="ec-seo-empty">
              <CheckCircle2 />
              <p>{articles.length ? t('studio.seo.dash.allGood') : t('studio.seo.dash.noArticles')}</p>
              {!articles.length ? (
                <Button size="sm" onClick={onNew}>
                  <Wand2 />
                  {t('studio.seo.dash.firstArticle')}
                </Button>
              ) : null}
            </div>
          )}
        </section>

        <section className="ec-seo-card">
          <header>
            <h2>{t('studio.seo.dash.connections')}</h2>
          </header>
          <ul className="ec-seo-conn">
            {connections.map((c) => (
              <li key={c.id} className={cn(c.ok ? 'is-ok' : 'is-off')}>
                {c.ok ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
                <span>
                  <b>{t(`studio.seo.conn.${c.id}`)}</b>
                  <small>{t(c.ok ? 'studio.seo.conn.connected' : 'studio.seo.conn.notConnected')}</small>
                </span>
                {c.ok ? null : c.href ? (
                  <a className="ec-seo-link" href={c.href}>
                    {t('studio.seo.conn.connect')}
                  </a>
                ) : (
                  <button type="button" className="ec-seo-link" onClick={() => onTab(c.tab as SeoTab)}>
                    {t('studio.seo.conn.connect')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ articles */
type ArticleFilter = 'all' | 'published' | 'draft' | 'scheduled';

const ArticlesBoard = ({ articles, host, onOpen, onNew }: { articles: Article[]; host: string; onOpen: (a: Article) => void; onNew: () => void }) => {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<ArticleFilter>('all');
  const [lang, setLang] = useState<SiteLang | 'all'>('all');
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () =>
      articles
        .filter((a) => filter === 'all' || a.status === filter)
        .filter((a) => lang === 'all' || a.lang === lang)
        .filter((a) => !query.trim() || `${a.title} ${a.seo.focusKeyword}`.toLowerCase().includes(query.trim().toLowerCase()))
        .map((a) => ({ a, score: articleScore(a, host) })),
    [articles, filter, lang, query, host],
  );
  const count = (f: ArticleFilter) => (f === 'all' ? articles.length : articles.filter((a) => a.status === f).length);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  return (
    <section className="ec-seo-card is-board">
      <div className="ec-seo-filters">
        <div className="ec-seo-seg" role="tablist">
          {(['all', 'published', 'draft', 'scheduled'] as ArticleFilter[]).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} className={cn(filter === f && 'is-active')} onClick={() => setFilter(f)}>
              {t(`studio.seo.filter.${f}`)} <small>{count(f)}</small>
            </button>
          ))}
        </div>
        <div className="ec-seo-filters-end">
          <Select value={lang} onValueChange={(v) => setLang(v as SiteLang | 'all')}>
            <SelectTrigger className="h-9 w-[9.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('studio.seo.allLanguages')}</SelectItem>
              {SITE_LANGS.map((l) => (
                <SelectItem key={l} value={l}>
                  {LANG_LABEL[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="ec-seo-search">
            <Search size={15} />
            <Input value={query} placeholder={t('studio.seo.searchPh')} onChange={(e) => setQuery(e.target.value)} aria-label={t('studio.seo.searchPh')} />
          </label>
        </div>
      </div>

      {rows.length ? (
        <ul className="ec-seo-rows">
          {rows.map(({ a, score }, i) => (
            <li key={a.id} style={{ ['--i' as string]: i }}>
              <button type="button" onClick={() => onOpen(a)}>
                {a.coverImage ? <img src={a.coverImage} alt="" /> : <span className="ec-seo-thumb"><FileText size={18} /></span>}
                <span className="ec-seo-row-main">
                  <b dir="auto">{a.title || t('studio.seo.untitled')}</b>
                  <small>
                    {a.seo.focusKeyword ? <span dir="auto">{a.seo.focusKeyword}</span> : <span className="is-muted">{t('studio.seo.noKeyword')}</span>}
                    <span>{LANG_LABEL[a.lang]}</span>
                    <span>{fmt(a.publishedAt || a.updatedAt)}</span>
                  </small>
                </span>
                <span className={cn('ec-seo-status', `is-${a.status}`)}>{t(`studio.seo.status.${a.status}`)}</span>
                <ScoreBadge score={score} size="sm" />
              </button>
              {isLive(a) ? (
                <a className="ec-seo-row-view" href={articlePath(a.slug, a.lang)} target="_blank" rel="noreferrer" aria-label={t('studio.seo.editor.view')}>
                  <ExternalLink size={15} />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="ec-seo-empty">
          <FileText />
          <p>{articles.length ? t('studio.seo.noMatch') : t('studio.seo.dash.noArticles')}</p>
          <Button size="sm" onClick={onNew}>
            <Plus />
            {t('studio.seo.newArticle')}
          </Button>
        </div>
      )}
    </section>
  );
};

/* ------------------------------------------------------------------ site pages */
const PagesSeo = ({ settings, onSave }: { settings: SeoSettings; onSave: (s: SeoSettings) => Promise<void> }) => {
  const { t } = useTranslation();
  const [lang, setLang] = useState<SiteLang>('he');
  const [pages, setPages] = useState<Record<string, PageSeoFields>>(settings.pages || {});
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    let alive = true;
    studioApi
      .siteContent(lang)
      .then((r) => alive && setHtml(contentToHtml(r.content)))
      .catch(() => alive && setHtml(contentToHtml(DEFAULT_CONTENT[lang])));
    return () => {
      alive = false;
    };
  }, [lang]);

  const defaults = DEFAULT_CONTENT[lang].meta;
  const page = pages[lang] || {};
  const seo: ArticleSeo = {
    ...EMPTY_ARTICLE_SEO,
    focusKeyword: page.focusKeyword || '',
    secondaryKeywords: (page.keywords || '').split(',').map((k) => k.trim()).filter(Boolean),
    title: page.title ?? defaults.title,
    description: page.description ?? defaults.description,
    robots: page.robots || 'index',
    canonical: page.canonical || '',
    ogTitle: page.ogTitle || '',
    ogDescription: page.ogDescription || '',
    ogImage: page.image || '',
  };
  const ctx: RankMathContext = { title: defaults.title, slug: '', path: `/home?lang=${lang}`, origin, html, mode: 'page', lang };
  const analysis = useSeoAnalysis(seo, ctx);

  const change = (p: Partial<ArticleSeo>) => {
    const next: PageSeoFields = { ...page };
    if (p.focusKeyword !== undefined) next.focusKeyword = p.focusKeyword;
    if (p.title !== undefined) next.title = p.title;
    if (p.description !== undefined) next.description = p.description;
    if (p.robots !== undefined) next.robots = p.robots;
    if (p.canonical !== undefined) next.canonical = p.canonical;
    if (p.ogTitle !== undefined) next.ogTitle = p.ogTitle;
    if (p.ogDescription !== undefined) next.ogDescription = p.ogDescription;
    if (p.ogImage !== undefined) next.image = p.ogImage;
    setPages({ ...pages, [lang]: next });
  };

  return (
    <div className="ec-seo-pages">
      <aside className="ec-seo-card ec-seo-page-list">
        <h2>{t('studio.seo.pages.title')}</h2>
        <p>{t('studio.seo.pages.body')}</p>
        <ul>
          {SITE_LANGS.map((l) => (
            <li key={l}>
              <button type="button" className={cn(lang === l && 'is-active')} onClick={() => setLang(l)}>
                <Globe2 size={16} />
                <span>
                  <b>{t('studio.site.homePage')}</b>
                  <small>{LANG_LABEL[l]}</small>
                </span>
                {pages[l]?.title ? <CheckCircle2 size={16} className="is-ok" /> : <CircleAlert size={16} />}
              </button>
            </li>
          ))}
        </ul>
        <div className="ec-seo-page-actions">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSave({ ...settings, pages });
              setBusy(false);
            }}
          >
            {busy ? <EcSpinner mono /> : <Save />}
            {t('studio.seo.save')}
          </Button>
        </div>
      </aside>
      <section className="ec-seo-card is-flush" dir={lang === 'he' ? 'rtl' : 'ltr'}>
        <RankMathPanel key={lang} seo={seo} onChange={change} ctx={ctx} analysis={analysis} />
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ redirects */
const RedirectsBoard = ({ settings, onSave }: { settings: SeoSettings; onSave: (s: SeoSettings) => Promise<void> }) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SeoRedirect[]>(settings.redirects || []);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [code, setCode] = useState<301 | 302>(301);
  const normalize = (p: string) => {
    const v = p.trim();
    if (!v) return '';
    if (/^https?:\/\//.test(v)) return v;
    return v.startsWith('/') ? v : `/${v}`;
  };
  const add = () => {
    const f = normalize(from);
    const d = normalize(to);
    const bare = (x: string) => x.replace(/\/+$/, '') || '/';
    if (!f || !d || bare(f) === bare(d)) return;
    const next = [{ from: f, to: d, code }, ...rows.filter((r) => r.from !== f)];
    setRows(next);
    setFrom('');
    setTo('');
    void onSave({ ...settings, redirects: next });
  };
  const remove = (f: string) => {
    const next = rows.filter((r) => r.from !== f);
    setRows(next);
    void onSave({ ...settings, redirects: next });
  };

  return (
    <section className="ec-seo-card">
      <header>
        <h2>{t('studio.seo.redirects.title')}</h2>
      </header>
      <p className="ec-seo-help">{t('studio.seo.redirects.body')}</p>
      <form
        className="ec-seo-redirect-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input dir="ltr" value={from} placeholder="/old-page" onChange={(e) => setFrom(e.target.value)} aria-label={t('studio.seo.redirects.from')} />
        <ArrowRight size={16} className="rtl:-scale-x-100" />
        <Input dir="ltr" value={to} placeholder="/blog/new-page" onChange={(e) => setTo(e.target.value)} aria-label={t('studio.seo.redirects.to')} />
        <Select value={String(code)} onValueChange={(v) => setCode(Number(v) as 301 | 302)}>
          <SelectTrigger className="w-[8.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="301">301 · {t('studio.seo.redirects.permanent')}</SelectItem>
            <SelectItem value="302">302 · {t('studio.seo.redirects.temporary')}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={!from.trim() || !to.trim()}>
          <Plus />
          {t('studio.seo.redirects.add')}
        </Button>
      </form>
      {rows.length ? (
        <ul className="ec-seo-redirects">
          {rows.map((r) => (
            <li key={r.from}>
              <code dir="ltr">{r.from}</code>
              <ArrowRight size={14} className="rtl:-scale-x-100" />
              <code dir="ltr">{r.to}</code>
              <span className="ec-seo-chip">{r.code}</span>
              <button type="button" className="ec-rm-icon" aria-label={t('studio.site.remove')} onClick={() => remove(r.from)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ec-seo-empty">
          <Repeat2 />
          <p>{t('studio.seo.redirects.empty')}</p>
        </div>
      )}
    </section>
  );
};

/* ------------------------------------------------------------------ indexation */
const Indexation = ({ articles, settings, onSave }: { articles: Article[]; settings: SeoSettings; onSave: (s: SeoSettings) => Promise<void> }) => {
  const { t } = useTranslation();
  const [verification, setVerification] = useState(settings.search_console || '');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const urls = [
    ...SITE_LANGS.map((l) => ({ url: `${origin}/home?lang=${l}`, label: `${t('studio.site.homePage')} · ${LANG_LABEL[l]}`, indexed: settings.pages?.[l]?.robots !== 'noindex' })),
    ...articles.filter((a) => isLive(a)).map((a) => ({ url: `${origin}${articlePath(a.slug, a.lang)}`, label: a.title, indexed: a.seo.robots !== 'noindex' })),
  ];
  return (
    <div className="ec-seo-dash-grid">
      <section className="ec-seo-card">
        <header>
          <h2>{t('studio.seo.index.title')}</h2>
          <span className="ec-seo-chip">{t('studio.seo.index.count', { count: urls.filter((u) => u.indexed).length })}</span>
        </header>
        <ul className="ec-seo-urls">
          {urls.map((u) => (
            <li key={u.url} className={cn(!u.indexed && 'is-off')}>
              {u.indexed ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
              <span>
                <b dir="auto">{u.label}</b>
                <small dir="ltr">{u.url.replace(/^https?:\/\//, '')}</small>
              </span>
              <span className="ec-seo-chip">{u.indexed ? 'index' : 'noindex'}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="ec-seo-card">
        <header>
          <h2>{t('studio.seo.index.gscTitle')}</h2>
        </header>
        <p className="ec-seo-help">{t('studio.seo.index.gscBody')}</p>
        <label className="ec-rm-field">
          <span className="ec-rm-label">{t('studio.seo.index.verification')}</span>
          <Input dir="ltr" value={verification} placeholder="google-site-verification=…" onChange={(e) => setVerification(e.target.value)} />
        </label>
        <div className="ec-seo-page-actions">
          <Button size="sm" onClick={() => void onSave({ ...settings, search_console: verification.replace(/^google-site-verification=/, '').trim() })}>
            <Save />
            {t('studio.seo.save')}
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">
              <ExternalLink />
              {t('studio.seo.index.openGsc')}
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ connections & stats */
const Connections = ({ settings, onSave }: { settings: SeoSettings; onSave: (s: SeoSettings) => Promise<void> }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SeoSettings>(settings);
  const [busy, setBusy] = useState(false);
  return (
    <section className="ec-seo-card">
      <header>
        <h2>{t('studio.seo.stats.title')}</h2>
        {draft.analytics_id ? (
          <Button size="sm" variant="ghost" asChild>
            <a href="https://analytics.google.com/" target="_blank" rel="noreferrer">
              <ExternalLink />
              {t('studio.seo.stats.openGa')}
            </a>
          </Button>
        ) : null}
      </header>
      <p className="ec-seo-help">{t('studio.seo.stats.body')}</p>
      <div className="ec-seo-conn-grid">
        <label className="ec-rm-field">
          <span className="ec-rm-label">
            <BarChart3 size={15} />
            {t('studio.seo.analytics')}
          </span>
          <Input dir="ltr" value={draft.analytics_id || ''} placeholder="G-XXXXXXXXXX" onChange={(e) => setDraft({ ...draft, analytics_id: e.target.value.trim() })} />
        </label>
        <label className="ec-rm-field">
          <span className="ec-rm-label">
            <Instagram size={15} />
            {t('studio.seo.instagram')}
          </span>
          <Input dir="ltr" value={draft.social?.instagram || ''} placeholder="ecshape" onChange={(e) => setDraft({ ...draft, social: { ...draft.social, instagram: e.target.value.replace(/^@/, '') } })} />
        </label>
        <label className="ec-rm-field">
          <span className="ec-rm-label">
            <WhatsAppIcon size={15} />
            {t('studio.seo.whatsapp')}
          </span>
          <Input dir="ltr" value={draft.social?.whatsapp || ''} placeholder="972546683867" onChange={(e) => setDraft({ ...draft, social: { ...draft.social, whatsapp: e.target.value.replace(/[^\d]/g, '') } })} />
        </label>
      </div>
      <div className="ec-seo-page-actions">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onSave({ ...settings, analytics_id: draft.analytics_id, social: draft.social });
            setBusy(false);
          }}
        >
          {busy ? <EcSpinner mono /> : <Save />}
          {t('studio.seo.save')}
        </Button>
      </div>
    </section>
  );
};

export default SeoPage;
