# ECShape authentication, session and secrets audit — November 2026

**Scope:** sign-in, sign-up and account creation, password storage and policy, password change and reset, JWT
sessions, sign-out, WebSocket auth, the QA agent key, dev and demo shortcuts, CORS and security headers, and
secrets handling. Backend: `app/`. Portal: `Frontend/src`. API authorization, uploads and webhooks were audited in a
parallel session and are out of scope here, except where they touch authentication.

**Standard:** OWASP ASVS 4.0.3 Level 2 (V2, V3, V4 where it concerns auth, V6, V7, V8, V13, V14). Also the OWASP
Authentication, Session Management, Password Storage, Forgot Password, JWT and MFA cheat sheets.

**Method:** I read every call path from the scope files. I then attacked a local copy of the API on `localhost:8050`
(scratch SQLite DB, `DEV_DEMO_SEED=1`) and the portal on `localhost:5210`. The attack script ran 44 probes against
the unfixed code and 46 against the fixed code. No deployed host was touched.

**Baseline:** `sam-dev-1` @ `ab852c3`. **Fixes:** branch `claude/auth-audit-2026-11` (commits `1dc83c4`, `0d6ab6c`,
plus this report).

| Run | Probes flagged vulnerable |
|---|---|
| Before fixes | 36 / 44 |
| After fixes | 1 / 46: `http://localhost` origins are still allowed on a *local* run, by design. Deployed hosts refuse them (pytest `test_m4_cors_localhost_only_off_deployed_hosts`). |

**Regression tests:** `tests/security/test_auth_audit.py`, 49 tests, all passing. Run them with
`python -m pytest tests/security -q`.

**Existing suites:**
- `test_instagram_webhook.py`: 9/9 pass.
- `test_meal_variant_solver.py`: 16/16 pass.
- `test_meal_variants_e2e.py`: 3 failures on this branch and 4 on untouched `sam-dev-1`. Those failures were there
  before this work; that test replaces auth with a stub, so none of these changes are in its path.

**Portal:** `vite build` passes. Checked end to end in the browser:
- the login page looks unchanged;
- signing in works;
- both WebSockets connect, and the URL carries no token;
- signing out makes the old token return 401 on the server.

---

## 1. What you must do yourself

1. **Rotate the Railway API token now.** `.cursor/railwaytoken.txt` (36 chars) was committed in the first commit
   (`d4fe92a`) and is still in git history. The `ecshape/ecshape` repository is public. The file is no longer tracked
   and is in `.gitignore`, but only a history rewrite removes it, and that needs Ariel (org owner): for example
   `git filter-repo --path .cursor/railwaytoken.txt --invert-paths` followed by a force push.
2. **Assume every secret on the production and dev-preview API services has leaked**, because of finding C1
   (unauthenticated file read, so `/proc/self/environ` was readable). Rotate:
   - `JWT_SECRET`;
   - the Postgres password (`DATABASE_URL`);
   - `ADMIN_PASSWORD`;
   - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `FDC_API_KEY`;
   - `INSTAGRAM_*`, `QUESTIONNAIRE_WEBHOOK_SECRET` and any SMTP credentials.

   Search the Railway HTTP logs for `%2e%2e`, `..%2f` and `/proc/` to see whether it was used.
3. **Set `JWT_SECRET` before deploying this branch.** Use 48+ random characters on *both* Railway services
   (`python -c "import secrets; print(secrets.token_urlsafe(48))"`). The API now refuses to start on Railway
   without a strong one (finding C4). Changing it signs everyone out once. Trainers' saved AI keys are encrypted with
   a key derived from `JWT_SECRET`, so either set `AI_KEY_SECRET` to the old `JWT_SECRET` value first, or (better,
   given point 2) ask coaches to re-enter their AI keys.
4. On the ecshape.com service, confirm `ENVIRONMENT=production` is set and that **`DEV_DEMO_SEED`,
   `ALLOW_TEST_REGISTER`, `ALLOW_PUBLIC_SIGNUP` and `ALLOW_ADMIN_SETUP` are not set**.
