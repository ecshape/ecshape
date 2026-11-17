import i18n from './config';
import { API_BASE_URL } from '@/config/api';

/**
 * QA #85: Russian and Arabic. Their texts are translated on the server from the English ones
 * (GET /api/public/i18n/<lang>) and cached here, so switching is instant after the first time.
 * Texts not translated yet fall back to English (fallbackLng).
 */
export const EXTRA_LANGS = ['ru', 'ar'] as const;
export type ExtraLang = (typeof EXTRA_LANGS)[number];
export const isExtraLang = (l?: string | null): l is ExtraLang => !!l && (EXTRA_LANGS as readonly string[]).includes(l.slice(0, 2));

export interface ExtraBundle { lang: string; complete: boolean; progress?: number; app: Record<string, unknown>; site: Record<string, unknown>; legal: Record<string, unknown>; legalNav: Record<string, unknown> }

const KEY = (l: string) => `ec-i18n:${l}`;
const memory: Record<string, ExtraBundle> = {};
const listeners = new Set<() => void>();
export const onExtraBundle = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Already-loaded bundle (memory, else the copy saved in the browser). */
export function extraBundle(lang: string): ExtraBundle | null {
  const l = lang.slice(0, 2);
  if (memory[l]) return memory[l];
  try {
    const raw = localStorage.getItem(KEY(l));
    if (raw) return (memory[l] = JSON.parse(raw) as ExtraBundle);
  } catch { /* storage unavailable */ }
  return null;
}

function apply(b: ExtraBundle) {
  memory[b.lang] = b;
  i18n.addResourceBundle(b.lang, 'translation', b.app || {}, true, true);
  listeners.forEach((fn) => fn());
}

const inflight: Record<string, Promise<ExtraBundle | null> | undefined> = {};

/** Load (or refresh) the texts of an extra language. While the server is still translating, ask again a few times. */
export function loadExtraLanguage(lang: string, attempt = 0): Promise<ExtraBundle | null> {
  const l = lang.slice(0, 2);
  if (!isExtraLang(l)) return Promise.resolve(null);
  const saved = extraBundle(l);
  if (saved && attempt === 0) apply(saved);
  if (inflight[l] && attempt === 0) return inflight[l]!;
  const p = fetch(`${API_BASE_URL}/public/i18n/${l}`)
    .then((r) => (r.ok ? (r.json() as Promise<ExtraBundle>) : null))
    .then((b) => {
      if (!b) return saved;
      apply(b);
      try { localStorage.setItem(KEY(l), JSON.stringify(b)); } catch { /* quota: memory only */ }
      if (!b.complete && attempt < 12) setTimeout(() => { void loadExtraLanguage(l, attempt + 1); }, 20_000);
      return b;
    })
    .catch(() => saved)
    .finally(() => { if (attempt === 0) inflight[l] = undefined; });
  if (attempt === 0) inflight[l] = p;
  return p;
}

// Startup in an extra language: apply the saved copy at once, refresh in the background.
if (isExtraLang(i18n.language)) void loadExtraLanguage(i18n.language);
i18n.on('languageChanged', (l) => { if (isExtraLang(l)) void loadExtraLanguage(l); });

/** English defaults with the translated texts on top; an untranslated item (null / missing) keeps its English text. */
export function mergeTranslated<T>(base: T, over: unknown): T {
  if (over === null || over === undefined || over === '') return base;
  if (Array.isArray(base)) return base.map((b, i) => mergeTranslated(b, Array.isArray(over) ? over[i] : undefined)) as unknown as T;
  if (base && typeof base === 'object') {
    if (!over || typeof over !== 'object' || Array.isArray(over)) return base;
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const k of Object.keys(out)) out[k] = mergeTranslated(out[k], (over as Record<string, unknown>)[k]);
    return out as T;
  }
  return (typeof over === typeof base ? over : base) as T;
}
