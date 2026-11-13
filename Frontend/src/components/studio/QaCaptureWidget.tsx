import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronsDown, ChevronsUp, Crosshair, Layers, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { studioApi, type QaPriority } from '@/lib/studioApi';
import { spotlight } from '@/lib/agentOps';
import { cn } from '@/lib/utils';

/** "Show on page" from a QA ticket: the selector to highlight after navigation. */
export const QA_SPOTLIGHT_KEY = 'ec-qa-spotlight';

type TargetInfo = {
  kind: 'element' | 'text';
  label: string;
  text: string;
  selector: string;
  tag: string;
};

type Mode = 'idle' | 'picking' | 'form' | 'done';

const FAB_KEY = 'ec-qa-fab-pos';

function cssPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.body && parts.length < 7) {
    let part = cur.tagName.toLowerCase();
    if (cur.id) {
      parts.unshift(`#${CSS.escape(cur.id)}`);
      break;
    }
    const classes = Array.from(cur.classList)
      .filter((c) => c && !c.startsWith('ec-qa-'))
      .slice(0, 2);
    if (classes.length) part += `.${classes.map((c) => CSS.escape(c)).join('.')}`;
    const parent = cur.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (n): n is Element => n instanceof Element && n.tagName === cur!.tagName,
      );
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    cur = parent;
  }
  return parts.join(' > ');
}

function describeElement(el: Element): TargetInfo {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const aria = el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('title') || '';
  const label =
    aria ||
    text ||
    (el instanceof HTMLImageElement ? el.src.split('/').pop() || 'image' : '') ||
    tag;
  return {
    kind: 'element',
    label: label.slice(0, 80),
    text: text || aria,
    selector: cssPath(el),
    tag,
  };
}

function buildTicketBody(target: TargetInfo, note: string, pageUrl: string) {
  return [
    `Target: ${target.label}`,
    `Type: ${target.kind === 'text' ? 'text selection' : `<${target.tag}>`}`,
    target.text ? `Content: “${target.text}”` : null,
    `Selector: ${target.selector}`,
    `Page: ${pageUrl}`,
    '',
    'Requested change:',
    note.trim() || '(to be specified)',
  ]
    .filter((line) => line != null)
    .join('\n');
}

function clampFab(left: number, top: number, size = 52) {
  const pad = 8;
  return {
    left: Math.max(pad, Math.min(window.innerWidth - size - pad, left)),
    top: Math.max(pad, Math.min(window.innerHeight - size - pad, top)),
  };
}

