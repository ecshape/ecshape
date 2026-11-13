import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, Sparkles, X } from 'lucide-react';
import AgentChat from './AgentChat';
import { useAgentSidekick } from '@/contexts/AgentSidekickContext';
import { cn } from '@/lib/utils';

/** Docked Agent EC panel — pushes portal content instead of covering it. */
const AgentSidekick = () => {
  const { t, i18n } = useTranslation();
  const { open, width, setOpen, setWidth, seed, clearSeed } = useAgentSidekick();
  const location = useLocation();
  const navigate = useNavigate();
  const dragging = useRef(false);
  const rtl = i18n.language?.startsWith('he');

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ec-psk-fab fixed z-[55] flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[0_18px_40px_-14px_hsl(var(--primary)/.9)] transition-transform duration-300 hover:-translate-y-0.5"
          style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))', [rtl ? 'left' : 'right']: '1.25rem' }}
          aria-label={t('studio.agent.open')}
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">{t('studio.agent.open')}</span>
        </button>
      )}

      <aside
        className={cn('ec-psk-panel', open && 'is-open')}
        style={{ width: open ? width : 0 }}
        aria-hidden={!open}
        data-qa-ignore
      >
        {open && (
          <>
            <div
              className="ec-psk-resize"
              onPointerDown={(e) => {
                e.preventDefault();
                dragging.current = true;
                const startX = e.clientX;
                const startW = width;
                const onMove = (ev: PointerEvent) => {
                  if (!dragging.current) return;
                  const delta = rtl ? ev.clientX - startX : startX - ev.clientX;
                  setWidth(startW + delta);
                };
                const onUp = () => {
                  dragging.current = false;
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
              }}
            />
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
              <span className="flex items-center gap-2 font-display text-3xl leading-none">
                <Sparkles className="h-5 w-5 text-primary" />
                {t('studio.agent.title')}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
                  title={t('studio.prefs.aiKeys')}
                  onClick={() => navigate('/studio/preferences#ai-keys')}
                >
                  <KeyRound className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-full bg-muted"
                  onClick={() => setOpen(false)}
                  aria-label={t('common.close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <AgentChat
              compact
              page={location.pathname}
              seed={seed}
              onSeedConsumed={clearSeed}
              className="min-h-0 flex-1"
            />
          </>
        )}
      </aside>
    </>
  );
};

export default AgentSidekick;
