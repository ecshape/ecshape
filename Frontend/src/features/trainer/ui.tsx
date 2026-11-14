import React, { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/features/trainee/format';
import './i18n';
import '@/features/trainee/trainee.css';
import './trainer.css';

// The trainee kit is the base of the trainer kit: same surfaces, numbers, rings and sheets.
export { Skel, EmptyState, ErrorState, CountUp, Ring, Bar, Sparkline, Sheet } from '@/features/trainee/ui';

/* ------------------------------------------------------------------ liquid indicator */

type Box = { x: number; y: number; w: number; h: number };
type Phase = 'jump' | 'stretch' | 'settle';
/** Last indicator position per key: the shell remounts on every route, so the blob starts where it was. */
const liquidMemory: Record<string, Box> = {};

/**
 * Measures the element marked `data-liquid-active="true"` inside `ref` and returns CSS vars for a blob that
 * first stretches from the previous item to the new one, then springs into place.
 */
export function useLiquid(ref: React.RefObject<HTMLElement>, activeKey: string | null | undefined, axis: 'x' | 'y', memoryKey?: string) {
  const [box, setBox] = useState<(Box & { phase: Phase }) | null>(null);
  const last = useRef<Box | null>(memoryKey ? liquidMemory[memoryKey] ?? null : null);

  useLayoutEffect(() => {
    const wrap = ref.current;
    if (!wrap) return;
    const timers: number[] = [];
    const measure = (): Box | null => {
      const el = wrap.querySelector<HTMLElement>('[data-liquid-active="true"]');
      if (!el) return null;
      return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    };
    const remember = (b: Box) => {
      last.current = b;
      if (memoryKey) liquidMemory[memoryKey] = b;
    };
    const target = measure();
    if (!target) {
      setBox(null);
      return;
    }
    const prev = last.current;
    const moved = prev && (axis === 'y' ? Math.abs(prev.y - target.y) > 2 : Math.abs(prev.x - target.x) > 2);
    if (prev && moved && !prefersReducedMotion()) {
      setBox({ ...prev, phase: 'jump' });
      const span: Box =
        axis === 'y'
          ? { ...target, y: Math.min(prev.y, target.y), h: Math.max(prev.y + prev.h, target.y + target.h) - Math.min(prev.y, target.y) }
          : { ...target, x: Math.min(prev.x, target.x), w: Math.max(prev.x + prev.w, target.x + target.w) - Math.min(prev.x, target.x) };
      timers.push(window.setTimeout(() => setBox({ ...span, phase: 'stretch' }), 30));
      timers.push(window.setTimeout(() => setBox({ ...target, phase: 'settle' }), 270));
    } else {
      setBox({ ...target, phase: prev ? 'settle' : 'jump' });
    }
    remember(target);

    const ro = new ResizeObserver(() => {
      const b = measure();
      if (!b) return;
      remember(b);
      setBox({ ...b, phase: 'jump' });
    });
    ro.observe(wrap);
    return () => {
      timers.forEach(clearTimeout);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, axis]);

  const style = box
    ? ({ ['--x' as string]: `${box.x}px`, ['--y' as string]: `${box.y}px`, ['--w' as string]: `${box.w}px`, ['--h' as string]: `${box.h}px` } as React.CSSProperties)
    : { opacity: 0 };
  return { style, phase: box?.phase === 'jump' ? 'jump' : box?.phase, visible: !!box };
}

/* ------------------------------------------------------------------ small pieces */

const hueOf = (seed: string | number) => {
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  // Keep inside the warm brand range plus a few cool accents for variety.
  const palette = [24, 14, 32, 4, 340, 200, 168, 260];
  return palette[h % palette.length];
};

export const initials = (name?: string | null) =>
  (name || '?').split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().slice(0, 2);

export const Avatar: React.FC<{ name?: string | null; seed?: string | number; size?: number; live?: boolean; className?: string }> = ({ name, seed, size = 48, live, className }) => (
  <span
    className={cn('tr-avatar', className)}
    data-live={live || undefined}
    style={{ width: size, height: size, fontSize: size * 0.4, borderRadius: size * 0.34, ['--h' as string]: hueOf(seed ?? name ?? '') }}
    aria-hidden
  >
    {initials(name)}
  </span>
);

/** Segmented filter with a sliding pill. */
export function Seg<T extends string>({
  value, onChange, items, label, className, memoryKey,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: React.ReactNode; count?: number; icon?: React.ElementType }[];
  label: string;
  className?: string;
  memoryKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const blob = useLiquid(ref, value, 'x', memoryKey);
  return (
    <div ref={ref} className={cn('tr-seg', className)} role="group" aria-label={label}>
      <span className="tr-hblob" data-phase={blob.phase} style={blob.style} aria-hidden />
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className="tr-seg-btn"
          aria-pressed={value === it.id}
          data-liquid-active={value === it.id || undefined}
          onClick={() => onChange(it.id)}
        >
          {it.icon && <it.icon className="h-4 w-4" />}
          {it.label}
          {typeof it.count === 'number' && <span className="tr-seg-count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Tab strip (ARIA tabs) with the same liquid pill. */
export function TabStrip<T extends string>({
  value, onChange, items, label, idPrefix = 'tr-tab',
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: React.ReactNode; icon?: React.ElementType }[];
  label: string;
  idPrefix?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const blob = useLiquid(ref, value, 'x');
  const onKey = (e: React.KeyboardEvent) => {
    const i = items.findIndex((it) => it.id === value);
    const rtl = (e.currentTarget as HTMLElement).closest('[dir="rtl"]') !== null;
    const next = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
    if (!next) return;
    e.preventDefault();
    const it = items[(i + next + items.length) % items.length];
    onChange(it.id);
    requestAnimationFrame(() => document.getElementById(`${idPrefix}-${it.id}`)?.focus());
  };
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-liquid-active="true"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [value]);
  return (
    <div ref={ref} className="tr-seg w-full sm:w-auto" role="tablist" aria-label={label} onKeyDown={onKey}>
      <span className="tr-hblob" data-phase={blob.phase} style={blob.style} aria-hidden />
      {items.map((it) => (
        <button
          key={it.id}
          id={`${idPrefix}-${it.id}`}
          type="button"
          role="tab"
          tabIndex={value === it.id ? 0 : -1}
          aria-selected={value === it.id}
          aria-controls={`${idPrefix}-panel`}
          className="tr-seg-btn"
          data-liquid-active={value === it.id || undefined}
          onClick={() => onChange(it.id)}
        >
          {it.icon && <it.icon className="h-4 w-4" />}
          {it.label}
        </button>
      ))}
    </div>
  );
}

export const BackLink: React.FC<{ to?: string; onClick?: () => void; label?: React.ReactNode; className?: string }> = ({ to, onClick, label, className }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <button type="button" className={cn('tr-back tp-press', className)} onClick={onClick ?? (() => (to ? navigate(to) : navigate(-1)))}>
      <ArrowLeft className="h-4 w-4" />
      {label ?? t('trainer.common.back')}
    </button>
  );
};

export const SectionCard: React.FC<{
  icon?: React.ElementType;
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: React.CSSProperties;
}> = ({ icon: Icon, title, action, children, className, bodyClassName, style }) => (
  <section className={cn('tp-card p-5 sm:p-6', className)} style={style}>
    {(title || action) && (
      <div className="tr-section-title justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="tr-section-ico">
              <Icon className="h-[18px] w-[18px]" />
            </span>
          )}
          {title && <h2 className="truncate">{title}</h2>}
        </div>
        {action}
      </div>
    )}
    <div className={bodyClassName}>{children}</div>
  </section>
);

/** Pointer-follow highlight for `.tr-spot` surfaces. */
export const spotlight = (e: React.PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
};

export const Field: React.FC<{ label: React.ReactNode; htmlFor?: string; hint?: React.ReactNode; error?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  label, htmlFor, hint, error, children, className,
}) => (
  <div className={cn('tr-field', className)}>
    <label htmlFor={htmlFor}>{label}</label>
    {children}
    {error ? <p className="text-xs font-semibold text-[hsl(var(--tr-bad))]">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

export const PageTitle: React.FC<{ eyebrow?: React.ReactNode; title: React.ReactNode; accent?: React.ReactNode; actions?: React.ReactNode; lead?: React.ReactNode; className?: string }> = ({
  eyebrow, title, accent, actions, lead, className,
}) => (
  <header className={cn('mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8', className)}>
    <div className="min-w-0">
      {eyebrow && <div className="tp-label tp-rise">{eyebrow}</div>}
      <h1 className="tp-title tp-rise mt-2 break-words text-[2.75rem] sm:text-6xl lg:text-[4.5rem]" style={{ ['--i' as string]: 1 }}>
        {title}
        {accent && <span className="tr-grad-text block">{accent}</span>}
      </h1>
      {lead && <p className="tp-rise mt-3 max-w-xl text-muted-foreground" style={{ ['--i' as string]: 2 }}>{lead}</p>}
    </div>
    {actions && <div className="tp-rise flex flex-wrap items-center gap-2" style={{ ['--i' as string]: 2 }}>{actions}</div>}
  </header>
);
