import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Monitor, Plus, Smartphone, Trash2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { analyzeSeo, scoreTone, SEO_GROUPS, type SeoAnalysis, type SeoTestGroup } from '@/lib/seo/analysis';
import type { ArticleSchemaType, ArticleSeo } from '@/lib/seo/articles';
import { cn } from '@/lib/utils';

type RmTab = 'general' | 'advanced' | 'schema' | 'social';

export type RankMathContext = {
  title: string;
  slug: string;
  path: string;
  origin: string;
  html: string;
  coverAlt?: string;
  coverImage?: string;
  otherKeywords?: string[];
  /** Articles edit slug, schema and FAQ; site pages keep the basics. */
  mode: 'article' | 'page';
  brand?: string;
};

export function useSeoAnalysis(seo: ArticleSeo, ctx: RankMathContext): SeoAnalysis {
  return useMemo(
    () =>
      analyzeSeo({
        keyword: seo.focusKeyword,
        seoTitle: seo.title,
        title: ctx.title,
        description: seo.description,
        slug: ctx.slug,
        html: ctx.html,
        coverAlt: ctx.coverAlt,
        otherKeywords: ctx.otherKeywords,
        siteHost: ctx.origin.replace(/^https?:\/\//, ''),
      }),
    [seo.focusKeyword, seo.title, seo.description, ctx.title, ctx.slug, ctx.html, ctx.coverAlt, ctx.otherKeywords, ctx.origin],
  );
}

export const ScoreBadge = ({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) => {
  const { t } = useTranslation();
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <span className={cn('ec-rm-score', `is-${scoreTone(score)}`, `is-${size}`)} title={t('studio.seo.rm.scoreTitle', { score })}>
      {size === 'lg' ? (
        <svg viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r={r} className="ec-rm-score-track" />
          <circle cx="18" cy="18" r={r} className="ec-rm-score-arc" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
        </svg>
      ) : null}
      <b>{score}</b>
      <small>/100</small>
    </span>
  );
};

const Counter = ({ value, min, max }: { value: string; min: number; max: number }) => {
  const n = value.length;
  return <span className={cn('ec-rm-counter', n > 0 && (n >= min && n <= max ? 'is-ok' : 'is-warn'))}>{n} / {max}</span>;
};

const SnippetPreview = ({ origin, path, title, description, device }: { origin: string; path: string; title: string; description: string; device: 'desktop' | 'mobile' }) => {
  const { t } = useTranslation();
  const max = device === 'mobile' ? 78 : 60;
  const crumbs = path === '/' ? '' : path.split('?')[0].split('/').filter(Boolean).map((p) => ` › ${decodeURIComponent(p)}`).join('');
  return (
    <div className={cn('ec-rm-snippet', `is-${device}`)} aria-label={t('studio.seo.rm.googlePreview')}>
      <span className="ec-rm-snippet-site">
        <i aria-hidden>EC</i>
        <span>
          <b>ECshape</b>
          <span dir="ltr">{origin.replace(/^https?:\/\//, '')}{crumbs}</span>
        </span>
      </span>
      <span className="ec-rm-snippet-title" dir="auto">{title.length > max ? `${title.slice(0, max - 1)}…` : title}</span>
      <span className="ec-rm-snippet-desc" dir="auto">{description ? (description.length > 160 ? `${description.slice(0, 159)}…` : description) : t('studio.seo.rm.noDescription')}</span>
    </div>
  );
};

const SocialPreview = ({ title, description, image, origin }: { title: string; description: string; image: string; origin: string }) => {
  const { t } = useTranslation();
  return (
    <div className="ec-rm-social" aria-label={t('studio.seo.rm.socialPreview')}>
      {image ? <img src={image} alt="" /> : <div className="ec-rm-social-empty">{t('studio.seo.rm.noShareImage')}</div>}
      <div>
        <small dir="ltr">{origin.replace(/^https?:\/\//, '').toUpperCase()}</small>
        <strong dir="auto">{title}</strong>
        <span dir="auto">{description}</span>
      </div>
    </div>
  );
};

const TestsList = ({ analysis }: { analysis: SeoAnalysis }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Record<SeoTestGroup, boolean>>({ basic: true, additional: true, title: false, content: false });
  return (
    <div className="ec-rm-tests">
      {SEO_GROUPS.map((group) => {
        const tests = analysis.tests.filter((x) => x.group === group);
        const errors = tests.filter((x) => !x.ok && !x.warn).length;
        return (
          <section key={group} className={cn('ec-rm-group', open[group] && 'is-open')}>
            <button type="button" className="ec-rm-group-head" aria-expanded={open[group]} onClick={() => setOpen({ ...open, [group]: !open[group] })}>
              <span>{t(`studio.seo.rm.groups.${group}`)}</span>
              <span className={cn('ec-rm-chip', !errors && 'is-ok')}>{errors ? t('studio.seo.rm.errors', { count: errors }) : t('studio.seo.rm.allGood')}</span>
              <ChevronDown size={16} className="ec-rm-chev" />
            </button>
            <div className="ec-rm-group-body">
              <ul className="ec-rm-checks">
                {tests.map((x) => (
                  <li key={x.id} className={x.ok ? 'is-ok' : x.warn ? 'is-warn' : 'is-ko'}>
                    <span className="ec-rm-dot">{x.ok ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}</span>
                    <span>
                      {t(`studio.seo.rm.tests.${x.id}`)}
                      <small> — {t(`studio.seo.rm.hints.${x.id}`, x.hint)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}
    </div>
  );
};

interface RankMathPanelProps {
  seo: ArticleSeo;
  onChange: (patch: Partial<ArticleSeo>) => void;
  ctx: RankMathContext;
  analysis: SeoAnalysis;
  onSlugChange?: (slug: string) => void;
}

/** Rank Math panel: score, General / Advanced / Schema / Social tabs, live tests. Same vocabulary as the plugin. */
export const RankMathPanel = ({ seo, onChange, ctx, analysis, onSlugChange }: RankMathPanelProps) => {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<RmTab>('general');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const seoTitle = seo.title || `${ctx.title} – ${ctx.brand || 'ECshape'}`;
  const tabs: RmTab[] = ctx.mode === 'article' ? ['general', 'advanced', 'schema', 'social'] : ['general', 'advanced', 'social'];
  const verdict = analysis.score >= 80 ? 'good' : analysis.score >= 50 ? 'ok' : 'bad';

  return (
    <div className="ec-rm">
      <div className="ec-rm-head">
        <ScoreBadge score={analysis.score} size="lg" />
        <div>
          <strong>Rank Math SEO</strong>
          <p>{t(`studio.seo.rm.verdict.${verdict}`)}</p>
        </div>
      </div>
      <div className="ec-rm-tabs" role="tablist" aria-label="Rank Math">
        {tabs.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={cn(tab === id && 'is-active')} onClick={() => setTab(id)}>
            {t(`studio.seo.rm.tab.${id}`)}
          </button>
        ))}
      </div>

      <div className="ec-rm-body" key={tab}>
        {tab === 'general' ? (
          <>
            <div className="ec-rm-snippet-head">
              <span>{t('studio.seo.rm.googlePreview')}</span>
              <div className="ec-rm-seg" role="group">
                <button type="button" className={cn(device === 'desktop' && 'is-active')} onClick={() => setDevice('desktop')} aria-label={t('studio.site.device.desktop')}>
                  <Monitor size={14} />
                </button>
                <button type="button" className={cn(device === 'mobile' && 'is-active')} onClick={() => setDevice('mobile')} aria-label={t('studio.site.device.mobile')}>
                  <Smartphone size={14} />
                </button>
              </div>
            </div>
            <SnippetPreview origin={ctx.origin} path={ctx.path} title={seoTitle} description={seo.description} device={device} />
            <label className="ec-rm-field">
              <span className="ec-rm-label">{t('studio.seo.rm.focusKeyword')}</span>
              <Input dir="auto" value={seo.focusKeyword} placeholder={t('studio.seo.rm.focusKeywordPh')} onChange={(e) => onChange({ focusKeyword: e.target.value })} />
              <small className="ec-rm-help">{t('studio.seo.rm.focusKeywordHelp')}</small>
            </label>
            {ctx.mode === 'article' ? (
              <label className="ec-rm-field">
                <span className="ec-rm-label">{t('studio.seo.rm.secondaryKeywords')}</span>
                <Input
                  dir="auto"
                  value={seo.secondaryKeywords.join(', ')}
                  placeholder={t('studio.seo.rm.secondaryKeywordsPh')}
                  onChange={(e) => onChange({ secondaryKeywords: e.target.value.split(',').map((k) => k.trimStart()).slice(0, 4) })}
                />
              </label>
            ) : null}
            <label className="ec-rm-field">
              <span className="ec-rm-label">
                {t('studio.seo.rm.seoTitle')} <Counter value={seo.title} min={50} max={60} />
              </span>
              <Input dir="auto" value={seo.title} placeholder={seoTitle} onChange={(e) => onChange({ title: e.target.value })} />
            </label>
            {ctx.mode === 'article' && onSlugChange ? (
              <label className="ec-rm-field">
                <span className="ec-rm-label">
                  {t('studio.seo.rm.slug')} <Counter value={ctx.slug} min={3} max={75} />
                </span>
                <Input dir="auto" value={ctx.slug} onChange={(e) => onSlugChange(e.target.value)} />
              </label>
            ) : null}
            <label className="ec-rm-field">
              <span className="ec-rm-label">
                {t('studio.seo.rm.metaDescription')} <Counter value={seo.description} min={140} max={160} />
              </span>
              <Textarea dir="auto" rows={3} value={seo.description} onChange={(e) => onChange({ description: e.target.value })} />
            </label>
            <TestsList analysis={analysis} />
            <dl className="ec-rm-stats">
              <div>
                <dt>{t('studio.seo.rm.stats.words')}</dt>
                <dd>{analysis.stats.words}</dd>
              </div>
              <div>
                <dt>{t('studio.seo.rm.stats.density')}</dt>
                <dd>{analysis.stats.density.toLocaleString(i18n.language)}%</dd>
              </div>
              <div>
                <dt>{t('studio.seo.rm.stats.internal')}</dt>
                <dd>{analysis.stats.internalLinks}</dd>
              </div>
              <div>
                <dt>{t('studio.seo.rm.stats.external')}</dt>
                <dd>{analysis.stats.externalLinks}</dd>
              </div>
            </dl>
          </>
        ) : null}

        {tab === 'advanced' ? (
          <>
            <p className="ec-rm-label">{t('studio.seo.rm.robotsMeta')}</p>
            <div className="ec-rm-checklist">
              <label className="ec-rm-check">
                <input type="checkbox" checked={seo.robots !== 'noindex'} onChange={(e) => onChange({ robots: e.target.checked ? 'index' : 'noindex' })} />
                {t('studio.seo.rm.robots.index')}
              </label>
              <label className="ec-rm-check">
                <input type="checkbox" checked={seo.nofollow} onChange={(e) => onChange({ nofollow: e.target.checked })} />
                {t('studio.seo.rm.robots.nofollow')}
              </label>
              <label className="ec-rm-check">
                <input type="checkbox" checked={seo.noarchive} onChange={(e) => onChange({ noarchive: e.target.checked })} />
                {t('studio.seo.rm.robots.noarchive')}
              </label>
              <label className="ec-rm-check">
                <input type="checkbox" checked={seo.noimageindex} onChange={(e) => onChange({ noimageindex: e.target.checked })} />
                {t('studio.seo.rm.robots.noimageindex')}
              </label>
              <label className="ec-rm-check">
                <input type="checkbox" checked={seo.nosnippet} onChange={(e) => onChange({ nosnippet: e.target.checked })} />
                {t('studio.seo.rm.robots.nosnippet')}
              </label>
            </div>
            <label className="ec-rm-field">
              <span className="ec-rm-label">{t('studio.seo.rm.canonical')}</span>
              <Input dir="ltr" value={seo.canonical} placeholder={`${ctx.origin}${ctx.path}`} onChange={(e) => onChange({ canonical: e.target.value })} />
              <small className="ec-rm-help">{t('studio.seo.rm.canonicalHelp')}</small>
            </label>
            {ctx.mode === 'article' ? (
              <label className="ec-rm-check">
                <input type="checkbox" checked={seo.pillar} onChange={(e) => onChange({ pillar: e.target.checked })} />
                {t('studio.seo.rm.pillar')}
              </label>
            ) : null}
          </>
        ) : null}

        {tab === 'schema' && ctx.mode === 'article' ? (
          <>
            <label className="ec-rm-field">
              <span className="ec-rm-label">{t('studio.seo.rm.schemaType')}</span>
              <Select value={seo.schemaType} onValueChange={(v) => onChange({ schemaType: v as ArticleSchemaType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['BlogPosting', 'Article', 'NewsArticle', 'none'] as const).map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`studio.seo.rm.schema.${v}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <p className="ec-rm-label">{t('studio.seo.rm.faqTitle')}</p>
            <small className="ec-rm-help">{t('studio.seo.rm.faqHelp')}</small>
            {seo.faq.map((f, i) => (
              <div key={i} className="ec-rm-faq">
                <Input dir="auto" value={f.q} placeholder={t('studio.seo.rm.question')} onChange={(e) => onChange({ faq: seo.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
                <Textarea dir="auto" rows={2} value={f.a} placeholder={t('studio.seo.rm.answer')} onChange={(e) => onChange({ faq: seo.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
                <button type="button" className="ec-rm-icon" aria-label={t('studio.site.remove')} onClick={() => onChange({ faq: seo.faq.filter((_, j) => j !== i) })}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" className="ec-rm-add" onClick={() => onChange({ faq: [...seo.faq, { q: '', a: '' }] })}>
              <Plus size={14} />
              {t('studio.seo.rm.addQuestion')}
            </button>
          </>
        ) : null}

        {tab === 'social' ? (
          <>
            <SocialPreview title={seo.ogTitle || seoTitle} description={seo.ogDescription || seo.description} image={seo.ogImage || ctx.coverImage || ''} origin={ctx.origin} />
            <label className="ec-rm-field">
              <span className="ec-rm-label">{t('studio.seo.rm.ogTitle')}</span>
              <Input dir="auto" value={seo.ogTitle} placeholder={seoTitle} onChange={(e) => onChange({ ogTitle: e.target.value })} />
            </label>
            <label className="ec-rm-field">
              <span className="ec-rm-label">{t('studio.seo.rm.ogDescription')}</span>
              <Textarea dir="auto" rows={2} value={seo.ogDescription} placeholder={seo.description} onChange={(e) => onChange({ ogDescription: e.target.value })} />
            </label>
            <label className="ec-rm-field">
              <span className="ec-rm-label">{t('studio.seo.rm.ogImage')}</span>
              <Input dir="ltr" value={seo.ogImage} placeholder={ctx.coverImage || 'https://…'} onChange={(e) => onChange({ ogImage: e.target.value })} />
            </label>
          </>
        ) : null}
      </div>
    </div>
  );
};
