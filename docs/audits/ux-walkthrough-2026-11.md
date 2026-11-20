# ECShape UX walkthrough — 2026-11 (partial)

Branch `claude/audit-ux-features-1bbe94`, fast-forwarded to `sam-dev-1` first (it had been cut from `main`, which is 9 commits behind and lacks `lib/optimistic.ts`, automations and the nutrition table). Local API on port 8070 and portal on 5230, with a scratch SQLite DB and `DEV_DEMO_SEED=1`. Tested as a trainer at desktop width (1280px) in Hebrew/RTL, dark theme.

**Status: in progress (resumed).** The session hit its usage limit after the trainer screens through the exercise library. Everything below "Not yet audited" is still to do.

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
| Food bank | pass | pass | issue | Search, group and property chips, and 60-per-page paging all work. The API answers in 18 ms, but the page sits at opacity 0 for seconds behind the `.tr-route` fade when the tab is in the background (motion). Data: "Whey protein isolate" is listed at 58 g protein / 29 g carbs per 100 g in `app/data/ecshape_table.json` (real isolate is ~85–90 g protein). That's the owner's table, so it's reported, not edited. Only 3 of 1,349 foods are tagged high-fibre. |
| Food packs (ready menus) | fixed | pass | fixed | Cards and the detail view used Latin "P / C / F" and "kcal"; they now use the Hebrew macro names and the food cards' macro layout. Assigning to a client works. The confirmation toast ran the Hebrew prefix into the name ("לNoa"); it now reads "ל-Noa". |
| Client meal plan (profile tab) | fixed | pass | fixed | Food placeholders showed the English initial ("W" next to דג לבן); they now use the letter of the name shown. Plan foods have no photos even where the food bank has one (the plan stores its own copy of each food). |
| Meal plan editor (weekly, variants) | fixed | issue | fixed | Saving finished with no feedback (fixed: toast). The per-meal targets packed 4 unlabeled inputs into each row, clipping the values (fixed: column headers, tighter inputs, no spinner arrows). "Drift" showed English "kcal" (fixed). The client comes from `location.state`, so a reload loses it (same as the workout builder). |
| Chat (trainer) | pass | pass | fixed | Sending is instant (optimistic) and the conversation list updates. At 1280 px the list, thread and client profile sat side by side and squeezed the thread to ~180 px. The profile now opens as a sheet below 1536 px. |
| Notifications | issue | issue | — | The trainer has no notification inbox: `NotificationBell` was dropped in the Nov 13 redesign (e8c18f4) and is mounted nowhere. Only live toasts remain, though the count and list are still fetched. Per-client notification settings (profile tab) work. Proposal 8. |
| Automations | fixed | pass | pass | Toggling is instant. The dry run lists matching clients with the exact message each would get. Delete and "run now" used the browser's `confirm()`; they now use the shared app dialog (`useConfirm`). |
| Tasks | pass | pass | pass | Good empty state. Done, reopen and delete are optimistic. Delete has no confirmation or undo (acceptable for tasks). |
| Leads | fixed | pass | pass | List, detail, status chips, call and WhatsApp all work. Delete moved from `confirm()` to the app dialog. |
| My site | pass | pass | pass | Section list plus a live preview of the site. |
| SEO / communication | pass | pass | pass | Clear empty states and connect actions. |
| QA studio | fixed | pass | pass | Board and list views, filters, and the sheet work. Ticket delete moved from `confirm()` to the app dialog. |
| Settings | pass | pass | pass | Profile photo, AI keys and one-click OpenRouter connection. Judged from content only, because the reveal animation stays frozen while the browser pane is hidden. |
| Client: Today (375 px) | pass | pass | pass | Next workout hero, nutrition rings, check-in card, weight card, coach message. The weight card says "last weigh-in last week" right after a check-in logged today's weight: check-in weight and progress weigh-ins are separate sources. Its −2.2 kg also differs from the trainer's −6.5 kg (a different window, unlabelled). Proposal 10. |
| Client: daily check-in (sleep and hunger sliders) | fixed | fixed | pass | Saving is instant, then the card turns into a "done" summary with a streak. Before the client answered, the thumb sat solidly on 7 h / hunger 6 and looked like a given answer; the unset thumb is now faint and dashed. |
| Client: routines and session player | pass | pass | issue | Start, prefilled reps, set done, rest timer (±15 s, skip) and the finish confirmation sheet ("1 of 11 sets done") all work. At 375 px the header's "0/11 sets" label truncates. |
| Client: nutrition and meal tracking | fixed | pass | fixed | Ticking a food is instant: totals, the 1/3 count and "I ate the rest" update at once. Food rows, the add-meal sheet and chat menu cards said "kcal" beside Hebrew; they now use the translated unit. Food placeholders use the Hebrew initial. The compact "P/C/F" notation remains (proposal 11). |
| Client: progress | pass | pass | pass | Range tabs, fitted chart, measurements, milestones, photo empty state. |
| Client: chat | pass | pass | pass | The unread badge clears once the conversation is read. |
| Client: profile | fixed | pass | fixed | "With us since" read "נוב' 26" (looks like 26 November); it now shows 11.2026. |

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
8. Bring back a trainer notification inbox (a bell in the top bar, with the unread count the app already fetches), designed in the current system.
10. One weight source: count today's check-in weight as a weigh-in (or say on the weight card which window the change covers).
11. Macro shorthand in the client app ("P40 C30 F10"): use the Hebrew initials or small labelled chips, as in the food bank.
9. Food photos in meal plans: plans store their own copy of each food without its photo; link to the food bank item instead, or copy the image when assigning.

## Motion notes (for the motion-uniformity session)
- On first load, page headers and content stay hidden or dim for about 1 s on Exercises and Client profile, and for several seconds on Food bank.
