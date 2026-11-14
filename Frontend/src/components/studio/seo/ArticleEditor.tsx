import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Bold,
  Code2,
  ExternalLink,
  Image as ImageIcon,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { askAgent, publishArticleBridge, type ArticlePatch } from '@/lib/agentOps';
import {
  ARTICLE_CATEGORIES,
  articlePath,
  emptyDraft,
  sanitizeArticleHtml,
  slugify,
  type Article,
  type ArticleDraft,
  type ArticleSeo,
  type ArticleStatus,
} from '@/lib/seo/articles';
import { studioApi } from '@/lib/studioApi';
import { cn } from '@/lib/utils';
import { SITE_LANGS, type SiteLang } from '@/site/content';
import { AiBriefCard, LiveArticleCanvas, useArticleGeneration, type GenerationResult } from './AiStudio';
import { RankMathPanel, ScoreBadge, useSeoAnalysis, type RankMathContext } from './RankMathPanel';
import { AgentDraft, plainText } from '@/components/studio/AgentDraft';

type BlockType = 'p' | 'h2' | 'h3' | 'h4' | 'blockquote';
const BLOCK_TYPES: BlockType[] = ['p', 'h2', 'h3', 'h4', 'blockquote'];
const LANG_LABEL: Record<SiteLang, string> = { he: 'עברית', en: 'English', fr: 'Français' };

interface ArticleEditorProps {
  article: Article | null;
  lang: SiteLang;
  aiReady: boolean;
  aiEngine?: string;
  aiModel?: string;
  autoBrief?: { topic: string; keyword: string } | null;
  onBack: () => void;
  onSaved: (article: Article) => void;
  onDeleted: (id: string) => void;
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** WordPress-like article editor: title, permalink, block toolbar, content, publish box, cover and Rank Math. */
export const ArticleEditor = ({ article, lang, aiReady, aiEngine, aiModel, autoBrief, onBack, onSaved, onDeleted }: ArticleEditorProps) => {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<ArticleDraft>(() => (article ? { ...article, seo: { ...article.seo } } : emptyDraft(lang)));
  const [html, setHtml] = useState(article?.contentHtml || '');
  const [mode, setMode] = useState<'brief' | 'live' | 'edit'>(article || !aiReady ? 'edit' : 'brief');
  const [htmlView, setHtmlView] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(article?.slug));
  const [saving, setSaving] = useState(false);
  const [lowScoreAsk, setLowScoreAsk] = useState<ArticleStatus | null>(null);
  const [deleteAsk, setDeleteAsk] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const patch = (p: Partial<ArticleDraft>) => setDraft((d) => ({ ...d, ...p }));
  const patchSeo = (p: Partial<ArticleSeo>) => setDraft((d) => ({ ...d, seo: { ...d.seo, ...p } }));

  const setTitle = (title: string) => setDraft((d) => ({ ...d, title, slug: slugTouched ? d.slug : slugify(title) }));

  /* contenteditable keeps its own DOM; React state follows it */
  const writeContent = useCallback((next: string) => {
    const clean = sanitizeArticleHtml(next);
    setHtml(clean);
    if (contentRef.current && contentRef.current.innerHTML !== clean) contentRef.current.innerHTML = clean;
  }, []);

  useEffect(() => {
    if (mode === 'edit' && !htmlView && contentRef.current) contentRef.current.innerHTML = html;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, htmlView]);

  const ctx: RankMathContext = useMemo(
    () => ({
      title: draft.title,
      slug: draft.slug,
      path: articlePath(draft.slug || 'article'),
      origin,
      html,
      coverAlt: draft.coverAlt,
      coverImage: draft.coverImage,
      mode: 'article',
      lang: draft.lang,
    }),
    [draft.title, draft.slug, draft.coverAlt, draft.coverImage, origin, html, draft.lang],
  );
  const analysis = useSeoAnalysis(draft.seo, ctx);

