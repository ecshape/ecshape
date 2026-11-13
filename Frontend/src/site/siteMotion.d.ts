import type { SiteContent, SiteLang } from './content/types';
export function initSite(
  root: HTMLElement,
  opts: { navigate: (to: string) => void; content: SiteContent; lang: SiteLang; onLang: (lang: SiteLang) => void }
): () => void;
