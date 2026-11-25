/**
 * Agent EC works the page like a person would (do_on_page): it gets a list of the page's interactive elements with
 * refs (`[e12] button "Save"`), proposes steps on them, and — once the trainer said yes when the steps change
 * something — a cursor with the Agent EC mark travels to each element, clicks, types or picks an option while the
 * trainer watches. Never inside the agent panel or the QA widget, never in password / payment fields, never a link
 * that leaves the site.
 */
import { prefersReducedMotion, scrollBehavior } from '@/lib/motion';

export type UiAction = 'click' | 'fill' | 'select' | 'press' | 'scroll' | 'highlight';
export type UiStep = { action: UiAction; ref: string; label: string; value?: string; say?: string };
export type UiEffect = 'none' | 'change' | 'danger';
export type StepState = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type StepResult = { ok: boolean; reason?: 'notFound' | 'refused' | 'external' | 'stopped' | 'noOption' };

const INTERACTIVE =
  'a[href], button, input:not([type="hidden"]), textarea, select, summary, [role="button"], [role="tab"], [role="link"], ' +
  '[role="checkbox"], [role="switch"], [role="radio"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], ' +
  '[role="option"], [role="combobox"], [role="slider"], [contenteditable="true"], [contenteditable=""]';
/** The agent's own chrome is never a target. */
const OWN_UI = '.ec-psk, .ec-psk-edge, .ec-psk-swipe, .ec-qa-capture, .ec-agent-cursor, [data-ec-agent-ignore]';
const OVERLAYS = '[role="dialog"][data-state="open"], [role="alertdialog"], [data-radix-popper-content-wrapper], [role="dialog"]:not([data-state])';
const MAX_ELEMENTS = 180;
const SECRET_FIELD = /password|cc-|card|cvc|cvv|one-time-code|iban|otp|api.?key|secret|token/i;

const clean = (s: string | null | undefined, n = 60) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function visible(el: Element) {
  const r = (el as HTMLElement).getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el as HTMLElement);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
}

function nameOf(el: Element): string {
  const h = el as HTMLElement;
  const aria = h.getAttribute('aria-label');
  if (aria) return clean(aria);
  const by = h.getAttribute('aria-labelledby');
  if (by) {
    const txt = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ');
    if (clean(txt)) return clean(txt);
  }
  const labels = (h as HTMLInputElement).labels;
  if (labels?.length) return clean(Array.from(labels).map((l) => l.textContent).join(' '));
  const ph = h.getAttribute('placeholder');
  const text = clean(h.innerText || h.textContent);
  if (h.tagName === 'INPUT' || h.tagName === 'TEXTAREA' || h.tagName === 'SELECT') {
    // a field without a label: the text just before it (the visual label) or its placeholder
    const prev = clean(h.closest('label, [class*="field"], div')?.querySelector('label, span, p')?.textContent, 40);
    return clean(ph) || prev || clean(h.getAttribute('name')) || h.tagName.toLowerCase();
  }
  return text || clean(h.getAttribute('title')) || clean(h.querySelector('img')?.getAttribute('alt')) || clean(ph) || clean(h.getAttribute('name'));
}

function kindOf(el: Element): string {
  const role = el.getAttribute('role');
  if (role) return role;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type;
    return ['checkbox', 'radio', 'range', 'file', 'submit', 'button'].includes(type) ? (type === 'submit' ? 'button' : type) : `textbox(${type})`;
  }
  if (tag === 'textarea') return 'textbox(long)';
  if (tag === 'select') return 'select';
  if (el.getAttribute('contenteditable') !== null) return 'editor';
  return tag;
}

function stateOf(el: Element): string {
  const h = el as HTMLInputElement;
  const bits: string[] = [];
  if (h.disabled || el.getAttribute('aria-disabled') === 'true') bits.push('disabled');
  if (el.tagName === 'SELECT') {
    const s = el as HTMLSelectElement;
    bits.push(`value="${clean(s.selectedOptions[0]?.text, 40)}"`, `options: ${Array.from(s.options).slice(0, 14).map((o) => clean(o.text, 30)).join(' | ')}`);
  } else if (h.type === 'checkbox' || h.type === 'radio') {
    bits.push(h.checked ? 'checked' : 'unchecked');
  } else if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && h.value) {
    bits.push(SECRET_FIELD.test(`${h.type} ${h.autocomplete} ${h.name}`) ? 'value=(hidden)' : `value="${clean(h.value, 50)}"`);
  }
  for (const a of ['aria-checked', 'aria-selected', 'aria-expanded', 'aria-pressed', 'data-state']) {
    const v = el.getAttribute(a);
    if (v && v !== 'false' && v !== 'closed' && v !== 'inactive') bits.push(`${a.replace(/^(aria|data)-/, '')}=${v}`);
  }
  if (el.tagName === 'A') {
    const href = (el as HTMLAnchorElement).href;
    try {
      const u = new URL(href);
      bits.push(u.origin === location.origin ? `→ ${u.pathname}${u.hash}` : '→ external');
    } catch {
      /* ignore */
    }
  }
  return bits.join(' ');
}

