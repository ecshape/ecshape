import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bell, MessageSquare, PanelRightClose, PanelRightOpen, UserRound, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '@/lib/utils';
import { hasNotificationPermission, requestNotificationPermission, showNotification } from '@/lib/notifications';
import './chat/chat.css';
import { chatApi, toLinkedEntry, type ChatMessage, type Conversation, type LinkedEntry, type ProgressEntry } from './chat/api';
import { useChatSocket, useFillHeight, useMediaQuery, usePageVisible, useVisualViewport, type SocketEvent } from './chat/hooks';
import ConversationList from './chat/ConversationList';
import MessageList from './chat/MessageList';
import Composer, { type ComposerHandle } from './chat/Composer';
import { ClientPanel, EntryList } from './chat/ProgressPanel';
import { ChatAvatar, ChatSheet, EmptyState, IconButton } from './chat/parts';

const PAGE = 50;
const POLL_FALLBACK_MS = 3500;   // no socket: poll the open conversation
const POLL_SAFETY_MS = 20000;    // socket up: occasional catch-up (read receipts, missed frames)
const LIST_FALLBACK_MS = 12000;
const LIST_SAFETY_MS = 60000;
const NOTIF_DISMISS_KEY = 'ec-chat-notif-dismissed';

interface ChatProps {
  /** Optional initial selection (also read from ?clientId=) */
  selectedClientId?: number | null;
  /** Optional progress entry to pre-attach (also read from ?progressEntryId=) */
  progressEntryId?: number | null;
  onClose?: () => void;
}

const realId = (m: ChatMessage) => (m.localId ? 0 : m.id);
const lastRealId = (list: ChatMessage[]) => list.reduce((mx, m) => Math.max(mx, realId(m)), 0);

/** Merge server messages into the list: dedupe by id, settle optimistic copies, keep order. */
const mergeMessages = (prev: ChatMessage[], incoming: ChatMessage[]) => {
  if (!incoming.length) return prev;
  const byId = new Map<number, ChatMessage>();
  let pending = prev.filter((m) => m.localId);
  prev.forEach((m) => { if (!m.localId) byId.set(m.id, m); });
  incoming.forEach((m) => {
    if (!byId.has(m.id)) {
      // an own message arriving (poll/socket) before its POST resolved replaces its optimistic copy
      const idx = pending.findIndex((p) => p.status === 'sending' && p.sender_id === m.sender_id &&
        p.message.trim() === (m.message || '').trim() && (p.progress_entry_id || null) === (m.progress_entry_id || null));
      if (idx >= 0) pending = pending.filter((_, i) => i !== idx);
    }
    byId.set(m.id, { ...byId.get(m.id), ...m });
  });
  return [...Array.from(byId.values()).sort((a, b) => a.id - b.id), ...pending];
};

