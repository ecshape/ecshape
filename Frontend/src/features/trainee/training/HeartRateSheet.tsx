import React, { useEffect, useRef, useState } from 'react';
import { Bluetooth, Camera, Heart, PencilLine } from 'lucide-react';
import { Sheet } from '../ui';
import { cn } from '@/lib/utils';
import { useTT } from './shared';
import { startCameraHeartRate, type PpgState } from './cameraHeartRate';
import type { useHeartRate } from './useHeartRate';

/**
 * QA #91: three app-free ways to bring a heart rate into the workout:
 * a Bluetooth watch / strap (Chrome, Edge, Android), the phone camera and a fingertip (any browser, iPhone included),
 * or typing the number a watch shows. The chosen value shows in the workout header.
 */
export const HeartRateSheet: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  hr: ReturnType<typeof useHeartRate>;
  onValue: (bpm: number) => void;
}> = ({ open, onOpenChange, hr, onValue }) => {
  const { tt } = useTT();
  const [ppg, setPpg] = useState<PpgState | null>(null);
  const [manual, setManual] = useState('');
  const stopRef = useRef<(() => void) | null>(null);

  const stopCamera = () => { stopRef.current?.(); stopRef.current = null; };
  useEffect(() => { if (!open) { stopCamera(); setPpg(null); } }, [open]);
  useEffect(() => stopCamera, []);

  const startCamera = () => {
    stopCamera();
    stopRef.current = startCameraHeartRate((s) => {
      setPpg(s);
      if (s.phase === 'done') { onValue(s.bpm); }
    });
  };
  const submitManual = () => {
    const n = Math.round(Number(manual));
    if (n >= 30 && n <= 230) { onValue(n); setManual(''); onOpenChange(false); }
  };

  const msg = !ppg ? null
    : ppg.phase === 'starting' ? tt('player.hrCamStarting')
    : ppg.phase === 'no-finger' ? tt('player.hrCamFinger')
    : ppg.phase === 'measuring' ? tt('player.hrCamHold')
    : ppg.phase === 'done' ? tt('player.hrCamDone')
    : ppg.reason === 'denied' ? tt('player.hrCamDenied')
    : ppg.reason === 'unclear' ? tt('player.hrCamUnclear')
    : tt('player.hrCamUnsupported');

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={tt('player.hrTitle')} description={tt('player.hrDesc')}>
      <div className="space-y-3 px-5 pb-6 sm:px-6">
        <div className="rounded-2xl bg-foreground/[.04] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold"><Camera className="h-4 w-4 text-primary" />{tt('player.hrCamera')}</p>
          <p className="mb-3 text-xs text-muted-foreground">{tt('player.hrCameraHow')}</p>
          {ppg && ppg.phase !== 'error' && (
            <div className="mb-3 text-center" role="status" aria-live="polite">
              <p className="tp-num text-5xl" dir="ltr">
                {ppg.phase === 'done' ? ppg.bpm : ppg.phase === 'measuring' && ppg.bpm ? ppg.bpm : '—'}
                <span className="ms-1 text-sm text-muted-foreground">BPM</span>
              </p>
              {ppg.phase === 'measuring' && (
                <div className="mx-auto mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-foreground/10"><div className="tr-grad h-full transition-[width]" style={{ width: `${ppg.progress * 100}%` }} /></div>
              )}
            </div>
          )}
          {msg && <p className={cn('mb-3 text-center text-sm', ppg?.phase === 'error' ? 'text-red-500' : 'text-muted-foreground')}>{msg}</p>}
          <button type="button" onClick={startCamera} className="tp-btn tp-btn--primary tp-btn--sm tp-press w-full">
            <Heart className="h-4 w-4" />{ppg && ppg.phase !== 'error' && ppg.phase !== 'done' ? tt('player.hrCamRestart') : tt('player.hrCamStart')}
          </button>
        </div>

        {hr.supported && (
          <div className="rounded-2xl bg-foreground/[.04] p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold"><Bluetooth className="h-4 w-4 text-primary" />{tt('player.hrBluetooth')}</p>
            <p className="mb-3 text-xs text-muted-foreground">{tt('player.hrBluetoothHow')}</p>
            <button
              type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press w-full"
              onClick={() => { if (hr.status === 'live') hr.disconnect(); else { void hr.connect(); onOpenChange(false); } }}
            >
              {hr.status === 'live' ? tt('player.hrOff') : tt('player.hrConnectDevice')}
            </button>
            {hr.status === 'error' && <p className="mt-2 text-xs text-red-500">{tt('player.hrError')}</p>}
          </div>
        )}

        <div className="rounded-2xl bg-foreground/[.04] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold"><PencilLine className="h-4 w-4 text-primary" />{tt('player.hrManual')}</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submitManual(); }}>
            <input
              type="number" inputMode="numeric" min={30} max={230} value={manual} onChange={(e) => setManual(e.target.value)}
              placeholder="BPM" dir="ltr" aria-label={tt('player.hrManual')}
              className="min-h-[2.4rem] w-full rounded-xl bg-background px-3 text-center text-sm ring-1 ring-border/60 focus:outline-none focus:ring-primary"
            />
            <button type="submit" className="tp-btn tp-btn--ghost tp-btn--sm tp-press">{tt('player.hrSave')}</button>
          </form>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">{tt('player.hrDisclaimer')}</p>
      </div>
    </Sheet>
  );
};
