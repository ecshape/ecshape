import { uiLocale } from '@/lib/timezone';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD (never UTC: after midnight in Israel UTC is still "yesterday"). */
export const isoDay = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayISO = () => isoDay(new Date());

export const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDay(new Date(y, m - 1, d + n));
};

/** Parses API datetimes. Naive strings (no zone) are server-local and read as local time. */
export const parseDate = (s?: string | null): Date | null => {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const dayOf = (s?: string | null) => {
  const d = parseDate(s);
  return d ? isoDay(d) : '';
};

/** Monday-based start of the current week (local). */
export const weekStart = (from: Date = new Date()) => {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
};

export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || Number.isNaN(n)
    ? '–'
    : new Intl.NumberFormat(uiLocale(), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);

export const fmtSigned = (n: number, digits = 1) =>
  new Intl.NumberFormat(uiLocale(), { maximumFractionDigits: digits, signDisplay: 'exceptZero' }).format(n);

export const fmtDate = (s: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => {
  const d = s instanceof Date ? s : parseDate(s ?? null);
  return d ? d.toLocaleDateString(uiLocale(), opts) : '';
};

export const fmtWeekday = (d: Date, style: 'short' | 'long' | 'narrow' = 'short') => d.toLocaleDateString(uiLocale(), { weekday: style });

export const fmtTime = (s: string | Date) => {
  const d = s instanceof Date ? s : parseDate(s);
  return d ? d.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' }) : '';
};

/** "3 days ago" style text in the interface language. */
export const fmtRelative = (s: string | Date | null | undefined) => {
  const d = s instanceof Date ? s : parseDate(s ?? null);
  if (!d) return '';
  const rtf = new Intl.RelativeTimeFormat(uiLocale(), { numeric: 'auto' });
  const diffMin = Math.round((d.getTime() - Date.now()) / 60000);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffH = Math.round(diffMin / 60);
  if (Math.abs(diffH) < 24) return rtf.format(diffH, 'hour');
  const startToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const startThen = new Date(new Date(d).setHours(0, 0, 0, 0)).getTime();
  const diffD = Math.round((startThen - startToday) / 86400000);
  if (Math.abs(diffD) < 7) return rtf.format(diffD, 'day');
  if (Math.abs(diffD) < 35) return rtf.format(Math.round(diffD / 7), 'week');
  return rtf.format(Math.round(diffD / 30), 'month');
};

/** mm:ss timer text. */
export const fmtClock = (totalSeconds: number) => {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Light haptic tick on supporting phones. */
export const haptic = (pattern: number | number[] = 8) => {
  try {
    if (!prefersReducedMotion()) navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
};
