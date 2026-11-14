/* ECshape public site — interactions & scroll motion (GSAP + ScrollTrigger + Lenis).
   initSite() injects the markup, wires every effect, and returns a cleanup function so the
   React app can mount/unmount the site like any other page. Reduced motion => static page. */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { renderSite, waLink, WA_SVG } from './render';
import { applyLinkTargets } from './links';
import { API_BASE_URL } from '../config/api';

gsap.registerPlugin(ScrollTrigger);

const GA_ID = 'G-6QJ1G81SGP';
function loadGoogleAnalytics() {
  if (window.__gaLoaded) return;
  window.__gaLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_ID);
}

const ARROW_RTL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>';
const ARROW_LTR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const escHtml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const GLYPHS = 'אבגדהוזחטיכלמנסעפצקרשת';
const EASE = 'expo.out';

/**
 * @param {HTMLElement} root   element with class "ec-site"
 * @param {{ navigate: (to: string) => void, content: object, lang: 'he'|'en'|'fr', onLang: (l: string) => void, mode?: 'live'|'edit'|'preview' }} opts
 *   mode "edit": Studio -> My site visual editor (still page, content paths on every editable element, no cookie banner).
 *   mode "preview": scaled thumbnail in the studio (full motion, no intro loader, no cookie banner).
 * @returns {() => void} cleanup
 */
