/* Hero scroll sequence — the trainer goes from arms down to arms crossed as the visitor scrolls.

   Real footage, scrubbed frame by frame on a <canvas> (the Apple product-page technique): a short clip is cut
   into stills by tools/make-hero-sequence.py, which writes /site/seq/hero/manifest.json next to them.
   No manifest (or a broken one) => nothing changes: the hero keeps its still photo.

   The canvas mirrors the hero <img>: siteMotion.js keeps framing the <img> (fit / cover transforms, QA #33) and
   this module copies its size and transform onto the canvas every frame, so all the existing hero choreography
   (clip-path opening, push-in, shade) applies to the moving picture too. The <img> stays as poster and fallback.

   Loading is progressive: frame 0 and the last frame first, then every 8th, 4th, 2nd, then the rest, so a fast
   scroll always has a near frame to draw (nearest loaded frame wins) instead of a blank. */

const ORDER_STEPS = [8, 4, 2, 1];

function loadOrder(count) {
  const seen = new Set([0, count - 1]);
  const out = [0, count - 1];
  ORDER_STEPS.forEach((step) => {
    for (let i = 0; i < count; i += step) if (!seen.has(i)) { seen.add(i); out.push(i); }
  });
  return out;
}

const pad = (n, w) => String(n).padStart(w, '0');

/**
 * @param {{ media: HTMLElement, pic: HTMLImageElement, url: string, small: boolean, signal: AbortSignal }} o
 * @returns {Promise<null | { count: number, lock: number, set: (p: number) => void, sync: () => void, destroy: () => void }>}
 */
export async function createHeroSequence({ media, pic, url, small, signal }) {
  let m;
  try {
    const r = await fetch(url, { signal, cache: 'force-cache' });
    if (!r.ok) return null;
    m = await r.json();
  } catch (e) {
    return null; // no sequence published, or the host answered with the SPA page
  }
  const count = Math.max(0, m && +m.count) || 0;
  if (count < 2 || signal.aborted) return null;

  const base = url.replace(/[^/]*$/, '');
  const dir = small && m.small ? m.small : m.large || m.small;
  const digits = +m.digits || 4;
  const ext = m.ext || 'webp';
  const src = (i) => `${base}${dir}/${pad(i + 1, digits)}.${ext}`;

  const frames = new Array(count).fill(null);
  const canvas = document.createElement('canvas');
  canvas.className = 'hero__seq';
  canvas.setAttribute('aria-hidden', 'true');
  const g = canvas.getContext('2d', { alpha: false });
  let current = -1;
  let wanted = 0;
  let alive = true;

  const nearest = (i) => {
    if (frames[i]) return i;
    for (let d = 1; d < count; d++) {
      if (i - d >= 0 && frames[i - d]) return i - d;
      if (i + d < count && frames[i + d]) return i + d;
    }
    return -1;
  };
  const draw = (i) => {
    const k = nearest(i);
    if (k < 0 || k === current) return;
    const img = frames[k];
    if (canvas.width !== img.naturalWidth) { canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; }
    g.drawImage(img, 0, 0);
    current = k;
  };

  const load = (i) => new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const done = () => { if (alive) { frames[i] = img; if (Math.abs(i - wanted) < Math.abs(current - wanted) || current < 0) draw(wanted); } resolve(); };
      // decode() off the main thread when it can, but never wait on it for long (it can stall in background tabs)
      const decoded = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
      Promise.race([decoded, new Promise((r) => setTimeout(r, 250))]).then(done);
    };
    img.onerror = () => resolve();
    img.src = src(i);
  });

  // First frame before anything is shown, so the poster swap is invisible.
  await load(0);
  if (!alive || signal.aborted || !frames[0]) return null;

  // The poster becomes frame 0: same ratio as the sequence, so siteMotion's fit maths frames the clip correctly.
  if (m.focus) media.setAttribute('data-focus', m.focus);
  if (m.pos) media.setAttribute('data-pos', m.pos);
  pic.src = frames[0].src;
  media.insertBefore(canvas, pic.nextSibling);
  media.classList.add('has-seq');
  draw(0);

  // Rest of the frames, a few at a time (keeps the first paint and the main thread free).
  (async () => {
    const order = loadOrder(count).filter((i) => i !== 0);
    const LANES = 6;
    let next = 0;
    const lane = async () => { while (alive && next < order.length) await load(order[next++]); };
    await Promise.all(Array.from({ length: LANES }, lane));
  })();

  const sync = () => {
    // Same box and transform as the framed <img>
    const s = pic.style;
    const c = canvas.style;
    if (c.width !== s.width) c.width = s.width;
    if (c.height !== s.height) c.height = s.height;
    if (c.transform !== s.transform) c.transform = s.transform;
  };

  // Follow every change siteMotion makes to the <img> frame (GSAP writes its inline style), not the clock.
  const mo = new MutationObserver(sync);
  mo.observe(pic, { attributes: true, attributeFilter: ['style'] });
  sync();

  return {
    count,
    /** fraction of the clip at which the arms lock (the "impact" beat) */
    lock: Math.min(0.98, Math.max(0.3, +m.lock || 0.82)),
    set(p) {
      wanted = Math.round(Math.min(1, Math.max(0, p)) * (count - 1));
      draw(wanted);
    },
    sync,
    destroy() {
      alive = false;
      mo.disconnect();
      canvas.remove();
      media.classList.remove('has-seq');
    },
  };
}
