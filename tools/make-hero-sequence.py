#!/usr/bin/env python3
"""Turn a short clip of the trainer (arms down -> arms crossed) into the site's hero scroll sequence.

    python3 tools/make-hero-sequence.py clip.mov [--start 0.4 --end 3.1] [--frames 120] [--reverse] [--lock 0.82]

Writes Frontend/public/site/seq/hero/{l,s}/0001.webp ... and manifest.json. The site picks it up by itself
(src/site/heroSequence.js); delete the folder to go back to the still photo.

Filming (what makes it look real):
  - camera locked on a tripod, same framing as the hero photo (whole body, head to shoes, some room above);
  - 4K or 1080p at 50/60 fps, short shutter, even light, plain or gym background, no one walking behind;
  - one slow, deliberate move: 2-3 s from arms relaxed at the sides to firmly crossed, then hold 1 s still;
  - eyes on the lens the whole time. Film several takes; pick the cleanest.
  If you filmed it crossed -> down, pass --reverse.

Options:
  --start/--end   seconds to keep (trim the dead time before the move and after the hold)
  --frames        frames in the sequence (90-150; more = smoother scrub, heavier page). Default 120.
  --lock          where in the clip (0..1) the arms lock — the "impact" beat (flare, camera punch). Default 0.82.
  --focus         the trainer's box in the frame "u0,v0,u1,v1" (0..1), used to fit the whole body. Default auto-ish.
  --crop          ffmpeg crop expression applied first, e.g. "iw*0.7:ih:iw*0.15:0".
Needs ffmpeg and Pillow.
"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'Frontend' / 'public' / 'site' / 'seq' / 'hero'
SIZES = {'l': 1600, 's': 820}  # longest side, desktop / phone


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('video')
    ap.add_argument('--start', type=float, default=None)
    ap.add_argument('--end', type=float, default=None)
    ap.add_argument('--frames', type=int, default=120)
    ap.add_argument('--reverse', action='store_true')
    ap.add_argument('--lock', type=float, default=0.82)
    ap.add_argument('--focus', default='.18,.04,.82,.97')
    ap.add_argument('--pos', default='.5,.3')
    ap.add_argument('--crop', default=None)
    ap.add_argument('--quality', type=int, default=74)
    a = ap.parse_args()

    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        print('ffmpeg / ffprobe not found (brew install ffmpeg)', file=sys.stderr)
        return 1
    src = Path(a.video).expanduser().resolve()
    dur = float(subprocess.check_output(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(src)]).decode().strip())
    t0 = a.start or 0.0
    t1 = a.end or dur
    span = max(0.1, t1 - t0)
    fps = a.frames / span

    with tempfile.TemporaryDirectory() as tmp:
        vf = []
        if a.crop:
            vf.append(f'crop={a.crop}')
        vf.append(f'fps={fps:.5f}')
        cmd = ['ffmpeg', '-v', 'error', '-ss', f'{t0}', '-t', f'{span}', '-i', str(src), '-vf', ','.join(vf),
               '-frames:v', str(a.frames), '-q:v', '1', f'{tmp}/%04d.png']
        subprocess.check_call(cmd)
        raw = sorted(Path(tmp).glob('*.png'))
        if a.reverse:
            raw.reverse()
        if len(raw) < 2:
            print('No frames extracted — check --start/--end', file=sys.stderr)
            return 1

        if OUT.exists():
            shutil.rmtree(OUT)
        w = h = 0
        for key, side in SIZES.items():
            d = OUT / key
            d.mkdir(parents=True)
            for i, f in enumerate(raw, 1):
                im = Image.open(f).convert('RGB')
                im.thumbnail((side, side), Image.LANCZOS)
                if key == 'l':
                    w, h = im.size
                im.save(d / f'{i:04d}.webp', 'WEBP', quality=a.quality, method=6)

    total = sum(p.stat().st_size for p in OUT.rglob('*.webp'))
    manifest = {
        'count': len(raw), 'digits': 4, 'ext': 'webp', 'large': 'l', 'small': 's', 'width': w, 'height': h,
        'lock': a.lock, 'focus': a.focus, 'pos': a.pos,
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    print(f'{len(raw)} frames, {w}x{h}, {total / 1e6:.1f} MB total -> {OUT.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
