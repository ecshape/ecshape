/** Helpers shared by Mon site and Agent EC to change one site text without losing the rest. */
import { studioApi } from './studioApi';
import { DEFAULT_CONTENT, mergeContent, type SiteLang } from '@/site/content';

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Only what differs from the defaults is stored, so future default improvements still reach the site. */
export function diffContent(base: Json, value: Json): Json | undefined {
  if (Array.isArray(base) || Array.isArray(value)) return JSON.stringify(base) === JSON.stringify(value) ? undefined : value;
  if (isObj(base) && isObj(value)) {
    const out: Record<string, Json> = {};
    for (const k of Object.keys(value)) {
      const d = diffContent(base[k], value[k]);
      if (d !== undefined) out[k] = d;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return base === value ? undefined : value;
}

export function setIn<T>(obj: T, path: (string | number)[], v: Json): T {
  if (!path.length) return v as T;
  const [h, ...rest] = path;
  const copy: any = Array.isArray(obj) ? [...(obj as unknown[])] : { ...(obj as object) };
  copy[h as any] = setIn((obj as any)?.[h as any], rest, v);
  return copy;
}

export function getIn(obj: Json, path: (string | number)[]): Json {
  return path.reduce<Json>((node, k) => (node == null ? undefined : (node as any)[k as any]), obj);
}

export const parsePath = (path: string) => path.split('.').filter(Boolean).map((p) => (/^\d+$/.test(p) ? Number(p) : p));

/** Load the saved site, change one text by path, save only the overrides. */
export async function applySiteText(lang: SiteLang, path: string, value: string) {
  const { content } = await studioApi.siteContent(lang);
  const merged = mergeContent(DEFAULT_CONTENT[lang], content);
  const next = setIn(merged, parsePath(path), value);
  const overrides = (diffContent(DEFAULT_CONTENT[lang], next) || {}) as Record<string, unknown>;
  await studioApi.saveSiteContent(lang, overrides);
}
