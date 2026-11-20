# Motion uniformity audit — 2026-11 (INTERIM: session hit its usage limit)

## Before
- 6 parallel token namespaces for the same curve (`--ease-out`, `--tr-ease` (.2,.7,.3,1 — not in spec), `--sx-ease`, `--fb-ease-out`, blog `--ease`, `--ec-motion-spring` (.16,1,.3,1)); no portal duration tokens at all.
- ~380 CSS transition/animation declarations using ~45 distinct literal durations (.06s–1.4s) and ~30 easing spellings.
- Two motion tempos in the portal: trainer "calm" (QA #9 / #29, owner: "too exaggerated everywhere") vs trainee/studio/food bank/Agent EC (.45–.7s, 14–24px rises, spring on presses).
- Route entrance animated twice (CSS `.tr-route` + GSAP `usePortalMotion` stagger + CSS on `.ec-stagger`); legacy `Layout` uses a third (`.ec-page-enter`).
- Toasts: three systems; radix toast and `NotificationToast` slide in from the right even in RTL.
- Press scale .90–.985 across 11 components; three press durations.
- Global reduced-motion rule shortened loops to .001ms but kept them infinite (flicker).

## Done (committed)
- `src/styles/motion.css`: single token set (curves, `--dur-press/fast/med/slow/data/loop`, site `--t-*`, distances, press scales, `--ec-dir` with nearest-`dir` scoping), shared keyframes (`ec-fade/rise/pop/sheet-up/side-in/bump/spin`), calm `animate-in/out` curves, global reduced-motion (loops stop, delays and smooth scroll off).
- `src/lib/motion.ts`: JS mirror + `prefersReducedMotion()` / `scrollBehavior()`.
- `tailwind.config.ts`: `duration-*` / `ease-*` scale mapped onto the tokens (no .tsx edits, avoids conflicts with ux-walkthrough).
- 225 portal declarations rewritten onto tokens across 15 CSS files (full before → after table below); RTL-variant keyframes replaced by direction-aware `ec-side-in`; alias tokens removed.

## Remaining
- Delete orphaned keyframes and the redundant `.tr-root` "calm motion for the shared kit" override block in trainer.css; drop index.css duplicate ease tokens, the old reduced-motion rule and dead utilities (floating, bounceIn…); `.ec-btn--fill` should be `--dur-slow`.
- One route transition: give `.tr-route` and `.ec-page-enter` the `.ec-route` primitive and remove the GSAP stagger in `lib/portalMotion.ts`.
- ui primitives: dialog (`zoom-in-[.98]`, `duration-slow`), sheet, radix toast + `NotificationToast` (direction-neutral entrance, `end-4`), tabs, skeleton (use the shared shimmer).
- Public site + blog: snap ~60 literal durations to `--t-fast/med/slow`.
- Swap the 4 duplicated `matchMedia` reduced-motion checks for `lib/motion.ts`.
- Live check in the browser (RTL/LTR, trainer/client, reduced motion) was not run.
- Update the `ecshape-motion` skill with a "Motion tokens" section (portal calm vs site cinematic, exceptions: success bump spring, signature loops, AI write blur).
- Layout properties still animated (sidebar width, panel margins, grid rows, studio device width) — tokenised, but should move to transforms.

## Inventory: before → after (portal CSS)
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
