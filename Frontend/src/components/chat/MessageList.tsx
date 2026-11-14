import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, CheckCheck, ChevronDown, Clock, MessageSquare, RotateCw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from './api';
import { dayKey, formatDayLabel, formatTime } from './format';
import { LinkedEntryCard } from './LinkedEntry';
import { EmptyState } from './parts';

const GROUP_GAP_MS = 5 * 60 * 1000;
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])/g;

const Linkified: React.FC<{ text: string; own: boolean }> = ({ text, own }) => {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className={cn('underline underline-offset-2', own ? 'decoration-white/60' : 'text-primary decoration-primary/50')}>
            {p}
          </a>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
};

interface Props {
  conversationKey: string;
  messages: ChatMessage[];
  currentUserId?: number;
  loading: boolean;
  error: boolean;
  onReload: () => void;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onRetry: (m: ChatMessage) => void;
  onDiscard: (m: ChatMessage) => void;
  emptyTitle: string;
  emptyHint: string;
}

const MessageList: React.FC<Props> = ({
  conversationKey, messages, currentUserId, loading, error, onReload, hasMore, loadingOlder, onLoadOlder,
  onRetry, onDiscard, emptyTitle, emptyHint,
}) => {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prev = useRef<{ key: string; first?: string; last?: string; height: number; count: number }>({ key: '', height: 0, count: 0 });
  const known = useRef<Set<string>>(new Set());
  const fresh = useRef<Set<string>>(new Set());
  const [unseen, setUnseen] = useState(0);
  const [showJump, setShowJump] = useState(false);

  const idOf = (m: ChatMessage) => m.localId || String(m.id);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }, []);

  // Keep position coherent when messages change: stick to bottom, preserve offset on history load
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const first = messages[0] ? idOf(messages[0]) : undefined;
    const last = messages[messages.length - 1] ? idOf(messages[messages.length - 1]) : undefined;
    const p = prev.current;
    if (p.key !== conversationKey || p.count === 0) {
      // new conversation or first load
      known.current = new Set(messages.map(idOf));
      scrollToBottom(false);
      atBottom.current = true;
      setUnseen(0);
    } else if (first !== p.first && last === p.last) {
      // older history prepended: keep the reader where they were
      el.scrollTop += el.scrollHeight - p.height;
      messages.forEach((m) => known.current.add(idOf(m)));
    } else if (last !== p.last) {
      const lastMsg = messages[messages.length - 1];
      const own = lastMsg && lastMsg.sender_id === currentUserId;
      if (atBottom.current || own) {
        scrollToBottom(true);
      } else {
        const fresh = messages.filter((m) => !known.current.has(idOf(m)) && m.sender_id !== currentUserId).length;
        if (fresh) setUnseen((n) => n + fresh);
      }
    }
    prev.current = { key: conversationKey, first, last, height: el.scrollHeight, count: messages.length };
  });

  useEffect(() => {
    // after paint, everything rendered is "known" (only genuinely new messages animate)
    messages.forEach((m) => known.current.add(idOf(m)));
  });

  // Images and cards grow after load: stay pinned to the bottom if the reader was there
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) scrollToBottom(false);
      if (scrollRef.current) prev.current.height = scrollRef.current.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [scrollToBottom, conversationKey]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = distance < 80;
    setShowJump(distance > 320);
    if (atBottom.current && unseen) setUnseen(0);
    if (el.scrollTop < 160 && hasMore && !loadingOlder) {
      prev.current.height = el.scrollHeight;
      onLoadOlder();
    }
  };

  if (loading && messages.length === 0) {
    return (
      <div className="ec-chat-thread flex min-h-0 flex-1 flex-col justify-end gap-3 px-4 pb-6" aria-busy aria-label={t('chat.ui.loading')}>
        {[56, 72, 40, 64].map((w, i) => (
          <div key={i} className={cn('flex', i % 2 ? 'justify-end' : 'justify-start')}>
            <span className="ec-chat-shimmer block h-10 rounded-[20px] bg-muted" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className="ec-chat-thread flex min-h-0 flex-1 items-center justify-center">
        <EmptyState
          icon={MessageSquare}
          title={t('chat.ui.loadError')}
          action={<button type="button" onClick={onReload} className="h-11 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-transform active:scale-95">{t('chat.ui.retryLoad')}</button>}
        />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="ec-chat-scroll ec-chat-thread min-h-0 flex-1 overflow-y-auto overflow-x-hidden" role="log" aria-live="polite" aria-relevant="additions">
        <div ref={contentRef} className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end px-3 pb-3 pt-4 sm:px-6">
          {loadingOlder && (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground" role="status">
              <span className="ec-chat-dots flex gap-1" aria-hidden>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              </span>
              {t('chat.ui.loadingOlder')}
            </div>
          )}
          {messages.length === 0 ? (
            <EmptyState icon={MessageSquare} title={emptyTitle} hint={emptyHint} className="my-auto" />
          ) : (
            messages.map((m, i) => {
              const own = m.sender_id === currentUserId;
              const prevMsg = messages[i - 1];
              const nextMsg = messages[i + 1];
              const newDay = !prevMsg || dayKey(prevMsg.created_at) !== dayKey(m.created_at);
              const joinsPrev = !!prevMsg && !newDay && prevMsg.sender_id === m.sender_id &&
                new Date(m.created_at).getTime() - new Date(prevMsg.created_at).getTime() < GROUP_GAP_MS;
              const joinsNext = !!nextMsg && dayKey(nextMsg.created_at) === dayKey(m.created_at) && nextMsg.sender_id === m.sender_id &&
                new Date(nextMsg.created_at).getTime() - new Date(m.created_at).getTime() < GROUP_GAP_MS;
              if (!known.current.has(idOf(m)) && i >= messages.length - 4) fresh.current.add(idOf(m));
              const isNew = fresh.current.has(idOf(m));
              const text = m.message?.trim();
              const hasEntry = !!m.progress_entry_id;
              return (
                <React.Fragment key={idOf(m)}>
                  {newDay && (
                    <div className="sticky top-2 z-10 my-3 flex justify-center first:mt-0">
                      <span className="rounded-full bg-card/85 px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm ring-1 ring-border/60 backdrop-blur">
                        {formatDayLabel(m.created_at, t)}
                      </span>
                    </div>
                  )}
                  <div className={cn('flex w-full', own ? 'justify-end' : 'justify-start', joinsPrev ? 'mt-0.5' : 'mt-2.5')}>
                    <div className={cn('flex max-w-[82%] flex-col sm:max-w-[70%]', own ? 'items-end' : 'items-start', isNew && 'ec-chat-in')} data-own={own}>
                      <div
                        className={cn(
                          'relative min-w-[4.5rem] overflow-hidden rounded-[20px] text-[15px] leading-[1.45]',
                          own ? 'ec-chat-bubble-own text-white' : 'bg-card text-foreground ring-1 ring-border/60',
                          own && joinsPrev && 'rounded-se-md',
                          own && joinsNext && 'rounded-ee-md',
                          own && !joinsNext && 'rounded-ee-[6px]',
                          !own && joinsPrev && 'rounded-ss-md',
                          !own && joinsNext && 'rounded-es-md',
                          !own && !joinsNext && 'rounded-es-[6px]',
                          m.status === 'sending' && 'opacity-80',
                          m.status === 'failed' && 'opacity-70',
                          hasEntry ? 'p-1.5' : 'px-3.5 pb-1.5 pt-2',
                        )}
                      >
                        {hasEntry && <LinkedEntryCard entry={m.linked_entry} own={own} />}
                        {text && (
                          <p dir="auto" className={cn('whitespace-pre-wrap break-words [overflow-wrap:anywhere]', hasEntry && 'px-2 pt-2')}>
                            <Linkified text={text} own={own} />
                          </p>
                        )}
                        <span className={cn('flex items-center justify-end gap-1 text-[11px] tabular-nums', own ? 'text-white/75' : 'text-muted-foreground', hasEntry ? 'px-2 pb-0.5 pt-1' : 'mt-0.5')}>
                          <time dateTime={m.created_at}>{formatTime(m.created_at)}</time>
                          {own && (
                            m.status === 'sending' ? <Clock className="h-3 w-3" aria-label={t('chat.ui.sending')} />
                              : m.status === 'failed' ? <AlertCircle className="h-3.5 w-3.5 text-white" aria-label={t('chat.ui.failed')} />
                                : m.read_at ? <CheckCheck className="h-3.5 w-3.5 text-white" aria-label={t('chat.ui.read')} />
                                  : <Check className="h-3.5 w-3.5" aria-label={t('chat.ui.sent')} />
                          )}
                        </span>
                      </div>
                      {m.status === 'failed' && (
                        <div className="mt-1 flex items-center gap-1 text-xs">
                          <span className="font-semibold text-destructive">{t('chat.ui.failed')}</span>
                          <button type="button" onClick={() => onRetry(m)} className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 font-semibold text-primary hover:bg-primary/10">
                            <RotateCw className="h-3.5 w-3.5" aria-hidden />{t('chat.ui.retry')}
                          </button>
                          <button type="button" onClick={() => onDiscard(m)} className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-muted-foreground hover:bg-muted">
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />{t('chat.ui.discard')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>

      {(showJump || unseen > 0) && messages.length > 0 && (
        <button
          type="button"
          onClick={() => { scrollToBottom(true); setUnseen(0); }}
          aria-label={t('chat.ui.scrollToBottom')}
          className="ec-chat-pop absolute bottom-3 end-3 z-20 flex h-11 items-center gap-1.5 rounded-full bg-card px-3 text-sm font-semibold text-foreground shadow-lg ring-1 ring-border transition-transform active:scale-95 sm:end-6"
        >
          {unseen > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold leading-5 text-primary-foreground">{unseen}</span>}
          {unseen > 0 && <span className="hidden sm:inline">{t('chat.ui.newMessages')}</span>}
          <ChevronDown className="h-5 w-5" aria-hidden />
        </button>
      )}
    </div>
  );
};

export default React.memo(MessageList);
