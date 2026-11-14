import React, { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface LiquidItem {
  id: string;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  badge?: number;
}

interface LiquidNavProps {
  items: LiquidItem[];
  active: string;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  itemClassName?: string;
  ariaLabel?: string;
}

/**
 * Navigation with a "liquid" active highlight: a single blob that stretches toward the newly
 * selected item, then settles (springy transform + size transition). Pure CSS motion.
 */
/** Last blob box per orientation: pages remount the nav on every route. */
const lastBox: Record<string, { x: number; y: number; w: number; h: number } | undefined> = {};

export const LiquidNav: React.FC<LiquidNavProps> = ({ items, active, orientation = 'horizontal', className, itemClassName, ariaLabel }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const [blob, setBlob] = useState<{ x: number; y: number; w: number; h: number; stretch: boolean } | null>(null);
  const prev = useRef<string | null>(null);

  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLElement>(`[data-liquid-id="${CSS.escape(active)}"]`);
      if (!el || !wrap.current) return setBlob(null);
      const target = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      const from = prev.current === null ? lastBox[orientation] : null;
      const moved = !!from && (from.x !== target.x || from.y !== target.y || from.w !== target.w);
      lastBox[orientation] = target;
      if (moved && from) {
        // The page (and this nav) remounted on navigation: start where the blob was, then glide.
        setBlob({ ...from, stretch: false });
        frame = window.requestAnimationFrame(() => {
          frame = window.requestAnimationFrame(() => setBlob({ ...target, stretch: true }));
        });
      } else {
        setBlob({ ...target, stretch: prev.current !== null && prev.current !== active });
      }
      prev.current = active;
    };
    measure();
    let primed = false;
    const ro = new ResizeObserver(() => {
      if (!primed) {
        primed = true;
        return;
      }
      measure();
    });
    if (wrap.current) ro.observe(wrap.current);
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, items.length]);

  const vertical = orientation === 'vertical';
  return (
    <div ref={wrap} role="navigation" aria-label={ariaLabel} className={cn('relative isolate', vertical ? 'flex flex-col gap-1' : 'flex items-center gap-1', className)}>
      {blob && (
        <span
          aria-hidden="true"
          className="liquid-blob pointer-events-none absolute left-0 top-0 -z-10 rounded-full bg-primary"
          data-stretch={blob.stretch ? (vertical ? 'y' : 'x') : undefined}
          style={{ width: blob.w, height: blob.h, transform: `translate3d(${blob.x}px, ${blob.y}px, 0)` }}
          onAnimationEnd={() => setBlob((b) => (b ? { ...b, stretch: false } : b))}
        />
      )}
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            data-liquid-id={item.id}
            onClick={item.onClick}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              vertical && 'w-full justify-start rounded-2xl',
              itemClassName
            )}
          >
            <item.icon className="h-[18px] w-[18px] flex-none" />
            <span className="truncate">{item.label}</span>
            {!!item.badge && (
              <span className={cn('ms-auto min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold leading-5', isActive ? 'bg-white/25 text-white' : 'bg-primary text-primary-foreground')}>
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default LiquidNav;
