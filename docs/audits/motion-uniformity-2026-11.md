# Motion uniformity audit — 2026-11

Scope: every animation in the portal (`Frontend/src`: trainer, trainee, studio, admin, chat, food bank, Agent EC) and
the public site + blog (`Frontend/src/site`, `styles/blog.css`). Spec: `.claude/skills/ecshape-motion` and
`.claude/skills/cinematic-web` (now extended with a **Motion tokens** section). Branch
`claude/audit-motion-uniformity-904492`, not pushed.

## Verdict

**Before: not uniform.** The site followed its own tokens. The portal had no duration tokens and ran on two
competing tempos.

| Measure (portal CSS, excluding loops) | Before | After |
|---|---|---|
| Distinct literal durations | 50 (.05s → 1.3s, in s and ms) | 0 outside stagger delays and 6 documented signature one-offs |
| Easing spellings | 27 (6 aliases of one curve, `--tr-ease` (.2,.7,.3,1) not in spec, `--ec-motion-spring` (.16,1,.3,1)…) | 4 tokens: `--ease-out`, `--ease-in`, `--ease-in-out`, `--ease-spring` |
| Keyframes | ~95, 47 of them near-duplicates (8 different "rise" distances: 4–30px) | shared `ec-fade/rise/pop/sheet-up/sheet-down/side-in/side-out/fade-out/bump/shimmer/pulse` + signature keyframes |
| Route transitions | 3 (CSS `.tr-route` 4px .2s + GSAP stagger on cards **at the same time**, legacy `.ec-page-enter` 380ms fade) | 1 (`.ec-route`: `ec-rise` .22s, CSS only) |
| Toast systems' entrance | 3 (radix: from top/bottom, out to the **right**; NotificationToast: from the **right** at `right-4`; sonner default) | radix + NotificationToast: from below, 4px, .22s, on the **end** edge (`end-4`). Sonner keeps its own (1 user) |
| Skeletons | 6 looks/timings (tailwind pulse 2s, 4 shimmers at 1–1.4s, an opacity flicker) | `.ec-skel` shimmer, `--dur-loop` 1.4s everywhere |
| Press scale | 8 values (.90–.985), 3 press durations | `--press-scale` .97 / `--press-scale-lg` .985, `--dur-press` .06s |
| Sheet / drawer / modal exits | food-bank drawer only; others vanished | all: distinct exit keyframe, `--dur-fast` + `--ease-in` |
| Live check: computed transitions on trainer dashboard, clients, client home, training, meals, chat, progress | n/a | **100%** on `--ease-out`; durations only .16 / .22 / .26 / .6s |

**Tempo decision:** the owner asked for calmer motion twice. QA #9: "the animations when changing buttons everywhere
is way too exaggerated". QA #29: the liquid effects should be there "but not exaggerated", in all portals. Only the
trainer shell had been changed. The calm profile (.16 / .22 / .26s, 4px, no overshoot) is now the portal default, so
the trainee portal, studio, food bank, chat and Agent EC lost their .45–.7s / 14–24px / spring motion. The public site
keeps its cinematic tempo (`--t-fast/med/slow` .25/.5/.9s), as the cinematic-web skill asks.

## What changed (commits)
1. `acc287f`: `styles/motion.css` (tokens, shared keyframes, reduced motion), `lib/motion.ts`, Tailwind
   `duration-*` / `ease-*` scale mapped onto the tokens (no `.tsx` class rewrites), and 225 portal declarations migrated.
2. `c4f89be`: 47 orphaned keyframes and 6 alias token sets removed; trainer "calm kit" overrides folded into the base
   rules (hover lift 1px, nudge 2px, stagger step); no hover lift on touch screens.
3. `dc9a944`: one route transition; GSAP removed from the portal (`usePortalMotion` deleted).
4. `742fa59`: dialog, sheet, select, tooltip and menus on the shared curves (`zoom-in-[.98]`, slow in / fast out);
   toasts RTL-safe; `.ec-skel` everywhere; `animate-pulse` on tokens.
5. `b4f7ecc`: JS smooth scrolls respect reduced motion.
6. `f53ab90`: public site, site editor and blog on `--t-*` (stagger delays kept literal).
7. `6f0cf7c`: exit keyframes. This fixed a real bug introduced in step 1: Radix only waits for an exit when the
   keyframe **name** changes, so the reversed entrance made the food-bank drawer vanish. Site transitions also get an
   explicit `--ease-out`.
8. `fe767a2`: ecshape-motion skill gets the token table, primitives and rules 8–14.
9. final: this report; SEO list stagger on `--stagger-step`.

## RTL / LTR (live, built-in browser, demo trainer + client)
- `--ec-dir` resolves to `-1` in Hebrew and `1` in English. `ec-side-in` starts at **+24px in LTR and −24px in RTL**,
  and also −24px for a portaled panel with its own `dir="rtl"` inside an LTR page (nearest-`[dir]` scoping).
  Replaced 5 pairs of hand-written `-rtl` keyframes.
- Toast viewport and NotificationToast container moved from `right` to `end`; their entrance has no x-component.
- `.ec-btn` arrow nudge now uses `--ec-dir` (was a separate `[dir=rtl]` override).
- Route change, dialog open (scrim `ec-fade` .22s + panel .26s) and close (`ec-fade-out` .16s, unmounts after) were
  checked in RTL. The same token surveys pass in LTR.

## prefers-reduced-motion
- Global rule (`motion.css`, confirmed loaded in the page's CSSOM): durations ~0, **iteration count 1** (before, loops
  such as shimmers, pings and spinners restarted every 0.001ms, i.e. flickered), delays 0, smooth scroll off. 30
  component rules still add `animation: none` where a final state matters.
- JS: the site (`siteMotion.js`) already drops Lenis, pins, scrubs and the loader. The portal no longer runs GSAP. Chat
  scroll, swipe-close and food bank already checked the setting. `agentOps` and `ExerciseBank` smooth scrolls now use
  `scrollBehavior()`.
- Limitation: the browser pane cannot emulate the OS setting, so this was verified from the loaded rules and code,
  not by toggling it.

## Remaining items
- **Layout properties still animated** (tokenised, not yet transforms): trainer sidebar `width`, Agent EC
  `[data-ec-shell]` margin, studio device `width`, `grid-template-rows` accordions, QA FAB `right`, `.tp-content`
  `padding-inline-start`, bar `width` fills. Moving them to `transform` / `clip-path` is a layout refactor; best done
  together with the ux-walkthrough session.
- **Signature one-offs** with their own timing (documented in the skill, rule 14): Agent EC travel / spotlight / edge
  peek, brand mark draw, rest-timer shrink, workout burst, AI "write" blur, site GSAP timelines.
- **Sonner** toaster (1 user) keeps its library animation. Consider dropping it for the radix toast.
- **Three toast APIs** (radix `use-toast` 19 files, NotificationContainer 26 calls, sonner) now *look* the same but
  remain three systems. Merging them is functional work.
- Nested rise: the route wrapper and the page's own `.tp-rise` items each rise 4px. It's subtle and acceptable, but a
  page could opt out.
- Focus rings: 2px `--ring` everywhere, but offsets vary (−2px to 3px) by component geometry, and `.ec-info-tip` uses
  `--primary` instead of `--ring` (same colour today).
- `src/App.css` (Vite starter, `logo-spin`) is not imported anywhere and can be deleted.
- `.floating` / `.pulse-slow` ambient utilities in `index.css` keep 3s loops (stopped by reduced motion).

