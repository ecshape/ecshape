import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, KeyRound, Plus, X, Wand2, PenLine, Users2, HeartPulse, Bug, Search as SearchIcon } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AgentEcIcon } from './AgentEcIcon';
import { useAgentSidekick } from '@/contexts/AgentSidekickContext';
import { useAuth } from '@/contexts/AuthContext';
import { studioApi, type AgentRecommendation, type AiKey } from '@/lib/studioApi';
import {
  AGENT_CHANGED_EVENT, AGENT_OPEN_FORM_EVENT, formHref, opAutoRun, opIsDanger, opNeedsConfirm, opSummary, opTarget,
  pageSnapshot, pageTitle, quickPromptKeys, useArticleBridge, spotlight, travel, type AgentOp, type OpState,
} from '@/lib/agentOps';
import { applySiteText } from '@/lib/siteContentOps';
import { toSiteLang } from '@/site/content';
import { cn } from '@/lib/utils';

type Fix = { label: string; href: string };
type Turn = { role: 'user' | 'assistant'; text: string; actions?: AgentOp[]; opStates?: OpState[]; engine?: string; error?: boolean; fix?: Fix | null };
type Conversation = { id: string; title: string; updatedAt: string; turns: Turn[] };

const MIN_W = 340;
const MAX_W = 760;

const storageKey = (userId: number | string) => `ec-agent:${userId || 'me'}`;
const newConversation = (title: string): Conversation => ({
  id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  title,
  updatedAt: new Date().toISOString(),
  turns: [],
});
function readStore(userId: number | string, fallbackTitle: string): { convs: Conversation[]; current: string } {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as { convs?: Conversation[]; current?: string };
      if (Array.isArray(parsed.convs) && parsed.convs.length) return { convs: parsed.convs.slice(0, 30), current: parsed.current || parsed.convs[0].id };
    }
  } catch {
    /* storage unavailable */
  }
  const first = newConversation(fallbackTitle);
  return { convs: [first], current: first.id };
}

/** Light formatting of replies: **bold**, "-" lists. Text only. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const parts = line.split(/\*\*(.+?)\*\*/g);
        const content = parts.map((p, j) => (j % 2 ? <strong key={j}>{p}</strong> : <React.Fragment key={j}>{j === 0 ? p.replace(/^\s*[-•*]\s+/, '') : p}</React.Fragment>));
        return /^\s*[-•*]\s+/.test(line) ? <p key={i} className="ec-psk-li">{content}</p> : <p key={i}>{content}</p>;
      })}
    </>
  );
}

const REC_ICON: Record<AgentRecommendation['id'], React.ElementType> = { leads: Users2, silent: HeartPulse, qa: Bug, seo: SearchIcon };

/**
 * Edge handle of Agent EC on the inline-end side of every studio page: a slim glowing tab that peeks once per
 * session, opens on hover/click, or can be pulled out (mouse, pen or touch; on touch also from the screen edge).
 */
