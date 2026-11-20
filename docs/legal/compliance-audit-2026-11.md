# ECShape legal-compliance audit (November 2026), PARTIAL

> **Status: incomplete.** Only loop 1 fact-finding and a first source review were done before the usage limit was reached.
> No fixes have been committed yet. The legal sources have **not** yet been checked online, so the section references below come from the brief and still need confirming against gov.il, the Privacy Protection Authority, EUR-Lex, ICO and FTC.
> This is a compliance checklist, not legal advice. Any text drafted later must be marked `DRAFT — requires review by an Israeli lawyer`.

## Facts established from code (loop 1)

| Topic | Finding | Evidence |
|---|---|---|
| Controller | Elior Cremisi / ECshape (sole trader?). No company number (ח.פ/ע.מ), address or email anywhere | `Frontend/src/site/content/he.ts:160`, `legal/content.ts:63` |
| Payments | None in code. Prices are not shown on the site, and sales happen off-platform (WhatsApp or consultation call) | grep for stripe, cardcom, tranzila and others: no hits |
| Account creation | **Clients do not sign up. The trainer creates their account** (`POST /auth/register/client`). The login page only links to terms and privacy. There is no consent step | `app/routers/auth.py:202`, `Frontend/src/pages/Login.tsx:175` |
| Health data | Weight, measurements, progress photos, check-ins (sleep, hunger, steps), meals, injuries, chat, meal photos | `app/models/*` |
| Lead form | Name, phone, email, goal, program and a free-text message. The placeholder asks for **injuries**, which is health data, with no consent and no privacy link | `site/render.ts:452-464`, `he.ts:166` |
| Analytics | GA4 `G-6QJ1G81SGP`, which Studio can override. It loads only after "Accept" (stored in localStorage) | `site/siteMotion.js:13,370-381` |
| Processors | Railway (hosting), Google Analytics; AI providers: OpenAI, Google Gemini, Anthropic, OpenRouter, Mistral, Groq, xAI, DeepSeek; MyMemory (translation); Open Food Facts, USDA, wger, Wikimedia (lookups); Meta Graph API (Instagram auto-reply); SMTP (password reset); Google Fonts and jsDelivr (CDN); YouTube-nocookie embeds | URL grep over `app/` and `Frontend/src` |
| Policy accuracy | The policy names "Vercel" (not found in code), and leaves out DeepSeek, xAI, Groq, Mistral, OpenRouter, MyMemory, Meta, Google Fonts and the SMTP provider. Whether "sent without your name" is true for Agent EC has not been checked | `legal/content.ts:67-68` |
| Deletion | `DELETE /users/{id}` exists and relies on DB `ON DELETE CASCADE` (Postgres). **Uploaded files on disk (progress photos, avatars, chat media) are not deleted.** Leads are kept with no retention limit. There is **no self-service delete button in the UI** | `app/services/user_service.py:45`, `app/routers/studio.py:143` |
| Export | **No data-export endpoint or UI**, although the policy promises "a copy of your data" | no hits found |
| Instagram | A comment auto-reply webhook processes commenters' IG IDs and text. There is **no Meta data-deletion callback and no mention in the privacy policy** | `app/routers/instagram_webhook.py` |
| Minors | The policy says 18+ (under 18 with a parent's consent). There is no age gate in the app | `legal/content.ts:72` |
| Languages | Legal pages exist in he, en and fr; ru and ar are machine-translated from en. he and en match in structure | `legal/i18n.ts` |

## Loop 1: gaps found (highest risk first)

1. **No explicit consent to health-data processing** (Israeli Privacy Law and Amendment 13 on sensitive data; GDPR Art. 9(2)(a)). Clients are onboarded by the trainer and never accept anything. *Fix:* a first-login consent gate for clients with unticked boxes (terms, privacy, explicit health-data consent, health declaration/PAR-Q), stored with a timestamp and policy version.
2. **The data-subject rights the policy promises are not implemented.** There is no export, deleting an account leaves files on disk, and there is no self-delete in the UI. *Fix:* add `GET /privacy/export` (JSON + media zip), delete media on account deletion, and an "Export / delete my data" section in settings.
3. **Business identification is missing.** There is no legal name, ח.פ/ע.מ, address or email, and contact is WhatsApp only. → Placeholders are needed (see below).
4. **The accessibility statement lacks the mandatory fields:** coordinator name, phone and email, date of the last accessibility check, and accessible physical facilities (if there is a gym or studio). There is no evidence of an actual IS 5568 audit.
5. **Processor list in the privacy policy is inaccurate or incomplete** (Section 11 notice; GDPR Art. 13). It also does not say whether giving data is mandatory, and has no retention period for leads.
6. **The lead form collects health data (injuries) without notice or consent.** The privacy line is one sentence with no link to the policy.
7. **Marketing claims:** "92% reached their goal", "proven results", "limited spots" and before/after photos with no "results not typical" note next to them (Consumer Protection Law §2 on misleading advertising). Each claim needs substantiation, or the wording needs softening.
8. **Instagram:** no Meta data-deletion callback URL or instructions, and the privacy policy does not mention Instagram processing.
9. **Cookie banner:** accept and decline are given equal weight, which is good. But the banner text does not name GA or link to the policy, the "Accept" label is "מאשר" (masculine only), and the Google Fonts and CDN requests send the visitor's IP before consent (EU exposure).
10. **Cancellation and subscriptions:** the terms cite the 14-day rule. But there is no online sale, so the §14C disclosure applies to WhatsApp/phone sales (a written disclosure document must be sent to the customer). Whether billing is recurring (§13D) is unknown.
11. **No medical disclaimer on the site or in the app.** It appears only inside the terms, and there is no health declaration before a training plan is assigned.
12. **Age gating:** none in the app.
13. **Database registration and a DPO:** whether either is required after Amendment 13 depends on scale and the sensitive-data volume. This needs a lawyer's call.
14. **Open-source licence notices** for npm and pip dependencies are not listed on the credits page.

## Placeholders the owner must fill
- Legal business name, ח.פ / ע.מ number, postal address, privacy contact email
- Accessibility coordinator: name, phone, email; date of the last accessibility check
- DPO (if required)
- Whether a physical studio exists (accessibility of the premises)
- Payment method, recurring billing, prices and cancellation fee

## Needs a lawyer or a business decision
- Database registration and DPO duty after Amendment 13; the security level under the 2017 Data Security Regulations
- Legal basis for international transfers to the AI providers (US/EU/China: DeepSeek)
- Whether the 92% and before/after claims can be substantiated
- Whether trainees under 18 are accepted at all
- Whether CCPA applies (likely below its thresholds) and the FTC Health Breach Notification Rule (US users?)

## Loop log
- **Loop 1** (2026-11-20): facts and gaps above. No fixes yet. No online source check yet. No browser check yet.
- **Next:** check the sources online, then fix items 1, 2, 5, 6, 9 and 11 in code and content (he and en), view them in the browser, and audit again until a full pass finds nothing new.