## Inventory: portal, before → after (225 declarations)
| File | Selector | Kind | Before | After |
|---|---|---|---|---|
| index.css | `.ec-stagger > *` | animation | `ecRise .7s var(--ease-out) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| index.css | `.card-3d` | transition | `transform 0.3s ease` | `transform var(--dur-med) var(--ease-out)` |
| index.css | `.animate-fade-in-up` | animation | `fadeInUp 0.6s cubic-bezier(0.23, 1, 0.32, 1)` | `ec-rise var(--dur-med) var(--ease-out)` |
| index.css | `.card-hover` | transition | `transform .5s var(--ease-out), box-shadow .5s var(--ease-out), border-color .3s` | `transform var(--dur-med) var(--ease-out), box-shadow var(--dur-med) var(--ease-out), border-color var(--dur-fast) var(--ease-out)` |
| index.css | `.btn-3d` | transition | `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)` | `all var(--dur-fast) var(--ease-out)` |
| index.css | `.ec-btn--fill::before` | transition | `transform .6s var(--ease-out)` | `transform var(--dur-med) var(--ease-out)` |
| index.css | `.ec-card` | transition | `border-color .3s, box-shadow .5s var(--ease-out), transform .5s var(--ease-out)` | `border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-med) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| index.css | `.liquid-blob` | transition | `transform .38s cubic-bezier(.2, .7, .3, 1), width .32s cubic-bezier(.2, .7, .3, 1), height .32s cubic-bezier(.2, .7, .3, 1)` | `transform var(--dur-med) var(--ease-out), width var(--dur-med) var(--ease-out), height var(--dur-med) var(--ease-out)` |
| index.css | `.liquid-blob[data-stretch="x"]` | animation | `liquidX .38s cubic-bezier(.2, .7, .3, 1)` | `liquidX var(--dur-med) var(--ease-out)` |
| index.css | `.liquid-blob[data-stretch="y"]` | animation | `liquidY .38s cubic-bezier(.2, .7, .3, 1)` | `liquidY var(--dur-med) var(--ease-out)` |
| features/trainee/trainee.css | `.tp-press` | transition | `transform .45s var(--ease-spring), background-color .25s, color .25s, box-shadow .3s, opacity .25s` | `transform var(--dur-med) var(--ease-out), background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out)` |
| features/trainee/trainee.css | `.tp-input` | transition | `box-shadow .2s, background-color .2s` | `box-shadow var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out)` |
| features/trainee/trainee.css | `.tp-skel` | animation | `tpShimmer 1.4s ease-in-out infinite` | `tpShimmer var(--dur-loop) var(--ease-in-out) infinite` |
| features/trainee/trainee.css | `.tp-rise` | animation | `tpRise .6s var(--ease-out) backwards` | `ec-rise var(--dur-med) var(--ease-out) backwards` |
| features/trainee/trainee.css | `.tp-pop` | animation | `tpPop .5s var(--ease-spring) backwards` | `ec-pop var(--dur-med) var(--ease-out) backwards` |
| features/trainee/trainee.css | `.tp-screen` | animation | `tpScreen .42s var(--ease-out) backwards` | `ec-rise var(--dur-med) var(--ease-out) backwards` |
| features/trainee/trainee.css | `.tp-ring-value` | transition | `stroke-dashoffset 1.1s var(--ease-out)` | `stroke-dashoffset var(--dur-data) var(--ease-out)` |
| features/trainee/trainee.css | `.tp-bar > span` | transition | `width .9s var(--ease-out)` | `width var(--dur-data) var(--ease-out)` |
| features/trainee/trainee.css | `.tp-check[data-done="true"] svg` | animation | `tpPop .45s var(--ease-spring) both` | `ec-bump var(--dur-slow) var(--ease-spring) both` |
| features/trainee/trainee.css | `.tp-tab .tp-tab-ico` | transition | `background-color .3s, color .3s, transform .45s var(--ease-spring)` | `background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| features/trainee/trainee.css | `.tp-rest` | animation | `tpRise .4s var(--ease-out) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| features/trainee/trainee.css | `.tp-celebrate` | animation | `tpFade .35s ease both` | `ec-fade var(--dur-med) var(--ease-out) both` |
| features/trainee/trainee.css | `.tp-sheet-overlay[data-state="open"]` | animation | `tpFade .25s ease both` | `ec-fade var(--dur-med) var(--ease-out) both` |
| features/trainee/trainee.css | `.tp-sheet[data-state="open"]` | animation | `tpSheetUp .45s var(--ease-out) both` | `ec-sheet-up var(--dur-slow) var(--ease-out) both` |
| features/trainee/trainee.css | `.tp-sheet[data-state="open"]` | animation | `tpSheetIn .35s var(--ease-out) both` | `tpSheetIn var(--dur-slow) var(--ease-out) both` |
| features/trainee/trainee.css | `.tp-shell .tp-content` | transition | `padding-inline-start var(--tr-med, .3s) var(--tr-ease, ease)` | `padding-inline-start var(--dur-slow) var(--ease-out)` |
| features/trainee/trainee.css | `.fav-heart` | animation | `favHeart .34s cubic-bezier(.22, 1, .36, 1) both` | `ec-bump var(--dur-slow) var(--ease-spring) both` |
| features/trainee/trainee.css | `.fav-pop` | animation | `favPop .32s cubic-bezier(.22, 1, .36, 1) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| features/trainee/trainee.css | `.tp-pop-in` | animation | `tpPop .45s var(--ease-spring) both` | `ec-bump var(--dur-slow) var(--ease-spring) both` |
| features/trainee/trainee.css | `.tp-range::-webkit-slider-thumb` | transition | `transform .2s var(--ease-spring, ease)` | `transform var(--dur-fast) var(--ease-out)` |
| features/trainee/trainee.css | `.tp-press:active` | :active | `transform: scale(.965); transition-duration: .08s;` | `transform: scale(var(--press-scale)); transition-duration: var(--dur-press);` |
| features/trainee/training/training.css | `.bm-region` | transition | `fill-opacity .35s` | `fill-opacity var(--dur-med) var(--ease-out)` |
| features/trainee/training/training.css | `.bm-anim` | animation | `bmIn .7s var(--ease-out, ease-out) both` | `bmIn var(--dur-data) var(--ease-out) both` |
| features/trainee/training/training.css | `.tr-setno` | transition | `background-color .2s, box-shadow .2s, color .2s, transform .15s` | `background-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)` |
| features/trainee/training/training.css | `.tr-setno[data-done="true"] svg` | animation | `tpPop .45s var(--ease-spring) both` | `ec-bump var(--dur-slow) var(--ease-spring) both` |
| features/trainee/training/training.css | `.tr-cell` | transition | `background-color .2s, box-shadow .2s` | `background-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)` |
| features/trainee/training/training.css | `.tr-slide-next` | animation | `trSlideUp .38s var(--ease-out, ease-out) both` | `trSlideUp var(--dur-med) var(--ease-out) both` |
| features/trainee/training/training.css | `.tr-slide-prev` | animation | `trSlideDown .38s var(--ease-out, ease-out) both` | `trSlideDown var(--dur-med) var(--ease-out) both` |
| features/trainee/training/training.css | `.tr-rest-overlay` | animation | `tpFade .3s ease both` | `ec-fade var(--dur-med) var(--ease-out) both` |
| features/trainee/training/training.css | `.tt-rest-mini` | animation | `ttRestShrink .42s cubic-bezier(.22, 1, .36, 1) both` | `ttRestShrink var(--dur-slow) var(--ease-out) both` |
| features/trainer/trainer.css | `.tr-side` | transition | `width .24s var(--tr-ease)` | `width var(--dur-slow) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-hide-rail` | transition | `opacity .16s` | `opacity var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-nav-link` | transition | `color var(--tr-fast), background-color var(--tr-fast), transform var(--tr-fast) var(--tr-ease)` | `color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-blob` | transition | `transform var(--tr-med) var(--tr-ease), height var(--tr-med) var(--tr-ease), width var(--tr-med) var(--tr-ease), opacity var(--tr-fast)` | `transform var(--dur-med) var(--ease-out), height var(--dur-med) var(--ease-out), width var(--dur-med) var(--ease-out), opacity var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-hblob` | transition | `transform var(--tr-med) var(--tr-ease), width var(--tr-med) var(--tr-ease), height var(--tr-med) var(--tr-ease), opacity var(--tr-fast)` | `transform var(--dur-med) var(--ease-out), width var(--dur-med) var(--ease-out), height var(--dur-med) var(--ease-out), opacity var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-route` | animation | `trRoute .2s var(--tr-ease) backwards` | `ec-rise var(--dur-med) var(--ease-out) backwards` |
| features/trainer/trainer.css | `.tr-tab` | transition | `color var(--tr-fast), transform var(--tr-fast) var(--tr-ease)` | `color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-more-scrim` | transition | `opacity .2s` | `opacity var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-more-panel` | transition | `transform .26s var(--tr-ease)` | `transform var(--dur-med) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-more[data-open="true"] .tr-more-item` | animation | `trSoftIn .2s var(--tr-ease) backwards` | `ec-rise var(--dur-med) var(--ease-out) backwards` |
| features/trainer/trainer.css | `.tr-back svg` | transition | `transform var(--tr-fast) var(--tr-ease)` | `transform var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-lift` | transition | `transform var(--tr-med) var(--tr-ease), box-shadow var(--tr-med) var(--tr-ease)` | `transform var(--dur-med) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-spot::before` | transition | `opacity var(--tr-med)` | `opacity var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-bars > span` | animation | `trGrow .3s var(--tr-ease) both` | `trGrow var(--dur-data) var(--ease-out) both` |
| features/trainer/trainer.css | `.tr-seg-btn` | transition | `color var(--tr-fast)` | `color var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-tabpanel` | animation | `trSoftIn .2s var(--tr-ease) backwards` | `ec-rise var(--dur-med) var(--ease-out) backwards` |
| features/trainer/trainer.css | `.tr-draw` | animation | `trDraw .6s var(--tr-ease) .05s forwards` | `trDraw var(--dur-data) var(--ease-out) .05s forwards` |
| features/trainer/trainer.css | `.tr-fade-in` | animation | `tpFade .3s ease .2s both` | `ec-fade var(--dur-med) var(--ease-out) .2s both` |
| features/trainer/trainer.css | `.tr-day` | transition | `background-color var(--tr-fast), box-shadow var(--tr-fast), transform var(--tr-fast) var(--tr-ease)` | `background-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-ex-enter` | animation | `trExIn .22s var(--tr-ease) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| features/trainer/trainer.css | `.tr-picker-scrim` | animation | `tpFade .18s ease both` | `ec-fade var(--dur-med) var(--ease-out) both` |
| features/trainer/trainer.css | `.tr-picker-panel` | animation | `tpSheetUp .26s var(--tr-ease) both` | `ec-sheet-up var(--dur-slow) var(--ease-out) both` |
| features/trainer/trainer.css | `.tr-picker-panel` | animation | `trPop .2s var(--tr-ease) both` | `ec-pop var(--dur-med) var(--ease-out) both` |
| features/trainer/trainer.css | `.tr-pick` | transition | `transform var(--tr-med) var(--tr-ease), box-shadow var(--tr-fast)` | `transform var(--dur-med) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-pick-add` | transition | `background-color var(--tr-fast), color var(--tr-fast)` | `background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-banner` | animation | `trSoftIn .2s var(--tr-ease) backwards` | `ec-rise var(--dur-med) var(--ease-out) backwards` |
| features/trainer/trainer.css | `.tr-food` | transition | `background-color var(--tr-fast), transform var(--tr-fast) var(--tr-ease)` | `background-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-food-check` | transition | `background-color var(--tr-fast), box-shadow var(--tr-fast)` | `background-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-tag` | animation | `trSoftIn .18s var(--tr-ease) backwards` | `ec-rise var(--dur-med) var(--ease-out) backwards` |
| features/trainer/trainer.css | `.tr-ci-day` | transition | `background-color var(--tr-fast), transform var(--tr-fast) var(--tr-ease)` | `background-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-root .tp-press` | transition | `transform var(--tr-fast) var(--tr-ease), background-color var(--tr-fast), color var(--tr-fast), box-shadow var(--tr-fast), opacity var(--tr-fast)` | `transform var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-root .tp-rise` | animation | `trSoftIn .24s var(--tr-ease) backwards` | `ec-rise var(--dur-med) var(--ease-out) backwards` |
| features/trainer/trainer.css | `.tr-root .tp-pop` | animation | `trSoftIn .2s var(--tr-ease) backwards` | `ec-rise var(--dur-med) var(--ease-out) backwards` |
| features/trainer/trainer.css | `.tr-root .tp-screen` | animation | `trSoftIn .2s var(--tr-ease) backwards` | `ec-rise var(--dur-med) var(--ease-out) backwards` |
| features/trainer/trainer.css | `.tr-root .ec-stagger > *` | animation | `trSoftIn .24s var(--tr-ease) backwards` | `ec-rise var(--dur-med) var(--ease-out) backwards` |
| features/trainer/trainer.css | `.tr-root .ec-btn--fill::before` | transition | `transform .26s var(--tr-ease)` | `transform var(--dur-med) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-root .card-hover` | transition | `transform var(--tr-med) var(--tr-ease), box-shadow var(--tr-med) var(--tr-ease), border-color var(--tr-fast)` | `transform var(--dur-med) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-root .ec-card` | transition | `border-color var(--tr-fast), box-shadow var(--tr-med) var(--tr-ease), transform var(--tr-med) var(--tr-ease)` | `border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-root .liquid-blob` | transition | `transform var(--tr-med) var(--tr-ease), width var(--tr-med) var(--tr-ease), height var(--tr-med) var(--tr-ease)` | `transform var(--dur-med) var(--ease-out), width var(--dur-med) var(--ease-out), height var(--dur-med) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-sbox, .tr-filter` | transition | `box-shadow var(--tr-fast)` | `box-shadow var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-chip` | transition | `background-color var(--tr-fast), color var(--tr-fast)` | `background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-card-ibtn` | transition | `transform var(--tr-fast) var(--tr-ease), background-color var(--tr-fast)` | `transform var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-xs-overlay[data-state="open"]` | animation | `tpFade .2s ease both` | `ec-fade var(--dur-med) var(--ease-out) both` |
| features/trainer/trainer.css | `.tr-xs-panel[data-state="open"]` | animation | `trXsUp .24s var(--tr-ease) both` | `ec-sheet-up var(--dur-slow) var(--ease-out) both` |
| features/trainer/trainer.css | `-blob[data-phase="stretch"], .tr-hblob[data-phase="stretch"]` | transition | `transform .14s cubic-bezier(.4, 0, .2, 1), height .14s cubic-bezier(.4, 0, .2, 1), width .14s cubic-bezier(.4, 0, .2, 1)` | `transform var(--dur-fast) var(--ease-out), height var(--dur-fast) var(--ease-out), width var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `tr-blob[data-phase="settle"], .tr-hblob[data-phase="settle"]` | transition | `transform .26s var(--tr-ease), height .26s var(--tr-ease), width .26s var(--tr-ease), opacity var(--tr-fast)` | `transform var(--dur-med) var(--ease-out), height var(--dur-med) var(--ease-out), width var(--dur-med) var(--ease-out), opacity var(--dur-fast) var(--ease-out)` |
| features/trainer/trainer.css | `.tr-nav-link:active` | :active | `transform: scale(.98); transition-duration: .06s;` | `transform: scale(var(--press-scale-lg)); transition-duration: var(--dur-press);` |
| features/trainer/trainer.css | `.tr-tab:active` | :active | `transform: scale(.97); transition-duration: .06s;` | `transform: scale(var(--press-scale)); transition-duration: var(--dur-press);` |
| features/trainer/trainer.css | `.tr-day:active` | :active | `transform: scale(.98);` | `transform: scale(var(--press-scale-lg));` |
| features/trainer/trainer.css | `.tr-pick:active` | :active | `transform: scale(.985); transition-duration: .06s;` | `transform: scale(var(--press-scale-lg)); transition-duration: var(--dur-press);` |
| features/trainer/trainer.css | `.tr-food:active` | :active | `transform: scale(.985);` | `transform: scale(var(--press-scale-lg));` |
| features/trainer/trainer.css | `.tr-ci-day[data-on]:active` | :active | `transform: scale(.95);` | `transform: scale(var(--press-scale));` |
| features/trainer/trainer.css | `.tr-root .tp-press:active` | :active | `transform: scale(.98); transition-duration: .06s;` | `transform: scale(var(--press-scale-lg)); transition-duration: var(--dur-press);` |
| features/trainer/trainer.css | `.tr-card-ibtn:active` | :active | `transform: scale(.95);` | `transform: scale(var(--press-scale));` |
| styles/portal-chrome.css | `.ec-page-enter` | animation | `ecPortalFadeIn 380ms var(--ec-motion-spring, cubic-bezier(0.16, 1, 0.3, 1)) both` | `ec-fade var(--dur-med) var(--ease-out) both` |
| styles/portal-chrome.css | `.ec-psk-panel` | transition | `width 280ms cubic-bezier(0.16, 1, 0.3, 1)` | `width var(--dur-slow) var(--ease-out)` |
| styles/portal-chrome.css | `.ec-site-studio-device` | transition | `width 320ms cubic-bezier(0.16, 1, 0.3, 1)` | `width var(--dur-slow) var(--ease-out)` |
| styles/my-site.css | `.ec-ms-thumb-cta` | transition | `opacity .35s var(--ec-motion-spring, ease)` | `opacity var(--dur-med) var(--ease-out)` |
| styles/my-site.css | `.ec-ms-seg button` | transition | `color .2s, background-color .25s` | `color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out)` |
| styles/my-site.css | `.ec-ms-seclist li` | transition | `background-color .2s` | `background-color var(--dur-fast) var(--ease-out)` |
| styles/my-site.css | `.ec-ms-seclist li` | animation | `ecMsRise .5s var(--ec-motion-spring, ease) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/my-site.css | `.ec-ms-icon` | transition | `background-color .2s, color .2s, transform .15s` | `background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)` |
| styles/my-site.css | `.ec-ms-studio` | animation | `ecMsIn .38s var(--ec-motion-spring, ease) both` | `ec-pop var(--dur-med) var(--ease-out) both` |
| styles/my-site.css | `.ec-ms-exit` | transition | `background-color .2s` | `background-color var(--dur-fast) var(--ease-out)` |
| styles/my-site.css | `.ec-ms-agent` | transition | `background-color .2s` | `background-color var(--dur-fast) var(--ease-out)` |
| styles/my-site.css | `.ec-ms-tree li` | transition | `background-color .2s` | `background-color var(--dur-fast) var(--ease-out)` |
| styles/my-site.css | `.ec-ms-tree-tools` | transition | `opacity .2s` | `opacity var(--dur-fast) var(--ease-out)` |
| styles/my-site.css | `.ec-ms-device` | transition | `width .45s var(--ec-motion-spring, ease)` | `width var(--dur-slow) var(--ease-out)` |
| styles/my-site.css | `.ec-ms-body` | transition | `grid-template-columns .4s var(--ec-motion-spring, ease)` | `grid-template-columns var(--dur-slow) var(--ease-out)` |
| styles/my-site.css | `.ec-studio-inspector-inner` | animation | `ecMsSide .32s var(--ec-motion-spring, ease) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/my-site.css | `.ec-studio-input` | transition | `border-color .2s, box-shadow .2s` | `border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)` |
| styles/my-site.css | `.ec-studio-btn` | transition | `background-color .2s, color .2s, transform .15s` | `background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)` |
| styles/my-site.css | `.ec-studio-card` | transition | `border-color .2s` | `border-color var(--dur-fast) var(--ease-out)` |
| styles/my-site.css | `.ec-studio-chev` | transition | `transform .3s var(--ec-motion-spring, ease)` | `transform var(--dur-med) var(--ease-out)` |
| styles/my-site.css | `.ec-studio-collapse` | transition | `grid-template-rows .32s var(--ec-motion-spring, ease)` | `grid-template-rows var(--dur-slow) var(--ease-out)` |
| styles/my-site.css | `.ec-studio-add` | transition | `border-color .2s, color .2s` | `border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)` |
| styles/my-site.css | `.ec-studio-photo-frame img` | animation | `ecMsFade .4s ease both` | `ec-fade var(--dur-med) var(--ease-out) both` |
| styles/my-site.css | `.ec-ms-inspector` | transition | `transform .4s var(--ec-motion-spring, ease)` | `transform var(--dur-med) var(--ease-out)` |
| styles/my-site.css | `.ec-ms-icon:active:not(:disabled)` | :active | `transform: scale(.94);` | `transform: scale(var(--press-scale));` |
| styles/my-site.css | `.ec-studio-btn:active:not(:disabled)` | :active | `transform: scale(.97);` | `transform: scale(var(--press-scale));` |
| styles/qa-capture.css | `ec-psk-open:not([dir="rtl"]) .ec-qa-fab-stack:not(.is-moved)` | transition | `right 0.45s cubic-bezier(0.22, 1, 0.36, 1)` | `right var(--dur-slow) var(--ease-out)` |
| styles/qa-capture.css | `.ec-qa-sheet-backdrop` | animation | `ec-qa-fade .25s ease both` | `ec-fade var(--dur-med) var(--ease-out) both` |
| styles/qa-capture.css | `.ec-qa-sheet` | animation | `ec-qa-sheet-in .5s cubic-bezier(.22,1,.36,1) both` | `ec-side-in var(--dur-slow) var(--ease-out) both` |
| styles/qa-capture.css | `.ec-qa-bulk` | animation | `ec-qa-bulk-in .4s cubic-bezier(.22,1,.36,1) both` | `ec-qa-bulk-in var(--dur-med) var(--ease-out) both` |
| styles/qa-capture.css | `.ec-qa-prio-btn` | transition | `all .25s` | `all var(--dur-med) var(--ease-out)` |
| styles/qa-capture.css | `.ec-qa-pick-box` | transition | `top 0.12s ease, left 0.12s ease, width 0.12s ease, height 0.12s ease` | `top var(--dur-fast) var(--ease-out), left var(--dur-fast) var(--ease-out), width var(--dur-fast) var(--ease-out), height var(--dur-fast) var(--ease-out)` |
| styles/agent-ec.css | `html.ec-psk-open [data-ec-shell]` | transition | `margin .45s cubic-bezier(.22,1,.36,1)` | `margin var(--dur-slow) var(--ease-out)` |
| styles/agent-ec.css | `[data-ec-shell]` | transition | `margin .45s cubic-bezier(.22,1,.36,1)` | `margin var(--dur-slow) var(--ease-out)` |
| styles/agent-ec.css | `.ec-psk-edge` | transition | `transform 420ms cubic-bezier(.22,1,.36,1), box-shadow 420ms cubic-bezier(.22,1,.36,1)` | `transform var(--dur-med) var(--ease-out), box-shadow var(--dur-med) var(--ease-out)` |
| styles/agent-ec.css | `.ec-psk-swipe.is-on ~ .ec-psk-edge` | transition | `opacity 120ms ease` | `opacity var(--dur-fast) var(--ease-out)` |
| styles/agent-ec.css | `.ec-psk-swipe.is-settling .ec-psk-swipe-panel` | transition | `transform 220ms cubic-bezier(.22,1,.36,1)` | `transform var(--dur-med) var(--ease-out)` |
| styles/agent-ec.css | `.ec-psk-swipe.is-settling .ec-psk-swipe-dim` | transition | `opacity 220ms ease-out` | `opacity var(--dur-fast) var(--ease-out)` |
| styles/agent-ec.css | `.ec-psk` | animation | `ec-psk-in .55s cubic-bezier(.22,1,.36,1) both` | `ec-side-in var(--dur-slow) var(--ease-out) both` |
| styles/agent-ec.css | `.ec-psk-resize::after` | transition | `opacity .3s` | `opacity var(--dur-fast) var(--ease-out)` |
| styles/agent-ec.css | `.ec-psk-iconbtn` | transition | `background .25s, color .25s, transform .35s cubic-bezier(.34,1.56,.64,1)` | `background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| styles/agent-ec.css | `.ec-psk-msg` | animation | `ec-psk-msg .45s cubic-bezier(.22,1,.36,1) both` | `ec-pop var(--dur-med) var(--ease-out) both` |
| styles/agent-ec.css | `.ec-psk-rec` | transition | `border-color .3s, background .3s, transform .4s cubic-bezier(.22,1,.36,1)` | `border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| styles/agent-ec.css | `.ec-psk-suggest button` | transition | `border-color .3s, background .3s, transform .4s cubic-bezier(.22,1,.36,1)` | `border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| styles/agent-ec.css | `.ec-psk-op-btn` | transition | `transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s` | `transform var(--dur-med) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)` |
| styles/agent-ec.css | `.ec-psk-op-card` | animation | `ec-psk-msg .45s cubic-bezier(.22,1,.36,1) both` | `ec-pop var(--dur-med) var(--ease-out) both` |
| styles/agent-ec.css | `.ec-psk-op-confirm, .ec-psk-op-cancel` | transition | `transform .2s` | `transform var(--dur-fast) var(--ease-out)` |
| styles/agent-ec.css | `.ec-psk-input textarea` | transition | `border-color .3s, box-shadow .3s` | `border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)` |
| styles/agent-ec.css | `.ec-psk-send` | transition | `transform .35s cubic-bezier(.34,1.56,.64,1), opacity .2s` | `transform var(--dur-med) var(--ease-out), opacity var(--dur-fast) var(--ease-out)` |
| styles/agent-ec.css | `.ec-key-row` | transition | `transform .45s cubic-bezier(.22,1,.36,1), border-color .3s, background .3s` | `transform var(--dur-med) var(--ease-out), border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)` |
| styles/agent-ec.css | `.ec-key-form` | animation | `ec-key-form-in .55s cubic-bezier(.22,1,.36,1) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/agent-ec.css | `.ec-pmark` | transition | `transform .5s cubic-bezier(.22,1,.36,1)` | `transform var(--dur-med) var(--ease-out)` |
| styles/agent-ec.css | `.ec-psk-op-confirm:active, .ec-psk-op-cancel:active` | :active | `transform: scale(.96);` | `transform: scale(var(--press-scale));` |
| styles/exercises.css | `.ec-exdemo img` | transition | `opacity .35s ease` | `opacity var(--dur-med) var(--ease-out)` |
| styles/exercises.css | `.ec-exdemo-live` | transition | `opacity .3s` | `opacity var(--dur-fast) var(--ease-out)` |
| styles/exercises.css | `.ec-excard` | animation | `ec-excard-in .6s cubic-bezier(.22,1,.36,1) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/exercises.css | `.ec-exlib-detail` | animation | `ec-fade-in .3s ease both` | `ec-fade var(--dur-med) var(--ease-out) both` |
| styles/exercises.css | `.ec-exlib-sheet` | animation | `ec-sheet-in .55s cubic-bezier(.22,1,.36,1) both` | `ec-side-in var(--dur-slow) var(--ease-out) both` |
| styles/info-tip.css | `.ec-info-tip` | transition | `color .2s, background-color .2s` | `color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out)` |
| styles/info-tip.css | `.ec-info-bubble` | animation | `ec-info-in .16s ease-out both` | `ec-info-in var(--dur-fast) var(--ease-out) both` |
| styles/info-tip.css | `.ec-login-photo` | transition | `opacity .3s ease, transform .6s cubic-bezier(.22,1,.36,1)` | `opacity var(--dur-fast) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| styles/agent-draft.css | `.ec-draft-btn` | transition | `transform .3s cubic-bezier(.22,1,.36,1), border-color .3s, box-shadow .3s` | `transform var(--dur-med) var(--ease-out), border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)` |
| styles/agent-draft.css | `.ec-draft-shimmer` | animation | `ec-draft-shimmer 1.3s linear infinite` | `ec-draft-shimmer var(--dur-loop) var(--ease-in-out) infinite` |
| styles/agent-draft.css | `.ec-draft-bar` | animation | `ec-draft-in .35s cubic-bezier(.22,1,.36,1) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-seo-head` | animation | `ec-sx-rise 620ms var(--sx-ease) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-seo-tabs` | animation | `ec-sx-rise 620ms 80ms var(--sx-ease) both` | `ec-rise var(--dur-med) var(--ease-out) 80ms both` |
| styles/seo-studio.css | `.ec-seo-tabs button` | transition | `color 240ms var(--sx-ease), background 320ms var(--sx-ease), transform 320ms var(--sx-spring)` | `color var(--dur-fast) var(--ease-out), background var(--dur-med) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| styles/seo-studio.css | `.ec-seo-panel` | animation | `ec-sx-swap 480ms var(--sx-ease) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-seo-card` | animation | `ec-sx-rise 560ms var(--sx-ease) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-seo-kpi` | animation | `ec-sx-rise 560ms var(--sx-ease) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-seo-kpi` | transition | `transform 420ms var(--sx-spring), border-color 240ms` | `transform var(--dur-med) var(--ease-out), border-color var(--dur-fast) var(--ease-out)` |
| styles/seo-studio.css | `.ec-seo-list button` | transition | `background 220ms var(--sx-ease)` | `background var(--dur-fast) var(--ease-out)` |
| styles/seo-studio.css | `.ec-seo-list button > svg` | transition | `opacity 200ms, transform 300ms var(--sx-ease)` | `opacity var(--dur-fast) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| styles/seo-studio.css | `.ec-seo-seg button` | transition | `background 260ms var(--sx-ease), color 200ms` | `background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)` |
| styles/seo-studio.css | `.ec-seo-rows li` | animation | `ec-sx-rise 480ms calc(var(--i, 0) * 40ms) var(--sx-ease) both` | `ec-rise var(--dur-med) var(--ease-out) calc(var(--i, 0) * 40ms) both` |
| styles/seo-studio.css | `.ec-seo-rows li > button` | transition | `background 220ms var(--sx-ease), border-color 220ms, transform 360ms var(--sx-spring)` | `background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| styles/seo-studio.css | `.ec-seo-row-view` | transition | `background 200ms, color 200ms` | `background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)` |
| styles/seo-studio.css | `.ec-seo-page-list ul button` | transition | `background 220ms, border-color 220ms` | `background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)` |
| styles/seo-studio.css | `.ec-seo-redirects li` | animation | `ec-sx-rise 420ms var(--sx-ease) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-rm-score-arc` | transition | `stroke-dashoffset 900ms var(--sx-ease), stroke 300ms` | `stroke-dashoffset var(--dur-data) var(--ease-out), stroke var(--dur-fast) var(--ease-out)` |
| styles/seo-studio.css | `.ec-rm-tabs button` | transition | `color 200ms` | `color var(--dur-fast) var(--ease-out)` |
| styles/seo-studio.css | `.ec-rm-tabs button::after` | transition | `transform 380ms var(--sx-spring)` | `transform var(--dur-med) var(--ease-out)` |
| styles/seo-studio.css | `.ec-rm-body` | animation | `ec-sx-swap 360ms var(--sx-ease) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-rm-counter` | transition | `color 200ms` | `color var(--dur-fast) var(--ease-out)` |
| styles/seo-studio.css | `.ec-rm-snippet` | transition | `max-width 420ms var(--sx-ease)` | `max-width var(--dur-slow) var(--ease-out)` |
| styles/seo-studio.css | `.ec-rm-chev` | transition | `transform 320ms var(--sx-ease)` | `transform var(--dur-med) var(--ease-out)` |
| styles/seo-studio.css | `.ec-rm-group-body` | transition | `grid-template-rows 420ms var(--sx-ease)` | `grid-template-rows var(--dur-slow) var(--ease-out)` |
| styles/seo-studio.css | `.ec-rm-faq` | animation | `ec-sx-rise 360ms var(--sx-ease) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-rm-icon` | transition | `background 200ms, color 200ms` | `background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)` |
| styles/seo-studio.css | `.ec-rm-add` | transition | `border-color 200ms, color 200ms` | `border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)` |
| styles/seo-studio.css | `.ec-wp-bar` | animation | `ec-sx-rise 480ms var(--sx-ease) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-wp-back` | transition | `background 200ms` | `background var(--dur-fast) var(--ease-out)` |
| styles/seo-studio.css | `.ec-wp-live-actions` | animation | `ec-sx-rise 420ms var(--sx-ease) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-wp-main` | animation | `ec-sx-rise 560ms var(--sx-ease) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-wp-tool` | transition | `background 180ms, transform 280ms var(--sx-spring)` | `background var(--dur-fast) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| styles/seo-studio.css | `.ec-wp-side` | animation | `ec-sx-side 560ms 80ms var(--sx-ease) both` | `ec-side-in var(--dur-slow) var(--ease-out) 80ms both` |
| styles/seo-studio.css | `.ec-ai-brief` | animation | `ec-sx-pop 620ms var(--sx-spring) both` | `ec-pop var(--dur-med) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-ai-lengths button` | transition | `border-color 220ms, background 220ms, transform 320ms var(--sx-spring)` | `border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| styles/seo-studio.css | `.ec-ai-live-steps` | animation | `ec-sx-side 520ms var(--sx-ease) both` | `ec-side-in var(--dur-slow) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-ai-live-steps li` | transition | `color 300ms` | `color var(--dur-fast) var(--ease-out)` |
| styles/seo-studio.css | `.ec-ai-live-steps li::before` | transition | `background 300ms, border-color 300ms, color 300ms` | `background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)` |
| styles/seo-studio.css | `.ec-ai-live-page` | animation | `ec-sx-pop 560ms var(--sx-ease) both` | `ec-pop var(--dur-med) var(--ease-out) both` |
| styles/seo-studio.css | `.ec-ai-skel` | animation | `ec-sx-skel 1.4s ease-in-out infinite` | `ec-sx-skel var(--dur-loop) var(--ease-in-out) infinite` |
| styles/seo-studio.css | `.ec-seo-tabs button:active` | :active | `transform: scale(0.96);` | `transform: scale(var(--press-scale));` |
| styles/seo-studio.css | `.ec-wp-tool:active:not(:disabled)` | :active | `transform: scale(0.9);` | `transform: scale(var(--press-scale));` |
| components/chat/chat.css | `.ec-chat-in` | animation | `ecChatIn .38s var(--ease-out) both` | `ecChatIn var(--dur-med) var(--ease-out) both` |
| components/chat/chat.css | `.ec-chat-screen` | animation | `ecChatScreen .42s var(--ease-out) both` | `ecChatScreen var(--dur-med) var(--ease-out) both` |
| components/chat/chat.css | `.ec-chat-fade` | animation | `ecChatFade .5s var(--ease-out) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| components/chat/chat.css | `.ec-chat-list > *` | animation | `ecChatFade .45s var(--ease-out) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| components/chat/chat.css | `.ec-chat-pop` | animation | `ecChatPop .34s var(--ease-spring) both` | `ec-pop var(--dur-med) var(--ease-out) both` |
| components/chat/chat.css | `.ec-chat-shimmer` | animation | `ecChatShimmer 1s ease-in-out infinite alternate` | `ecChatShimmer var(--dur-loop) var(--ease-in-out) infinite alternate` |
| components/foodbank/foodbank.css | `.fb-reveal` | animation | `fb-rise .7s var(--fb-ease-out) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| components/foodbank/foodbank.css | `.fb-seg__ind` | transition | `transform .45s var(--fb-ease-out), width .45s var(--fb-ease-out)` | `transform var(--dur-med) var(--ease-out), width var(--dur-med) var(--ease-out)` |
| components/foodbank/foodbank.css | `.fb-seg__btn` | transition | `color .25s var(--fb-ease-out)` | `color var(--dur-fast) var(--ease-out)` |
| components/foodbank/foodbank.css | `.fb-chip` | transition | `background-color .25s var(--fb-ease-out), color .25s var(--fb-ease-out), border-color .25s var(--fb-ease-out), transform .25s var(--fb-ease-out)` | `background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| components/foodbank/foodbank.css | `.fb-chip[aria-pressed='true'] .fb-chip__icon` | animation | `fb-pop .35s var(--fb-ease-spring)` | `ec-bump var(--dur-slow) var(--ease-spring)` |
| components/foodbank/foodbank.css | `.fb-card` | animation | `fb-rise .6s var(--fb-ease-out) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| components/foodbank/foodbank.css | `.fb-card` | transition | `transform .45s var(--fb-ease-out), box-shadow .45s var(--fb-ease-out), border-color .45s var(--fb-ease-out)` | `transform var(--dur-med) var(--ease-out), box-shadow var(--dur-med) var(--ease-out), border-color var(--dur-med) var(--ease-out)` |
| components/foodbank/foodbank.css | `.fb-photo img` | transition | `opacity .6s var(--fb-ease-out), transform .9s var(--fb-ease-out)` | `opacity var(--dur-med) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| components/foodbank/foodbank.css | `.fb-photo__fallback svg` | transition | `transform .6s var(--fb-ease-out)` | `transform var(--dur-med) var(--ease-out)` |
| components/foodbank/foodbank.css | `.fb-actions` | transition | `opacity .3s var(--fb-ease-out), transform .3s var(--fb-ease-out)` | `opacity var(--dur-fast) var(--ease-out), transform var(--dur-med) var(--ease-out)` |
| components/foodbank/foodbank.css | `.fb-split > span` | animation | `fb-grow .9s var(--fb-ease-out) both` | `fb-grow var(--dur-data) var(--ease-out) both` |
| components/foodbank/foodbank.css | `.fb-skel::after` | animation | `fb-shimmer 1.4s ease-in-out infinite` | `fb-shimmer var(--dur-loop) var(--ease-in-out) infinite` |
| components/foodbank/foodbank.css | `.fb-overlay[data-state='open']` | animation | `fb-fade .3s var(--fb-ease-out) both` | `ec-fade var(--dur-med) var(--ease-out) both` |
| components/foodbank/foodbank.css | `.fb-overlay[data-state='closed']` | animation | `fb-fade .2s ease-in reverse both` | `ec-fade var(--dur-fast) var(--ease-in) reverse both` |
| components/foodbank/foodbank.css | `.fb-drawer[data-state='open']` | animation | `fb-drawer-in .55s var(--fb-ease-out) both` | `ec-side-in var(--dur-slow) var(--ease-out) both` |
| components/foodbank/foodbank.css | `.fb-drawer[data-state='closed']` | animation | `fb-drawer-out .3s cubic-bezier(.4, 0, 1, 1) both` | `ec-side-in var(--dur-fast) var(--ease-in) reverse both` |
| components/foodbank/foodbank.css | `.fb-lib-card` | animation | `fb-rise .5s var(--fb-ease-out) both` | `ec-rise var(--dur-med) var(--ease-out) both` |
| components/foodbank/foodbank.css | `.fb-lib-card` | transition | `border-color .3s var(--fb-ease-out), transform .3s var(--fb-ease-out), box-shadow .3s var(--fb-ease-out)` | `border-color var(--dur-fast) var(--ease-out), transform var(--dur-med) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)` |
| components/foodbank/foodbank.css | `.fb-added` | animation | `fb-pop .45s var(--fb-ease-spring)` | `ec-bump var(--dur-slow) var(--ease-spring)` |
| components/foodbank/foodbank.css | `.fb-chip:active` | :active | `transform: scale(.95);` | `transform: scale(var(--press-scale));` |

