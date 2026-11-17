/**
 * QA #85: collects every English text of the app (locale + patches), the public site and the legal pages into
 * app/data/i18n_en.json. The server translates it on demand into extra languages (Russian, Arabic…) and the app
 * loads them from /api/public/i18n/<lang>. Re-run after adding or changing English strings:
 *
 *     node tools/build_i18n_source.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fe = join(root, 'Frontend');
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : out[k] ?? v;
  return out;
};

let app = JSON.parse(readFileSync(join(fe, 'src/i18n/locales/en.json'), 'utf8'));
for (const f of readdirSync(join(fe, 'src/i18n/patches')).filter((n) => n.endsWith('.json')).sort()) {
  const p = JSON.parse(readFileSync(join(fe, 'src/i18n/patches', f), 'utf8'));
  app = merge(app, p.en || {}); // locale wins; patches only add missing keys (same as addResourceBundle without overwrite)
}

// Site + legal texts live in TypeScript: bundle a tiny script with esbuild and print them as JSON.
const dir = mkdtempSync(join(tmpdir(), 'ec-i18n-'));
writeFileSync(join(dir, 'dump.ts'), `
import { en } from '${fe}/src/site/content/en';
import { LEGAL, LEGAL_NAV } from '${fe}/src/legal/content';
console.log(JSON.stringify({ site: en, legal: LEGAL.en, legalNav: LEGAL_NAV.en }));
`);
execFileSync(join(fe, 'node_modules/.bin/esbuild'), [join(dir, 'dump.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${join(dir, 'dump.cjs')}`, '--log-level=error', `--alias:@=${join(fe, 'src')}`, '--define:import.meta.env={"VITE_API_URL":""}']);
const { site, legal, legalNav } = JSON.parse(execFileSync('node', [join(dir, 'dump.cjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

const out = { app, site, legal, legalNav };
writeFileSync(join(root, 'app/data/i18n_en.json'), JSON.stringify(out));
const count = (o) => (typeof o === 'string' ? 1 : o && typeof o === 'object' ? Object.values(o).reduce((s, v) => s + count(v), 0) : 0);
console.log(`app ${count(app)} · site ${count(site)} · legal ${count(legal) + count(legalNav)} strings -> app/data/i18n_en.json`);
