import React, { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { TrendingUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LinkedEntry, LinkedPhoto } from './api';
import AuthImage from './AuthImage';
import { formatEntryDate, formatWeight, photoTypeLabel } from './format';
import { IconButton } from './parts';

export const PhotoViewer: React.FC<{ photo: LinkedPhoto | null; onClose: () => void; caption?: string }> = ({ photo, onClose, caption }) => {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Root open={!!photo} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/90 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-0 z-[91] flex flex-col items-center justify-center p-4 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95" onClick={onClose}>
          <DialogPrimitive.Title className="sr-only">{t('chat.ui.photoAlt')}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{caption || t('chat.ui.photoAlt')}</DialogPrimitive.Description>
          <DialogPrimitive.Close asChild>
            <IconButton label={t('chat.ui.close')} className="absolute end-3 top-[max(12px,env(safe-area-inset-top))] bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <X className="h-5 w-5" />
            </IconButton>
          </DialogPrimitive.Close>
          {photo && (
            <div className="flex max-h-full max-w-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <AuthImage filename={photo.filename} alt={t('chat.ui.photoAlt')} className="max-h-[80dvh] w-auto max-w-[min(92vw,720px)] rounded-2xl !object-contain" />
              {caption && <p className="text-sm text-white/80">{caption}</p>}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

/** Card for a progress entry linked to a message (photos, date, weight, notes). */
export const LinkedEntryCard: React.FC<{ entry: LinkedEntry | null | undefined; own: boolean }> = ({ entry, own }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<LinkedPhoto | null>(null);

  if (!entry) {
    return (
      <div className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-xs', own ? 'bg-white/15 text-white/90' : 'bg-background/60 text-muted-foreground')}>
        <TrendingUp className="h-3.5 w-3.5" aria-hidden />
        {t('chat.ui.entryUnavailable')}
      </div>
    );
  }

  const photos = entry.photos || [];
  const caption = `${formatEntryDate(entry.date)}${entry.weight != null ? ` · ${t('chat.ui.weightValue', { value: formatWeight(entry.weight) })}` : ''}`;

  return (
    <div className={cn('w-[min(260px,62vw)] overflow-hidden rounded-[14px]', own ? 'bg-black/15' : 'bg-background/70 ring-1 ring-border/60')}>
      {photos.length > 0 && (
        <div className={cn('grid gap-0.5', photos.length === 1 ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
          {photos.slice(0, 3).map((p, i) => (
            <button
              key={p.filename}
              type="button"
              onClick={() => setOpen(p)}
              aria-label={`${t('chat.ui.openPhoto')}${photoTypeLabel(p.photo_type, t) ? ` · ${photoTypeLabel(p.photo_type, t)}` : ''}`}
              className="relative block overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
            >
              <AuthImage filename={p.filename} alt={t('chat.ui.photoAlt')} className={cn('w-full transition-transform duration-500 hover:scale-[1.04]', photos.length === 1 ? 'aspect-[4/5]' : 'aspect-[3/4]')} />
              {i === 2 && photos.length > 3 && (
                <span className="absolute inset-0 grid place-items-center bg-black/50 text-sm font-bold text-white">+{photos.length - 3}</span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full', own ? 'bg-white/20 text-white' : 'bg-primary/12 text-primary')}>
          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('text-[11px] font-bold uppercase tracking-[.08em]', own ? 'text-white/75' : 'text-primary')}>{t('chat.ui.progressEntry')}</p>
          <p className="truncate text-sm font-semibold">{caption}</p>
          {entry.notes && <p className={cn('mt-0.5 line-clamp-2 text-xs', own ? 'text-white/80' : 'text-muted-foreground')} dir="auto">{entry.notes}</p>}
        </div>
      </div>
      <PhotoViewer photo={open} onClose={() => setOpen(null)} caption={caption} />
    </div>
  );
};