const Chat: React.FC<ChatProps> = ({ selectedClientId, progressEntryId }) => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isTrainer = user?.role === 'TRAINER';
  const dir = i18n.dir();

  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isWide = useMediaQuery('(min-width: 1280px)');
  const finePointer = useMediaQuery('(pointer: fine)');
  const visible = usePageVisible();

  // ---------------------------------------------------------- conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState(false);

  const loadConversations = useCallback(async (quiet = false) => {
    if (!quiet) setConvLoading(true);
    try {
      const data = await chatApi.conversations();
      setConversations(data);
      setConvError(false);
    } catch {
      if (!quiet) setConvError(true);
    } finally {
      setConvLoading(false);
    }
  }, []);

  useEffect(() => { if (user?.id) loadConversations(); }, [user?.id, loadConversations]);

  // ---------------------------------------------------------- active conversation
  const paramClient = Number(searchParams.get('clientId')) || selectedClientId || null;
  const pushedRef = useRef(false);
  const activeId: number | null = isTrainer ? paramClient : (conversations[0]?.client_id ?? null);
  const activeConv = conversations.find((c) => c.client_id === activeId) || null;
  const apiClientId = isTrainer ? activeId : null;
  const convKey = activeId ? `${isTrainer ? 'c' : 't'}${activeId}` : '';

  const selectConversation = (id: number) => {
    if (id === activeId) return;
    const next = new URLSearchParams(searchParams);
    next.set('clientId', String(id));
    next.delete('progressEntryId');
    // phones: push so the system back gesture returns to the list
    const push = !isDesktop && !activeId;
    pushedRef.current = push;
    setSearchParams(next, { replace: !push });
  };

  const closeConversation = () => {
    if (!isTrainer) {
      if (window.history.length > 1) navigate(-1); else navigate('/');
      return;
    }
    if (pushedRef.current) {
      pushedRef.current = false;
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('clientId');
    next.delete('progressEntryId');
    setSearchParams(next, { replace: true });
  };

  // ---------------------------------------------------------- messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgError, setMsgError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const keyRef = useRef(convKey);
  keyRef.current = convKey;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const markReadTimer = useRef<number>();
  const markRead = useCallback(() => {
    window.clearTimeout(markReadTimer.current);
    const key = keyRef.current;
    const cid = apiClientId;
    markReadTimer.current = window.setTimeout(async () => {
      if (keyRef.current !== key || document.visibilityState !== 'visible') return;
      try {
        await chatApi.markRead(cid);
        setConversations((cs) => cs.map((c) => (c.client_id === activeId ? { ...c, unread_count: 0 } : c)));
      } catch { /* not critical */ }
    }, 400);
  }, [apiClientId, activeId]);

  const loadMessages = useCallback(async () => {
    if (!convKey) return;
    const key = convKey;
    setMsgLoading(true);
    setMsgError(false);
    try {
      const data = await chatApi.messages(apiClientId, { limit: PAGE });
      if (keyRef.current !== key) return;
      setMessages((prev) => mergeMessages(prev.filter((m) => m.localId), data));
      setHasMore(data.length === PAGE);
      if (data.some((m) => m.sender_id !== user?.id && !m.read_at)) markRead();
    } catch {
      if (keyRef.current === key) setMsgError(true);
    } finally {
      if (keyRef.current === key) setMsgLoading(false);
    }
  }, [convKey, apiClientId, user?.id, markRead]);

  useEffect(() => {
    setMessages([]);
    setHasMore(false);
    setMsgError(false);
    loadMessages();
  }, [convKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current.find((m) => !m.localId);
    if (!oldest || loadingOlder) return;
    const key = keyRef.current;
    setLoadingOlder(true);
    try {
      const data = await chatApi.messages(apiClientId, { beforeId: oldest.id, limit: PAGE });
      if (keyRef.current !== key) return;
      setMessages((prev) => mergeMessages(prev, data));
      setHasMore(data.length === PAGE);
    } catch { /* retry on next scroll */ } finally {
      setLoadingOlder(false);
    }
  }, [apiClientId, loadingOlder]);

  const applyIncoming = useCallback((incoming: ChatMessage[], readThrough?: number | null) => {
    setMessages((prev) => {
      let next = mergeMessages(prev, incoming);
      if (readThrough) {
        next = next.map((m) => (!m.localId && m.sender_id === user?.id && m.id <= readThrough && !m.read_at ? { ...m, read_at: new Date().toISOString() } : m));
      }
      return next;
    });
    if (incoming.some((m) => m.sender_id !== user?.id)) markRead();
  }, [user?.id, markRead]);

  // ---------------------------------------------------------- realtime: socket + polling fallback
  const notify = useCallback((name: string, text: string) => {
    if (!hasNotificationPermission()) return;
    showNotification(t('chat.ui.notificationTitle', { name }), {
      body: text.length > 100 ? `${text.slice(0, 100)}…` : text,
      tag: 'chat-message',
    });
  }, [t]);

  const onSocket = useCallback((e: SocketEvent) => {
    if (e.type === 'chat_message') {
      const data = (e.data as ChatMessage | undefined) || {
        id: e.message_id as number,
        trainer_id: e.trainer_id as number,
        client_id: e.client_id as number,
        sender_id: e.sender_id as number,
        message: (e.message as string) || '',
        progress_entry_id: (e.progress_entry_id as number) || null,
        created_at: e.timestamp as string,
        read_at: null,
      };
      const convId = isTrainer ? data.client_id : data.trainer_id;
      const isActive = convId === activeId;
      if (isActive) applyIncoming([data]);
      setConversations((cs) => {
        const found = cs.find((c) => c.client_id === convId);
        if (!found) { loadConversations(true); return cs; }
        const updated = {
          ...found,
          last_message: data,
          unread_count: isActive && document.visibilityState === 'visible' ? 0 : found.unread_count + 1,
        };
        return [updated, ...cs.filter((c) => c.client_id !== convId)];
      });
      if (!isActive || document.visibilityState !== 'visible') {
        notify((e.sender_name as string) || '', data.message || t('chat.ui.progressEntry'));
      }
    } else if (e.type === 'chat_read') {
      const convId = isTrainer ? (e.client_id as number) : (e.trainer_id as number);
      if (convId === activeId) applyIncoming([], e.read_through_id as number);
    }
  }, [isTrainer, activeId, applyIncoming, loadConversations, notify, t]);

  const socketUp = useChatSocket(user?.id, onSocket);

  // Poll the open conversation (fast without a socket, slow safety net with one)
  useEffect(() => {
    if (!convKey || !visible) return;
    let timer: number;
    let alive = true;
    const key = convKey;
    const tick = async () => {
      try {
        const res = await chatApi.updates(apiClientId, lastRealId(messagesRef.current));
        if (alive && keyRef.current === key) applyIncoming(res.messages, res.read_through_id);
      } catch { /* silent; next tick retries */ }
      if (alive) timer = window.setTimeout(tick, socketUp ? POLL_SAFETY_MS : POLL_FALLBACK_MS);
    };
    timer = window.setTimeout(tick, socketUp ? POLL_SAFETY_MS : 600);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [convKey, visible, socketUp, apiClientId, applyIncoming]);

  // Refresh the conversation list (unread badges, previews)
  useEffect(() => {
    if (!user?.id || !visible) return;
    loadConversations(true);
    const id = window.setInterval(() => loadConversations(true), socketUp ? LIST_SAFETY_MS : LIST_FALLBACK_MS);
    return () => window.clearInterval(id);
  }, [user?.id, visible, socketUp, loadConversations]);

  // Keep the active conversation's preview in sync with the thread
  useEffect(() => {
    const last = [...messages].reverse().find((m) => !m.localId);
    if (!last || !activeId) return;
    setConversations((cs) => cs.map((c) => (c.client_id === activeId && (!c.last_message || c.last_message.id < last.id) ? { ...c, last_message: last } : c)));
  }, [messages, activeId]);

  // ---------------------------------------------------------- progress entries (attachments + trainer panel)
  const [entries, setEntries] = useState<ProgressEntry[] | null>(null);
  const [attachment, setAttachment] = useState<LinkedEntry | null>(null);
  const preattachRef = useRef<number | null>(Number(searchParams.get('progressEntryId')) || progressEntryId || null);

  useEffect(() => {
    setEntries(null);
    setAttachment(null);
    if (!convKey) return;
    const key = convKey;
    chatApi.progress(apiClientId)
      .then((data) => {
        if (keyRef.current !== key) return;
        const sorted = [...data].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
        setEntries(sorted);
        const pre = preattachRef.current;
        if (pre) {
          const found = sorted.find((e) => e.id === pre);
          if (found) setAttachment(toLinkedEntry(found));
          preattachRef.current = null;
        }
      })
      .catch(() => { if (keyRef.current === key) setEntries([]); });
  }, [convKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------- composer + sending
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draft = drafts[convKey] || '';
  const setDraft = useCallback((v: string) => setDrafts((d) => ({ ...d, [keyRef.current]: v })), []);
  const composerRef = useRef<ComposerHandle>(null);
  const localSeq = useRef(0);

  const deliver = useCallback(async (opt: ChatMessage, key: string) => {
    try {
      const saved = await chatApi.send({
        client_id: isTrainer ? opt.client_id : (user?.id as number),
        message: opt.message,
        progress_entry_id: opt.progress_entry_id,
      });
      if (keyRef.current !== key) return;
      setMessages((prev) => {
        const without = prev.filter((m) => m.localId !== opt.localId);
        return mergeMessages(without, [{ ...saved, linked_entry: saved.linked_entry ?? opt.linked_entry }]);
      });
    } catch {
      if (keyRef.current !== key) return;
      setMessages((prev) => prev.map((m) => (m.localId === opt.localId ? { ...m, status: 'failed' } : m)));
    }
  }, [isTrainer, user?.id]);

  const send = useCallback(() => {
    if (!activeId || !user) return;
    const text = draft.trim();
    if (!text && !attachment) return;
    localSeq.current += 1;
    const opt: ChatMessage = {
      id: -localSeq.current,
      localId: `local-${Date.now()}-${localSeq.current}`,
      trainer_id: isTrainer ? user.id : activeId,
      client_id: isTrainer ? activeId : user.id,
      sender_id: user.id,
      message: text,
      progress_entry_id: attachment?.id ?? null,
      linked_entry: attachment,
      created_at: new Date().toISOString(),
      read_at: null,
      status: 'sending',
    };
    setMessages((prev) => [...prev, opt]);
    setDraft('');
    setAttachment(null);
    deliver(opt, convKey);
  }, [activeId, user, draft, attachment, isTrainer, deliver, convKey, setDraft]);

  const retry = useCallback((m: ChatMessage) => {
    setMessages((prev) => prev.map((x) => (x.localId === m.localId ? { ...x, status: 'sending', created_at: new Date().toISOString() } : x)));
    deliver({ ...m, status: 'sending' }, convKey);
  }, [deliver, convKey]);

  const discard = useCallback((m: ChatMessage) => {
    setMessages((prev) => prev.filter((x) => x.localId !== m.localId));
  }, []);

  const attachEntry = (e: ProgressEntry) => {
    setAttachment((cur) => (cur?.id === e.id ? null : toLinkedEntry(e)));
    setPickerOpen(false);
    setProfileSheet(false);
    window.setTimeout(() => composerRef.current?.focus(), 60);
  };

  // ---------------------------------------------------------- panels, sheets, notifications banner
  const [pickerOpen, setPickerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(true);
  const [profileSheet, setProfileSheet] = useState(false);
  const [notifBanner, setNotifBanner] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(NOTIF_DISMISS_KEY) === '1'; } catch { /* ignore */ }
    const supported = typeof window !== 'undefined' && 'Notification' in window;
    if (!supported || dismissed || Notification.permission !== 'default') return;
    const id = window.setTimeout(() => setNotifBanner(true), 2500);
    return () => window.clearTimeout(id);
  }, []);

  const dismissNotif = () => {
    setNotifBanner(false);
    try { localStorage.setItem(NOTIF_DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  const NotifBanner = notifBanner ? (
    <div className="ec-chat-fade mx-3 mb-2 mt-1 flex items-center gap-3 rounded-2xl bg-primary/10 p-2 ps-3 ring-1 ring-primary/20 sm:mx-4">
      <Bell className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] font-medium text-foreground">{t('chat.ui.enableNotifications')}</p>
      <button
        type="button"
        onClick={async () => { await requestNotificationPermission(); dismissNotif(); }}
        className="h-9 shrink-0 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground active:scale-95"
      >
        {t('chat.ui.enable')}
      </button>
      <IconButton label={t('chat.ui.notNow')} onClick={dismissNotif} className="h-9 w-9">
        <X className="h-4 w-4" />
      </IconButton>
    </div>
  ) : null;

  // ---------------------------------------------------------- layout
  const mobileOverlay = !isDesktop && !!activeId;
  const vv = useVisualViewport(mobileOverlay);
  const fill = useFillHeight(isDesktop);

  useEffect(() => {
    if (!mobileOverlay) return;
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevBody; };
  }, [mobileOverlay]);

  const otherName = activeConv?.client_name || '';
  const showInlinePanel = isTrainer && isWide && profileOpen && !!activeId;

  const emptyHint = isTrainer
    ? t('chat.ui.emptyThreadHintTrainer', { name: otherName.split(' ')[0] || otherName })
    : t('chat.ui.emptyThreadHintClient');

  const conversationView = activeId && (activeConv || !isTrainer) ? (
    <div key={convKey} className="ec-chat-screen flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-[64px] shrink-0 items-center gap-2 border-b border-border/50 bg-background/70 px-2 backdrop-blur-xl sm:px-3">
        {(!isDesktop) && (
          <IconButton label={t('chat.ui.back')} onClick={closeConversation}>
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </IconButton>
        )}
        <button
          type="button"
          disabled={!isTrainer}
          onClick={() => (isWide ? setProfileOpen(true) : setProfileSheet(true))}
          className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-1.5 py-1 text-start', isTrainer && 'transition-colors hover:bg-muted/60', isDesktop && 'ps-2')}
        >
          <ChatAvatar name={otherName} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-foreground">{otherName}</span>
            <span className="block truncate text-xs text-muted-foreground">{isTrainer ? t('chat.ui.roleClient') : t('chat.ui.roleCoach')}</span>
          </span>
        </button>
        {isTrainer && (
          isWide ? (
            <IconButton label={profileOpen ? t('chat.ui.hideProfile') : t('chat.ui.showProfile')} onClick={() => setProfileOpen((o) => !o)}>
              {profileOpen
                ? <PanelRightClose className="h-5 w-5 rtl:-scale-x-100" />
                : <PanelRightOpen className="h-5 w-5 rtl:-scale-x-100" />}
            </IconButton>
          ) : (
            <IconButton label={t('chat.ui.showProfile')} onClick={() => setProfileSheet(true)}>
              <UserRound className="h-5 w-5" />
            </IconButton>
          )
        )}
      </header>
      {!isTrainer && NotifBanner}
      <MessageList
        conversationKey={convKey}
        messages={messages}
        currentUserId={user?.id}
        loading={msgLoading}
        error={msgError}
        onReload={loadMessages}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        onLoadOlder={loadOlder}
        onRetry={retry}
        onDiscard={discard}
        emptyTitle={t('chat.ui.emptyThreadTitle')}
        emptyHint={emptyHint}
      />
      <Composer
        ref={composerRef}
        value={draft}
        onChange={setDraft}
        onSend={send}
        attachment={attachment}
        onRemoveAttachment={() => setAttachment(null)}
        onAttachClick={() => setPickerOpen(true)}
        enterToSend={finePointer}
      />
    </div>
  ) : null;

  const sheets = (
    <>
      <ChatSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={t('chat.ui.pickEntryTitle')}
        description={t('chat.ui.pickEntryHint')}
        side={isDesktop ? 'end' : 'bottom'}
      >
        <EntryList entries={entries} attachedId={attachment?.id ?? null} onAttach={attachEntry} />
      </ChatSheet>
      {isTrainer && !isWide && (
        <ChatSheet open={profileSheet} onOpenChange={setProfileSheet} title={t('chat.ui.profile')} side={isDesktop ? 'end' : 'bottom'}>
          <ClientPanel
            name={otherName}
            entries={entries}
            attachedId={attachment?.id ?? null}
            onAttach={attachEntry}
            onOpenProfile={() => activeId && navigate(`/client/${activeId}`)}
            className="-mx-5 -mt-4"
          />
        </ChatSheet>
      )}
    </>
  );

  // Trainee without a coach
  if (!isTrainer && !convLoading && conversations.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        {convError
          ? <EmptyState icon={MessageSquare} title={t('chat.ui.listError')} action={<button type="button" onClick={() => loadConversations()} className="h-11 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground">{t('chat.ui.retryLoad')}</button>} />
          : <EmptyState icon={UserRound} title={t('chat.ui.noTrainerTitle')} hint={t('chat.ui.noTrainerHint')} />}
      </div>
    );
  }

  // ---- phones / tablets: two screens (list, then conversation as a full-screen layer above the keyboard)
  if (!isDesktop) {
    return (
      <>
        {isTrainer ? (
          <ConversationList
            conversations={conversations}
            loading={convLoading}
            error={convError}
            onRetry={() => loadConversations()}
            selectedId={activeId}
            onSelect={selectConversation}
            currentUserId={user?.id}
            className="ec-chat-fade min-h-[calc(100dvh-12rem)]"
            header={NotifBanner ? <div className="-mx-3 mb-2 sm:-mx-4">{NotifBanner}</div> : undefined}
          />
        ) : (
          <div className="flex min-h-[50vh] items-center justify-center" aria-busy>
            <span className="ec-chat-dots flex gap-1.5 text-muted-foreground" aria-label={t('chat.ui.loading')}>
              <span className="h-2 w-2 rounded-full bg-current" /><span className="h-2 w-2 rounded-full bg-current" /><span className="h-2 w-2 rounded-full bg-current" />
            </span>
          </div>
        )}
        {mobileOverlay && conversationView && createPortal(
          <div
            dir={dir}
            className="fixed inset-x-0 top-0 z-[60] flex flex-col overflow-hidden bg-background"
            style={{ height: vv ? `${vv.height}px` : '100dvh', transform: vv ? `translateY(${vv.top}px)` : undefined }}
          >
            <div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">{conversationView}</div>
          </div>,
          document.body,
        )}
        {sheets}
      </>
    );
  }

  // ---- desktop: list + conversation (+ client panel)
  return (
    <div className="p-3 lg:p-4">
      <div
        ref={fill.ref}
        style={{ height: fill.height ? `${fill.height - 4}px` : 'calc(100vh - 2rem)' }}
        className="ec-chat-fade flex min-h-0 overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/40 shadow-[0_24px_60px_-30px_rgba(0,0,0,.6)]"
      >
        {isTrainer && (
          <ConversationList
            conversations={conversations}
            loading={convLoading}
            error={convError}
            onRetry={() => loadConversations()}
            selectedId={activeId}
            onSelect={selectConversation}
            currentUserId={user?.id}
            className="w-[340px] shrink-0 border-e border-border/50 bg-card/60"
            header={NotifBanner ? <div className="-mx-3 mb-2 sm:-mx-4">{NotifBanner}</div> : undefined}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col bg-background">
          {conversationView || (
            <div className="ec-chat-thread flex flex-1 items-center justify-center">
              {isTrainer
                ? <EmptyState icon={MessageSquare} title={t('chat.ui.selectConversationTitle')} hint={t('chat.ui.selectConversationHint')} />
                : <span className="ec-chat-dots flex gap-1.5 text-muted-foreground" aria-label={t('chat.ui.loading')}><span className="h-2 w-2 rounded-full bg-current" /><span className="h-2 w-2 rounded-full bg-current" /><span className="h-2 w-2 rounded-full bg-current" /></span>}
            </div>
          )}
        </div>
        {showInlinePanel && (
          <ClientPanel
            key={convKey}
            name={otherName}
            entries={entries}
            attachedId={attachment?.id ?? null}
            onAttach={attachEntry}
            onOpenProfile={() => navigate(`/client/${activeId}`)}
            onClose={() => setProfileOpen(false)}
            className="ec-chat-fade w-[320px] shrink-0 border-s border-border/50 bg-card/60"
          />
        )}
      </div>
      {sheets}
    </div>
  );
};

export default Chat;