5. Decide whether the **dev preview** (`api-production-9d8a41c7.up.railway.app`) should keep the one-click demo
   login. It is reachable from the internet, and any visitor gets a trainer session there. That session can read QA
   tickets and mint the QA agent key (finding M2). Unset `DEV_DEMO_SEED` there, or put the preview behind Railway or
   Vercel protection.
6. Optional settings:
   - `PUBLIC_APP_URL=https://ecshape.com` plus `EMAIL_*`, if you ever want emailed password resets (today nothing
     is sent);
   - `PASSWORD_MIN_LENGTH=12` for full ASVS 2.1.1 (it also needs the portal's "8 characters" copy updated in every
     language);
   - `SESSION_MAX_DAYS` (default 30) and `ACCESS_TOKEN_EXPIRE_MINUTES` (default 1440).
7. The repo history also contains a SQLite database with what appears to be real client data (noted 2026-11-18).
   Same history rewrite, same owner.

---

## 2. Findings

CVSS 3.1 base scores. "Conditional" means the score assumes the precondition in the text.

### Critical

**C1 — Unauthenticated arbitrary file read through the SPA catch-all route** · CVSS 9.8
(AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H) · *Fixed*

`serve_spa_routes` and the `OPTIONS /{full_path}` handler in `app/main.py` did
`os.path.abspath(os.path.join("static", full_path))` with no containment check. Starlette decodes `%2e%2e`/`%2f`,
so any file the process can read was served.

Reproduction: `GET /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd` returned 200 with the file;
`/%2e%2e/app/auth/utils.py` returned source; `/%2e%2e/.claude/launch.json` returned the local dev passwords. On
Railway, `/proc/self/environ` would give every secret. The production `SecurityMiddleware` only blocks `curl`-like
User-Agents, so a browser UA gets through.

Fix: `_safe_static_path()` resolves with `realpath` and requires `commonpath == static root`. Both handlers use it.

Test: `test_c1_spa_route_does_not_serve_files_outside_static` (4 payloads, GET and OPTIONS).

**C2 — Any signed-in user can make themselves ADMIN (mass assignment)** · CVSS 9.9
(AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H) · *Fixed*

`PUT /api/users/{id}` and `PUT /api/users/me` copied every field of `UserUpdate`, including `role` and `is_active`,
onto the row (`user_service.update_user` → `setattr`).

Reproduction: as `client1`, `PUT /api/users/3 {"role":"ADMIN"}` → 200, and `/auth/me` then showed `ADMIN`. A trainer
could likewise turn its client into a TRAINER.

Fix: `_guard_privileged_fields` in `app/routers/users.py`:
- `role` can only be changed by an admin;
- `is_active` can be changed by an admin, or by a trainer for their own client (not themselves);
- a role change or deactivation bumps `token_version`, which signs the user out everywhere.

Tests: `test_c2_*` (3 tests).

**C3 — `POST /api/auth/setup/admin` creates an ADMIN without authentication** · CVSS 8.1 conditional
(AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H) · *Fixed*

It worked whenever no ADMIN row existed: a fresh database, or a Railway boot where `setup_admin.py` exits because
`ADMIN_PASSWORD` is missing. `start.sh` continues regardless. Any password was accepted, including `"a"`.

Reproduction: on the fresh local DB → 201, then logged in as the new admin.

Fix: 404 unless `ALLOW_ADMIN_SETUP=1`. Still only works while no admin exists. Password policy applies.

Test: `test_c3_setup_admin_disabled_by_default`.

**C4 — Forgeable session tokens when `JWT_SECRET` is unset** · CVSS 8.1 conditional
(AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H) · *Fixed*

`SECRET_KEY = os.getenv("JWT_SECRET", "your-secret-key-here")`, and the algorithm was read from `JWT_ALGORITHM`.
There was no `iss`/`aud`/`jti`/type claim. The role sat in the token (the server did re-read it from the DB, which
was correct).

