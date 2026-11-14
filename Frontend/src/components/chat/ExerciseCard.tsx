import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, CalendarPlus, Check, Dumbbell, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { libraryFrames, type LibraryExercise } from '@/lib/exerciseLibrary';
import { PortalSelect } from '@/components/ui/portal-select';
import { API_BASE, type ChatMessage } from './api';
import './chatCardsI18n';

/** Card payloads attached to chat messages (QA #42). */
export type ExerciseRef = { library_id?: string | null; exercise_id?: number | null; name: string; image?: string | null; muscles?: string[]; level?: string | null };
export type ChatCard =
  | { kind: 'exercise_request'; status: 'pending' | 'accepted' | 'declined' | 'alternative'; exercise: ExerciseRef; resolution?: { action: string; day_name?: string; exercise?: ExerciseRef } }
  | { kind: 'exercise_reply'; request_id: number; action: 'accept' | 'decline' | 'alternative'; day_name?: string; exercise?: ExerciseRef };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json())?.detail ?? detail; } catch { /* not json */ }
    throw new Error(String(detail));
  }
  return res.json() as Promise<T>;
}

const Thumb: React.FC<{ ex?: ExerciseRef | null; className?: string }> = ({ ex, className }) => {
  const src = ex?.image || (ex?.library_id && !ex.library_id.startsWith('wger:') ? libraryFrames(ex.library_id)[0] : null);
  return (
    <span className={cn('grid flex-none place-items-center overflow-hidden rounded-2xl bg-white text-muted-foreground', className ?? 'h-16 w-16')}>
      {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Dumbbell className="h-6 w-6" />}
    </span>
  );
};

type Mode = null | 'accept' | 'alternative';

