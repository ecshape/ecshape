import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Camera, Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, Stepper } from './ui';
import { useAddProgress, type NewEntry } from './hooks';
import { haptic } from './format';

export const MEASURES = ['waist', 'chest', 'hips', 'thighs', 'right_arm', 'left_arm'] as const;
type Measure = (typeof MEASURES)[number];
type PhotoKind = 'front' | 'side' | 'back';

const PhotoPick: React.FC<{ kind: PhotoKind; file?: File; onChange: (f?: File) => void }> = ({ kind, file, onChange }) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="relative">
      <label className={cn('tp-press flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl text-xs font-semibold', url ? '' : 'border-2 border-dashed border-foreground/15 bg-foreground/[.04] text-muted-foreground')}>
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : (<><Camera className="h-6 w-6" />{t(`trainee.progress.photo_${kind}`)}</>)}
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => onChange(e.target.files?.[0])} />
      </label>
      {url && (
        <button type="button" onClick={() => onChange(undefined)} className="absolute end-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white" aria-label={t('trainee.common.remove')}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

const WeighInSheet: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; lastWeight?: number | null }> = ({ open, onOpenChange, lastWeight }) => {
  const { t } = useTranslation();
  const add = useAddProgress();
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [measures, setMeasures] = useState<Partial<Record<Measure, string>>>({});
  const [photos, setPhotos] = useState<NewEntry['photos']>({});
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (open) {
      setWeight(lastWeight ? String(lastWeight) : '');
      setNotes('');
      setMeasures({});
      setPhotos({});
      setMore(false);
    }
  }, [open, lastWeight]);

  const w = parseFloat(weight.replace(',', '.'));
  const valid = Number.isFinite(w) && w > 20 && w < 400;

  const submit = () => {
    if (!valid) return;
    const m: NewEntry['measures'] = {};
    for (const k of MEASURES) {
      const v = parseFloat((measures[k] || '').replace(',', '.'));
      if (Number.isFinite(v) && v > 0) m[k] = v;
    }
    add.mutate(
      { weight: w, notes: notes.trim() || undefined, measures: m, photos },
      {
        onSuccess: () => {
          haptic([10, 40, 10]);
          toast.success(t('trainee.progress.saved'));
        },
        onError: () => toast.error(t('trainee.progress.saveError')),
      },
    );
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('trainee.progress.addTitle')}
      description={t('trainee.progress.addSubtitle')}
      footer={
        <button type="button" onClick={submit} disabled={!valid} className="tp-btn tp-btn--primary tp-press w-full">
          <Check className="h-5 w-5" />
          {t('trainee.progress.save')}
        </button>
      }
    >
      <div className="space-y-5 pb-2 pt-2">
        <label className="block">
          <span className="tp-label mb-2 block">{t('trainee.progress.weightKg')}</span>
          <Stepper value={weight} onChange={setWeight} step={0.1} decimal label={t('trainee.progress.weightKg')} className="h-14 text-2xl" placeholder="0.0" />
        </label>

        <div>
          <span className="tp-label mb-2 block">{t('trainee.progress.photos')}</span>
          <div className="grid grid-cols-3 gap-2">
            {(['front', 'side', 'back'] as PhotoKind[]).map((k) => (
              <PhotoPick key={k} kind={k} file={photos[k]} onChange={(f) => setPhotos((p) => ({ ...p, [k]: f }))} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-foreground/[.04]">
          <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="tp-press flex min-h-[3.25rem] w-full items-center justify-between px-4 text-sm font-semibold">
            {t('trainee.progress.measurements')}
            <ChevronDown className={cn('h-5 w-5 transition-transform', more && 'rotate-180')} />
          </button>
          {more && (
            <div className="grid grid-cols-2 gap-3 px-4 pb-4">
              {MEASURES.map((k) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{t(`trainee.progress.m_${k}`)}</span>
                  <input className="tp-input text-center" inputMode="decimal" dir="ltr" placeholder="cm" value={measures[k] || ''} onChange={(e) => setMeasures((s) => ({ ...s, [k]: e.target.value.replace(/[^\d.,]/g, '') }))} />
                </label>
              ))}
            </div>
          )}
        </div>

        <label className="block">
          <span className="tp-label mb-2 block">{t('trainee.progress.notes')}</span>
          <textarea className="tp-input min-h-[5rem] py-3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('trainee.progress.notesPlaceholder')} dir="auto" />
        </label>
      </div>
    </Sheet>
  );
};

export default WeighInSheet;
