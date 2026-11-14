import { API_BASE_URL } from '../../config/api';
import { en } from './en';
import { fr } from './fr';
import { he } from './he';
import type { SiteContent, SiteLang } from './types';
import { DEFAULT_ORDER } from '../sections';

const PHOTOS = '/site/photos/opt/';
/** Fields shared by every language (photos, layout) get their defaults here, once. */
const withShared = (c: SiteContent): SiteContent => ({
  ...c,
  hero: { image: PHOTOS + 'trainer.jpg', ...c.hero },
  story: { image: PHOTOS + 'trainer_story.jpg', ...c.story },
  layout: { order: [...DEFAULT_ORDER], hidden: [], ...(c.layout || {}) },
});

export const DEFAULT_CONTENT: Record<SiteLang, SiteContent> = { he: withShared(he), en: withShared(en), fr: withShared(fr) };
export const SITE_LANGS: SiteLang[] = ['he', 'en', 'fr'];

export const toSiteLang = (lng?: string | null): SiteLang => {
  const base = (lng || 'he').slice(0, 2) as SiteLang;
  return SITE_LANGS.includes(base) ? base : 'he';
};

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

/** Deep-merge studio overrides over defaults. Arrays from overrides replace defaults when non-empty. */
export function mergeContent<T>(base: T, over: unknown): T {
  if (Array.isArray(base)) {
    if (!Array.isArray(over) || over.length === 0) return base;
    return over.map((item, i) => mergeContent(base[i] ?? base[0], item)) as unknown as T;
  }
  if (isObj(base)) {
    if (!isObj(over)) return base;
    const out: Json = { ...(base as Json) };
    for (const k of Object.keys(over)) {
      out[k] = k in out ? mergeContent(out[k], over[k]) : over[k];
    }
    return out as T;
  }
  if (over === undefined || over === null || over === '') return base;
  return over as T;
}

export interface PublicSite {
  content: SiteContent;
  seo: { title?: string; description?: string; image?: string; keywords?: string };
  social: { instagram?: string; whatsapp?: string };
  analyticsId?: string | null;
}

/** Defaults merged with what the trainer saved in Studio → Mon site (falls back silently to defaults). */
export async function loadPublicSite(lang: SiteLang): Promise<PublicSite> {
  const base = DEFAULT_CONTENT[lang];
  try {
    // Never leave visitors on a blank page: after 4 s the built-in content shows (r3 site #1)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${API_BASE_URL}/public/site?lang=${lang}`, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    let content = mergeContent(base, data.content || {});
    const social = data.social || {};
    if (social.whatsapp || social.instagram) {
      content = mergeContent(content, { contact: { whatsapp: social.whatsapp, instagram: social.instagram } });
    }
    return { content, seo: data.seo || {}, social, analyticsId: data.analytics_id };
  } catch {
    return { content: base, seo: {}, social: {} };
  }
}

export type { SiteContent, SiteLang };
