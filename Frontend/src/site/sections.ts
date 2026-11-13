/**
 * The public site's sections, in their default order. Shared by render.ts (what to draw, in which order)
 * and Studio -> My site (sections tree, hide / reorder). Keys are stable: they are stored in content.layout.
 */
import type { SiteContent, SiteLayout } from './content/types';

export type SectionKey =
  | 'hero' | 'marquee' | 'manifesto' | 'story' | 'results' | 'shift' | 'programs'
  | 'app' | 'process' | 'voices' | 'faq' | 'cta' | 'ig';

export interface SiteSectionDef {
  key: SectionKey;
  /** Content groups edited from this section (keys of SiteContent). */
  groups: (keyof SiteContent)[];
  /** The hero always opens the page (it carries the signature pinned intro). */
  fixed?: boolean;
  /** Anchor used by the menu links, when the section has one. */
  anchor?: string;
}

export const SITE_SECTIONS: SiteSectionDef[] = [
  { key: 'hero', groups: ['hero'], fixed: true },
  { key: 'marquee', groups: ['marquee'] },
  { key: 'manifesto', groups: ['manifesto'] },
  { key: 'story', groups: ['story'], anchor: 'story' },
  { key: 'results', groups: ['results'], anchor: 'results' },
  { key: 'shift', groups: ['shift'] },
  { key: 'programs', groups: ['programs'], anchor: 'programs' },
  { key: 'app', groups: ['app'], anchor: 'app' },
  { key: 'process', groups: ['process'] },
  { key: 'voices', groups: ['voices'], anchor: 'voices' },
  { key: 'faq', groups: ['faq'], anchor: 'faq' },
  { key: 'cta', groups: ['cta'], anchor: 'contact' },
  { key: 'ig', groups: ['ig'] },
];

/** Parts of the site that are not page sections: always shown, edited from the "Whole site" group. */
export const GLOBAL_GROUPS: (keyof SiteContent)[] = ['nav', 'footer', 'form', 'cookie', 'contact', 'meta'];

export const DEFAULT_ORDER: SectionKey[] = SITE_SECTIONS.map((s) => s.key);
const KNOWN = new Set<string>(DEFAULT_ORDER);

/** Saved order, cleaned: unknown keys dropped, new sections appended, hero first. */
export function sectionOrder(layout?: SiteLayout | null): SectionKey[] {
  const saved = (layout?.order || []).filter((k): k is SectionKey => KNOWN.has(k));
  const seen = new Set<string>();
  const out: SectionKey[] = [];
  for (const k of [...saved, ...DEFAULT_ORDER]) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return ['hero' as SectionKey, ...out.filter((k) => k !== 'hero')];
}

export function hiddenSections(layout?: SiteLayout | null): Set<string> {
  return new Set((layout?.hidden || []).filter((k) => KNOWN.has(k) && k !== 'hero'));
}

/** Section that owns a content path ("faq.items.2.q" -> "faq"); global groups return null. */
export function sectionOfPath(path: string): SectionKey | null {
  const group = path.split('.')[0];
  const def = SITE_SECTIONS.find((s) => (s.groups as string[]).includes(group));
  return def ? def.key : null;
}

/** Paths whose value is the same in every language (layout and photos). */
export const SHARED_PATHS = ['layout', 'hero.image', 'story.image'];
export const isSharedPath = (path: string) =>
  SHARED_PATHS.some((p) => path === p || path.startsWith(p + '.')) || /^results\.cards\.\d+\.image$/.test(path);
