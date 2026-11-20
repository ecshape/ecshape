# ECShape API and data-access security audit, 2026-11

Branch `claude/audit-api-security-bfe738`. Scope: every router in `app/routers/` except login, password and
session mechanics (covered by the separate `auth-security` audit), plus the services and models behind them,
`app/main.py`, uploads, `Dockerfile`, `railway.json`, `render.yaml`, `requirements.txt`, `Frontend/package.json`
and the portal's HTML sinks. Checklists: OWASP API Security Top 10 (2023) and OWASP ASVS 4.0.3 Level 2 (V4, V5,
V8, V10, V12, V13).

## Method

- The API ran locally only (`localhost:8060`, scratch SQLite, `DEV_DEMO_SEED=1`). Two tenants: **trainer A +
  client A** (the demo seed, plus a second client) and **trainer B + client B**, plus an **admin**.
- **OpenAPI-driven fuzzer:** every route (252 before the fixes, 233 after) was called as trainer B and as client
  B, with tenant A's ids in every path, query and body id field, and with schema-valid bodies. Tenant A first
  created objects in every table through the same routes. Each 2xx was traced to code and proved by hand. Final
  run after the fixes: GET / POST / PUT / PATCH / DELETE on a fresh database copy.
- Targeted proofs: role escalation, client takeover, polyglot upload, path traversal, websocket channels and DMs,
  SSRF URL classes, the article HTML sanitizer (20 bypass payloads under Node), offline bcrypt checks of the
  committed database, `pip-audit` and `npm audit`.
- **Regression suite:** `tests/test_tenant_isolation.py` (run with `pip install -r requirements-dev.txt && pytest
  tests`). 10 tests, including a 39-row attack matrix. **All pass on this branch. On `main`, 22 of the attack rows
  succeed** (see the list under F-04).

## Authorization matrix (after the fixes)

Legend: ✅ allowed · ❌ refused (404/403) · ⚪ shared by design. "A" means tenant A's object, attacked by B.
Before → after is shown where the audit changed the answer.

| Resource / action | Client A (own) | Trainer A (own client) | Trainer B → A | Client B → A | Admin | Anonymous |
|---|---|---|---|---|---|---|
| `PUT /users/{id}` change role | ✅→❌ | ✅→❌ | ❌ | ❌ | ✅ | ❌ |
| `POST /users/clients/{id}/assign` | — | ✅ (unassigned only) | ✅→❌ | — | — | ❌ |
| `GET /users/`, `/users/trainers` | ❌ | own tenant only (was every user) | own tenant only | ❌ | ✅ all | ❌ |
| v2 workout plan / day / exercise / session | read | ✅ | write ✅→❌ | ❌ | ✅ | ❌ |
| v2 meal plan / food option / choices / history | read | ✅ | write ✅→❌, read ✅→❌ | ❌ | ✅ | ❌ |
| v3 meal plan create / log edit-delete | own logs | ✅ | ✅→❌ | ❌ | ✅ | ❌ |
| legacy `/workouts/*`, `/meal-plans/*` | read | ✅ | ✅→❌ | read/write ✅→❌ | ✅ | ❌ |
| legacy `/nutrition/*` (32 routes) | — | — | ✅→❌ (unmounted) | ✅→❌ | — | ❌ |
| progress / meal / profile photos | ✅ | ✅ | ✅→❌ (read and delete) | ✅→❌ (substring check) | ✅ | ✅→❌ (`/uploads`) |
| chat messages / chat media | ✅ | ✅ | ❌ | ❌ | media ✅ | ❌ |
| progress entries, check-ins | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| notifications create / goal-check | — | own clients | ✅→❌ | ❌ | ✅ | ✅→❌ (`ws/test-notification`) |
| websocket channel `/api/ws/{id}` | own only | own only | ❌ | ❌ | own | ❌ |
| websocket DM `send_message` | own trainer | own clients | ✅→❌ | ✅→❌ | ✅ | ❌ |
| meal bank private items | trainer's items | own + public | ✅→❌ (list/export) | ❌ | ✅ | ❌ |
| exercise bank | ⚪ read | ⚪ read, edit own | read ⚪, edit ✅→❌ | read ⚪ | ✅ | ❌ |
| muscle groups / splits | ⚪ read | ⚪ read, edit own | edit ✅→❌ (groups) | ⚪ read | ✅ | ❌ |
| studio (leads, site, SEO, QA, articles) | ❌ (QA create ⚪) | ✅ | ✅ unless `STUDIO_OWNER_IDS` set | ❌ | ✅ | public site only |
| AI keys | — | own keys only | ❌ | ❌ | own | ❌ |
| `/system/*`, `debug/paths`, `media/stats` | ❌ | ❌ (was ✅ for paths/stats) | ❌ | ❌ | ✅ | ❌ |