/** Floating QA picker (LaveriExpert-style) for trainers/admins. */
const QaCaptureWidget = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [priority, setPriority] = useState<QaPriority>('normal');
  const loc = useLocation();

  // Highlight the element a ticket points to, once the page has rendered.
  useEffect(() => {
    let selector: string | null = null;
    try {
      selector = sessionStorage.getItem(QA_SPOTLIGHT_KEY);
      if (selector) sessionStorage.removeItem(QA_SPOTLIGHT_KEY);
    } catch {
      /* storage unavailable */
    }
    if (!selector) return;
    const h = window.setTimeout(() => {
      try {
        spotlight(selector as string);
      } catch {
        /* invalid selector */
      }
    }, 700);
    return () => window.clearTimeout(h);
  }, [loc.pathname]);
  const location = useLocation();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<Mode>('idle');
  const [target, setTarget] = useState<TargetInfo | null>(null);
  const [hoverEl, setHoverEl] = useState<Element | null>(null);
  const [note, setNote] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [fabPos, setFabPos] = useState<{ left: number; top: number } | null>(null);
  const hoverRef = useRef<Element | null>(null);

  const allowed = user?.role === 'TRAINER' || user?.role === 'ADMIN';

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAB_KEY);
      if (raw) setFabPos(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const clearHover = useCallback(() => {
    if (hoverRef.current) {
      hoverRef.current.classList.remove('ec-qa-pick-hover');
      hoverRef.current = null;
    }
    setHoverEl(null);
  }, []);

  const stopPicking = useCallback(() => {
    clearHover();
    document.body.classList.remove('ec-qa-picking');
    setMode('idle');
  }, [clearHover]);

  const closeForm = useCallback(() => {
    setMode('idle');
    setTarget(null);
    setNote('');
    setTitle('');
    setError(null);
    setTicketId(null);
    setPriority('normal');
  }, []);

  useEffect(() => {
    stopPicking();
    closeForm();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Text the trainer selected just before opening QA mode (the capture layer would block selecting it later).
  const lastSelection = useRef<{ text: string; el: Element | null; at: number } | null>(null);
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      const text = sel?.toString().replace(/\s+/g, ' ').trim() || '';
      if (text.length < 2) return;
      const node = sel?.anchorNode || null;
      const el = node instanceof Element ? node : node?.parentElement || null;
      if (el?.closest('[data-qa-ignore]')) return;
      lastSelection.current = { text, el, at: Date.now() };
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  /* Picking: a transparent layer takes every pointer event (links, disabled buttons, site handlers never fire),
     and a hit test goes through the layers under the pointer, including pointer-events:none content.
     Up / Down = larger / smaller (parent / child), Tab = the next layer at that point, Enter = select. */
  const layerRef = useRef<HTMLDivElement | null>(null);
  const pick = useRef<{ layers: Element[]; layer: number; depth: number; x: number; y: number }>({ layers: [], layer: 0, depth: 0, x: 0, y: 0 });
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number; label: string } | null>(null);
  const [touchPicked, setTouchPicked] = useState(false);

  const currentTarget = useCallback((): Element | null => {
    const st = pick.current;
    let el: Element | null = st.layers[st.layer] || null;
    for (let i = 0; el && i < st.depth; i++) {
      const parent: Element | null = el.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      el = parent;
    }
    return el;
  }, []);

  const showTarget = useCallback(() => {
    const el = currentTarget();
    hoverRef.current = el;
    setHoverEl(el);
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    const name = el.tagName.toLowerCase();
    const text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height, label: text ? `${name} · ${text}` : name });
  }, [currentTarget]);

  const selectTarget = useCallback(() => {
    const el = currentTarget();
    if (!el) return;
    const info = describeElement(el);
    setTarget(info);
    setTitle(t('qaWidget.defaultTitle', { label: info.label.slice(0, 48) }));
    clearHover();
    setBox(null);
    setTouchPicked(false);
    document.body.classList.remove('ec-qa-picking');
    setMode('form');
  }, [currentTarget, clearHover, t]);

  useEffect(() => {
    if (mode !== 'picking') return;

    // Text selected right before: report that text directly.
    const sel = lastSelection.current;
    if (sel && Date.now() - sel.at < 8000) {
      lastSelection.current = null;
      const info = sel.el ? describeElement(sel.el) : null;
      setTarget({ kind: 'text', label: sel.text.slice(0, 80), text: sel.text.slice(0, 240), selector: info?.selector || '', tag: 'text' });
      setTitle(`${t('qaWidget.text')}: ${sel.text.slice(0, 48)}`);
      setMode('form');
      return;
    }

    document.body.classList.add('ec-qa-picking');
    const layer = layerRef.current;
    const skip = (el: Element) =>
      el === layer || el === document.documentElement || el === document.body || !!el.closest('[data-qa-ignore]');
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      const cs = getComputedStyle(el);
      return cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0' ? null : r;
    };
    /** Deepest visible descendant under the point, even when it ignores pointer events. */
    const descend = (start: Element, x: number, y: number) => {
      let el = start;
      for (let guard = 0; guard < 40; guard++) {
        const kids = Array.from(el.children).reverse();
        const next = kids.find((k) => {
          if (k.closest('[data-qa-ignore]')) return false;
          const r = visible(k);
          return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        });
        if (!next) return el;
        el = next;
      }
      return el;
    };
    const layersAt = (x: number, y: number) => {
      const out: Element[] = [];
      for (const hit of document.elementsFromPoint(x, y)) {
        if (skip(hit)) continue;
        const deep = descend(hit, x, y);
        if (!out.includes(deep) && !out.some((o) => deep.contains(o))) out.push(deep);
      }
      return out;
    };
    const aim = (x: number, y: number) => {
      pick.current = { layers: layersAt(x, y), layer: 0, depth: 0, x, y };
      showTarget();
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      aim(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onUp = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        // Touch: the tap shows the target; the bar's buttons adjust it and confirm.
        aim(e.clientX, e.clientY);
        setTouchPicked(true);
        return;
      }
      if (!hoverRef.current) aim(e.clientX, e.clientY);
      selectTarget();
    };
    const onKey = (e: KeyboardEvent) => {
      const st = pick.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        stopPicking();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        st.depth += 1;
        showTarget();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        st.depth = Math.max(0, st.depth - 1);
        showTarget();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (st.layers.length) st.layer = (st.layer + (e.shiftKey ? st.layers.length - 1 : 1)) % st.layers.length;
        st.depth = 0;
        showTarget();
      } else if (e.key === 'Enter' && hoverRef.current) {
        e.preventDefault();
        selectTarget();
      }
    };
    const onScroll = () => showTarget();

    layer?.addEventListener('pointermove', onMove);
    layer?.addEventListener('pointerdown', onDown);
    layer?.addEventListener('pointerup', onUp);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      layer?.removeEventListener('pointermove', onMove);
      layer?.removeEventListener('pointerdown', onDown);
      layer?.removeEventListener('pointerup', onUp);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      document.body.classList.remove('ec-qa-picking');
      setBox(null);
      setTouchPicked(false);
      clearHover();
    };
  }, [mode, clearHover, stopPicking, showTarget, selectTarget, t]);

  const adjust = (kind: 'up' | 'down' | 'layer') => {
    const st = pick.current;
    if (kind === 'up') st.depth += 1;
    else if (kind === 'down') st.depth = Math.max(0, st.depth - 1);
    else if (st.layers.length) {
      st.layer = (st.layer + 1) % st.layers.length;
      st.depth = 0;
    }
    showTarget();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError(null);
    const pageUrl = window.location.href;
    try {
      const ticket = await studioApi.createTicket({
        title: title.trim() || `QA: ${target.label}`,
        body: buildTicketBody(target, note, pageUrl),
        page: pageUrl.slice(0, 200),
        priority,
      });
      setTicketId(ticket.id);
      setMode('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create ticket');
    } finally {
      setBusy(false);
    }
  };

  if (!mounted || !allowed) return null;

  const fabBusy = mode === 'picking' || mode === 'form' || mode === 'done';

  const ui = (
    <div className="ec-qa-capture" data-qa-ignore>
      <div
        className={cn('ec-qa-fab-stack', fabPos && 'is-moved')}
        style={fabPos ? { left: fabPos.left, top: fabPos.top } : undefined}
        data-qa-ignore
      >
        <button
          type="button"
          className={cn('ec-qa-fab', fabBusy && 'is-busy')}
          aria-label={fabBusy ? t('qaWidget.cancelMode') : t('qaWidget.openMode')}
          title={fabBusy ? t('qaWidget.cancel') : t('qaWidget.fabTitle')}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const el = e.currentTarget;
            const rect = el.getBoundingClientRect();
            const dx = e.clientX - rect.left;
            const dy = e.clientY - rect.top;
            const startX = e.clientX;
            const startY = e.clientY;
            let moved = false;
            const pointerId = e.pointerId;
            try {
              el.setPointerCapture(pointerId);
            } catch {
              /* ignore */
            }
            let frame = 0;
            let last: { x: number; y: number } | null = null;

            const onMove = (ev: PointerEvent) => {
              if (ev.pointerId !== pointerId) return;
              if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) moved = true;
              if (!moved) return;
              ev.preventDefault();
              last = { x: ev.clientX, y: ev.clientY };
              if (frame) return;
              frame = window.requestAnimationFrame(() => {
                frame = 0;
                if (last) setFabPos(clampFab(last.x - dx, last.y - dy));
              });
            };

            const onUp = (ev: PointerEvent) => {
              if (ev.pointerId !== pointerId) return;
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
              window.removeEventListener('pointercancel', onUp);
              if (frame) window.cancelAnimationFrame(frame);
              if (moved && last) setFabPos(clampFab(last.x - dx, last.y - dy));
              try {
                el.releasePointerCapture(pointerId);
              } catch {
                /* ignore */
              }
              if (moved) {
                setFabPos((pos) => {
                  if (pos) {
                    try {
                      localStorage.setItem(FAB_KEY, JSON.stringify(pos));
                    } catch {
                      /* ignore */
                    }
                  }
                  return pos;
                });
                return;
              }
              if (mode === 'picking') {
                stopPicking();
                return;
              }
              if (mode === 'form' || mode === 'done') {
                closeForm();
                return;
              }
              setError(null);
              setMode('picking');
            };

            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
          }}
        >
          {fabBusy ? <X className="h-5 w-5" /> : 'QA'}
        </button>
      </div>

      {mode === 'picking' ? (
        <>
          {/* The capture layer sits under the widget's own UI (bar, button), above the page */}
          <div ref={layerRef} className="ec-qa-pick-layer" aria-hidden />
          {box ? (
            <div className="ec-qa-pick-box" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} aria-hidden>
              <span className={cn('ec-qa-pick-tag', box.top < 34 && 'is-inside')} dir="auto">{box.label}</span>
            </div>
          ) : null}
          <div className="ec-qa-pick-bar" data-qa-ignore>
            <Crosshair className="h-4 w-4 flex-none" />
            <strong>{t('qaWidget.mode')}</strong>
            <span className="ec-qa-pick-hint">{touchPicked ? t('qaWidget.touchHint') : t('qaWidget.pickHint')}</span>
            <span className="ec-qa-pick-tools">
              <button type="button" onClick={() => adjust('up')} disabled={!hoverEl} title={t('qaWidget.larger')} aria-label={t('qaWidget.larger')}>
                <ChevronsUp className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => adjust('down')} disabled={!hoverEl} title={t('qaWidget.smaller')} aria-label={t('qaWidget.smaller')}>
                <ChevronsDown className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => adjust('layer')} disabled={pick.current.layers.length < 2} title={t('qaWidget.layer')} aria-label={t('qaWidget.layer')}>
                <Layers className="h-4 w-4" />
              </button>
              {touchPicked && hoverEl ? (
                <button type="button" className="is-primary" onClick={selectTarget}>{t('qaWidget.selectThis')}</button>
              ) : null}
            </span>
            <button type="button" className="ec-qa-pick-cancel" onClick={stopPicking}>
              {t('qaWidget.cancel')}
            </button>
          </div>
        </>
      ) : null}

      {mode === 'form' || mode === 'done' ? (
        <div className="ec-qa-capture-modal" data-qa-ignore role="dialog" aria-modal="true">
          <form
            className="ec-qa-capture-card"
            onSubmit={(e) => void submit(e)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="ec-qa-capture-head">
              <h2>{mode === 'done' ? t('qaWidget.created') : t('qaWidget.newReport')}</h2>
              <button type="button" className="ec-qa-capture-x" aria-label={t('qaWidget.close')} onClick={closeForm}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {mode === 'done' ? (
              <div className="ec-qa-done">
                <p>{t('qaWidget.saved', { id: ticketId ?? '' })}</p>
                <div className="ec-qa-actions">
                  <button type="button" className="ec-qa-btn" onClick={() => { closeForm(); navigate(ticketId ? `/studio/qa?ticket=${ticketId}` : '/studio/qa'); }}>
                    {t('qaWidget.openTicket')}
                  </button>
                  <button type="button" className="ec-qa-btn ghost" onClick={closeForm}>
                    {t('qaWidget.keepBrowsing')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {target ? (
                  <p className="ec-qa-target">
                    <span>{target.kind === 'text' ? t('qaWidget.text') : `<${target.tag}>`}</span>
                    {target.label}
                  </p>
                ) : null}
                <label className="ec-qa-field">
                  {t('qaWidget.title')}
                  <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={200} />
                </label>
                <label className="ec-qa-field">
                  {t('qaWidget.whatChange')}
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder={t('qaWidget.describe')} />
                </label>
                <div className="ec-qa-prio" role="radiogroup" aria-label={t('studio.qa.priority')}>
                  {(['low', 'normal', 'high'] as QaPriority[]).map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={priority === p} className={cn('ec-qa-prio-btn', priority === p && 'is-on', `is-${p}`)} onClick={() => setPriority(p)}>
                      <i />
                      {t(`studio.qa.priorities.${p}`)}
                    </button>
                  ))}
                </div>
                {error ? <p className="ec-qa-error">{error}</p> : null}
                <div className="ec-qa-actions">
                  <button type="button" className="ec-qa-btn ghost" onClick={closeForm} disabled={busy}>
                    {t('qaWidget.cancel')}
                  </button>
                  <button type="submit" className="ec-qa-btn" disabled={busy || !target}>
                    {busy ? t('qaWidget.saving') : t('qaWidget.create')}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      ) : null}
    </div>
  );

  return createPortal(ui, document.body);
};

export default QaCaptureWidget;
