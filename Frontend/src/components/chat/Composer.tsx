import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, Camera, Paperclip, TrendingUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LinkedEntry } from './api';
import { formatEntryDate, formatWeight } from './format';
import { IconButton } from './parts';

export const MAX_LENGTH = 4000;

export interface ComposerHandle { focus: () => void }

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  attachment: LinkedEntry | null;
  onRemoveAttachment: () => void;
  onAttachClick?: () => void;
  disabled?: boolean;
  enterToSend: boolean;
}

const Composer = forwardRef<ComposerHandle, Props>(({ value, onChange, onSend, attachment, onRemoveAttachment, onAttachClick, disabled, enterToSend }, ref) => {
  const { t } = useTranslation();
  const area = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = area.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      const end = el.value.length;
      el.setSelectionRange(end, end);
    },
  }));

  // Auto-grow up to ~6 lines
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const tooLong = value.length > MAX_LENGTH;
  const canSend = !disabled && !tooLong && (value.trim().length > 0 || !!attachment);

  const submit = () => {
    if (!canSend) return;
    onSend();
    // keep the keyboard open on phones
    requestAnimationFrame(() => area.current?.focus({ preventScroll: true }));
  };

  return (
    <div className="shrink-0 border-t border-border/50 bg-background/80 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl sm:px-4">
      <div className="mx-auto w-full max-w-3xl">
        {attachment && (
          <div className="ec-chat-fade mb-2 flex items-center gap-3 rounded-2xl bg-primary/10 p-2 pe-1 ring-1 ring-primary/20">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <TrendingUp className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-[.08em] text-primary">{t('chat.ui.progressEntry')}</span>
              <span className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                {formatEntryDate(attachment.date)}
                {attachment.weight != null && <> · {t('chat.ui.weightValue', { value: formatWeight(attachment.weight) })}</>}
                {attachment.photos.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-muted-foreground" aria-label={t('chat.ui.photoCount', { count: attachment.photos.length })}>
                    · <Camera className="h-3.5 w-3.5" aria-hidden />{attachment.photos.length}
                  </span>
                )}
              </span>
            </span>
            <IconButton label={t('chat.ui.removeAttachment')} onClick={onRemoveAttachment}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          {onAttachClick && (
            <IconButton label={t('chat.ui.attach')} onClick={onAttachClick} disabled={disabled}>
              <Paperclip className="h-5 w-5" />
            </IconButton>
          )}
          <div className={cn(
            'flex min-h-[44px] flex-1 items-center rounded-[22px] border bg-muted/40 transition-[border-color,box-shadow,background-color] duration-300 focus-within:bg-background focus-within:ring-4',
            tooLong ? 'border-destructive/70 focus-within:ring-destructive/15' : 'border-border/70 focus-within:border-primary/60 focus-within:ring-primary/15',
          )}>
            <textarea
              ref={area}
              rows={1}
              dir={value ? 'auto' : undefined}
              value={value}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && enterToSend) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={t('chat.ui.composerPlaceholder')}
              aria-label={t('chat.ui.composerPlaceholder')}
              enterKeyHint={enterToSend ? 'send' : 'enter'}
              className="ec-chat-scroll block max-h-40 w-full resize-none bg-transparent px-4 py-[11px] text-base leading-[22px] text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50 sm:text-[15px]"
            />
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label={t('chat.ui.send')}
            title={t('chat.ui.send')}
            className={cn(
              'grid h-11 w-11 shrink-0 place-items-center rounded-full transition-[transform,background-color,box-shadow,opacity] duration-300 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              canSend ? 'bg-primary text-primary-foreground shadow-[0_8px_18px_-8px_hsl(var(--primary)/.9)] hover:scale-105' : 'bg-muted text-muted-foreground',
            )}
          >
            <ArrowUp className="h-5 w-5" strokeWidth={2.4} aria-hidden />
          </button>
        </div>
        {value.length > MAX_LENGTH - 400 && (
          <p className={cn('mt-1 pe-14 text-end text-[11px] tabular-nums', tooLong ? 'text-destructive' : 'text-muted-foreground')} aria-live="polite">
            {value.length} / {MAX_LENGTH}
          </p>
        )}
      </div>
    </div>
  );
});
Composer.displayName = 'Composer';

export default Composer;
