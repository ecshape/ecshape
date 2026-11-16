/**
 * Captures real screens of the trainee app for the public site's "app" section (and the program / why cards).
 *
 * Against a dev backend with DEV_DEMO_SEED=1, sign in through the demo shortcut (no password):
 *   APP_URL=http://localhost:5180 SHOT_DEMO_API=http://localhost:8010/api node scripts/capture-app-shots.mjs
 * Or with a password:
 *   APP_URL=http://localhost:5174 SHOT_USER=client1 SHOT_PASS=client123 node scripts/capture-app-shots.mjs
 *
 * SHOT_BEFORE_LANG (optional) is a shell command run before each language with the language as its argument,
 * e.g. to put demo chat messages in that language: SHOT_BEFORE_LANG="python seed_chat.py".
 *
 * Writes public/site/photos/app/<lang>/{1..4}.jpg (workout, meals, progress, chat), in the order of the
 * site's app section items. Run against a local backend seeded with demo data — never production.
 * Fill the demo day first (a workout plan, today's meals logged, a weight trend, a chat) so the screens look alive.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_URL = process.env.APP_URL || 'http://localhost:5174';
const USER = process.env.SHOT_USER || 'client1';
const PASS = process.env.SHOT_PASS || 'client123';
const ONLY = process.env.SHOT_ONLY ? process.env.SHOT_ONLY.split(',').map(Number) : null; // 1-based, e.g. SHOT_ONLY=1
const LANGS = (process.env.SHOT_LANG || 'he,en,fr').split(',');
// Order matches the site's app items: [route, scrollY in CSS px, element that must be on screen].
const SHOTS = [
  // The workout screen is shot scrolled to its set rows (weight x reps table), the part people ask about.
  ['/training/day/1/session', '.tr-sets', '.tp-player, main img'],
  ['/meals', 250, 'main'],
  ['/progress', 0, 'main svg'],
  ['/chat', 0, 'main'],
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// CHROMIUM_PATH lets you reuse any installed Chrome/Chromium instead of `npx playwright install`.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
// Screenshots show the product, not the tooling: no QA button, no motion, no caret.
const CLEAN = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}'
  + '.ec-qa-capture,.ec-qa-fab-stack{display:none!important}';

for (const lang of LANGS) {
  if (process.env.SHOT_BEFORE_LANG) execSync(`${process.env.SHOT_BEFORE_LANG} ${lang}`, { stdio: 'inherit' });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    locale: lang === 'he' ? 'he-IL' : lang === 'fr' ? 'fr-FR' : 'en-US',
  });
  const demoToken = process.env.SHOT_DEMO_API
    ? (await (await fetch(`${process.env.SHOT_DEMO_API}/auth/demo-login/client`, { method: 'POST' })).json()).access_token
    : null;
  await context.addInitScript(([l, token]) => {
    localStorage.setItem('i18nextLng', l);
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('cookie_consent', 'denied');
    localStorage.setItem('ec-chat-notif-dismissed', '1'); // no "turn on notifications" banner over the chat
    if (token) localStorage.setItem('access_token', token);
  }, [lang, demoToken]);
  const page = await context.newPage();
  if (!demoToken) {
    await page.goto(`${APP_URL}/login`);
    await page.fill('#username', USER);
    await page.fill('#password', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  }

  const out = join(root, 'public/site/photos/app', lang);
  mkdirSync(out, { recursive: true });
  for (const [i, [route, scrollY, ready]] of SHOTS.entries()) {
    if (ONLY && !ONLY.includes(i + 1)) continue;
    await page.goto(`${APP_URL}${route}`);
    await page.addStyleTag({ content: CLEAN });
    await page.waitForLoadState('networkidle');
    await page.locator(ready).first().waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500); // translated names, photos and charts settle
    if (typeof scrollY === 'string') {
      // bring the first match to ~1/4 from the top so the exercise name stays visible above the rows
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.36);
      }, scrollY);
      await page.waitForTimeout(800);
    } else if (scrollY) {
      await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: join(out, `${i + 1}.jpg`), type: 'jpeg', quality: 84 });
    console.log(`${lang} ${route} → ${i + 1}.jpg`);
  }
  await context.close();
}
await browser.close();
