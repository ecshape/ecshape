/**
 * Captures real screens of the client app for the public site's "app" section.
 *
 *   APP_URL=http://localhost:5174 SHOT_USER=client1 SHOT_PASS=client123 SHOT_LANG=he \
 *     node scripts/capture-app-shots.mjs
 *
 * Writes public/site/photos/app/<lang>/{1..4}.jpg (training, meals, progress, chat), in the order
 * of the site's app section items. Run against a local backend seeded with demo data — never production.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_URL = process.env.APP_URL || 'http://localhost:5174';
const USER = process.env.SHOT_USER || 'client1';
const PASS = process.env.SHOT_PASS || 'client123';
const LANGS = (process.env.SHOT_LANG || 'he,en,fr').split(',');
// Order matches the site's app items. Point the first one at a real workout day, e.g. /training/day/1.
const ROUTES = (process.env.SHOT_ROUTES || '/training,/meals,/progress,/chat').split(',');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// CHROMIUM_PATH lets you reuse any installed Chrome/Chromium instead of `npx playwright install`.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

for (const lang of LANGS) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    locale: lang === 'he' ? 'he-IL' : lang === 'fr' ? 'fr-FR' : 'en-US',
  });
  await context.addInitScript((l) => {
    localStorage.setItem('i18nextLng', l);
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('cookie_consent', 'denied');
  }, lang);
  const page = await context.newPage();
  await page.goto(`${APP_URL}/login`);
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });

  const out = join(root, 'public/site/photos/app', lang);
  mkdirSync(out, { recursive: true });
  for (const [i, route] of ROUTES.entries()) {
    await page.goto(`${APP_URL}${route}`);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(out, `${i + 1}.jpg`), type: 'jpeg', quality: 82 });
    console.log(`${lang} ${route} → ${i + 1}.jpg`);
  }
  await context.close();
}
await browser.close();
