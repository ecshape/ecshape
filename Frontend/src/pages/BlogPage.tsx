import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Clock } from 'lucide-react';
import { publicApi } from '@/lib/studioApi';
import { articlePath, readingMinutes, sanitizeArticleHtml, type Article, type ArticleSummary } from '@/lib/seo/articles';
import { toSiteLang, type SiteLang } from '@/site/content';
import '@/styles/blog.css';

const COPY: Record<SiteLang, { eyebrow: string; title: string; intro: string; back: string; home: string; empty: string; read: string; faq: string; notFound: string; min: string; cta: string; ctaBtn: string }> = {
  he: {
    eyebrow: 'הבלוג',
    title: 'אימון. תזונה. ראש.',
    intro: 'מדריכים ותובנות מהשטח של ECshape — בלי קיצורי דרך.',
    back: 'כל המאמרים',
    home: 'לאתר',
    empty: 'מאמרים ראשונים בדרך.',
    read: 'לקריאה',
    faq: 'שאלות נפוצות',
    notFound: 'המאמר לא נמצא.',
    min: 'דק׳ קריאה',
    cta: 'רוצה תוכנית שבנויה בדיוק עליך?',
    ctaBtn: 'לשיחת היכרות',
  },
  en: {
    eyebrow: 'Journal',
    title: 'Training. Food. Mindset.',
    intro: 'Guides and field notes from ECshape — no shortcuts.',
    back: 'All articles',
    home: 'Website',
    empty: 'First articles are on the way.',
    read: 'Read',
    faq: 'Frequently asked questions',
    notFound: 'Article not found.',
    min: 'min read',
    cta: 'Want a plan built around you?',
    ctaBtn: 'Book an intro call',
  },
  fr: {
    eyebrow: 'Journal',
    title: 'Entraînement. Nutrition. Mental.',
    intro: 'Guides et notes de terrain par ECshape — sans raccourcis.',
    back: 'Tous les articles',
    home: 'Site',
    empty: 'Les premiers articles arrivent.',
    read: 'Lire',
    faq: 'Questions fréquentes',
    notFound: 'Article introuvable.',
    min: 'min de lecture',
    cta: 'Envie d’un programme construit pour vous ?',
    ctaBtn: 'Réserver un appel',
  },
};

function useBlogLang(): SiteLang {
  const [params] = useSearchParams();
  const { i18n } = useTranslation();
  return toSiteLang(params.get('lang') || i18n.language);
}

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function useJsonLd(data: object | null) {
  useEffect(() => {
    if (!data) return;
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.text = JSON.stringify(data);
    document.head.appendChild(s);
    return () => s.remove();
  }, [data]);
}

const fmtDate = (iso: string | null, lang: SiteLang) =>
  iso ? new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : lang, { day: 'numeric', month: 'long', year: 'numeric' }) : '';

const Shell = ({ lang, children }: { lang: SiteLang; children: React.ReactNode }) => (
  <div className="ec-blog" dir={lang === 'he' ? 'rtl' : 'ltr'} lang={lang}>
    <header className="ec-blog-nav">
      <Link to={`/home?lang=${lang}`} className="ec-blog-logo">
        <b>EC</b>shape
      </Link>
      <Link to={`/blog?lang=${lang}`} className="ec-blog-navlink">
        {COPY[lang].eyebrow}
      </Link>
    </header>
    {children}
    <div className="ec-blog-grain" aria-hidden />
  </div>
);