Reproduction: an HS256 token signed with `your-secret-key-here` for user 3 → `/auth/me` 200. `alg:none` was already
refused.

Fix: `app/auth/config.py`:
- on any deployed host (Railway/Render vars or `ENVIRONMENT=production|staging|preview`) the process refuses to
  start with a missing, short (<32) or placeholder secret;
- locally it generates a random key and keeps it in `PERSISTENT_PATH/.dev-jwt-secret` (0600);
- HS256 is pinned in code;
- tokens must carry `exp`, `iat`, `nbf`, `jti`, `iss`, `aud`, `typ=access`, `tv` (session epoch) and `auth_time`;
- one shared verification path (`user_from_token`) serves HTTP, WebSocket and the QA key.

Tests: `test_c4_*` (4 tests, including subprocess start-up checks).

**C5 — Password reset: any account taken over with only its email address** · CVSS 9.1
(AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N), likely exploitable in production today · *Fixed*

`password_service.py` signed reset JWTs with `RESET_TOKEN_SECRET`, defaulting to `your-reset-token-secret-key`. The
portal has no reset screen, so that variable was almost certainly never set, yet `/password-reset/verify` was live.
Emails were public through H1. Further problems:
- tokens were reusable for 30 minutes and survived a password change;
- the link base came from the request `Host` header (link poisoning);
- the token went in the query string (Referer and log leakage);
- the SMTP error was printed;
- the verify step said "User not found" for unknown accounts.

Reproduction: forged token for the trainer's email → 200, password changed. The same token worked a second time.

Fix:
- the reset key is derived from `JWT_SECRET` (HMAC, domain-separated);
- the token is bound to user id + a fingerprint of the current password hash, so it is single-use and dies on any
  password change;
- 30-minute expiry, one generic error;
- the link uses `PUBLIC_APP_URL` (https only), with the token in the URL **fragment**;
- the email goes out from a background task, so response and timing are identical whether the account exists or not;
- requests and verifies are throttled;
- a successful reset ends all sessions.

Tests: `test_c5_*` (4 tests).

### High

**H1 — Public endpoint listing every account** · CVSS 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N) · *Fixed*

`GET /api/auth/registered-users`, with no auth, returned id, username, email, role and full name for every user.
That is a ready target list for credential stuffing and C5, and a personal-data leak. The portal never called it.

Fix: endpoint removed.

Test: `test_h1_registered_users_list_removed`.

**H2 — No brute-force or credential-stuffing protection on sign-in; global limit keyed on the proxy IP** · CVSS 7.3
(AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:L) · *Fixed*

30 wrong passwords in a row were all answered 401, and the right one then still worked. The only limit was
`SecurityMiddleware`'s 100 requests/min per *IP+path*. Behind Railway/Vercel the IP is the proxy's, so all users
shared one bucket, which made it a global sign-in denial of service rather than a defence.

Fix: `app/auth/throttle.py`:
- 10 failures per account name per 15 min, applied to *any* typed name so it can't enumerate accounts;
- 50 failures per client IP per 15 min;
- 429 with `Retry-After`;
- a success clears the account counter;
- also applied to password change, reset request and reset verify;
- the real client IP comes from the first `X-Forwarded-For` hop, but only when the peer is a private or loopback
  proxy. The global middleware uses the same helper.

Tests: `test_h2_*` (4 tests).

**H3 — Sessions could not be revoked** · CVSS 7.1 (AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N) · *Fixed*

- Sign-out only cleared localStorage.
- A password change or reset left every existing 24 h token working.
- `/auth/refresh` minted a new token from any valid token forever, so a stolen token never died.
- Deactivation or a role change didn't end sessions.

Fix:
- `users.token_version`, an additive migration run in `main.py` and `setup_admin.py`, is bumped on password change
  and reset, trainer/admin reset, deactivation and role change;
- `POST /api/auth/logout` deny-lists the token's `jti` in the new `revoked_tokens` table until it expires; the portal
  calls it on sign-out;
