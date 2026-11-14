import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Footprints, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Sheet, Stepper } from './ui';
import { useCreateCheckIn } from './hooks';
import { haptic } from './format';

const Scale: React.FC<{ value: number | null; onChange: (v: number) => void; from: number; to: number; label: string }> = ({ value, onChange, from, to, label }) => (
  <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={label} dir="ltr">
    {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => (
      <button
        key={n}
        type="button"
        role="radio"
        aria-checked={value === n}
        onClick={() => {
          haptic();
          onChange(n);
        }}
        className={cn('tp-press tp-num h-12 rounded-2xl text-lg', value === n ? 'bg-primary text-primary-foreground shadow-[0_10px_20px_-12px_hsl(var(--primary))]' : 'bg-foreground/[.06] text-foreground/80')}
      >
        {n}
      </button>
    ))}
  </div>
);

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
const CheckInSheet: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; lastWeight?: number | null }> = ({ open, onOpenChange, lastWeight }) => {
  const { t } = useTranslation();
  const create = useCreateCheckIn();
  const [weight, setWeight] = useState('');
  const [steps, setSteps] = useState('');
  const [sleep, setSleep] = useState<number | null>(null);
  const [hunger, setHunger] = useState<number | null>(null);
  const [walked, setWalked] = useState<boolean | null>(null);
  const [sun, setSun] = useState<boolean | null>(null);

  useEffect(() => {
    if (open) {
      setWeight(lastWeight ? String(lastWeight) : '');
      setSteps('');
      setSleep(null);
      setHunger(null);
      setWalked(null);
      setSun(null);
    }
  }, [open, lastWeight]);

  const submit = () => {
    const w = parseFloat(weight.replace(',', '.'));
    const s = parseInt(steps, 10);
    create.mutate(
      {
        weight: Number.isFinite(w) && w > 0 ? w : null,
        steps: Number.isFinite(s) ? s : null,
        sleep_hours: sleep,
        hunger_level: hunger,
        walked_10000_steps: walked ?? (Number.isFinite(s) ? s >= 10000 : null),
        sun_exposure_10min: sun,
      },
      {
        onSuccess: () => {
          haptic([10, 40, 10]);
          toast.success(t('trainee.checkin.saved'));
        },
        onError: () => toast.error(t('trainee.checkin.saveError')),
      },
    );
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('trainee.checkin.title')}
      description={t('trainee.checkin.subtitle')}
      footer={
        <button type="button" onClick={submit} className="tp-btn tp-btn--primary tp-press w-full">
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
          </label>
          <label className="block">
            <span className="tp-label mb-2 block">{t('trainee.checkin.steps')}</span>
            <input className="tp-input text-center font-semibold" inputMode="numeric" value={steps} onChange={(e) => setSteps(e.target.value.replace(/\D/g, ''))} placeholder="8000" dir="ltr" />
          </label>
        </div>
        <div>
          <span className="tp-label mb-2 block">{t('trainee.checkin.sleep')}</span>
          <Scale value={sleep} onChange={setSleep} from={4} to={13} label={t('trainee.checkin.sleep')} />
          <p className="mt-1.5 text-xs text-muted-foreground">{t('trainee.checkin.sleepHint')}</p>
        </div>
        <div>
          <span className="tp-label mb-2 block">{t('trainee.checkin.hunger')}</span>
          <Scale value={hunger} onChange={setHunger} from={1} to={10} label={t('trainee.checkin.hunger')} />
          <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
            <span>{t('trainee.checkin.hungerLow')}</span>
            <span>{t('trainee.checkin.hungerHigh')}</span>
          </div>
        </div>
        <div className="grid gap-2 min-[420px]:grid-cols-2">
          <Toggle on={walked} onChange={setWalked} icon={Footprints} label={t('trainee.checkin.walked')} />
          <Toggle on={sun} onChange={setSun} icon={Sun} label={t('trainee.checkin.sun')} />
        </div>
      </div>
    </Sheet>
  );
};

export default CheckInSheet;
