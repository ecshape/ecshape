import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import '../site/site.css';
import '../site/siteEdit.css';
import { initSite } from '../site/siteMotion';
import { startEditBridge } from '../site/editBridge';
import { isEditFrame, isPreviewFrame } from '../site/editProtocol';
import { DEFAULT_CONTENT, loadPublicSite, toSiteLang, type PublicSite, type SiteLang } from '../site/content';
import { setLanguage } from '../i18n/setLanguage';

const setMeta = (name: string, value?: string, attr: 'name' | 'property' = 'name') => {
  if (!value) return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = value;
};

/**
 * Public ECshape site (home page for visitors). Content = defaults (src/site/content) merged with
 * what the trainer edits in Studio → Mon site. Language follows the app language (he / en / fr).
 */
const SitePage = () => {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const location = useLocation();
  // ?lang=xx previews one language without changing the visitor's saved choice (used by Studio → Mon site)
  const forced = new URLSearchParams(location.search).get('lang');
  const lang = toSiteLang(forced || i18n.language);
  // Studio -> My site: ?ec-edit=1 inside the studio iframe = visual editor (content comes from the studio draft);
  // ?ec-preview=1 = scaled live thumbnail (no intro loader, no cookie banner).
  const [editing] = useState(() => isEditFrame(location.search));
  const [previewing] = useState(() => isPreviewFrame(location.search));
  const [site, setSite] = useState<PublicSite>({ content: DEFAULT_CONTENT[lang], seo: {}, social: {} });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!editing || !ref.current) return;
    return startEditBridge(ref.current, lang);
  }, [editing, lang]);

  useEffect(() => {
    if (editing) return;
    let alive = true;
    setReady(false);
    loadPublicSite(lang).then((s) => {
      if (!alive) return;
      setSite(s);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [lang, editing]);

  useEffect(() => {
    if (editing || !ready || !ref.current) return;
    const prevTitle = document.title;
    document.title = site.seo.title || site.content.meta.title;
    setMeta('description', site.seo.description || site.content.meta.description);
    setMeta('og:title', site.seo.title || site.content.meta.title, 'property');
    setMeta('og:description', site.seo.description || site.content.meta.description, 'property');
    if (site.seo.keywords) setMeta('keywords', site.seo.keywords);
    const cleanup = initSite(ref.current, {
      navigate,
      content: site.content,
      lang,
      mode: previewing ? 'preview' : 'live',
      onLang: (l: SiteLang) => {
        setLanguage(l);
        if (forced) navigate({ search: `?lang=${l}` }, { replace: true });
      },
    });
    return () => {
      cleanup();
      document.title = prevTitle;
    };
  }, [ready, site, lang, navigate, editing, previewing]);

  return (
    <div
      ref={ref}
      className="ec-site"
      dir={lang === 'he' ? 'rtl' : 'ltr'}
      lang={lang}
      style={ready || editing ? undefined : { minHeight: '100vh', background: '#0b0a08' }}
    />
  );
};

export default SitePage;
