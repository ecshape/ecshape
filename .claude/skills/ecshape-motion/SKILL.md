---
name: ecshape-motion
description: Design system and motion rules for the ECshape platform — the public site (Frontend/src/site) and the trainer/client portal (Frontend/src). Use when adding or changing any page, section, button, or animation so everything stays consistent with the "Kinetic Editorial" style.
---

# ECshape landing — design & motion system

ECshape is one React app (`Frontend/`). `/` shows the public site to visitors and the dashboard to signed-in users; `/home` always shows the site.
- Public site: `Frontend/src/site/markup.html` (markup), `site.css` (all rules scoped under `.ec-site`), `siteMotion.js` (`initSite()` → cleanup), mounted by `src/pages/SitePage.tsx`. Photos in `Frontend/public/site/photos/`.
- Portal: theme tokens in `src/index.css`, UI kit in `src/components/ui/`, shell in `src/components/Layout.tsx`, page headers/stat tiles in `src/components/PageHeader.tsx`.
- Libraries (npm, free): gsap 3.13 + ScrollTrigger, lenis 1.1.13 — only loaded on the public site (code-split).
- `landing/` is the older standalone copy of the site; the app version is the source of truth.

References this style was derived from: scroll-driven template sites (scrolltide.co, jiro.build),
landing galleries (land-book, landdding, recent.design), button libraries (details.so). Nothing is copied
from them — all code here is original.

## Tokens (site.css `:root`)
- Colors: warm black `--bg #0b0a08`, surfaces `--surface / --surface-2`, ink `--ink`, brand orange `--accent #f0661f`, `--gold`, WhatsApp green `--wa`.
- Type: `--f-display` Karantina 700 (condensed Hebrew display), `--f-body` Heebo, `--f-num` Anton (Latin numerals / wordmark).
- Scale: `.h-xl`, `.h-lg`, `.h-md` — always with `.display`. One accent line per heading (`.accent` or `.grad-text`).
- Easing: `--ease-out` (.22,1,.36,1) for almost everything; `--ease-spring` for release / pop; `--ease-in-out` for wipes. GSAP equivalent: `expo.out`.
- All motion tokens (site and portal) live in `src/styles/motion.css`; see **Motion tokens** below.

## Buttons
Write only `<a class="btn btn--primary" data-icon="arrow">Label</a>`; site.js builds the anatomy:
`.btn__fill` (circle grows from the cursor entry point) + `.btn__label` (text rolls up, copy rolls in) + `.btn__icon` (arrow exits forward, new one enters).
- Variants: `--primary`, `--wa`, `--ghost`, `--ig`; modifiers `--sm`, `--block`, `--shine` (light sweep — use on at most one CTA per view).
- `data-icon="wa"` uses the WhatsApp glyph.
- Wrap hero/CTA buttons in `<span class="magnetic">` for the magnetic pull (desktop, fine pointer only).
- Every button: visible `:focus-visible` ring, `:active` scale .965, 44px+ hit area.
- WhatsApp links keep the full `href` in HTML plus `data-wa`.

## Motion vocabulary (data attributes)
| Attribute | Effect |
|---|---|
| `data-reveal` | fade + rise on enter |
| `data-split` (with `.line` children) | masked line-by-line rise |
| `data-stagger` | children rise in sequence |
| `data-words` | words light up as you scroll (scrubbed) |
| `data-count="92" data-suffix="%"` | count-up on enter |
| `data-parallax` | image drifts inside its frame |
| `data-cursor="label"` | cursor follower grows and shows the label |
| `data-scramble` | Hebrew letter scramble on hover |
| `data-marquee="1/-1"` | velocity-reactive marquee row |

Section-level pins (desktop ≥ 901px only, inside `gsap.matchMedia`): hero frame expands to full-bleed,
results gallery scrolls horizontally (RTL ⇒ track moves to **+x**), app section switches phone screens by scroll progress.

## Rules
1. Content is always visible without JS: initial hidden states are set by GSAP, never in CSS.
2. `prefers-reduced-motion` ⇒ no Lenis, no pins, no scrubs, no loader.
3. Mobile (≤ 900px): no pins; horizontal gallery becomes native scroll-snap; app tabs autoplay.
4. Max one "signature" pinned moment per screenful; don't stack pins back to back.
5. Animate only `transform`, `opacity`, `clip-path`, CSS vars. Never animate layout properties.
6. New images: resize to ≤ 2000px and put in `photos/opt/`.
7. RTL: use logical properties (`inset-inline-*`, `padding-inline-*`, `border-inline-*`).

