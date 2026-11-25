#!/usr/bin/env python3
"""Hero scroll sequence from an AI image-to-video clip of the hero photo (arms crossed -> arms down, played in reverse).

    python3 tools/compose-ai-hero-sequence.py clip.mp4 --esrgan RealESRGAN_x2plus.pth [--last 52] [--lock 0.8]

The clip must start on the hero photo (arms crossed) and end with the arms down. AI video is low resolution and drifts
off-likeness, so the AI is trusted for one thing only — the arms and torso moving. Everything else stays the real photo:

  - background, legs and feet: the original high-resolution photo wherever the clip does not move;
  - the face: ALWAYS the real one. The head is tracked in the clip and the photo's own head is laid over it, following
    its small movements, so the smile and likeness never change;
  - arms / torso: the clip's pixels, upscaled x2 with Real-ESRGAN, colour-matched to the photo;
  - in-between frames (ffmpeg motion interpolation) so a slow scroll is smooth; the settled part of the clip is thinned;
  - the last frames are the untouched photo.

Output: Frontend/public/site/seq/hero/ (frames reversed: arms down -> crossed), same format as make-hero-sequence.py.
Needs ffmpeg, numpy, opencv-python-headless, Pillow, torch, spandrel.
"""
import argparse, json, shutil, subprocess, tempfile
from pathlib import Path
import cv2
import numpy as np
import torch
from PIL import Image, ImageOps
from spandrel import ModelLoader

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'Frontend' / 'public' / 'site' / 'seq' / 'hero'
PHOTO = ROOT / 'Frontend' / 'public' / 'site' / 'photos' / 'opt' / 'trainer.jpg'
W, H = 1200, 1600
SMALL = 820

ap = argparse.ArgumentParser()
ap.add_argument('video')
ap.add_argument('--esrgan', required=True)
ap.add_argument('--last', type=int, default=52, help='last clip frame to use (the relaxed arms-down pose)')
ap.add_argument('--settled', type=int, default=26, help='clip frame after which the arms are down (thinned x3)')
ap.add_argument('--lock', type=float, default=0.8)
ap.add_argument('--quality', type=int, default=80)
ap.add_argument('--face', default='655,470,90,115', help='face box in the 1200x1600 photo: x,y,w,h (forehead to chin, ear to ear)')
ap.add_argument('--debug', default=None)
a = ap.parse_args()

# ---- frames: motion-interpolated x3, then the settled tail thinned
tmp = Path(tempfile.mkdtemp())
subprocess.check_call(['ffmpeg', '-v', 'error', '-i', a.video, '-vf',
                       f"trim=start_frame=0:end_frame={a.last + 1},setpts=PTS-STARTPTS,minterpolate=fps=48:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:scd=none",
                       str(tmp / '%04d.png')])
allf = sorted(tmp.glob('*.png'))
cut = a.settled * 3
files = allf[:cut] + allf[cut::3]
vid = [cv2.cvtColor(cv2.imread(str(f)), cv2.COLOR_BGR2RGB) for f in files]
n = len(vid)
h0, w0 = vid[0].shape[:2]
sx, sy = W / w0, H / h0

photo_u8 = np.asarray(ImageOps.exif_transpose(Image.open(PHOTO)).convert('RGB').resize((W, H), Image.LANCZOS))
photo = photo_u8.astype(np.float32)

# ---- the head in the photo (largest face), and its track through the clip
fx, fy, fw, fh = [int(v) for v in a.face.split(',')]
print('face', fx, fy, fw, fh)
# template in clip resolution: the face box plus hair
tx0, ty0 = int((fx - fw * .15) / sx), int((fy - fh * .45) / sy)
tx1, ty1 = int((fx + fw * 1.15) / sx), int((fy + fh * 1.0) / sy)
g = lambda im: cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_RGB2GRAY), (0, 0), 1.2)
tpl = g(vid[0])[ty0:ty1, tx0:tx1]
R = 28
offs = []
for f in vid:
    win = g(f)[ty0 - R:ty1 + R, tx0 - R:tx1 + R]
    res = cv2.matchTemplate(win, tpl, cv2.TM_CCOEFF_NORMED)
    _, _, _, loc = cv2.minMaxLoc(res)
    # sub-pixel: centroid of the peak neighbourhood
    y, x = loc[1], loc[0]
    patch = res[max(0, y - 1):y + 2, max(0, x - 1):x + 2]
    yy, xx = np.mgrid[max(0, y - 1):max(0, y - 1) + patch.shape[0], max(0, x - 1):max(0, x - 1) + patch.shape[1]]
    wgt = np.clip(patch - patch.min(), 1e-6, None)
    offs.append(((xx * wgt).sum() / wgt.sum() - R, (yy * wgt).sum() / wgt.sum() - R))