function AgentEdgeTab({ onOpen, rtl }: { onOpen: () => void; rtl: boolean }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const swipe = useRef<{ x: number; y: number; lastX: number; lastT: number; v: number; active: boolean } | null>(null);
  const [peek, setPeek] = useState(() => {
    try {
      return sessionStorage.getItem('ec-agent-edge-seen') !== '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!peek) return;
    try {
      sessionStorage.setItem('ec-agent-edge-seen', '1');
    } catch {
      /* ignore */
    }
    const timer = window.setTimeout(() => setPeek(false), 2600);
    return () => window.clearTimeout(timer);
  }, [peek]);

  // distance pulled toward the page (positive), whatever the reading direction
  const pulled = useCallback((startX: number, x: number) => (rtl ? x - startX : startX - x), [rtl]);
  const panelWidth = useCallback(() => ghost.current?.querySelector<HTMLElement>('.ec-psk-swipe-panel')?.offsetWidth || Math.min(420, window.innerWidth), []);
  const setPull = useCallback(
    (px: number) => {
      const g = ghost.current;
      if (!g) return;
      const w = panelWidth();
      const pull = Math.max(0, Math.min(w, px));
      g.classList.add('is-on');
      g.style.setProperty('--psk-pull', `${pull}px`);
      g.style.setProperty('--psk-progress', String(pull / w));
      ref.current?.style.setProperty('--ec-edge-pull', `${Math.min(pull, 40)}px`);
    },
    [panelWidth],
  );
  const settle = useCallback(
    (pull: number, velocity: number) => {
      const g = ghost.current;
      const w = panelWidth();
      const open = pull > w * 0.33 || (velocity > 0.45 && pull > 24);
      ref.current?.style.removeProperty('--ec-edge-pull');
      if (!g) {
        if (open) onOpen();
        return;
      }
      g.classList.add('is-settling');
      setPull(open ? w : 0);
      window.setTimeout(() => {
        g.classList.remove('is-settling', 'is-on');
        g.style.removeProperty('--psk-pull');
        g.style.removeProperty('--psk-progress');
        if (open) {
          document.documentElement.classList.add('ec-psk-swiped');
          window.setTimeout(() => document.documentElement.classList.remove('ec-psk-swiped'), 500);
          onOpen();
        }
      }, 230);
    },
    [onOpen, panelWidth, setPull],
  );
  const begin = useCallback((x: number, y: number) => {
    swipe.current = { x, y, lastX: x, lastT: performance.now(), v: 0, active: false };
  }, []);
  const track = useCallback(
    (x: number, y: number) => {
      const s = swipe.current;
      if (!s) return true;
      const dx = pulled(s.x, x);
      if (!s.active) {
        if (Math.abs(y - s.y) > 14 && Math.abs(y - s.y) > Math.abs(dx)) {
          swipe.current = null;
          return false;
        }
        if (dx < 6) return true;
        s.active = true;
      }
      const now = performance.now();
      s.v = pulled(s.lastX, x) / Math.max(1, now - s.lastT);
      s.lastX = x;
      s.lastT = now;
      setPull(dx);
      return true;
    },
    [pulled, setPull],
  );
  const end = useCallback(() => {
    const s = swipe.current;
    swipe.current = null;
    if (!s?.active) return false;
    settle(pulled(s.x, s.lastX), s.v);
    return true;
  }, [pulled, settle]);

  // Phones and tablets: swipe in from the screen edge.
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch || (e.target as Element | null)?.closest?.('.ec-psk-edge')) return;
      const nearEdge = rtl ? touch.clientX < 24 : touch.clientX > window.innerWidth - 24;
      if (nearEdge) begin(touch.clientX, touch.clientY);
    };
    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) track(touch.clientX, touch.clientY);
    };
    const onEnd = () => void end();
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [begin, track, end, rtl]);

  return (
    <>
      <div ref={ghost} className="ec-psk-swipe" aria-hidden>
        <div className="ec-psk-swipe-dim" />
        <div className="ec-psk-swipe-panel">
          <div className="ec-psk-swipe-head">
            <AgentEcIcon />
            <strong>Agent EC</strong>
          </div>
          <p className="ec-psk-muted">{t('agent.release')}</p>
        </div>
      </div>
      <button
        ref={ref}
        type="button"
        className={cn('ec-psk-edge', peek && 'is-peek')}
        aria-label={t('agent.openAria')}
        title={t('agent.openTitle')}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
          begin(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (pulled(d.x, e.clientX) > 4) d.moved = true;
          track(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          if (!end()) ref.current?.style.removeProperty('--ec-edge-pull');
        }}
        onPointerCancel={() => {
          drag.current = null;
          if (!end()) ref.current?.style.removeProperty('--ec-edge-pull');
        }}
        onClick={() => {
          const d = drag.current;
          drag.current = null;
          if (d?.moved) return;
          onOpen();
        }}
      >
        <span className="ec-psk-edge-grip" aria-hidden />
        <AgentEcIcon size="sm" />
        <span className="ec-psk-edge-label">Agent EC</span>
      </button>
    </>
  );
}

/**
 * Agent EC (ported from Agent LE): edge handle on every studio page, a docked panel with adjustable width that
 * pushes the page aside instead of covering it and stays open from page to page. It sees the page, proposes
 * actions it runs on the right page after confirmation, keeps the conversation history and lets the trainer pick
 * the AI model (or Automatic).
 */
