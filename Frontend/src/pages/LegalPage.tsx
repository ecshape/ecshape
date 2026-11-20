import React, { useEffect } from 'react';
import { isRtlLang } from '@/lib/utils';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { legalNavFor, legalPageFor } from '@/legal/i18n';
import { LEGAL_DOCS, type LegalDoc } from '@/legal/content';

const DOCS: LegalDoc[] = LEGAL_DOCS;

/** QA #84: privacy policy, terms of use, accessibility statement and credits & licences, in the site language. */
const LegalPage: React.FC = () => {
  const { doc: raw } = useParams<{ doc: string }>();
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'he').slice(0, 2);
  const doc = (DOCS.includes(raw as LegalDoc) ? raw : 'privacy') as LegalDoc;
  const page = legalPageFor(lang, doc);
  const nav = legalNavFor(lang);
  const rtl = isRtlLang(lang);
  const Back = rtl ? ArrowRight : ArrowLeft;

  useEffect(() => {
    const prev = document.title;
    document.title = `${page.title} · ECshape`;
    const hash = window.location.hash.slice(1);
    const target = hash ? document.getElementById(hash) : null;
    if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
    return () => { document.title = prev; };
  }, [page.title]);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} lang={lang} className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/home" className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Back className="h-4 w-4" />{nav.back}
          </Link>
          <span className="font-num text-lg tracking-wide" dir="ltr">EC<b className="text-primary">SHAPE</b></span>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-3 pb-2" aria-label={nav.footerLabel}>
          {DOCS.map((d) => (
            <Link key={d} to={`/legal/${d}`} aria-current={d === doc ? 'page' : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${d === doc ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-foreground/[.06]'}`}>
              {nav[d]}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <h1 dir="auto" className="font-display text-4xl leading-tight sm:text-5xl">{page.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{nav.updatedLabel}: <time dateTime={page.updated}>{new Date(page.updated).toLocaleDateString({ he: 'he-IL', fr: 'fr-FR', ru: 'ru-RU', ar: 'ar' }[lang] ?? 'en-GB')}</time></p>
        <p dir="auto" className="mt-6 text-base leading-relaxed">{page.intro}</p>
        {page.sections.map((s) => (
          <section key={s.h} id={s.id} className="mt-8 scroll-mt-28">
            <h2 dir="auto" className="text-xl font-bold">{s.h}</h2>
            {s.p.length > 1 ? (
              <ul className="mt-3 list-disc space-y-2 ps-5 leading-relaxed text-foreground/90">{s.p.map((x) => <li key={x} dir="auto">{x}</li>)}</ul>
            ) : (
              <p dir="auto" className="mt-3 leading-relaxed text-foreground/90">{s.p[0]}</p>
            )}
          </section>
        ))}
      </main>
    </div>
  );
};

export default LegalPage;