## Motion tokens (one source: `src/styles/motion.css`, JS mirror `src/lib/motion.ts`)
Two tempos, one vocabulary. Never write a literal duration or `cubic-bezier` in a component; never add a new
`--xx-ease` alias. Audit history: `docs/audits/motion-uniformity-2026-11.md`.

| Token | Value | Use |
|---|---|---|
| `--ease-out` | (.22,1,.36,1) | everything (GSAP `expo.out`) |
| `--ease-in` | (.4,0,1,1) | exits only |
| `--ease-in-out` | (.65,0,.35,1) | wipes, loops |
| `--ease-spring` | (.34,1.56,.64,1) | site button release / pop; portal **only** the success bump (set done, favourite, added) |
| `--dur-press` | .06s | `:active` press-in |
| `--dur-fast` | .16s | hover, colour, focus, tooltips/menus, **all exits** |
| `--dur-med` | .22s | route + content enter, tabs, pills, list items, popovers, toasts |
| `--dur-slow` | .26s | sheets, drawers, modals, side panels, panel resize |
| `--dur-data` | .6s | ring / bar / line fills |
| `--dur-loop` | 1.4s | skeleton shimmer, pulses |
| `--t-fast / --t-med / --t-slow` | .25 / .5 / .9s | public site + blog only (cinematic) |
| `--rise` | 4px | enter distance |
| `--shift-panel` | 24px | side-panel travel, signed with `--ec-dir` |
| `--pop-scale` | .98 | modal / popover enter scale (Tailwind `zoom-in-[.98]`) |
| `--press-scale` / `-lg` | .97 / .985 | buttons, chips / cards, rows |
| `--stagger-step` | 30ms | list stagger, cap at 6 steps |
| `--ec-dir` | 1 LTR, -1 RTL | nearest `[dir]` wins; multiply every x-translation by it |

Portal = **calm** (owner, QA #9 / #29: "too exaggerated… everywhere"): short, small, no overshoot on navigation.
Tailwind: `duration-fast|med|slow|data|press`, `ease-out|in|in-out|spring`. The numeric scale is mapped onto the
tokens in `tailwind.config.ts` (200→fast, 300→med, 500→slow, 700/1000→data), and bare `transition` = fast + ease-out.

### Primitives (use these, don't write new keyframes)
| Need | Use |
|---|---|
| Route change | wrap the routed child in `.ec-route` (existing: `.tr-route`, `.ec-page-enter`) — CSS only, no GSAP in the portal |
| Content / card enter | `.ec-enter`, `.tp-rise` (with `--i` for stagger), `.ec-stagger > *` |
| Modal / popover | `ec-pop` at `--dur-slow`; tailwindcss-animate `fade-in-0 zoom-in-[.98]` |
| Bottom sheet | `ec-sheet-up` in, `ec-sheet-down` out |
| Side panel / drawer (end edge) | `ec-side-in` in, `ec-side-out` out (direction-aware via `--ec-dir`) |
| Scrim | `ec-fade` in, `ec-fade-out` out |
| Toast | from below, `slide-in-from-bottom-1 fade-in-0 duration-med`, viewport on the **end** edge |
| Skeleton | `.ec-skel` (shimmer), never `animate-pulse` |
| Success | `.ec-bump` (`--ease-spring`, `--dur-slow`) |
| Press | `:active { transform: scale(var(--press-scale)); transition-duration: var(--dur-press) }` |

### Rules learned in the 2026-11 audit
8. **Exits use a different keyframe name than the entrance.** Radix `Presence` only waits for an exit animation
   when `animation-name` changes on close; `reverse` of the same keyframe unmounts instantly.
9. Exits are `--dur-fast` + `--ease-in`; entrances are `--dur-med`/`--dur-slow` + `--ease-out`.
10. One mechanism per moment: never animate the same element with both CSS and GSAP (route + card stagger used to).
11. Physical directions are bugs: `right-4`, `slide-in-from-right`, `translateX(24px)` must become `end-4`,
    `ec-side-in` / `--ec-dir`. Toasts and drawers enter from the inline end edge.
12. Reduced motion is global in `motion.css` (durations ~0, loops stop, smooth scroll off). JS smooth scrolls use
    `scrollBehavior()` from `lib/motion.ts`; JS animations check `prefersReducedMotion()`.
13. Hover lifts are 1px (`.card-hover`), and none on `(hover: none)` touch screens.
14. Signature one-offs keep their own timing and must be listed in the audit doc: Agent EC travel/spotlight/edge
    peek, brand mark draw, rest-timer shrink, workout burst, AI "write" blur (`ec-sx-write`), site hero/pins (GSAP),
    automations flow wire / live dot / spark burst (`src/styles/automations.css`, `<Burst>`).