export function AgentEc() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const articleBridge = useArticleBridge();
  const navigate = useNavigate();
  const { open, setOpen, width, setWidth, seed, clearSeed } = useAgentSidekick();
  const rtl = i18n.language?.startsWith('he');
  const pathname = location.pathname;
  const userId = user?.id ?? 'me';
  const firstName = (user?.full_name || '').split(' ')[0];

  const [store, setStore] = useState(() => readStore(userId, t('agent.newConversation')));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<AiKey[] | null>(null);
  const [recs, setRecs] = useState<AgentRecommendation[]>([]);
  const [provider, setProvider] = useState(() => {
    try {
      return localStorage.getItem('ec-agent-provider') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const conv = store.convs.find((c) => c.id === store.current) || store.convs[0];
  const turns = conv?.turns || [];

  const updateConv = (mutate: (c: Conversation) => Conversation) =>
    setStore((s) => ({ ...s, convs: s.convs.map((c) => (c.id === (s.current || s.convs[0].id) ? mutate(c) : c)) }));
  const setTurns = (next: Turn[] | ((prev: Turn[]) => Turn[])) =>
    updateConv((c) => {
      const turnsNext = typeof next === 'function' ? next(c.turns) : next;
      const firstUser = turnsNext.find((x) => x.role === 'user')?.text || '';
      return { ...c, turns: turnsNext.slice(-60), updatedAt: new Date().toISOString(), title: firstUser ? firstUser.slice(0, 60) : c.title };
    });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify({ convs: store.convs.slice(0, 30), current: store.current }));
    } catch {
      /* ignore */
    }
  }, [store, userId]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns.length, busy, open]);
  useEffect(() => {
    if (seed) {
      setInput(seed);
      clearSeed();
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [seed, clearSeed]);

  // Keys (for the model picker) and live recommendations, each time the panel opens.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    studioApi.aiKeys().then((k) => alive && setKeys(k)).catch(() => alive && setKeys([]));
    studioApi.agentRecommendations().then((r) => alive && setRecs(r)).catch(() => alive && setRecs([]));
    return () => {
      alive = false;
    };
  }, [open]);

  function goTo(href: string, selector?: string) {
    const [path, hash] = href.split('#');
    const target = selector || (hash ? `#${hash}` : '[data-ec-main] h1');
    if (path && path !== pathname) {
      travel();
      navigate(href);
    }
    spotlight(target);
  }

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => {
      const delta = rtl ? ev.clientX - startX : startX - ev.clientX;
      setWidth(Math.min(MAX_W, Math.max(MIN_W, startW + delta)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const setOpState = (turnIndex: number, opIndex: number, state: OpState) =>
    setTurns((prev) =>
      prev.map((x, i) => (i === turnIndex ? { ...x, opStates: (x.opStates || (x.actions || []).map((): OpState => 'pending')).map((s, j) => (j === opIndex ? state : s)) } : x)),
    );

  /** Runs one action, live and in front of the trainer. */
  async function runAction(op: AgentOp, turnIndex: number, opIndex: number) {
    if (op.kind === 'navigate') {
      setOpState(turnIndex, opIndex, 'done');
      if (op.href === pathname) spotlight('[data-ec-main]');
      else goTo(op.href);
      return;
    }
    if (op.kind === 'ui.open-form') {
      setOpState(turnIndex, opIndex, 'done');
      const href = formHref(op.form);
      if (pathname !== href) {
        travel();
        navigate(`${href}?new=${op.form}`);
      } else {
        window.dispatchEvent(new CustomEvent(AGENT_OPEN_FORM_EVENT, { detail: { form: op.form } }));
      }
      window.setTimeout(() => spotlight('[role="dialog"], [data-ec-main] h1'), 650);
      return;
    }
    setOpState(turnIndex, opIndex, 'running');
    const target = opTarget(op);
    if (target && !pathname.startsWith(target.path)) {
      travel();
      navigate(target.path);
    }
    try {
      if (op.kind === 'site.text') await applySiteText(toSiteLang(op.lang), op.path, op.value);
      else await studioApi.agentExecute(op);
      setOpState(turnIndex, opIndex, 'done');
      setTurns((prev) => [...prev, { role: 'assistant', text: t('agent.done', { what: opSummary(op, t).replace(/\.$/, '') }) }]);
      window.dispatchEvent(new CustomEvent(AGENT_CHANGED_EVENT));
      if (target) window.setTimeout(() => spotlight(target.selector), 600);
    } catch (e) {
      setOpState(turnIndex, opIndex, 'failed');
      setTurns((prev) => [...prev, { role: 'assistant', text: t('agent.failed', { reason: (e as Error).message }), error: true }]);
    }
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next: Turn[] = [...turns, { role: 'user', text: question }];
    setTurns(next);
    setInput('');
    setBusy(true);
    try {
      const res = await studioApi.agentChat(
        next.filter((x) => !x.error).map(({ role, text: body }) => ({ role, content: body })).slice(-30),
        i18n.language,
        { path: pathname + location.search, title: pageTitle(), snapshot: articleBridge ? `${articleBridge.context}\n\n---\n${pageSnapshot()}`.slice(0, 12000) : pageSnapshot(), selection: window.getSelection()?.toString().slice(0, 2000) || '' },
        provider,
      );
      const actions = res.ok ? res.actions || [] : [];
      const turn: Turn = res.ok
        ? { role: 'assistant', text: res.reply || '', actions, opStates: actions.map((): OpState => 'pending'), engine: res.engine }
        : { role: 'assistant', text: res.error || t('agent.noAnswer'), error: true, fix: res.fix || null };
      setTurns([...next, turn]);
      if (res.ok && actions.length) {
        const turnIndex = next.length;
        window.setTimeout(() => actions.forEach((op, j) => opAutoRun(op) && void runAction(op, turnIndex, j)), 80);
      }
    } catch {
      setTurns([...next, { role: 'assistant', text: t('agent.connectionLost'), error: true }]);
    } finally {
      setBusy(false);
    }
  }

  const startNewConversation = () => {
    const fresh = newConversation(t('agent.newConversation'));
    setStore((s) => ({ convs: [fresh, ...s.convs.filter((c) => c.turns.length)].slice(0, 30), current: fresh.id }));
  };

  const modelLabel = provider === 'auto' ? t('agent.auto') : keys?.find((k) => String(k.id) === provider)?.product || t('agent.auto');
  const suggestions = [
    ...((t(`agent.prompts.${quickPromptKeys(pathname)}`, { returnObjects: true }) as string[]) || []),
    ...((t('agent.capabilities', { returnObjects: true }) as string[]) || []),
  ].filter((v, i, all) => all.indexOf(v) === i).slice(0, 6);
  const savedConvs = store.convs.filter((c) => c.turns.length);
  const SendArrow = ArrowUp;
  const FixArrow = rtl ? ArrowLeft : ArrowRight;
  const locale = i18n.language?.startsWith('he') ? 'he-IL' : i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';

  const recText = (r: AgentRecommendation) => {
    if (r.id === 'leads') return t('agent.rec.leads', { count: r.count });
    if (r.id === 'silent') return t('agent.rec.silent', { count: r.count, names: (r.names || []).join(', ') });
    if (r.id === 'qa') return t('agent.rec.qa', { count: r.count });
    return t('agent.rec.seo', { langs: (r.langs || []).map((l) => t(`agent.lang.${l}`)).join(', ') });
  };
  const recPrompt = (r: AgentRecommendation) => t(`agent.recPrompt.${r.id}`);

  return (
    <>
      {!open ? <AgentEdgeTab rtl={!!rtl} onOpen={() => setOpen(true)} /> : null}
      {open ? (
        <aside className="ec-psk" aria-label="Agent EC" style={{ width: `min(${width}px, 100vw)` }} data-qa-ignore>
          <div className="ec-psk-resize" role="separator" aria-orientation="vertical" aria-label={t('agent.resize')} title={t('agent.resize')} onPointerDown={startResize} />
          <header className="ec-psk-head">
            <AgentEcIcon busy={busy} />
            <div className="ec-psk-head-title">
              <strong>Agent EC</strong>
              {savedConvs.length > 1 || (savedConvs.length === 1 && savedConvs[0].id !== conv?.id) ? (
                <DropdownMenu>
                  <DropdownMenuTrigger className="ec-psk-conv">
                    <span className="truncate">{conv?.title}</span>
                    <ChevronDown className="h-3.5 w-3.5 flex-none" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
                    {store.convs.filter((c) => c.turns.length || c.id === conv?.id).map((c) => (
                      <DropdownMenuItem key={c.id} onClick={() => setStore((s) => ({ ...s, current: c.id }))} className="flex-col items-start gap-0">
                        <span className="w-full truncate font-semibold">{c.title}</span>
                        <span className="text-xs text-muted-foreground">{new Date(c.updatedAt).toLocaleDateString(locale)}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="ec-psk-muted truncate">{conv?.turns.length ? conv.title : t('agent.newConversation')}</span>
              )}
            </div>
            <button type="button" className="ec-psk-iconbtn" onClick={startNewConversation} aria-label={t('agent.newConversation')} title={t('agent.newConversation')}>
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" className="ec-psk-iconbtn" onClick={() => setOpen(false)} aria-label={t('common.close')} title={t('common.close')}>
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="ec-psk-log" aria-live="polite">
            {!turns.length ? (
              <div className="ec-psk-welcome">
                <AgentEcIcon size="lg" />
                <h3>{firstName ? t('agent.hello', { name: firstName }) : t('agent.helloNoName')}</h3>
                <p>{t('agent.welcome')}</p>
                {recs.length ? (
                  <div className="ec-psk-recs">
                    <p className="ec-psk-recs-title">{t('agent.recommendations')}</p>
                    {recs.map((r) => {
                      const Icon = REC_ICON[r.id];
                      return (
                        <button key={r.id} type="button" className="ec-psk-rec" disabled={busy} onClick={() => void send(recPrompt(r))}>
                          <span className="ec-psk-rec-ico"><Icon className="h-4 w-4" /></span>
                          <span>{recText(r)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div className="ec-psk-suggest">
                  {suggestions.map((q) => (
                    <button key={q} type="button" disabled={busy} onClick={() => void send(q)}>{q}</button>
                  ))}
                </div>
              </div>
            ) : null}

            {turns.map((turn, i) => (
              <div key={i} className={cn('ec-psk-msg', `is-${turn.role}`, turn.error && 'is-error')}>
                {turn.role === 'assistant' && !turn.error ? <Rich text={turn.text} /> : <p>{turn.text}</p>}
                {turn.actions?.length ? (
                  <div className="ec-psk-ops">
                    {turn.actions.map((op, j) => {
                      const state = turn.opStates?.[j] || 'pending';
                      if (!opNeedsConfirm(op)) {
                        return (
                          <button key={j} type="button" className="ec-psk-op-btn" disabled={state === 'done'} onClick={() => void runAction(op, i, j)}>
                            {op.kind === 'ui.open-form' ? <PenLine className="h-3.5 w-3.5" /> : <FixArrow className="h-3.5 w-3.5" />}
                            {op.kind === 'navigate' ? op.label : state === 'done' ? t('agent.formOpened') : opSummary(op, t)}
                          </button>
                        );
                      }
                      return (
                        <div key={j} className={cn('ec-psk-op-card', `is-${state}`, opIsDanger(op) && 'is-danger')}>
                          <p>{opSummary(op, t)}</p>
                          {state === 'pending' ? (
                            <div className="ec-psk-op-actions">
                              <button type="button" className="ec-psk-op-confirm" onClick={() => void runAction(op, i, j)}>{t('agent.confirm')}</button>
                              <button type="button" className="ec-psk-op-cancel" onClick={() => setOpState(i, j, 'cancelled')}>{t('common.cancel')}</button>
                            </div>
                          ) : (
                            <span className="ec-psk-op-state">
                              {state === 'done' ? <Check className="h-3.5 w-3.5" /> : null}
                              {t(`agent.state.${state}`)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {turn.fix ? (
                  <button type="button" className="ec-psk-op-btn ec-psk-fix" onClick={() => goTo(turn.fix!.href)}>
                    <KeyRound className="h-3.5 w-3.5" />
                    {t('agent.fix.settings')}
                  </button>
                ) : null}
                {turn.engine ? <span className="ec-psk-engine">{turn.engine}</span> : null}
              </div>
            ))}
            {busy ? (
              <p className="ec-psk-thinking">
                <span className="ec-psk-dots" aria-hidden><i /><i /><i /></span>
                {t('agent.thinking')}
              </p>
            ) : null}
            <div ref={endRef} />
          </div>

          <form
            className="ec-psk-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              placeholder={t('agent.placeholder')}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            <div className="ec-psk-input-bar">
              <DropdownMenu>
                <DropdownMenuTrigger className="ec-psk-model">
                  <Wand2 className="h-3.5 w-3.5 flex-none" />
                  <span className="truncate">{modelLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5 flex-none opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-72">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">{t('agent.model')}</DropdownMenuLabel>
                  {[{ id: 'auto', product: t('agent.auto'), model: t('agent.autoHint') }, ...(keys || []).map((k) => ({ id: String(k.id), product: k.product, model: k.model }))].map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => {
                        setProvider(m.id);
                        try {
                          localStorage.setItem('ec-agent-provider', m.id);
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="justify-between gap-3"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{m.product}</span>
                        <span className="block truncate text-xs text-muted-foreground">{m.model}</span>
                      </span>
                      {provider === m.id ? <Check className="h-4 w-4 text-primary" /> : null}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => goTo('/studio/settings#ai-keys')} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {t('agent.addModel')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button type="button" className="ec-psk-iconbtn" onClick={() => goTo('/studio/settings#ai-keys')} aria-label={t('agent.addModel')} title={t('agent.addModel')}>
                <KeyRound className="h-4 w-4" />
              </button>
              <span className="flex-1" />
              <button type="submit" className="ec-psk-send" disabled={busy || !input.trim()} aria-label={t('agent.send')}>
                <SendArrow className="h-[18px] w-[18px]" />
              </button>
            </div>
          </form>
        </aside>
      ) : null}
    </>
  );
}

export default AgentEc;