## Inventory: public site, site editor and blog, before → after (71 declarations)
| File | Selector | Kind | Before | After |
|---|---|---|---|---|
| site/site.css | `.ec-site .btn` | transition | `color var(--t-med) var(--ease-out), transform var(--t-fast) var(--ease-out), box-shadow var(--t-med) var(--ease-out), translate .9s var(--ease-spring)` | `color var(--t-med) var(--ease-out), transform var(--t-fast) var(--ease-out), box-shadow var(--t-med) var(--ease-out), translate var(--t-slow) var(--ease-spring)` |
| site/site.css | `.ec-site .btn__fill` | transition | `transform .65s var(--ease-out)` | `transform var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .btn__label > span` | transition | `transform .55s var(--ease-out)` | `transform var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .btn__icon svg` | transition | `transform .5s var(--ease-out)` | `transform var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .btn--shine:hover::before` | transition | `transform .9s var(--ease-out)` | `transform var(--t-slow) var(--ease-out)` |
| site/site.css | `.ec-site .btn.is-mag` | transition | `color var(--t-med) var(--ease-out), transform var(--t-fast) var(--ease-out), box-shadow var(--t-med) var(--ease-out), translate .2s var(--ease-out)` | `color var(--t-med) var(--ease-out), transform var(--t-fast) var(--ease-out), box-shadow var(--t-med) var(--ease-out), translate var(--t-fast) var(--ease-out)` |
| site/site.css | `.ec-site .link-draw::after` | transition | `transform .5s var(--ease-out)` | `transform var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .cursor` | transition | `width .4s var(--ease-out), height .4s var(--ease-out), margin .4s var(--ease-out), background .3s` | `width var(--t-med) var(--ease-out), height var(--t-med) var(--ease-out), margin var(--t-med) var(--ease-out), background var(--t-fast)` |
| site/site.css | `.ec-site .cursor span` | transition | `opacity .2s` | `opacity var(--t-fast)` |
| site/site.css | `.ec-site .nav` | transition | `transform .6s var(--ease-out), background .4s, box-shadow .4s, backdrop-filter .4s` | `transform var(--t-med) var(--ease-out), background var(--t-med), box-shadow var(--t-med), backdrop-filter var(--t-med)` |
| site/site.css | `.ec-site .nav__links a` | transition | `color .3s, background .3s` | `color var(--t-fast), background var(--t-fast)` |
| site/site.css | `.ec-site .nav__menu-btn span` | transition | `transform .5s var(--ease-out), top .5s var(--ease-out)` | `transform var(--t-med) var(--ease-out), top var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .menu` | transition | `clip-path .8s var(--ease-in-out), visibility 0s linear .8s` | `clip-path var(--t-slow) var(--ease-in-out), visibility 0s linear var(--t-slow)` |
| site/site.css | `.ec-site .menu nav a span` | transition | `transform .8s var(--ease-out)` | `transform var(--t-slow) var(--ease-out)` |
| site/site.css | `.ec-site .bento__cell` | transition | `transform .5s var(--ease-out), background .4s` | `transform var(--t-med) var(--ease-out), background var(--t-med)` |
| site/site.css | `.ec-site .rcard__half img` | transition | `transform .9s var(--ease-out), filter .6s` | `transform var(--t-slow) var(--ease-out), filter var(--t-med)` |
| site/site.css | `.ec-site .pill` | transition | `background .3s, color .3s, transform .4s var(--ease-spring)` | `background var(--t-fast), color var(--t-fast), transform var(--t-med) var(--ease-spring)` |
| site/site.css | `.ec-site .prog` | transition | `transform .6s var(--ease-out)` | `transform var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .prog::before` | transition | `opacity .4s` | `opacity var(--t-med)` |
| site/site.css | `.ec-site .prog__art--photo img` | transition | `transform .9s var(--ease-out)` | `transform var(--t-slow) var(--ease-out)` |
| site/site.css | `.ec-site .prog__art--app img` | transition | `transform .7s var(--ease-spring)` | `transform var(--t-med) var(--ease-spring)` |
| site/site.css | `.ec-site .app__item` | transition | `background .4s, opacity .4s` | `background var(--t-med), opacity var(--t-med)` |
| site/site.css | `.ec-site .screen` | transition | `opacity .5s var(--ease-out), transform .6s var(--ease-out)` | `opacity var(--t-med) var(--ease-out), transform var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .step__dot` | transition | `background .4s, box-shadow .4s, color .4s` | `background var(--t-med), box-shadow var(--t-med), color var(--t-med)` |
| site/site.css | `.ec-site .step__ic` | transition | `color .4s, transform .5s var(--ease-spring)` | `color var(--t-med), transform var(--t-med) var(--ease-spring)` |
| site/site.css | `.ec-site .quote` | transition | `transform .5s var(--ease-out), box-shadow .4s` | `transform var(--t-med) var(--ease-out), box-shadow var(--t-med)` |
| site/site.css | `.ec-site .wall button` | transition | `transform .5s var(--ease-out)` | `transform var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .lightbox` | transition | `opacity .4s, visibility .4s` | `opacity var(--t-med), visibility var(--t-med)` |
| site/site.css | `.ec-site .lightbox img` | transition | `transform .5s var(--ease-out)` | `transform var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .acc__q` | transition | `color .3s, padding .5s var(--ease-out)` | `color var(--t-fast), padding var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .acc__ic` | transition | `background .4s, transform .6s var(--ease-spring), box-shadow .4s` | `background var(--t-med), transform var(--t-med) var(--ease-spring), box-shadow var(--t-med)` |
| site/site.css | `.ec-site .acc__ic::before, .ec-site .acc__ic::after` | transition | `transform .5s var(--ease-out)` | `transform var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .acc__a` | transition | `grid-template-rows .6s var(--ease-out)` | `grid-template-rows var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .wa-float` | transition | `transform .5s var(--ease-spring)` | `transform var(--t-med) var(--ease-spring)` |
| site/site.css | `.ec-site .cookie.is-on` | animation | `rise .7s var(--ease-out)` | `rise var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .cookie__btns button` | transition | `background .3s, color .3s, transform .2s` | `background var(--t-fast), color var(--t-fast), transform var(--t-fast)` |
| site/site.css | `.ec-site .lang-switch button` | transition | `background .35s var(--ease-out), color .35s` | `background var(--t-fast) var(--ease-out), color var(--t-fast)` |
| site/site.css | `.ec-site .form-modal` | transition | `visibility 0s linear .6s` | `visibility 0s linear var(--t-med)` |
| site/site.css | `.ec-site .form-modal__backdrop` | transition | `opacity .5s var(--ease-out)` | `opacity var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .form-modal__panel` | transition | `transform .7s var(--ease-out), opacity .5s var(--ease-out)` | `transform var(--t-med) var(--ease-out), opacity var(--t-med) var(--ease-out)` |
| site/site.css | `.ec-site .form-modal__head` | transition | `border-color .3s, box-shadow .3s` | `border-color var(--t-fast), box-shadow var(--t-fast)` |
| site/site.css | `.ec-site .form-modal__panel::after` | transition | `opacity .3s` | `opacity var(--t-fast)` |
| site/site.css | `.ec-site .form-modal__close` | transition | `transform .5s var(--ease-spring), background .3s, color .3s` | `transform var(--t-med) var(--ease-spring), background var(--t-fast), color var(--t-fast)` |
| site/site.css | `.ec-site .field input, .ec-site .field textarea` | transition | `box-shadow .3s, background .3s` | `box-shadow var(--t-fast), background var(--t-fast)` |
| site/site.css | `.ec-site .choice span` | transition | `background .35s var(--ease-out), color .35s, box-shadow .35s, transform .4s var(--ease-spring)` | `background var(--t-fast) var(--ease-out), color var(--t-fast), box-shadow var(--t-fast), transform var(--t-med) var(--ease-spring)` |
| site/site.css | `.ec-site .form-done__icon` | animation | `pop .7s var(--ease-spring)` | `pop var(--t-med) var(--ease-spring)` |
| site/siteEdit.css | `html.ec-editing .ec-site [data-ec-path]` | transition | `outline-color .2s var(--ease-out), background-color .2s var(--ease-out)` | `outline-color var(--t-fast) var(--ease-out), background-color var(--t-fast) var(--ease-out)` |
| site/siteEdit.css | `-site [data-ec-item], html.ec-editing .ec-site [data-ec-img]` | transition | `outline-color .2s var(--ease-out)` | `outline-color var(--t-fast) var(--ease-out)` |
| site/siteEdit.css | `html.ec-editing .ec-site .ec-sec` | transition | `outline-color .25s var(--ease-out)` | `outline-color var(--t-fast) var(--ease-out)` |
| site/siteEdit.css | `html.ec-editing .ec-site .ec-sec > :not(.ec-edit-bar)` | transition | `opacity .35s var(--ease-out), filter .35s var(--ease-out)` | `opacity var(--t-fast) var(--ease-out), filter var(--t-fast) var(--ease-out)` |
| site/siteEdit.css | `.ec-site .ec-edit-bar` | transition | `opacity .25s var(--ease-out), transform .35s var(--ease-out)` | `opacity var(--t-fast) var(--ease-out), transform var(--t-fast) var(--ease-out)` |
| site/siteEdit.css | `.ec-site .ec-edit-bar button` | transition | `background .2s, color .2s` | `background var(--t-fast), color var(--t-fast)` |
| site/siteEdit.css | `.ec-site .ec-edit-imgbtn` | transition | `opacity .25s var(--ease-out), transform .35s var(--ease-out)` | `opacity var(--t-fast) var(--ease-out), transform var(--t-fast) var(--ease-out)` |
| site/accountBubble.css | `.ec-site .ec-me` | transition | `transform .35s cubic-bezier(.22, 1, .36, 1), box-shadow .35s` | `transform var(--t-fast) cubic-bezier(.22, 1, .36, 1), box-shadow var(--t-fast)` |
| styles/blog.css | `.ec-blog-navlink` | transition | `color 240ms` | `color var(--t-fast)` |
| styles/blog.css | `.ec-blog-eyebrow` | animation | `ec-blog-up 800ms var(--ease) both` | `ec-blog-up var(--t-slow) var(--ease-out) both` |
| styles/blog.css | `.ec-blog-hero h1` | animation | `ec-blog-up 900ms 80ms var(--ease) both` | `ec-blog-up var(--t-slow) 80ms var(--ease-out) both` |
| styles/blog.css | `.ec-blog-hero p` | animation | `ec-blog-up 900ms 160ms var(--ease) both` | `ec-blog-up var(--t-slow) 160ms var(--ease-out) both` |
| styles/blog.css | `.ec-blog-lead` | animation | `ec-blog-up 900ms 220ms var(--ease) both` | `ec-blog-up var(--t-slow) 220ms var(--ease-out) both` |
| styles/blog.css | `.ec-blog-lead img, .ec-blog-lead .ec-blog-cover-empty` | transition | `transform 900ms var(--ease), border-radius 600ms var(--ease)` | `transform var(--t-slow) var(--ease-out), border-radius var(--t-med) var(--ease-out)` |
| styles/blog.css | `.ec-blog-card` | animation | `ec-blog-up 800ms calc(300ms + var(--i, 0) * 70ms) var(--ease) both` | `ec-blog-up var(--t-slow) calc(300ms + var(--i, 0) * 70ms) var(--ease-out) both` |
| styles/blog.css | `.ec-blog-card img, .ec-blog-card .ec-blog-cover-empty` | transition | `transform 700ms var(--ease), border-radius 500ms var(--ease)` | `transform var(--t-med) var(--ease-out), border-radius var(--t-med) var(--ease-out)` |
| styles/blog.css | `.ec-blog-card b` | transition | `color 240ms` | `color var(--t-fast)` |
| styles/blog.css | `.ec-blog-back` | transition | `color 200ms, gap 300ms var(--spring)` | `color var(--t-fast), gap var(--t-fast) var(--ease-spring)` |
| styles/blog.css | `.ec-blog-article-head h1` | animation | `ec-blog-up 900ms var(--ease) both` | `ec-blog-up var(--t-slow) var(--ease-out) both` |
| styles/blog.css | `.ec-blog-article-head p` | animation | `ec-blog-up 900ms 80ms var(--ease) both` | `ec-blog-up var(--t-slow) 80ms var(--ease-out) both` |
| styles/blog.css | `.ec-blog-meta` | animation | `ec-blog-up 900ms 140ms var(--ease) both` | `ec-blog-up var(--t-slow) 140ms var(--ease-out) both` |
| styles/blog.css | `.ec-blog-cover` | animation | `ec-blog-up 1000ms 200ms var(--ease) both` | `ec-blog-up var(--t-slow) 200ms var(--ease-out) both` |
| styles/blog.css | `.ec-blog .ec-article-body` | animation | `ec-blog-up 1000ms 260ms var(--ease) both` | `ec-blog-up var(--t-slow) 260ms var(--ease-out) both` |
| styles/blog.css | `.ec-blog-faq details` | transition | `border-color 240ms` | `border-color var(--t-fast)` |
| styles/blog.css | `.ec-blog-cta-btn` | transition | `transform 400ms var(--spring), box-shadow 300ms` | `transform var(--t-med) var(--ease-spring), box-shadow var(--t-fast)` |