offs = np.array(offs, np.float32)
k = np.array([1, 2, 3, 2, 1], np.float32); k /= k.sum()
offs = np.stack([np.convolve(np.pad(offs[:, i], 2, mode='edge'), k, mode='valid') for i in (0, 1)], 1)
offs -= offs[0]
print('head drift px (clip res): max', np.abs(offs).max(0))

# head matte: generous ellipse from the hair to just under the chin, feathered
hm = np.zeros((H, W), np.float32)
cv2.ellipse(hm, (int(fx + fw / 2), int(fy + fh * .42)), (int(fw * .66), int(fh * .88)), 0, 0, 360, 1, -1)
hm = cv2.GaussianBlur(hm, (0, 0), fw * .06)

# ---- Real-ESRGAN x2 for the clip pixels
dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
model = ModelLoader().load_from_file(a.esrgan).eval().to(dev)
def upscale(im):
    t = torch.from_numpy(im).permute(2, 0, 1).float().div(255).unsqueeze(0).to(dev)
    with torch.no_grad():
        o = model(t).clamp(0, 1)[0].permute(1, 2, 0).cpu().numpy()
    return cv2.resize(o * 255, (W, H), interpolation=cv2.INTER_AREA)

up0 = upscale(vid[0])
gain = photo.reshape(-1, 3).std(0) / (up0.reshape(-1, 3).std(0) + 1e-6)
bias = photo.reshape(-1, 3).mean(0) - gain * up0.reshape(-1, 3).mean(0)

# ---- motion masks (clip res): where a frame differs from the first one
g0 = cv2.GaussianBlur(cv2.cvtColor(vid[0], cv2.COLOR_RGB2GRAY), (0, 0), 2).astype(np.float32)
masks = []
for f in vid:
    gg = cv2.GaussianBlur(cv2.cvtColor(f, cv2.COLOR_RGB2GRAY), (0, 0), 2).astype(np.float32)
    m = (np.abs(gg - g0) > 10).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    masks.append(m.astype(np.float32))
masks = [np.max(masks[max(0, i - 2):min(n, i + 3)], axis=0) for i in range(n)]

if OUT.exists():
    shutil.rmtree(OUT)
(OUT / 'l').mkdir(parents=True)
(OUT / 's').mkdir(parents=True)
dbg = Path(a.debug) if a.debug else None
for i, f in enumerate(vid):
    ai = np.clip(upscale(f) * gain + bias, 0, 255)
    m = cv2.GaussianBlur(cv2.resize(masks[i], (W, H), interpolation=cv2.INTER_LINEAR), (0, 0), 7)[..., None]
    frame = photo * (1 - m) + ai * m
    # the real head, following the clip's head
    dx, dy = offs[i, 0] * sx, offs[i, 1] * sy
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    head = cv2.warpAffine(photo, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    hmat = cv2.warpAffine(hm, M, (W, H), flags=cv2.INTER_LINEAR)[..., None]
    frame = frame * (1 - hmat) + head * hmat
    rng = np.random.default_rng(i)
    frame = np.clip(frame + rng.normal(0, 1.6, (H, W, 1)), 0, 255).astype(np.uint8)
    kx = n - i                                                           # reversed: arms down first
    im = Image.fromarray(frame)
    im.save(OUT / 'l' / f'{kx:04d}.webp', 'WEBP', quality=a.quality, method=6)
    sm = im.copy(); sm.thumbnail((SMALL, SMALL), Image.LANCZOS)
    sm.save(OUT / 's' / f'{kx:04d}.webp', 'WEBP', quality=a.quality - 6, method=6)
    if dbg and kx in (1, n // 4, n // 2, int(n * .7), n):
        im.save(dbg / f'v2_{kx:04d}.png')

(OUT / 'manifest.json').write_text(json.dumps({
    'count': n, 'digits': 4, 'ext': 'webp', 'large': 'l', 'small': 's', 'width': W, 'height': H,
    'lock': a.lock, 'focus': '.40,.23,.76,.95', 'pos': '.58,.27', 'source': 'ai-image-to-video',
}, indent=2))
shutil.rmtree(tmp, ignore_errors=True)
tot = sum(p.stat().st_size for p in OUT.rglob('*.webp'))
print(f'{n} frames {W}x{H}, {tot / 1e6:.1f} MB -> {OUT.relative_to(ROOT)}')
