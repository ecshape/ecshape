/* ECshape landing — interactions & scroll motion
   Libraries (free): GSAP 3.13 + ScrollTrigger, Lenis smooth scroll.
   Every effect degrades: no JS / no CDN / reduced motion => static, fully visible page. */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var html = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  /* ---------------------------------------------------------------- links */
  // WhatsApp links carry their full href in the HTML (works without JS).

  /* -------------------------------------------------------------- buttons
     Upgrades <a class="btn" data-icon="arrow|wa">Label</a> into the full anatomy:
     fill (origin = cursor entry point) + rolling label + swapping icon. */
  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>';
  $$('.btn').forEach(function (btn) {
    if (btn.querySelector('.btn__label')) return;
    var text = btn.textContent.trim();
    var icon = btn.getAttribute('data-icon');
    var iconHTML = '';
    if (icon === 'wa') iconHTML = '<span class="btn__icon"><img src="photos/icon-whatsapp.png" alt=""></span>';
    else if (icon) iconHTML = '<span class="btn__icon">' + ARROW + ARROW + '</span>';
    btn.innerHTML = '<span class="btn__fill" aria-hidden="true"></span>' +
      '<span class="btn__label"><span data-text="' + text.replace(/"/g, '&quot;') + '">' + text + '</span></span>' + iconHTML;
    btn.setAttribute('aria-label', btn.getAttribute('aria-label') || text);
    btn.addEventListener('pointerenter', function (e) {
      var r = btn.getBoundingClientRect();
      btn.style.setProperty('--x', (e.clientX - r.left) + 'px');
      btn.style.setProperty('--y', (e.clientY - r.top) + 'px');
    });
    btn.addEventListener('pointerleave', function (e) {
      var r = btn.getBoundingClientRect();
      btn.style.setProperty('--x', (e.clientX - r.left) + 'px');
      btn.style.setProperty('--y', (e.clientY - r.top) + 'px');
    });
  });

  /* ------------------------------------------------------------ magnetic */
  if (finePointer && !reduce) {
    $$('.magnetic, .nav__cta').forEach(function (wrap) {
      var el = wrap.classList.contains('magnetic') ? wrap.firstElementChild : wrap;
      var strength = 0.32;
      wrap.addEventListener('pointermove', function (e) {
        var r = wrap.getBoundingClientRect();
        var x = (e.clientX - (r.left + r.width / 2)) * strength;
        var y = (e.clientY - (r.top + r.height / 2)) * strength;
        el.classList.add('is-mag');
        el.style.translate = x + 'px ' + y + 'px';
      });
      wrap.addEventListener('pointerleave', function () {
        el.classList.remove('is-mag');
        el.style.translate = '';
      });
    });
  }

  /* ------------------------------------------------------- text scramble */
  var GLYPHS = 'אבגדהוזחטיכלמנסעפצקרשת';
  $$('[data-scramble]').forEach(function (el) {
    var original = el.textContent;
    var raf = null;
    el.addEventListener('pointerenter', function () {
      if (reduce) return;
      var frame = 0, total = 14;
      cancelAnimationFrame(raf);
      (function tick() {
        var out = '';
        for (var i = 0; i < original.length; i++) {
          var revealAt = (i / original.length) * total;
          out += (frame >= revealAt || original[i] === ' ') ? original[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        el.textContent = out;
        if (frame++ < total) raf = requestAnimationFrame(tick);
        else el.textContent = original;
      })();
    });
  });

  /* -------------------------------------------------------------- cursor */
  var cursor = $('.cursor');
  if (finePointer && cursor && !reduce) {
    var cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    var label = cursor.querySelector('span');
    addEventListener('pointermove', function (e) { tx = e.clientX; ty = e.clientY; cursor.style.opacity = 1; });
    document.addEventListener('pointerleave', function () { cursor.style.opacity = 0; });
    (function loop() {
      cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
      cursor.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
      requestAnimationFrame(loop);
    })();
    $$('[data-cursor]').forEach(function (el) {
      el.addEventListener('pointerenter', function () { label.textContent = el.getAttribute('data-cursor'); cursor.classList.add('is-label'); });
      el.addEventListener('pointerleave', function () { cursor.classList.remove('is-label'); });
    });
    $$('a, button').forEach(function (el) {
      el.addEventListener('pointerenter', function () { if (!cursor.classList.contains('is-label')) cursor.classList.add('is-link'); });
      el.addEventListener('pointerleave', function () { cursor.classList.remove('is-link'); });
    });
  }

  /* ----------------------------------------------------------------- nav */
  var nav = $('#nav');
  var lastY = 0;
  function onScrollNav(y) {
    nav.classList.toggle('is-scrolled', y > 40);
    var menuOpen = $('#menu').classList.contains('is-open');
    nav.classList.toggle('is-hidden', !menuOpen && y > 400 && y > lastY + 2);
    if (y < lastY - 2) nav.classList.remove('is-hidden');
    lastY = y;
    var wa = $('.wa-float');
    if (wa) wa.classList.toggle('is-on', y > innerHeight * 0.8);
  }

  /* ---------------------------------------------------------------- menu */
  var menu = $('#menu'), menuBtn = $('#menuBtn');
  function setMenu(open) {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menuBtn.setAttribute('aria-expanded', String(open));
    if (lenis) { open ? lenis.stop() : lenis.start(); } else { document.body.style.overflow = open ? 'hidden' : ''; }
  }
  menuBtn.addEventListener('click', function () { setMenu(!menu.classList.contains('is-open')); });
  $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape') { setMenu(false); closeLightbox(); } });

  /* ----------------------------------------------------------------- FAQ */
  $$('.acc__q').forEach(function (q) {
    q.addEventListener('click', function () {
      var item = q.parentElement, open = item.classList.contains('is-open');
      $$('.acc__item.is-open').forEach(function (i) { i.classList.remove('is-open'); $('.acc__q', i).setAttribute('aria-expanded', 'false'); });
      if (!open) { item.classList.add('is-open'); q.setAttribute('aria-expanded', 'true'); }
      if (hasGSAP) setTimeout(function () { ScrollTrigger.refresh(); }, 650);
    });
  });

  /* ------------------------------------------------------------ spotlight */
  $$('.prog').forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* ------------------------------------------------------------ lightbox */
  var lb = $('#lightbox');
  function closeLightbox() { if (lb.classList.contains('is-open')) { lb.classList.remove('is-open'); if (lenis) lenis.start(); } }
  $$('[data-lightbox]').forEach(function (b) {
    b.addEventListener('click', function () {
      $('img', lb).src = b.getAttribute('data-lightbox');
      lb.classList.add('is-open');
      if (lenis) lenis.stop();
      $('.lightbox__close', lb).focus();
    });
  });
  lb.addEventListener('click', function (e) { if (e.target !== $('img', lb)) closeLightbox(); });

  /* ---------------------------------------------------- WhatsApp wall loop */
  $$('.wall__col').forEach(function (col) {
    $$('button', col).forEach(function (b) {
      var c = b.cloneNode(true); c.setAttribute('aria-hidden', 'true'); c.tabIndex = -1;
      c.addEventListener('click', function () { b.click(); });
      col.appendChild(c);
    });
  });

  /* ------------------------------------------------- app screen switcher */
  var appItems = $$('.app__item'), screens = $$('.screen'), currentScreen = 0;
  function setScreen(i) {
    if (i === currentScreen) return;
    currentScreen = i;
    appItems.forEach(function (it, k) {
      it.classList.toggle('is-active', k === i);
      it.setAttribute('aria-selected', String(k === i));
      it.tabIndex = k === i ? 0 : -1;
    });
    screens.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
  }

  /* ------------------------------------------------------- cookie banner */
  (function () {
    var banner = $('#cookieBanner'), consent = null;
    try { consent = localStorage.getItem('cookie_consent'); } catch (e) {}
    if (consent === 'granted') loadGoogleAnalytics();
    else if (consent !== 'denied') setTimeout(function () { banner.classList.add('is-on'); }, 2200);
    function set(v) { try { localStorage.setItem('cookie_consent', v); } catch (e) {} banner.classList.remove('is-on'); }
    $('#cbAccept').addEventListener('click', function () { set('granted'); loadGoogleAnalytics(); });
    $('#cbDecline').addEventListener('click', function () { set('denied'); });
    $('#cookieSettings').addEventListener('click', function (e) { e.preventDefault(); banner.classList.add('is-on'); });
  })();

  /* =====================================================================
     Without GSAP (CDN blocked) or with reduced motion: static page.
     ===================================================================== */
  var lenis = null;
  function endLoader() {
    html.classList.remove('has-loader');
    try { sessionStorage.setItem('ec_intro', '1'); } catch (e) {}
  }

  if (!hasGSAP || reduce) {
    endLoader();
    addEventListener('scroll', function () { onScrollNav(scrollY); }, { passive: true });
    appItems.forEach(function (it, i) { it.addEventListener('click', function () { setScreen(i); }); });
    return;
  }

  /* =====================================================================
     MOTION
     ===================================================================== */
  gsap.registerPlugin(ScrollTrigger);
  var EASE = 'expo.out';

  // Smooth scroll
  if (typeof window.Lenis !== 'undefined') {
    lenis = new Lenis({ duration: 1.15, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); } });
    lenis.on('scroll', function (e) { ScrollTrigger.update(); onScrollNav(e.scroll); });
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    window.ecLenis = lenis;
  } else {
    addEventListener('scroll', function () { onScrollNav(scrollY); }, { passive: true });
  }
  // Anchor links
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length < 2 && id !== '#') return;
      var target = id === '#' || id === '#top' ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: -20, duration: 1.4 });
      else window.scrollTo({ top: target === 0 ? 0 : target.getBoundingClientRect().top + scrollY, behavior: 'smooth' });
    });
  });

  /* ---- Split headings into masked lines */
  $$('[data-split] .line').forEach(function (line) {
    var cls = ['grad-text', 'accent'].filter(function (c) { return line.classList.contains(c); });
    cls.forEach(function (c) { line.classList.remove(c); });
    line.innerHTML = '<span class="line__in ' + cls.join(' ') + '">' + line.innerHTML + '</span>';
  });
  var splitCSS = document.createElement('style');
  splitCSS.textContent = '[data-split] .line{display:block;overflow:hidden;padding-bottom:.06em;margin-bottom:-.06em}[data-split] .line__in{display:inline-block}';
  document.head.appendChild(splitCSS);

  /* ---- Manifesto words */
  $$('[data-words]').forEach(function (p) {
    var out = [];
    p.childNodes.forEach(function (n) {
      var isHl = n.nodeType === 1 && n.classList.contains('hl');
      var text = n.textContent;
      text.split(/(\s+)/).forEach(function (w) {
        if (!w.trim()) { out.push(w); return; }
        out.push('<span class="w' + (isHl ? ' hl' : '') + '">' + w + '</span>');
      });
    });
    p.innerHTML = out.join('');
  });

  /* ---- Marquee rows: duplicate content for a seamless loop */
  $$('[data-marquee]').forEach(function (row) {
    var item = row.firstElementChild;
    for (var i = 0; i < 3; i++) { var c = item.cloneNode(true); row.appendChild(c); }
  });

  /* ---- Intro (after loader) */
  function intro() {
    var tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.from('.nav', { y: -30, autoAlpha: 0, duration: 1, clearProps: 'transform' }, 0)
      .from('.hero [data-split] .line__in', { yPercent: 110, duration: 1.4, stagger: 0.12 }, 0.05)
      .from('.hero__content [data-reveal]', { y: 30, autoAlpha: 0, duration: 1.1, stagger: 0.1 }, 0.35)
      .from('.hero__stats .chip', { y: 30, autoAlpha: 0, duration: 1, stagger: 0.08 }, 0.6)
      .from('.hero__scroll', { autoAlpha: 0, duration: 1 }, 0.9);
    if (mqDesktop.matches) {
      tl.fromTo('.hero__media', { clipPath: 'inset(15% 58% 89% 6% round 28px)' }, { clipPath: 'inset(15% 58% 11% 6% round 28px)', duration: 1.6, ease: 'expo.inOut' }, 0)
        .fromTo('.hero__media img', { scale: 1.5, xPercent: -30 }, { scale: 1.15, xPercent: -30, duration: 2 }, 0);
    } else {
      tl.from('.hero__media', { y: 40, autoAlpha: 0, duration: 1.2 }, 0.3);
    }
    countUp($$('.hero [data-count]'));
  }

  var mqDesktop = window.matchMedia('(min-width: 901px)');

  /* ---- Loader */
  if (html.classList.contains('has-loader')) {
    var counter = { v: 0 }, out = $('#loaderCount');
    if (lenis) lenis.stop();
    gsap.timeline()
      .to(counter, { v: 100, duration: 1.3, ease: 'power2.inOut', onUpdate: function () { out.textContent = Math.round(counter.v); } })
      .to('.loader', { clipPath: 'inset(0 0 100% 0)', duration: 1, ease: 'expo.inOut' }, '+=.1')
      .add(function () { endLoader(); if (lenis) lenis.start(); intro(); }, '-=.55');
    $('.loader').style.clipPath = 'inset(0 0 0% 0)';
  } else {
    intro();
  }

  /* ---- Generic reveals */
  gsap.utils.toArray('[data-reveal]').forEach(function (el) {
    if (el.closest('.hero')) return;
    gsap.from(el, { y: 40, autoAlpha: 0, duration: 1.2, ease: EASE, scrollTrigger: { trigger: el, start: 'top 88%' } });
  });
  gsap.utils.toArray('[data-split]').forEach(function (el) {
    if (el.closest('.hero')) return;
    gsap.from($$('.line__in', el), { yPercent: 110, duration: 1.3, stagger: 0.1, ease: EASE, scrollTrigger: { trigger: el, start: 'top 85%' } });
  });
  gsap.utils.toArray('[data-stagger]').forEach(function (el) {
    gsap.from(el.children, { y: 60, autoAlpha: 0, duration: 1.2, stagger: 0.1, ease: EASE, scrollTrigger: { trigger: el, start: 'top 82%' } });
  });

  /* ---- Counters */
  function countUp(els) {
    els.forEach(function (el) {
      var end = +el.getAttribute('data-count'), suf = el.getAttribute('data-suffix') || '', o = { v: 0 };
      gsap.to(o, { v: end, duration: 2, ease: 'power3.out', delay: 0.4, onUpdate: function () { el.textContent = Math.round(o.v) + suf; } });
    });
  }
  $$('[data-count]').forEach(function (el) {
    if (el.closest('.hero')) return;
    ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: function () { countUp([el]); } });
  });

  /* ---- Velocity marquee */
  $$('[data-marquee]').forEach(function (row) {
    var dir = +row.getAttribute('data-marquee');
    var tween = gsap.fromTo(row, { xPercent: dir > 0 ? 0 : -50 }, { xPercent: dir > 0 ? -50 : 0, duration: 30, ease: 'none', repeat: -1 });
    var skewTo = gsap.quickTo(row, 'skewX', { duration: 0.5, ease: 'power3' });
    ScrollTrigger.create({
      trigger: '.marquee', start: 'top bottom', end: 'bottom top',
      onUpdate: function (self) {
        var v = self.getVelocity();
        gsap.to(tween, { timeScale: self.direction * (1 + Math.min(Math.abs(v) / 400, 5)), duration: 0.2, overwrite: true });
        gsap.to(tween, { timeScale: self.direction, duration: 1.2, delay: 0.2 });
        skewTo(gsap.utils.clamp(-8, 8, v / -250));
      }
    });
  });

  /* ---- Manifesto: words light up */
  $$('[data-words]').forEach(function (p) {
    gsap.to($$('.w', p), {
      opacity: 1, stagger: 0.1, ease: 'none',
      scrollTrigger: { trigger: p, start: 'top 75%', end: 'bottom 45%', scrub: 0.6 }
    });
  });

  /* ---- Parallax images */
  $$('[data-parallax]').forEach(function (img) {
    gsap.fromTo(img, { yPercent: -8 }, { yPercent: -18, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  /* ---- Process line */
  var steps = $$('.step');
  gsap.fromTo('.steps__line i', { scaleX: 0 }, {
    scaleX: 1, ease: 'none',
    scrollTrigger: {
      trigger: '.steps', start: 'top 75%', end: 'bottom 55%', scrub: 0.5,
      onUpdate: function (self) { steps.forEach(function (s, i) { s.classList.toggle('is-on', self.progress >= i / (steps.length - 1) - 0.02); }); }
    }
  });
  if (!mqDesktop.matches) {
    steps.forEach(function (s) { ScrollTrigger.create({ trigger: s, start: 'top 75%', onEnter: function () { s.classList.add('is-on'); } }); });
  }

  /* ---- Stacking cards: earlier cards recede */
  var cards = $$('.stack__card');
  cards.forEach(function (card, i) {
    var next = cards[i + 1];
    if (!next) return;
    gsap.to(card, {
      scale: 0.92, filter: 'brightness(.55)', ease: 'none',
      scrollTrigger: { trigger: next, start: 'top bottom', end: 'top 20%', scrub: true }
    });
  });

  /* ---- CTA outline fill */
  gsap.fromTo('[data-fill]', { backgroundPosition: '0% 0' }, {
    backgroundPosition: '100% 0', ease: 'none',
    scrollTrigger: { trigger: '.cta__title', start: 'top 80%', end: 'top 30%', scrub: true }
  });
  gsap.from('.cta__title .line:first-child', { yPercent: 40, autoAlpha: 0, duration: 1.3, ease: EASE, scrollTrigger: { trigger: '.cta__title', start: 'top 85%' } });

  /* ---- Footer wordmark */
  gsap.from('.footer__mark span', { yPercent: 100, duration: 1.2, stagger: 0.05, ease: EASE, scrollTrigger: { trigger: '.footer__mark', start: 'top 95%' } });

  /* ---- Breakpoint-specific pins */
  var mm = gsap.matchMedia();

  mm.add('(min-width: 901px)', function () {
    // HERO: photo frame expands to full-bleed while the copy lifts away.
    // The photo starts shifted so the trainer sits inside the small frame, then recenters.
    gsap.set('.hero__media img', { xPercent: -30 });
    var heroTl = gsap.timeline({
      scrollTrigger: { trigger: '.hero', start: 'top top', end: '+=120%', pin: true, scrub: 0.8, anticipatePin: 1 }
    });
    heroTl
      .fromTo('.hero__media', { clipPath: 'inset(15% 58% 11% 6% round 28px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'power2.inOut', immediateRender: false }, 0)
      .fromTo('.hero__media img', { scale: 1.15, xPercent: -30 }, { scale: 1, xPercent: 0, ease: 'power2.inOut', immediateRender: false }, 0)
      .to('.hero__media', { '--shade': 1, ease: 'none' }, 0.2)
      .to('.hero__content', { yPercent: -18, autoAlpha: 0, ease: 'power2.in' }, 0)
      .to(['.hero__stats', '.hero__scroll'], { autoAlpha: 0, y: 20, ease: 'power1.in' }, 0)
      .fromTo('.hero__caption', { autoAlpha: 0, y: 60 }, { autoAlpha: 1, y: 0, ease: 'power2.out' }, 0.55);

    // RESULTS: vertical scroll drives the horizontal track (RTL => move toward +x)
    var track = $('.results__track');
    var dist = function () { return Math.max(0, track.scrollWidth - innerWidth); };
    gsap.to(track, {
      x: function () { return dist(); }, ease: 'none',
      scrollTrigger: {
        trigger: '.results', start: 'top top', end: function () { return '+=' + dist(); },
        pin: '.results', pinSpacing: true, scrub: 0.6, invalidateOnRefresh: true,
        onUpdate: function (self) { gsap.set('.results__progress i', { scaleX: self.progress }); }
      }
    });

    // APP: pinned, the active feature follows scroll progress
    var appST = ScrollTrigger.create({
      trigger: '#app', start: 'top top', end: '+=240%', pin: true, scrub: true,
      onUpdate: function (self) { setScreen(Math.min(appItems.length - 1, Math.floor(self.progress * appItems.length))); }
    });
    var clicks = appItems.map(function (it, i) {
      var fn = function () {
        var y = appST.start + (appST.end - appST.start) * ((i + 0.5) / appItems.length);
        lenis ? lenis.scrollTo(y, { duration: 1 }) : scrollTo({ top: y, behavior: 'smooth' });
      };
      it.addEventListener('click', fn);
      return fn;
    });
    gsap.from('.phone', { y: 120, rotate: -6, autoAlpha: 0, duration: 1.4, ease: EASE, scrollTrigger: { trigger: '#app', start: 'top 70%' } });

    return function () { appItems.forEach(function (it, i) { it.removeEventListener('click', clicks[i]); }); };
  });

  mm.add('(max-width: 900px)', function () {
    // Tap to switch + autoplay while the phone is in view
    var timer = null;
    var handlers = appItems.map(function (it, i) {
      var fn = function () { setScreen(i); restart(); };
      it.addEventListener('click', fn);
      return fn;
    });
    function restart() { clearInterval(timer); timer = setInterval(function () { setScreen((currentScreen + 1) % appItems.length); }, 3500); }
    var st = ScrollTrigger.create({ trigger: '#app', start: 'top 80%', end: 'bottom 20%', onToggle: function (s) { s.isActive ? restart() : clearInterval(timer); } });
    return function () { clearInterval(timer); st.kill(); appItems.forEach(function (it, i) { it.removeEventListener('click', handlers[i]); }); };
  });

  // Images load late; recompute pin distances once they have dimensions
  addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
