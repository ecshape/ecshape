/**
 * Chat attachments (QA #111): photos, voice messages, and platform objects (an exercise, a food) sent by the coach
 * or the trainee. Photos and voice notes are uploaded to /v2/chat/media and served only to the two people of the
 * conversation; exercises and foods travel as small cards in the message.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Camera, Dumbbell, Image as ImageIcon, Loader2, Mic, Pause, Play, Plus, Search, Send, Trash2, TrendingUp, UtensilsCrossed, X } from 'lucide-react';
import i18n from '@/i18n/config';
import { cn } from '@/lib/utils';
import { mediaUrl } from '@/lib/mediaUrl';
import { libraryFrames, type LibraryExercise } from '@/lib/exerciseLibrary';
import { Sheet } from '@/features/trainee/ui';
import { LibText } from '@/features/trainee/libText';
import { LibraryDetail } from '@/features/trainee/training/ExploreScreen';
import { useLibraryBrowse } from '@/features/trainee/training/shared';
import { FoodThumb } from '@/features/trainee/AddMealSheet';
import type { V3FoodOption } from '@/types/meals-v3';
import { API_BASE, type ChatMessage } from './api';

/* ------------------------------------------------------------------ texts */
const T = {
  he: { add: 'צירוף', photo: 'תמונה', camera: 'מצלמה', voice: 'הודעה קולית', exercise: 'תרגיל', food: 'מזון', progress: 'רישום התקדמות', record: 'הקלטה', recording: 'מקליט…', stop: 'עצירה', cancel: 'ביטול', sendVoice: 'שליחת ההקלטה', micDenied: 'אין גישה למיקרופון. אפשרו אותה בהגדרות הדפדפן.', noMic: 'הדפדפן הזה לא מאפשר הקלטה.', uploadFailed: 'השליחה נכשלה. נסו שוב.', pickExercise: 'שליחת תרגיל', pickFood: 'שליחת מזון', search: 'חיפוש…', none: 'לא נמצא', voiceMsg: 'הודעה קולית', photoMsg: 'תמונה', exerciseMsg: 'תרגיל', foodMsg: 'מזון', per100: 'ל-100 ג׳', perPortion: 'למנה', details: 'פרטים', tooBig: 'הקובץ גדול מדי (עד 15MB).' },
  en: { add: 'Attach', photo: 'Photo', camera: 'Camera', voice: 'Voice message', exercise: 'Exercise', food: 'Food', progress: 'Progress entry', record: 'Record', recording: 'Recording…', stop: 'Stop', cancel: 'Cancel', sendVoice: 'Send recording', micDenied: 'Microphone access is blocked. Allow it in your browser settings.', noMic: 'This browser cannot record audio.', uploadFailed: 'Sending failed. Try again.', pickExercise: 'Send an exercise', pickFood: 'Send a food', search: 'Search…', none: 'Nothing found', voiceMsg: 'Voice message', photoMsg: 'Photo', exerciseMsg: 'Exercise', foodMsg: 'Food', per100: 'per 100 g', perPortion: 'per portion', details: 'Details', tooBig: 'The file is too large (15 MB max).' },
  fr: { add: 'Joindre', photo: 'Photo', camera: 'Appareil photo', voice: 'Message vocal', exercise: 'Exercice', food: 'Aliment', progress: 'Suivi de progrès', record: 'Enregistrer', recording: 'Enregistrement…', stop: 'Arrêter', cancel: 'Annuler', sendVoice: "Envoyer l'enregistrement", micDenied: "L'accès au micro est bloqué. Autorise-le dans les réglages du navigateur.", noMic: "Ce navigateur ne peut pas enregistrer l'audio.", uploadFailed: "L'envoi a échoué. Réessaie.", pickExercise: 'Envoyer un exercice', pickFood: 'Envoyer un aliment', search: 'Rechercher…', none: 'Aucun résultat', voiceMsg: 'Message vocal', photoMsg: 'Photo', exerciseMsg: 'Exercice', foodMsg: 'Aliment', per100: 'pour 100 g', perPortion: 'par portion', details: 'Détails', tooBig: 'Le fichier est trop lourd (15 Mo max).' },
};
for (const [lng, v] of Object.entries(T)) i18n.addResourceBundle(lng, 'translation', { chatAtt: v }, true, false);

