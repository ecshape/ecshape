import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { knownTranslation } from '@/lib/knownTranslations';
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
  return useLibTextState(text, opts).text;
}

/** Same, plus whether the translation is still on its way (to avoid flashing the original, QA #81). */
export function useLibTextState(text: string | null | undefined, opts: { src?: Src; enabled?: boolean } = {}): { text: string; pending: boolean } {
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'en').slice(0, 2);
  const src = opts.src ?? 'auto';
  const raw = text ?? '';
  // QA #140: translated once on the server and sent with the exercise: shown at once, no request
  const known = knownTranslation(lang, raw);
  const on = (opts.enabled ?? true) && !known && needsTranslation(raw, lang);
  const q = useQuery({
    queryKey: ['libtext', lang, src, raw],
    queryFn: () => translateOne(raw, lang, src),
    enabled: on,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });
  return { text: known ?? (on && q.data ? q.data : raw), pending: on && q.isLoading };
}

/** Many texts at once (instruction steps…), same batching and cache. */
export function useLibTexts(texts: string[], opts: { src?: Src; enabled?: boolean } = {}): string[] {
  return useLibTextsState(texts, opts).texts;
}

/** Same, plus `pending` (translation on its way) and `translated` (every text now in the app language). */
export function useLibTextsState(texts: string[], opts: { src?: Src; enabled?: boolean } = {}): { texts: string[]; pending: boolean; translated: boolean } {
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'en').slice(0, 2);
  const src = opts.src ?? 'auto';
  const todo = texts.filter((t) => needsTranslation(t, lang) && !knownTranslation(lang, t));
  const on = (opts.enabled ?? true) && todo.length > 0;
  const withKnown = (list: string[]) => list.map((t) => knownTranslation(lang, t) ?? t);
  const q = useQuery({
    queryKey: ['libtexts', lang, src, todo],
    queryFn: () => Promise.all(todo.map((t) => translateOne(t, lang, src))),
    enabled: on,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });
  if (!on) return { texts: withKnown(texts), pending: false, translated: true };
  if (!q.data) return { texts: withKnown(texts), pending: q.isLoading, translated: false };
  const map = new Map(todo.map((t, i) => [t, q.data![i]]));
  return { texts: texts.map((t) => map.get(t) ?? knownTranslation(lang, t) ?? t), pending: false, translated: todo.every((t) => map.get(t) !== t) };
}

/**
 * Numbered instruction steps in the app language (QA #93): placeholder lines while the translation is on its way
 * (no flash of the original), and the list reads in the app's direction, numbers on the start side, text aligned to
 * the start. Only a step left untranslated (translator down) picks its own direction.
 */
export const LibSteps: React.FC<{ steps: string[]; src?: Src; className?: string }> = ({ steps, src = 'auto', className }) => {
  const { i18n } = useTranslation();
  const dir = i18n.dir();
  const { texts, pending } = useLibTextsState(steps, { src });
  const lang = (i18n.language || 'en').slice(0, 2);
  return (
    <ol className={className ?? 'space-y-3'} dir={dir} aria-busy={pending || undefined}>
      {steps.map((orig, i) => {
        const shown = texts[i];
        const inAppLang = !needsTranslation(orig, lang) || shown !== orig;
        return (
          <li key={i} className="flex gap-3 text-sm leading-relaxed">
            <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-primary/12 font-num text-xs text-primary">{i + 1}</span>
            {pending ? (
              <span className="flex-1 space-y-1.5 pt-1"><span className="block h-3 w-full ec-skel rounded-full" /><span className="block h-3 w-2/3 ec-skel rounded-full" /></span>
            ) : (
              <span className="min-w-0 flex-1" style={{ textAlign: 'start' }} dir={inAppLang ? undefined : 'auto'}>{shown}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
};

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
  const { text: out, pending } = useLibTextState(text, { src, enabled: seen });
  // QA #81: a title shown at once (not lazy) waits for its translation instead of flashing the original.
  if (!lazy && pending) return <span ref={ref} className={className} aria-busy><span className="inline-block h-[.75em] w-[min(12rem,60%)] ec-skel rounded-full align-middle" /></span>;
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
