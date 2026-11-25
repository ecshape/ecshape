/**
 * Public site: tiny round avatar bubble in the nav for someone signed in now, or before on this device (#13).
 * It links to the portal (or to the sign-in page when the session has expired). Added after the site markup is
 * rendered, so render.ts stays untouched; returns a cleanup that removes it.
 */
import { avatarSrc, initialsOf, readLastUser } from '@/lib/avatar';
import './accountBubble.css';

type Who = { full_name?: string | null; avatar_url?: string | null; role?: string } | null;
const LABEL = { he: 'לפורטל שלי', en: 'My portal', fr: 'Mon portail' } as const;

const esc = (v: string) => v.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

export function mountAccountBubble(root: HTMLElement, { user, lang, navigate }: { user: Who; lang: 'he' | 'en' | 'fr'; navigate: (to: string) => void }) {
  const last = readLastUser();
  const who = user ? { name: user.full_name || '', avatar: user.avatar_url || null, role: user.role || '' } : last ? { name: last.name, avatar: last.avatar_url, role: last.role } : null;
  const nav = root.querySelector<HTMLElement>('header.nav');
  if (!who || !nav) return () => {};

  const href = !user ? '/login' : who.role === 'TRAINER' ? '/trainer-dashboard' : who.role === 'ADMIN' ? '/admin' : '/';
  const label = `${LABEL[lang] || LABEL.en}${who.name ? ` · ${who.name}` : ''}`;
  const src = avatarSrc(who.avatar);
  const inner = `<span class="ec-me__initials">${esc(initialsOf(who.name))}</span>${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : ''}`;

  const make = (cls: string) => {
    const a = document.createElement('a');
    a.className = `ec-me ${cls}`;
    a.href = href;
    a.title = label;
    a.setAttribute('aria-label', label);
    a.innerHTML = inner;
    a.querySelector('img')?.addEventListener('error', (e) => (e.currentTarget as HTMLElement).remove());
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      navigate(href);
    });
    return a;
  };

  // Desktop: first item of the nav actions. Phones (actions hidden): next to the menu button.
  const desk = make('ec-me--desk');
  nav.querySelector('.nav__actions')?.prepend(desk);
  const phone = make('ec-me--phone');
  nav.insertBefore(phone, nav.querySelector('#menuBtn'));

  return () => {
    desk.remove();
    phone.remove();
  };
}