/* ------------------------------------------------------------------ data */
export type ShareExercise = { library_id?: string | null; name: string; image?: string | null; muscles?: string[]; level?: string | null };
export type ShareFood = Pick<V3FoodOption, 'name' | 'name_hebrew' | 'image_url' | 'calories' | 'protein' | 'carbs' | 'fat' | 'measurement_type' | 'serving_size'>;
export type AttachmentCard =
  | { kind: 'photo'; file: string; localUrl?: string }
  | { kind: 'voice'; file: string; seconds: number; localUrl?: string }
  | { kind: 'exercise_share'; exercise: ShareExercise }
  | { kind: 'food_share'; food: ShareFood };

export const ATTACHMENT_KINDS = new Set(['photo', 'voice', 'exercise_share', 'food_share']);
export const isAttachmentCard = (c: unknown): c is AttachmentCard => !!c && typeof c === 'object' && ATTACHMENT_KINDS.has(String((c as { kind?: string }).kind));

/** One-line preview for the conversation list. */
export const attachmentPreview = (c: unknown, t: (k: string) => string) => {
  if (!isAttachmentCard(c)) return null;
  if (c.kind === 'photo') return `${t('chatAtt.photoMsg')}`;
  if (c.kind === 'voice') return `${t('chatAtt.voiceMsg')}`;
  if (c.kind === 'exercise_share') return `${c.exercise.name}`;
  return `${c.food.name_hebrew || c.food.name}`;
};

const token = () => localStorage.getItem('access_token');

export async function uploadChatMedia(file: Blob, clientId: number | null, name = 'file'): Promise<{ file: string; kind: 'photo' | 'voice' }> {
  const fd = new FormData();
  fd.append('file', file, name);
  if (clientId) fd.append('client_id', String(clientId));
  const r = await fetch(`${API_BASE}/v2/chat/media`, { method: 'POST', body: fd, headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

const blobCache = new Map<string, Promise<string | null>>();
/** Object URL of a protected chat media file (fetched with the bearer token, kept for the session). */
function useChatMedia(file: string | undefined, localUrl?: string) {
  const [url, setUrl] = useState<string | null | undefined>(localUrl);
  useEffect(() => {
    if (localUrl || !file) return;
    let alive = true;
    let p = blobCache.get(file);
    if (!p) {
      p = fetch(`${API_BASE}/v2/chat/media/${encodeURIComponent(file)}`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} })
        .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
        .catch(() => null);
      blobCache.set(file, p);
      p.then((u) => { if (!u) blobCache.delete(file); });
    }
    p.then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [file, localUrl]);
  return url;
}

/* ------------------------------------------------------------------ message cards */
const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const PhotoCard: React.FC<{ card: Extract<AttachmentCard, { kind: 'photo' }> }> = ({ card }) => {
  const { t } = useTranslation();
  const url = useChatMedia(card.file, card.localUrl);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => url && setOpen(true)} className="block w-[min(16rem,62vw)] overflow-hidden rounded-[14px] bg-muted" aria-label={t('chatAtt.photoMsg')}>
        {url ? <img src={url} alt="" className="block max-h-80 w-full object-cover" /> : <span className="ec-chat-shimmer block aspect-[4/3] w-full" aria-hidden />}
      </button>
      {open && url && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/90 p-4" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <img src={url} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
          <button type="button" className="absolute end-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white" aria-label="close" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
        </div>
      )}
    </>
  );
};

const VoiceCard: React.FC<{ card: Extract<AttachmentCard, { kind: 'voice' }>; own: boolean }> = ({ card, own }) => {
  const { t } = useTranslation();
  const url = useChatMedia(card.file, card.localUrl);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const total = card.seconds || 0;
  return (
    <div className="flex w-[min(15rem,60vw)] items-center gap-2.5 px-1.5 py-1">
      <button
        type="button" disabled={!url}
        onClick={() => { const a = audio.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); }}
        className={cn('grid h-10 w-10 flex-none place-items-center rounded-full', own ? 'bg-white/20 text-white' : 'bg-primary text-primary-foreground')}
        aria-label={t('chatAtt.voiceMsg')}
      >
        {!url ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn('h-1.5 overflow-hidden rounded-full', own ? 'bg-white/25' : 'bg-foreground/10')}>
          <div className={cn('h-full rounded-full', own ? 'bg-white' : 'bg-primary')} style={{ width: `${total ? Math.min(100, (pos / total) * 100) : 0}%` }} />
        </div>
        <span className={cn('mt-1 block text-[11px] tabular-nums', own ? 'text-white/80' : 'text-muted-foreground')} dir="ltr">{fmtSec(playing || pos ? pos : total)}</span>
      </div>
      {url && (
        <audio
          ref={audio} src={url} preload="metadata"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setPos(0); }}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        />
      )}
    </div>
  );
};

