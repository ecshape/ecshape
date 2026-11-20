/**
 * JS mirror of the motion tokens in src/styles/motion.css (keep the numbers in sync).
 * Use for GSAP / Web Animations / timers that wait for a CSS transition to finish.
 */
export const MOTION = {
  /** seconds */
  press: 0.06,
  fast: 0.16,
  med: 0.22,
  slow: 0.26,
  data: 0.6,
  /** px */
  rise: 4,
  shiftPanel: 24,
  /** GSAP name of --ease-out */
  ease: 'expo.out',
  css: {
    easeOut: 'cubic-bezier(.22, 1, .36, 1)',
    easeIn: 'cubic-bezier(.4, 0, 1, 1)',
  },
} as const;

/** Milliseconds of a token, for setTimeout after an exit animation. */
export const ms = (seconds: number) => Math.round(seconds * 1000);

/** True when the visitor asked the OS for less motion. Safe during SSR / tests. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** scrollIntoView / scrollTo behaviour that respects reduced motion. */
export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? 'auto' : 'smooth');
