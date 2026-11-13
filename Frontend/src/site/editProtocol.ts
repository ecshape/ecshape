/**
 * postMessage protocol between Studio -> My site (parent) and the site rendered in edit mode inside its iframe
 * (/home?ec-edit=1&lang=xx). Same origin only. Modelled on LaveriExpert's lib/cms/visual.ts.
 *
 *   parent -> frame: sync (whole draft content + selection + UI labels), select, scroll
 *   frame -> parent: ready, select (click on the page), text (inline edit), pick-image, section (hide / move from the page bar)
 */
import type { SiteContent, SiteLang } from './content/types';

export const EC_EDIT_SOURCE = 'ec-site-editor';
export const EC_EDIT_PARAM = 'ec-edit';
export const EC_PREVIEW_PARAM = 'ec-preview';

export type EcSelectKind = 'text' | 'image' | 'item' | 'section';
/** What is selected: a content path ("hero.title1", "faq.items.2") or a section key ("faq"). */
export interface EcSelect { kind: EcSelectKind; path: string }
export type EcEditMode = 'edit' | 'preview';

/** Labels drawn inside the page (section bars, photo button), translated by the studio. */
export interface EcFrameLabels {
  sections: Record<string, string>;
  hide: string;
  show: string;
  hidden: string;
  up: string;
  down: string;
  changePhoto: string;
}

export type EcParentMsg =
  | { source: typeof EC_EDIT_SOURCE; type: 'sync'; lang: SiteLang; content: SiteContent; select: EcSelect | null; mode: EcEditMode; labels: EcFrameLabels }
  | { source: typeof EC_EDIT_SOURCE; type: 'select'; select: EcSelect | null }
  | { source: typeof EC_EDIT_SOURCE; type: 'scroll'; select: EcSelect };

export type EcChildMsg =
  | { source: typeof EC_EDIT_SOURCE; type: 'ready' }
  | { source: typeof EC_EDIT_SOURCE; type: 'select'; select: EcSelect | null }
  | { source: typeof EC_EDIT_SOURCE; type: 'text'; path: string; value: string }
  | { source: typeof EC_EDIT_SOURCE; type: 'pick-image'; path: string }
  | { source: typeof EC_EDIT_SOURCE; type: 'section'; key: string; action: 'toggle' | 'up' | 'down' };

type Payload<T> = T extends unknown ? Omit<T, 'source'> : never;
export type EcParentPayload = Payload<EcParentMsg>;
export type EcChildPayload = Payload<EcChildMsg>;

export function isEcEditMessage(data: unknown): data is EcParentMsg | EcChildMsg {
  return !!data && typeof data === 'object' && (data as { source?: string }).source === EC_EDIT_SOURCE;
}

/** True inside the studio iframe (never for a visitor opening the URL directly). */
export function isEditFrame(search: string): boolean {
  try {
    return window.parent !== window && new URLSearchParams(search).get(EC_EDIT_PARAM) === '1';
  } catch {
    return false;
  }
}

export function isPreviewFrame(search: string): boolean {
  try {
    return window.parent !== window && new URLSearchParams(search).get(EC_PREVIEW_PARAM) === '1';
  } catch {
    return false;
  }
}

/** Long texts are edited on several lines; everything else is a single line (Enter validates). */
export const isMultilinePath = (path: string) => /(^|\.)(sub|lead|text|a|p1|p2|description|statText|successSub|privacy|messagePh)$/.test(path);