const exThumb = (ex: ShareExercise) => ex.image || (ex.library_id && !ex.library_id.startsWith('wger:') ? libraryFrames(ex.library_id)[0] : null);

const ExerciseShareCard: React.FC<{ ex: ShareExercise; own: boolean }> = ({ ex, own }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: ['chat', 'exercise-item', ex.library_id, ex.name],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (ex.library_id) qs.set('library_id', ex.library_id);
      qs.set('name', ex.name);
      const r = await fetch(`${API_BASE}/exercise-library/item?${qs}`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as LibraryExercise;
    },
    enabled: open, staleTime: 10 * 60_000, retry: false,
  });
  const src = exThumb(ex);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('flex w-[min(17rem,64vw)] items-center gap-3 rounded-[14px] p-1.5 text-start', own ? 'bg-white/12' : 'bg-foreground/[.04]')} aria-label={t('chatAtt.details')}>
        <span className="grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-xl bg-white text-muted-foreground">
          {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Dumbbell className="h-6 w-6" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[11px] font-bold uppercase tracking-[.08em]', own ? 'text-white/80' : 'text-primary')}>{t('chatAtt.exerciseMsg')}</span>
          <span className="line-clamp-2 block font-semibold leading-snug"><LibText text={ex.name} src="en" /></span>
        </span>
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={<LibText text={ex.name} src="en" lazy={false} />}>
        {detail.isLoading ? <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-muted-foreground" />
          : detail.data ? <LibraryDetail e={detail.data} askCoach={false} />
            : <div className="grid place-items-center py-8">{src ? <img src={src} alt="" className="h-40 w-40 rounded-2xl object-cover" /> : <Dumbbell className="h-10 w-10 text-muted-foreground" />}</div>}
      </Sheet>
    </>
  );
};

const FoodShareCard: React.FC<{ food: ShareFood; own: boolean }> = ({ food, own }) => {
  const { t, i18n: i } = useTranslation();
  const he = i.language?.startsWith('he');
  const name = he && food.name_hebrew ? food.name_hebrew : food.name;
  const fmt = (n?: number | null) => (n == null ? '—' : Math.round(n * 10) / 10);
  return (
    <div className={cn('w-[min(17rem,64vw)] overflow-hidden rounded-[14px]', own ? 'bg-white/12' : 'bg-foreground/[.04]')}>
      <div className="flex items-center gap-3 p-1.5">
        <FoodThumb name={food.name} label={name} src={food.image_url} needsImage={!food.image_url} className="h-16 w-16 rounded-xl" />
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[11px] font-bold uppercase tracking-[.08em]', own ? 'text-white/80' : 'text-primary')}>{t('chatAtt.foodMsg')}</span>
          <span className="line-clamp-2 block font-semibold leading-snug" dir="auto"><LibText text={name} /></span>
          <span className={cn('block text-[11px]', own ? 'text-white/75' : 'text-muted-foreground')}>{food.measurement_type === 'per_portion' ? food.serving_size || t('chatAtt.perPortion') : t('chatAtt.per100')}</span>
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1 px-1.5 pb-1.5 text-center" dir="ltr">
        {([['kcal', food.calories], ['P', food.protein], ['C', food.carbs], ['F', food.fat]] as const).map(([k, v]) => (
          <span key={k} className={cn('rounded-lg py-1', own ? 'bg-white/12' : 'bg-foreground/[.05]')}><b className="block text-sm tabular-nums">{fmt(v)}</b><small className="text-[10px] opacity-75">{k}</small></span>
        ))}
      </div>
    </div>
  );
};

