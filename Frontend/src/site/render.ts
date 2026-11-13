/**
 * Builds the public site's HTML from editable content. Class names match site.css / siteMotion.js.
 * All text is escaped; only icons and structure are raw HTML.
 */
import type { SiteContent, SiteLang } from './content/types';

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
const APP_ICONS = [ICONS.dumbbell, ICONS.bowl, ICONS.trend, ICONS.chat];

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
  return `${P}app/${lang}/${i + 1}.jpg`;
}

const splitLines = (a: string, b: string, cls = '') =>
  `<span class="line">${esc(a)}</span><span class="line ${cls || 'accent'}">${esc(b)}</span>`;

export function renderSite(c: SiteContent, lang: SiteLang): string {
  const wa = waLink(c);
  const ig = `https://www.instagram.com/${encodeURIComponent(c.contact.instagram)}`;
  const name = lang === 'he' ? 'אליאור קרמיזי' : 'Elior Cremisi';
  const navItems = [
    ['#story', c.nav.about], ['#results', c.nav.results], ['#programs', c.nav.programs],
    ['#app', c.nav.app], ['#voices', c.nav.reviews], ['#faq', c.nav.faq],
  ];
  const langSwitch = `<div class="lang-switch" role="group" aria-label="Language">${LANGS.map(
    (l) => `<button type="button" data-lang="${l.code}" class="${l.code === lang ? 'is-on' : ''}" aria-pressed="${l.code === lang}">${l.label}</button>`
  ).join('')}</div>`;

  return `
<div class="grain" aria-hidden="true"></div>
<div class="cursor" aria-hidden="true"><span></span></div>

<div class="loader" aria-hidden="true">
  <div class="loader__word">ECshape<br>${esc(name)}</div>
  <div class="loader__count"><span id="loaderCount">0</span></div>
</div>

<header class="nav" id="nav">
  <a href="#site-top" class="nav__logo" aria-label="ECshape">
    <img src="${P}logo.png" alt="" width="46" height="42"><b>ECSHAPE</b>
  </a>
  <nav class="nav__links" aria-label="Main">
    ${navItems.map(([h, t]) => `<a href="${h}" data-scramble>${esc(t)}</a>`).join('')}
  </nav>
  <div class="nav__actions">
    ${langSwitch}
    <a class="btn btn--ghost btn--sm nav__login" href="/login" data-route data-icon="arrow">${esc(c.nav.login)}</a>
    <button type="button" class="btn btn--primary btn--sm nav__cta" data-open-form data-source="nav" data-icon="arrow">${esc(c.nav.cta)}</button>
  </div>
  <button class="nav__menu-btn" id="menuBtn" aria-label="Menu" aria-expanded="false" aria-controls="menu"><span></span><span></span></button>
</header>

<div class="menu" id="menu" aria-hidden="true">
  <nav aria-label="Mobile">
    ${navItems.map(([h, t]) => `<a href="${h}"><span>${esc(t)}</span></a>`).join('')}
  </nav>
  ${langSwitch}
  <div class="menu__ctas">
    <button type="button" class="btn btn--primary" data-open-form data-source="menu" data-icon="arrow">${esc(c.nav.cta)}</button>
    <a class="btn" href="/login" data-route data-icon="arrow">${esc(c.nav.login)}</a>
  </div>
</div>

<main id="site-top">

<section class="hero" id="hero">
  <div class="hero__bg" aria-hidden="true"></div>
  <figure class="hero__media" data-cursor="ECshape">
    <img src="${P}opt/trainer.jpg" alt="${esc(name)}" fetchpriority="high">
  </figure>
  <div class="hero__content">
    <span class="eyebrow" data-reveal>${esc(c.hero.eyebrow)}</span>
    <h1 class="hero__title display h-xl" data-split>${splitLines(c.hero.title1, c.hero.title2, 'grad-text')}</h1>
    <p class="hero__sub lead" data-reveal>${esc(c.hero.sub)}</p>
    <div class="hero__ctas" data-reveal>
      <span class="magnetic"><button type="button" class="btn btn--primary btn--shine" data-open-form data-source="hero" data-icon="arrow">${esc(c.hero.ctaPrimary)}</button></span>
      <span class="magnetic"><a class="btn btn--wa" href="${wa}" target="_blank" rel="noopener" data-icon="wa">${esc(c.hero.ctaSecondary)}</a></span>
    </div>
  </div>
  <div class="hero__stats" data-reveal>
    ${c.hero.stats.map((s) => `<div class="chip"><span class="num" data-count="${Number(s.value) || 0}" data-suffix="${esc(s.suffix)}">${esc(s.value)}${esc(s.suffix)}</span><small>${esc(s.label)}</small></div>`).join('')}
  </div>
  <div class="hero__scroll" aria-hidden="true"><i></i>${esc(c.hero.scroll)}</div>
  <div class="hero__caption" aria-hidden="true"><div class="display">${esc(c.hero.caption)} <span class="accent">${esc(c.hero.captionAccent)}</span></div></div>
</section>

<div class="marquee" aria-hidden="true">
  <div class="marquee__row" data-marquee="1"><div class="marquee__item">${c.marquee.row1.map((w) => `${esc(w)} ${STAR}`).join(' ')}</div></div>
  <div class="marquee__row marquee__row--outline" data-marquee="-1"><div class="marquee__item">${c.marquee.row2.map((w) => `${esc(w)} ${STAR}`).join(' ')}</div></div>
</div>

<section class="section manifesto">
  <div class="wrap">
    <span class="eyebrow" data-reveal>${esc(c.manifesto.eyebrow)}</span>
    <p class="manifesto__text" data-words style="margin-top:28px">${esc(c.manifesto.text)} <span class="hl">${esc(c.manifesto.highlight)}</span></p>
    <div class="manifesto__sig" data-reveal>
      <img src="${P}opt/trainer_story.jpg" alt="" width="64" height="64" loading="lazy">
      <div><b>${esc(name)}</b><small>${esc(c.manifesto.role)}</small></div>
    </div>
  </div>
</section>

<section class="section" id="story" style="padding-top:0">
  <div class="wrap story">
    <figure class="story__media" data-cursor="${esc(name.split(' ')[0])}">
      <img src="${P}opt/trainer_story.jpg" alt="${esc(name)}" loading="lazy" data-parallax>
      <figcaption><b>${esc(name)}</b><span>${esc(c.story.photoRole)}</span></figcaption>
    </figure>
    <div class="story__body">
      <span class="eyebrow" data-reveal>${esc(c.story.eyebrow)}</span>
      <h2 class="display h-lg" data-split style="margin:20px 0 32px">${splitLines(c.story.title1, c.story.title2)}</h2>
      <p data-reveal>${esc(c.story.p1)} <strong>${esc(c.story.p1Strong)}</strong>.</p>
      <p data-reveal>${esc(c.story.p2)} <strong>${esc(c.story.p2Strong)}</strong>.</p>
      <div class="bento" data-stagger>
        ${c.story.values.map((v, i) => `<div class="bento__cell">${[ICONS.target, ICONS.people, ICONS.loop][i % 3]}<div><h3>${esc(v.title)}</h3><p>${esc(v.text)}</p></div></div>`).join('')}
        <div class="bento__cell bento__cell--accent"><span class="num" data-count="${Number(c.story.statValue) || 0}" data-suffix="${esc(c.story.statSuffix)}">${esc(c.story.statValue)}${esc(c.story.statSuffix)}</span><div><h3>${esc(c.story.statTitle)}</h3><p>${esc(c.story.statText)}</p></div></div>
      </div>
    </div>
  </div>
</section>

<section class="section results" id="results">
  <div class="wrap section-head section-head--split">
    <div>
      <span class="eyebrow" data-reveal>${esc(c.results.eyebrow)}</span>
      <h2 class="display h-lg" data-split style="margin-top:20px">${splitLines(c.results.title1, c.results.title2)}</h2>
    </div>
    <p class="lead" data-reveal>${esc(c.results.lead)}</p>
  </div>
  <div class="results__pin">
    <div class="results__track">
      ${c.results.cards.map((r) => `<article class="rcard${r.tall ? ' rcard--tall' : ''}" data-cursor="✦">
        <div class="rcard__img"><img src="${esc(r.image)}" alt="${esc(r.title)} — ${esc(r.tag)}" loading="lazy"></div>
        <div class="rcard__meta"><div><span class="tag">${esc(r.tag)}</span><h3>${esc(r.title)}</h3><p>${esc(r.sub)}</p></div>${r.big ? `<div class="rcard__big">${esc(r.big)}</div>` : ''}</div>
      </article>`).join('')}
      <article class="rcard rcard--cta">
        <div class="display">${esc(c.results.ctaCard)}</div>
        <button type="button" class="btn" data-open-form data-source="results" data-icon="arrow">${esc(c.results.ctaButton)}</button>
      </article>
    </div>
    <div class="results__progress" aria-hidden="true"><i></i></div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow" data-reveal>${esc(c.shift.eyebrow)}</span>
      <h2 class="display h-lg" data-split>${splitLines(c.shift.title1, c.shift.title2)}</h2>
    </div>
    <div class="stack">
      ${c.shift.cards.map((s, i) => `<div class="stack__card" style="--i:${i}">
        <div>
          <div class="stack__from">${esc(s.from)}</div>
          <h3>${esc(s.title)}</h3>
          ${s.text ? `<p style="margin-top:18px">${esc(s.text)}</p>` : ''}
          ${s.pills ? `<div class="pills">${s.pills.map((p) => `<span class="pill">${esc(p)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="stack__idx">0${i + 1}</div>
      </div>`).join('')}
    </div>
  </div>
</section>

<section class="section" id="programs" style="background:var(--bg-2)">
  <div class="wrap">
    <div class="section-head section-head--split">
      <div>
        <span class="eyebrow" data-reveal>${esc(c.programs.eyebrow)}</span>
        <h2 class="display h-lg" data-split style="margin-top:20px">${splitLines(c.programs.title1, c.programs.title2)}</h2>
      </div>
      <p class="lead" data-reveal>${esc(c.programs.lead)}</p>
    </div>
    <div class="programs" data-stagger>
      ${c.programs.items.map((p, i) => `<article class="prog${p.featured ? ' prog--feat' : ''}">
        <div class="prog__top"><span class="prog__idx">0${i + 1} /</span>${p.featured ? `<span class="badge">${esc(c.programs.popular)}</span>` : ''}</div>
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.text)}</p>
        <ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        <button type="button" class="btn ${p.featured ? 'btn--primary btn--shine' : 'btn--ghost'} btn--block" data-open-form data-program="${esc(p.id)}" data-source="program" data-icon="arrow">${esc(p.featured ? c.programs.start : c.programs.more)}</button>
      </article>`).join('')}
    </div>
  </div>
</section>

<section class="section" id="app">
  <div class="wrap app">
    <div>
      <span class="eyebrow" data-reveal>${esc(c.app.eyebrow)}</span>
      <h2 class="display h-lg" data-split style="margin-top:20px">${splitLines(c.app.title1, c.app.title2)}</h2>
      <p class="lead" data-reveal style="margin-top:24px">${esc(c.app.lead)}</p>
      <a class="btn btn--ghost btn--sm" href="/login" data-route data-icon="arrow" style="margin-top:22px">${esc(c.app.already)}</a>
      <ul class="app__list" role="tablist">
        ${c.app.items.map((it, i) => `<li class="app__item${i === 0 ? ' is-active' : ''}" role="tab" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-screen="${i}">
          <span class="ic">${APP_ICONS[i % 4]}</span><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p>
        </li>`).join('')}
      </ul>
    </div>
    <div class="phone-wrap">
      <div class="phone">
        <div class="phone__notch" aria-hidden="true"></div>
        <div class="phone__screen">
          ${c.app.items.map((it, i) => `<img class="screen screen--shot${i === 0 ? ' is-active' : ''}" src="${appShot(lang, i)}" alt="${esc(it.title)}" loading="lazy">`).join('')}
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section" style="background:var(--bg-2)">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow" data-reveal>${esc(c.process.eyebrow)}</span>
      <h2 class="display h-lg" data-split>${splitLines(c.process.title1, c.process.title2)}</h2>
    </div>
    <div class="steps">
      <div class="steps__line" aria-hidden="true"><i></i></div>
      ${c.process.steps.map((s, i) => `<div class="step"><div class="step__dot">${i + 1}</div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join('')}
    </div>
  </div>
