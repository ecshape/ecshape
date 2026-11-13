import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import gsap from 'gsap';

/** Enter selectors inspired by LaveriExpert / codeandchill-style dashboards. */
const ENTER = [
  '.ec-page-title',
  '.ec-page-header',
  '[data-ec-enter]',
  '.ec-card',
  '.ec-kpi',
  '.ec-stagger > *',
].join(',');

function reduced() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Flag the document while any portal shell is mounted. */
export function usePortalRoot(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const html = document.documentElement;
    html.classList.add('ec-portal-on');
    return () => html.classList.remove('ec-portal-on');
  }, [enabled]);
}

/** Short stagger entrance on every route change inside the portal. */
export function usePortalMotion(scope: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();

  useEffect(() => {
    const root = scope.current;
    if (!root || reduced()) return;
    let ctx: gsap.Context | null = null;
    const t = window.setTimeout(() => {
      ctx = gsap.context(() => {
        const items = gsap.utils
          .toArray<HTMLElement>(ENTER, root)
          .filter((el) => el.getBoundingClientRect().top < window.innerHeight * 1.45);
        if (!items.length) return;
        gsap.fromTo(
          items.slice(0, 36),
          { y: 14, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.55,
            ease: 'power3.out',
            stagger: 0.035,
            clearProps: 'transform,opacity,visibility',
          },
        );
      }, root);
    }, 80);
    return () => {
      window.clearTimeout(t);
      ctx?.revert();
    };
  }, [pathname, scope]);
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
