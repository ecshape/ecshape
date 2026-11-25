---
name: cinematic-web
description: Award-level motion, scroll-driven storytelling, 3D/shader and launch-surface craft for ECshape (public site, templates, launch assets) — and the taste to push past "nice". Use when designing or upgrading a hero, a pinned scroll scene, an image-sequence scrub, a shader background, a section that must feel Awwwards/FWA class, OG images / launch videos, pricing or program sections, or when the user says "spectacular", "cinematic", "like motionsites / Viktor Oddy / Godly". Works on top of ecshape-motion (tokens, RTL, reduced-motion) — read that skill too.
---

# Cinematic web — ECshape

Goal: pages people screen-record. Not "animated" — **directed**: every scroll inch has a reason, one signature moment
per screenful, real footage over fake 3D whenever a human body is on screen, and a page that still reads perfectly
with motion off. Build on [ecshape-motion](../ecshape-motion/SKILL.md): its tokens, data-attribute vocabulary, RTL and
reduced-motion rules are law; this skill is the director's layer on top.

## 0. Before writing code — direct the scene
Write 5 lines in your head (or in the PR) before touching CSS:
1. **Beat**: what the visitor must *feel* at the end of this scroll (e.g. "this coach is locked in").
2. **Camera**: what moves — subject, frame, or viewer? Pick ONE primary motion; everything else supports it.
3. **Timeline** in scroll %: enter → build → impact → hold → release. The *hold* is what amateurs forget.
4. **Sound of it**: where is the "hit"? Put flash / camera punch / type landing on that single frame.
5. **Off-ramp**: what the static (reduced-motion, editor, no-JS) version shows — usually the impact frame.

## 1. Technique catalogue (pick by beat, not by novelty)
| Beat | Technique | Where in ECshape |
|---|---|---|
| A real body moves (arms cross, turn, lift) | **Image-sequence scrub on canvas** (Apple product-page) | `src/site/heroSequence.js` + `tools/make-hero-sequence.py` |
| Frame reveals the world | `clip-path: inset()` open from a card to full-bleed, image counter-scales | hero pin in `siteMotion.js` |
| Story told in chapters | pinned section, progress → state index (no free scrolling inside) | `#app` phone screens |
| Long proof (results, reviews) | horizontal pinned track, RTL moves **+x** | `.results__track` |
| Words carry the emotion | masked line rise (`data-split`), scrubbed word light-up (`data-words`), letter-spacing close + blur→sharp on impact | headings, hero caption |
| Energy / speed | velocity-reactive marquee + skew | `data-marquee` |
| Atmosphere | grain overlay (SVG turbulence), soft-light specular sweep, warm rim flare (screen blend) | `.hero__grain/.hero__sweep/.hero__flare` |
| Abstract brand background | seamless-loop WebGL2 shader (mesh/grain gradient, liquid metal) — single file, no three.js | new `src/site/shaders/*` |
| Product depth | real phone frame + screenshots > fake 3D; tilt with pointer only on fine pointers | `.phone` |

### Image-sequence scrub — the recipe that makes it look *real*
- **Film it** (it is a shoot, not a render): tripod-locked, same framing as the hero still, 50/60 fps, short shutter,
  even light, one slow deliberate move (2–3 s), then hold still 1 s, eyes in lens. Several takes. If the user only has
  photos, say so honestly — a crossfade between two stills is NOT "arms moving"; offer AI image-to-video (Runway,
  Kling, Veo) from the hero photo as a second-best, then run the same pipeline on that clip.
- `python3 tools/make-hero-sequence.py clip.mov --start .4 --end 3.1 --frames 120 --lock .82` → `public/site/seq/hero/`
  (`l/` 1600px desktop, `s/` 820px phone, WebP q≈74, `manifest.json`). Delete the folder = back to the still.
- Budget: 90–150 frames; ≤ 120 KB/frame desktop, ≤ 45 KB phone. Check total with the script's printout.
- Loading: frame 0 + last frame first, then every 8th/4th/2nd/rest (nearest loaded frame is drawn, so fast scrolls
  never blank). `decode()` raced against a 250 ms timeout (decode stalls in background tabs).
- Draw on `<canvas>`; mirror the framed `<img>` (size + transform via MutationObserver) so the existing hero
  choreography applies to the moving picture. The `<img>` stays as poster/fallback/LCP.
