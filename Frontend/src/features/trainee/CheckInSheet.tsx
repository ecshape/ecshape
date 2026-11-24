import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Footprints, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Sheet, Stepper } from './ui';
import { useCreateCheckIn, useUpdateCheckIn } from './hooks';
import type { CheckIn } from './types';
import '@/i18n/ticketsStudio';
import { haptic } from './format';

/**
 * QA #114 / #115: a slider instead of a row of numbers. Big thumb, the chosen value shown large above it, the whole
 * range under it, and an optional label under each end. Starts empty (nothing saved) until the trainee touches it.
 * Follows the page direction (in Hebrew the low end is on the right, like the labels).
 */
const SliderScale: React.FC<{
  value: number | null; onChange: (v: number) => void; from: number; to: number; label: string;
  low?: string; high?: string; unit?: string;
}> = ({ value, onChange, from, to, label, low, high, unit }) => {
  // QA #132: the thumb glides with the finger (fine steps) instead of jumping from number to number, then eases
  // onto the nearest whole number when released. The saved value is always a whole number.
  const [raw, setRaw] = useState<number | null>(null);
  const anim = React.useRef(0);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);
  const shown = raw ?? value ?? Math.round((from + to) / 2);
  const pct = ((shown - from) / (to - from)) * 100;
  const pick = (v: number) => {
    const n = Math.min(to, Math.max(from, Math.round(v)));
    if (n !== value) { haptic(); onChange(n); }
  };
  const settle = () => {
    if (raw == null) return;
    const a = raw, b = Math.min(to, Math.max(from, Math.round(raw))), t0 = performance.now();
    pick(b);
    cancelAnimationFrame(anim.current);
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 140);
      const e = 1 - (1 - k) ** 3;
      if (k < 1) { setRaw(a + (b - a) * e); anim.current = requestAnimationFrame(step); } else setRaw(null);
    };
    anim.current = requestAnimationFrame(step);
  };
  return (
    <div className="tp-slider" data-empty={value == null || undefined}>
      <div className="mb-1 flex items-baseline justify-center gap-1.5" aria-hidden="true">
        <span className="tp-num text-3xl font-bold leading-none">{value ?? '–'}</span>
        {unit && value != null && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      <input
        type="range"
        min={from}
        max={to}
        step={0.01}
        value={shown}
        aria-label={label}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value == null ? '–' : `${value}${unit ? ` ${unit}` : ''}`}
        onChange={(e) => {
          const v = Number(e.target.value);
          cancelAnimationFrame(anim.current);
          setRaw(v);
          pick(v);
        }}
        onKeyDown={(e) => {
          // whole steps from the keyboard
          const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          const rtl = getComputedStyle(e.currentTarget).direction === 'rtl' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft');
          setRaw(null);
          pick((value ?? shown) + (rtl ? -d : d));
        }}
        onPointerDown={() => { if (value == null) onChange(Math.round(shown)); }}
        onPointerUp={settle}
        onPointerCancel={settle}
        onTouchEnd={settle}
        onBlur={settle}
        className="tp-range"
        style={{ '--p': `${pct}%` } as React.CSSProperties}
      />
      <div className="mt-1 flex justify-between px-[6px] text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
        {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => (
          <span key={n} className={cn('w-4 text-center transition-colors', n === value && 'font-bold text-foreground')}>{n}</span>
        ))}
      </div>
      {(low || high) && (
        <div className="mt-1.5 flex justify-between gap-4 text-xs text-muted-foreground">
          <span>{low}</span>
          <span className="text-end">{high}</span>
        </div>
      )}
    </div>
  );
};

