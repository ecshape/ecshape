import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from './api';

/**
 * Database texts (exercise names, descriptions, instructions, food names…) in the app language, wherever they
 * come from: the built-in English library, wger (German, French…), Open Food Facts, or a coach typing in Hebrew.
 *
 * Every text on screen asks for its translation; requests made together are sent as one batch to /api/translate,
 * which translates once and caches for everyone. Until the translation arrives (or if it fails) the original shows.
 */
type Src = 'en' | 'auto';
const HEBREW = /[֐-׿]/;
const BATCH = 40;

type Pending = { resolve: (v: string) => void; reject: (e: unknown) => void }[];
const queues = new Map<string, { texts: Map<string, Pending>; timer: number | null }>();

function flush(key: string, lang: string, src: Src) {
  const q = queues.get(key);
  if (!q) return;
  const entries = Array.from(q.texts.entries());
  q.texts = new Map();
  q.timer = null;
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    api<{ texts: string[] }>('/translate', { method: 'POST', body: { texts: chunk.map(([t]) => t), lang, src_lang: src } })
      .then((r) => chunk.forEach(([t, waiters], j) => waiters.forEach((w) => w.resolve(r.texts?.[j]?.trim() ? r.texts[j] : t))))
      .catch((e) => chunk.forEach(([, waiters]) => waiters.forEach((w) => w.reject(e))));
  }
}

function translateOne(text: string, lang: string, src: Src): Promise<string> {
  const key = `${lang}|${src}`;
  let q = queues.get(key);
  if (!q) queues.set(key, (q = { texts: new Map(), timer: null }));
  return new Promise((resolve, reject) => {
    const list = q!.texts.get(text) ?? [];
    list.push({ resolve, reject });
    q!.texts.set(text, list);
    if (q!.timer == null) q!.timer = window.setTimeout(() => flush(key, lang, src), 30);
  });
}

/** Whether a text has to go to the translator at all for this app language. */
export function needsTranslation(text: string | null | undefined, lang: string): boolean {
  if (!text || !text.trim() || /^[\d\s.,:;×x%+\-–/()]+$/.test(text)) return false;
  if (lang === 'he') return !HEBREW.test(text);
  if (lang === 'en') return HEBREW.test(text) || /[À-ÿßäöü]/.test(text); // Latin text is assumed English already
  return true; // fr: English library names, Hebrew names typed by a coach…
}

/** One text in the app language. `enabled: false` waits (e.g. until the text is on screen). */
export function useLibText(text: string | null | undefined, opts: { src?: Src; enabled?: boolean } = {}): string {
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'en').slice(0, 2);
  const src = opts.src ?? 'auto';
  const raw = text ?? '';
  const on = (opts.enabled ?? true) && needsTranslation(raw, lang);
  const q = useQuery({
    queryKey: ['libtext', lang, src, raw],
    queryFn: () => translateOne(raw, lang, src),
    enabled: on,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });
  return on && q.data ? q.data : raw;
}

/** Many texts at once (instruction steps…), same batching and cache. */
export function useLibTexts(texts: string[], opts: { src?: Src; enabled?: boolean } = {}): string[] {
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'en').slice(0, 2);
  const src = opts.src ?? 'auto';
  const todo = texts.filter((t) => needsTranslation(t, lang));
  const on = (opts.enabled ?? true) && todo.length > 0;
  const q = useQuery({
    queryKey: ['libtexts', lang, src, todo],
    queryFn: () => Promise.all(todo.map((t) => translateOne(t, lang, src))),
    enabled: on,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });
  if (!on || !q.data) return texts;
  const map = new Map(todo.map((t, i) => [t, q.data![i]]));
  return texts.map((t) => map.get(t) ?? t);
}

/**
 * Inline translated text. Translates only once it scrolls into view (long lists such as the 800+ exercise bank
 * never translate what nobody looks at). `dir="auto"` so Hebrew / English each read the right way.
 */
export const LibText: React.FC<{ text: string | null | undefined; src?: Src; lazy?: boolean; className?: string }> = ({ text, src, lazy = true, className }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(!lazy);
  useEffect(() => {
    if (seen || !ref.current || typeof IntersectionObserver === 'undefined') { if (!seen) setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  const out = useLibText(text, { src, enabled: seen });
  return <span ref={ref} className={className} dir="auto">{out}</span>;
};

/**
 * A search box over English names, typed in Hebrew: also returns the query in English ("לחיצת חזה" -> "bench press"),
 * so lists filtered in the browser (exercise bank, exercise picker) still find matches. null when not needed.
 */
export function useQueryInEnglish(q: string): string | null {
  const [debounced, setDebounced] = useState(q);
  useEffect(() => { const id = window.setTimeout(() => setDebounced(q), 350); return () => window.clearTimeout(id); }, [q]);
  const raw = debounced.trim();
  const on = raw.length >= 2 && HEBREW.test(raw);
  const r = useQuery({
    queryKey: ['libtext', 'en', 'auto', raw],
    queryFn: () => translateOne(raw, 'en', 'auto'),
    enabled: on,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });
  return on && r.data && r.data !== raw ? r.data.toLowerCase() : null;
}

/** Text matches the query, or all words of its English translation. */
export const matchesQuery = (text: string | null | undefined, q: string, qEn: string | null) => {
  const hay = (text || '').toLowerCase();
  if (!q) return true;
  if (hay.includes(q)) return true;
  return !!qEn && qEn.split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};