let refCounter = 0;
const refNames = new Map<string, { kind: string; name: string }>();

function interactive(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll(INTERACTIVE)).filter((el) => !el.closest(OWN_UI) && visible(el));
}

/**
 * The page's interactive elements as lines for the agent (refs are written on the elements as data-ec-ref).
 * An open dialog / menu is listed first: that is what the trainer is looking at.
 */
export function collectElements(): string {
  document.querySelectorAll('[data-ec-ref]').forEach((el) => el.removeAttribute('data-ec-ref'));
  refNames.clear();
  refCounter = 0;
  const overlays = Array.from(document.querySelectorAll(OVERLAYS)).filter((o) => !o.closest(OWN_UI) && visible(o));
  const seen = new Set<Element>();
  const lines: string[] = [];
  const add = (el: Element) => {
    if (seen.has(el) || refCounter >= MAX_ELEMENTS) return;
    seen.add(el);
    const name = nameOf(el);
    const kind = kindOf(el);
    if (!name && kind === 'button') return; // icon-only buttons without a name are useless to the agent
    const ref = `e${++refCounter}`;
    el.setAttribute('data-ec-ref', ref);
    refNames.set(ref, { kind, name });
    const st = stateOf(el);
    lines.push(`[${ref}] ${kind} "${name}"${st ? ` ${st}` : ''}`);
  };
  overlays.forEach((o) => {
    const title = clean(o.querySelector('h1, h2, h3, [role="heading"]')?.textContent, 60);
    lines.push(`— open ${o.getAttribute('role') || 'menu'}${title ? `: ${title}` : ''} —`);
    interactive(o).forEach(add);
  });
  if (overlays.length) lines.push('— page behind —');
  interactive(document).forEach(add);
  return lines.join('\n').slice(0, 11000);
}

/** The element of a ref, or the closest match by its name when the page re-rendered since the list was made. */
function resolve(step: UiStep): HTMLElement | null {
  const byRef = step.ref ? document.querySelector<HTMLElement>(`[data-ec-ref="${step.ref}"]`) : null;
  if (byRef && byRef.isConnected && visible(byRef) && !byRef.closest(OWN_UI)) {
    const known = refNames.get(step.ref);
    // the ref still points at the same thing (or no label to compare)
    if (!step.label || !known || nameOf(byRef) === known.name) return byRef;
  }
  const want = clean(step.label || refNames.get(step.ref)?.name, 80).toLowerCase();
  if (!want) return byRef;
  const all = interactive(document);
  return (all.find((el) => nameOf(el).toLowerCase() === want) || all.find((el) => nameOf(el).toLowerCase().includes(want)) || byRef || null) as HTMLElement | null;
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

async function waitFor<T>(get: () => T | null, ms: number, signal?: AbortSignal): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    const v = get();
    if (v || Date.now() > end || signal?.aborted) return v;
    await wait(120);
  }
}

/* ---------------------------------------------------------------- risk (also enforced on the server) */
const DANGER = /delete|remove|erase|send|publish|log ?out|sign ?out|pay|archive|מחק|מחיקה|הסר|שלח|פרסם|התנתק|supprimer|effacer|envoyer|publier|déconnexion/i;
const CHANGE = /save|create|add|submit|confirm|apply|שמור|שמירה|צור|הוסף|אישור|enregistrer|créer|ajouter|valider|confirmer/i;

/** The effect a task really has, whatever the model declared: a delete / send / publish click is always "danger". */
export function riskOf(steps: UiStep[], declared: UiEffect): UiEffect {
  const clicks = steps.filter((s) => s.action === 'click' || s.action === 'press').map((s) => s.label).join(' ');
  if (DANGER.test(clicks)) return 'danger';
  if (declared === 'none' && steps.some((s) => s.action === 'click') && CHANGE.test(clicks)) return 'change';
  return declared === 'none' || declared === 'danger' ? declared : 'change';
}