</section>

<section class="section" id="voices">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow" data-reveal>${esc(c.voices.eyebrow)}</span>
      <h2 class="display h-lg" data-split>${splitLines(c.voices.title1, c.voices.title2)}</h2>
    </div>
    <div class="quotes quotes--grid" data-stagger>
      ${c.voices.quotes.map((q) => `<figure class="quote">
        <div class="quote__stars" aria-label="5/5">★★★★★</div>
        <blockquote>“${esc(q.text)}”</blockquote>
        <footer><span class="avatar">${esc((q.name || '?').trim().charAt(0))}</span><div><b>${esc(q.name)}</b><small>${esc(q.role)}</small></div></footer>
      </figure>`).join('')}
    </div>
  </div>
</section>

<section class="section" id="faq" style="background:var(--bg-2)">
  <div class="wrap faq">
    <div class="faq__aside">
      <span class="eyebrow" data-reveal>${esc(c.faq.eyebrow)}</span>
      <h2 class="display h-lg" data-split style="margin-top:20px">${splitLines(c.faq.title1, c.faq.title2)}</h2>
      <button type="button" class="btn btn--ghost" data-open-form data-source="faq" data-icon="arrow">${esc(c.faq.other)}</button>
    </div>
    <div class="acc">
      ${c.faq.items.map((f) => `<div class="acc__item">
        <button class="acc__q" aria-expanded="false"><span>${esc(f.q)}</span><i class="acc__ic" aria-hidden="true"></i></button>
        <div class="acc__a"><div><p>${esc(f.a)}</p></div></div>
      </div>`).join('')}
    </div>
  </div>