  /* ---- AI generation */
  const onGenerated = useCallback(
    (r: GenerationResult) => {
      const m = r.meta;
      setDraft((d) => ({
        ...d,
        title: m?.title || d.title,
        slug: d.slug && slugTouched ? d.slug : m?.slug || slugify(m?.title || d.title),
        excerpt: m?.excerpt || d.excerpt,
        category: m?.category || d.category,
        tags: m?.tags?.length ? m.tags : d.tags,
        coverAlt: m?.coverAlt || d.coverAlt,
        seo: {
          ...d.seo,
          focusKeyword: m?.focusKeyword || d.seo.focusKeyword,
          secondaryKeywords: m?.secondaryKeywords?.length ? m.secondaryKeywords : d.seo.secondaryKeywords,
          title: m?.seoTitle || d.seo.title,
          description: m?.seoDescription || d.seo.description,
          faq: r.faq.length ? r.faq : d.seo.faq,
        },
      }));
      setHtml(sanitizeArticleHtml(r.html));
    },
    [slugTouched],
  );
  const gen = useArticleGeneration(draft.lang, onGenerated);

  const startBrief = useCallback(
    (brief: Parameters<typeof gen.start>[0]) => {
      setMode('live');
      void gen.start(brief, aiModel);
    },
    [gen, aiModel],
  );

  // A brief coming from a link or Agent EC only pre-fills the form: writing (on the trainer's AI key) starts on their click.

  /* ---- Agent EC bridge: the agent reads this article and applies edits to it */
  const applyPatch = useCallback(
    (p: ArticlePatch) => {
      setMode('edit');
      setDraft((d) => ({
        ...d,
        title: p.title ?? d.title,
        excerpt: p.excerpt ?? d.excerpt,
        seo: {
          ...d.seo,
          focusKeyword: p.focus_keyword ?? d.seo.focusKeyword,
          title: p.seo_title ?? d.seo.title,
          description: p.meta_description ?? d.seo.description,
          faq: p.faq ?? d.seo.faq,
        },
      }));
      if (p.content_html !== undefined) writeContent(p.content_html);
    },
    [writeContent],
  );

  const failing = analysis.tests.filter((x) => !x.ok).map((x) => t(`studio.seo.rm.tests.${x.id}`));
  const bridgeContext = [
    `Article (${draft.lang}) — status: ${draft.status}`,
    `Title: ${draft.title}`,
    `Focus keyword: ${draft.seo.focusKeyword}`,
    `SEO title: ${draft.seo.title}`,
    `Meta description: ${draft.seo.description}`,
    `Excerpt: ${draft.excerpt}`,
    `Rank Math score: ${analysis.score}/100`,
    failing.length ? `Failing tests: ${failing.join('; ')}` : 'All tests pass',
    `Content HTML:\n${html.slice(0, 12000)}`,
  ].join('\n');

  useEffect(() => {
    publishArticleBridge({ title: draft.title, keyword: draft.seo.focusKeyword, context: bridgeContext, apply: applyPatch });
  }, [draft.title, draft.seo.focusKeyword, bridgeContext, applyPatch]);
  useEffect(() => () => publishArticleBridge(null), []);

  /* ---- toolbar */
  const exec = (cmd: string, value?: string) => {
    contentRef.current?.focus();
    document.execCommand(cmd, false, value);
    setHtml(contentRef.current?.innerHTML || '');
  };
  const addLink = () => {
    const url = window.prompt(t('studio.seo.editor.linkPrompt'), 'https://');
    if (url) exec('createLink', url);
  };
  const addImage = () => {
    const url = window.prompt(t('studio.seo.editor.imagePrompt'), 'https://');
    if (!url) return;
    const alt = window.prompt(t('studio.seo.editor.altPrompt'), draft.seo.focusKeyword) || '';
    exec('insertHTML', `<figure><img src="${url.replace(/"/g, '')}" alt="${alt.replace(/"/g, '')}" loading="lazy" /></figure>`);
  };

