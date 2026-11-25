/**
 * Edit-mode bridge, running inside the studio iframe (/home?ec-edit=1). The parent (Studio -> My site) owns the
 * draft and sends it here; this side draws the real site (still, no scroll-jacking), outlines what can be edited,
 * lets the trainer type directly on the page and reports every change back.
 */
import { initSite } from './siteMotion';
import type { SiteContent, SiteLang } from './content/types';
import {
  EC_EDIT_SOURCE,
  isEcEditMessage,
  isMultilinePath,
  type EcChildPayload,
  type EcEditMode,
  type EcFrameLabels,
  type EcParentMsg,
  type EcSelect,
} from './editProtocol';

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === 'object' && !Array.isArray(v);

function getIn(obj: Json, path: string): Json {
  return path.split('.').reduce<Json>((node, k) => (node == null ? undefined : (node as Record<string, Json>)[k]), obj);
}

/** Leaf paths whose value differs (an array whose length changed counts as one changed path). */
function changedPaths(a: Json, b: Json, prefix: string, out: string[]) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(prefix);
    else a.forEach((_, i) => changedPaths(a[i], b[i], prefix ? `${prefix}.${i}` : String(i), out));
    return;
  }
  if (isObj(a) && isObj(b)) {
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach((k) => changedPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k, out));
    return;
  }
  if (a !== b) out.push(prefix);
}

const sel = (v: string) => (window.CSS && CSS.escape ? CSS.escape(v) : v.replace(/"/g, '\\"'));

function targetsFor(root: HTMLElement, select: EcSelect | null): HTMLElement[] {
  if (!select) return [];
  const attr = select.kind === 'text' ? 'data-ec-path' : select.kind === 'image' ? 'data-ec-img' : select.kind === 'item' ? 'data-ec-item' : 'data-ec-section';
  return Array.from(root.querySelectorAll<HTMLElement>(`[${attr}="${sel(select.path)}"]`));
}

function post(payload: EcChildPayload) {
  window.parent.postMessage({ source: EC_EDIT_SOURCE, ...payload }, window.location.origin);
}

/** Put the caret where the trainer clicked (the element only became editable on that click). */
function placeCaret(el: HTMLElement, x: number, y: number) {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let range: Range | null = null;
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
    }
  } else if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  }
  const s = window.getSelection();
  if (!s) return;
  if (range && el.contains(range.startContainer)) {
    range.collapse(true);
  } else {
    range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
  }
  s.removeAllRanges();
  s.addRange(range);
}

