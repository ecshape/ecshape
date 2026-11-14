import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Barcode, Camera, Check, ChevronRight, Heart, ImagePlus, Loader2, PencilLine, Plus, ScanLine, Search, Sparkles, Trash2, UtensilsCrossed, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mediaUrl } from '@/lib/mediaUrl';
import type { V3MealSlotView } from '@/types/meals-v3';
import { api, ApiError } from './api';
import { Sheet } from './ui';
import { fmtNum, haptic } from './format';
import {
  downscaleImage, draftTotals, hitToDraft, newDraft, useAiAvailable, useCreateSaved, useDeleteSaved, useFoodImage, useFoodSearch, useLogDrafts, useLogSaved, useSavedMeals,
  type AiFood, type BarcodeProduct, type DraftItem, type FoodHit,
} from './mealTools';
import './mealToolsI18n';

type Mode = 'home' | 'barcode' | 'busy' | 'review';
type Source = 'ai' | 'barcode' | 'search' | 'create';

type Props = {
  open: boolean;
  /** The planned meal the food joins, or null for a free entry outside the plan. */
  slot: V3MealSlotView | null;
  date: string;
  onClose: () => void;
  /** Opens the existing manual flow (menu / food bank / typed food). */
  onManual: () => void;
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

const AddMealSheet: React.FC<Props> = ({ open, slot, date, onClose, onManual }) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || 'en').slice(0, 2);
  const [mode, setMode] = useState<Mode>('home');
  const [source, setSource] = useState<Source>('create');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saveLater, setSaveLater] = useState(false);
  const [favName, setFavName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const ai = useAiAvailable(open);
  const saved = useSavedMeals();
  const search = useFoodSearch(dq, lang, open && mode === 'home');
  const logDrafts = useLogDrafts(date);
  const createSaved = useCreateSaved();
  const logSaved = useLogSaved(date);
  const delSaved = useDeleteSaved();
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const slotId = slot?.meal_slot_id ?? null;

  const reset = () => {
    setMode('home');
    setItems([]);
    setSaveLater(false);
    setFavName('');
    setNotice(null);
    setQ('');
  };
  const close = () => {
    reset();
    onClose();
  };
  /** Adds foods to the meal being built (keeps what is already there) and opens the review. */
  const toReview = (src: Source, list: DraftItem[]) => {
    setSource((cur) => (src === 'create' ? 'create' : items.length ? cur : src));
    setItems((cur) => [...cur, ...list]);
    if (src === 'create') setSaveLater(true);
    setMode('review');
  };

  const pickHit = (h: FoodHit) => {
    haptic(8);
    toReview('search', [hitToDraft(h)]);
    setQ('');
  };

  const onPhoto = async (file?: File | null) => {
    if (!file) return;
    setMode('busy');
    setNotice(null);
    try {
      const blob = await downscaleImage(file);
      const fd = new FormData();
      fd.append('file', blob, 'meal.jpg');
      const res = await api<{ foods: AiFood[] }>(`/v3/meals/ai/photo?lang=${lang}`, { method: 'POST', body: fd });
      if (!res.foods.length) {
        setNotice(t('trainee.mealTools.noFoods'));
        setMode(items.length ? 'review' : 'home');
        return;
      }
      toReview('ai', res.foods.map((f) => newDraft(f.name, f.grams || 100, { calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat }, { needsImage: true })));
    } catch (e) {
      setNotice(e instanceof ApiError && e.status === 503 ? t('trainee.mealTools.aiOff') : t('trainee.mealTools.photoFail'));
      setMode('home');
    }
  };

  const onProduct = (p: BarcodeProduct) => {
    const g = p.serving_grams && p.serving_grams > 0 ? Math.round(p.serving_grams) : 100;
    toReview('barcode', [newDraft(p.name, g, { ...p.per100 }, { baseGrams: 100, image: p.image_url ?? null, needsImage: !!p.needs_image })]);
  };

  const typed = (name = '') => toReview(items.length ? source : 'search', [newDraft(name.trim(), 100, undefined, { unit: 'g' })]);

  const confirm = () => {
    const named = items.filter((i) => i.name.trim());
    if (!named.length) return toast.error(t('trainee.mealTools.nothingToLog'));
    haptic([10, 30, 10]);
    if (source === 'create') {
      createSaved.mutate({ name: favName || named[0].name, items: named }, { onSuccess: () => { toast.success(t('trainee.mealTools.savedOk')); close(); }, onError: () => toast.error(t('trainee.meals.saveError')) });
      return;
    }
    logDrafts.mutate(
      { items: named, slotId, saveAs: saveLater ? favName || named.map((i) => i.name.trim()).join(', ').slice(0, 60) : undefined },
      { onSuccess: () => { toast.success(t('trainee.mealTools.logged')); close(); }, onError: () => toast.error(t('trainee.meals.saveError')) },
    );
  };

  const title = mode === 'review' ? t('trainee.mealTools.review') : mode === 'barcode' ? t('trainee.mealTools.scanTitle') : t('trainee.mealTools.logMeal');
  const total = items.reduce((a, i) => a + draftTotals(i).calories, 0);
  const pending = logDrafts.isPending || createSaved.isPending;
  const res = search.data;
  const searching = !!dq && (search.isFetching || dq !== res?.query);
  const sections: { key: string; label: string; hits: FoodHit[] }[] = res
    ? [
        { key: 'recent', label: t('trainee.mealTools.secRecent'), hits: res.recent },
        { key: 'coach', label: t('trainee.mealTools.secCoach'), hits: res.coach },
        { key: 'foods', label: t('trainee.mealTools.secFoods'), hits: res.foods },
        { key: 'products', label: t('trainee.mealTools.secProducts'), hits: res.products },
      ].filter((s) => s.hits.length)
    : [];
  const hitCount = sections.reduce((a, s) => a + s.hits.length, 0);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && close()}
      title={title}
      description={mode === 'home' ? (slot ? t('trainee.meals.customFor', { meal: slot.name }) : t('trainee.mealTools.logMealDesc')) : mode === 'review' ? t(source === 'ai' ? 'trainee.mealTools.reviewHelp' : 'trainee.mealTools.reviewHelpPlain') : undefined}
      footer={
        mode === 'review' ? (
          <button type="button" onClick={confirm} disabled={pending} className="tp-btn tp-btn--primary tp-press w-full">
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {source === 'create' ? t('trainee.meals.customSave') : t('trainee.mealTools.confirm')}
            <span className="opacity-80" dir="ltr">· {fmtNum(total)} kcal</span>
          </button>
        ) : mode === 'home' && items.length ? (
          <button type="button" onClick={() => setMode('review')} className="tp-btn tp-btn--primary tp-press w-full" data-testid="meal-basket">
            {t('trainee.mealTools.basket', { count: items.length })}
            <span className="opacity-80" dir="ltr">· {fmtNum(total)} kcal</span>
            <span className="ms-auto flex items-center gap-1">{t('trainee.mealTools.reviewBasket')}<ChevronRight className="h-4 w-4 rtl:rotate-180" /></span>
          </button>
        ) : undefined
      }
    >
      {mode === 'home' && (
        <div className="space-y-5 pb-2">
          <form role="search" onSubmit={(e) => e.preventDefault()} className="relative">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="text"
              inputMode="search"
              className="tp-input h-12 ps-11 pe-10 text-base"
              dir="auto"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('trainee.mealTools.searchPlaceholder')}
              aria-label={t('trainee.mealTools.searchLabel')}
              enterKeyHint="search"
              autoComplete="off"
              data-testid="food-search"
            />
            {searching ? (
              <Loader2 className="absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label={t('trainee.mealTools.searching')} />
            ) : q ? (
              <button type="button" onClick={() => setQ('')} className="absolute end-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[.06]" aria-label={t('trainee.mealTools.delete')}><X className="h-4 w-4" /></button>
            ) : null}
          </form>

          {dq ? (
            <div className="space-y-4" aria-live="polite">
              {sections.map((s) => (
                <section key={s.key}>
                  <p className="tp-label mb-1.5">{s.label}</p>
                  <ul className="space-y-1.5">
                    {s.hits.map((h) => <HitRow key={h.id} hit={h} aiImages={!!res?.ai_images} onPick={() => pickHit(h)} />)}
                  </ul>
                </section>
              ))}
              {!searching && !hitCount && <p className="rounded-2xl bg-foreground/[.04] px-3.5 py-3 text-sm text-muted-foreground">{t('trainee.mealTools.noResults', { q: dq })}</p>}
              {!!res?.errors.length && !searching && <p className="text-xs text-muted-foreground">{t('trainee.mealTools.searchError')}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => typed(dq)} className="tp-btn tp-btn--ghost tp-btn--sm tp-press"><PencilLine className="h-4 w-4" /><span dir="auto">{t('trainee.mealTools.addTyped', { q: dq.slice(0, 30) })}</span></button>
                <button type="button" onClick={() => { setNotice(null); setMode('barcode'); }} className="tp-btn tp-btn--ghost tp-btn--sm tp-press"><Barcode className="h-4 w-4" />{t('trainee.mealTools.barcode')}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Tile icon={Barcode} label={t('trainee.mealTools.barcode')} hint={t('trainee.mealTools.barcodeHint')} onClick={() => { haptic(6); setNotice(null); setMode('barcode'); }} />
                <Tile icon={Camera} label={t('trainee.mealTools.photo')} hint={t('trainee.mealTools.photoHint')} disabled={ai.data?.available === false} onClick={() => camRef.current?.click()} badge={<Sparkles className="h-3.5 w-3.5" />} />
                <Tile icon={PencilLine} label={t('trainee.mealTools.manual')} hint={t('trainee.mealTools.manualHint')} onClick={() => { onManual(); }} />
              </div>
              <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} data-testid="meal-photo-camera" />
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} data-testid="meal-photo-file" />
              {ai.data?.available !== false && (
                <button type="button" onClick={() => fileRef.current?.click()} className="tp-btn tp-btn--ghost tp-btn--sm tp-press -mt-2 w-full">
                  <ImagePlus className="h-4 w-4" />{t('trainee.mealTools.upload')}
                </button>
              )}
              {ai.data?.available === false && <p className="-mt-2 rounded-2xl bg-foreground/[.05] px-3 py-2 text-sm text-muted-foreground">{t('trainee.mealTools.aiOff')}</p>}
              {notice && <p role="alert" className="rounded-2xl bg-[hsl(var(--gold)/.12)] px-3 py-2 text-sm">{notice}</p>}

              {!!res?.recent.length && (
                <section>
                  <p className="tp-label mb-1.5">{t('trainee.mealTools.secRecent')}</p>
                  <ul className="space-y-1.5">
                    {res.recent.slice(0, 5).map((h) => <HitRow key={h.id} hit={h} aiImages={res.ai_images} onPick={() => pickHit(h)} />)}
                  </ul>
                </section>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="tp-label flex items-center gap-1.5"><Heart className="h-3.5 w-3.5" />{t('trainee.mealTools.saved')}</p>
                  <button type="button" onClick={() => { setItems([]); toReview('create', [newDraft()]); }} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">
                    <Plus className="h-4 w-4" />{t('trainee.mealTools.createSaved')}
                  </button>
                </div>
                {!saved.data?.length ? (
                  <p className="rounded-2xl bg-foreground/[.04] px-3.5 py-3 text-sm text-muted-foreground">{t('trainee.mealTools.savedEmpty')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {saved.data.map((m) => (
                      <li key={m.id} className="flex items-center gap-1 rounded-2xl bg-foreground/[.04] p-1.5 ps-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium" dir="auto">{m.name}</p>
                          <p className="truncate text-xs text-muted-foreground" dir="ltr" style={{ textAlign: 'inherit' }}>{fmtNum(m.totals.calories)} kcal · P{fmtNum(m.totals.protein)} C{fmtNum(m.totals.carbs)} F{fmtNum(m.totals.fat)}</p>
                        </div>
                        <button type="button" onClick={() => delSaved.mutate(m.id)} className="tp-icon-btn tp-press bg-transparent text-muted-foreground" aria-label={t('trainee.common.delete')}><Trash2 className="h-4 w-4" /></button>
                        <button
                          type="button"
                          disabled={logSaved.isPending}
                          onClick={() => { haptic(); logSaved.mutate({ id: m.id, slotId }, { onSuccess: () => { toast.success(t('trainee.mealTools.logged')); close(); }, onError: () => toast.error(t('trainee.meals.saveError')) }); }}
                          className="tp-btn tp-btn--primary tp-btn--sm tp-press"
                        >
                          <Plus className="h-4 w-4" />{t('trainee.mealTools.logAgain')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {mode === 'busy' && (
        <div className="flex flex-col items-center gap-3 py-14 text-center" role="status">
          <Loader2 className="h-9 w-9 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('trainee.mealTools.analyzing')}</p>
        </div>
      )}

      {mode === 'barcode' && <BarcodeStep lang={lang} onBack={() => setMode(items.length ? 'review' : 'home')} onProduct={onProduct} onManual={() => typed('')} />}

      {mode === 'review' && (
        <ReviewList
          items={items} setItems={setItems} source={source} saveLater={saveLater} setSaveLater={setSaveLater} favName={favName} setFavName={setFavName}
          onAddAnother={() => setMode('home')}
        />
      )}
    </Sheet>
  );
};

// ------------------------------------------------------------------ photos

/** True once the element has been near the viewport (AI photos are only made for foods someone actually sees). */
function useSeen<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') return setSeen(true);
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

const PALETTE = ['bg-[hsl(24_90%_55%/.16)] text-[hsl(24_80%_45%)]', 'bg-[hsl(142_50%_45%/.16)] text-[hsl(142_45%_32%)]', 'bg-[hsl(205_80%_55%/.16)] text-[hsl(205_70%_40%)]', 'bg-[hsl(330_70%_60%/.16)] text-[hsl(330_60%_45%)]', 'bg-[hsl(45_90%_55%/.2)] text-[hsl(40_80%_35%)]'];

/** Food photo: the real one, else the shared AI photo (made on first view), else an illustrated tile. */
export const FoodThumb: React.FC<{ name: string; src?: string | null; needsImage?: boolean; hint?: string | null; allowAi?: boolean; className?: string }> = ({ name, src, needsImage, hint, allowAi = true, className }) => {
  const { t } = useTranslation();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [broken, setBroken] = useState(false);
  const wantAi = allowAi && !!name.trim() && ((!src && !!needsImage) || broken);
  const gen = useFoodImage(name, hint, wantAi && seen);
  const url = !broken && src ? mediaUrl(src) : gen.data?.url ? mediaUrl(gen.data.url) : undefined;
  const isAi = !(!broken && src) && !!gen.data?.url;
  const letter = (name.trim()[0] || '?').toUpperCase();
  const tone = PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  return (
    <div ref={ref} className={cn('relative flex-none overflow-hidden rounded-xl bg-foreground/[.06]', className ?? 'h-14 w-14')}>
      {url ? (
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : gen.isFetching ? (
        <div className="grid h-full w-full animate-pulse place-items-center bg-gradient-to-br from-primary/10 to-primary/25"><Sparkles className="h-4 w-4 text-primary/70" aria-hidden /></div>
      ) : (
        <div className={cn('grid h-full w-full place-items-center', tone)} aria-hidden>
          <span className="text-lg font-bold leading-none">{letter}</span>
          <UtensilsCrossed className="absolute bottom-1 end-1 h-3 w-3 opacity-50" />
        </div>
      )}
      {isAi && <span className="absolute bottom-0.5 start-0.5 rounded-full bg-black/55 px-1 text-[9px] font-semibold leading-4 text-white" title={t('trainee.mealTools.aiPhoto')}>AI</span>}
    </div>
  );
};

const HitRow: React.FC<{ hit: FoodHit; aiImages: boolean; onPick: () => void }> = ({ hit, aiImages, onPick }) => {
  const { t } = useTranslation();
  const per = hit.unit === 'portion' ? (hit.serving_label || t('trainee.mealTools.perPortion')) : t('trainee.mealTools.per100');
  return (
    <li>
      <button type="button" onClick={onPick} className="tp-press flex w-full items-center gap-3 rounded-2xl bg-foreground/[.04] p-1.5 pe-2 text-start hover:bg-foreground/[.07]" data-testid="food-hit">
        <FoodThumb name={hit.name} src={hit.image_url} needsImage={hit.needs_image} hint={hit.name_en || hit.brand} allowAi={aiImages} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold" dir="auto">{hit.name}</span>
          <span className="block truncate text-xs text-muted-foreground" dir="auto">
            {hit.brand ? `${hit.brand} · ` : ''}<span dir="ltr">{fmtNum(hit.calories)} kcal</span> {per}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground/80" dir="ltr" style={{ textAlign: 'inherit' }}>P {fmtNum(hit.protein)} · C {fmtNum(hit.carbs)} · F {fmtNum(hit.fat)}</span>
        </span>
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primary/15 text-primary"><Plus className="h-5 w-5" /></span>
      </button>
    </li>
  );
};

const Tile: React.FC<{ icon: React.ElementType; label: string; hint: string; onClick: () => void; disabled?: boolean; badge?: React.ReactNode }> = ({ icon: Icon, label, hint, onClick, disabled, badge }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn('tp-press relative flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-2xl bg-foreground/[.05] px-2 py-3 text-center hover:bg-foreground/[.08]', disabled && 'opacity-45')}
  >
    {badge && <span className="absolute end-2 top-2 text-primary">{badge}</span>}
    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary"><Icon className="h-6 w-6" /></span>
    <span className="text-sm font-bold">{label}</span>
    <span className="line-clamp-2 text-[11px] leading-tight text-muted-foreground">{hint}</span>
  </button>
);

// ------------------------------------------------------------------ barcode

type NativeDetector = new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** Live camera scan: the browser's BarcodeDetector (Chrome / Android), else ZXing (iPhone Safari, Firefox). */
const BarcodeStep: React.FC<{ lang: string; onBack: () => void; onProduct: (p: BarcodeProduct) => void; onManual: () => void }> = ({ lang, onBack, onProduct, onManual }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'looking' | 'notfound' | 'error' | 'unread'>('idle');
  const [camMsg, setCamMsg] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  const lookup = async (raw: string) => {
    const c = raw.replace(/\D/g, '');
    if (c.length < 6 || busy.current) return;
    busy.current = true;
    setCode(c);
    setState('looking');
    try {
      onProduct(await api<BarcodeProduct>(`/v3/meals/barcode/${c}?lang=${lang}`));
    } catch (e) {
      setState(e instanceof ApiError && e.status === 404 ? 'notfound' : 'error');
      busy.current = false;
    }
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopZxing: (() => void) | undefined;
    let dead = false;
    const Detector = (window as unknown as { BarcodeDetector?: NativeDetector }).BarcodeDetector;
    (async () => {
      try {
        const v = videoRef.current!;
        if (Detector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
          if (dead) return stream.getTracks().forEach((tr) => tr.stop());
          v.srcObject = stream;
          await v.play();
          const det = new Detector({ formats: FORMATS });
          timer = window.setInterval(async () => {
            if (busy.current || v.readyState < 2) return;
            try {
              const r = await det.detect(v);
              if (r[0]?.rawValue) { haptic(12); lookup(r[0].rawValue); }
            } catch { /* frame not ready */ }
          }, 300);
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          if (dead) return;
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, v, (result) => {
            if (result && !busy.current) { haptic(12); lookup(result.getText()); }
          });
          if (dead) controls.stop();
          else stopZxing = () => controls.stop();
        }
      } catch {
        if (!dead) setCamMsg(t('trainee.mealTools.cameraDenied'));
      }
    })();
    return () => {
      dead = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      stopZxing?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A still photo of the barcode (works where live camera access is blocked, e.g. some in-app browsers). */
  const fromPhoto = async (file?: File | null) => {
    if (!file) return;
    setState('looking');
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const r = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      busy.current = false;
      await lookup(r.getText());
    } catch {
      setState('unread');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-4 pb-2">
      {!camMsg ? (
        <div className="relative overflow-hidden rounded-3xl bg-black">
          <video ref={videoRef} playsInline muted autoPlay className="aspect-[4/3] w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-10 inset-y-[28%] rounded-2xl border-2 border-white/70" />
          <div className="pointer-events-none absolute inset-x-12 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-primary shadow-[0_0_14px_hsl(var(--primary))]" />
          <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white/85"><ScanLine className="me-1 inline h-3.5 w-3.5" />{t('trainee.mealTools.scanning')}</p>
        </div>
      ) : (
        <p className="rounded-2xl bg-foreground/[.05] px-3 py-3 text-sm text-muted-foreground">{camMsg}</p>
      )}
      <input ref={shotRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => { fromPhoto(e.target.files?.[0]); e.target.value = ''; }} data-testid="barcode-photo" />
      <button type="button" onClick={() => shotRef.current?.click()} className="tp-btn tp-btn--ghost tp-btn--sm tp-press w-full"><Camera className="h-4 w-4" />{t('trainee.mealTools.photoBarcode')}</button>
      <form onSubmit={(e) => { e.preventDefault(); busy.current = false; lookup(code); }} className="flex items-end gap-2">
        <label className="block min-w-0 flex-1">
          <span className="mb-1 block text-xs text-muted-foreground">{t('trainee.mealTools.enterCode')}</span>
          <input className="tp-input text-center tracking-widest" inputMode="numeric" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 14))} placeholder="7290000000000" />
        </label>
        <button type="submit" disabled={code.length < 6 || state === 'looking'} className="tp-btn tp-btn--primary tp-press">
          {state === 'looking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Barcode className="h-4 w-4" />}
          {state === 'looking' ? t('trainee.mealTools.looking') : t('trainee.mealTools.lookUp')}
        </button>
      </form>
      {(state === 'notfound' || state === 'error' || state === 'unread') && (
        <div role="alert" className="space-y-2 rounded-2xl bg-[hsl(var(--gold)/.12)] px-3 py-3 text-sm">
          <p>{state === 'notfound' ? t('trainee.mealTools.notFound') : state === 'unread' ? t('trainee.mealTools.barcodeUnread') : t('trainee.mealTools.lookupFail')}</p>
          {state !== 'unread' && <button type="button" onClick={onManual} className="tp-btn tp-btn--ghost tp-btn--sm tp-press"><PencilLine className="h-4 w-4" />{t('trainee.mealTools.addManually')}</button>}
        </div>
      )}
      <button type="button" onClick={onBack} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">{t('trainee.mealTools.back')}</button>
    </div>
  );
};

// ------------------------------------------------------------------ review

const NumField: React.FC<{ label: string; value: number; onChange: (n: number) => void; digits?: number }> = ({ label, value, onChange, digits = 0 }) => {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block truncate text-[11px] text-muted-foreground">{label}</span>
      <input
        className="tp-input px-2 text-center"
        inputMode="decimal"
        dir="ltr"
        value={txt ?? String(+value.toFixed(digits))}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const s = e.target.value.replace(/[^\d.,]/g, '');
          setTxt(s);
          onChange(parseFloat(s.replace(',', '.')) || 0);
        }}
        onBlur={() => setTxt(null)}
      />
    </label>
  );
};

const ReviewList: React.FC<{
  items: DraftItem[]; setItems: React.Dispatch<React.SetStateAction<DraftItem[]>>; source: Source;
  saveLater: boolean; setSaveLater: (b: boolean) => void; favName: string; setFavName: (s: string) => void; onAddAnother: () => void;
}> = ({ items, setItems, source, saveLater, setSaveLater, favName, setFavName, onAddAnother }) => {
  const { t } = useTranslation();
  const patch = (key: string, fn: (d: DraftItem) => DraftItem) => setItems((l) => l.map((d) => (d.key === key ? fn(d) : d)));
  /** Typing a total keeps the amount and re-bases the per-gram values. */
  const setTotal = (key: string, f: 'calories' | 'protein' | 'carbs' | 'fat', v: number) =>
    patch(key, (d) => {
      const k = d.baseGrams > 0 && d.grams > 0 ? d.grams / d.baseGrams : 1;
      return { ...d, base: { ...d.base, [f]: v / k } };
    });

  return (
    <div className="space-y-3 pb-2">
      {source === 'ai' && <p className="tp-chip tp-chip--primary w-fit"><Sparkles className="h-3.5 w-3.5" />{t('trainee.mealTools.aiEstimate')}</p>}
      <ul className="space-y-2">
        {items.map((d) => {
          const tot = draftTotals(d);
          return (
            <li key={d.key} className="space-y-2 rounded-2xl bg-foreground/[.04] p-3">
              <div className="flex items-end gap-2">
                {(d.image || d.needsImage) && <FoodThumb name={d.name} src={d.image} needsImage={d.needsImage} hint={d.hint} className="h-11 w-11" />}
                <label className="block min-w-0 flex-1">
                  <span className="mb-0.5 block text-[11px] text-muted-foreground">{t('trainee.mealTools.itemName')}</span>
                  <input className="tp-input" dir="auto" value={d.name} onChange={(e) => patch(d.key, (x) => ({ ...x, name: e.target.value }))} />
                </label>
                <button type="button" onClick={() => setItems((l) => l.filter((x) => x.key !== d.key))} className="tp-icon-btn tp-press bg-transparent text-muted-foreground" aria-label={t('trainee.mealTools.delete')}><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                <NumField label={d.unit === 'portion' ? t('trainee.mealTools.portions') : t('trainee.mealTools.grams')} value={d.grams} digits={d.unit === 'portion' ? 2 : 0} onChange={(n) => patch(d.key, (x) => ({ ...x, grams: n }))} />
                <NumField label={t('trainee.mealTools.kcal')} value={tot.calories} onChange={(n) => setTotal(d.key, 'calories', n)} />
                <NumField label="P" value={tot.protein} digits={1} onChange={(n) => setTotal(d.key, 'protein', n)} />
                <NumField label="C" value={tot.carbs} digits={1} onChange={(n) => setTotal(d.key, 'carbs', n)} />
                <NumField label="F" value={tot.fat} digits={1} onChange={(n) => setTotal(d.key, 'fat', n)} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onAddAnother} className="tp-btn tp-btn--ghost tp-btn--sm tp-press"><Search className="h-4 w-4" />{t('trainee.mealTools.addAnother')}</button>
        <button type="button" onClick={() => setItems((l) => [...l, newDraft('', 100, undefined, { unit: 'g' })])} className="tp-btn tp-btn--ghost tp-btn--sm tp-press"><PencilLine className="h-4 w-4" />{t('trainee.mealTools.addItem')}</button>
      </div>

      <div className="space-y-2 rounded-2xl bg-foreground/[.04] p-3">
        {source !== 'create' && (
          <label className="flex min-h-[2.75rem] cursor-pointer items-center gap-3">
            <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={saveLater} onChange={(e) => setSaveLater(e.target.checked)} />
            <span className="text-sm font-semibold"><Heart className="me-1.5 inline h-4 w-4 text-primary" />{t('trainee.mealTools.saveAsFav')}</span>
          </label>
        )}
        {saveLater && (
          <input className="tp-input" dir="auto" value={favName} onChange={(e) => setFavName(e.target.value)} placeholder={t('trainee.mealTools.favName')} aria-label={t('trainee.mealTools.favName')} />
        )}
      </div>
    </div>
  );
};

export default AddMealSheet;