</section>

<section class="section cta" id="contact">
  <span class="eyebrow" data-reveal>${esc(c.cta.eyebrow)}</span>
  <h2 class="cta__title display" style="margin-top:28px">
    <span class="line">${esc(c.cta.title1)}</span>
    <span class="line fill" data-fill>${esc(c.cta.title2)}</span>
  </h2>
  <p class="lead" data-reveal>${esc(c.cta.lead)}</p>
  <div class="cta__btns" data-reveal>
    <span class="magnetic"><button type="button" class="btn btn--primary btn--shine" data-open-form data-source="cta" data-icon="arrow">${esc(c.cta.form)}</button></span>
    <span class="magnetic"><a class="btn btn--wa" href="${wa}" target="_blank" rel="noopener" data-icon="wa">${esc(c.cta.whatsapp)}</a></span>
  </div>
  <div class="trust" data-reveal>
    ${c.cta.trust.map((t) => `<div><span class="num">${esc(t.value)}</span><small>${esc(t.label)}</small></div>`).join('')}
  </div>
</section>

<div class="ig" data-reveal>
  <div><div class="ig__handle">@${esc(c.contact.instagram)}</div><p>${esc(c.ig.text)}</p></div>
  <a class="btn btn--ig" href="${ig}" target="_blank" rel="noopener" data-icon="arrow">${esc(c.ig.button)}</a>
