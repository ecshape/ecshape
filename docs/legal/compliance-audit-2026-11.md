# ECShape legal-compliance audit — November 2026

Branch `claude/audit-legal-compliance-248223`, based on `sam-dev-1`. Not pushed or merged. Audit date: 2026-11-20.

> **Not legal advice.** This is an engineering compliance checklist written by an AI assistant, not by a lawyer. Every legal text drafted or changed on this branch — the privacy policy, terms and cancellation, health notice, accessibility statement, credits, the consent and health-declaration texts, the site notices and `docs/legal/distance-sale-disclosure-template.md` — is a **DRAFT that requires review by an Israeli lawyer** before it is published. Business facts nobody has supplied yet appear as visible placeholders (`[להשלמה: …]`, `[TO FILL IN: …]`, `[À COMPLÉTER : …]`) and were never invented.

## 1. Highest-risk items (read these first)

| # | Risk | Why it matters | Status |
|---|---|---|---|
| R1 | **Possible personal-data breach.** The auth audit (sibling session, `docs/security/auth-audit-2026-11.md` on `claude/auth-audit-2026-11`) found an unauthenticated arbitrary file read in `app/main.py`'s SPA catch-all. On Railway this exposes `/proc/self/environ`, including `DATABASE_URL`, which reaches all trainees' health data. | Data Security Regulations 2017: a *severe security incident* must be reported to the Privacy Protection Authority immediately. GDPR Art. 33: within 72 h, if EU residents are affected. | **Lawyer and owner, now.** Check access logs for exploitation. Rotate every secret. Decide on notification. The code fix is on the auth branch. |
| R2 | Trainees never consented to health-data processing. The coach creates their account and the trainee never sees a terms or privacy step. | Amendment 13 treats health data as *especially sensitive*. GDPR Art. 9(2)(a) requires explicit consent. Art. 7(1) requires proof of consent. | **Fixed:** a first-sign-in consent step (nothing pre-ticked), recorded in `privacy_consents`. Existing trainees will see it on their next sign-in. |
| R3 | The policy promised access, a copy and deletion, but no export existed, and deleting an account left photos and voice messages on disk. | Privacy Protection Law s.13–14; GDPR Art. 15, 17, 20. | **Fixed:** ZIP export, self-service erasure including files, and file deletion when a coach or admin deletes a user. |
| R4 | The privacy policy was inaccurate. It named Vercel (not used), left out most AI providers and Meta, and said AI requests go "without your name", but Agent EC sends names, weights and check-ins. | s.11 notice duty; GDPR Art. 13. A misleading notice taints the consent. | **Fixed** in he, en and fr (DRAFT). |
| R5 | No business identification anywhere (name, ח.פ/ע.מ, address, email). | Consumer Protection Law s.14C(b), s.11 notice, terms enforceability. | **Placeholders added.** The owner must fill them in. |
| R6 | The accessibility statement lacked a coordinator, contact details and the date of the last accessibility review. The site's small-print grey failed WCAG AA contrast (3.7:1). | Service Accessibility Regulations 2013, reg. 35; IS 5568 (WCAG 2.0 AA). | **Text and contrast fixed.** Placeholders remain. A **real IS 5568 audit by an accessibility specialist** is still needed. |
| R7 | Marketing claims: "92% reached their goal", "proven results", "100+ clients", "limited spots", "certified trainer". | Consumer Protection Law s.2 (misleading advertising) requires substantiation of claims. | Added the "results vary" note. **The claims themselves need a business decision** (see §6). |
| R8 | Agent EC sends client health data to whichever AI provider the coach picks, including DeepSeek (servers in China). | Transfer Abroad Regulations 2001; GDPR Chapter V. | Disclosed in the policy and the consent text. **Business and lawyer decision:** restrict providers used for client data, and sign DPAs. |
| R9 | The policy promises deletion 24 months after coaching ends and a lead-retention period, but no job does either. | Purpose limitation, and the policy must match practice. | **Open:** the retention periods need a business decision, then a scheduled purge (see §6). |

## 2. Facts established (from code, content and git history)

