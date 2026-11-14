import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Search, TrendingUp, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Conversation } from './api';
import { formatListStamp } from './format';
import { ChatAvatar, EmptyState } from './parts';

interface Props {
  conversations: Conversation[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  currentUserId?: number;
  className?: string;
  header?: React.ReactNode;
}

const normalize = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const ConversationList: React.FC<Props> = ({ conversations, loading, error, onRetry, selectedId, onSelect, currentUserId, className, header }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return conversations;
    return conversations.filter((c) => normalize(c.client_name).includes(q));
  }, [conversations, query]);

  const totalUnread = conversations.reduce((n, c) => n + (c.unread_count || 0), 0);

  return (
    <section className={cn('flex min-h-0 flex-col', className)} aria-label={t('chat.ui.title')}>
      <div className="shrink-0 px-4 pb-3 pt-4 sm:px-5">
        {header}
        <div className="mb-4 flex items-end justify-between gap-3">
          <h1 className="font-display text-[2.6rem] leading-[.9] text-foreground">{t('chat.ui.title')}</h1>
          {totalUnread > 0 && (
            <span className="ec-chat-pop mb-1 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-bold text-primary" aria-label={t('chat.ui.unread', { count: totalUnread })}>
              {totalUnread}
            </span>
          )}
        </div>
        {conversations.length > 0 && (
          <label className="relative block">
            <span className="sr-only">{t('chat.ui.searchPlaceholder')}</span>
            <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('chat.ui.searchPlaceholder')}
              className="h-11 w-full rounded-full border border-border/70 bg-muted/40 pe-11 ps-11 text-[15px] text-foreground outline-none transition-[border-color,box-shadow,background-color] duration-300 placeholder:text-muted-foreground focus:border-primary/60 focus:bg-background focus:ring-4 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('chat.ui.clearSearch')}
                className="absolute end-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        )}
      </div>

      <div className="ec-chat-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3 sm:px-3">
        {loading && conversations.length === 0 ? (
          <ul className="space-y-1 px-1" aria-busy>
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 rounded-2xl px-3 py-3">
                <span className="ec-chat-shimmer h-12 w-12 rounded-full bg-muted" />
                <span className="flex-1 space-y-2">
                  <span className="ec-chat-shimmer block h-3.5 w-1/2 rounded-full bg-muted" />
                  <span className="ec-chat-shimmer block h-3 w-3/4 rounded-full bg-muted/70" />
                </span>
              </li>
            ))}
          </ul>
        ) : error && conversations.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={t('chat.ui.listError')}
            action={<button type="button" onClick={onRetry} className="h-11 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-transform active:scale-95">{t('chat.ui.retryLoad')}</button>}
          />
        ) : conversations.length === 0 ? (
          <EmptyState icon={Users} title={t('chat.ui.noClients')} hint={t('chat.ui.noClientsHint')} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Search} title={t('chat.ui.noResults', { query: query.trim() })} />
        ) : (
          <ul className="ec-chat-list space-y-0.5">
            {filtered.map((c) => {
              const active = c.client_id === selectedId;
              const last = c.last_message;
              const mine = last && last.sender_id === currentUserId;
              const unread = c.unread_count > 0;
              const preview = last
                ? (last.message?.trim() || t('chat.ui.progressEntry'))
                : t('chat.ui.startConversation');
              return (
                <li key={c.client_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.client_id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'group flex min-h-[64px] w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition-[background-color,transform] duration-200 active:scale-[.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/60',
                    )}
                  >
                    <ChatAvatar name={c.client_name} src={c.client_avatar} size="lg" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate text-[15px]', unread ? 'font-bold text-foreground' : 'font-semibold text-foreground')}>{c.client_name}</span>
                        {last && (
                          <span className={cn('shrink-0 text-xs tabular-nums', unread ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                            {formatListStamp(last.created_at, t)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className={cn('flex min-w-0 items-center gap-1 truncate text-[13px]', unread ? 'text-foreground/90' : 'text-muted-foreground', !last && 'italic')}>
                          {mine && <span className="shrink-0 text-muted-foreground">{t('chat.ui.you')}:</span>}
                          {last && !last.message?.trim() && last.progress_entry_id && <TrendingUp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
                          <span className="truncate" dir="auto">{preview}</span>
                        </span>
                        {unread && (
                          <span className="ec-chat-pop grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold leading-none text-primary-foreground" aria-label={t('chat.ui.unread', { count: c.unread_count })}>
                            {c.unread_count > 99 ? '99+' : c.unread_count}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

export default ConversationList;
