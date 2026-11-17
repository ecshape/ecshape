import { useEffect, useRef, useState } from 'react';

/**
 * QA #62: drag a bottom sheet down to close it, like a native app.
 * The sheet follows the finger 1:1; on release it closes when pulled far enough (or flicked),
 * otherwise it springs back. Only on phone widths (below `maxWidth`), where the panel is a bottom sheet.
 *
 * - From the handle / header the drag starts at once.
 * - From inside a scroll area it starts only when that area is scrolled to the top and the finger moves down,
 *   so normal scrolling still works.
 * - Horizontal swipes (carousels), sliders and text fields are left alone.
 *
 * Returns a callback ref for the panel element.
 */
export function useSwipeClose(onClose: () => void, opts: { maxWidth?: number; overlaySelector?: string } = {}) {
  const { maxWidth = 640, overlaySelector = '.tp-sheet-overlay, .tr-xs-overlay, .tr-picker-scrim' } = opts;
  const [node, setNode] = useState<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const el = node;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let startX = 0, startY = 0;
    let mode: 'idle' | 'pending' | 'drag' | 'off' = 'idle';
    let fromScroll: HTMLElement | null = null;
    let dy = 0, lastY = 0, lastT = 0, vel = 0, height = 1, passed = false;
    const overlay = () => el.parentElement?.querySelector<HTMLElement>(overlaySelector) ?? null;

    const scrollParent = (t: EventTarget | null): HTMLElement | null => {
      for (let n = t as HTMLElement | null; n && n !== el; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
      }
      return null;
    };

    const setY = (y: number, animate: boolean) => {
      el.style.transition = animate ? `transform ${reduce ? 0 : 0.32}s cubic-bezier(.2,.9,.25,1)` : 'none';
      el.style.transform = y ? `translate3d(0, ${y}px, 0)` : '';
      const o = overlay();
      if (o) {
        o.style.transition = animate ? 'opacity .32s ease' : 'none';
        o.style.opacity = y ? String(Math.max(0, 1 - y / height)) : '';
      }
    };

    const onStart = (e: TouchEvent) => {
      if (window.innerWidth >= maxWidth || e.touches.length !== 1) { mode = 'off'; return; }
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"], [data-no-swipe], input[type="range"]')) { mode = 'off'; return; }
      fromScroll = scrollParent(e.target);
      if (fromScroll && fromScroll.scrollTop > 0) { mode = 'off'; return; }
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY; lastT = e.timeStamp; lastY = t.clientY;
      dy = 0; vel = 0; passed = false;
      height = el.getBoundingClientRect().height || 1;
      mode = 'pending';
    };

    const onMove = (e: TouchEvent) => {
      if (mode === 'off' || mode === 'idle') return;
      const t = e.touches[0];
      const mx = t.clientX - startX, my = t.clientY - startY;
      if (mode === 'pending') {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        // Horizontal or upward move: not a close gesture (let the page/carousel scroll).
        if (Math.abs(mx) > Math.abs(my) || my < 0 || (fromScroll && fromScroll.scrollTop > 0)) { mode = 'off'; return; }
        mode = 'drag';
        startY = t.clientY; // start from here so the sheet does not jump
        el.style.animation = 'none'; // the open animation's fill would override the inline transform
        el.style.willChange = 'transform';
      }
      if (e.cancelable) e.preventDefault(); // stop the scroll area from bouncing while we drag
      const raw = t.clientY - startY;
      dy = raw > 0 ? raw : raw / 4; // slight resistance when pushed up
      const dt = e.timeStamp - lastT;
      if (dt > 0) vel = 0.8 * ((t.clientY - lastY) / dt) + 0.2 * vel;
      lastY = t.clientY; lastT = e.timeStamp;
      const willClose = dy > height * 0.3;
      if (willClose !== passed) { passed = willClose; if (willClose) navigator.vibrate?.(8); }
      setY(Math.max(dy, -24), false);
    };

    const onEnd = () => {
      if (mode !== 'drag') { mode = 'idle'; return; }
      mode = 'idle';
      el.style.willChange = '';
      const shouldClose = dy > height * 0.3 || (vel > 0.5 && dy > 24);
      if (shouldClose) {
        setY(height + 40, true);
        window.setTimeout(() => { closeRef.current(); window.setTimeout(() => setY(0, false), 50); }, reduce ? 0 : 200);
      } else {
        setY(0, true);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [node, maxWidth, overlaySelector]);

  return setNode;
}