- The scrub is **linear** — the footage carries its own easing. Put easing on the camera and light, never the frames.
- Impact beat at `manifest.lock`: 35 ms camera punch (scale up, `power4.out`) → elastic settle; warm radial flare
  (screen blend) in 40 ms out 140 ms; grain breathes; caption lands *on the same frame*. Then a held beat (≈10% of the
  pin) before release. Phones (no pin): scrub while the card travels up the screen; flare via a CSS class at lock.

## 2. Quality bar (Awwwards jury lens: design · usability · creativity · content)
- **One hero idea, executed to the frame.** Cut any effect that doesn't serve the beat.
- **Typography does half the motion.** Display type huge (Karantina / Anton), tight leading, one accent line.
- **Contrast of tempo**: fast hits next to long holds. Uniform easing everywhere = boring.
- **Real assets**: real coach, real clients, real app screenshots. No stock, no AI faces of real people.
- **Performance is part of the art**: 60 fps on a mid Android. Animate only transform/opacity/clip-path/filter on
  small layers/CSS vars. Cap canvas/WebGL DPR at 2. Pause shaders off-screen and on `visibilitychange`.
- **Reduced motion / editor (`mode: 'edit'`)**: show the impact frame (the strongest still), no pins, no Lenis.
- **RTL first**: Hebrew is the default; directions flip (`DIR`), sweeps run the other way, logical CSS properties.
- **Content stays visible without JS**; hidden start states only via GSAP.

## 3. Anti-slop list (refuse these)
AI-beige gradients · purple-blue "SaaS glow" · italic serif display for a gym brand · eyebrow chips on every section ·
nested cards · glassmorphism on everything · confetti · parallax on every image · scroll-jacking that changes the
scroll *speed* · autoplay sound · cursor trails · fake 3D people · copying a template's layout/brand. Inspiration only:
take the *principle* (e.g. "pinned frame-open"), never the site.

## 4. Reference map (what to study each one for)
**Motion / cinematic**: Viktor Oddy threads drops (hero direction, prompt-to-site) · motionsites.ai (category taxonomy
of hero/3D/scroll prompts) · studio.motionsites.ai (template-as-base, AI restyles content/brand — same idea as our
Studio site editor + Agent EC) · scrollshaders.com (117 seamless-loop WebGL2 shaders, 4D-noise loops so last frame =
first, pause off-screen/hidden, DPR cap, still for reduced motion) · snapblocks.site (scroll/drag/hover React blocks:
crumple reveal, pleated strip, arc wave — study interaction taxonomy) · horizonx.so (parameter-tuned orbs, tunnel
sliders, ASCII/dither/riso textures) · scrolltide.co, jiro.build (section libraries — structure only) · Awwwards /
FWA SOTD · 404s.design (404 as a showcase) · Stageshow (Benji Taylor — staging product shots) · Open Design.
**Editorial / brand / launch**: recent.design (OG images, launch videos, scroll-text disintegration, shader page
transitions) · brandguidelines.net (Geist, IBM, Spotify guides → token discipline, logo systems) · deck.gallery
(pitch-deck hierarchy → programs / pricing clarity) · Solid Glass (material studies — use sparingly).
**Craft systems for agents**: impeccable.style (DESIGN.md / PRODUCT.md read before design work; named "tells" to
detect slop) · aiforui.dev (Emil Kowalski — precise visual vocabulary, slow-motion animation review) ·
github.com/MengTo/Skills (MIT: scroll-scrubbed image sequences, masked reveals, progressive blur, GSAP storytelling;
"video → super prompt").
**Galleries**: Land-book, Landdding, Godly, Minimal.Gallery, Refero (flows), Mobbin (mobile coaching chrome only —
the marketing site stays cinematic), high-end fitness/wellness brand sites for mood.

## 5. Workflow
1. Direct the scene (§0). 2. Find 2–3 references for the *principle*. 3. Prototype the timeline with placeholder
assets; scrub it slowly (DevTools → Animations at 10%) and fix every frame that looks wrong. 4. Real assets.
5. Mobile pass (no pins, shorter scenes). 6. Reduced-motion + editor pass. 7. Perf pass (Performance panel, 4×
CPU throttle; LCP stays the poster `<img>`). 8. Verify in the browser at 1440, 820, 390 widths in he/en/fr.

## 6. Launch surfaces
- OG image per page: 1200×630, the impact frame + one display line + logo, dark warm bg; generated at build.
- Launch video: screen-record the hero scroll at 60 fps (Lenis on), 6–10 s, cut on the impact beat.
- Programs / pricing: deck clarity — one idea per card, the price as the biggest number, a single primary CTA.
