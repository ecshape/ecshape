/**
 * Editable link targets of the public site (#12). Each button / link of the site is identified by the content path
 * of its label (e.g. "hero.ctaPrimary"). The trainer can point it somewhere else in Studio -> My site; the choice is
 * stored in content.links[path] (shared by every language) and applied by the site after rendering.
 *
 * Target syntax:  "" = default behaviour · "form" = open the lead form · "whatsapp" / "instagram" = the studio's
 * contact links · "#section" = scroll to a section · "/path" = portal page · "https://…", "mailto:…", "tel:…".
 */
export type LinkKind = 'default' | 'form' | 'whatsapp' | 'instagram' | 'section' | 'page' | 'url';

/** Label path -> what the element does by default. */
export const LINKABLE: Record<string, Exclude<LinkKind, 'default' | 'section' | 'url'>> = {
  'nav.cta': 'form',
  'nav.login': 'page',
  'hero.ctaPrimary': 'form',
  'hero.ctaSecondary': 'whatsapp',
  'results.ctaButton': 'form',
  'programs.start': 'form',
  'programs.more': 'form',
  'app.already': 'page',
  'faq.other': 'form',
  'cta.form': 'form',
  'cta.whatsapp': 'whatsapp',
  'ig.button': 'instagram',
  'footer.instagram': 'instagram',
  'footer.whatsapp': 'whatsapp',
  'footer.contact': 'form',
};
export const LINK_PATHS = new Set(Object.keys(LINKABLE));
export const isLinkPath = (path: string) => LINK_PATHS.has(path);

/** Portal / site pages offered in the editor (any other "/path" can be typed as a URL). */
export const LINK_PAGES = ['/login', '/blog', '/home'] as const;

export function kindOf(target?: string | null): LinkKind {
  const v = (target || '').trim();
  if (!v) return 'default';
  if (v === 'form' || v === 'whatsapp' || v === 'instagram') return v;
  if (v.startsWith('#')) return 'section';
  if (v.startsWith('/')) return 'page';
  return 'url';
}

/** Accepts only safe targets (no javascript: and the like). */
export function cleanTarget(raw: string): string {
  const v = raw.trim();
  if (!v || v === 'form' || v === 'whatsapp' || v === 'instagram') return v;
  if (/^#[\w-]{1,60}$/.test(v)) return v;
  if (/^\/[^\s"'<>]*$/.test(v) && !v.startsWith('//')) return v;
  if (/^(https?:\/\/|mailto:|tel:)[^\s"'<>]+$/i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/[^\s"'<>]*)?$/.test(v)) return `https://${v}`;
  return '';
}

/**
 * Rewrites the buttons / links that have a custom target. Runs once right after the markup is injected, before the
 * site wires its click handlers (data-route = portal navigation, data-open-form = lead form).
 */
export function applyLinkTargets(root: HTMLElement, links: Record<string, string> | undefined, contact: { wa: string; ig: string }) {
  if (!links) return;
  root.querySelectorAll<HTMLElement>('[data-ec-link]').forEach((el) => {
    const target = cleanTarget(links[el.getAttribute('data-ec-link') || ''] || '');
    if (!target) return;
    const kind = kindOf(target);
    let node: HTMLElement = el;
    if (kind !== 'form' && el.tagName !== 'A') {
      // A button becomes a link (same classes, attributes and label)
      const a = document.createElement('a');
      Array.from(el.attributes).forEach((attr) => { if (attr.name !== 'type') a.setAttribute(attr.name, attr.value); });
      a.innerHTML = el.innerHTML;
      el.replaceWith(a);
      node = a;
    }
    ['data-open-form', 'data-program', 'data-route', 'target', 'rel'].forEach((n) => node.removeAttribute(n));
    if (kind === 'form') {
      if (node.tagName === 'A') node.setAttribute('href', '#contact');
      node.setAttribute('data-open-form', '');
      return;
    }
    const href = kind === 'whatsapp' ? contact.wa : kind === 'instagram' ? contact.ig : target;
    node.setAttribute('href', href);
    if (kind === 'page') node.setAttribute('data-route', '');
    else if (kind !== 'section') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener');
    }
    if (node.getAttribute('data-icon') === 'wa' && kind !== 'whatsapp') node.setAttribute('data-icon', 'arrow');
  });
}
