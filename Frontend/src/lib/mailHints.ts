/**
 * QA #142: every email field in the platform gets a mail format and one-tap domain shortcuts (@gmail.com …).
 *
 * Installed once (main.tsx), like autoDir: any <input type="email"> (or autocomplete="email"), today's or a future
 * one, gets email keyboard / no auto-capitalisation, a row of domain chips under it while typing, and a red outline
 * when it loses focus with an address that can't be right. The public site's lead form has its own chips (QA #138).
 *
 * React-controlled inputs: the chip writes through the native value setter and fires `input`, so onChange runs.
 */
const DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'walla.co.il'];
const SELECTOR = 'input[type="email"], input[autocomplete="email"]';
const VALID = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

let bar: HTMLDivElement | null = null;
let target: HTMLInputElement | null = null;

const isMail = (el: EventTarget | null): el is HTMLInputElement =>
  el instanceof HTMLInputElement && el.matches(SELECTOR) && !el.closest('.ec-site, [data-no-mail-hints]');

function prepare(el: HTMLInputElement) {
  if (el.dataset.mailHints) return;
  el.dataset.mailHints = '1';
  el.setAttribute('inputmode', 'email');
  el.setAttribute('autocapitalize', 'off');
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('spellcheck', 'false');
  if (!el.getAttribute('placeholder')?.trim()) el.setAttribute('placeholder', 'name@gmail.com');
}

function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function ensureBar(): HTMLDivElement {
  if (bar) return bar;
  bar = document.createElement('div');
  bar.className = 'ec-mail-hints';
  bar.setAttribute('dir', 'ltr');
  bar.setAttribute('role', 'listbox');
  for (const d of DOMAINS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.dataset.mail = d;
    b.textContent = `@${d}`;
    b.setAttribute('role', 'option');
    // pointerdown + preventDefault: the field keeps focus (no keyboard flicker on phones)
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!target) return;
      const local = target.value.trim().split('@')[0];
      if (!local) return;
      setValue(target, `${local}@${d}`);
      target.removeAttribute('aria-invalid');
      hide();
    });
    bar.appendChild(b);
  }
  return bar;
}

function hide() {
  if (bar) bar.hidden = true;
}

function place() {
  if (!target || !bar || bar.hidden) return;
  // inside a modal sheet the bar must live in the dialog (Radix makes the rest of the page inert)
  const host = (target.closest('[role="dialog"]') as HTMLElement | null) ?? document.body;
  if (bar.parentElement !== host) host.appendChild(bar);
  const r = target.getBoundingClientRect();
  if (host === document.body) {
    bar.style.position = 'fixed';
    bar.style.left = `${r.left}px`;
    bar.style.top = `${r.bottom + 6}px`;
  } else {
    const h = host.getBoundingClientRect();
    bar.style.position = 'absolute';
    bar.style.left = `${r.left - h.left + host.scrollLeft}px`;
    bar.style.top = `${r.bottom - h.top + host.scrollTop + 6}px`;
  }
  bar.style.width = `${r.width}px`;
}

function sync() {
  if (!target) return hide();
  const v = target.value.trim();
  const at = v.indexOf('@');
  const typed = at >= 0 ? v.slice(at + 1).toLowerCase() : '';
  const b = ensureBar();
  let shown = 0;
  b.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    const d = btn.dataset.mail!;
    const ok = v.length > 0 && at !== 0 && !/\s/.test(v) && (at < 0 || (d.startsWith(typed) && d !== typed));
    btn.hidden = !ok;
    if (ok) shown++;
  });
  b.hidden = shown === 0;
  place();
}

export function installMailHints() {
  if (typeof document === 'undefined') return;
  document.addEventListener('focusin', (e) => {
    if (!isMail(e.target)) return;
    prepare(e.target);
    target = e.target;
    sync();
  });
  document.addEventListener('input', (e) => {
    if (e.target !== target || !target) return;
    target.removeAttribute('aria-invalid');
    sync();
  });
  document.addEventListener('focusout', (e) => {
    if (e.target !== target || !target) return;
    const el = target;
    const v = el.value.trim();
    if (v && !VALID.test(v)) el.setAttribute('aria-invalid', 'true');
    setTimeout(() => { if (document.activeElement !== el) { if (target === el) target = null; hide(); } }, 120);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && bar && !bar.hidden) hide(); }, true);
  window.addEventListener('resize', place);
  document.addEventListener('scroll', place, true);
}
