import type React from 'react';

/**
 * The QA widget and Agent EC live outside every dialog. Radix modals (Dialog, Sheet, Drawer) make the rest of the page
 * inert: pointer-events none on <body>, a focus trap, "click outside closes", and a wheel/touch scroll lock.
 * Tools marked with `data-ec-float` stay usable on top of any pop-up:
 *  - React handlers stop pointer / wheel / touch events at the tool root so Radix's document listeners never see them
 *    (no outside-dismiss, no scroll lock);
 *  - `installFloatingToolGuard()` keeps the focus trap from pulling focus back out of the tool's inputs.
 */
export const FLOAT_ATTR = 'data-ec-float';

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Pointer + wheel guards (safe for tools that listen to touch gestures on window, like the Agent EC edge pull). */
export const floatingToolProps = {
  'data-ec-float': '',
  'data-lenis-prevent': '',
  onPointerDown: stop,
  onMouseDown: stop,
  onWheel: stop,
} as const;

/** Extra guard for scrollable panels: keeps the modal scroll lock from swallowing touch scrolling. */
export const floatingTouchProps = { onTouchStart: stop, onTouchMove: stop } as const;

const inFloat = (n: EventTarget | null) => n instanceof Element && !!n.closest(`[${FLOAT_ATTR}]`);

let installed = false;
export function installFloatingToolGuard() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const guard = (e: FocusEvent) => {
    if (inFloat(e.target) || inFloat(e.relatedTarget)) e.stopImmediatePropagation();
  };
  window.addEventListener('focusin', guard, true);
  window.addEventListener('focusout', guard, true);
  // Escape typed inside a tool belongs to that tool only: Radix listens on the document in the capture phase and would
  // close the dialog / sheet behind it. Stop it at the window and tell the tool instead (FLOAT_ESCAPE on its root).
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !inFloat(e.target)) return;
      e.stopPropagation();
      const root = (e.target as Element).closest(`[${FLOAT_ATTR}]`);
      root?.dispatchEvent(new CustomEvent(FLOAT_ESCAPE, { bubbles: true }));
    },
    true,
  );
}

/** Fired (bubbling) on a floating tool's root when Escape is pressed inside it. */
export const FLOAT_ESCAPE = 'ec-float-escape';
