import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from './api';

/**
 * Library texts (English exercise instructions, food names…) in the app language (QA #43).
 * Translated once on the server and cached for everyone; falls back to the originals.
 */
export function useTranslatedTexts(texts: string[], enabled = true) {
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'en').slice(0, 2);
  const clean = texts.map((t) => t ?? '');
  const on = enabled && lang !== 'en' && clean.some((t) => t.trim());
  const q = useQuery({
    queryKey: ['translate', lang, clean],
    queryFn: () => api<{ texts: string[]; translated: boolean }>('/translate', { method: 'POST', body: { texts: clean.slice(0, 80), lang } }),
    enabled: on,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });
  const out = on && q.data ? clean.map((t, i) => q.data.texts[i] ?? t) : clean;
  return { texts: out, translated: !on || !!q.data?.translated, loading: on && q.isLoading, lang };
}

/** Same, as a lookup: original -> translated (for many short names on one screen). */
export function useTranslatedMap(names: string[], enabled = true) {
  const uniq = Array.from(new Set(names.filter((n) => n && n.trim()))).sort();
  const { texts } = useTranslatedTexts(uniq, enabled);
  const map: Record<string, string> = {};
  uniq.forEach((n, i) => { map[n] = texts[i] ?? n; });
  return map;
}
