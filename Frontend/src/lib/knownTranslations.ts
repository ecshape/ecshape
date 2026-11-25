import i18n from '@/i18n/config';

/**
 * QA #140: translations that arrived with the data (the exercise library is translated once on the server and sent
 * with each exercise as `i18n`). The translation hooks read this first, so those texts show at once, without asking
 * the translator. Kept for the session; a page reload gets them again with the data.
 */
const known = new Map<string, Map<string, string>>();

export const appLang = () => (i18n.language || 'en').slice(0, 2);

export function knownTranslation(lang: string, text: string): string | undefined {
  return known.get(lang)?.get(text);
}

export function seedTranslations(lang: string, pairs: Iterable<[string, string | null | undefined]>) {
  let m = known.get(lang);
  if (!m) known.set(lang, (m = new Map()));
  for (const [src, dst] of pairs) if (src && dst && dst.trim()) m.set(src, dst);
}

type WithI18n = { name?: string; instructions?: string[]; i18n?: { lang: string; name?: string | null; instructions?: (string | null)[] } };

/** Seeds from library items (or a response with `items`, or one item). Returns the data unchanged. */
export function seedLibraryI18n<T>(data: T): T {
  const list: WithI18n[] = Array.isArray(data)
    ? (data as WithI18n[])
    : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
      ? ((data as { items: WithI18n[] }).items)
      : data && typeof data === 'object' ? [data as WithI18n] : [];
  for (const e of list) {
    const tr = e?.i18n;
    if (!tr?.lang) continue;
    const pairs: [string, string | null | undefined][] = [];
    if (e.name) pairs.push([e.name, tr.name]);
    (e.instructions ?? []).forEach((s, i) => pairs.push([s, tr.instructions?.[i]]));
    seedTranslations(tr.lang, pairs);
  }
  return data;
}

/** Adds the app language to a library URL query (the server then sends the translations with the items). */
export function withLang(qs: URLSearchParams): URLSearchParams {
  if (!qs.has('lang')) qs.set('lang', appLang());
  return qs;
}
