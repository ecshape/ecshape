import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from './api';

const HEBREW = /[֐-׿]/;
const CHUNK = 40;

/**
 * Library texts (English exercise instructions, food names…) in the app language (QA #43).
 * Translated once on the server and cached for everyone; falls back to the originals.
 *
 * `src`: "en" for library texts, "auto" for names whose language varies (Open Food Facts products in French,
 * wger exercises in German…). Long lists are sent in batches; texts already written in Hebrew are kept as they are
 * when the app is in Hebrew.
 */
export function useTranslatedTexts(texts: string[], enabled = true, src: 'en' | 'auto' = 'en') {
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'en').slice(0, 2);
  const clean = texts.map((t) => t ?? '');
  const needs = (t: string) => !!t.trim() && !(lang === 'he' && HEBREW.test(t));
  const todo = Array.from(new Set(clean.filter(needs)));
  const on = enabled && (lang !== 'en' || src === 'auto') && todo.length > 0;
  const chunks: string[][] = [];
  for (let i = 0; on && i < todo.length; i += CHUNK) chunks.push(todo.slice(i, i + CHUNK));
  const qs = useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: ['translate', lang, src, chunk],
      queryFn: () => api<{ texts: string[]; translated: boolean }>('/translate', { method: 'POST', body: { texts: chunk, lang, src_lang: src } }),
      staleTime: Infinity,
      gcTime: 60 * 60_000,
      retry: false,
    })),
  });
  const map = new Map<string, string>();
  chunks.forEach((chunk, ci) => {
    const d = qs[ci]?.data;
    if (d) chunk.forEach((t, i) => { if (d.texts[i]) map.set(t, d.texts[i]); });
  });
  const out = clean.map((t) => map.get(t) ?? t);
  return {
    texts: out,
    translated: !on || qs.every((q) => !!q.data?.translated),
    loading: on && qs.some((q) => q.isLoading),
    lang,
  };
}

/** Same, as a lookup: original -> translated (for many short names on one screen). */
export function useTranslatedMap(names: string[], enabled = true, src: 'en' | 'auto' = 'en') {
  const uniq = Array.from(new Set(names.filter((n) => n && n.trim()))).sort();
  const { texts } = useTranslatedTexts(uniq, enabled, src);
  const map: Record<string, string> = {};
  uniq.forEach((n, i) => { map[n] = texts[i] ?? n; });
  return map;
}
