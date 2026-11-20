#!/usr/bin/env node
/**
 * Legal audit 2026-11: third-party licence notices served at /licenses.txt (linked from Credits & licences).
 * MIT / BSD / ISC / Apache require keeping the copyright and licence notice with redistributed code.
 *
 *   node tools/build_licenses.mjs [path/to/python]   (python: a venv with requirements.txt installed; optional)
 *
 * Frontend: every production npm package (npm ls --omit=dev), with its LICENSE text.
 * Backend: every package in requirements.txt and its dependencies, with licence name and text from the venv.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fe = join(root, 'Frontend');
const out = [];
out.push('ECshape — third-party software licences', `Generated ${new Date().toISOString().slice(0, 10)} by tools/build_licenses.mjs`, '');

// ---------------------------------------------------------------- npm
const tree = JSON.parse(execFileSync('npm', ['ls', '--omit=dev', '--all', '--json', '--long'], { cwd: fe, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
const pkgs = new Map();
const walk = (deps) => {
  for (const [name, d] of Object.entries(deps || {})) {
    if (d.path && !pkgs.has(`${name}@${d.version}`)) pkgs.set(`${name}@${d.version}`, { name, version: d.version, path: d.path });
    walk(d.dependencies);
  }
};
walk(tree.dependencies);
const licenceFile = (dir) => {
  try {
    const f = readdirSync(dir).find((n) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(n));
    return f ? readFileSync(join(dir, f), 'utf8').trim() : '';
  } catch { return ''; }
};
out.push('='.repeat(72), `FRONTEND (npm, ${pkgs.size} packages)`, '='.repeat(72), '');
for (const p of [...pkgs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  let lic = '';
  try { const j = JSON.parse(readFileSync(join(p.path, 'package.json'), 'utf8')); lic = typeof j.license === 'string' ? j.license : j.license?.type || (j.licenses || []).map((l) => l.type).join(' OR '); } catch { /* ignore */ }
  out.push(`--- ${p.name} ${p.version} — ${lic || 'see text'}`);
  const text = licenceFile(p.path);
  if (text) out.push(text);
  out.push('');
}

// ---------------------------------------------------------------- python
const py = process.argv[2];
if (py && existsSync(py)) {
  const script = `
import json, re
from importlib import metadata
reqs = [re.split(r'[<>=!~\\[; ]', l.strip())[0] for l in open('requirements.txt') if l.strip() and not l.startswith('#')]
seen, todo, out = set(), list(reqs), []
while todo:
    n = todo.pop()
    k = n.lower().replace('_', '-')
    if k in seen: continue
    seen.add(k)
    try: d = metadata.distribution(n)
    except Exception: continue
    m = d.metadata
    lic = m.get('License-Expression') or (m.get('License') or '').split('\\n')[0][:120]
    if not lic or lic == 'UNKNOWN':
        lic = '; '.join(c.split('::')[-1].strip() for c in (m.get_all('Classifier') or []) if c.startswith('License'))
    text = ''
    for f in d.files or []:
        if re.search(r'(LICEN[CS]E|COPYING|NOTICE)', f.name, re.I):
            try: text += open(d.locate_file(f)).read().strip() + '\\n'
            except Exception: pass
    out.append({'name': m['Name'], 'version': d.version, 'license': lic, 'text': text[:20000]})
    for r in d.requires or []:
        if 'extra ==' in r: continue
        todo.append(re.split(r'[<>=!~\\[; (]', r.strip())[0])
print(json.dumps(sorted(out, key=lambda x: x['name'].lower())))
`;
  const list = JSON.parse(execFileSync(py, ['-I', '-c', script], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
  out.push('='.repeat(72), `BACKEND (Python, ${list.length} packages)`, '='.repeat(72), '');
  for (const p of list) {
    out.push(`--- ${p.name} ${p.version} — ${p.license || 'see text'}`);
    if (p.text) out.push(p.text.trim());
    out.push('');
  }
} else {
  out.push('(Backend Python packages: run with a python that has requirements.txt installed to include them.)');
}

writeFileSync(join(fe, 'public', 'licenses.txt'), out.join('\n') + '\n');
console.log(`licenses.txt: ${pkgs.size} npm packages${py ? ' + python' : ''}`);