| Topic | Finding | Evidence |
|---|---|---|
| Controller | Elior Cremisi / ECshape (legal form unknown). Other coaches can use the platform for their own clients, which makes them controllers and ECshape a processor for that data. | `site/content/he.ts`, `app/models/user.py` (`trainer_id`) |
| Payments | **None in code.** Packages are sold off-platform (WhatsApp, phone, Zoom), so §14C applies to those distance sales. Recurring billing is unknown. | grep for stripe, cardcom, tranzila, payplus and others: no hits |
| Account creation | The trainer creates trainee accounts (`POST /auth/register/client`). There is no self-signup. | `app/routers/auth.py` |
| Health data | Weight, measurements, progress photos, check-ins (sleep, hunger, steps), meals and meal photos, workouts, injuries, food preferences, chat (text, photos, voice), and now health-declaration answers. | `app/models/*` |
| Lead form | Name, phone, email, goal, program and free text. It no longer prompts for injuries. Stored in `studio_leads` with no retention limit. | `site/render.ts`, `app/routers/studio.py` |
| Old landing | `landing/` is a standalone nginx copy that sends leads to a **Google Form** and uses its own GA banner. Whether it is still deployed is unknown. | `landing/index.html` |
| Analytics | GA4 `G-6QJ1G81SGP` (Studio can override it). It loads only after "Accept". Verified in the browser: no `googletagmanager` request before consent. | `site/siteMotion.js` |
| Browser storage | `access_token`, `ec-query-cache-v1` (an offline copy of app screens that can contain health data, cleared on logout), `i18nextLng`, `theme`, sidebar and reminder keys, `cookie_consent`, `ec_intro` (session). | grep of `localStorage` / `sessionStorage`; `lib/optimistic.ts` |
| Processors and recipients | Railway (hosting, DB, files); AI providers: OpenAI, Google Gemini, Anthropic, OpenRouter, Mistral, Groq, xAI, DeepSeek; MyMemory (translation); Google Analytics (with consent); jsDelivr (exercise images); YouTube-nocookie; Meta (Instagram auto-reply, WhatsApp); SMTP provider (password reset). Open Food Facts, USDA and wger receive search terms and barcodes only. Google Fonts is **no longer used** (now self-hosted). | URL grep of `app/` and `Frontend/src`; `services/agent_ec.py` tools `list_clients`, `client_details`, `list_prospects` |
| Instagram | Comment auto-reply. Commenter IDs and text are processed but not stored (an in-memory set of the last 5,000 comment IDs). | `services/instagram_service.py` |
| QA widget | Any signed-in user, trainees included, can send a bug report with a screenshot. The team and AI coding tools (`tools/qa.py`) read the tickets. | `components/studio/QaCaptureWidget.tsx` |
| Email and SMS | Transactional password-reset email only. No marketing email, SMS or push. | `services/password_service.py` |
| Minors | The policy said 18+; nothing checked it. Now an 18+ (or parental approval) confirmation is part of consent. | `ConsentGate.tsx` |
| Languages | Legal pages are written in he, en and fr; ru and ar are machine-translated from en by the server. | `legal/i18n.ts`, `routers/i18n_bundle.py` |

## 3. Sources checked (online, 2026-11-20)

