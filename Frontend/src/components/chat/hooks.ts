import { useEffect, useRef, useState } from 'react';
import { socketUrl } from './api';

export const useMediaQuery = (query: string) => {
  const get = () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
};

export const usePageVisible = () => {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
};

/** Height / offset of the visual viewport, so a fixed screen can sit above the mobile keyboard. */
export const useVisualViewport = (enabled: boolean) => {
  const [vv, setVv] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const v = window.visualViewport;
    if (!v) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVv({ height: v.height, top: v.offsetTop }));
    };
    update();
    v.addEventListener('resize', update);
    v.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener('resize', update);
      v.removeEventListener('scroll', update);
    };
  }, [enabled]);
  return vv;
};

/** Distance from an element's top to the bottom of the window (for the desktop split view). */
export const useFillHeight = (enabled: boolean) => {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) { setHeight(null); return; }
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setHeight(Math.max(420, Math.round(window.innerHeight - top - 12)));
    };
    measure();
    const id = window.setTimeout(measure, 350); // after the page-enter transition
    window.addEventListener('resize', measure);
    return () => { window.clearTimeout(id); window.removeEventListener('resize', measure); };
  }, [enabled]);
  return { ref, height };
};

export type SocketEvent = { type: string; [k: string]: unknown };

/**
 * Optional realtime channel. Connects to the user's WebSocket and reports `connected`
 * only once the socket is actually open. Failures are silent (the chat falls back to
 * polling) and reconnects back off up to one minute.
 */
export const useChatSocket = (userId: number | undefined, onEvent: (e: SocketEvent) => void) => {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!userId || typeof WebSocket === 'undefined') return;
    let ws: WebSocket | null = null;
    let timer: number | undefined;
    let attempts = 0;
    let disposed = false;
    let ping: number | undefined;

    const schedule = () => {
      if (disposed) return;
      attempts += 1;
      const delay = Math.min(60000, 2000 * 2 ** Math.min(attempts - 1, 5));
      timer = window.setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposed) return;
      const url = socketUrl(userId);
      if (!url) return;
      try {
        ws = new WebSocket(url);
      } catch {
        schedule();
        return;
      }
      ws.onopen = () => {
        attempts = 0;
        setConnected(true);
        ping = window.setInterval(() => {
          try { ws?.send(JSON.stringify({ type: 'ping' })); } catch { /* ignore */ }
        }, 25000);
      };
      ws.onmessage = (ev) => {
        try {
          handler.current(JSON.parse(ev.data));
        } catch { /* ignore malformed frames */ }
      };
      ws.onerror = () => { /* silent: polling covers it */ };
      ws.onclose = () => {
        window.clearInterval(ping);
        setConnected(false);
        ws = null;
        schedule();
      };
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.clearInterval(ping);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        try { ws.close(); } catch { /* ignore */ }
      }
      setConnected(false);
    };
  }, [userId]);

  return connected;
};
