/**
 * Builds the public site's HTML from editable content. Class names match site.css / siteMotion.js.
 * All text is escaped; only icons and structure are raw HTML.
 */
import type { SiteContent, SiteLang } from './content/types';
import { hiddenSections, sectionOrder, type SectionKey } from './sections';

const P = '/site/photos/';
const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z"/></svg>';
const ICONS = {
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  loop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12"/></svg>',
  bowl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c4.4 0 8-3.6 8-8H4c0 4.4 3.6 8 8 8z"/><path d="M12 3c-1.5 2-1.5 4 0 6M8 5c-1 1.5-1 3 0 4M16 5c1 1.5 1 3 0 4"/></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/></svg>',
};
/** WhatsApp glyph (vector, so it stays sharp at any density). Bubble = currentColor, handset = --wa-handset. */
export const WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.2a9.8 9.8 0 0 0-8.4 14.8L2.2 21.8l4.9-1.3A9.8 9.8 0 1 0 12 2.2z"/><path fill="var(--wa-handset, #22c55e)" d="M8.9 6.9c-.2-.4-.4-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.1 1.3 3.3c.2.2 2.2 3.5 5.5 4.8 2.7 1.1 3.3.9 3.9.8.6-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.1-.3-.2-.6-.4l-2-1c-.3-.1-.5-.2-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.2z"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const APP_ICONS = [ICONS.dumbbell, ICONS.bowl, ICONS.trend, ICONS.chat];
const STEP_ICONS = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 3.5h6M8.5 10h7M8.5 14h7M8.5 18h4"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  ICONS.dumbbell,
  ICONS.trend,
];

/** Visuals of the "why" cards (original SVG; animated in site.css, still when motion is reduced). */
function shiftArt(i: number, lang: SiteLang) {
  if (i % 3 === 0) {
    const ticks = Array.from({ length: 12 }, (_, k) => `<line x1="100" y1="22" x2="100" y2="${k % 3 ? 32 : 40}" transform="rotate(${k * 30} 100 100)"/>`).join('');
    return `<svg class="art-clock" viewBox="0 0 200 200"><circle class="art-clock__ring" cx="100" cy="100" r="88"/><circle class="art-clock__arc" cx="100" cy="100" r="88" pathLength="100"/><g class="art-clock__ticks">${ticks}</g><line class="art-clock__h" x1="100" y1="100" x2="100" y2="58"/><line class="art-clock__m" x1="100" y1="100" x2="100" y2="34"/><circle cx="100" cy="100" r="6" class="art-clock__pin"/></svg>`;
  }
  if (i % 3 === 1) {
    const rows = [0, 1, 2, 3].map((k) => `<g class="art-list__row" style="--k:${k}"><rect x="20" y="${30 + k * 40}" width="26" height="26" rx="8"/><path class="art-list__tick" d="M26 ${44 + k * 40}l5 5 10-11" pathLength="1"/><rect class="art-list__bar" x="60" y="${37 + k * 40}" width="${[110, 86, 120, 70][k]}" height="12" rx="6"/></g>`).join('');
    return `<svg class="art-list" viewBox="0 0 200 200">${rows}</svg>`;
  }
  return `<div class="art-phone"><img src="${appShot(lang, 2)}" alt="" loading="lazy"><span class="art-chip">${lang === 'he' ? '−6.5 ק״ג' : lang === 'fr' ? '−6,5 kg' : '−6.5 kg'}</span></div>`;
}

/** Visual header of each program card. */
function programArt(id: string, lang: SiteLang) {
  if (id === 'online') return `<div class="prog__art prog__art--app"><img src="${appShot(lang, 0)}" alt="" loading="lazy"><img src="${appShot(lang, 1)}" alt="" loading="lazy"></div>`;
  if (id === 'group') {
    const dots = [0, 1, 2, 3, 4, 5].map((k) => `<i style="--k:${k}"></i>`).join('');
    return `<div class="prog__art prog__art--group" aria-hidden="true"><span class="prog__crowd">${dots}</span></div>`;
  }
  return `<div class="prog__art prog__art--photo"><img src="${P}opt/trainer.jpg" alt="" loading="lazy" data-parallax></div>`;
}