export const AttachmentCardView: React.FC<{ m: ChatMessage; own: boolean }> = ({ m, own }) => {
  const c = m.card as AttachmentCard;
  if (c.kind === 'photo') return <PhotoCard card={c} />;
  if (c.kind === 'voice') return <VoiceCard card={c} own={own} />;
  if (c.kind === 'exercise_share') return <ExerciseShareCard ex={c.exercise} own={own} />;
  return <FoodShareCard food={c.food} own={own} />;
};

/* ------------------------------------------------------------------ composer pieces */
/** The "+" button of the composer: photo, camera, voice, exercise, food, progress entry. */
export const AttachMenu: React.FC<{
  disabled?: boolean;
  onPhoto: (f: File) => void;
  onVoice: () => void;
  onExercise: () => void;
  onFood: () => void;
  onProgress?: () => void;
}> = ({ disabled, onPhoto, onVoice, onExercise, onFood, onProgress }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const items: [string, React.ElementType, () => void][] = [
    ['photo', ImageIcon, () => gallery.current?.click()],
    ['camera', Camera, () => camera.current?.click()],
    ['voice', Mic, onVoice],
    ['exercise', Dumbbell, onExercise],
    ['food', UtensilsCrossed, onFood],
    ...(onProgress ? [['progress', TrendingUp, onProgress] as [string, React.ElementType, () => void]] : []),
  ];
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onPhoto(f);
  };
  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        aria-label={t('chatAtt.add')} title={t('chatAtt.add')}
        className={cn('grid h-11 w-11 place-items-center rounded-full text-muted-foreground transition-[transform,background-color,color] duration-200 hover:bg-muted hover:text-foreground disabled:opacity-40', open && 'rotate-45 bg-muted text-foreground')}
      >
        <Plus className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="ec-chat-fade absolute bottom-[calc(100%+8px)] start-0 z-30 grid w-56 gap-0.5 rounded-2xl border border-border/60 bg-card p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,.6)]">
          {items.map(([k, Icon, fn]) => (
            <button key={k} type="button" role="menuitem" onClick={() => { setOpen(false); fn(); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-medium hover:bg-muted">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/12 text-primary"><Icon className="h-4 w-4" /></span>
              {t(`chatAtt.${k}`)}
            </button>
          ))}
        </div>
      )}
      <input ref={gallery} type="file" accept="image/*" hidden onChange={pick} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
    </div>
  );
};

/** Inline recorder that replaces the text box while recording (QA #111). */
export const VoiceRecorder: React.FC<{ onCancel: () => void; onDone: (blob: Blob, seconds: number) => void }> = ({ onCancel, onDone }) => {
  const { t } = useTranslation();
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState('');
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const send = useRef(false);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError(t('chatAtt.noMic')); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
      stream = s;
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((x) => MediaRecorder.isTypeSupported?.(x));
      const r = new MediaRecorder(s, type ? { mimeType: type } : undefined);
      rec.current = r;
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream?.getTracks().forEach((tr) => tr.stop());
        if (send.current && chunks.current.length) onDone(new Blob(chunks.current, { type: r.mimeType || 'audio/webm' }), Math.max(1, Math.round((Date.now() - started.current) / 1000)));
      };
      started.current = Date.now();
      r.start(250);
      timer = window.setInterval(() => setSecs(Math.floor((Date.now() - started.current) / 1000)), 250);
    }).catch(() => setError(t('chatAtt.micDenied')));
    return () => {
      window.clearInterval(timer);
      if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (secs >= 300) { send.current = true; rec.current?.stop(); } }, [secs]); // 5 min max
  return (
    <div className="flex min-h-[44px] flex-1 items-center gap-2 rounded-[22px] border border-primary/40 bg-primary/[.06] px-2">
      <button type="button" onClick={() => { send.current = false; rec.current?.stop(); onCancel(); }} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label={t('chatAtt.cancel')} title={t('chatAtt.cancel')}>
        <Trash2 className="h-4 w-4" />
      </button>
      {error ? <span className="flex-1 text-xs text-destructive">{error}</span> : (
        <span className="flex flex-1 items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
          <span className="text-muted-foreground">{t('chatAtt.recording')}</span>
          <b className="tabular-nums" dir="ltr">{fmtSec(secs)}</b>
        </span>
      )}
      <button
        type="button" disabled={!!error}
        onClick={() => { send.current = true; rec.current?.stop(); }}
        className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" aria-label={t('chatAtt.sendVoice')} title={t('chatAtt.sendVoice')}
      >
        <Send className="h-4 w-4 rtl:-scale-x-100" />
      </button>
    </div>
  );
};

