import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const OPEN_KEY = 'ec-psk-open';
const WIDTH_KEY = 'ec-psk-w';
const DEFAULT_W = 400;
const MIN_W = 320;
const MAX_W = 640;

type Ctx = {
  open: boolean;
  width: number;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  setWidth: (w: number) => void;
  ask: (prompt?: string) => void;
  seed: string | null;
  clearSeed: () => void;
};

const AgentSidekickContext = createContext<Ctx | null>(null);

export const AgentSidekickProvider: React.FC<{ children: React.ReactNode; enabled?: boolean }> = ({
  children,
  enabled = true,
}) => {
  const [open, setOpenState] = useState(() => {
    try {
      return sessionStorage.getItem(OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [width, setWidthState] = useState(() => {
    try {
      const n = Number(localStorage.getItem(WIDTH_KEY));
      return Number.isFinite(n) && n >= MIN_W && n <= MAX_W ? n : DEFAULT_W;
    } catch {
      return DEFAULT_W;
    }
  });
  const [seed, setSeed] = useState<string | null>(null);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    try {
      sessionStorage.setItem(OPEN_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const setWidth = useCallback((w: number) => {
    const clamped = Math.max(MIN_W, Math.min(MAX_W, w));
    setWidthState(clamped);
    try {
      localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);
  const ask = useCallback(
    (prompt?: string) => {
      if (prompt) setSeed(prompt);
      setOpen(true);
    },
    [setOpen],
  );
  const clearSeed = useCallback(() => setSeed(null), []);

  useEffect(() => {
    if (!enabled) {
      document.documentElement.classList.remove('ec-psk-open');
      document.documentElement.style.removeProperty('--ec-psk-w');
      return;
    }
    const html = document.documentElement;
    if (open) {
      html.classList.add('ec-psk-open');
      html.style.setProperty('--ec-psk-w', `${width}px`);
    } else {
      html.classList.remove('ec-psk-open');
      html.style.removeProperty('--ec-psk-w');
    }
    return () => {
      html.classList.remove('ec-psk-open');
      html.style.removeProperty('--ec-psk-w');
    };
  }, [open, width, enabled]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const value = useMemo(
    () => ({ open, width, setOpen, toggle, setWidth, ask, seed, clearSeed }),
    [open, width, setOpen, toggle, setWidth, ask, seed, clearSeed],
  );

  return <AgentSidekickContext.Provider value={value}>{children}</AgentSidekickContext.Provider>;
};

export function useAgentSidekick() {
  const ctx = useContext(AgentSidekickContext);
  if (!ctx) throw new Error('useAgentSidekick requires AgentSidekickProvider');
  return ctx;
}

export function useAgentSidekickOptional() {
  return useContext(AgentSidekickContext);
}
