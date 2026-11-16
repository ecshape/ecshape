/**
 * Heart rate from the phone camera, no app and no wearable (QA #91): photoplethysmography.
 * The fingertip covers the rear camera (with the torch on when the phone allows it); every heartbeat pushes blood
 * through the fingertip and makes the picture a touch redder. We average the red channel of each frame, remove the slow
 * drift, find the beats and take the median gap between them. Works wherever the browser gives camera access,
 * including iPhone Safari. It is a wellness estimate, not a medical reading.
 */
export type PpgState =
  | { phase: 'starting' }
  | { phase: 'no-finger' }
  | { phase: 'measuring'; progress: number; bpm: number | null }
  | { phase: 'done'; bpm: number }
  | { phase: 'error'; reason: 'denied' | 'unsupported' | 'unclear' };

const WARMUP_MS = 3000;
const MEASURE_MS = 15000;

/** Beats per minute from evenly noisy red-channel samples [timeMs, value]. Null when no steady beat is found. */
export function bpmFromSamples(samples: [number, number][]): number | null {
  if (samples.length < 60) return null;
  const t = samples.map((s) => s[0]);
  const raw = samples.map((s) => s[1]);
  // 1) remove slow drift: subtract a ~0.8 s moving average
  const detr: number[] = [];
  let lo = 0; let hi = 0; let sum = 0;
  for (let i = 0; i < raw.length; i++) {
    while (hi < raw.length && t[hi] <= t[i] + 400) sum += raw[hi++];
    while (t[lo] < t[i] - 400) sum -= raw[lo++];
    detr.push(raw[i] - sum / (hi - lo));
  }
  // 2) smooth lightly (5 samples) to calm sensor noise
  const sm = detr.map((_, i) => {
    let a = 0; let n = 0;
    for (let k = -2; k <= 2; k++) if (detr[i + k] !== undefined) { a += detr[i + k]; n++; }
    return a / n;
  });
  const mean = sm.reduce((a, b) => a + b, 0) / sm.length;
  const sd = Math.sqrt(sm.reduce((a, b) => a + (b - mean) ** 2, 0) / sm.length);
  if (sd < 0.05) return null;
  // 3) peaks at least 0.33 s apart (max 180 bpm), above a fraction of the spread
  const peaks: number[] = [];
  for (let i = 2; i < sm.length - 2; i++) {
    if (sm[i] > sm[i - 1] && sm[i] >= sm[i + 1] && sm[i] > sm[i - 2] && sm[i] >= sm[i + 2] && sm[i] > 0.35 * sd) {
      const last = peaks[peaks.length - 1];
      if (last === undefined || t[i] - t[last] >= 330) peaks.push(i);
      else if (sm[i] > sm[last]) peaks[peaks.length - 1] = i;
    }
  }
  if (peaks.length < 8) return null;
  const gaps = peaks.slice(1).map((p, i) => t[p] - t[peaks[i]]).filter((g) => g >= 330 && g <= 1500).sort((a, b) => a - b);
  if (gaps.length < 6) return null;
  const median = gaps[Math.floor(gaps.length / 2)];
  // a steady pulse: most gaps stay within 25% of the median
  const steady = gaps.filter((g) => Math.abs(g - median) / median < 0.25).length / gaps.length;
  if (steady < 0.6) return null;
  const bpm = Math.round(60000 / median);
  return bpm >= 40 && bpm <= 200 ? bpm : null;
}

/** Starts a measurement. Returns a stop function; `onState` reports every step. */
export function startCameraHeartRate(onState: (s: PpgState) => void): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;
  let timer = 0;
  const stop = () => {
    stopped = true;
    window.clearInterval(timer);
    stream?.getTracks().forEach((tr) => tr.stop());
    stream = null;
  };
  onState({ phase: 'starting' });
  if (!navigator.mediaDevices?.getUserMedia) {
    onState({ phase: 'error', reason: 'unsupported' });
    return stop;
  }
  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 160 }, height: { ideal: 120 }, frameRate: { ideal: 30 } },
        audio: false,
      });
    } catch (e) {
      if (!stopped) onState({ phase: 'error', reason: e instanceof Error && e.name === 'NotAllowedError' ? 'denied' : 'unsupported' });
      return;
    }
    if (stopped) { stop(); return; }
    const track = stream.getVideoTracks()[0];
    // the torch lights the finger from behind; not every phone / browser allows it, and that is fine
    try { await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] }); } catch { /* no torch */ }
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play().catch(() => undefined);
    const canvas = document.createElement('canvas');
    canvas.width = 24; canvas.height = 24;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) { stop(); onState({ phase: 'error', reason: 'unsupported' }); return; }

    const samples: [number, number][] = [];
    let fingerSince = 0;
    timer = window.setInterval(() => {
      if (stopped || video.readyState < 2) return;
      const vw = video.videoWidth || 160; const vh = video.videoHeight || 120;
      const side = Math.min(vw, vh) * 0.5; // the middle of the picture, where the fingertip is
      ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, 24, 24);
      const px = ctx.getImageData(0, 0, 24, 24).data;
      let r = 0; let g = 0;
      for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; }
      const n = px.length / 4; r /= n; g /= n;
      const finger = r > 90 && r > g * 1.6; // red-dominant picture = a finger over the lens
      const now = performance.now();
      if (!finger) { fingerSince = 0; samples.length = 0; onState({ phase: 'no-finger' }); return; }
      if (!fingerSince) fingerSince = now;
      const sinceFinger = now - fingerSince;
      if (sinceFinger < WARMUP_MS) { onState({ phase: 'measuring', progress: 0, bpm: null }); return; }
      samples.push([now, r]);
      const elapsed = now - (fingerSince + WARMUP_MS);
      const live = samples.length > 120 ? bpmFromSamples(samples.slice(-300)) : null;
      onState({ phase: 'measuring', progress: Math.min(1, elapsed / MEASURE_MS), bpm: live });
      if (elapsed >= MEASURE_MS) {
        const bpm = bpmFromSamples(samples);
        stop();
        onState(bpm ? { phase: 'done', bpm } : { phase: 'error', reason: 'unclear' });
      }
    }, 33);
  })();
  return stop;
}