## Findings

Severity follows OWASP risk rating (likelihood × impact). Each "Test" names its regression test in
`tests/test_tenant_isolation.py` (all in the attack matrix unless another test is named).

### Critical

**F-01: Privilege escalation through mass assignment.** `PUT /api/users/{id}` (`UserUpdate` accepts `role`,
`is_active`). Repro: as client B, `PUT /api/users/<own id> {"role":"ADMIN"}` returns 200 and the account is admin
on its next request (proved: it then listed every client). A trainer could also promote their client.
Fix: `_guard_privileged_fields` in `users.py`: only an admin changes `role`. `is_active` is limited to an admin or
the client's own trainer. Test: matrix rows 1–2, plus `test_owners_keep_access` (the admin still can).

**F-02: Any trainer could take over another trainer's client.** `POST /api/users/clients/{id}/assign` (and
`/users/trainer/{t}/clients/{c}`) reassigned any client, which gave full access to that client's data and chat.
Proved: trainer B claimed client A. Fix: you can only assign clients with no trainer yet, or already yours.
Test: matrix row 3.

**F-16: Real client data and guessable passwords committed to a public repository.** `data/elior_fitness.db` (15
users with bcrypt hashes, 61 progress entries, 49 chat messages), a backup copy of it, and 42 progress photos in
`uploads/progress_photos/` were tracked at HEAD (the history issue was already known). Offline bcrypt checks
against a tiny wordlist (`username123` and similar) matched **the admin, one trainer and two clients**.
Fix on this branch: the files are no longer tracked and `.gitignore` blocks them. **They are still in git
history: see "What you must do".**

### High

**F-03: Trainers listed every tenant.** `GET /api/users/` and `/api/users/trainers` returned every user's email
and role. Fix: a trainer sees themself and their clients; only an admin sees all users.
Test: `test_trainer_listings_stay_in_tenant`.

**F-04: Role-only checks across the plan routers (BOLA).** The checks asked "is this a trainer?" but never whose
object it was. Affected: v2 workouts (`PUT /days/{id}`, `POST /days/{id}/exercises`, `PUT|DELETE
/exercises/{id}`, `PUT /sessions/{id}`, set completions, PRs); v2 meals (`POST
/macro-categories/{id}/foods`, `PUT|DELETE /foods/{id}`, `GET /choices` (every client when no `client_id` was
given), `PUT|DELETE /choices/{id}`, `GET /daily-macros`, `POST /history`, `GET /history/average`, `POST /plans`,
`POST /plans/complete`); v3 (`POST /plans`, `PUT|DELETE /logs/{id}`); every legacy `/api/workouts/*` and
`/api/meal-plans/*` route (clients could even edit plans); `PUT /api/workouts/exercises/{id}` (any trainer edited
any exercise). Fix: new `app/auth/access.py` (`require_trainer_of`, `require_plan_access`,
`require_client_access`, `visible_client_ids`), applied to every handler. Refusals are 404.
On `main`, the regression suite shows these succeeding:

```
clB PUT /api/users/5 {"role":"ADMIN"} -> 200      trA PUT /api/users/4 {"role":"TRAINER"} -> 200
trB DELETE /api/v2/workouts/exercises/1 -> 204    trB PUT /api/v2/workouts/sessions/1 -> 200
trB PUT /api/v2/meals/foods/1 -> 200 (name "pwned")  trB DELETE /api/v2/meals/foods/1 -> 204
trB GET /api/v2/meals/daily-macros?client_id=A -> 200  trB POST /api/v2/meals/history -> 201
trB PUT /api/workouts/plans/1 -> 200              clB GET /api/workouts/sessions/1 -> 200
clB PUT /api/meal-plans/1 -> 200                  trB POST /api/meal-plans/ (client A) -> 200
trB PUT /api/workouts/exercises/1 -> 200          trB GET  …/progress_photos/<A's photo> -> 200 (JPEG)
trB DELETE …/progress_photos/<A's photo> -> 200   trA GET /api/nutrition/plans -> 200
```