The legal pages and statutes were looked up online on 2026-11-20. Most search hits were law-firm and agency summaries rather than the official texts, so the section numbers and details below still need to be checked against Nevo or the Knesset site.
- Privacy Protection Law, Amendment 13 (in force 14 Aug 2025). Summaries by [Pearl Cohen](https://www.pearlcohen.com/israel-significant-amendment-to-the-privacy-law-takes-effect/), [IAPP](https://iapp.org/news/a/israel-marks-a-new-era-in-privacy-law-amendment-13-ushers-in-sweeping-reform), [Baker McKenzie: DPOs and notification](https://resourcehub.bakermckenzie.com/en/resources/global-data-and-cyber-handbook/emea/israel/topics/dpos-and-notification-requirements), [Meitar PDF](https://meitar.com/wp-content/uploads/2025/07/Amendment-13-to-the-Privacy-Protection-Law-Is-on-the-Horizon-–-Is-Your-Organization-Ready-for-the-New-Era-in-the-World-of-Privacy.pdf). PPA guide of 14 Aug 2025: [Digital Policy Alert entry](https://digitalpolicyalert.org/event/32797-privacy-protection-authority-released-professional-guide-for-privacy-protection-law-amendment-no-13). *Sources disagree on the DPO thresholds, so a lawyer must confirm.*
- Data Security Regulations 2017: [official English text, gov.il](https://www.gov.il/BlobFolder/legalinfo/data_security_regulation/en/5777%E2%80%932017.pdf), [IAPP tutorial](https://iapp.org/news/a/the-new-israeli-data-security-regulations-a-tutorial).
- Service Accessibility Regulations 2013, reg. 35: [UN DESA copy](https://social.desa.un.org/sites/default/files/migrated/15/2019/11/Israel_Service-Accessibility-Adjustments.pdf), [Barnea Jaffa Lande](https://barlaw.co.il/practice_areas/internet/client_updates/revision-regulations-requiring-websites-applications-accessible-people-disabilities/); example statements: [State Comptroller](https://www.mevaker.gov.il/en/accessibility-statement), [Deloitte IL](https://www.deloitte.com/il/en/legal/accessibility-statement-t.html).
- Consumer Protection Law s.14C, cancellation and fees: [WIPO Lex (law text)](https://www.wipo.int/wipolex/en/legislation/details/2389), [Mondaq](https://mondaq.com/consumer-law/626544/consumer-protection-law-prescribes-a-general-arrangement-for-canceling-transactions), [Jerusalem Post](https://jpost.com/israel-news/canceling-transactions-credit-card-laws-in-israel-587955). *The four-month extension rules and the s.13D wording come from secondary sources, so a lawyer must confirm.*
- Communications Law s.30A: [law.co.il](https://www.law.co.il/en/news/2016/08/19/israeli-anti-spam-law-amended-for-first-time/), [Hunton](https://www.hunton.com/privacy-and-cybersecurity-law-blog/new-anti-spam-law-takes-effect-in-israel).
- Meta data deletion: [Meta developer docs, data-deletion callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback), [Instagram app setup](https://developers.facebook.com/docs/instagram-platform/create-an-instagram-app).
- FTC Health Breach Notification Rule (amended 2024, in force 29 Jul 2024): [Federal Register](https://www.federalregister.gov/documents/2024/05/30/2024-10855/health-breach-notification-rule).
- GDPR Art. 3, 7, 9, 13, 15–21, 27, 33: [EUR-Lex 32016R0679](https://eur-lex.europa.eu/eli/reg/2016/679/oj). Israel adequacy decision: Commission Decision 2011/61/EU. Cookie consent: ePrivacy Directive Art. 5(3).
- Licences: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), [GSAP Standard licence](https://gsap.com/standard-license), [SIL OFL 1.1](https://openfontlicense.org/).

## 4. Obligation-by-obligation matrix

Status: ✅ compliant in code/content (DRAFT text where noted) · 🟡 partly / needs owner input · 🔴 open · ⚖️ needs lawyer · N/A not applicable.

### Israel: privacy

| Law / section | Requirement | Where | Status | Evidence | Fix |
|---|---|---|---|---|---|
| PPL s.11 (Amendment 13) | Notice when collecting: who the controller is, purpose, whether giving data is a legal duty, recipients, rights | Lead form, app, privacy policy | ✅ DRAFT / 🟡 placeholders | Form notice under the lead form: "no legal obligation… privacy policy". Policy sections "Who is responsible", "Do you have to give it?" | `legal/siteNotices.ts`, `legal/content.ts` |
| PPL, Amendment 13: especially sensitive data | Health data processed only with informed consent and proportionate security | App (trainees) | ✅ | Consent step requires terms+privacy, explicit health consent and 18+, plus the health declaration; rows in `privacy_consents` with version, time, IP and UA (verified in the browser and over the API) | `components/legal/ConsentGate.tsx`, `routers/privacy.py`, `models/privacy.py` |
| PPL s.13 | Right to see one's data | App, privacy policy | ✅ | `GET /api/privacy/export` → ZIP with `data.json` (every table that references the user) and their files. Verified: 10 tables exported for the demo client | `routers/privacy.py`, `features/trainee/PrivacyCard.tsx` |
| PPL s.14 | Right to correct or delete | App | ✅ | `DELETE /api/privacy/me` (typed confirmation "DELETE") removes rows, leads with the same email and files. Verified: user, consents and notifications gone, token rejected (401). A coach or admin deleting a user also removes files (verified for a chat file) | `routers/privacy.py`, `routers/users.py` |
| PPL: consent withdrawal | Consent can be withdrawn | App | ✅ | "Withdraw health-data consent" → the consent step returns | `PrivacyCard.tsx`, `POST /privacy/consent/withdraw` |
| PPL, Amendment 13: DPO | DPO required when the core activity is processing especially sensitive data at scale (thresholds disputed) | Organization | ⚖️ | Placeholder in the policy | Lawyer decides. Fill in `BUSINESS.dpo` |
| PPL, Amendment 13: database registration / notification | Registration narrowed. Notification required for sensitive databases over 100,000 people | Organization | ⚖️ likely N/A | Scale is around 100 clients | Lawyer to confirm |
| Data Security Regs 2017 | Security level (probably medium for health data), written security procedure, access control, logs, annual review, notice of severe incidents | Organization, infra | 🔴 / ⚖️ | Technical controls exist (HTTPS, hashing, access checks; see the auth and API audits). No security procedure document found. **R1 may be a reportable incident.** | Write the procedure and a database-definition document. Decide on R1 |
| Transfer Abroad Regs 2001 | Transfers abroad only under the regulations' conditions | AI providers, Railway | 🟡 ⚖️ | Disclosed in the policy and consent text | DPAs with providers. Consider excluding DeepSeek for client data |
| PPL: purpose limitation / retention | Keep only as long as needed; policy must match practice | Accounts, leads | 🔴 | The 24-month rule and lead retention are not automated | Business sets periods → scheduled purge (§6) |

### Israel: consumer, marketing, accessibility, business details

| Law / section | Requirement | Where | Status | Evidence | Fix |
|---|---|---|---|---|---|
| CPL s.14C(b) | Written disclosure for distance sales: business details, service, price, payment, cancellation | WhatsApp, phone and Zoom sales | 🟡 | Template drafted; the terms require it to be sent | `docs/legal/distance-sale-disclosure-template.md` (DRAFT) |
| CPL s.14C(c), s.14E; Cancellation Regs 2010 | 14-day cancellation (from transaction or document, whichever is later); fee ≤ 5% or NIS 100, whichever is lower; refund within 14 days; extended period for persons with disabilities, seniors and new immigrants | Terms | ✅ DRAFT ⚖️ | `/legal/terms#cancellation` (he, en, fr) | Lawyer to confirm the services rule ("2 non-rest days before the service starts") and the extension conditions |
| CPL s.13D | Ongoing transactions: cancel any time through the channel used to sign up; effective within 3 business days | Terms | ✅ DRAFT / 🟡 | Clause added | Business to confirm whether billing recurs |
| CPL s.17 / price display | Prices include VAT | Terms, disclosure document | ✅ DRAFT | No prices on the site | — |
| CPL s.2 | No misleading advertising | Public site | 🟡 | "Results vary" note under results (always shown, cannot be overridden in Studio); terms and health notice say results are not a promise | Business to substantiate or change: "92%", "proven results", "100+", "5+ years", "limited spots", "certified" (§6) |
| Communications Law s.30A | Marketing messages need prior written consent and an unsubscribe | Email, SMS, WhatsApp | ✅ N/A today | No marketing sends in code. The policy states the rule. `marketing` consent kind is ready in the API, unused | If newsletters or WhatsApp broadcasts start: add an unticked opt-in and an unsubscribe |
| Equal Rights Regs 2013 reg. 35; IS 5568 | Accessibility statement: level, what was done, limitations, coordinator name/phone/email, date of review; site accessible to WCAG 2.0 AA | Site, app | 🟡 | Statement rewritten (DRAFT, placeholders); linked from site footer, login, trainee privacy card, coach settings; contrast of `--ink-3` raised from 3.7:1 to 5.6:1; consent modal traps focus; legal pages keep the page direction | **Real audit by an accessibility expert**; fill in the coordinator and date; captions for demo videos |
| Business identification | Name, number, address, contact on the site | Footer (site + landing), terms, policy | 🟡 | Placeholders visible in all three | Owner fills in `BUSINESS` in `legal/content.ts`, `legal/siteNotices.ts` and `landing/index.html` |

### EU / UK GDPR and ePrivacy (reachable: French and English site, "from anywhere in the world")

| Article | Requirement | Status | Evidence / fix |
|---|---|---|---|
| Art. 3(2) | Applies when offering services to EU residents | ⚖️ | The French version suggests France is targeted. Lawyer to confirm |
| Art. 6, 9(2)(a), 7(1) | Lawful basis; explicit consent for health data; proof of consent | ✅ | Consent step and `privacy_consents` |
| Art. 13 | Full notice | ✅ DRAFT | Privacy policy |
| Art. 15, 16, 17, 20, 21 | Rights flows | ✅ | Export, erase, withdraw; contact for correction |
| Art. 27 | EU representative, unless processing is occasional and not large-scale special-category data | ⚖️ | Lawyer |
| Art. 28 | DPAs with processors | 🔴 | Owner signs or accepts the DPAs of Railway, OpenAI, Google, Anthropic and the other AI providers |
| Art. 30, 35 | Record of processing; DPIA for health data | 🔴 ⚖️ | Recommended. This report's §2 can serve as a starting point |
| Art. 33–34 | Breach notification within 72 h | ⚖️ | See R1 |
| Chapter V | Transfers | 🟡 | Israel has adequacy. Onward transfers (US, China) need SCCs or the DPF |
| ePrivacy Art. 5(3) | No non-essential storage or access before consent | ✅ | GA only after consent (verified); fonts self-hosted, so no IP goes to Google before consent (verified: zero external hosts on load); declining after accepting now deletes `_ga*` cookies and disables GA (verified) |
| Equal choice | Reject as easy as accept | ✅ | One click each, side by side ("לא, תודה" / "No, thanks"). The accept button is coloured more strongly, which some regulators frown on, so low risk |

### US

| Rule | Status | Note |
|---|---|---|
| CCPA/CPRA | N/A | Below the thresholds (revenue, number of consumers) |
| FTC Health Breach Notification Rule | ⚖️ low | Applies to US users of a health app. Same incident process as R1 if US users exist |
| COPPA | ✅ | No under-13s. 18+ confirmation; the policy excludes under-13s |

### Platform and licences

| Obligation | Status | Evidence / fix |
|---|---|---|
| Meta Platform Terms: deletion instructions or callback | ✅ / 🟡 | Policy section `#instagram`; `POST /api/privacy/meta/data-deletion` verifies `signed_request` with `INSTAGRAM_APP_SECRET` and returns `{url, confirmation_code}`. **Owner:** enter the URL in the Meta app dashboard and set `PUBLIC_SITE_URL` on Railway |
| Open Food Facts ODbL (attribution + share-alike) | ✅ / ⚖️ | Attribution on the credits page and per photo. **Share-alike:** the 277 Israeli products from OFF (commit `f8e569c`) form a derived database used by every coach. If that counts as "publicly using" it, it must be offered under the ODbL (for example as a downloadable file). Lawyer or owner to decide |
| wger CC BY-SA 4.0 | ✅ | Attribution and "changes" noted; adapted content offered under the same licence |
| Wikimedia images | ✅ | Per-photo author and licence (existing) |
| Fonts (SIL OFL) | ✅ | Self-hosted via Fontsource (`@fontsource/*@5.3.0`) |
| npm and pip notices (MIT, BSD, Apache…) | ✅ | `/licenses.txt`: 284 npm packages and the Python packages, with licence texts (`tools/build_licenses.mjs`). Non-permissive: psycopg2 (LGPL, dynamic use is fine), certifi (MPL-2.0, unmodified) |
| GSAP licence | ✅ | GSAP "Standard no charge" licence noted |
| Site photos (before/after, testimonials) | ⚖️ | The policy and credits say they are shown with **written** consent. **The owner must hold those consents** |
| AI-generated content disclosure (EU AI Act Art. 50, from Aug 2026) | ✅ | Credits and terms say AI helps with articles, translations and drafts, and that the coach reviews them. Human editorial review means the article-disclosure duty likely does not apply |

### Health and fitness

| Obligation | Status | Evidence |
|---|---|---|
| Medical disclaimer | ✅ DRAFT | New `/legal/health` page (he, en, fr), linked everywhere; short version on the consent step; emergency numbers (101 MDA; 15/112 in the fr version) |
| PAR-Q-style health declaration before training | ✅ | 9 yes/no questions in the app's own wording (PAR-Q+ text not copied). A "yes" shows "doctor's written approval needed"; the coach sees a chip and the answers (verified in the browser) |
| Nutrition-claim wording | ✅ | Health notice: estimates only, not a treatment, eating-disorder caution |
| Age gating | ✅ | 18+ (or written parental approval) confirmation |

## 5. Loop-by-loop log

**Loop 1 (fact-finding)** produced 14 gaps: no health consent, rights promised but not implemented, no business details, incomplete accessibility statement, inaccurate processor list, lead form asking for injuries, unsubstantiated marketing claims, no Meta deletion path, weak cookie text, no §14C or §13D terms, no visible medical disclaimer, no age gate, DPO/registration question, no open-source notices.

**Loop 1 fixes** (commits `8c5deda` → `bd0d0bd`):
- Privacy API: consent records, export, erasure, Meta callback.
- Consent step and privacy card.
- Legal texts rewritten (privacy, terms and cancellation, new health notice, accessibility, credits) in he, en and fr, plus ru/ar navigation labels.
- `/licenses.txt`.
- Site: form notice, cookie text, results note, business line, footer links, contrast.
- Old landing page: links, cookie text, business line.
- File deletion when a coach or admin deletes a user.
- Coach sees the health declaration.
- §14C template.

**Loop 2 (fresh pass) found:**
1. Legal paragraphs starting with "ECshape" rendered left-to-right in Hebrew (`dir="auto"`). Fixed.
2. Coaches saw the trainee wording on the consent step. Fixed.
3. Google Fonts sent visitors' IPs to Google before consent. Fixed by self-hosting.
4. Declining after accepting left GA running and its cookies in place. Fixed on the site and the landing page.
5. QA bug reports (screenshots) were not in the policy. Added, without a deletion promise the code doesn't keep.
6. The policy listed a storage key that doesn't exist (`ec_lang`) and missed the offline cache that holds health data. Fixed.
7. Automatic retention (24 months, leads) is not implemented. Left open for a business decision.
8. The auth audit's file-read finding is a possible breach (R1). Escalated.

**Loop 3 (fresh pass) found:**
1. The consent modal had no focus trap. Fixed and verified with real Tab and Shift+Tab presses after a clean reload.
2. The coach portal had no link to the legal and accessibility pages. Fixed (`LegalLinksCard` in Studio settings).
3. The coach's declaration sheet addressed the trainee ("you answered"). Fixed.
4. Phone width (375 px): consent step has no horizontal overflow and 44 px targets. Verified.

**Loop 4 (fresh pass)** re-checked every row of §4 against the running app (API on 8090, portal on 5250, scratch SQLite with demo seed) in Hebrew and English. It grepped for stale claims (Vercel, "without your name", injuries prompt) and compared the he, en and fr legal texts and consent texts section by section with a script. One finding: the Hebrew cancellation section lacked the EU/UK withdrawal-rights sentence that en and fr have. Fixed.

**Loop 5 (fresh pass)** re-ran the structure comparison (all five pages and the consent texts match in he, en and fr), the production build and the endpoint checks. **No new findings.** What remains needs owner input or a lawyer (§6–§7).

`npm --prefix Frontend run build` passes.

## 6. Business decisions needed

- **Marketing claims (CPL s.2):** keep "92% reached their goal", "proven results", "100+ clients", "5+ years" and "certified trainer" only if you can document them (records, certificate), or soften them. Decide whether "limited spots" is true; if not, remove it.
- **Retention:** confirm the 24 months after coaching ends; set the lead retention (12 months recommended); then a scheduled purge job should be added (the code needs a definition of "coaching ended", e.g. no sign-in and no coach for N months).
- **AI providers for client data:** decide which providers may receive client data. DeepSeek means a transfer to China. Accept or sign each provider's DPA and zero-retention terms.
- **Old `landing/`:** retire it, or keep it and add the Google Form to the policy. Its legal links point to `https://ecshape.org/legal/*`; confirm the production domain.
- **Recurring billing, prices, cancellation fee:** fill in the §14C document and confirm §13D applies.
- **Under-18 trainees:** accept them with written parental consent, or not at all.
- **Testimonials and before/after photos:** confirm written consents exist for each person.
- **Open Food Facts derived database:** publish it under the ODbL, or confirm it isn't "publicly used".

## 7. Needs a lawyer

- R1: whether to report to the PPA (and to EU authorities or individuals) if exploitation is found.
- DPO duty and the Data Security Regulations security level under Amendment 13; the security procedure document.
- Whether GDPR applies (Art. 3(2)) and whether an EU representative is needed (Art. 27); a DPIA.
- Exact cancellation wording for services (s.14C(c)), the four-month extension conditions, and s.13D.
- Review of every DRAFT text (§0) in Hebrew first, then the English and French equivalents.
- Transfers to China (DeepSeek) and to US AI providers.

## 8. Placeholders to fill in

| Placeholder | Where |
|---|---|
| Business name, ע.מ/ח.פ, postal address | `Frontend/src/legal/content.ts` → `BUSINESS` (he/en/fr); `Frontend/src/legal/siteNotices.ts` → `business` (all five languages); `landing/index.html` footer |
| Privacy contact email and phone | `BUSINESS.email`, `BUSINESS.phone` |
| DPO, if appointed | `BUSINESS.dpo` |
| Accessibility coordinator name, phone, email | `BUSINESS.a11yName`, `a11yPhone`, `a11yEmail` |
| Date of the last accessibility review and who did it | `BUSINESS.a11yAudit` |
| Fixed studio/gym and its accessibility | `BUSINESS.premises` |
| Railway server region | `BUSINESS.region` |
| SMTP / email provider | `BUSINESS.smtp` |
| Lead retention period | `BUSINESS.leadDays` |
| Everything in `[…]` | `docs/legal/distance-sale-disclosure-template.md` |

After filling them in, run `node tools/build_i18n_source.mjs` so the Russian and Arabic translations pick up the new English text.

## 9. Deployment and hand-over notes

- **New table** `privacy_consents`, created by `create_all`. **Every existing user sees the consent step once.** Bump `POLICY_VERSION` in `app/routers/privacy.py` when the texts change materially, and everyone is asked again.
- **New endpoints** under `/api/privacy/*`. They use `get_current_user`, so they work with the auth branch's new JWT claims.
- **Railway env:** set `PUBLIC_SITE_URL` (used by the Meta deletion status URL). The Meta app dashboard needs the Data Deletion Request URL: `https://<api-host>/api/privacy/meta/data-deletion`.
- **New npm dependencies:** `@fontsource/{heebo,anton,karantina,racing-sans-one,noto-sans-arabic}@5.3.0`.
- **Files touched outside legal code** (small edits, may need merging):
  - `app/main.py` (one router include)
  - `app/routers/users.py` (the `delete_user` route only; the auth branch edits `update_user`)
  - `Frontend/src/App.tsx` (one import and the `<ConsentGate />` mount)
  - `Frontend/src/index.css` (the first 3 lines: font imports)
  - `Frontend/src/site/site.css` (`--ink-3` and 3 new rules)
  - `Frontend/src/site/siteMotion.js` (decline handler)
  - `Frontend/src/site/render.ts` (footer, form, cookie and results notice)
  - `Frontend/src/pages/ClientProfile.tsx` (one chip)
  - `Frontend/src/pages/studio/PreferencesPage.tsx` (one card)
  - `Frontend/src/features/trainee/ProfileScreen.tsx` (one card)
- If the auth branch moves the token out of `localStorage`, update the "Cookies and browser storage" section of the policy (`access_token`).
- Regenerate `/licenses.txt` after dependency changes: `node tools/build_licenses.mjs <python-with-requirements>`.