const LANGS: { code: SiteLang; label: string }[] = [
  { code: 'he', label: 'עב' },
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
];

export function waLink(c: SiteContent) {
  return `https://wa.me/${encodeURIComponent(c.contact.whatsapp)}?text=${encodeURIComponent(c.contact.whatsappText)}`;
}

/** Real screenshots of the client app, captured from the portal (see scripts in Frontend/scripts). */
export function appShot(lang: SiteLang, i: number) {
  return `${P}app/${lang}/${i + 1}.jpg?v=4`;
}

export interface RenderOptions {
  /** Studio edit mode: every editable text / photo / list item carries its content path, hidden sections stay visible (ghosted). */
  edit?: boolean;
}

export function renderSite(c: SiteContent, lang: SiteLang, opts: RenderOptions = {}): string {
  const edit = !!opts.edit;
  /** data-ec-path: inline-editable text (studio only). */
  const P_ = (path: string) => (edit ? ` data-ec-path="${esc(path)}"` : '');
  /** Text wrapped in a span carrying its path (text mixed with other markup). */
  const T = (path: string, value: unknown) => (edit ? `<span data-ec-path="${esc(path)}">${esc(value)}</span>` : esc(value));
  const IMG = (path: string) => (edit ? ` data-ec-img="${esc(path)}"` : '');
  const ITEM = (path: string) => (edit ? ` data-ec-item="${esc(path)}"` : '');
  const splitLines = (a: string, pa: string, b: string, pb: string, cls = '') =>
    `<span class="line"${P_(pa)}>${esc(a)}</span><span class="line ${cls || 'accent'}"${P_(pb)}>${esc(b)}</span>`;
  const titles = (g: 'story' | 'results' | 'shift' | 'programs' | 'app' | 'process' | 'voices' | 'faq') =>
    splitLines(c[g].title1, `${g}.title1`, c[g].title2, `${g}.title2`);

  const hidden = hiddenSections(c.layout);
  const order = sectionOrder(c.layout);
  const wa = waLink(c);
  const ig = `https://www.instagram.com/${encodeURIComponent(c.contact.instagram)}`;
  const name = lang === 'he' ? 'אליאור קרמיזי' : 'Elior Cremisi';
  const heroImg = c.hero.image || `${P}opt/trainer.jpg`;
  const storyImg = c.story.image || `${P}opt/trainer_story.jpg`;
  const navItems = ([
    ['story', '#story', 'about'], ['results', '#results', 'results'], ['programs', '#programs', 'programs'],
    ['app', '#app', 'app'], ['voices', '#voices', 'reviews'], ['faq', '#faq', 'faq'],
  ] as const).filter(([key]) => !hidden.has(key));
  const langSwitch = `<div class="lang-switch" role="group" aria-label="Language">${LANGS.map(
    (l) => `<button type="button" data-lang="${l.code}" class="${l.code === lang ? 'is-on' : ''}" aria-pressed="${l.code === lang}">${l.label}</button>`
  ).join('')}</div>`;

  const sections: Record<SectionKey, () => string> = {
    hero: () => `
<section class="hero" id="hero">
  <div class="hero__bg" aria-hidden="true"></div>
  <figure class="hero__media" data-cursor="ECshape"${IMG('hero.image')}>
    <img src="${esc(heroImg)}" alt="${esc(name)}" fetchpriority="high">
  </figure>
  <div class="hero__content">
    <span class="eyebrow" data-reveal${P_('hero.eyebrow')}>${esc(c.hero.eyebrow)}</span>
    <h1 class="hero__title display h-xl" data-split>${splitLines(c.hero.title1, 'hero.title1', c.hero.title2, 'hero.title2', 'grad-text')}</h1>
    <p class="hero__sub lead" data-reveal${P_('hero.sub')}>${esc(c.hero.sub)}</p>
    <div class="hero__ctas" data-reveal>
      <span class="magnetic"><button type="button" class="btn btn--primary btn--shine" data-open-form data-source="hero" data-icon="arrow"${P_('hero.ctaPrimary')}>${esc(c.hero.ctaPrimary)}</button></span>
      <span class="magnetic"><a class="btn btn--wa" href="${wa}" target="_blank" rel="noopener" data-icon="wa"${P_('hero.ctaSecondary')}>${esc(c.hero.ctaSecondary)}</a></span>
    </div>
  </div>
  <div class="hero__stats" data-reveal>
    ${c.hero.stats.map((s, i) => `<div class="chip"${ITEM(`hero.stats.${i}`)}><span class="num" data-count="${Number(s.value) || 0}" data-suffix="${esc(s.suffix)}">${esc(s.value)}${esc(s.suffix)}</span><small${P_(`hero.stats.${i}.label`)}>${esc(s.label)}</small></div>`).join('')}
  </div>
  <div class="hero__scroll" aria-hidden="true"><i></i>${T('hero.scroll', c.hero.scroll)}</div>
  <div class="hero__caption" aria-hidden="true"><div class="display">${T('hero.caption', c.hero.caption)} <span class="accent"${P_('hero.captionAccent')}>${esc(c.hero.captionAccent)}</span></div></div>
</section>`,

    marquee: () => `
<div class="marquee" aria-hidden="true">
  <div class="marquee__row" data-marquee="1"><div class="marquee__item">${c.marquee.row1.map((w, i) => `${T(`marquee.row1.${i}`, w)} ${STAR}`).join(' ')}</div></div>
  <div class="marquee__row marquee__row--outline" data-marquee="-1"><div class="marquee__item">${c.marquee.row2.map((w, i) => `${T(`marquee.row2.${i}`, w)} ${STAR}`).join(' ')}</div></div>
</div>`,

    manifesto: () => `
<section class="section manifesto">
  <div class="wrap manifesto__grid">
    <div class="manifesto__copy">
      <span class="eyebrow" data-reveal${P_('manifesto.eyebrow')}>${esc(c.manifesto.eyebrow)}</span>
      <p class="manifesto__text" data-words>${T('manifesto.text', c.manifesto.text)} <span class="hl"${P_('manifesto.highlight')}>${esc(c.manifesto.highlight)}</span></p>
      <div class="manifesto__sig" data-reveal>
        <img src="${esc(storyImg)}" alt="" width="64" height="64" loading="lazy">
        <div><b>${esc(name)}</b><small${P_('manifesto.role')}>${esc(c.manifesto.role)}</small></div>
      </div>
    </div>
    <div class="manifesto__art" aria-hidden="true">
      <svg class="mart__ring" viewBox="0 0 200 200"><g class="mart__spin">${Array.from({ length: 60 }, (_, k) => `<line x1="100" y1="4" x2="100" y2="${k % 5 ? 9 : 14}" transform="rotate(${k * 6} 100 100)"/>`).join('')}<circle class="mart__arc" cx="100" cy="100" r="88" pathLength="100"/></g></svg>
      <figure class="mart__photo"><img src="${P}opt/trainer_portrait.jpg" alt="" loading="lazy"></figure>
      ${c.hero.stats.slice(0, 3).map((s, i) => `<div class="mart__chip mart__chip--${i}"><span class="num" dir="ltr">${esc(s.value)}${esc(s.suffix)}</span><small>${esc(s.label)}</small></div>`).join('')}
    </div>
  </div>
</section>`,

    story: () => `
<section class="section" id="story" style="padding-top:0">
  <div class="wrap story">
    <figure class="story__media" data-cursor="${esc(name.split(' ')[0])}"${IMG('story.image')}>
      <img src="${esc(storyImg)}" alt="${esc(name)}" loading="lazy" data-parallax>
      <figcaption><b>${esc(name)}</b><span${P_('story.photoRole')}>${esc(c.story.photoRole)}</span></figcaption>
    </figure>
    <div class="story__body">
      <span class="eyebrow" data-reveal${P_('story.eyebrow')}>${esc(c.story.eyebrow)}</span>
      <h2 class="display h-lg" data-split style="margin:20px 0 32px">${titles('story')}</h2>
      <p data-reveal>${T('story.p1', c.story.p1)} <strong${P_('story.p1Strong')}>${esc(c.story.p1Strong)}</strong>.</p>
      <p data-reveal>${T('story.p2', c.story.p2)} <strong${P_('story.p2Strong')}>${esc(c.story.p2Strong)}</strong>.</p>
      <div class="bento" data-stagger>
        ${c.story.values.map((v, i) => `<div class="bento__cell"${ITEM(`story.values.${i}`)}>${[ICONS.target, ICONS.people, ICONS.loop][i % 3]}<div><h3${P_(`story.values.${i}.title`)}>${esc(v.title)}</h3><p${P_(`story.values.${i}.text`)}>${esc(v.text)}</p></div></div>`).join('')}
        <div class="bento__cell bento__cell--accent"><span class="num" data-count="${Number(c.story.statValue) || 0}" data-suffix="${esc(c.story.statSuffix)}">${esc(c.story.statValue)}${esc(c.story.statSuffix)}</span><div><h3${P_('story.statTitle')}>${esc(c.story.statTitle)}</h3><p${P_('story.statText')}>${esc(c.story.statText)}</p></div></div>
      </div>
    </div>
  </div>
</section>`,

    results: () => `
<section class="section results" id="results">
  <div class="wrap section-head section-head--split">
    <div>
      <span class="eyebrow" data-reveal${P_('results.eyebrow')}>${esc(c.results.eyebrow)}</span>
      <h2 class="display h-lg" data-split style="margin-top:20px">${titles('results')}</h2>
    </div>
    <p class="lead" data-reveal${P_('results.lead')}>${esc(c.results.lead)}</p>
  </div>
  <div class="results__pin">
    <div class="results__track">
      ${c.results.cards.map((r, i) => {
        // Built-in crops only belong to the built-in combined photos: if the trainer replaced `image` (older studio
        // flow) and kept the default crops, show the halves of the new photo instead.
        const builtinCrop = (u?: string) => !!u && u.startsWith('/site/photos/opt/results/');
        const cropsOk = !!(r.before && r.after) && (!r.image || r.image.startsWith('/site/photos/before_after_') || !builtinCrop(r.before));
        const half = (k: 'before' | 'after') => {
          const src = cropsOk ? r[k] : '';
          const label = `<figcaption class="rcard__lbl"${P_(`results.${k}`)}>${esc(c.results[k])}</figcaption>`;
          const alt = `${esc(r.title)} — ${esc(c.results[k])}`;
          // No separate crop: show the matching half of the combined photo (before = left half, as in the originals).
          return src
            ? `<figure class="rcard__half rcard__half--${k}"${IMG(`results.cards.${i}.${k}`)}><img src="${esc(src)}" alt="${alt}" loading="lazy">${label}</figure>`
            : `<figure class="rcard__half rcard__half--${k} rcard__half--split"${IMG(`results.cards.${i}.image`)}><img src="${esc(r.image)}" alt="${alt}" loading="lazy">${label}</figure>`;
        };
        const kg = r.kg
          ? `<div class="rcard__kg"><b class="num" dir="ltr">−<span${P_(`results.cards.${i}.kg`)}>${esc(String(r.kg).replace(/^[-−\s]+/, ''))}</span></b><small${P_('results.unit')}>${esc(c.results.unit)}</small></div>`
          : r.big ? `<div class="rcard__kg rcard__kg--text"><b class="num" dir="ltr"${P_(`results.cards.${i}.big`)}>${esc(r.big)}</b></div>` : '';
        const arrow = lang === 'he' ? 'M19 12H5M11 18l-6-6 6-6' : 'M5 12h14M13 6l6 6-6 6';
        return `<article class="rcard"${ITEM(`results.cards.${i}`)}>
        <div class="rcard__ba">${half('before')}${half('after')}<span class="rcard__seam" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${arrow}"/></svg></span></div>
        <div class="rcard__meta"><div class="rcard__txt"><span class="tag"${P_(`results.cards.${i}.tag`)}>${esc(r.tag)}</span><h3${P_(`results.cards.${i}.title`)}>${esc(r.title)}</h3><p${P_(`results.cards.${i}.sub`)}>${esc(r.sub)}</p></div>${kg}</div>
      </article>`;
      }).join('')}
      <article class="rcard rcard--cta">
        <div class="display"${P_('results.ctaCard')}>${esc(c.results.ctaCard)}</div>
        <button type="button" class="btn" data-open-form data-source="results" data-icon="arrow"${P_('results.ctaButton')}>${esc(c.results.ctaButton)}</button>
      </article>
    </div>
    <div class="results__progress" aria-hidden="true"><i></i></div>
  </div>
</section>`,

    shift: () => `
<section class="section" id="shift">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow" data-reveal${P_('shift.eyebrow')}>${esc(c.shift.eyebrow)}</span>
      <h2 class="display h-lg" data-split>${titles('shift')}</h2>
    </div>
    <div class="stack">
      ${c.shift.cards.map((s, i) => `<div class="stack__card" style="--i:${i}"${ITEM(`shift.cards.${i}`)}>
        <div>
          <div class="stack__from"${P_(`shift.cards.${i}.from`)}>${esc(s.from)}</div>
          <h3${P_(`shift.cards.${i}.title`)}>${esc(s.title)}</h3>
          ${s.text ? `<p style="margin-top:18px"${P_(`shift.cards.${i}.text`)}>${esc(s.text)}</p>` : ''}
          ${s.pills ? `<div class="pills">${s.pills.map((p, k) => `<span class="pill"${P_(`shift.cards.${i}.pills.${k}`)}>${esc(p)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="stack__art" aria-hidden="true"><span class="stack__idx">0${i + 1}</span>${shiftArt(i, lang)}</div>
      </div>`).join('')}
    </div>
  </div>
</section>`,

    programs: () => `
<section class="section" id="programs" style="background:var(--bg-2)">
  <div class="wrap">
    <div class="section-head section-head--split">
      <div>
        <span class="eyebrow" data-reveal${P_('programs.eyebrow')}>${esc(c.programs.eyebrow)}</span>
        <h2 class="display h-lg" data-split style="margin-top:20px">${titles('programs')}</h2>
      </div>
      <p class="lead" data-reveal${P_('programs.lead')}>${esc(c.programs.lead)}</p>
    </div>
    <div class="programs" data-stagger>
      ${c.programs.items.map((p, i) => `<article class="prog${p.featured ? ' prog--feat' : ''}"${ITEM(`programs.items.${i}`)}>
        ${programArt(p.id, lang)}
        <div class="prog__top"><span class="prog__idx">0${i + 1} /</span>${p.featured ? `<span class="badge"${P_('programs.popular')}>${esc(c.programs.popular)}</span>` : ''}</div>
        <h3${P_(`programs.items.${i}.name`)}>${esc(p.name)}</h3>
        <p${P_(`programs.items.${i}.text`)}>${esc(p.text)}</p>
        <ul>${p.features.map((f, k) => `<li${P_(`programs.items.${i}.features.${k}`)}>${esc(f)}</li>`).join('')}</ul>
        <button type="button" class="btn ${p.featured ? 'btn--primary btn--shine' : 'btn--ghost'} btn--block" data-open-form data-program="${esc(p.id)}" data-source="program" data-icon="arrow"${P_(p.featured ? 'programs.start' : 'programs.more')}>${esc(p.featured ? c.programs.start : c.programs.more)}</button>
      </article>`).join('')}
    </div>
  </div>
</section>`,

    app: () => `
<section class="section" id="app">
  <div class="wrap app">
    <div>
      <span class="eyebrow" data-reveal${P_('app.eyebrow')}>${esc(c.app.eyebrow)}</span>
      <h2 class="display h-lg" data-split style="margin-top:20px">${titles('app')}</h2>
      <p class="lead" data-reveal style="margin-top:24px"${P_('app.lead')}>${esc(c.app.lead)}</p>
      <a class="btn btn--ghost btn--sm" href="/login" data-route data-icon="arrow" style="margin-top:22px"${P_('app.already')}>${esc(c.app.already)}</a>
      <ul class="app__list" role="tablist">
        ${c.app.items.map((it, i) => `<li class="app__item${i === 0 ? ' is-active' : ''}" role="tab" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-screen="${i}"${ITEM(`app.items.${i}`)}>
          <span class="ic">${APP_ICONS[i % 4]}</span><h3${P_(`app.items.${i}.title`)}>${esc(it.title)}</h3><p${P_(`app.items.${i}.text`)}>${esc(it.text)}</p>
        </li>`).join('')}
      </ul>
    </div>
    <div class="phone-wrap">
      <div class="phone">
        <div class="phone__notch" aria-hidden="true"></div>
        <div class="phone__screen">
          ${c.app.items.map((it, i) => `<img class="screen screen--shot${i === 0 ? ' is-active' : ''}" src="${appShot(lang, i % 4)}" alt="${esc(it.title)}" loading="lazy">`).join('')}
        </div>
      </div>
    </div>
  </div>
</section>`,

    process: () => `
<section class="section" id="process" style="background:var(--bg-2)">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow" data-reveal${P_('process.eyebrow')}>${esc(c.process.eyebrow)}</span>
      <h2 class="display h-lg" data-split>${titles('process')}</h2>
    </div>
    <div class="steps">
      <div class="steps__line" aria-hidden="true"><i></i></div>
      ${c.process.steps.map((s, i) => `<div class="step"${ITEM(`process.steps.${i}`)}><div class="step__dot"><span class="step__ic" aria-hidden="true">${STEP_ICONS[i % 4]}</span><span class="step__n">${i + 1}</span></div><h3${P_(`process.steps.${i}.title`)}>${esc(s.title)}</h3><p${P_(`process.steps.${i}.text`)}>${esc(s.text)}</p></div>`).join('')}
    </div>
  </div>
</section>`,

    voices: () => `
<section class="section" id="voices">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow" data-reveal${P_('voices.eyebrow')}>${esc(c.voices.eyebrow)}</span>
      <h2 class="display h-lg" data-split>${titles('voices')}</h2>
    </div>
    <div class="quotes quotes--grid" data-stagger>
      ${c.voices.quotes.map((q, i) => `<figure class="quote"${ITEM(`voices.quotes.${i}`)}>
        <div class="quote__stars" role="img" aria-label="5/5"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg></div>
        <blockquote>“${T(`voices.quotes.${i}.text`, q.text)}”</blockquote>
        <footer><span class="avatar">${esc((q.name || '?').trim().charAt(0))}</span><div><b${P_(`voices.quotes.${i}.name`)}>${esc(q.name)}</b><small${P_(`voices.quotes.${i}.role`)}>${esc(q.role)}</small></div></footer>
      </figure>`).join('')}
    </div>
  </div>
</section>`,

    faq: () => `
<section class="section" id="faq" style="background:var(--bg-2)">
  <div class="wrap faq">
    <div class="faq__aside">
      <span class="eyebrow" data-reveal${P_('faq.eyebrow')}>${esc(c.faq.eyebrow)}</span>
      <h2 class="display h-lg" data-split style="margin-top:20px">${titles('faq')}</h2>
      <button type="button" class="btn btn--ghost" data-open-form data-source="faq" data-icon="arrow"${P_('faq.other')}>${esc(c.faq.other)}</button>
    </div>
    <div class="acc">
      ${c.faq.items.map((f, i) => `<div class="acc__item${edit ? ' is-open' : ''}"${ITEM(`faq.items.${i}`)}>
        <button type="button" class="acc__q" aria-expanded="${edit}"><span${P_(`faq.items.${i}.q`)}>${esc(f.q)}</span><i class="acc__ic" aria-hidden="true"></i></button>
        <div class="acc__a"><div><p${P_(`faq.items.${i}.a`)}>${esc(f.a)}</p></div></div>
      </div>`).join('')}
    </div>
  </div>
</section>`,

    cta: () => `
<section class="section cta" id="contact">
  <span class="eyebrow" data-reveal${P_('cta.eyebrow')}>${esc(c.cta.eyebrow)}</span>
  <h2 class="cta__title display" style="margin-top:28px">
    <span class="line"${P_('cta.title1')}>${esc(c.cta.title1)}</span>
    <span class="line fill" data-fill${P_('cta.title2')}>${esc(c.cta.title2)}</span>
  </h2>
  <p class="lead" data-reveal${P_('cta.lead')}>${esc(c.cta.lead)}</p>
  <div class="cta__btns" data-reveal>
    <span class="magnetic"><button type="button" class="btn btn--primary btn--shine" data-open-form data-source="cta" data-icon="arrow"${P_('cta.form')}>${esc(c.cta.form)}</button></span>
    <span class="magnetic"><a class="btn btn--wa" href="${wa}" target="_blank" rel="noopener" data-icon="wa"${P_('cta.whatsapp')}>${esc(c.cta.whatsapp)}</a></span>
  </div>
  <div class="trust" data-reveal>
    ${c.cta.trust.map((t, i) => `<div${ITEM(`cta.trust.${i}`)}><span class="num"${P_(`cta.trust.${i}.value`)}>${esc(t.value)}</span><small${P_(`cta.trust.${i}.label`)}>${esc(t.label)}</small></div>`).join('')}
  </div>
</section>`,

    ig: () => `
<div class="ig" data-reveal>
  <div><div class="ig__handle">@${esc(c.contact.instagram)}</div><p${P_('ig.text')}>${esc(c.ig.text)}</p></div>
  <a class="btn btn--ig" href="${ig}" target="_blank" rel="noopener" data-icon="arrow"${P_('ig.button')}>${esc(c.ig.button)}</a>
</div>`,
  };

  /* In the studio each section gets a wrapper (display: contents, so the layout is unchanged) that the editor can
     select, ghost when hidden, and label. Visitors never get hidden sections. */
  const page = order
    .filter((key) => edit || !hidden.has(key))
    .map((key) => (edit ? `<div class="ec-sec${hidden.has(key) ? ' is-ec-hidden' : ''}" data-ec-section="${key}">${sections[key]()}</div>` : sections[key]()))
    .join('\n');

  return `
<div class="grain" aria-hidden="true"></div>
<div class="cursor" aria-hidden="true"><span></span></div>

<div class="loader" aria-hidden="true">
  <div class="loader__word">ECshape<br>${esc(name)}</div>
  <div class="loader__count"><span id="loaderCount">0</span></div>
</div>

<header class="nav" id="nav"${edit ? ' data-ec-section="nav"' : ''}>
  <a href="#site-top" class="nav__logo" aria-label="ECshape">
    <img src="/brand/ec-mark-trainer.svg" alt="" width="42" height="44"><b>ECSHAPE</b>
  </a>
  <nav class="nav__links" aria-label="Main">
    ${navItems.map(([, h, k]) => `<a href="${h}" data-scramble${P_(`nav.${k}`)}>${esc(c.nav[k])}</a>`).join('')}
  </nav>
  <div class="nav__actions">
    ${langSwitch}
    <a class="btn btn--ghost btn--sm nav__login" href="/login" data-route data-icon="arrow"${P_('nav.login')}>${esc(c.nav.login)}</a>
    <button type="button" class="btn btn--primary btn--sm nav__cta" data-open-form data-source="nav" data-icon="arrow"${P_('nav.cta')}>${esc(c.nav.cta)}</button>
  </div>
  <button type="button" class="nav__menu-btn" id="menuBtn" aria-label="Menu" aria-expanded="false" aria-controls="menu"><span></span><span></span></button>
</header>

<div class="menu" id="menu" role="dialog" aria-modal="true" aria-label="Menu" aria-hidden="true" data-lenis-prevent>
  <nav aria-label="Mobile">
    ${navItems.map(([, h, k]) => `<a href="${h}"><span>${esc(c.nav[k])}</span></a>`).join('')}
  </nav>
  ${langSwitch}
  <div class="menu__ctas">
    <button type="button" class="btn btn--primary" data-open-form data-source="menu" data-icon="arrow">${esc(c.nav.cta)}</button>
    <a class="btn" href="/login" data-route data-icon="arrow">${esc(c.nav.login)}</a>
  </div>
</div>

<main id="site-top">
${page}
</main>

<footer class="footer"${edit ? ' data-ec-section="footer"' : ''}>
  <div class="footer__top">
    <a href="#site-top" class="nav__logo" aria-label="ECshape"><img src="/brand/ec-mark-trainer.svg" alt="" width="42" height="44" loading="lazy"><b>ECSHAPE</b></a>
    <nav class="footer__links">
      <a class="link-draw" href="${ig}" target="_blank" rel="noopener"${P_('footer.instagram')}>${esc(c.footer.instagram)}</a>
      <a class="link-draw" href="${wa}" target="_blank" rel="noopener"${P_('footer.whatsapp')}>${esc(c.footer.whatsapp)}</a>
      <a class="link-draw" href="#contact" data-open-form data-source="footer"${P_('footer.contact')}>${esc(c.footer.contact)}</a>
      <a class="link-draw" href="/login" data-route>${esc(c.nav.login)}</a>
      <a class="link-draw" href="#" id="cookieSettings"${P_('footer.cookies')}>${esc(c.footer.cookies)}</a>
    </nav>
  </div>
  <div class="footer__mark" aria-hidden="true">${'ECSHAPE'.split('').map((l) => `<span>${l}</span>`).join('')}</div>
  <div class="footer__bottom"><span${P_('footer.rights')}>${esc(c.footer.rights)}</span><a href="#site-top" class="link-draw"${P_('footer.back')}>${esc(c.footer.back)}</a></div>
</footer>

<a class="wa-float" href="${wa}" target="_blank" rel="noopener" aria-label="WhatsApp">${WA_SVG}</a>

<div class="form-modal" id="leadModal" role="dialog" aria-modal="true" aria-labelledby="leadTitle" aria-hidden="true">
  <div class="form-modal__backdrop" data-close-form></div>
  <div class="form-modal__panel">
    <div class="form-modal__head">
      <span class="form-modal__grab" aria-hidden="true"></span>
      <span class="eyebrow">ECshape</span>
      <button type="button" class="form-modal__close" data-close-form aria-label="${esc(c.form.close)}">${CLOSE_SVG}</button>
    </div>
    <div class="form-modal__scroll" data-lenis-prevent>
    <div class="form-modal__body">
      <h2 id="leadTitle" class="display">${esc(c.form.title)}</h2>
      <p class="lead">${esc(c.form.sub)}</p>
      <form id="leadForm" novalidate>
        <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label class="field"><span>${esc(c.form.name)}</span><input name="name" autocomplete="name" required maxlength="120"></label>
        <div class="field-row">
          <label class="field"><span>${esc(c.form.phone)}</span><input name="phone" type="tel" autocomplete="tel" maxlength="40" dir="ltr"></label>
          <label class="field"><span>${esc(c.form.email)}</span><input name="email" type="email" autocomplete="email" maxlength="160" dir="ltr"></label>
        </div>
        <fieldset class="field"><legend>${esc(c.form.goal)}</legend><div class="choice">${c.form.goals.map((g, i) => `<label><input type="radio" name="goal" value="${esc(g.value)}"${i === 0 ? ' checked' : ''}><span>${esc(g.label)}</span></label>`).join('')}</div></fieldset>
        <fieldset class="field"><legend>${esc(c.form.program)}</legend><div class="choice">${c.form.programs.map((p, i) => `<label><input type="radio" name="program" value="${esc(p.value)}"${i === 0 ? ' checked' : ''}><span>${esc(p.label)}</span></label>`).join('')}</div></fieldset>
        <label class="field"><span>${esc(c.form.message)}</span><textarea name="message" rows="3" maxlength="2000" placeholder="${esc(c.form.messagePh)}"></textarea></label>
        <p class="form-msg" role="status" aria-live="polite"></p>
        <button type="submit" class="btn btn--primary btn--block" data-icon="arrow" data-sending="${esc(c.form.sending)}" data-error="${esc(c.form.error)}" data-required="${esc(c.form.required)}">${esc(c.form.submit)}</button>
        <p class="form-privacy">${esc(c.form.privacy)}</p>
      </form>
      <div class="form-done" hidden>
        <div class="form-done__icon"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <h3 class="display" tabindex="-1">${esc(c.form.success)}</h3>
        <p class="lead">${esc(c.form.successSub)}</p>
        <button type="button" class="btn btn--ghost" data-close-form data-icon="arrow">${esc(c.form.close)}</button>
      </div>
    </div>
    </div>
  </div>
</div>

<div class="cookie" id="cookieBanner" role="dialog" aria-label="Cookies">
  <p>${esc(c.cookie.text)}</p>
  <div class="cookie__btns">
    <button type="button" class="cb-accept" id="cbAccept">${esc(c.cookie.accept)}</button>
    <button type="button" class="cb-decline" id="cbDecline">${esc(c.cookie.decline)}</button>
  </div>
</div>`;
}
