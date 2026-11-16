import React, { useRef, useState } from 'react';
import { EcSpinner } from '@/components/brand/EcLoader';
import { useTranslation } from 'react-i18next';
import { Barcode, Camera, Link2, PencilLine, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { BarcodeStep } from '@/features/trainee/AddMealSheet';
import { downscaleImage, type AiFood, type BarcodeProduct } from '@/features/trainee/mealTools';
import '@/i18n/ticketsQa3';
import { cn } from '@/lib/utils';
import { api } from '@/features/trainee/api';
import { Seg, Sheet } from '@/features/trainer/ui';
import { InfoTip } from '@/components/ui/info-tip';
import { Switch } from '@/components/ui/switch';
import { IconOf, MACRO_ICON } from './FoodIcons';
import { FoodPhoto, PropertyChip } from './FoodParts';
import { MANUAL_TAGS, type MacroType, type MealBankItem, type PropertyTag } from './foodbankModel';

export interface FoodFormState {
  name: string;
  name_hebrew: string;
  macro_type: MacroType;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  measurement_type: 'per_100g' | 'per_portion';
  serving_size: string;
  is_public: boolean;
  image_url: string;
  tags: PropertyTag[];
}

const MACROS: MacroType[] = ['protein', 'carb', 'fat'];
const num = (s: string) => (s.trim() === '' ? 0 : Number(s) || 0);
/** Atwater estimate: 4 kcal per g of protein and carbs, 9 per g of fat. */
export const estimateKcal = (f: Pick<FoodFormState, 'protein' | 'carbs' | 'fat'>) => Math.round(num(f.protein) * 4 + num(f.carbs) * 4 + num(f.fat) * 9);
export const isStorablePhoto = (u: string) => !u || u.startsWith('https://') || u.startsWith('/files/media/food_photos/');

/**
 * Create / edit a food (#25): one scrolling form in clear sections (photo and names, category, nutrition with live
 * calories, properties, visibility). The photo can be uploaded from the device, set from a URL, or removed.
 */
export const FoodFormSheet: React.FC<{
  open: boolean;
  editing: MealBankItem | null;
  form: FoodFormState;
  setForm: React.Dispatch<React.SetStateAction<FoodFormState>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving?: boolean;
}> = ({ open, editing, form, setForm, onSubmit, onClose, saving }) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || 'he').slice(0, 2);
  const fileRef = useRef<HTMLInputElement>(null);
  const aiRef = useRef<HTMLInputElement>(null);
  const [quick, setQuick] = useState<'manual' | 'barcode'>('manual');
  const [reading, setReading] = useState(false);
  const [quickMsg, setQuickMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [urlOpen, setUrlOpen] = useState(false);
  const set = <K extends keyof FoodFormState>(k: K, v: FoodFormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const per = form.measurement_type === 'per_100g' ? t('foodBankPro.per100g') : t('foodBankPro.perPortion');
  const est = estimateKcal(form);
  const kcal = num(form.calories);
  const off = kcal > 0 && est > 0 && Math.abs(kcal - est) / Math.max(kcal, est) > 0.15;

  const upload = async (file: File) => {
    setPhotoError('');
    if (!file.type.startsWith('image/')) { setPhotoError(t('tt.food.photoType')); return; }
    if (file.size > 10 * 1024 * 1024) { setPhotoError(t('tt.food.photoSize')); return; }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const r = await api<{ url: string }>('/files/food-photo', { method: 'POST', body });
      set('image_url', r.url);
      setUrlOpen(false);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  /** QA #80: fill the form from per-100 g values (photo or barcode), like the trainee's add-meal tools. */
  const fillFrom = (name: string, per100: { calories: number; protein: number; carbs: number; fat: number }, image?: string | null) => {
    const r = (n: number) => String(Math.round(n * 10) / 10);
    const energy = { protein: per100.protein * 4, carb: per100.carbs * 4, fat: per100.fat * 9 };
    const macro = (Object.entries(energy).sort((a, b) => b[1] - a[1])[0][0]) as MacroType;
    setForm((f) => ({
      ...f,
      name_hebrew: lang === 'he' ? name : f.name_hebrew,
      name: lang === 'he' ? f.name : name,
      calories: String(Math.round(per100.calories)), protein: r(per100.protein), carbs: r(per100.carbs), fat: r(per100.fat),
      measurement_type: 'per_100g', serving_size: '100g', macro_type: macro,
      image_url: image && isStorablePhoto(image) ? image : f.image_url,
    }));
    setQuickMsg({ ok: true, text: t('qa3.foodQuick.filled') });
  };

  const fromPhoto = async (file?: File | null) => {
    if (!file) return;
    setQuickMsg(null);
    setReading(true);
    try {
      const blob = await downscaleImage(file);
      const fd = new FormData();
      fd.append('file', blob, 'food.jpg');
      const res = await api<{ foods: AiFood[] }>(`/v3/meals/ai/photo?lang=${lang}`, { method: 'POST', body: fd });
      const f = res.foods?.[0];
      if (!f) { setQuickMsg({ ok: false, text: t('qa3.foodQuick.photoFail') }); return; }
      const g = f.grams > 0 ? f.grams : 100;
      fillFrom(f.name, { calories: (f.calories * 100) / g, protein: (f.protein * 100) / g, carbs: (f.carbs * 100) / g, fat: (f.fat * 100) / g });
      if (!form.image_url) void upload(file); // the photo becomes the food's picture
    } catch {
      setQuickMsg({ ok: false, text: t('qa3.foodQuick.photoFail') });
    } finally {
      setReading(false);
    }
  };

  const fromBarcode = (p: BarcodeProduct) => {
    fillFrom(p.name, p.per100, p.image_url);
    setQuick('manual');
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? t('foodBank.editFoodItem') : t('foodBank.addNewFoodItem')}
      description={editing ? t('foodBank.editDescription') : t('foodBank.createDescription')}
      footer={
        <div className="flex gap-2">
          <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press flex-1" onClick={onClose}>{t('foodBank.cancel')}</button>
          <button type="submit" form="fb-food-form" className="tp-btn tp-btn--primary tp-btn--sm tp-press flex-1" disabled={saving || uploading}>
            {saving && <EcSpinner className="h-4 w-4" mono />}
            {editing ? t('foodBank.updateFoodItem') : t('foodBank.createFoodItem')}
          </button>
        </div>
      }
    >
      {!editing && (
        <section className="fb-section mb-5" aria-label={t('qa3.foodQuick.quick')}>
          <h3 className="tp-label mb-2">{t('qa3.foodQuick.quick')}</h3>
          <div className="grid grid-cols-3 gap-2">
            <input ref={aiRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => { fromPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" className="tp-press flex flex-col items-center gap-1.5 rounded-2xl bg-primary/10 px-2 py-3 text-xs font-bold text-primary" onClick={() => { setQuick('manual'); aiRef.current?.click(); }} disabled={reading}>
              {reading ? <EcSpinner className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}{t('qa3.foodQuick.photo')}
            </button>
            <button type="button" aria-pressed={quick === 'barcode'} className={cn('tp-press flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-bold', quick === 'barcode' ? 'bg-primary text-primary-foreground' : 'bg-foreground/[.05]')} onClick={() => { setQuickMsg(null); setQuick('barcode'); }}>
              <Barcode className="h-5 w-5" />{t('qa3.foodQuick.barcode')}
            </button>
            <button type="button" aria-pressed={quick === 'manual'} className={cn('tp-press flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-bold', quick === 'manual' ? 'bg-foreground/[.1]' : 'bg-foreground/[.05]')} onClick={() => setQuick('manual')}>
              <PencilLine className="h-5 w-5" />{t('qa3.foodQuick.manual')}
            </button>
          </div>
          {reading && <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">{t('qa3.foodQuick.reading')}</p>}
          {quickMsg && <p className={cn('mt-2 rounded-xl px-3 py-2 text-xs font-semibold', quickMsg.ok ? 'bg-[hsl(var(--tr-ok)/.12)] text-[hsl(var(--tr-ok))]' : 'bg-[hsl(var(--tr-bad)/.1)] text-[hsl(var(--tr-bad))]')} role="status">{quickMsg.text}</p>}
          {quick === 'barcode' && (
            <div className="mt-3">
              <BarcodeStep lang={lang} onBack={() => setQuick('manual')} onManual={() => setQuick('manual')} onProduct={fromBarcode} />
            </div>
          )}
        </section>
      )}
      <form id="fb-food-form" onSubmit={onSubmit} className={cn('tr-wide space-y-5 pb-2', quick === 'barcode' && !editing && 'hidden')}>
        {/* Photo + names */}
        <section className="fb-section flex flex-col gap-4 sm:flex-row">
          <div className="fb-photo-pick max-sm:mx-auto">
            <FoodPhoto src={form.image_url && isStorablePhoto(form.image_url) ? form.image_url : null} alt="" macro={form.macro_type} iconSize={30} className="!aspect-square w-full rounded-2xl" />
            {uploading && <span className="absolute inset-0 grid place-items-center rounded-2xl bg-black/45 text-white"><EcSpinner className="h-6 w-6" mono /></span>}
            <div className="mt-2 flex justify-center gap-1.5">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
              <button type="button" className="tp-icon-btn tp-press !h-9 !w-9" onClick={() => fileRef.current?.click()} aria-label={t('tt.food.upload')} title={t('tt.food.upload')}><Camera className="h-4 w-4" /></button>
              <button type="button" className="tp-icon-btn tp-press !h-9 !w-9" aria-pressed={urlOpen} onClick={() => setUrlOpen((v) => !v)} aria-label={t('tt.food.fromUrl')} title={t('tt.food.fromUrl')}><Link2 className="h-4 w-4" /></button>
              {form.image_url && (
                <button type="button" className="tp-icon-btn tp-press !h-9 !w-9 text-[hsl(var(--tr-bad))]" onClick={() => set('image_url', '')} aria-label={t('tt.food.removePhoto')} title={t('tt.food.removePhoto')}><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <label className="tr-field">
              <span className="tr-field-label">{t('foodBank.foodNameHebrew')} *</span>
              <input className="tp-input tr-input-sm" dir="rtl" required value={form.name_hebrew} placeholder={t('foodBank.foodNameHebrewPlaceholder')} onChange={(e) => set('name_hebrew', e.target.value)} />
            </label>
            <label className="tr-field">
              <span className="tr-field-label">{t('foodBank.foodName')}</span>
              <input className="tp-input tr-input-sm" dir="auto" value={form.name} placeholder={t('foodBank.foodNamePlaceholder')} onChange={(e) => set('name', e.target.value)} />
            </label>
            {urlOpen && (
              <label className="tr-field">
                <span className="tr-field-label flex items-center gap-1">{t('tt.food.photoUrl')}<InfoTip>{t('foodBankPro.form.photoHint')}</InfoTip></span>
                <input className="tp-input tr-input-sm" type="url" inputMode="url" dir="ltr" placeholder="https://" value={form.image_url.startsWith('/files/') ? '' : form.image_url} onChange={(e) => set('image_url', e.target.value)} />
              </label>
            )}
            {photoError && <p className="text-xs font-semibold text-[hsl(var(--tr-bad))]" role="alert">{photoError}</p>}
          </div>
        </section>

        {/* Category */}
        <section className="fb-section">
          <h3 className="tp-label mb-2 flex items-center gap-1">{t('foodBank.macroType')} *<InfoTip>{t('tt.food.macroInfo')}</InfoTip></h3>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('foodBank.macroType')}>
            {MACROS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={form.macro_type === m}
                onClick={() => set('macro_type', m)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-2xl border px-2 py-2.5 text-sm font-semibold transition-colors',
                  form.macro_type === m ? `fb-macro-badge fb-accent-${m} border-transparent` : 'border-border/70 text-muted-foreground hover:text-foreground',
                )}
              >
                <IconOf icon={MACRO_ICON[m]} size={18} />
                {t(`foodBankPro.macro.${m}`)}
              </button>
            ))}
          </div>
        </section>

        {/* Nutrition */}
        <section className="fb-section space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="tp-label flex items-center gap-1">{t('common.nutrition')}<InfoTip>{t('tt.food.nutritionInfo')}</InfoTip></h3>
            <Seg<'per_100g' | 'per_portion'>
              value={form.measurement_type}
              onChange={(v) => set('measurement_type', v)}
              label={t('foodBank.measurementType')}
              items={[{ id: 'per_100g', label: t('foodBankPro.per100g') }, { id: 'per_portion', label: t('foodBankPro.perPortion') }]}
            />
          </div>
          {form.measurement_type === 'per_portion' && (
            <label className="tr-field">
              <span className="tr-field-label">{t('foodBank.servingSize')}</span>
              <input className="tp-input tr-input-sm" value={form.serving_size} placeholder={t('foodBank.servingSizePlaceholderPerPortion')} onChange={(e) => set('serving_size', e.target.value)} />
            </label>
          )}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {([
              ['protein', t('foodBank.protein'), 'protein'],
              ['carbs', t('foodBank.carbs'), 'carb'],
              ['fat', t('foodBank.fat'), 'fat'],
              ['fiber', t('foodBankPro.form.fiber'), null],
            ] as const).map(([k, label, dot]) => (
              <label key={k} className="tr-field">
                <span className="tr-field-label flex items-center gap-1.5">{dot && <span className={cn('inline-block h-2 w-2 rounded-full', `fb-dot-${dot}`)} />}{label.includes('(') ? label : `${label} (${t('foodBankPro.g')})`}</span>
                <input className="tp-input tr-input-sm tabular-nums" type="number" inputMode="decimal" min="0" step="0.1" value={form[k]} onChange={(e) => set(k, e.target.value)} />
              </label>
            ))}
          </div>
          <div className="fb-kcal-live">
            <label className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="text-sm font-semibold">{t('foodBank.calories')}</span>
              <span className="text-xs text-muted-foreground">({per})</span>
              <input className="tp-input tr-input-sm ms-auto w-24 text-center tabular-nums" type="number" inputMode="numeric" min="0" step="1" value={form.calories} placeholder={est ? String(est) : '0'} onChange={(e) => set('calories', e.target.value)} aria-label={t('foodBank.calories')} />
            </label>
            {est > 0 && String(est) !== form.calories && (
              <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press !min-h-9 !px-3" onClick={() => set('calories', String(est))} title={t('tt.food.useEstimate')}>
                <Wand2 className="h-4 w-4" /><span className="tabular-nums">{est}</span>
              </button>
            )}
          </div>
          {off && <p className="text-xs text-[hsl(var(--tr-warn))]">{t('tt.food.kcalMismatch', { est })}</p>}
        </section>

        {/* Properties */}
        <section className="fb-section">
          <h3 className="tp-label mb-2 flex items-center gap-1">{t('foodBankPro.form.properties')}<InfoTip>{t('foodBankPro.form.propertiesHint')}</InfoTip></h3>
          <div className="flex flex-wrap gap-1.5">
            {MANUAL_TAGS.map((tag) => (
              <PropertyChip key={tag} tag={tag} active={form.tags.includes(tag)} onClick={() => setForm((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((x) => x !== tag) : [...f.tags, tag] }))} />
            ))}
          </div>
        </section>

        {/* Visibility */}
        <section className="fb-section">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="fb-is-public" className="flex cursor-pointer items-center gap-1 text-sm font-semibold">{t('foodBankPro.form.isPublic')}<InfoTip>{t('tt.food.publicInfo')}</InfoTip></label>
            <Switch id="fb-is-public" checked={form.is_public} onCheckedChange={(c) => set('is_public', c)} />
          </div>
          {editing?.source && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('foodBankPro.form.source', { source: editing.source === 'openfoodfacts' ? 'Open Food Facts' : t('foodBankPro.library.staples') })}
            </p>
          )}
        </section>
      </form>
    </Sheet>
  );
};

export default FoodFormSheet;