  /* ---- save */
  const save = async (status: ArticleStatus, force = false) => {
    if (!draft.title.trim()) {
      toast.error(t('studio.seo.editor.titleRequired'));
      return;
    }
    if (status !== 'draft' && analysis.score < 50 && !force) {
      setLowScoreAsk(status);
      return;
    }
    setSaving(true);
    try {
      const body: ArticleDraft = {
        ...draft,
        status,
        slug: draft.slug || slugify(draft.title),
        contentHtml: sanitizeArticleHtml(htmlView ? html : contentRef.current?.innerHTML ?? html),
        seo: { ...draft.seo, secondaryKeywords: draft.seo.secondaryKeywords.map((k) => k.trim()).filter(Boolean) },
      };
      const saved = await studioApi.saveArticle(body);
      setDraft({ ...saved, seo: { ...saved.seo } });
      setSlugTouched(true);
      toast.success(t(status === 'draft' ? 'studio.seo.editor.savedDraft' : status === 'scheduled' ? 'studio.seo.editor.savedScheduled' : 'studio.seo.editor.savedPublished'));
      onSaved(saved);
    } catch (err) {
      toast.error((err as Error).message || t('studio.seo.editor.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    try {
      await studioApi.deleteArticle(draft.id);
      toast.success(t('studio.seo.editor.deleted'));
      onDeleted(draft.id);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const scheduled = draft.publishedAt && new Date(draft.publishedAt).getTime() > Date.now();
  const primaryStatus: ArticleStatus = scheduled ? 'scheduled' : 'published';
  const dir = draft.lang === 'he' ? 'rtl' : 'ltr';

  return (
    <div className="ec-wp" data-ec-article-editor>
      <header className="ec-wp-bar">
        <button type="button" className="ec-wp-back" onClick={onBack}>
          <ArrowLeft size={16} className="rtl:-scale-x-100" />
          {t('studio.seo.editor.back')}
        </button>
        <span className="ec-wp-bar-title">{draft.id ? t('studio.seo.editor.editTitle') : t('studio.seo.editor.newTitle')}</span>
        <ScoreBadge score={analysis.score} />
        <div className="ec-wp-bar-actions">
          {mode === 'edit' ? (
            <Button variant="ghost" size="sm" onClick={() => askAgent(t('studio.seo.editor.agentPrompt', { title: draft.title || '…' }))}>
              <Sparkles />
              {t('studio.seo.editor.improveWithAgent')}
            </Button>
          ) : null}
          {draft.id && draft.status !== 'draft' ? (
            <Button variant="ghost" size="sm" asChild>
              <a href={articlePath(draft.slug, draft.lang)} target="_blank" rel="noreferrer">
                <ExternalLink />
                {t('studio.seo.editor.view')}
              </a>
            </Button>
          ) : null}
          <Button variant="outline" size="sm" disabled={saving || gen.state.running} onClick={() => void save('draft')}>
            {t('studio.seo.editor.saveDraft')}
          </Button>
          <Button size="sm" disabled={saving || gen.state.running} onClick={() => void save(primaryStatus)}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {scheduled ? t('studio.seo.editor.schedule') : draft.status === 'published' ? t('studio.seo.editor.update') : t('studio.seo.editor.publish')}
          </Button>
        </div>
      </header>

      {mode === 'brief' ? (
        <div className="ec-wp-stage">
          <AiBriefCard ready={aiReady} engine={aiEngine} initialTopic={autoBrief?.topic} initialKeyword={autoBrief?.keyword} onStart={startBrief} onSkip={() => setMode('edit')} />
        </div>
      ) : null}

      {mode === 'live' ? (
        <div className="ec-wp-stage">
          <LiveArticleCanvas state={gen.state} onStop={gen.stop} />
          {!gen.state.running ? (
            <div className="ec-wp-live-actions">
              <Button onClick={() => setMode('edit')} disabled={!html}>
                {t('studio.seo.ai.openEditor')}
              </Button>
              <Button variant="ghost" onClick={() => setMode('brief')}>
                {t('studio.seo.ai.retry')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === 'edit' ? (
        <div className="ec-wp-layout">
          <main className="ec-wp-main" dir={dir}>
            <Textarea
              className="ec-wp-title"
              rows={1}
              dir="auto"
              value={draft.title}
              placeholder={t('studio.seo.editor.titlePh')}
              onChange={(e) => setTitle(e.target.value)}
              aria-label={t('studio.seo.editor.titleLabel')}
            />
            <p className="ec-wp-permalink" dir="ltr">
              <span>{t('studio.seo.editor.permalink')}</span> {origin}/blog/<b>{draft.slug || '…'}</b>
            </p>
            <div className="ec-wp-toolbar" role="toolbar" aria-label={t('studio.seo.editor.toolbar')}>
              <Select onValueChange={(v) => exec('formatBlock', v)}>
                <SelectTrigger className="ec-wp-block-select" aria-label={t('studio.seo.editor.blockType')}>
                  <SelectValue placeholder={t('studio.seo.editor.blocks.p')} />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_TYPES.map((b) => (
                    <SelectItem key={b} value={b}>
                      {t(`studio.seo.editor.blocks.${b}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="ec-wp-sep" />
              <ToolBtn label={t('studio.seo.editor.bold')} onClick={() => exec('bold')} disabled={htmlView}><Bold size={16} /></ToolBtn>
              <ToolBtn label={t('studio.seo.editor.italic')} onClick={() => exec('italic')} disabled={htmlView}><Italic size={16} /></ToolBtn>
              <ToolBtn label={t('studio.seo.editor.quote')} onClick={() => exec('formatBlock', 'blockquote')} disabled={htmlView}><Quote size={16} /></ToolBtn>
              <ToolBtn label={t('studio.seo.editor.bullets')} onClick={() => exec('insertUnorderedList')} disabled={htmlView}><List size={16} /></ToolBtn>
              <ToolBtn label={t('studio.seo.editor.numbers')} onClick={() => exec('insertOrderedList')} disabled={htmlView}><ListOrdered size={16} /></ToolBtn>
              <span className="ec-wp-sep" />
              <ToolBtn label={t('studio.seo.editor.link')} onClick={addLink} disabled={htmlView}><Link2 size={16} /></ToolBtn>
              <ToolBtn label={t('studio.seo.editor.unlink')} onClick={() => exec('unlink')} disabled={htmlView}><Link2Off size={16} /></ToolBtn>
              <ToolBtn label={t('studio.seo.editor.image')} onClick={addImage} disabled={htmlView}><ImageIcon size={16} /></ToolBtn>
              <span className="ec-wp-sep" />
              <ToolBtn label={t('studio.seo.editor.undo')} onClick={() => exec('undo')} disabled={htmlView}><Undo2 size={16} className="rtl:-scale-x-100" /></ToolBtn>
              <ToolBtn label={t('studio.seo.editor.redo')} onClick={() => exec('redo')} disabled={htmlView}><Redo2 size={16} className="rtl:-scale-x-100" /></ToolBtn>
              <ToolBtn
                label={t('studio.seo.editor.htmlView')}
                active={htmlView}
                onClick={() => {
                  if (!htmlView) setHtml(contentRef.current?.innerHTML || html);
                  else setHtml(sanitizeArticleHtml(html));
                  setHtmlView(!htmlView);
                }}
              >
                <Code2 size={16} />
              </ToolBtn>
              {aiReady ? (
                <button type="button" className="ec-wp-ai" onClick={() => setMode('brief')}>
                  <Wand2 size={15} />
                  {t('studio.seo.ai.writeWithAi')}
                </button>
              ) : null}
            </div>
            {htmlView ? (
              <Textarea className="ec-wp-html" dir="ltr" value={html} onChange={(e) => setHtml(e.target.value)} aria-label={t('studio.seo.editor.htmlView')} />
            ) : (
              <div
                ref={contentRef}
                className="ec-wp-content ec-article-body"
                contentEditable
                suppressContentEditableWarning
                dir="auto"
                role="textbox"
                aria-multiline
                aria-label={t('studio.seo.editor.content')}
                data-placeholder={t('studio.seo.editor.contentPh')}
                onInput={(e) => setHtml((e.target as HTMLDivElement).innerHTML)}
                onBlur={(e) => writeContent((e.target as HTMLDivElement).innerHTML)}
              />
            )}
            <label className="ec-rm-field ec-wp-excerpt">
              <span className="ec-rm-label">{t('studio.seo.editor.excerpt')}</span>
              <AgentDraft
                kind="seo"
                field="excerpt"
                lang={draft.lang}
                extra={{ article_title: draft.title, focus_keyword: draft.seo.focusKeyword, article_text: plainText(html) }}
                value={draft.excerpt}
                onChange={(v) => patch({ excerpt: v })}
              >
                <Textarea dir="auto" rows={2} value={draft.excerpt} placeholder={t('studio.seo.editor.excerptPh')} onChange={(e) => patch({ excerpt: e.target.value })} />
              </AgentDraft>
            </label>
          </main>

          <aside className="ec-wp-side">
            <section className="ec-wp-card">
              <h3>{t('studio.seo.editor.publishBox')}</h3>
              <dl className="ec-wp-meta">
                <div>
                  <dt>{t('studio.seo.editor.status')}</dt>
                  <dd>
                    <span className={cn('ec-seo-status', `is-${draft.status}`)}>{t(`studio.seo.status.${draft.status}`)}</span>
                  </dd>
                </div>
                <div>
                  <dt>{t('studio.seo.editor.language')}</dt>
                  <dd>
                    <Select value={draft.lang} onValueChange={(v) => patch({ lang: v as SiteLang })}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SITE_LANGS.map((l) => (
                          <SelectItem key={l} value={l}>
                            {LANG_LABEL[l]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </dd>
                </div>
              </dl>
              <label className="ec-rm-field">
                <span className="ec-rm-label">{t('studio.seo.editor.date')}</span>
                <Input type="datetime-local" dir="ltr" value={toLocalInput(draft.publishedAt)} onChange={(e) => patch({ publishedAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                <small className="ec-rm-help">{t('studio.seo.editor.dateHelp')}</small>
              </label>
              <label className="ec-rm-field">
                <span className="ec-rm-label">{t('studio.seo.editor.category')}</span>
                <Select value={draft.category || undefined} onValueChange={(v) => patch({ category: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('studio.seo.editor.categoryPh')} />
                  </SelectTrigger>
                  <SelectContent>
                    {ARTICLE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`studio.seo.categories.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="ec-rm-field">
                <span className="ec-rm-label">{t('studio.seo.editor.tags')}</span>
                <Input dir="auto" value={draft.tags.join(', ')} placeholder={t('studio.seo.editor.tagsPh')} onChange={(e) => patch({ tags: e.target.value.split(',').map((x) => x.trimStart()).slice(0, 10) })} />
              </label>
              {draft.id ? (
                <button type="button" className="ec-wp-delete" onClick={() => setDeleteAsk(true)}>
                  <Trash2 size={14} />
                  {t('studio.seo.editor.delete')}
                </button>
              ) : null}
            </section>

            <section className="ec-wp-card">
              <h3>{t('studio.seo.editor.cover')}</h3>
              {draft.coverImage ? <img className="ec-wp-cover" src={draft.coverImage} alt={draft.coverAlt} /> : <div className="ec-wp-cover is-empty"><ImageIcon size={22} /></div>}
              <label className="ec-rm-field">
                <span className="ec-rm-label">{t('studio.seo.editor.coverUrl')}</span>
                <Input dir="ltr" value={draft.coverImage} placeholder="https://…" onChange={(e) => patch({ coverImage: e.target.value.trim() })} />
              </label>
              <label className="ec-rm-field">
                <span className="ec-rm-label">{t('studio.seo.editor.coverAlt')}</span>
                <Input dir="auto" value={draft.coverAlt} onChange={(e) => patch({ coverAlt: e.target.value })} />
              </label>
            </section>

            <section className="ec-wp-card is-flush">
              <RankMathPanel
                seo={draft.seo}
                onChange={patchSeo}
                ctx={ctx}
                analysis={analysis}
                onSlugChange={(s) => {
                  setSlugTouched(true);
                  patch({ slug: slugify(s) || s.toLowerCase() });
                }}
              />
            </section>
            <p className="ec-wp-words">{t('studio.seo.editor.wordCount', { count: stripHtml(html).split(' ').filter(Boolean).length, lng: i18n.language })}</p>
          </aside>
        </div>
      ) : null}

      <AlertDialog open={lowScoreAsk !== null} onOpenChange={(o) => !o && setLowScoreAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('studio.seo.editor.lowScoreTitle', { score: analysis.score })}</AlertDialogTitle>
            <AlertDialogDescription>{t('studio.seo.editor.lowScoreBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('studio.seo.editor.keepEditing')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const s = lowScoreAsk;
                setLowScoreAsk(null);
                if (s) void save(s, true);
              }}
            >
              {t('studio.seo.editor.publishAnyway')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteAsk} onOpenChange={setDeleteAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('studio.seo.editor.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('studio.seo.editor.deleteBody', { title: draft.title })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', { defaultValue: t('studio.seo.editor.keepEditing') })}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void remove()}>
              {t('studio.seo.editor.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const ToolBtn = ({ label, onClick, disabled, active, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) => (
  <button
    type="button"
    className={cn('ec-wp-tool', active && 'is-active')}
    aria-label={label}
    title={label}
    aria-pressed={active}
    disabled={disabled}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
  >
    {children}
  </button>
);
