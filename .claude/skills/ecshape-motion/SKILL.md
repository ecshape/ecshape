---
name: ecshape-motion
description: Design system and motion rules for the ECshape marketing site in landing/ (not the Frontend/ portal). Use when adding or changing any section, button, or animation on the landing page so it stays consistent with the scroll-driven "Kinetic Editorial" style.
---

# ECshape landing — design & motion system

The landing site is static (nginx) — `landing/index.html`, `landing/assets/css/site.css`, `landing/assets/js/site.js`.
Hebrew, `dir="rtl"`. No build step. Free libraries only, from CDN with pinned versions:
GSAP 3.13 + ScrollTrigger (cdnjs), Lenis 1.1.13 (unpkg).

References this style was derived from: scroll-driven template sites (scrolltide.co, jiro.build),
landing galleries (land-book, landdding, recent.design), button libraries (details.so). Nothing is copied
from them — all code here is original.

## Tokens (site.css `:root`)
- Colors: warm black `--bg #0b0a08`, surfaces `--surface / --surface-2`, ink `--ink`, brand orange `--accent #f0661f`, `--gold`, WhatsApp green `--wa`.
- Type: `--f-display` Karantina 700 (condensed Hebrew display), `--f-body` Heebo, `--f-num` Anton (Latin numerals / wordmark).
- Scale: `.h-xl`, `.h-lg`, `.h-md` — always with `.display`. One accent line per heading (`.accent` or `.grad-text`).
- Easing: `--ease-out` (.22,1,.36,1) for almost everything; `--ease-spring` for release / pop; `--ease-in-out` for wipes. GSAP equivalent: `expo.out`.

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