/* ------------------------------------------------------------------ pickers */
export const ExerciseSharePicker: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; onPick: (ex: ShareExercise) => void }> = ({ open, onOpenChange, onPick }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const browse = useLibraryBrowse(open ? q : '', '');
  const items = browse.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('chatAtt.pickExercise')} tall>
      <label className="relative mb-3 block">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input className="tp-input ps-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('chatAtt.search')} dir="auto" />
      </label>
      {browse.isLoading ? <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-muted-foreground" /> : !items.length ? <p className="py-6 text-center text-sm text-muted-foreground">{t('chatAtt.none')}</p> : (
        <ul className="grid grid-cols-2 gap-2.5 pb-2 sm:grid-cols-3">
          {items.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => { onPick({ library_id: e.id, name: e.name, image: e.frames?.[0] || libraryFrames(e.id)[0], muscles: e.primaryMuscles, level: e.level }); onOpenChange(false); }}
                className="tp-press block w-full overflow-hidden rounded-2xl bg-card text-start ring-1 ring-border/60 hover:ring-2 hover:ring-primary/60"
              >
                <img src={e.frames?.[0] || libraryFrames(e.id)[0]} alt="" loading="lazy" className="aspect-[4/3] w-full bg-white object-cover" />
                <span className="line-clamp-2 block p-2 text-xs font-bold leading-tight"><LibText text={e.name} src="en" /></span>
              </button>
            </li>
          ))}
          {browse.hasNextPage && (
            <li className="col-span-full"><button type="button" onClick={() => void browse.fetchNextPage()} className="tp-btn tp-btn--ghost tp-btn--sm tp-press w-full">{browse.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : '…'}</button></li>
          )}
        </ul>
      )}
    </Sheet>
  );
};

export const FoodSharePicker: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; onPick: (f: ShareFood) => void }> = ({ open, onOpenChange, onPick }) => {
  const { t, i18n: i } = useTranslation();
  const he = i.language?.startsWith('he');
  const [q, setQ] = useState('');
  const bank = useQuery({
    queryKey: ['chat', 'food-bank'],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/v3/meals/catalog?include_public=true`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as V3FoodOption[];
    },
  });
  const needle = q.trim().toLowerCase();
  const list = (bank.data ?? []).filter((f) => !needle || f.name.toLowerCase().includes(needle) || (f.name_hebrew || '').toLowerCase().includes(needle));
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('chatAtt.pickFood')} tall>
      <label className="relative mb-3 block">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input className="tp-input ps-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('chatAtt.search')} dir="auto" />
      </label>
      {bank.isLoading ? <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-muted-foreground" /> : !list.length ? <p className="py-6 text-center text-sm text-muted-foreground">{t('chatAtt.none')}</p> : (
        <ul className="grid grid-cols-2 gap-2.5 pb-2 sm:grid-cols-3">
          {list.slice(0, 90).map((f) => (
            <li key={`${f.id ?? ''}-${f.name}`}>
              <button
                type="button"
                onClick={() => { onPick({ name: f.name, name_hebrew: f.name_hebrew, image_url: f.image_url ? mediaUrl(f.image_url) : null, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, measurement_type: f.measurement_type, serving_size: f.serving_size }); onOpenChange(false); }}
                className="tp-press block w-full overflow-hidden rounded-2xl bg-card text-start ring-1 ring-border/60 hover:ring-2 hover:ring-primary/60"
              >
                <FoodThumb name={f.name} label={he && f.name_hebrew ? f.name_hebrew : f.name} src={f.image_url} needsImage={!f.image_url} className="aspect-[4/3] w-full rounded-none" />
                <span className="block p-2">
                  <span className="line-clamp-2 block text-xs font-bold leading-tight" dir="auto">{he && f.name_hebrew ? f.name_hebrew : <LibText text={f.name} />}</span>
                  <span className="block text-[10px] text-muted-foreground" dir="ltr">{f.calories ?? '—'} kcal · P{f.protein ?? '—'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
};
