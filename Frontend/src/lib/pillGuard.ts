/**
 * Pill guard — the selected label must never disappear into the sliding "liquid" pill behind it.
 *
 * Root cause seen again and again (Zaun admin nav, ECshape QA #89/#95/#97): the pill colour and the selected
 * label colour are set in different places; one changes (theme, token, variable) and the label ends up the same
 * colour as the pill. Rules: define both as ONE pair (--pill-bg / --pill-fg) on the container, keep labels above
 * the pill (container isolation + label z-index 1, pill z-index 0 or -1) — and as a safety net this guard measures
 * the real contrast in the browser and, if it is below 2:1 (invisible), forces the label to ink or white (dev: console.error).
 *
 * Usage: call installPillGuard() once on the client. Containers are found by PILL_SELECTOR; mark custom ones with
 * data-pill-guard (the pill inside gets data-pill, the selected item aria-current / aria-selected / aria-pressed).
 */
const CONTAINERS = ".pv2-nav, .lg-seg, [data-pill-guard], .tr-nav, .tr-seg, [data-arrived]";
const PILLS = ".lxp-nav-pill, .lg-seg-thumb, [data-pill], .tr-blob, .tr-hblob, .liquid-blob";
/** Below this the label is effectively invisible on the pill. Brand choices above it (e.g. white on orange) are kept. */
const MIN_CONTRAST = 2;
const SELECTED = '[aria-current="page"], [aria-current="step"], [aria-selected="true"], [aria-pressed="true"], .is-active';

type RGB = [number, number, number, number];

function parse(color: string): RGB | null {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
}

function luminance([r, g, b]: RGB) {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: RGB, b: RGB) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Opaque colour of the pill: its background-color, else the middle colour stop of a gradient background. */
function pillColor(pill: HTMLElement): RGB | null {
  const cs = getComputedStyle(pill);
  const bg = parse(cs.backgroundColor);
  if (bg && bg[3] > 0.6) return bg;
  const stops = cs.backgroundImage.match(/rgba?\([^)]+\)/g) ?? [];
  const mid = stops.length ? parse(stops[Math.floor(stops.length / 2)]) : null;
  return mid && mid[3] > 0.6 ? mid : null;
}

function check(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(CONTAINERS).forEach((wrap) => {
    const pill = wrap.querySelector<HTMLElement>(PILLS);
    const label = wrap.querySelector<HTMLElement>(SELECTED);
    if (!pill || !label) return;
    // Wait until the pill sits under the selected item (ECshape useLiquid sets data-arrived) and is visible.
    if (wrap.getAttribute("data-arrived") === "false" || getComputedStyle(pill).opacity === "0") return;
    const bg = pillColor(pill);
    if (!bg) return;
    label.style.removeProperty("color");
    const fg = parse(getComputedStyle(label).color);
    if (!fg) return;
    if (contrast(fg, bg) >= MIN_CONTRAST) return;
    const ink: RGB = [17, 17, 17, 1];
    const white: RGB = [255, 255, 255, 1];
    const fix = contrast(ink, bg) >= contrast(white, bg) ? "rgb(17, 17, 17)" : "rgb(255, 255, 255)";
    label.style.setProperty("color", fix, "important");
    if (import.meta.env.DEV) {
      console.error("[pill-guard] selected label had the pill's colour — forced to", fix, { wrap, label, pill });
    }
  });
}

export function installPillGuard() {
  if (typeof window === "undefined") return () => undefined;
  let frame = 0;
  const run = () => {
    cancelAnimationFrame(frame);
    // after the pill transition has settled
    frame = requestAnimationFrame(() => window.setTimeout(() => check(document), 360));
  };
  run();
  const mo = new MutationObserver(run);
  mo.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["class", "aria-current", "aria-selected", "aria-pressed", "data-theme", "data-arrived"] });
  return () => {
    mo.disconnect();
    cancelAnimationFrame(frame);
  };
}