## Inventory: primitives and components changed by hand
| Component | Before | After |
|---|---|---|
| Route (trainer/trainee `.tr-route`) | `trRoute .2s (.2,.7,.3,1)` + GSAP `.24s power2.out y6 stagger .02` on cards | `ec-rise --dur-med --ease-out`, CSS only |
| Route (legacy `Layout`) | `ecPortalFadeIn 380ms (.16,1,.3,1)`, not re-keyed per page | same `ec-rise`, keyed by page |
| `ui/dialog` | 300ms `ease`, zoom .95, close 300ms | open `--dur-slow` `--ease-out` zoom .98, close `--dur-fast` `--ease-in` |
| `ui/sheet` | open 500ms / close 300ms `ease-in-out` | open `--dur-slow`, close `--dur-fast` |
| `ui/select, tooltip, popover, menus` | 150ms `ease`, zoom .95 / .90 | `--dur-fast` `--ease-out`, zoom .98 |
| `ui/toast` | from top (mobile) / bottom-full, out to the right, viewport `right-0` | from 4px below, `--dur-med`, fade out; `end-0` |
| `NotificationToast` | `slide-in-from-right-full` 300ms `ease-in-out` at `right-4` | from 4px below, `--dur-med`, at `end-4` |
| `ui/skeleton` + 6 page placeholders | `animate-pulse` 2s | `.ec-skel` shimmer 1.4s |
| `tp-sheet` / `tr-xs-panel` / food-bank drawer exit | none / none / reversed entrance (broken) | `ec-sheet-down` / `ec-side-out` / `ec-fade-out`, `--dur-fast` `--ease-in` |
| Tabs content | `fade-in .3s ease-out` 10px | `ec-rise` `--dur-med` |
| Accordion | .2s `ease-out` both ways | open `--dur-med`, close `--dur-fast` `--ease-in` |
| `.card-hover` / `.card-3d` | lift 4px .5s (+ scale on mobile) | lift 1px `--dur-med`, none on touch |
