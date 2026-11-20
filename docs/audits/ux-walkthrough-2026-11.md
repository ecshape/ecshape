# ECShape UX walkthrough — 2026-11 (partial)

Branch `claude/audit-ux-features-1bbe94`, fast-forwarded to `sam-dev-1` first (it had been cut from `main`, which is 9 commits behind and lacks `lib/optimistic.ts`, automations and the nutrition table). Local API on port 8070 and portal on 5230, with a scratch SQLite DB and `DEV_DEMO_SEED=1`. Tested as a trainer at desktop width (1280px) in Hebrew/RTL, dark theme.

**Status: partial.** The session hit its usage limit after the trainer screens through the exercise library. Everything below "Not yet audited" is still to do.

## Screens

| Screen | Works | Intuitive | Elegant | Notes |
|---|---|---|---|---|
| Login | pass | issue | pass | The inline error for a wrong password works. Only usernames are accepted, not emails, which is deliberate in `auth_service`. Proposal: accept email (belongs to the auth-security session). Empty fields show the browser's English bubble. The submit and demo buttons have no accessible name. |
| Trainer dashboard | pass | pass | issue | The floating QA bubble covers the sidebar's "QA Studio" item and sits over toasts. |
| Clients list and add client | pass | pass | pass | Mismatched passwords are caught. The new client appears right away. Required fields use the browser's English bubble. |
| Client profile | fixed | issue | fixed | The sidebar highlighted Dashboard (fixed). The timeline showed back-dated weigh-ins on the day they were logged (fixed). With 9 tabs, "Check-ins" and "Notifications" are off-screen at desktop width. |
| Client weight tab | fixed | fixed | fixed | The Y axis ran from 0 to 100 kg, so the line looked flat. The tooltip was a white box. "Weight change" showed the last step (−0.7) while the header showed −6.5. All fixed. |
| Workout plan builder | fixed | issue | pass | Cancel and Back threw away edits without asking (fixed). The plan being edited comes from `location.state`, so a reload turns it into a blank "create" form and risks a duplicate plan. Labels are not linked to their inputs. The error banner shows raw English "Server error: …" text. |
| Exercise bank | fixed | fixed | issue | Description was required in the form but not by the API (fixed). Delete used the browser's `confirm()` and waited for the server (fixed: app dialog, optimistic). The header stays invisible for about 1 s (motion). The create dialog's small inputs don't match the add-client dialog. |
| Exercise sheet (from the profile) | fixed | pass | pass | Muscle chips showed raw "back" (fixed). |
| Exercise library | fixed | pass | fixed | The close X sat on top of the search field in RTL (fixed). |
| Food bank | pass | — | issue | Content took about 5 s to appear. The API answers in 18 ms (680 KB, 1,249 foods), so the delay is client-side rendering or animation. Not yet diagnosed. |

**Not yet audited:** meal plans and variants, nutrition table and food packs (details), meal tracking, daily check-in sliders, progress, chat, notifications, automations, Studio and QA, settings, the session player, the whole client app, English/LTR, 375px mobile, and light mode.

## Fixes made (commits)
- f1bd6e9: client pages highlight Clients in the sidebar. The profile timeline keeps back-dated weigh-ins on their own day.
- 335614b: weight chart axis fitted to the data, themed tooltip, change counted from the first weigh-in.
- 467ce80: shared `DiscardChangesDialog` (he/en/fr). The workout builder asks before discarding edits.
- 08fd198: exercise form has an optional description, required markers, and the form's own Hebrew errors.
- f6621be: exercise delete uses the app dialog and `optimisticList`. Bank muscle groups are translated on the profile sheet.
- ab72d30: exercise library header uses logical padding, so the close X clears the search.

Before and after screenshots are in the session scratchpad, under `shots/`.

## Proposals awaiting a decision
1. Put the plan id in the builder URL (`?planId=`) so a reload keeps the plan being edited.
2. Accept email at login (auth-security area).
3. Move the floating QA bubble, or offset the toaster, so it stops covering nav items and toasts.
4. Make the client profile tabs discoverable: an overflow menu, or two rows at desktop width.
5. One dialog size scale, so the exercise, add-client and alert dialogs share input and button heights.
6. Replace the browser's required-field bubbles app-wide with `noValidate` and inline translated errors.
7. Show "Server error" banners as translated messages.

## Motion notes (for the motion-uniformity session)
- On first load, page headers and content stay hidden or dim for about 1 s on Exercises and Client profile, and for several seconds on Food bank.
