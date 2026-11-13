import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, Sparkles, RotateCcw, CheckCircle2, KeyRound } from 'lucide-react';
import { studioApi, type AgentTurn, type AgentReply } from '@/lib/studioApi';
import { cn } from '@/lib/utils';

type Msg = AgentTurn & { actions?: AgentReply['actions']; error?: boolean };
const STORE = 'ec_agent_history_v1';

const loadHistory = (): Msg[] => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) || '[]');
  } catch {
    return [];
  }
};

/** Minimal markdown-ish rendering: paragraphs, bullet lines, **bold**. Text only, no HTML injection. */
const RichText = ({ text }: { text: string }) => (
  <>
    {text.split(/\n{2,}/).map((block, i) => {
      const lines = block.split('\n');
      const isList = lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
      const fmt = (s: string) =>
        s.split(/(\*\*[^*]+\*\*)/g).map((part, k) =>
          part.startsWith('**') && part.endsWith('**') ? <strong key={k}>{part.slice(2, -2)}</strong> : <React.Fragment key={k}>{part}</React.Fragment>
        );
      return isList ? (
        <ul key={i} className="my-2 list-disc space-y-1 ps-5">
          {lines.map((l, j) => <li key={j}>{fmt(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''))}</li>)}
        </ul>
      ) : (
        <p key={i} className="my-2 whitespace-pre-wrap first:mt-0 last:mb-0">{fmt(block)}</p>
      );
    })}
  </>
);

interface AgentChatProps {
  page?: string;
  seed?: string | null;
  onSeedConsumed?: () => void;
  compact?: boolean;
  className?: string;
}

/** Conversation with Agent EC. Used full-page (Studio → Agent EC) and in the floating sidekick. */
export const AgentChat: React.FC<AgentChatProps> = ({ page, seed, onSeedConsumed, compact, className }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>(loadHistory);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const suggestions = t('studio.agent.suggestions', { returnObjects: true }) as string[];

  useEffect(() => {
    studioApi.agentStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-40)));
    } catch {
      /* ignore */
    }
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);
  useEffect(() => {
    if (seed) {
      setInput(seed);
      onSeedConsumed?.();
    }
  }, [seed, onSeedConsumed]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const history = next.filter((m) => !m.error).map(({ role, content: c }) => ({ role, content: c }));
      const res = await studioApi.agentChat(history.slice(-30), i18n.language, page);
      setMessages((m) => [...m, { role: 'assistant', content: res.reply || '…', actions: res.actions }]);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setMessages((m) => [...m, { role: 'assistant', content: status === 503 && configured === false ? t('studio.agent.notConfigured') : t('studio.agent.error'), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div ref={scroller} className={cn('min-h-0 flex-1 overflow-y-auto', compact ? 'px-4 py-4' : 'px-1 py-2')}>
        {configured === false && (
          <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-200">
            <p>{t('studio.agent.notConfigured')}</p>
            <button
              type="button"
              onClick={() => navigate('/studio/preferences#ai-keys')}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold underline-offset-2 hover:underline"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {t('studio.prefs.addKeys')}
            </button>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 py-8 text-center" data-ec-enter>
            <div className="relative grid h-16 w-16 place-items-center rounded-[1.4rem] bg-primary text-primary-foreground shadow-[0_18px_40px_-14px_hsl(var(--primary)/.9)]">
              <Sparkles className="h-7 w-7" />
              <span className="absolute inset-0 animate-ping rounded-[1.4rem] bg-primary/30" style={{ animationDuration: '2.6s' }} />
            </div>
            <div>
              <p className="font-display text-4xl">{t('studio.agent.title')}</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t('studio.agent.subtitle')}</p>
            </div>
            {configured === false ? (
              <button
                type="button"
                onClick={() => navigate('/studio/preferences#ai-keys')}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
              >
                <KeyRound className="h-4 w-4" />
                {t('studio.prefs.addKeys')}
              </button>
            ) : (
              <div className="flex max-w-xl flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-border/70 bg-card/70 px-3.5 py-2 text-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={cn('flex animate-fade-in', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[88%] rounded-[1.3rem] px-4 py-3 text-[15px] leading-relaxed',
                    m.role === 'user'
                      ? 'rounded-ee-md bg-primary text-primary-foreground'
                      : cn('rounded-es-md border border-border/60 bg-card', m.error && 'border-destructive/40 text-destructive')
                  )}
                >
                  {m.role === 'assistant' ? <RichText text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
                  {!!m.actions?.length && (
                    <div className="mt-3 border-t border-border/60 pt-2">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">{t('studio.agent.actions')}</p>
                      {m.actions.map((a, k) => (
                        <p key={k} className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" />{a.tool}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-[1.3rem] rounded-es-md border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
                  <span className="flex gap-1">{[0, 1, 2].map((d) => <i key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${d * 0.15}s` }} />)}</span>
                  {t('studio.agent.thinking')}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className={cn('relative', compact ? 'border-t border-border/60 p-3' : 'pt-3')}
      >
        <div className="ec-glass flex items-end gap-2 rounded-[1.5rem] p-2">
          {messages.length > 0 && (
            <button type="button" onClick={() => setMessages([])} title={t('studio.agent.clear')} aria-label={t('studio.agent.clear')} className="grid h-10 w-10 flex-none place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[.06] hover:text-foreground">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={t('studio.agent.placeholder')}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <button type="submit" disabled={!input.trim() || busy} aria-label={t('studio.agent.send')} className="grid h-10 w-10 flex-none place-items-center rounded-full bg-primary text-primary-foreground transition-all duration-300 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100">
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default AgentChat;