export function initSite(root, { navigate, content, lang, onLang, mode = 'live' }) {
  const editing = mode === 'edit';
  const live = mode === 'live';
  root.innerHTML = renderSite(content, lang, { edit: editing });
  // Custom link targets chosen in Studio -> My site (#12); the editor keeps the default behaviour while editing
  if (!editing) applyLinkTargets(root, content.links, { wa: waLink(content), ig: `https://www.instagram.com/${encodeURIComponent(content.contact.instagram)}` });
  const rtl = lang === 'he';
  const DIR = rtl ? 1 : -1; // horizontal motion sign: RTL content flows toward +x

  const $ = (s, c) => (c || root).querySelector(s);
  const $$ = (s, c) => Array.from((c || root).querySelectorAll(s));
  const html = document.documentElement;
  const ac = new AbortController();
  const on = (target, type, fn, opts) => target.addEventListener(type, fn, { ...(opts || {}), signal: ac.signal });
  // The editor shows the page still: scroll-jacking (pins, Lenis, scrubs) would fight text editing.
  const reduce = editing || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let alive = true;
  let lenis = null;
  const timers = [];

  html.classList.add('ec-site-active');
  window.scrollTo(0, 0);

  /* ------------------------------------------------ in-app links (portal) */
  $$('[data-route]').forEach((a) => {
    on(a, 'click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      navigate(a.getAttribute('href'));
    });
  });

  /* ------------------------------------------------------------- buttons */
  $$('.btn').forEach((btn) => {
    if (btn.querySelector('.btn__label')) return;
    const text = btn.textContent.trim();
    // Studio: the content path moves onto the label so the text can be edited in place.
    const path = btn.getAttribute('data-ec-path');
    if (path) btn.removeAttribute('data-ec-path');
    const pathAttr = path ? ` data-ec-path="${path.replace(/"/g, '&quot;')}"` : '';
    const icon = btn.getAttribute('data-icon');
    let iconHTML = '';
    if (icon === 'wa') iconHTML = `<span class="btn__icon btn__icon--wa" aria-hidden="true">${WA_SVG}</span>`;
    else if (icon) { const a = rtl ? ARROW_RTL : ARROW_LTR; iconHTML = `<span class="btn__icon" aria-hidden="true">${a}${a}</span>`; }
    btn.innerHTML = '<span class="btn__fill" aria-hidden="true"></span>' +
      `<span class="btn__label"><span data-text="${text.replace(/"/g, '&quot;')}"${pathAttr}>${escHtml(text)}</span></span>${iconHTML}`;
    btn.setAttribute('aria-label', btn.getAttribute('aria-label') || text);
    const origin = (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty('--x', `${e.clientX - r.left}px`);
      btn.style.setProperty('--y', `${e.clientY - r.top}px`);
    };
    on(btn, 'pointerenter', origin);
    on(btn, 'pointerleave', origin);
  });

  /* ------------------------------------------------------------ magnetic */
  if (finePointer && !reduce) {
    $$('.magnetic, .nav__cta').forEach((wrap) => {
      const el = wrap.classList.contains('magnetic') ? wrap.firstElementChild : wrap;
      on(wrap, 'pointermove', (e) => {
        const r = wrap.getBoundingClientRect();
        el.classList.add('is-mag');
        el.style.translate = `${(e.clientX - (r.left + r.width / 2)) * 0.32}px ${(e.clientY - (r.top + r.height / 2)) * 0.32}px`;
      });
      on(wrap, 'pointerleave', () => { el.classList.remove('is-mag'); el.style.translate = ''; });
    });
  }

  /* ------------------------------------------------------- text scramble */
  $$('[data-scramble]').forEach((el) => {
    const original = el.textContent;
    let raf = 0;
    on(el, 'pointerenter', () => {
      if (reduce) return;
      let frame = 0;
      const total = 14;
      cancelAnimationFrame(raf);
      const tick = () => {
        let out = '';
        for (let i = 0; i < original.length; i++) {
          const revealAt = (i / original.length) * total;
          out += (frame >= revealAt || original[i] === ' ') ? original[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        el.textContent = out;
        if (frame++ < total && alive) raf = requestAnimationFrame(tick);
        else el.textContent = original;
      };
      tick();
    });
  });

  /* -------------------------------------------------------------- cursor */
  const cursor = $('.cursor');
  if (finePointer && cursor && !reduce) {
    let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    const label = cursor.querySelector('span');
    on(window, 'pointermove', (e) => { tx = e.clientX; ty = e.clientY; cursor.style.opacity = 1; });
    on(document, 'pointerleave', () => { cursor.style.opacity = 0; });
    const loop = () => {
      if (!alive) return;
      cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
      cursor.style.transform = `translate3d(${cx}px,${cy}px,0)`;
      requestAnimationFrame(loop);
    };
    loop();
    $$('[data-cursor]').forEach((el) => {
      on(el, 'pointerenter', () => { label.textContent = ''; cursor.classList.add('is-label'); });
      on(el, 'pointerleave', () => cursor.classList.remove('is-label'));
    });
    $$('a, button').forEach((el) => {
      on(el, 'pointerenter', () => { if (!cursor.classList.contains('is-label')) cursor.classList.add('is-link'); });
      on(el, 'pointerleave', () => cursor.classList.remove('is-link'));
    });
  }

  /* ----------------------------------------------------------------- nav */
  const nav = $('#nav');
  const menu = $('#menu');
  const menuBtn = $('#menuBtn');
  let lastY = 0;
  const onScrollNav = (y) => {
    nav.classList.toggle('is-scrolled', y > 40);
    const menuOpen = menu.classList.contains('is-open');
    nav.classList.toggle('is-hidden', !menuOpen && y > 400 && y > lastY + 2);
    if (y < lastY - 2) nav.classList.remove('is-hidden');
    lastY = y;
    const wa = $('.wa-float');
    if (wa) wa.classList.toggle('is-on', y > innerHeight * 0.8);
  };

  /* ------------------------------------------------------ overlay plumbing */
  // One lock for every overlay (menu, lead form): Lenis stops AND native scroll is blocked (touch scrolling bypasses
  // Lenis, and html.ec-site-active forces overflow visible, so the lock class must out-rank it).
  let locks = 0;
  const lockScroll = (lock) => {
    locks = Math.max(0, locks + (lock ? 1 : -1));
    const on_ = locks > 0;
    if (on_ === html.classList.contains('ec-locked')) return;
    if (on_) {
      const sbw = window.innerWidth - html.clientWidth;
      if (sbw > 0) html.style.setProperty('--ec-sbw', `${sbw}px`);
      html.classList.add('ec-locked');
      if (lenis) lenis.stop();
    } else {
      html.classList.remove('ec-locked');
      html.style.removeProperty('--ec-sbw');
      if (lenis) lenis.start();
    }
  };
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([tabindex="-1"]), textarea, select, [tabindex]:not([tabindex="-1"])';
  const focusables = (els) => els.flatMap((el) => [el, ...$$(FOCUSABLE, el)])
    .filter((el) => el.matches(FOCUSABLE) && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  // Everything except the open overlay (and what must stay reachable) becomes inert.
  const setInert = (keep, on_) => {
    Array.from(root.children).forEach((el) => {
      if (keep.includes(el)) return;
      if (on_) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
  };
  const trap = (e, els) => {
    const list = focusables(els);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    const inside = els.some((el) => el.contains(document.activeElement));
    if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
  };
  const refocus = (el) => { if (el && el.isConnected && el.focus) { try { el.focus({ preventScroll: true }); } catch (err) { /* ignore */ } } };

  /* ---------------------------------------------------------------- menu */
  let menuOpen = false;
  let menuReturn = null;
  const setMenu = (open) => {
    if (open === menuOpen) return;
    menuOpen = open;
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menuBtn.setAttribute('aria-expanded', String(open));
    lockScroll(open);
    setInert([nav, menu], open);
    if (open) {
      menuReturn = document.activeElement;
      menu.scrollTop = 0;
      timers.push(setTimeout(() => { const a = $('nav a', menu); if (menuOpen && a) a.focus({ preventScroll: true }); }, 350));
    } else if (menuReturn === menuBtn || menu.contains(document.activeElement)) {
      refocus(menuBtn);
    }
  };
  on(menuBtn, 'click', () => setMenu(!menuOpen));
  $$('a', menu).forEach((a) => on(a, 'click', () => setMenu(false)));

  /* ------------------------------------------------------- language switch */
  $$('[data-lang]').forEach((b) => on(b, 'click', () => { if (b.dataset.lang !== lang) onLang(b.dataset.lang); }));

  /* ---------------------------------------------------- lead form (modal) */
  const modal = $('#leadModal');
  const form = $('#leadForm');
  const done = $('.form-done', modal);
  const modalScroll = $('.form-modal__scroll', modal);
  const panel = $('.form-modal__panel', modal);
  let lastFocus = null;
  let modalOpen = false;
  const openForm = (trigger) => {
    if (modalOpen) return;
    lastFocus = trigger || document.activeElement;
    form.hidden = false; done.hidden = true;
    const program = trigger && trigger.getAttribute('data-program');
    if (program) { const r = form.querySelector(`input[name="program"][value="${program}"]`); if (r) r.checked = true; }
    form.dataset.source = (trigger && trigger.getAttribute('data-source')) || 'site';
    setMenu(false);
    modalOpen = true;
    modalScroll.scrollTop = 0;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    lockScroll(true);
    setInert([modal], true);
    // Phones: focusing the field would pop the keyboard over the sheet; focus the dialog title instead.
    const first = window.matchMedia('(pointer: coarse)').matches ? $('#leadTitle', modal) : form.querySelector('input[name="name"]');
    if (first === $('#leadTitle', modal)) first.setAttribute('tabindex', '-1');
    timers.push(setTimeout(() => { if (modalOpen) first.focus({ preventScroll: true }); }, 380));
  };
  const closeForm = () => {
    if (!modalOpen) return;
    modalOpen = false;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    setInert([modal], false);
    lockScroll(false);
    refocus(lastFocus);
  };
  $$('[data-open-form]').forEach((b) => on(b, 'click', (e) => { e.preventDefault(); openForm(b); }));
  $$('[data-close-form]', modal).forEach((b) => on(b, 'click', closeForm));
  on(window, 'keydown', (e) => {
    if (e.key === 'Escape') { if (modalOpen) closeForm(); else setMenu(false); return; }
    if (e.key !== 'Tab') return;
    if (modalOpen) trap(e, [panel]);
    else if (menuOpen) trap(e, [menuBtn, menu]);
  });
  on(form, 'submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const msg = $('.form-msg', form);
    const data = Object.fromEntries(new FormData(form).entries());
    data.lang = lang;
    data.source = form.dataset.source || 'site';
    msg.textContent = '';
    if (!String(data.name || '').trim() || !(String(data.phone || '').trim() || String(data.email || '').trim())) {
      msg.textContent = btn.dataset.required;
      return;
    }
    const label = btn.querySelector('.btn__label > span');
    const original = label ? label.textContent : '';
    if (label) label.textContent = btn.dataset.sending;
    btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE_URL}/public/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(String(res.status));
      form.hidden = true; done.hidden = false; form.reset();
      modalScroll.scrollTop = 0;
      const h = $('h3', done); if (h) h.focus({ preventScroll: true });
      if (window.gtag) window.gtag('event', 'generate_lead', { source: data.source, program: data.program });
    } catch (err) {
      msg.textContent = btn.dataset.error;
    } finally {
      btn.disabled = false;
      if (label) label.textContent = original;
    }
  });

  /* ----------------------------------------------------------------- FAQ */
  $$('.acc__q').forEach((q) => {
    on(q, 'click', () => {
      const item = q.parentElement;
      const open = item.classList.contains('is-open');
      $$('.acc__item.is-open').forEach((i) => { i.classList.remove('is-open'); $('.acc__q', i).setAttribute('aria-expanded', 'false'); });
      if (!open) { item.classList.add('is-open'); q.setAttribute('aria-expanded', 'true'); }
      timers.push(setTimeout(() => ScrollTrigger.refresh(), 650));
    });
  });

  /* ------------------------------------------------------------ spotlight */
  $$('.prog').forEach((card) => {
    on(card, 'pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  /* ------------------------------------------------- app screen switcher */
  const appItems = $$('.app__item');
  const screens = $$('.screen');
  let currentScreen = 0;
  const setScreen = (i) => {
    if (i === currentScreen) return;
    currentScreen = i;
    appItems.forEach((it, k) => {
      it.classList.toggle('is-active', k === i);
      it.setAttribute('aria-selected', String(k === i));
      it.tabIndex = k === i ? 0 : -1;
    });
    screens.forEach((s, k) => s.classList.toggle('is-active', k === i));
  };

  /* ------------------------------------------------------- cookie banner */
  if (live) {
    const banner = $('#cookieBanner');
    let consent = null;
    try { consent = localStorage.getItem('cookie_consent'); } catch (e) { /* storage blocked */ }
    if (consent === 'granted') loadGoogleAnalytics();
    else if (consent !== 'denied') timers.push(setTimeout(() => banner.classList.add('is-on'), 2200));
    const set = (v) => { try { localStorage.setItem('cookie_consent', v); } catch (e) { /* ignore */ } banner.classList.remove('is-on'); };
    on($('#cbAccept'), 'click', () => { set('granted'); loadGoogleAnalytics(); });
    on($('#cbDecline'), 'click', () => set('denied'));
    on($('#cookieSettings'), 'click', (e) => { e.preventDefault(); banner.classList.add('is-on'); });
  }

  /* ------------------------------------------------ intro loader (once) */
  let showLoader = false;
  try { showLoader = live && !reduce && !sessionStorage.getItem('ec_intro'); } catch (e) { /* ignore */ }
  const endLoader = () => {
    root.classList.remove('has-loader');
    try { sessionStorage.setItem('ec_intro', '1'); } catch (e) { /* ignore */ }
  };

  /* ===================================================================
     Reduced motion: static page, simple interactions only.
     =================================================================== */
  if (reduce) {
    on(window, 'scroll', () => onScrollNav(window.scrollY), { passive: true });
    appItems.forEach((it, i) => on(it, 'click', () => setScreen(i)));
    return () => {
      alive = false;
      ac.abort();
      timers.forEach(clearTimeout);
      html.classList.remove('ec-site-active', 'ec-locked');
      html.style.removeProperty('--ec-sbw');
      document.body.style.overflow = '';
      root.innerHTML = '';
    };
  }

  /* ===================================================================
     MOTION
     =================================================================== */
  lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  lenis.on('scroll', (e) => { ScrollTrigger.update(); onScrollNav(e.scroll); });
  const raf = (t) => lenis.raf(t * 1000);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);

  // In-page anchors
  $$('a[href^="#"]').forEach((a) => {
    on(a, 'click', (e) => {
      const id = a.getAttribute('href');
      const target = id === '#' || id === '#site-top' ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -20, duration: 1.4 });
    });
  });

  // Split headings into masked lines
  $$('[data-split] .line').forEach((line) => {
    const cls = ['grad-text', 'accent'].filter((c) => line.classList.contains(c));
    cls.forEach((c) => line.classList.remove(c));
    line.innerHTML = `<span class="line__in ${cls.join(' ')}">${line.innerHTML}</span>`;
  });
  // Manifesto words
  $$('[data-words]').forEach((p) => {
    const out = [];
    p.childNodes.forEach((n) => {
      const isHl = n.nodeType === 1 && n.classList.contains('hl');
      n.textContent.split(/(\s+)/).forEach((w) => {
        if (!w.trim()) { out.push(w); return; }
        out.push(`<span class="w${isHl ? ' hl' : ''}">${w}</span>`);
      });
    });
    p.innerHTML = out.join('');
  });
  // Marquee rows: duplicate content for a seamless loop
  $$('[data-marquee]').forEach((row) => {
    const item = row.firstElementChild;
    for (let i = 0; i < 7; i++) row.appendChild(item.cloneNode(true)); // 8 copies: two equal halves for the -50% loop
  });

  const mqDesktop = window.matchMedia('(min-width: 901px)');
  // Photo frame sits on the trailing side: left in RTL, right in LTR.
  const CLIP_START = rtl ? 'inset(15% 58% 11% 6% round 28px)' : 'inset(15% 6% 11% 58% round 28px)';
  const SHIFT = rtl ? -35 : 17; // xPercent that centres the trainer inside the start frame
  const ctx = gsap.context(() => {}, root);
  const mm = gsap.matchMedia();

  const countUp = (els) => {
    els.forEach((el) => {
      const end = +el.getAttribute('data-count');
      const suf = el.getAttribute('data-suffix') || '';
      const o = { v: 0 };
      gsap.to(o, { v: end, duration: 2, ease: 'power3.out', delay: 0.4, onUpdate: () => { el.textContent = Math.round(o.v) + suf; } });
    });
  };

  const intro = () => ctx.add(() => {
    const tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.from('.nav', { y: -30, autoAlpha: 0, duration: 1, clearProps: 'transform' }, 0)
      .from('.hero [data-split] .line__in', { yPercent: 110, duration: 1.4, stagger: 0.12 }, 0.05)
      .from('.hero__content [data-reveal]', { y: 30, autoAlpha: 0, duration: 1.1, stagger: 0.1 }, 0.35)
      .from('.hero__stats .chip', { y: 30, autoAlpha: 0, duration: 1, stagger: 0.08 }, 0.6)
      .from('.hero__scroll', { autoAlpha: 0, duration: 1 }, 0.9);
    if (mqDesktop.matches) {
      tl.fromTo('.hero__media', { clipPath: CLIP_START.replace(' 11% ', ' 89% ') }, { clipPath: CLIP_START, duration: 1.6, ease: 'expo.inOut' }, 0)
        .fromTo('.hero__media img', { scale: 1.5, xPercent: SHIFT }, { scale: 1.15, xPercent: SHIFT, duration: 2 }, 0);
    } else {
      tl.from('.hero__media', { y: 40, autoAlpha: 0, duration: 1.2 }, 0.3);
    }
    countUp($$('.hero [data-count]'));
  });

  ctx.add(() => {
    if (showLoader) {
      root.classList.add('has-loader');
      const counter = { v: 0 };
      const out = $('#loaderCount');
      lenis.stop();
      $('.loader').style.clipPath = 'inset(0 0 0% 0)';
      gsap.timeline()
        .to(counter, { v: 100, duration: 1.3, ease: 'power2.inOut', onUpdate: () => { out.textContent = Math.round(counter.v); } })
        .to('.loader', { clipPath: 'inset(0 0 100% 0)', duration: 1, ease: 'expo.inOut' }, '+=.1')
        .add(() => { endLoader(); lenis.start(); intro(); }, '-=.55');
    } else {
      intro();
    }

    // Generic reveals
    gsap.utils.toArray('[data-reveal]', root).forEach((el) => {
      if (el.closest('.hero')) return;
      gsap.from(el, { y: 40, autoAlpha: 0, duration: 1.2, ease: EASE, scrollTrigger: { trigger: el, start: 'top 88%' } });
    });
    gsap.utils.toArray('[data-split]', root).forEach((el) => {
      if (el.closest('.hero')) return;
      gsap.from($$('.line__in', el), { yPercent: 110, duration: 1.3, stagger: 0.1, ease: EASE, scrollTrigger: { trigger: el, start: 'top 85%' } });
    });
    gsap.utils.toArray('[data-stagger]', root).forEach((el) => {
      gsap.from(el.children, { y: 60, autoAlpha: 0, duration: 1.2, stagger: 0.1, ease: EASE, scrollTrigger: { trigger: el, start: 'top 82%' } });
    });
    $$('[data-count]').forEach((el) => {
      if (el.closest('.hero')) return;
      ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => countUp([el]) });
    });

    // Velocity marquee
    $$('[data-marquee]').forEach((row) => {
      const dir = +row.getAttribute('data-marquee');
      const tween = gsap.fromTo(row, { xPercent: dir > 0 ? 0 : -50 }, { xPercent: dir > 0 ? -50 : 0, duration: 30, ease: 'none', repeat: -1 });
      const skewTo = gsap.quickTo(row, 'skewX', { duration: 0.5, ease: 'power3' });
      ScrollTrigger.create({
        trigger: row.closest('.marquee'), start: 'top bottom', end: 'bottom top',
        onUpdate: (self) => {
          const v = self.getVelocity();
          gsap.to(tween, { timeScale: self.direction * (1 + Math.min(Math.abs(v) / 400, 5)), duration: 0.2, overwrite: true });
          gsap.to(tween, { timeScale: self.direction, duration: 1.2, delay: 0.2 });
          skewTo(gsap.utils.clamp(-8, 8, v / -250));
        },
      });
    });

    // Result cards: the "after" frame wipes open and the kg badge pops
    if ($('.results')) {
      const st = { trigger: $('.results'), start: 'top 65%' };
      gsap.from($$('.rcard__half--after img'), { clipPath: rtl ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)', duration: 1.3, stagger: 0.08, ease: 'expo.inOut', scrollTrigger: st, clearProps: 'clipPath' });
      gsap.from($$('.rcard__kg'), { scale: 0.6, autoAlpha: 0, duration: 0.9, stagger: 0.08, delay: 0.5, ease: 'back.out(2)', scrollTrigger: { ...st } });
    }
    // Manifesto art: chips drift in
    if ($('.manifesto__art')) gsap.from($$('.mart__chip, .mart__photo', $('.manifesto__art')), { y: 50, autoAlpha: 0, duration: 1.2, stagger: 0.12, ease: EASE, scrollTrigger: { trigger: $('.manifesto__art'), start: 'top 80%' } });

    // Manifesto: words light up
    $$('[data-words]').forEach((p) => {
      gsap.to($$('.w', p), { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: p, start: 'top 75%', end: 'bottom 45%', scrub: 0.6 } });
    });

    // Parallax images
    $$('[data-parallax]').forEach((img) => {
      gsap.fromTo(img, { yPercent: -8 }, { yPercent: -18, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    // Process line
    const steps = $$('.step');
    if ($('.steps__line i')) gsap.fromTo($('.steps__line i'), { scaleX: 0 }, {
      scaleX: 1, ease: 'none',
      scrollTrigger: {
        trigger: $('.steps'), start: 'top 75%', end: 'bottom 55%', scrub: 0.5,
        onUpdate: (self) => steps.forEach((s, i) => s.classList.toggle('is-on', self.progress >= i / (steps.length - 1) - 0.02)),
      },
    });
    if (!mqDesktop.matches) {
      steps.forEach((s) => ScrollTrigger.create({ trigger: s, start: 'top 75%', onEnter: () => s.classList.add('is-on') }));
    }

    // Stacking cards
    const cards = $$('.stack__card');
    cards.forEach((card, i) => {
      const next = cards[i + 1];
      if (!next) return;
      gsap.to(card, { scale: 0.92, filter: 'brightness(.55)', ease: 'none', scrollTrigger: { trigger: next, start: 'top bottom', end: 'top 20%', scrub: true } });
    });

    // CTA outline fill + footer wordmark
    if ($('.cta__title')) gsap.fromTo($('[data-fill]'), { backgroundPosition: rtl ? '0% 0' : '100% 0' }, {
      backgroundPosition: rtl ? '100% 0' : '0% 0', ease: 'none',
      scrollTrigger: { trigger: $('.cta__title'), start: 'top 80%', end: 'top 30%', scrub: true },
    });
    if ($('.cta__title')) gsap.from($('.cta__title .line'), { yPercent: 40, autoAlpha: 0, duration: 1.3, ease: EASE, scrollTrigger: { trigger: $('.cta__title'), start: 'top 85%' } });
    gsap.from($$('.footer__mark span'), { yPercent: 100, duration: 1.2, stagger: 0.05, ease: EASE, scrollTrigger: { trigger: $('.footer__mark'), start: 'top 95%' } });
  });

  // Breakpoint-specific pins
  mm.add('(min-width: 901px)', () => {
    gsap.set($('.hero__media img'), { xPercent: SHIFT });
    gsap.timeline({ scrollTrigger: { trigger: $('.hero'), start: 'top top', end: '+=120%', pin: true, scrub: 0.8, anticipatePin: 1 } })
      .fromTo($('.hero__media'), { clipPath: CLIP_START }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'power2.inOut', immediateRender: false }, 0)
      .fromTo($('.hero__media img'), { scale: 1.15, xPercent: SHIFT }, { scale: 1, xPercent: 0, ease: 'power2.inOut', immediateRender: false }, 0)
      .to($('.hero__media'), { '--shade': 1, ease: 'none' }, 0.2)
      .to($('.hero__content'), { yPercent: -18, autoAlpha: 0, ease: 'power2.in' }, 0)
      .to([$('.hero__stats'), $('.hero__scroll')], { autoAlpha: 0, y: 20, ease: 'power1.in' }, 0)
      .fromTo($('.hero__caption'), { autoAlpha: 0, y: 60 }, { autoAlpha: 1, y: 0, ease: 'power2.out' }, 0.55);

    const track = $('.results__track');
    const dist = () => (track ? Math.max(0, track.scrollWidth - innerWidth) : 0);
    if (track) gsap.to(track, {
      x: () => DIR * dist(), ease: 'none',
      scrollTrigger: {
        trigger: $('.results'), start: 'top top', end: () => `+=${dist()}`,
        pin: $('.results'), pinSpacing: true, scrub: 0.6, invalidateOnRefresh: true,
        onUpdate: (self) => gsap.set($('.results__progress i'), { scaleX: self.progress }),
      },
    });

    if (!$('#app')) return undefined;
    const appST = ScrollTrigger.create({
      trigger: $('#app'), start: 'top top', end: '+=240%', pin: true, scrub: true,
      onUpdate: (self) => setScreen(Math.min(appItems.length - 1, Math.floor(self.progress * appItems.length))),
    });
    const clicks = appItems.map((it, i) => {
      const fn = () => lenis.scrollTo(appST.start + (appST.end - appST.start) * ((i + 0.5) / appItems.length), { duration: 1 });
      it.addEventListener('click', fn);
      return fn;
    });
    gsap.from($('.phone'), { y: 120, rotate: -6, autoAlpha: 0, duration: 1.4, ease: EASE, scrollTrigger: { trigger: $('#app'), start: 'top 70%' } });
    return () => appItems.forEach((it, i) => it.removeEventListener('click', clicks[i]));
  });

  mm.add('(max-width: 900px)', () => {
    let timer = null;
    const restart = () => { clearInterval(timer); timer = setInterval(() => setScreen((currentScreen + 1) % appItems.length), 3500); };
    const handlers = appItems.map((it, i) => {
      const fn = () => { setScreen(i); restart(); };
      it.addEventListener('click', fn);
      return fn;
    });
    if (!$('#app')) return () => clearInterval(timer);
    const st = ScrollTrigger.create({ trigger: $('#app'), start: 'top 80%', end: 'bottom 20%', onToggle: (s) => (s.isActive ? restart() : clearInterval(timer)) });
    return () => { clearInterval(timer); st.kill(); appItems.forEach((it, i) => it.removeEventListener('click', handlers[i])); };
  });

  // Images load late; recompute pin distances once they have dimensions
  const refresh = () => ScrollTrigger.refresh();
  on(window, 'load', refresh);
  $$('img').forEach((img) => { if (!img.complete) on(img, 'load', refresh, { once: true }); });

  return () => {
    alive = false;
    ac.abort();
    timers.forEach(clearTimeout);
    mm.revert();
    ctx.revert();
    ScrollTrigger.getAll().forEach((t) => t.kill());
    gsap.ticker.remove(raf);
    lenis.destroy();
    html.classList.remove('ec-site-active', 'ec-locked');
    html.style.removeProperty('--ec-sbw');
    document.body.style.overflow = '';
    root.classList.remove('has-loader');
    root.innerHTML = '';
  };
}