/* ---------------------------------------------------------------- the visible cursor */
let cursor: HTMLDivElement | null = null;
let hideTimer = 0;

function ensureCursor() {
  if (cursor?.isConnected) return cursor;
  cursor = document.createElement('div');
  cursor.className = 'ec-agent-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.innerHTML =
    '<svg class="ec-agent-cursor-arrow" viewBox="0 0 24 24"><path d="M4 2.5l15.5 8.2-6.6 1.7-3 6.6z"/></svg>' +
    '<span class="ec-agent-cursor-dot"></span><span class="ec-agent-cursor-say"></span>';
  cursor.style.transform = `translate(${window.innerWidth * 0.75}px, ${window.innerHeight * 0.5}px)`;
  document.body.appendChild(cursor);
  return cursor;
}

async function moveCursor(el: HTMLElement, say: string) {
  const c = ensureCursor();
  window.clearTimeout(hideTimer);
  c.classList.add('is-on');
  const r = el.getBoundingClientRect();
  // Aim near the start of the element (where its text is), on the part not covered by the agent panel.
  const rtl = getComputedStyle(el).direction === 'rtl';
  let left = Math.max(r.left, 0);
  let right = Math.min(r.right, window.innerWidth);
  const panel = document.querySelector('.ec-psk')?.getBoundingClientRect();
  if (panel && panel.top < r.bottom && panel.bottom > r.top) {
    if (panel.left <= left && panel.right > left) left = Math.min(panel.right + 8, right);
    if (panel.right >= right && panel.left < right) right = Math.max(panel.left - 8, left);
  }
  const reach = Math.min((right - left) / 2, 60);
  const x = Math.round(rtl ? right - reach : left + reach);
  const y = Math.round(r.top + r.height / 2);
  c.style.transform = `translate(${x}px, ${y}px)`;
  const bubble = c.querySelector<HTMLElement>('.ec-agent-cursor-say');
  if (bubble) bubble.textContent = say;
  c.classList.toggle('is-flip', x > window.innerWidth - 240);
  await wait(prefersReducedMotion() ? 60 : 520);
}

function pulse() {
  const c = cursor;
  if (!c) return;
  c.classList.remove('is-press');
  void c.offsetWidth;
  c.classList.add('is-press');
}

export function hideCursor(delay = 1200) {
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => cursor?.classList.remove('is-on'), delay);
}

/* ---------------------------------------------------------------- input helpers (React-controlled fields) */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function realClick(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  // Radix menus / selects open on pointerdown, buttons on click: send the whole sequence a mouse would.
  el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.focus?.({ preventScroll: true });
  el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.click();
}

