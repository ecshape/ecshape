import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { studioApi } from '@/lib/studioApi';
import { cn } from '@/lib/utils';

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
  }, []);

  useEffect(() => {
    stopPicking();
    closeForm();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== 'picking') return;
    document.body.classList.add('ec-qa-picking');

    const ignored = (el: EventTarget | null) =>
      el instanceof Element && Boolean(el.closest('[data-qa-ignore]'));

    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || ignored(el) || el === document.documentElement || el === document.body) {
        clearHover();
        return;
      }
      if (hoverRef.current === el) return;
      clearHover();
      el.classList.add('ec-qa-pick-hover');
      hoverRef.current = el;
      setHoverEl(el);
    };

    const onClick = (e: MouseEvent) => {
      if (ignored(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      let el = hoverRef.current;
      if (!el) {
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        if (hit instanceof Element && !ignored(hit)) el = hit;
      }
      if (!el || ignored(el)) return;
      const info = describeElement(el);
      const selection = window.getSelection()?.toString().replace(/\s+/g, ' ').trim();
      if (selection && selection.length > 1) {
        setTarget({
          kind: 'text',
          label: selection.slice(0, 80),
          text: selection.slice(0, 240),
          selector: info.selector,
          tag: 'text',
        });
        setTitle(`Text: ${selection.slice(0, 48)}`);
      } else {
        setTarget(info);
        setTitle(`Change: ${info.label.slice(0, 48)}`);
      }
      clearHover();
      document.body.classList.remove('ec-qa-picking');
      setMode('form');
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        stopPicking();
      }
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      document.body.classList.remove('ec-qa-picking');
      clearHover();
    };
  }, [mode, clearHover, stopPicking]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError(null);
    const pageUrl = window.location.href;
    try {
      const ticket = await studioApi.createTicket({
        title: title.trim() || `QA — ${target.label}`,
        body: buildTicketBody(target, note, pageUrl),
        page: pageUrl.slice(0, 200),
        priority: 'normal',
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
          aria-label={fabBusy ? 'Cancel QA mode' : 'Open QA mode'}
          title={fabBusy ? 'Cancel' : 'Report a QA change — drag to move'}
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
          {fabBusy ? '×' : 'QA'}
        </button>
      </div>

      {mode === 'picking' ? (
        <div className="ec-qa-pick-bar" data-qa-ignore>
          <strong>QA mode</strong>
          <span>
            Click text, an icon, or a block to flag
            {hoverEl ? ` · <${hoverEl.tagName.toLowerCase()}>` : ''}
          </span>
          <button type="button" className="ec-qa-pick-cancel" onClick={stopPicking}>
            Cancel
          </button>
        </div>
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
              <h2>{mode === 'done' ? 'Ticket created' : 'New QA report'}</h2>
              <button type="button" className="ec-qa-capture-x" aria-label="Close" onClick={closeForm}>
                ×
              </button>
            </div>

            {mode === 'done' ? (
              <div className="ec-qa-done">
                <p>Saved to Atelier QA{ticketId ? ` (#${ticketId})` : ''}.</p>
                <div className="ec-qa-actions">
                  <button type="button" className="ec-qa-btn" onClick={() => navigate('/studio/qa')}>
                    Open Atelier QA
                  </button>
                  <button type="button" className="ec-qa-btn ghost" onClick={closeForm}>
                    Keep browsing
                  </button>
                </div>
              </div>
            ) : (
              <>
                {target ? (
                  <p className="ec-qa-target">
                    <span>{target.kind === 'text' ? 'Text' : `<${target.tag}>`}</span>
                    {target.label}
                  </p>
                ) : null}
                <label className="ec-qa-field">
                  Title
                  <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={200} />
                </label>
                <label className="ec-qa-field">
                  What should change?
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Describe the fix…" />
                </label>
                {error ? <p className="ec-qa-error">{error}</p> : null}
                <div className="ec-qa-actions">
                  <button type="button" className="ec-qa-btn ghost" onClick={closeForm} disabled={busy}>
                    Cancel
                  </button>
                  <button type="submit" className="ec-qa-btn" disabled={busy || !target}>
                    {busy ? 'Saving…' : 'Create ticket'}
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