const Toggle: React.FC<{ on: boolean | null; onChange: (v: boolean) => void; icon: React.ElementType; label: string }> = ({ on, onChange, icon: Icon, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={!!on}
    onClick={() => {
      haptic();
      onChange(!on);
    }}
    className={cn('tp-press flex min-h-[3.5rem] items-center gap-3 rounded-2xl px-4 text-start text-sm font-semibold', on ? 'bg-primary/15 text-foreground ring-2 ring-primary' : 'bg-foreground/[.06] text-foreground/80')}
  >
    <Icon className={cn('h-5 w-5 flex-none', on ? 'text-primary' : 'text-muted-foreground')} />
    <span className="min-w-0 flex-1">{label}</span>
    <span className={cn('grid h-6 w-6 flex-none place-items-center rounded-full', on ? 'bg-primary text-primary-foreground' : 'bg-foreground/10')}>{on && <Check className="h-4 w-4" />}</span>
  </button>
);

/** Daily check-in: weight, steps, sleep, hunger and two habits. One screen, big targets. */
const CheckInSheet: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; lastWeight?: number | null; existing?: CheckIn | null }> = ({ open, onOpenChange, lastWeight, existing }) => {
  const { t } = useTranslation();
  const create = useCreateCheckIn();
  const update = useUpdateCheckIn();
  const [weight, setWeight] = useState('');
  const [steps, setSteps] = useState('');
  const [sleep, setSleep] = useState<number | null>(null);
  const [hunger, setHunger] = useState<number | null>(null);
  const [walked, setWalked] = useState<boolean | null>(null);
  const [sun, setSun] = useState<boolean | null>(null);

  useEffect(() => {
    if (open) {
      // Editing today's check-in starts from what was saved
      setWeight(existing?.weight ? String(existing.weight) : lastWeight ? String(lastWeight) : '');
      setSteps(existing?.steps != null ? String(existing.steps) : '');
      setSleep(existing?.sleep_hours ?? null);
      setHunger(existing?.hunger_level ?? null);
      setWalked(existing?.walked_10000_steps ?? null);
      setSun(existing?.sun_exposure_10min ?? null);
    }
  }, [open, lastWeight, existing]);

  // Same limits as the weigh-in and the API: 20-400 kg, 0-100,000 steps (A2A trainee F3)
  const wNum = parseFloat(weight.replace(',', '.'));
  const sNum = parseInt(steps, 10);
  const weightBad = weight.trim() !== '' && (!Number.isFinite(wNum) || wNum < 20 || wNum > 400);
  const stepsBad = steps.trim() !== '' && (!Number.isFinite(sNum) || sNum > 100000);
  const busy = create.isPending || update.isPending;

  const submit = () => {
    if (weightBad || stepsBad || busy) return;
    const w = wNum;
    const s = sNum;
    const body = {
        weight: Number.isFinite(w) && w > 0 ? w : null,
        steps: Number.isFinite(s) ? s : null,
        sleep_hours: sleep,
        hunger_level: hunger,
        // entered steps decide the 10,000 badge; the toggle only counts when no steps were typed (r2 P2)
        walked_10000_steps: Number.isFinite(s) ? s >= 10000 : walked,
        sun_exposure_10min: sun,
    };
    const opts = {
      // the sheet closes once the save really succeeded; on error it stays open with the values
      onSuccess: () => {
        haptic([10, 40, 10]);
        toast.success(t('trainee.checkin.saved'));
        onOpenChange(false);
      },
      onError: () => toast.error(t('trainee.checkin.saveError')),
    };
    if (existing && existing.id > 0) update.mutate({ id: existing.id, ...body }, opts);
    else create.mutate(body, opts);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={existing && existing.id > 0 ? t('trainee.checkin.edit', { defaultValue: 'Edit check-in' }) : t('trainee.checkin.title')}
      description={t('trainee.checkin.subtitle')}
      footer={
        <button type="button" onClick={submit} disabled={weightBad || stepsBad || busy} className="tp-btn tp-btn--primary tp-press w-full">
          <Check className="h-5 w-5" />
          {t('trainee.checkin.submit')}
        </button>
      }
    >
      <div className="space-y-6 pb-2 pt-2">
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
          <label className="block">
            <span className="tp-label mb-2 block">{t('trainee.checkin.weight')}</span>
            <Stepper value={weight} onChange={setWeight} step={0.1} decimal label={t('trainee.checkin.weight')} placeholder="kg" />
            {weightBad && <span className="mt-1.5 block text-xs text-destructive" role="alert">{t('trainee.checkin.weightRange', { defaultValue: '20–400 kg' })}</span>}
          </label>
          <label className="block">
            <span className="tp-label mb-2 block">{t('trainee.checkin.steps')}</span>
            <input className="tp-input text-center font-semibold" inputMode="numeric" aria-label={t('trainee.checkin.steps')} value={steps} onChange={(e) => setSteps(e.target.value.replace(/\D/g, ''))} placeholder="8000" dir="ltr" />
            {stepsBad && <span className="mt-1.5 block text-xs text-destructive" role="alert">{t('trainee.checkin.stepsRange', { defaultValue: '0–100,000' })}</span>}
          </label>
        </div>
        <div>
          <span className="tp-label mb-2 block">{t('trainee.checkin.sleep')}</span>
          <SliderScale value={sleep} onChange={setSleep} from={3} to={11} label={t('trainee.checkin.sleep')} unit={t('trainee.checkin.sleepUnit')} />
          <p className="mt-1.5 text-xs text-muted-foreground">{t('trainee.checkin.sleepHint')}</p>
        </div>
        <div>
          <span className="tp-label mb-2 block">{t('trainee.checkin.hunger')}</span>
          <SliderScale value={hunger} onChange={setHunger} from={1} to={10} label={t('trainee.checkin.hunger')} low={t('trainee.checkin.hungerLow')} high={t('trainee.checkin.hungerHigh')} />
        </div>
        <div className="grid gap-2 min-[420px]:grid-cols-2">
          <Toggle on={steps.trim() && Number.isFinite(sNum) ? sNum >= 10000 : walked} onChange={setWalked} icon={Footprints} label={t('trainee.checkin.walked')} />
          <Toggle on={sun} onChange={setSun} icon={Sun} label={t('trainee.checkin.sun')} />
        </div>
      </div>
    </Sheet>
  );
};

export default CheckInSheet;