**F-05: Legacy `/api/nutrition` router (32 routes) had the same flaw** (clients could edit plans and recipes, and
weigh-ins and goals were readable by `client_id`). The portal never calls it. Fix: it is no longer mounted.

**F-08: Private media readable and deletable across tenants.** `GET /api/files/media/{type}/{name}`: every
trainer could read every tenant's progress, meal and profile photos. The client check was a substring test
(`str(user.id) in filename`), so client 3 could open any name containing a "3". `DELETE` had **no check**. 404
errors leaked absolute server paths. Fix: the owner is parsed exactly from the name (regex) and checked with
`can_access_client`. Files resolve only inside their folder. Errors are generic. Delete follows the same rule
(exercise images: creator or admin). Test: matrix rows on `progress_photos`, plus `test_owners_keep_access`.

**F-09: Stored XSS through uploads.** `FileService.save_file` kept the uploader's file extension. Proved: a
trainer uploads a valid JPEG with HTML appended, named `poc.html`, as an exercise image. It was served
**unauthenticated as `text/html`** from `/api/files/media/exercise_images/…` and `/uploads/…`, on the portal's
origin, where tokens are in `localStorage`. Fix: the extension comes from the detected type (libmagic), and public
images are served only with an image extension. Test: `test_polyglot_upload_is_not_served_as_html`.

**F-10: `/uploads` served every upload without authentication.** The static mount exposed progress photos, chat
photos and voice notes to anyone with the name, and any stored `.html` as a page. The portal never uses it. Fix:
the mount is removed. Files are served only by the checked `/api/files/*` and `/api/v2/chat/media/*`.
Test: matrix last row.

### Medium

**F-06: Meal bank across tenants.** Trainers saw other trainers' private items (list and Excel export), and
`POST /meal-bank/cleanup-duplicates` deleted duplicates across **all** tenants. Fix: trainers see their own items
plus public ones; cleanup only touches the caller's items.