export function startEditBridge(root: HTMLElement, lang: SiteLang): () => void {
  const html = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let content: SiteContent | null = null;
  let select: EcSelect | null = null;
  let mode: EcEditMode = 'edit';
  let labels: EcFrameLabels | null = null;
  let cleanupSite: (() => void) | null = null;
  let editingEl: HTMLElement | null = null;

  html.classList.add('ec-editing');

  const draw = (next: SiteContent) => {
    const y = window.scrollY;
    cleanupSite?.();
    cleanupSite = initSite(root, { navigate: () => undefined, content: next, lang, onLang: () => undefined, mode: 'edit' });
    html.classList.add('ec-site-active');
    window.scrollTo(0, y);
    editingEl = null;
  };

  const patchTexts = (next: SiteContent) => {
    root.querySelectorAll<HTMLElement>('[data-ec-path]').forEach((el) => {
      const value = getIn(next, el.dataset.ecPath || '');
      // Skip only the text the trainer is typing in on the page itself (it already shows the value, keep the caret).
      if (typeof value !== 'string' || (el === editingEl && document.hasFocus() && document.activeElement === el)) return;
      if (el.textContent !== value) el.textContent = value;
      if (el.hasAttribute('data-text')) el.setAttribute('data-text', value);
    });
  };

  /** Only a text that is on the page can be patched in place; anything else (lists, photos, layout) redraws. */
  const canPatch = (prev: SiteContent, next: SiteContent) => {
    const paths: string[] = [];
    changedPaths(prev, next, '', paths);
    return paths.every((p) => typeof getIn(next, p) === 'string' && !p.startsWith('layout') && !!root.querySelector(`[data-ec-path="${sel(p)}"]`));
  };

  const decorate = () => {
    html.classList.toggle('ec-mode-edit', mode === 'edit');
    html.classList.toggle('ec-mode-preview', mode === 'preview');
    if (!labels) return;
    const L = labels;
    root.querySelectorAll<HTMLElement>('[data-ec-section]').forEach((sec) => {
      const key = sec.dataset.ecSection || '';
      const pageSection = sec.classList.contains('ec-sec');
      const hidden = sec.classList.contains('is-ec-hidden');
      let bar = sec.querySelector<HTMLElement>(':scope > .ec-edit-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'ec-edit-bar';
        bar.setAttribute('contenteditable', 'false');
        sec.insertBefore(bar, sec.firstChild);
      }
      const name = L.sections[key] || key;
      const btn = (act: string, label: string, icon: string) =>
        `<button type="button" data-ec-act="${act}" data-ec-key="${key}" title="${label}" aria-label="${label}">${icon}</button>`;
      const eye = hidden
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 3.9M6.3 6.3C3.8 8 2.5 12 2.5 12s3.5 7 9.5 7c1.6 0 3-.4 4.3-1"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
      const up = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
      const down = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
      const tools = pageSection && key !== 'hero'
        ? btn('up', L.up, up) + btn('down', L.down, down) + btn('toggle', hidden ? L.show : L.hide, eye)
        : '';
      const html = `<span class="ec-edit-bar__label">${name.replace(/</g, '&lt;')}${hidden ? ` <em>· ${L.hidden.replace(/</g, '&lt;')}</em>` : ''}</span>${tools}`;
      if (bar.innerHTML !== html) bar.innerHTML = html;
    });
    root.querySelectorAll<HTMLElement>('[data-ec-img]').forEach((box) => {
      let b = box.querySelector<HTMLButtonElement>(':scope > .ec-edit-imgbtn');
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.className = 'ec-edit-imgbtn';
        box.appendChild(b);
      }
      b.textContent = L.changePhoto;
    });
    root.querySelectorAll('.is-ec-selected').forEach((el) => el.classList.remove('is-ec-selected'));
    targetsFor(root, select).forEach((el) => el.classList.add('is-ec-selected'));
  };

  const stopEditing = () => {
    if (!editingEl) return;
    editingEl.removeAttribute('contenteditable');
    editingEl = null;
  };

  const startEditing = (el: HTMLElement, x: number, y: number) => {
    if (editingEl === el) return;
    stopEditing();
    editingEl = el;
    el.setAttribute('contenteditable', 'plaintext-only');
    if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'true');
    el.focus({ preventScroll: true });
    placeCaret(el, x, y);
  };

  const choose = (next: EcSelect | null) => {
    select = next;
    decorate();
    post({ type: 'select', select: next });
  };

  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (!t || !root.contains(t)) return;
    if (mode === 'preview') {
      if (t.closest('a, button, form, label')) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    const act = t.closest<HTMLElement>('[data-ec-act]');
    if (act) {
      e.preventDefault();
      e.stopPropagation();
      post({ type: 'section', key: act.dataset.ecKey || '', action: act.dataset.ecAct as 'toggle' | 'up' | 'down' });
      return;
    }
    if (t.closest('.ec-edit-bar')) {
      e.preventDefault();
      e.stopPropagation();
      const sec = t.closest<HTMLElement>('[data-ec-section]');
      if (sec) choose({ kind: 'section', path: sec.dataset.ecSection || '' });
      return;
    }
    const imgBtn = t.closest<HTMLElement>('.ec-edit-imgbtn');
    const textEl = t.closest<HTMLElement>('[data-ec-path]');
    const imgEl = t.closest<HTMLElement>('[data-ec-img]');
    const itemEl = t.closest<HTMLElement>('[data-ec-item]');
    const secEl = t.closest<HTMLElement>('[data-ec-section]');
    if (textEl === editingEl && textEl) return; // moving the caret inside the text being edited
    e.preventDefault();
    e.stopPropagation();
    if (imgBtn && imgEl) {
      stopEditing();
      choose({ kind: 'image', path: imgEl.dataset.ecImg || '' });
      post({ type: 'pick-image', path: imgEl.dataset.ecImg || '' });
      return;
    }
    if (textEl) {
      choose({ kind: 'text', path: textEl.dataset.ecPath || '' });
      startEditing(textEl, e.clientX, e.clientY);
      return;
    }
    stopEditing();
    if (imgEl) choose({ kind: 'image', path: imgEl.dataset.ecImg || '' });
    else if (itemEl) choose({ kind: 'item', path: itemEl.dataset.ecItem || '' });
    else if (secEl) choose({ kind: 'section', path: secEl.dataset.ecSection || '' });
    else choose(null);
  };

  // Links, buttons and forms of the page never act while editing.
  const block = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (t && root.contains(t) && e.type === 'submit') e.preventDefault();
  };

  const onInput = (e: Event) => {
    const el = e.target as HTMLElement | null;
    if (!el || el !== editingEl) return;
    const path = el.dataset.ecPath || '';
    let value = el.innerText.replace(/ /g, ' ');
    if (!isMultilinePath(path)) value = value.replace(/\s*\n\s*/g, ' ');
    if (el.hasAttribute('data-text')) el.setAttribute('data-text', value);
    // Same text shown twice (menu + mobile menu): keep both in step.
    root.querySelectorAll<HTMLElement>(`[data-ec-path="${sel(path)}"]`).forEach((other) => {
      if (other !== el && other.textContent !== value) other.textContent = value;
    });
    post({ type: 'text', path, value });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!editingEl) return;
    const path = editingEl.dataset.ecPath || '';
    if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey && !isMultilinePath(path))) {
      e.preventDefault();
      editingEl.blur();
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    if (!editingEl || editingEl.contentEditable === 'plaintext-only') return;
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  };

  const onFocusOut = (e: FocusEvent) => {
    if (e.target === editingEl) stopEditing();
  };

  /** The studio changed or cleared the selection: leave typing mode unless the text being edited is still selected. */
  const syncEditing = () => {
    if (editingEl && (!select || select.kind !== 'text' || select.path !== editingEl.dataset.ecPath)) stopEditing();
  };

  const onMessage = (ev: MessageEvent) => {
    if (ev.origin !== window.location.origin || ev.source !== window.parent || !isEcEditMessage(ev.data)) return;
    const msg = ev.data as EcParentMsg;
    if (msg.type === 'sync') {
      const prev = content;
      content = msg.content;
      select = msg.select;
      mode = msg.mode;
      labels = msg.labels;
      if (!prev || !canPatch(prev, msg.content)) draw(msg.content);
      else patchTexts(msg.content);
      syncEditing();
      decorate();
      return;
    }
    if (msg.type === 'select') {
      select = msg.select;
      syncEditing();
      decorate();
      return;
    }
    if (msg.type === 'scroll') {
      const el = targetsFor(root, msg.select)[0];
      window.setTimeout(() => el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: msg.select.kind === 'section' ? 'start' : 'center' }), 60);
    }
  };

  window.addEventListener('message', onMessage);
  document.addEventListener('click', onClick, true);
  document.addEventListener('submit', block, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('paste', onPaste, true);
  document.addEventListener('focusout', onFocusOut, true);
  post({ type: 'ready' });

  return () => {
    window.removeEventListener('message', onMessage);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('submit', block, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('paste', onPaste, true);
    document.removeEventListener('focusout', onFocusOut, true);
    cleanupSite?.();
    html.classList.remove('ec-editing', 'ec-mode-edit', 'ec-mode-preview');
  };
}
