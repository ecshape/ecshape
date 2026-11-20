#!/usr/bin/env python3
"""QA tickets from the dev preview database, without a browser sign-in.

    python3 tools/qa.py list            # open tickets (new / in progress), with their text and comments
    python3 tools/qa.py list --all      # every ticket
    python3 tools/qa.py show 115
    python3 tools/qa.py comment 115 "Fixed: ..."
    python3 tools/qa.py close 115 "Fixed: ..."   # comment, then status = done
    python3 tools/qa.py status 115 in_progress

The key comes from Studio -> QA -> "Agent access" (created once by a coach / admin; only its hash is stored in the
database). Put it in .qa-agent-key at the repo root (git-ignored) or in ECSHAPE_QA_KEY. It only opens the QA endpoints.
API: ECSHAPE_API (default: the dev preview API on Railway). Standard library only.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = os.environ.get('ECSHAPE_API', 'https://api-production-9d8a41c7.up.railway.app/api').rstrip('/')
ORIGIN = 'https://ecshape-preview.vercel.app'


def key() -> str:
    k = os.environ.get('ECSHAPE_QA_KEY') or ''
    f = ROOT / '.qa-agent-key'
    if not k and f.exists():
        k = f.read_text().strip()
    if not k:
        sys.exit('No QA agent key: create one in Studio -> QA -> Agent access and save it to .qa-agent-key')
    return k


def call(method: str, path: str, body=None):
    req = urllib.request.Request(f'{API}/studio{path}', method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'X-QA-Agent-Key': key(), 'Content-Type': 'application/json',
                                          'Origin': ORIGIN, 'User-Agent': 'ecshape-qa-agent/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path} -> HTTP {e.code}: {e.read().decode()[:300]}')


def show(t: dict) -> None:
    print(f"\n#{t['id']} [{t['status']}/{t['priority']}] {t['title']}")
    print(f"  by {t.get('author') or '?'} · {t.get('created_at', '')[:16]} · {t.get('page') or ''}")
    for line in (t.get('body') or '').splitlines():
        print('  | ' + line)
    for c in t.get('comments') or []:
        print(f"  > {c.get('author') or ''}: {c.get('body', '')}")


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return
    cmd, rest = argv[0], argv[1:]
    if cmd == 'list':
        ts = call('GET', '/qa')
        if '--all' not in rest:
            ts = [t for t in ts if t['status'] in ('new', 'in_progress')]
        print(f'{len(ts)} ticket(s)')
        for t in sorted(ts, key=lambda x: x['id']):
            show(call('GET', f"/qa/{t['id']}"))
    elif cmd == 'show':
        show(call('GET', f'/qa/{int(rest[0])}'))
    elif cmd == 'comment':
        call('POST', f'/qa/{int(rest[0])}/comments', {'body': rest[1]})
        print('commented')
    elif cmd == 'close':
        call('POST', f'/qa/{int(rest[0])}/comments', {'body': rest[1]})
        call('PATCH', f'/qa/{int(rest[0])}', {'status': 'done'})
        print('closed')
    elif cmd == 'status':
        call('PATCH', f'/qa/{int(rest[0])}', {'status': rest[1]})
        print('ok')
    else:
        sys.exit(f'unknown command {cmd}')


if __name__ == '__main__':
    main(sys.argv[1:])