export const ExerciseCardView: React.FC<{ m: ChatMessage; own: boolean; onReplied?: (reply: ChatMessage) => void }> = ({ m, own, onReplied }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const card = m.card as ChatCard | undefined;
  const [mode, setMode] = useState<Mode>(null);
  const [dayId, setDayId] = useState('');
  const [alt, setAlt] = useState<ExerciseRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const isCoach = user?.role === 'TRAINER';

  const days = useQuery({
    queryKey: ['chat', 'exercise-request-days', m.id],
    queryFn: () => call<{ days: { id: number; name: string; plan: string; exercises: number }[] }>(`/v2/chat/exercise-request/${m.id}/days`),
    enabled: !!mode && isCoach,
    staleTime: 60_000,
  });
  const ex = card && card.kind === 'exercise_request' ? card.exercise : null;
  const similar = useQuery({
    queryKey: ['chat', 'similar', ex?.library_id, ex?.name],
    queryFn: () => {
      const qs = new URLSearchParams({ limit: '6' });
      if (ex?.library_id) qs.set('library_id', ex.library_id);
      if (ex?.name) qs.set('name', ex.name);
      return call<{ items: LibraryExercise[] }>(`/exercise-library/similar?${qs}`);
    },
    enabled: mode === 'alternative',
    staleTime: 10 * 60_000,
  });

  if (!card) return null;

  if (card.kind === 'exercise_reply') {
    const icon = card.action === 'decline' ? <X className="h-4 w-4" /> : card.action === 'alternative' ? <ArrowLeftRight className="h-4 w-4" /> : <Check className="h-4 w-4" />;
    return (
      <div className={cn('mb-1.5 flex items-center gap-3 rounded-2xl p-2', own ? 'bg-white/15' : 'bg-foreground/[.05]')}>
        {card.exercise ? <Thumb ex={card.exercise} className="h-12 w-12" /> : <span className="grid h-12 w-12 place-items-center rounded-2xl bg-foreground/10">{icon}</span>}
        <span className="min-w-0 flex-1 text-sm">
          <span className="flex items-center gap-1.5 font-semibold">{icon}{t(`chatCards.reply.${card.action}`)}</span>
          {card.exercise && <span className="block truncate" dir="auto">{card.exercise.name}</span>}
          {card.day_name && <span className={cn('block truncate text-xs', own ? 'text-white/75' : 'text-muted-foreground')} dir="auto">{t('chatCards.inDay', { day: card.day_name })}</span>}
        </span>
      </div>
    );
  }

  const status = localStatus ?? card.status;
  const canAnswer = isCoach && !own && status === 'pending';

  const resolve = async (action: 'accept' | 'decline' | 'alternative') => {
    setBusy(true);
    setError(null);
    const day = days.data?.days.find((d) => String(d.id) === dayId);
    const name = action === 'alternative' ? alt?.name : card.exercise.name;
    const message = action === 'decline' ? t('chatCards.msg.decline', { name: card.exercise.name })
      : action === 'accept' ? t('chatCards.msg.accept', { name, day: day?.name })
        : t('chatCards.msg.alternative', { name, day: day?.name });
    try {
      const reply = await call<ChatMessage>(`/v2/chat/exercise-request/${m.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ action, day_id: day?.id ?? null, alternative: action === 'alternative' ? alt : null, message }),
      });
      setLocalStatus(action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'alternative');
      setMode(null);
      onReplied?.(reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const statusChip = status !== 'pending' && (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
      status === 'declined' ? 'bg-foreground/10' : 'bg-[hsl(142_64%_45%/.18)] text-[hsl(142_60%_35%)]', own && 'bg-white/20 text-white')}>
      {status === 'declined' ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}{t(`chatCards.status.${status}`)}
    </span>
  );

  return (
    <div className={cn('mb-1.5 w-[min(19rem,70vw)] rounded-2xl p-2', own ? 'bg-white/15' : 'bg-foreground/[.04]')} data-testid="exercise-card">
      <div className="flex items-center gap-3">
        <Thumb ex={card.exercise} />
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[11px] font-bold uppercase tracking-wider', own ? 'text-white/75' : 'text-primary')}>{t('chatCards.request')}</span>
          <span className="block font-semibold leading-snug" dir="auto">{card.exercise.name}</span>
          {!!card.exercise.muscles?.length && <span className={cn('block truncate text-xs', own ? 'text-white/75' : 'text-muted-foreground')}>{card.exercise.muscles.join(' · ')}</span>}
          {statusChip}
        </span>
      </div>

      {canAnswer && !mode && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <button type="button" onClick={() => setMode('accept')} className="tp-press flex flex-col items-center gap-1 rounded-xl bg-primary px-1 py-2 text-[11px] font-bold text-primary-foreground"><CalendarPlus className="h-4 w-4" />{t('chatCards.accept')}</button>
          <button type="button" onClick={() => setMode('alternative')} className="tp-press flex flex-col items-center gap-1 rounded-xl bg-foreground/[.07] px-1 py-2 text-[11px] font-bold"><ArrowLeftRight className="h-4 w-4" />{t('chatCards.alternative')}</button>
          <button type="button" onClick={() => resolve('decline')} disabled={busy} className="tp-press flex flex-col items-center gap-1 rounded-xl bg-foreground/[.07] px-1 py-2 text-[11px] font-bold"><X className="h-4 w-4" />{t('chatCards.decline')}</button>
        </div>
      )}

      {canAnswer && mode && (
        <div className="mt-2 space-y-2 rounded-xl bg-card p-2 text-foreground ring-1 ring-border/60">
          {mode === 'alternative' && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">{t('chatCards.pickAlternative')}</p>
              {similar.isLoading && <Loader2 className="mx-auto my-2 h-4 w-4 animate-spin" />}
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {(similar.data?.items ?? []).map((s) => {
                  const ref: ExerciseRef = { library_id: s.id, name: s.name, image: (s.frames?.length ? s.frames : libraryFrames(s.id))[0] };
                  const on = alt?.library_id === s.id;
                  return (
                    <button key={s.id} type="button" onClick={() => setAlt(ref)} aria-pressed={on} className={cn('tp-press w-20 flex-none rounded-xl p-1 text-start', on ? 'bg-primary/15 ring-2 ring-primary' : 'bg-foreground/[.04]')}>
                      <Thumb ex={ref} className="h-[4.5rem] w-full" />
                      <span className="mt-1 line-clamp-2 block text-[10px] font-semibold leading-tight" dir="ltr">{s.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{s.level}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {days.isLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : days.data && !days.data.days.length ? (
            <p className="text-xs text-muted-foreground">{t('chatCards.noPlan')}</p>
          ) : (
            <PortalSelect
              className="w-full"
              icon={CalendarPlus}
              label={t('chatCards.day')}
              placeholder={t('chatCards.chooseDay')}
              value={dayId}
              onChange={setDayId}
              options={(days.data?.days ?? []).map((d) => ({ value: String(d.id), label: d.name, hint: d.plan }))}
            />
          )}
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-1.5">
            <button type="button" onClick={() => resolve(mode)} disabled={busy || !dayId || (mode === 'alternative' && !alt)} className="tp-btn tp-btn--primary tp-btn--sm tp-press flex-1 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t('chatCards.addToDay')}
            </button>
            <button type="button" onClick={() => { setMode(null); setError(null); }} className="tp-btn tp-btn--ghost tp-btn--sm tp-press">{t('chatCards.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExerciseCardView;