- `/refresh` refuses once `SESSION_MAX_DAYS` (30) have passed since the original sign-in (`auth_time`);
- password change returns a fresh token for the current device, and the trainee profile screen stores it.

Tests: `test_h3_*` (5 tests).

### Medium

| ID | Finding | CVSS | Status |
|---|---|---|---|
| M1 | **No password policy.** 1-character passwords were accepted at sign-up, client creation, change and reset. Passwords over 72 bytes were silently truncated by bcrypt, and 1 MB passwords caused a 500. Fix: `app/auth/password_policy.py`: min 8 (configurable), max 72 UTF-8 bytes (refused rather than truncated), blocks common passwords and ones containing the username or email; request fields capped at 1024 chars (422, not 500). Tests: `test_m1_*`. | 5.3 | Fixed |
| M2 | **Password-free demo sign-in can switch on in production.** `DEV_DEMO_SEED=1` alone enabled `/auth/demo-login/{role}`. Fix: also refused when `ENVIRONMENT=production`. The public dev preview still has it: see §1.5. Test: `test_m2_demo_login_refused_in_production`. | 6.5 | Fixed (prod) / user decision (preview) |
| M3 | **User enumeration by timing and by message.** An unknown username skipped bcrypt (1 ms vs 173 ms). Sign-up said "Email already registered" vs "Username already registered". Fix: a dummy bcrypt verify on the unknown-user path (measured 168 ms vs 168 ms); one combined clash message; inactive accounts get the same 401. Test: `test_h2_login_timing_does_not_reveal_accounts`, `test_h2_unknown_user_gets_same_answer_and_lockout`. | 5.3 | Fixed |
| M4 | **Anonymous self-sign-up** gave anyone an authenticated CLIENT foothold, even though the portal never offers sign-up. Fix: 403 unless `ALLOW_PUBLIC_SIGNUP=1`. `/register/test` is also refused on any deployed host. | 5.3 | Fixed |
| M5 | **Credentialed CORS for origins anyone can register**: any `*.up.railway.app`, `*.duckdns.org`, any `http://localhost:*`, plain-http `ecshape.org`. Bearer tokens limit the impact today, but it would be critical the moment cookies are used. Fix: exact `CORS_ORIGINS` plus `https://` on `ecshape.com`/`ecshape.org` and their subdomains; localhost only off deployed hosts. Tests: `test_m4_*`. | 4.3 | Fixed |
| M6 | **Missing headers.** No CSP, no `Cache-Control: no-store` on token responses, and HSTS only when `ENVIRONMENT` was literally `production`. Fix: API `default-src 'none'; frame-ancestors 'none'`; SPA shell `frame-ancestors 'none'; object-src 'none'; base-uri 'self'`; `no-store` on `/api/auth/*`; HSTS on every deployed host; `Permissions-Policy`. Test: `test_m6_security_headers`. | 4.3 | Fixed |
| M7 | **Unauthenticated configuration disclosure.** `/metrics`, `/status/database` and `/api/test` (CORS list) were public; `/api/debug/env` was open to any signed-in user off production. Fix: admin only; `/api/test` trimmed. Test: `test_m7_*`. | 5.3 | Fixed |
| M8 | **Session token in the WebSocket URL** (`/api/ws/{id}?token=<jwt>`), written to uvicorn and proxy access logs (confirmed in the local log). Fix: the token travels in `Sec-WebSocket-Protocol: ecshape.bearer, <jwt>`; `?token=` is refused. Portal updated (`NotificationContext`, `chat/api.ts`, `chat/hooks.ts`). Test: `test_m8_*`. | 4.2 | Fixed |
| M9 | **AI-provider keys encrypted with a constant published in the repo** when no secret was set (`ecshape-dev-ai-key-secret`). Fix: the constant is gone; deployed hosts can't start without `JWT_SECRET`, and local runs use the generated key. | 5.9 cond. | Fixed |
| M10 | **Logging.** Token prefixes, the JWT config and full tracebacks were logged on every auth failure; the SMTP error was printed. Fix: only the exception class name is logged; nothing token-derived. | 3.1 | Fixed |