const BlogIndex = () => {
  const lang = useBlogLang();
  const c = COPY[lang];
  const [items, setItems] = useState<ArticleSummary[] | null>(null);

  useEffect(() => {
    document.title = `${c.eyebrow} — ECshape`;
    setMeta('description', c.intro);
    publicApi.articles(lang).then(setItems).catch(() => setItems([]));
  }, [lang, c]);

  const [lead, ...rest] = items || [];
  return (
    <Shell lang={lang}>
      <main className="ec-blog-index">
        <section className="ec-blog-hero">
          <p className="ec-blog-eyebrow">{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
        </section>
        {items === null ? (
          <div className="ec-blog-grid">
            {[0, 1, 2].map((i) => (
              <span key={i} className="ec-blog-card is-skeleton" />
            ))}
          </div>
        ) : !items.length ? (
          <p className="ec-blog-empty">{c.empty}</p>
        ) : (
          <>
            {lead ? (
              <Link to={articlePath(lead.slug, lang)} className="ec-blog-lead">
                {lead.coverImage ? <img src={lead.coverImage} alt={lead.coverAlt} /> : <span className="ec-blog-cover-empty" />}
                <span>
                  <small>{fmtDate(lead.publishedAt, lang)}</small>
                  <b dir="auto">{lead.title}</b>
                  <em dir="auto">{lead.excerpt}</em>
                  <i>
                    {c.read} <ArrowUpRight size={16} />
                  </i>
                </span>
              </Link>
            ) : null}
            <div className="ec-blog-grid">
              {rest.map((a, i) => (
                <Link key={a.id} to={articlePath(a.slug, lang)} className="ec-blog-card" style={{ ['--i' as string]: i }}>
                  {a.coverImage ? <img src={a.coverImage} alt={a.coverAlt} loading="lazy" /> : <span className="ec-blog-cover-empty" />}
                  <small>{fmtDate(a.publishedAt, lang)}</small>
                  <b dir="auto">{a.title}</b>
                  <em dir="auto">{a.excerpt}</em>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </Shell>
  );
};

const BlogArticle = () => {
  const { slug = '' } = useParams();
  const lang = useBlogLang();
  const c = COPY[lang];
  const [article, setArticle] = useState<Article | null | undefined>(undefined);

  useEffect(() => {
    setArticle(undefined);
    publicApi.article(slug, lang).then(setArticle).catch(() => setArticle(null));
  }, [slug, lang]);

  useEffect(() => {
    if (!article) return;
    const seo = article.seo;
    document.title = seo.title || `${article.title} — ECshape`;
    setMeta('description', seo.description || article.excerpt);
    const robots = [seo.robots === 'noindex' ? 'noindex' : 'index', seo.nofollow ? 'nofollow' : 'follow', seo.noarchive && 'noarchive', seo.noimageindex && 'noimageindex', seo.nosnippet && 'nosnippet'].filter(Boolean).join(', ');
    setMeta('robots', robots);
    setMeta('og:title', seo.ogTitle || seo.title || article.title, 'property');
    setMeta('og:description', seo.ogDescription || seo.description || article.excerpt, 'property');
    if (seo.ogImage || article.coverImage) setMeta('og:image', seo.ogImage || article.coverImage, 'property');
    setMeta('og:type', 'article', 'property');
  }, [article]);

  const jsonLd = useMemo(() => {
    if (!article) return null;
    const graph: object[] = [];
    if (article.seo.schemaType !== 'none') {
      graph.push({
        '@type': article.seo.schemaType,
        headline: article.seo.title || article.title,
        description: article.seo.description || article.excerpt,
        image: article.coverImage || undefined,
        datePublished: article.publishedAt,
        dateModified: article.updatedAt,
        inLanguage: article.lang,
        author: { '@type': 'Person', name: article.authorName || 'ECshape' },
        mainEntityOfPage: `${window.location.origin}${articlePath(article.slug)}`,
      });
    }
    if (article.seo.faq.length) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: article.seo.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      });
    }
    return graph.length ? { '@context': 'https://schema.org', '@graph': graph } : null;
  }, [article]);
  useJsonLd(jsonLd);

  if (article === undefined) {
    return (
      <Shell lang={lang}>
        <main className="ec-blog-article">
          <span className="ec-blog-skel is-title" />
          <span className="ec-blog-skel is-line" />
          <span className="ec-blog-skel is-block" />
        </main>
      </Shell>
    );
  }
  if (!article) {
    return (
      <Shell lang={lang}>
        <main className="ec-blog-article">
          <p className="ec-blog-empty">{c.notFound}</p>
          <Link to={`/blog?lang=${lang}`} className="ec-blog-back">
            <ArrowLeft size={16} className="rtl:-scale-x-100" />
            {c.back}
          </Link>
        </main>
      </Shell>
    );
  }

  const html = sanitizeArticleHtml(article.contentHtml);
  return (
    <Shell lang={toSiteLang(article.lang)}>
      <main className="ec-blog-article">
        <Link to={`/blog?lang=${article.lang}`} className="ec-blog-back">
          <ArrowLeft size={16} className="rtl:-scale-x-100" />
          {c.back}
        </Link>
        <header className="ec-blog-article-head">
          <h1 dir="auto">{article.title}</h1>
          {article.excerpt ? <p dir="auto">{article.excerpt}</p> : null}
          <div className="ec-blog-meta">
            <span>{article.authorName || 'ECshape'}</span>
            <span>{fmtDate(article.publishedAt, toSiteLang(article.lang))}</span>
            <span>
              <Clock size={14} /> {readingMinutes(html)} {c.min}
            </span>
          </div>
        </header>
        {article.coverImage ? <img className="ec-blog-cover" src={article.coverImage} alt={article.coverAlt} /> : null}
        <div className="ec-article-body" dir="auto" dangerouslySetInnerHTML={{ __html: html }} />
        {article.seo.faq.length ? (
          <section className="ec-blog-faq">
            <h2>{c.faq}</h2>
            {article.seo.faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </section>
        ) : null}
        <aside className="ec-blog-cta">
          <b>{c.cta}</b>
          <Link to={`/home?lang=${article.lang}#contact`} className="ec-blog-cta-btn">
            {c.ctaBtn}
            <ArrowUpRight size={16} />
          </Link>
        </aside>
      </main>
    </Shell>
  );
};

const BlogPage = () => {
  const { slug } = useParams();
  return slug ? <BlogArticle /> : <BlogIndex />;
};

export default BlogPage;