**F-11: Notifications to other tenants.** `POST /api/notifications/` let any trainer send a notification to any
user (for example "Pay now" phishing to a competitor's client), and `/trigger/goal-check/{client_id}` had no
ownership check. Fix: a trainer can only target themself or their own clients. Tests: matrix rows.

**F-12: Websocket.** `POST /api/ws/ws/test-notification/{user_id}` was **unauthenticated** (anyone could push a
fake "system" message to any user). `GET /api/ws/ws/stats` was public. The socket's `send_message` could DM any
user id in any tenant. Fix: test-notification is admin-only and never available in production; stats are
admin-only; DMs are limited to a client and their own trainer. Channel subscription was already bound to the
token user (proved: connecting to another id is rejected with 403). Tests: matrix rows, plus a manual socket test.

**F-13: SSRF through a custom AI "base URL".** A trainer may store an OpenAI-compatible endpoint, and the server
POSTs to it (agent, meal-photo AI, article writer). Any URL was accepted, including `127.0.0.1`,
`169.254.169.254` and private networks. Fix: `app/services/url_safety.py`. In production only https URLs whose
host resolves to public addresses are accepted. The check runs when a key is saved **and again each time it is
used** (keys saved earlier included). Residual: DNS rebinding and redirects (urllib follows 30x redirects with
GET). Test: `test_ssrf_guard_in_production`.

**F-14: Studio open to every trainer.** Leads (names, phones), public site texts, SEO, articles and QA tickets
are editable by any trainer. This is a product decision for a one-studio business. Fix (opt-in): set
`STUDIO_OWNER_IDS=<comma-separated user ids>` and only admins plus those trainers get the studio.

**F-15: No cost limit on AI endpoints.** Any signed-in user, clients included, could spend the trainer's AI credit
through `/api/translate` (80 texts × 2000 characters per call), `/v3/meals/ai/photo`, `/studio/agent/*`,
`/studio/seo/generate`, `/v3/meals/variants/generate` and `/studio/ai-keys/{id}/test`. Fix:
`app/services/rate_limit.py`, per user: AI 20/minute and 400/day, translate 60/minute and 3000/day. The photo
upload is now read only up to its 8 MB limit. Test: `test_ai_rate_limit`.

**F-17: Exercise `video_url` accepted `javascript:` URLs.** The value is rendered as `<a href>` for clients.
Fix: `app/schemas/safe_types.py`. Input must be http(s). On output, old non-http values are dropped instead of
failing the response. Test: `test_video_url_must_be_http`.

**F-18: Vulnerable dependencies.** `npm audit` found 13 advisories (11 high). A semver-compatible lockfile update
leaves 3 (the portal build was verified). Remaining: `react-router` 6.x (open redirect / XSS via redirects; the
portal never navigates to untrusted paths, so Low here; the fix is the 7.x major) and `zod` <4.6.6 (memory DoS;
fix is the 4.x major). `pip-audit`: `python-jose` 3.5.0 and its `ecdsa` dependency (PYSEC-2026-4298 /
PYSEC-2026-1325). That is the JWT library, so it is handed to the auth audit: move to PyJWT.

### Low (listed, not fixed unless noted)

- L-01 (fixed): `/api/files/debug/paths` and `/api/files/media/stats` exposed server paths and file listings to
  any user. They are admin-only now.
- L-02 (fixed): `GET /check-ins/trainer/dashboard` returned 500 for non-trainers (a local `status` variable
  shadowed the module). It now returns 403.
- L-03 (fixed): the `/api/v3/meals-mock` router (static data, no auth) is no longer mounted in production.
- L-04 (fixed): the article sanitizer accepted `href="/\host"` (browsers read it as `//host`) and kept
  `rel="opener"`. Twenty bypass payloads (event handlers, `javascript:` with entities, SVG/MathML, nested script)
  were all neutralised.
- L-05 (fixed): muscle groups could be renamed or deleted by any trainer. Now only the creator or an admin can.
- L-06: the global `SecurityMiddleware` limiter keys on `request.client.host` + exact path. Behind Railway's proxy
  that is probably one shared IP (uvicorn trusts forwarded headers only from 127.0.0.1), so every user shares a
  100/min bucket per path, and the store grows without bound with each distinct id in a path. Recommendation:
  start uvicorn with `--proxy-headers --forwarded-allow-ips='*'` behind Railway, and cap or expire the store.
- L-07: the public lead form's rate limit trusts the first `X-Forwarded-For` value, which a client can forge.
- L-08: the Instagram webhook verifies `X-Hub-Signature-256` correctly (HMAC-SHA256, constant-time compare). It
  has no replay or dedupe protection: Meta sends no timestamp, so dedupe on the comment id if replies must never
  repeat.
- L-09: any trainer can claim an *unassigned* client. The real fix is for `POST /auth/register/client` to set
  `trainer_id` (that file belongs to the auth audit).
- L-10: email and username changes on `PUT /users/{id}` need no verification (auth audit).
- L-11: unmatched questionnaires (health answers by email) are visible to every trainer.
- L-12: `POST /exercise-library/backfill-instructions` fills empty instructions on every tenant's exercises (from
  the built-in library or wger). It also runs at startup.
- L-13: the websocket token travels in the query string, so it lands in proxy logs.
- L-14: `/metrics` and `/status/database` need no auth (pool statistics only).
- L-15: the Docker image runs as root. Railway mounts its volume root-owned, so add a `USER` only together with
  `RAILWAY_RUN_UID` or a `chown` of `/app/persistent` at start, and test on staging.
- L-16: `AI_KEY_SECRET` falls back to `JWT_SECRET`, and then to a constant. Set a dedicated `AI_KEY_SECRET` in
  Railway, or rotating the JWT secret will make every saved AI key unreadable.
- Functional bugs seen while testing (not security): `POST /v2/workouts/days/{id}/exercises` saves the row but
  answers 500 (its response model types `exercise` as a dict); `POST /api/studio/leads` returns 500 (duplicate
  `source` argument); several date query parameters return 500 instead of 400 on bad input.

## OWASP API Security Top 10 (2023)

| # | Risk | Status | Evidence |
|---|---|---|---|
| API1 | Broken Object Level Authorization | **Fixed** (F-02, F-04, F-05, F-06, F-08) | Fuzzer + 39-row matrix; 22 rows succeed on `main`, 0 on the branch |
| API2 | Broken Authentication | Out of scope (auth audit) | F-16 passwords reported; websocket auth checked (token required, user bound) |
| API3 | Broken Object Property Level Authorization | **Fixed** (F-01 mass assignment, F-03 exposure) | `role`/`is_active` guarded; no `hashed_password` or tokens in any response (grep of every response in the fuzz runs) |
| API4 | Unrestricted Resource Consumption | **Partly fixed** (F-15); L-06 open | Per-user AI limits; upload reads capped; pagination capped (`le=100` / `le=200`; legacy exercises allow 10000) |
| API5 | Broken Function Level Authorization | **Fixed** (F-12, L-01, L-03); F-14 opt-in | Admin-only system routes verified; test endpoints closed |
| API6 | Unrestricted Access to Sensitive Business Flows | Partly | Lead form: honeypot + rate limit (L-07); notifications scoped (F-11) |
| API7 | Server Side Request Forgery | **Fixed** (F-13) | Other fetches use fixed hosts (OFF, USDA, wger, MyMemory, Commons); barcode is `\d{6,14}` |
| API8 | Security Misconfiguration | Partly | `/uploads` removed (F-10); docs off in production; root container (L-15); headers are the auth audit's |
| API9 | Improper Inventory Management | **Fixed** | Unused nutrition router and the production mock removed; `/test` routes are harmless |
| API10 | Unsafe Consumption of APIs | OK | AI output parsed as JSON; agent writes need trainer confirmation; article HTML sanitised before rendering |

