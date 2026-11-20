/** Portal chrome hooks. Route entrance is pure CSS (.ec-route / .tr-route / .ec-page-enter in styles/motion.css). */
import { useEffect, useLayoutEffect, type RefObject } from 'react';

/** Flag the document while any portal shell is mounted. */
export function usePortalRoot(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const html = document.documentElement;
    html.classList.add('ec-portal-on');
    return () => html.classList.remove('ec-portal-on');
  }, [enabled]);
}

/** Sliding active pill for vertical trainer nav. */
export function useNavPill(nav: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const place = () => {
      const active = el.querySelector<HTMLElement>('[data-nav-active="true"]');
      if (!active) {
        el.style.setProperty('--ec-pill-o', '0');
        return;
      }
      el.style.setProperty('--ec-pill-y', `${active.offsetTop}px`);
      el.style.setProperty('--ec-pill-h', `${active.offsetHeight}px`);
      el.style.setProperty('--ec-pill-o', '1');
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