### Low and informational (not fixed: listed for decision)

| ID | Item |
|---|---|
| L1 | The access token lives in `localStorage`, so any XSS can steal it. The CSP above helps only partly (the SPA shell has no `script-src` yet, because inline scripts and third-party fonts and images need an inventory first). The long-term fix is an httpOnly `SameSite=Strict` cookie plus a CSRF token. |
| L2 | No MFA. ASVS L2 doesn't strictly require it, but admin and trainer accounts hold client health data. TOTP for ADMIN/TRAINER is recommended (OWASP MFA cheat sheet). |
| L3 | Minimum password length is 8 (NIST 800-63B), not ASVS's 12, to match the portal copy in every language; `PASSWORD_MIN_LENGTH=12` switches it. Breached-password checking uses a local list, not the HIBP k-anonymity API (sending data to an external service is your call). |
| L4 | Trainers set clients' first passwords and share them out of band. There is no invite link and no forced change on first sign-in (ASVS 2.3.1), and no notification when a password or email changes (no email system configured). |
| L5 | Username and email can be changed without re-entering the password (ASVS 3.7.1). A trainer can change a client's email. |
| L6 | QA agent key: 256-bit random, only SHA-256 stored, constant-time compare, QA endpoints only, acts as its creator. Weak points: there is one global key, any trainer can rotate or revoke it, and it never expires. Make it per-creator, or admin-only, with an expiry. |
| L7 | `Frontend/src/pages/SecretUsersPage.tsx` (admin only) shows guessed passwords of the form `username123`. That reveals a past convention, and accounts may still use it. Delete the page and make sure no account has that password. |
| L8 | `setup_admin.py` promotes any existing user named `admin` or `admin@elior.com` to ADMIN at boot. Not exploitable now that anonymous sign-up is off, but fragile. |
| L9 | The throttle and the deny-list cache are per process and in memory. Fine for the current single worker; use Redis or the DB if you add workers. A spoofed `X-Forwarded-For` moves an attacker into another IP bucket, but the per-account cap still applies. The soft lockout can be used to lock a known user out for up to 15 min (accepted trade-off, ASVS 2.2.1). |
| L10 | `python-jose` 3.5 has had algorithm-confusion and JWE-bomb CVEs (CVE-2024-33663/33664). Not reachable here (HS256 pinned, no JWE), but PyJWT is better maintained. |
| L11 | `/health` still shows `environment` and DB pool stats publicly (Railway's health check uses `/`, so this could be trimmed). |
| L12 | `SecurityMiddleware`'s User-Agent blocklist and Origin check are not security controls: both are trivially bypassed. They do no harm, but don't count on them. |
| L13 | No audit trail of auth events (successful sign-ins, lockouts, password changes) with alerting (ASVS 7.1.3, 7.2.1). |
| L14 | The `.cursor/` folder (rules, worktrees) is still tracked. Nothing else secret-looking was found, but it doesn't belong in the repo. |

Handed to the API-authorization session (not fixed here): `POST /api/users/clients/{id}/assign` lets any trainer
attach any client to itself.

---

## 3. ASVS 4.0.3 Level 2 checklist

✅ pass · ❌ fail · ⚠️ partial / accepted deviation · N/A not applicable. "Fixed" means it failed on `ab852c3` and
passes on this branch.

### V2 Authentication

| ID | Requirement (short) | Result | Evidence |
|---|---|---|---|
| 2.1.1 | Passwords ≥ 12 chars | ⚠️ Fixed to 8 | `password_policy.min_length()`; 12 via env (L3) |
| 2.1.2 | ≥ 64 chars permitted | ⚠️ | up to 72 bytes (bcrypt limit), refused rather than truncated |
| 2.1.3 | No truncation | ✅ Fixed | > 72 bytes refused (`test_m1_policy` "x"*73) |
| 2.1.4 | Any printable Unicode allowed | ✅ | no character-class filter |
| 2.1.5 | Users can change their password | ✅ | `/auth/password/change`, trainee profile sheet |
| 2.1.6 | Change requires the current password | ✅ | `change_password` verifies; throttled |
| 2.1.7 | Breached / common passwords refused | ⚠️ Fixed (local list) | `_COMMON` blocklist; no HIBP (L3) |
| 2.1.8 | Strength meter | ❌ | not present in the portal (UI work) |
| 2.1.9 | No composition rules | ✅ | length + blocklist only |
| 2.1.10 | No periodic rotation | ✅ | none |
| 2.1.11 | Paste / password managers allowed | ✅ | `autoComplete="current-password"`, no paste block |
| 2.1.12 | Show-password option | ✅ | eye toggle on the login page |
| 2.2.1 | Anti-automation (brute force, stuffing) | ✅ Fixed | `throttle.py`; `test_h2_*`; live: 30 failures → 429 |
| 2.2.2 | Weak authenticators (SMS/email) limited | N/A | none used |
| 2.2.3 | Notify user after credential changes | ❌ | no email system (L4) |
| 2.3.1 | System-generated initial passwords random and short-lived | ❌ | trainer-chosen, no expiry (L4) |
| 2.3.2 | Enrolment of user-provided authenticator devices | N/A | no MFA (L2) |
| 2.3.3 | Renewal instructions | N/A | |
| 2.4.1 | Passwords stored with an approved KDF + salt | ✅ | bcrypt `$2b$12$` (checked in the DB) |
| 2.4.2 | Salt ≥ 32 bits, unique | ✅ | bcrypt 128-bit salt |
| 2.4.3 | PBKDF2 iterations | N/A | bcrypt |
| 2.4.4 | bcrypt work factor ≥ 10 | ✅ | `bcrypt__rounds=12` |
| 2.4.5 | Extra secret iteration (pepper) | ⚠️ | none (L2 "should") |
| 2.5.1 | Activation / recovery secret not sent in clear | ✅ Fixed | reset token in the URL fragment, single use |
| 2.5.2 | No password hints / knowledge questions | ✅ | none |
| 2.5.3 | Recovery doesn't reveal the current password | ✅ | |
| 2.5.4 | No shared / default accounts | ⚠️ | `admin123` is local-only (refused on Railway); demo accounts on dev preview (M2) |
| 2.5.5 | Notify on authenticator change | ❌ | L4 |
| 2.5.6 | Forgot-password uses a secure recovery mechanism | ✅ Fixed | C5 |
| 2.5.7 | Lost OTP/MFA authenticator re-proofing | N/A | |
| 2.6.x | Look-up secrets | N/A | |
| 2.7.x | Out-of-band verifiers | N/A | |
| 2.8.x | One-time verifiers | N/A | (`input-otp.tsx` is a UI component, not used in auth) |
| 2.9.x | Cryptographic verifiers | N/A | |
| 2.10.1 | Service credentials not default | ✅ Fixed | JWT/AI-key/reset defaults removed (C4, C5, M9) |
| 2.10.2 | Service accounts not using default creds | ⚠️ | `ADMIN_PASSWORD` required on Railway; local default only |
| 2.10.3 | Passwords stored with protection | ⚠️ | in Railway env vars; leaked through C1 → rotate |
| 2.10.4 | Secrets not in source | ❌ → partly fixed | Railway token in history (§1.1); file untracked |

### V3 Session management

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| 3.1.1 | Session token never in URL | ✅ Fixed | WebSocket moved to subprotocol (M8); reset token in fragment |
| 3.2.1 | New token on authentication | ✅ | new `jti` on every sign-in |
| 3.2.2 | ≥ 64 bits of entropy | ✅ | HS256 signature + 128-bit `jti` |
| 3.2.3 | Stored securely in the browser | ⚠️ | `localStorage` (L1) |
| 3.2.4 | Approved crypto for tokens | ✅ | HMAC-SHA256, ≥ 32-char secret enforced |
| 3.3.1 | Logout invalidates the session | ✅ Fixed | `/auth/logout` deny-list; `test_h3_logout_revokes_token`; checked in the browser |
| 3.3.2 | Re-authentication periodically (L2: 12 h / 30 min idle) | ⚠️ Fixed (30 d) | absolute `SESSION_MAX_DAYS`; product choice for trainees |
| 3.3.3 | Option to end all other sessions after password change | ✅ Fixed | `token_version`; `test_h3_password_change_*` |
| 3.3.4 | Users can see / log out active sessions | ❌ | no session list (L) |
| 3.4.x | Cookie attributes | N/A | no cookies |
| 3.5.1 | Users can revoke OAuth tokens / linked apps | N/A | no OAuth |
| 3.5.2 | Session tokens, not static API secrets | ⚠️ | QA agent key is a static secret (L6) |
| 3.5.3 | Stateless tokens use signatures and protect against tampering | ✅ Fixed | HS256 pinned, iss/aud/typ/jti required (C4) |
| 3.7.1 | Re-auth before sensitive changes | ⚠️ | password change: yes. Email / username: no (L5) |

### V4 Access control (as it concerns authentication)

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| 4.1.1 | Enforced server-side | ✅ | role read from the DB on every request, not from the token |
| 4.1.2 | Attributes can't be changed by users | ✅ Fixed | C2 mass assignment |
| 4.1.3 | Least privilege | ✅ Fixed | `/setup/admin`, public sign-up, `/register/test` closed (C3, M4) |
| 4.1.5 | Access control fails securely | ✅ | every token error → 401; inactive → 403/401 |
| 4.2.1 | Protection against IDOR on account endpoints | ✅ (auth scope) | trainer password reset only for own clients; other IDOR: API session |
| 4.3.1 | Admin interfaces need appropriate auth | ✅ Fixed | `/metrics`, `/status/database`, `/api/debug/env` admin only (M7) |
| 4.3.2 | Directory browsing / metadata disabled | ✅ Fixed | C1 traversal; `/docs` off in production |

### V6 Stored cryptography

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| 6.2.1 | Modules fail securely | ✅ | jose errors → 401 |
| 6.2.2 | Proven algorithms | ✅ | bcrypt, HMAC-SHA256, Fernet |
| 6.2.5 | No insecure modes / algorithms | ✅ Fixed | algorithm pinned, not env-configurable |
| 6.3.1 | Random values from a CSPRNG | ✅ | `secrets.token_urlsafe` for jti, keys, agent key |
| 6.4.1 | Secrets in a secrets manager / env | ⚠️ | Railway env; no repo defaults any more |
| 6.4.2 | Key material not exposed to the app | ⚠️ | C1 exposed it → rotate |

### V7 Errors and logging

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| 7.1.1 | No credentials / session tokens in logs | ✅ Fixed | token prefix, WS URL token, SMTP error removed (M8, M10) |
| 7.1.2 | No other sensitive data in logs | ⚠️ | startup prints env names and CORS (not secrets) |
| 7.1.3 | Security events logged | ⚠️ | failed sign-in logged with IP; no success / lockout audit (L13) |
| 7.1.4 | Logs carry enough context | ⚠️ | |
| 7.4.1 | Generic error message, no stack trace | ✅ Fixed | oversized password 500 → 422; 500s say "Internal Server Error" only |

### V8 Data protection

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| 8.1.1 | Sensitive data not cached server-side | ✅ | |
| 8.2.1 | Anti-caching headers on sensitive responses | ✅ Fixed | `Cache-Control: no-store` on `/api/auth/*` |
| 8.2.2 | Browser storage holds no sensitive data | ⚠️ | token in `localStorage` (L1); sign-out clears it and cached queries |
| 8.3.1 | Sensitive data in body / headers, not URL | ✅ Fixed | WebSocket token, reset token |
| 8.3.4 | Personal data identified and protected | ✅ Fixed | `/registered-users` removed (H1) |

### V13 API

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| 13.1.1 | Same encoding / parsers everywhere | ✅ | |
| 13.1.3 | No keys / tokens in URLs | ✅ Fixed | M8 |
| 13.1.4 | Authorization at the URI and resource level | ✅ (auth endpoints) | |
| 13.2.1 | HTTP methods restricted | ✅ | FastAPI routes per method |
| 13.2.3 | CSRF protection for cookie-based APIs | N/A | Bearer header, no cookies |
| 13.2.5 | Content-Type checked | ✅ | pydantic JSON bodies |

### V14 Configuration

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| 14.2.1 | Components up to date | ⚠️ | python-jose (L10), bcrypt 3.2 pinned < 4 |
| 14.3.2 | Debug modes off in production | ✅ Fixed | demo login, test register, setup admin all gated (M2, M4, C3) |
| 14.3.3 | Headers don't expose versions | ✅ | |
| 14.4.1 | Content-Type on every response | ✅ | |
| 14.4.3 | CSP | ⚠️ Fixed (partial) | API strict; SPA frame-ancestors/object/base only (L1) |
| 14.4.4 | `X-Content-Type-Options: nosniff` | ✅ | |
| 14.4.5 | HSTS | ✅ Fixed | on every deployed host |
| 14.4.6 | Referrer-Policy | ✅ | `strict-origin-when-cross-origin` |
| 14.4.7 | Framing restricted | ✅ | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| 14.5.2 | Origin header not used for auth decisions | ⚠️ | `SecurityMiddleware` origin check (L12), not relied on |
| 14.5.3 | CORS allow-list is strict | ✅ Fixed | M5 |

### OWASP cheat-sheet items checked beyond ASVS

- **JWT**:
  - `none` refused (it already was);
  - HS/RS confusion impossible: algorithm pinned to HS256;
  - `typ` claim, so a reset or WebSocket token can't be replayed as an access token;
  - `aud` and `iss` claims;
  - expiry required;
  - revocation through the deny-list and session epoch;
  - the role is never trusted from the token.
- **Forgot password**:
  - uniform response and timing;
  - single-use, short-lived token;
  - not built from Host;
  - no Referer leak;
  - sessions invalidated after a reset.
- **Session fixation**: N/A. The server issues a new token at sign-in and never accepts a client-chosen one.
- **Open redirect after sign-in**: none. `Login.tsx` only follows in-app router state, and only to an allow-list of
  client paths (`clientLanding`).
- **Route guards**: `ProtectedRoute` gates by role on the client, and the server re-checks every call.

---

## 4. Files changed

| Area | Files |
|---|---|
| Backend: new | `app/auth/config.py`, `app/auth/password_policy.py`, `app/auth/throttle.py`, `app/migrations/user_token_version_migration.py` |
| Backend: changed | `app/auth/utils.py`, `app/routers/auth.py`, `app/services/auth_service.py`, `app/services/password_service.py`, `app/schemas/auth.py`, `app/models/user.py` (`token_version`, `RevokedToken`), `app/routers/users.py`, `app/services/user_service.py`, `app/routers/studio.py` (QA key path), `app/routers/websocket.py`, `app/services/websocket_service.py`, `app/services/ai_keys.py`, `app/middleware/security.py`, `app/main.py`, `setup_admin.py` |
| Portal | `contexts/AuthContext.tsx` (server sign-out), `contexts/NotificationContext.tsx` + `components/chat/api.ts` + `components/chat/hooks.ts` (WebSocket token), `features/trainee/ProfileScreen.tsx` (keep session after password change). The login page is unchanged. |
| Repo | `.gitignore` (Railway token, dev JWT secret), `.cursor/railwaytoken.txt` untracked |
| Tests | `tests/security/conftest.py`, `tests/security/test_auth_audit.py` |
