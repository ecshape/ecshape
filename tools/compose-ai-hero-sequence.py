#!/usr/bin/env python3
"""Hero scroll sequence from an AI image-to-video clip of the hero photo (arms crossed -> arms down, played in reverse).

    python3 tools/compose-ai-hero-sequence.py <frames_dir> [--lock 0.78]

<frames_dir>: PNG frames of the generated clip in clip order (frame 1 = the hero photo, arms crossed), already
interpolated (ffmpeg minterpolate) if the move is short. The clip is low resolution (about 624x832), so each frame is
upscaled, colour-matched to the photo and sharpened, and the original high-resolution photo is kept wherever nothing
moves (background, and the whole picture on the final crossed-arms frames). Output: the same
Frontend/public/site/seq/hero/ folder as tools/make-hero-sequence.py (frames reversed: arms down -> crossed).
Needs numpy, opencv-python-headless, Pillow.
"""
import argparse, json, shutil
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'Frontend' / 'public' / 'site' / 'seq' / 'hero'
PHOTO = ROOT / 'Frontend' / 'public' / 'site' / 'photos' / 'opt' / 'trainer.jpg'
W, H = 1200, 1600
SMALL = 820

ap = argparse.ArgumentParser()
ap.add_argument('frames')
ap.add_argument('--lock', type=float, default=0.78)
ap.add_argument('--quality', type=int, default=76)
a = ap.parse_args()

files = sorted(Path(a.frames).glob('*.png'))
photo = np.asarray(ImageOps.exif_transpose(Image.open(PHOTO)).convert('RGB').resize((W, H), Image.LANCZOS)).astype(np.float32)
vid = [cv2.cvtColor(cv2.imread(str(f)), cv2.COLOR_BGR2RGB).astype(np.float32) for f in files]
first_small = vid[0]

# colour match: the clip's first frame should equal the photo
up0 = cv2.resize(first_small, (W, H), interpolation=cv2.INTER_LANCZOS4)
gain = photo.reshape(-1, 3).std(0) / (up0.reshape(-1, 3).std(0) + 1e-6)
bias = photo.reshape(-1, 3).mean(0) - gain * up0.reshape(-1, 3).mean(0)

# motion masks in clip resolution: where a frame differs from the first one
masks = []
g0 = cv2.GaussianBlur(cv2.cvtColor(first_small.astype(np.uint8), cv2.COLOR_RGB2GRAY), (0, 0), 2).astype(np.float32)
for f in vid:
    g = cv2.GaussianBlur(cv2.cvtColor(f.astype(np.uint8), cv2.COLOR_RGB2GRAY), (0, 0), 2).astype(np.float32)
    m = (np.abs(g - g0) > 9).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    masks.append(m.astype(np.float32))
# temporal max so the mask never flickers between neighbours
n = len(masks)
masks = [np.max(masks[max(0, i - 2):min(n, i + 3)], axis=0) for i in range(n)]

if OUT.exists():
    shutil.rmtree(OUT)
(OUT / 'l').mkdir(parents=True)
(OUT / 's').mkdir(parents=True)
for i, f in enumerate(vid):
    up = cv2.resize(f, (W, H), interpolation=cv2.INTER_LANCZOS4) * gain + bias
    blur = cv2.GaussianBlur(up, (0, 0), 1.6)
    up = np.clip(up + 0.7 * (up - blur), 0, 255)                         # unsharp mask
    m = cv2.resize(masks[i], (W, H), interpolation=cv2.INTER_LINEAR)
    m = cv2.GaussianBlur(m, (0, 0), 14)[..., None]
    frame = photo * (1 - m) + up * m
    # light film grain hides the resolution seam between photo and clip pixels
    rng = np.random.default_rng(i)
    frame = np.clip(frame + rng.normal(0, 2.2, (H, W, 1)), 0, 255).astype(np.uint8)
    k = n - i                                                            # reversed: arms down first
    im = Image.fromarray(frame)
    im.save(OUT / 'l' / f'{k:04d}.webp', 'WEBP', quality=a.quality, method=6)
    sm = im.copy(); sm.thumbnail((SMALL, SMALL), Image.LANCZOS)
    sm.save(OUT / 's' / f'{k:04d}.webp', 'WEBP', quality=a.quality - 4, method=6)

(OUT / 'manifest.json').write_text(json.dumps({
    'count': n, 'digits': 4, 'ext': 'webp', 'large': 'l', 'small': 's', 'width': W, 'height': H,
    'lock': a.lock, 'focus': '.40,.23,.76,.95', 'pos': '.58,.27', 'source': 'ai-image-to-video',
}, indent=2))
tot = sum(p.stat().st_size for p in OUT.rglob('*.webp'))
print(f'{n} frames {W}x{H}, {tot / 1e6:.1f} MB -> {OUT.relative_to(ROOT)}')
