import type { TFunction } from 'i18next';
import { uiLocale } from '@/lib/timezone';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 86400000;

export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** "Today", "Yesterday", weekday within the week, otherwise a full date. */
export const formatDayLabel = (iso: string, t: TFunction) => {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (diff === 0) return t('chat.ui.today');
  if (diff === 1) return t('chat.ui.yesterday');
  const locale = uiLocale();
  if (diff > 1 && diff < 7) return d.toLocaleDateString(locale, { weekday: 'long' });
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
};

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' });

/** Compact stamp for the conversation list. */
export const formatListStamp = (iso: string, t: TFunction) => {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  const locale = uiLocale();
  if (diff === 0) return formatTime(iso);
  if (diff === 1) return t('chat.ui.yesterday');
  if (diff > 1 && diff < 7) return d.toLocaleDateString(locale, { weekday: 'short' });
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
};

/** Calendar date of a progress entry (YYYY-MM-DD, no timezone shift). */
export const formatEntryDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const dt = y && m && d ? new Date(y, m - 1, d) : new Date(date);
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  return dt.toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
};

export const formatWeight = (w: number | null | undefined) =>
  w === null || w === undefined ? '' : new Intl.NumberFormat(uiLocale(), { maximumFractionDigits: 1 }).format(w);

export const initials = (name: string) => {
  const parts = (name || '').trim().split(/[\s-]+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

export const photoTypeLabel = (type: string | null | undefined, t: TFunction) => {
  switch ((type || '').toLowerCase()) {
    case 'front': return t('chat.ui.photoFront');
    case 'side': return t('chat.ui.photoSide');
    case 'back': return t('chat.ui.photoBack');
    default: return '';
  }
};
