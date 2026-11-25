import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from 'lucide-react';
import { publicApi, studioApi, type SitePage } from '@/lib/studioApi';
import { sanitizeArticleHtml } from '@/lib/seo/articles';
import { loadPublicSite, toSiteLang, type SiteLang } from '@/site/content';
import { cleanTarget } from '@/site/links';
import { isRtlLang } from '@/lib/utils';
import '@/styles/blog.css';

/** Pages of the site created in Studio or by Agent EC, served at /p/<slug> (same look as the blog). */
const COPY: Record<SiteLang, { home: string; blog: string; notFound: string; draft: string; cta: string; ctaBtn: string }> = {
  he: { home: 'לאתר', blog: 'הבלוג', notFound: 'הדף לא נמצא.', draft: 'טיוטה — רק את/ה רואה את הדף הזה', cta: 'רוצה תוכנית שבנויה בדיוק עליך?', ctaBtn: 'לשיחת היכרות' },
  en: { home: 'Website', blog: 'Journal', notFound: 'Page not found.', draft: 'Draft — only you can see this page', cta: 'Want a plan built around you?', ctaBtn: 'Book an intro call' },
  fr: { home: 'Site', blog: 'Journal', notFound: 'Page introuvable.', draft: 'Brouillon — vous seul voyez cette page', cta: 'Envie d’un programme construit pour vous ?', ctaBtn: 'Réserver un appel' },
  ru: { home: 'Сайт', blog: 'Блог', notFound: 'Страница не найдена.', draft: 'Черновик', cta: 'Хотите план под себя?', ctaBtn: 'Записаться' },
  ar: { home: 'الموقع', blog: 'المدونة', notFound: 'الصفحة غير موجودة.', draft: 'مسودة', cta: 'تريد خطة مبنية عليك؟', ctaBtn: 'احجز مكالمة' },
};

function setMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.content = content;
}

const CustomSitePage = () => {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const { i18n } = useTranslation();
  const lang = toSiteLang(params.get('lang') || i18n.language);
  const preview = params.get('preview') === '1';
  const [page, setPage] = useState<SitePage | null | undefined>(undefined);
  const [menu, setMenu] = useState<{ label: string; href: string }[]>([]);

  useEffect(() => {
    setPage(undefined);
    const fromStudio = () => studioApi.sitePages().then((all) => all.find((p) => p.slug === slug && p.lang === lang) || all.find((p) => p.slug === slug) || null);
    (preview ? fromStudio().catch(() => null) : Promise.reject())
      .then((p) => p || publicApi.page(slug, lang))
      .catch(() => publicApi.page(slug, lang))
      .then(setPage)
      .catch(() => setPage(null));
  }, [slug, lang, preview]);

  useEffect(() => {
    loadPublicSite(lang).then((s) => setMenu((s.content.menu?.items || []).filter((m) => m.label && cleanTarget(m.href)))).catch(() => setMenu([]));
  }, [lang]);

  useEffect(() => {
    if (!page) return;
    document.title = page.seo?.title || `${page.title} — ECshape`;
    setMeta('description', page.seo?.description || page.intro || '');
    setMeta('robots', page.status === 'published' ? 'index, follow' : 'noindex');
  }, [page]);

  const c = COPY[lang];
  const pageLang = page ? toSiteLang(page.lang) : lang;
  const menuHref = (href: string) => (href.startsWith('#') ? `/home?lang=${pageLang}${href}` : href);

  return (
    <div className="ec-blog" dir={isRtlLang(pageLang) ? 'rtl' : 'ltr'} lang={pageLang}>
      <header className="ec-blog-nav">
        <Link to={`/home?lang=${pageLang}`} className="ec-blog-logo">
          <b>EC</b>shape
        </Link>
        <nav className="ec-blog-navlinks">
          {menu.length
            ? menu.map((m) =>
                /^https?:/i.test(m.href) ? (
                  <a key={m.href + m.label} href={m.href} className="ec-blog-navlink" target="_blank" rel="noopener">{m.label}</a>
                ) : (
                  <Link key={m.href + m.label} to={menuHref(m.href)} className="ec-blog-navlink" aria-current={m.href === `/p/${slug}` ? 'page' : undefined}>{m.label}</Link>
                ),
              )
            : (
              <>
                <Link to={`/home?lang=${pageLang}`} className="ec-blog-navlink">{c.home}</Link>
                <Link to={`/blog?lang=${pageLang}`} className="ec-blog-navlink">{c.blog}</Link>
              </>
            )}
        </nav>
      </header>
      <main className="ec-blog-article">
        {page === undefined ? (
          <>
            <span className="ec-blog-skel is-title" />
            <span className="ec-blog-skel is-line" />
            <span className="ec-blog-skel is-block" />
          </>
        ) : !page ? (
          <p className="ec-blog-empty">{c.notFound}</p>
        ) : (
          <>
            {page.status !== 'published' ? <p className="ec-blog-draft">{c.draft}</p> : null}
            <header className="ec-blog-article-head">
              <h1 dir="auto">{page.title}</h1>
              {page.intro ? <p dir="auto">{page.intro}</p> : null}
            </header>
            {page.coverImage ? <img className="ec-blog-cover" src={page.coverImage} alt="" /> : null}
            <div className="ec-article-body" dir="auto" dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(page.contentHtml) }} />
            {page.cta ? (
              <aside className="ec-blog-cta">
                <b>{c.cta}</b>
                <Link to={`/home?lang=${page.lang}#contact`} className="ec-blog-cta-btn">
                  {c.ctaBtn}
                  <ArrowUpRight size={16} />
                </Link>
              </aside>
            ) : null}
          </>
        )}
      </main>
      <div className="ec-blog-grain" aria-hidden />
    </div>
  );
};

export default CustomSitePage;