## ASVS 4.0.3 Level 2 (selected requirements)

| Req | Topic | Result |
|---|---|---|
| V4.1.1 / 4.1.3 | Access control enforced server-side, least privilege | Pass after the fixes (central `app/auth/access.py`) |
| V4.1.5 | Access control fails securely | Pass: refusals are 404/403; L-02 fixed |
| V4.2.1 | Protection against IDOR | Pass after F-02/F-04/F-08; regression suite |
| V4.2.2 | CSRF protection | N/A: bearer tokens in a header, no cookies |
| V4.3.1 | Admin interfaces protected | Pass (`/system/*`, debug, stats) |
| V5.1.3 / 5.1.4 | Input allow-lists, structured validation | Mostly Pydantic; `video_url` (F-17); bad dates give 500 (Low) |
| V5.2.1 / 5.3.3 | Sanitize HTML, escape output | Pass: React escaping; the article sanitizer survived 20 bypasses (L-04 hardened) |
| V5.2.6 | SSRF protection | Pass after F-13 |
| V5.3.4 / 5.3.5 | Parameterised queries | Pass: ORM throughout; the two f-string SQL statements use whitelisted names; no user-controlled ORDER BY |
| V8.1.1 / 8.3.4 | Sensitive data not cached or exposed | Fail (F-16 public repo, user action). Private media is now `Cache-Control: private` |
| V8.2.2 | No sensitive data in browser storage | Tokens in `localStorage` (auth audit); this is why F-09 was High |
| V10.3.2 | No unauthorised update channels | OK |
| V12.1.1 | Upload size limits | Pass: 8–25 MB; reads capped |
| V12.2.1 | Upload type checked by content | Pass: libmagic plus a re-encode (avatars, chat, progress); extension from content (F-09) |
| V12.3.1 / 12.3.2 | No path traversal, user names not used for paths | Pass: basename and folder confinement; traversal probes return 404 |
| V12.4.1 | Uploads outside the web root | Pass after F-10 |
| V12.5.2 | Uploads never served as HTML | Pass after F-09 |
| V13.1.3 | No secrets in URLs | Websocket token in the query string (L-13) |
| V13.2.1 | HTTP methods restricted | Pass |
| V13.2.6 | Content-Type checked | Pass (FastAPI) |

Secrets: tracked files and the full git history were grepped for API-key, token, private-key and DSN patterns.
**No live secrets** (the known `.cursor/railwaytoken.txt` is the auth audit's). `render.yaml` uses `sync: false`
for secrets. The committed data (F-16) is the real exposure.

## What you must do

1. **Treat the database and photos in the repository history as leaked** (F-16). Make `ecshape/ecshape` private
   (this needs Ariel). Purge `data/elior_fitness.db*` and `uploads/progress_photos/*` from history
   (`git filter-repo`) and force-push. Assume forks and clones already exist.
2. **Rotate the passwords of the admin, trainer and client accounts** found in that database, at least the four
   with guessable passwords, if any of them exist in production. Then tell the affected clients that their
   progress photos were exposed (GDPR / Israeli privacy law notification duty — check with legal).
3. Set `STUDIO_OWNER_IDS` in Railway if trainers other than the studio owner use the portal (F-14).
4. Set a dedicated `AI_KEY_SECRET` (L-16).
5. Plan the majors: `react-router-dom` 7, `zod` 4, and `python-jose` → PyJWT (with the auth audit).
6. Review and merge this branch, then deploy. The portal flows touched by the changes (adding a client, editing a
   client, listings, photos, meal and workout editing) were exercised through the API, but not clicked through in
   the browser.