async function typeInto(el: HTMLElement, value: string, signal?: AbortSignal) {
  el.focus({ preventScroll: true });
  if (el.isContentEditable) {
    el.textContent = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return;
  }
  const field = el as HTMLInputElement | HTMLTextAreaElement;
  if (prefersReducedMotion() || value.length > 400) {
    setNativeValue(field, value);
  } else {
    // visible typing, at most ~0.9 s whatever the length
    const chunk = Math.max(1, Math.ceil(value.length / 40));
    setNativeValue(field, '');
    for (let i = chunk; i < value.length + chunk; i += chunk) {
      if (signal?.aborted) break;
      setNativeValue(field, value.slice(0, i));
      await wait(22);
    }
  }
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

const sameText = (a: string, b: string) => clean(a, 200).toLowerCase() === clean(b, 200).toLowerCase();
const hasText = (a: string, b: string) => clean(a, 200).toLowerCase().includes(clean(b, 200).toLowerCase());

async function pickOption(el: HTMLElement, value: string, signal?: AbortSignal): Promise<boolean> {
  if (el instanceof HTMLSelectElement) {
    const opts = Array.from(el.options);
    const opt = opts.find((o) => sameText(o.text, value) || o.value === value) || opts.find((o) => hasText(o.text, value));
    if (!opt) return false;
    setNativeValue(el, opt.value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (el.getAttribute('role') !== 'option') {
    realClick(el);
    await wait(250);
  }
  const option = await waitFor(() => {
    const all = Array.from(document.querySelectorAll<HTMLElement>('[role="option"], [role="menuitem"], [role="menuitemradio"], [cmdk-item]')).filter(visible);
    return all.find((o) => sameText(o.innerText, value)) || all.find((o) => hasText(o.innerText, value)) || null;
  }, 1600, signal);
  if (!option) return false;
  await moveCursor(option, clean(value, 40));
  pulse();
  realClick(option);
  return true;
}

function pressKey(target: HTMLElement, key: string) {
  const k = key === 'Return' ? 'Enter' : key || 'Enter';
  const opts = { key: k, code: k, bubbles: true, cancelable: true };
  const notPrevented = target.dispatchEvent(new KeyboardEvent('keydown', opts));
  target.dispatchEvent(new KeyboardEvent('keyup', opts));
  // Enter in a form field submits the form, as the browser would
  if (k === 'Enter' && notPrevented && target instanceof HTMLInputElement && target.form) target.form.requestSubmit();
}

/* ---------------------------------------------------------------- run */
export async function runUiSteps(
  steps: UiStep[],
  onStep: (index: number, state: StepState, result?: StepResult) => void,
  signal?: AbortSignal,
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const [i, step] of steps.entries()) {
    if (signal?.aborted) {
      results.push({ ok: false, reason: 'stopped' });
      onStep(i, 'skipped', results[i]);
      continue;
    }
    onStep(i, 'running');
    const res = await runStep(step, signal);
    results.push(res);
    onStep(i, res.ok ? 'done' : 'failed', res);
    if (!res.ok) {
      // the next steps depend on this one: they are skipped, the agent hears why
      for (let j = i + 1; j < steps.length; j++) {
        results.push({ ok: false, reason: 'stopped' });
        onStep(j, 'skipped', results[j]);
      }
      break;
    }
    await wait(prefersReducedMotion() ? 80 : 380); // the page reacts (dialog opens, list re-renders)
  }
  hideCursor();
  return results;
}

async function runStep(step: UiStep, signal?: AbortSignal): Promise<StepResult> {
  const say = step.say || step.label;
  if (step.action === 'scroll' && !step.ref) {
    window.scrollBy({ top: (step.value === 'up' ? -0.8 : 0.8) * window.innerHeight, behavior: scrollBehavior() });
    await wait(400);
    return { ok: true };
  }
  if (step.action === 'press' && !step.ref) {
    pressKey((document.activeElement as HTMLElement) || document.body, step.value || 'Enter');
    return { ok: true };
  }
  const el = await waitFor(() => resolve(step), 2500, signal);
  if (!el) return { ok: false, reason: signal?.aborted ? 'stopped' : 'notFound' };
  if (el.closest(OWN_UI)) return { ok: false, reason: 'refused' };
  if (el instanceof HTMLAnchorElement && el.href) {
    try {
      if (new URL(el.href).origin !== location.origin) return { ok: false, reason: 'external' };
    } catch {
      /* relative */
    }
  }
  if (step.action === 'fill' && el instanceof HTMLInputElement && SECRET_FIELD.test(`${el.type} ${el.autocomplete} ${el.name} ${el.id}`)) {
    return { ok: false, reason: 'refused' };
  }

  el.scrollIntoView({ behavior: scrollBehavior(), block: 'center', inline: 'nearest' });
  await wait(prefersReducedMotion() ? 40 : 260);
  await moveCursor(el, say);
  el.classList.add('ec-agent-target');
  try {
    switch (step.action) {
      case 'click':
        pulse();
        realClick(el);
        return { ok: true };
      case 'fill':
        pulse();
        await typeInto(el, step.value || '', signal);
        return { ok: true };
      case 'select':
        pulse();
        return (await pickOption(el, step.value || step.label, signal)) ? { ok: true } : { ok: false, reason: 'noOption' };
      case 'press':
        pressKey(el, step.value || 'Enter');
        return { ok: true };
      case 'scroll':
        return { ok: true };
      case 'highlight':
        el.classList.remove('ec-agent-spotlight');
        void el.offsetWidth;
        el.classList.add('ec-agent-spotlight');
        window.setTimeout(() => el.classList.remove('ec-agent-spotlight'), 2600);
        await wait(prefersReducedMotion() ? 200 : 1100);
        return { ok: true };
    }
    return { ok: false, reason: 'refused' };
  } finally {
    window.setTimeout(() => el.classList.remove('ec-agent-target'), 500);
  }
}

/** A short report of what ran, sent back to the agent so it can continue the task (or explain what blocked it). */
export function stepsReport(steps: UiStep[], results: StepResult[]): string {
  return steps
    .map((s, i) => {
      const r = results[i];
      const what = `${s.action} "${s.label}"${s.value && s.action !== 'click' ? ` = "${clean(s.value, 60)}"` : ''}`;
      return `- ${what}: ${r?.ok ? 'done' : r ? `not done (${r.reason})` : 'not run'}`;
    })
    .join('\n');
}
