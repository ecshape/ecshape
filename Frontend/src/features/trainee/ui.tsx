import React, { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { RotateCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtNum, prefersReducedMotion } from './format';

/** Page container: phone-first gutters, comfortable max width on desktop. */
export const Screen: React.FC<{ children: React.ReactNode; className?: string; wide?: boolean }> = ({ children, className, wide }) => (
  <div className={cn('tp-screen mx-auto w-full px-4 pb-10 pt-5 sm:px-6 lg:px-10 lg:pt-10', wide ? 'max-w-6xl' : 'max-w-5xl', className)}>{children}</div>
);

export const ScreenHeader: React.FC<{ eyebrow?: React.ReactNode; title: React.ReactNode; accent?: React.ReactNode; actions?: React.ReactNode; className?: string }> = ({
  eyebrow, title, accent, actions, className,
}) => (
  <header className={cn('mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8', className)}>
    <div className="min-w-0">
      {eyebrow && <p className="tp-label tp-rise">{eyebrow}</p>}
      <h1 className="tp-title tp-rise mt-2 break-words text-[2.9rem] sm:text-6xl lg:text-7xl" style={{ ['--i' as string]: 1 }}>
        {title}
        {accent && <span className="block text-primary">{accent}</span>}
      </h1>
    </div>
    {actions && <div className="tp-rise flex flex-wrap items-center gap-2" style={{ ['--i' as string]: 2 }}>{actions}</div>}
  </header>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode; className?: string }> = ({ children, action, className }) => (
  <div className={cn('mb-3 mt-8 flex items-center justify-between gap-3', className)}>
    <h2 className="tp-title text-[1.9rem] sm:text-4xl">{children}</h2>
    {action}
  </div>
);

export const Skel: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => <div className={cn('tp-skel', className)} style={style} aria-hidden />;

/** Friendly empty state, never a raw "no data". */
export const EmptyState: React.FC<{ icon: React.ElementType; title: React.ReactNode; body?: React.ReactNode; action?: React.ReactNode; className?: string }> = ({
  icon: Icon, title, body, action, className,
}) => (
  <div className={cn('tp-card flex flex-col items-center px-6 py-10 text-center', className)}>
    <span className="relative mb-4 grid h-16 w-16 place-items-center rounded-[1.4rem] bg-primary/12 text-primary">
      <span className="absolute inset-0 animate-ping rounded-[1.4rem] bg-primary/10 [animation-duration:2.4s] motion-reduce:hidden" />
      <Icon className="relative h-7 w-7" />
    </span>
    <h3 className="tp-title text-3xl">{title}</h3>
    {body && <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

/** Inline error with retry; used instead of toasts while loading. */
export const ErrorState: React.FC<{ onRetry: () => void; className?: string; compact?: boolean }> = ({ onRetry, className, compact }) => {
  const { t } = useTranslation();
  return (
    <div className={cn('tp-card flex items-center justify-between gap-3 p-4', !compact && 'flex-col py-8 text-center sm:flex-row sm:text-start', className)} role="alert">
      <div className="min-w-0">
        <p className="font-semibold">{t('trainee.common.loadErrorTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('trainee.common.loadErrorBody')}</p>
      </div>
      <button type="button" onClick={onRetry} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">
        <RotateCw className="h-4 w-4" />
        {t('trainee.common.retry')}
      </button>
    </div>
  );
};

/** Counts from the previous value to the new one; instant when motion is reduced. */
export const CountUp: React.FC<{ value: number; digits?: number; className?: string; duration?: number; format?: (n: number) => string }> = ({
  value, digits = 0, className, duration = 900, format,
}) => {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(value)) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setShown(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className={className}>{format ? format(shown) : fmtNum(shown, digits)}</span>;
};

/** Progress ring. `value` is 0..1 (values above 1 are drawn as full). */
export const Ring: React.FC<{ value: number; size?: number; stroke?: number; color?: string; className?: string; children?: React.ReactNode; trackClass?: string }> = ({
  value, size = 120, stroke = 10, color = 'hsl(var(--primary))', className, children, trackClass,
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(Math.max(0, Math.min(1, value || 0))));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className={cn('relative inline-grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={cn('tp-ring-track', trackClass)} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={color} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} className="tp-ring-value"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
};

export const Bar: React.FC<{ value: number; className?: string; color?: string }> = ({ value, className, color }) => {
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(Math.max(0, Math.min(1, value || 0))));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className={cn('tp-bar', className)}>
      <span style={{ width: `${v * 100}%`, background: color }} />
    </div>
  );
};

/** Tiny line chart for trends (no axes). Direction-independent: time always runs left to right. */
export const Sparkline: React.FC<{ values: number[]; className?: string; height?: number; stroke?: string }> = ({ values, className, height = 56, stroke = 'hsl(var(--primary))' }) => {
  const id = useRef(`sp${Math.random().toString(36).slice(2)}`).current;
  if (values.length < 2) return null;
  const w = 200;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - 6 - ((v - min) / span) * (height - 12)] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn('w-full', className)} style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity=".28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="4" fill={stroke} />
    </svg>
  );
};

/** Bottom sheet on phones, centred card from 640px. Accessible (Radix Dialog). */
export const Sheet: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ open, onOpenChange, title, description, children, footer }) => {
  const { t, i18n } = useTranslation();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="tp-sheet-overlay" />
        <DialogPrimitive.Content className="tp-sheet tp-root focus:outline-none" dir={i18n.language?.startsWith('he') ? 'rtl' : 'ltr'}>
          <div className="mx-auto mt-2.5 h-1.5 w-12 flex-none rounded-full bg-foreground/15 sm:hidden" />
          <div className="flex flex-none items-start justify-between gap-3 px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
            <div className="min-w-0">
              <DialogPrimitive.Title className="tp-title text-[2.1rem]">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="tp-icon-btn tp-press" aria-label={t('trainee.common.close')}>
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6">{children}</div>
          {footer && <div className="flex-none border-t border-border/50 px-5 py-3 sm:px-6">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

/** Numeric field with -/+ steppers. Keeps the native keypad on phones (inputMode=decimal). */
export const Stepper: React.FC<{
  value: string;
  onChange: (v: string) => void;
  step: number;
  label: string;
  decimal?: boolean;
  className?: string;
  placeholder?: string;
}> = ({ value, onChange, step, label, decimal, className, placeholder }) => {
  const bump = (dir: 1 | -1) => {
    const n = parseFloat(value.replace(',', '.')) || 0;
    const next = Math.max(0, Math.round((n + dir * step) * 100) / 100);
    onChange(String(next));
  };
  return (
    <div className={cn('tp-stepper h-12', className)} dir="ltr">
      <button type="button" tabIndex={-1} onClick={() => bump(-1)} aria-label={`${label} -${step}`}>
        <span className="text-xl leading-none">−</span>
      </button>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        inputMode={decimal ? 'decimal' : 'numeric'}
        enterKeyHint="done"
        aria-label={label}
        placeholder={placeholder}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" tabIndex={-1} onClick={() => bump(1)} aria-label={`${label} +${step}`}>
        <span className="text-xl leading-none">+</span>
      </button>
    </div>
  );
};