</div>

</main>

<footer class="footer">
  <div class="footer__top">
    <a href="#site-top" class="nav__logo" aria-label="ECshape"><img src="${P}logo.png" alt="" width="46" height="42" loading="lazy"><b>ECSHAPE</b></a>
    <nav class="footer__links">
      <a class="link-draw" href="${ig}" target="_blank" rel="noopener">${esc(c.footer.instagram)}</a>
      <a class="link-draw" href="${wa}" target="_blank" rel="noopener">${esc(c.footer.whatsapp)}</a>
      <a class="link-draw" href="#contact" data-open-form data-source="footer">${esc(c.footer.contact)}</a>
      <a class="link-draw" href="/login" data-route>${esc(c.nav.login)}</a>
      <a class="link-draw" href="#" id="cookieSettings">${esc(c.footer.cookies)}</a>
    </nav>
  </div>
  <div class="footer__mark" aria-hidden="true">${'ECSHAPE'.split('').map((l) => `<span>${l}</span>`).join('')}</div>
  <div class="footer__bottom"><span>${esc(c.footer.rights)}</span><a href="#site-top" class="link-draw">${esc(c.footer.back)}</a></div>
</footer>

<a class="wa-float" href="${wa}" target="_blank" rel="noopener" aria-label="WhatsApp"><img src="${P}icon-whatsapp.png" alt=""></a>

<div class="form-modal" id="leadModal" role="dialog" aria-modal="true" aria-labelledby="leadTitle" aria-hidden="true">
  <div class="form-modal__backdrop" data-close-form></div>
  <div class="form-modal__panel">
    <button type="button" class="form-modal__close" data-close-form aria-label="${esc(c.form.close)}">✕</button>
    <div class="form-modal__body">
      <span class="eyebrow">ECshape</span>
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
        <div class="form-done__icon">✓</div>
        <h3 class="display">${esc(c.form.success)}</h3>
        <p class="lead">${esc(c.form.successSub)}</p>
      </div>
    </div>
  </div>
</div>

<div class="cookie" id="cookieBanner" role="dialog" aria-label="Cookies">
  <p>${esc(c.cookie.text)}</p>
  <div class="cookie__btns">
    <button class="cb-accept" id="cbAccept">${esc(c.cookie.accept)}</button>
    <button class="cb-decline" id="cbDecline">${esc(c.cookie.decline)}</button>
  </div>
</div>`;
}
