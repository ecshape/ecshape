import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type Pos = { top: number; left: number; placement: 'bottom' | 'top' };
const GAP = 8;
const MAX_W = 300;
const EDGE = 12;

/**
 * Small "i" for contextual help (same behaviour as LaveriExpert's InfoTip):
 * hover on desktop, tap on touch, Escape to close. The bubble is portalled so cards
 * with overflow:hidden never clip it. Use it next to titles, labels and buttons:
 *   <h2>Title <InfoTip>What this does.</InfoTip></h2>
 */
export function InfoTip({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  const id = useId();
  const btnRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const timer = useRef<number | null>(null);

  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = bubbleRef.current?.offsetHeight ?? 0;
    const w = bubbleRef.current?.offsetWidth || Math.min(MAX_W, vw - EDGE * 2);
    const left = Math.max(EDGE, Math.min(r.left + r.width / 2 - w / 2, vw - w - EDGE));
    const below = r.bottom + GAP;
    const placement = below + h <= vh - EDGE || r.top - GAP - h < EDGE ? 'bottom' : 'top';
    setPos({ top: placement === 'bottom' ? below : r.top - GAP - h, left, placement });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || bubbleRef.current?.contains(t)) return;
      setOpen(false);
      setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      setPinned(false);
      btnRef.current?.focus();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const toggle = () => {
    setPinned((p) => !p);
    setOpen((o) => !(pinned && o));
  };

  return (
    <>
      {/* a span, so it can sit inside a <label> or <button> without stealing their click */}
      <span
        ref={btnRef}
        role="button"
        tabIndex={0}
        aria-label={label || 'Info'}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className={cn('ec-info-tip', open && 'is-open', className)}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          if (timer.current) window.clearTimeout(timer.current);
          setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse' || pinned) return;
          timer.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!pinned) setOpen(false); }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        }}
      >
        <svg viewBox="0 0 20 20" aria-hidden>
          <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 9v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="10" cy="6.2" r="1.05" fill="currentColor" />
        </svg>
      </span>
      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            id={id}
            role="tooltip"
            className={cn('ec-info-bubble', pos?.placement === 'top' && 'is-top')}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, maxWidth: MAX_W }}
            onPointerEnter={() => { if (timer.current) window.clearTimeout(timer.current); }}
            onPointerLeave={() => { if (!pinned) setOpen(false); }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

export default InfoTip;
