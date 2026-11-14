import React from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Check, ExternalLink, Paperclip, TrendingUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProgressEntry } from './api';
import { toLinkedEntry } from './api';
import AuthImage from './AuthImage';
import { formatEntryDate, formatWeight } from './format';
import { ChatAvatar, EmptyState, IconButton } from './parts';

export const EntryList: React.FC<{
  entries: ProgressEntry[] | null;
  attachedId: number | null;
  onAttach: (e: ProgressEntry) => void;
}> = ({ entries, attachedId, onAttach }) => {
  const { t } = useTranslation();
  if (entries === null) {
    return (
      <div className="space-y-2" aria-busy aria-label={t('chat.ui.loading')}>
        {[0, 1, 2].map((i) => <div key={i} className="ec-chat-shimmer h-[72px] rounded-2xl bg-muted" />)}
      </div>
    );
  }
  if (entries.length === 0) return <EmptyState icon={TrendingUp} title={t('chat.ui.noEntries')} className="py-8" />;
  return (
    <ul className="ec-chat-list space-y-2">
      {entries.map((e) => {
        const linked = toLinkedEntry(e);
        const attached = attachedId === e.id;
        return (
          <li key={e.id}>
            <div className={cn('flex items-center gap-3 rounded-2xl border p-2 transition-colors', attached ? 'border-primary/40 bg-primary/8' : 'border-border/60 bg-background/40')}>
              {linked.photos[0] ? (
                <AuthImage filename={linked.photos[0].filename} alt={t('chat.ui.photoAlt')} className="h-14 w-12 shrink-0 rounded-xl" />
              ) : (
                <span className="grid h-14 w-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><TrendingUp className="h-4 w-4" aria-hidden /></span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{formatEntryDate(e.date)}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-num text-[13px] tracking-wide text-foreground/90">{t('chat.ui.weightValue', { value: formatWeight(e.weight) })}</span>
                  {linked.photos.length > 0 && (
                    <span className="inline-flex items-center gap-0.5" aria-label={t('chat.ui.photoCount', { count: linked.photos.length })}>
                      <Camera className="h-3 w-3" aria-hidden />{linked.photos.length}
                    </span>
                  )}
                </p>
                {e.notes && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground" dir="auto">{e.notes}</p>}
              </div>
              <button
                type="button"
                onClick={() => onAttach(e)}
                aria-pressed={attached}
                className={cn(
                  'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-[background-color,transform] active:scale-95',
                  attached ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-primary/15 hover:text-primary',
                )}
              >
                {attached ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Paperclip className="h-3.5 w-3.5" aria-hidden />}
                {attached ? t('chat.ui.attached') : t('chat.ui.attachThis')}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/** Trainer side panel: who you are talking to, latest numbers and their progress entries. */
export const ClientPanel: React.FC<{
  name: string;
  avatar?: string | null;
  entries: ProgressEntry[] | null;
  attachedId: number | null;
  onAttach: (e: ProgressEntry) => void;
  onOpenProfile: () => void;
  onClose?: () => void;
  className?: string;
}> = ({ name, avatar, entries, attachedId, onAttach, onOpenProfile, onClose, className }) => {
  const { t } = useTranslation();
  const latest = entries?.[0];
  const oldest = entries && entries.length > 1 ? entries[entries.length - 1] : undefined;
  const delta = latest && oldest ? latest.weight - oldest.weight : null;

  return (
    <aside className={cn('flex min-h-0 flex-col', className)} aria-label={t('chat.ui.profile')}>
      <div className="relative shrink-0 px-5 pb-4 pt-5 text-center">
        {onClose && (
          <IconButton label={t('chat.ui.hideProfile')} onClick={onClose} className="absolute end-2 top-2">
            <X className="h-5 w-5" />
          </IconButton>
        )}
        <ChatAvatar name={name} src={avatar} size="xl" className="mx-auto" />
        <p className="mt-3 truncate text-lg font-semibold text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">{t('chat.ui.roleClient')}</p>
        <button
          type="button"
          onClick={onOpenProfile}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-background/50 px-4 text-sm font-semibold text-foreground transition-[background-color,transform] hover:bg-muted active:scale-[.98]"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          {t('chat.ui.openFullProfile')}
        </button>
        {latest && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-start">
            <div className="rounded-2xl bg-muted/50 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{t('chat.ui.latestWeight')}</p>
              <p className="font-num text-2xl leading-tight text-foreground">{formatWeight(latest.weight)}</p>
            </div>
            <div className="rounded-2xl bg-muted/50 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{t('chat.ui.change')}</p>
              <p className={cn('font-num text-2xl leading-tight', delta == null ? 'text-muted-foreground' : delta <= 0 ? 'text-primary' : 'text-foreground')} dir="ltr">
                {delta == null ? '–' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${formatWeight(Math.abs(delta))}`}
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-border/50 px-5 pb-2 pt-4">
        <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{t('chat.ui.entries')}</h2>
      </div>
      <div className="ec-chat-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <EntryList entries={entries} attachedId={attachedId} onAttach={onAttach} />
      </div>
    </aside>
  );
};
