/**
 * Soft "rest is over" chime (QA #38): two short sine notes, quiet, no audio file.
 * Browsers only allow sound after a user gesture, so primeChime() is called from the tap that starts the rest.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

export function primeChime(): void {
  const c = context();
  if (c && c.state === 'suspended') c.resume().catch(() => undefined);
}

export function playChime(volume = 0.09): void {
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => undefined);
  const start = c.currentTime + 0.02;
  // E6 then A6: bright but gentle, ~0.9 s in total.
  [[1318.5, 0], [1760, 0.16]].forEach(([freq, offset]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t0 = start + offset;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.75);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + 0.8);
  });
}
