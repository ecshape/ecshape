# ECShape API security audit, 2026-11 (PARTIAL)

Status: **incomplete**. The audit stopped when the usage limit was reached. Everything below was tested against a
local server (port 8060, scratch SQLite DB, `DEV_DEMO_SEED=1`) with two tenants: trainer A + client A (demo seed)
and trainer B + client B, plus an admin. Method: an OpenAPI-driven fuzzer called every route as trainer B and
client B with tenant A's ids, and flagged every 2xx. Then each hit was traced in the code.

## Fixed on this branch (verified against the running server)

| ID | Sev | Endpoint | Issue | Fix |
|---|---|---|---|---|
| F-01 | Critical | `PUT /api/users/{id}` | Mass assignment: a client could set `role: ADMIN` on themself, and a trainer could set it on their client. Proven: client B → ADMIN → listed every client. | `_guard_privileged_fields`: only an admin can change `role`. `is_active` is limited to an admin or the client's trainer. |
| F-02 | Critical | `POST /api/users/clients/{id}/assign`, `POST /users/trainer/{t}/clients/{c}` | Any trainer could take over another trainer's client and then read all their data. Proven. | You can only assign clients who have no trainer yet, or are already yours. |
| F-03 | High | `GET /api/users/`, `GET /api/users/trainers` | Every trainer saw every user in every tenant (emails, roles). | A trainer sees themself and their own clients. Only an admin sees all users. |
| F-04 | High | legacy `/api/workouts/*`, `/api/meal-plans/*`; v2 `/api/v2/meals` (food options, choices, daily-macros, history, average), `/api/v2/workouts` (days, workout exercises, sessions, set completions, PRs) | The checks looked at the role only. Any trainer could read or change any tenant's plans, sessions, food options and exercises, and clients could edit plans. | New `app/auth/access.py` (`require_trainer_of`, `require_plan_access`, `require_client_access`, …), applied per handler. |
| F-05 | High | `/api/nutrition/*` (32 routes) | The same role-only checks, with clients able to edit plans and recipes. The portal never calls these routes. | The router is no longer mounted. |
| F-06 | High/Med | `/api/v2/meals/meal-bank` list, export, `cleanup-duplicates` | Trainers saw other trainers' private items. Cleanup deleted duplicates across all tenants. | Trainers see their own items plus public ones. Cleanup only touches your own items. |
| F-07 | Medium | `PUT /api/workouts/exercises/{id}` (`WorkoutService.update_exercise`) | Any trainer could edit any trainer's exercise. | Only the creator or an admin can edit it. |
| L-03 | Low | `/api/v3/meals-mock/*` | The unauthenticated mock router was reachable in production. | It is mounted only outside production. |

## Found, NOT fixed yet (do these next)

- **High: `/api/files/media/{file_type}/{filename}`** (`app/routers/files.py`). Any trainer can read every tenant's
  progress, meal and profile photos. The client check is a substring test (`str(current_user.id) in filename`),
  so client 3 can open any file whose name contains a "3". 404 errors also leak server paths.
- **High (needs a test): the `/uploads` StaticFiles mount in `app/main.py` serves every upload without auth.**
  `FileService.save_file` and `WorkoutService` keep the extension from the uploader's filename, so this may allow
  stored HTML/SVG XSS on the app origin. Check it, then remove the mount or serve only re-encoded images with
  `nosniff`.
- **Medium: `POST /api/ws/ws/test-notification/{user_id}`** (no auth) lets anyone push a fake "system"
  notification to any user. `GET /api/ws/ws/stats` has no auth either. The WebSocket `send_message` type can DM
  any user id across tenants.
- **Medium: `POST /api/notifications/`** lets a trainer notify another tenant's client.
  `POST /api/notifications/trigger/goal-check/{client_id}` has no ownership check.
- **Medium: studio (`require_studio`)**. Any trainer reads leads (names, phones), edits the public site and SEO,
  and edits other people's QA tickets. Clients can create QA tickets. Product decision: limit this to admins or a
  list of studio owners.
- **Low:** `/api/files/debug/paths` and `/api/files/media/stats` are exposed to any user. `/metrics` and
  `/status/database` need no auth. Email/username changes have no verification (hand to the auth session). The
  Instagram webhook checks the HMAC signature correctly but has no replay or dedupe protection. Unassigned
  clients can be claimed by any trainer (fix: `register/client` should set `trainer_id`, which is in `auth.py`,
  the auth session's file). `PersonalRecordCreate` has no `client_id`, so trainer PRs return a 500.

## Not covered yet

progress, check_in, meal_tracking_v3, meal_variants_v3, meal_logging_tools, food_library, exercise_library,
muscle_groups, workout_splits, translate/AI rate limits, SSRF, SQLi review, Frontend `dangerouslySetInnerHTML`,
secret scan, pip-audit/npm audit, Docker (runs as root: no `USER` line in `Dockerfile`), DELETE-method fuzz, and
the regression test suite (none written yet; the repo has no backend test harness).
