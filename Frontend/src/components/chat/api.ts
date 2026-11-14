import { API_BASE_URL } from '@/config/api';

export const API_BASE = API_BASE_URL || 'http://localhost:8000/api';

export interface LinkedPhoto {
  filename: string;
  photo_type?: string | null;
}

export interface LinkedEntry {
  id: number;
  date: string;
  weight?: number | null;
  notes?: string | null;
  photos: LinkedPhoto[];
}

export interface ChatMessage {
  id: number;
  trainer_id: number;
  client_id: number;
  sender_id: number;
  message: string;
  progress_entry_id: number | null;
  created_at: string;
  read_at: string | null;
  linked_entry?: LinkedEntry | null;
  /** client-only fields for optimistic messages */
  localId?: string;
  status?: 'sending' | 'failed';
}

export interface Conversation {
  /** client id for trainers; trainer id for trainees */
  client_id: number;
  client_name: string;
  last_message: ChatMessage | null;
  unread_count: number;
}

export interface ProgressEntry {
  id: number;
  client_id: number;
  date: string;
  weight: number;
  photo_path?: string | null;
  photos?: { id: number; photo_path: string; photo_type: string }[];
  notes?: string | null;
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const token = () => localStorage.getItem('access_token');

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body?.detail === 'string' ? body.detail : detail;
    } catch { /* ignore */ }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const q = (params: Record<string, number | string | null | undefined>) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') s.set(k, String(v));
  });
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const chatApi = {
  conversations: (signal?: AbortSignal) => request<Conversation[]>('/v2/chat/conversations', {}, signal),
  messages: (clientId: number | null, opts: { beforeId?: number; limit?: number } = {}, signal?: AbortSignal) =>
    request<ChatMessage[]>(`/v2/chat/messages${q({ client_id: clientId, before_id: opts.beforeId, limit: opts.limit })}`, {}, signal),
  updates: (clientId: number | null, afterId: number, signal?: AbortSignal) =>
    request<{ messages: ChatMessage[]; read_through_id: number | null }>(
      `/v2/chat/updates${q({ client_id: clientId, after_id: afterId })}`, {}, signal),
  send: (body: { client_id: number; message: string; progress_entry_id?: number | null }) =>
    request<ChatMessage>('/v2/chat/messages', { method: 'POST', body: JSON.stringify(body) }),
  markRead: (clientId: number | null) =>
    request<{ marked: number; read_through_id: number | null }>(`/v2/chat/read${q({ client_id: clientId })}`, { method: 'POST' }),
  progress: (clientId: number | null) =>
    request<ProgressEntry[]>(`/progress/${q({ client_id: clientId })}`),
};

/** WebSocket URL for the user's realtime channel (router mounted at /api/ws/{user_id}). */
export const socketUrl = (userId: number) => {
  const t = token();
  if (!t) return null;
  let base: URL;
  try {
    base = new URL(API_BASE, window.location.origin);
  } catch {
    return null;
  }
  const proto = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = base.pathname.replace(/\/api\/?$/, '').replace(/\/$/, '');
  return `${proto}//${base.host}${path}/api/ws/${userId}?token=${encodeURIComponent(t)}`;
};

/** Authenticated media URL for a progress photo filename. */
export const progressPhotoUrl = (filename: string) =>
  `${API_BASE}/files/media/progress_photos/${encodeURIComponent(filename.split('/').pop() || filename)}`;

/** Normalize a /progress entry into the compact shape used by chat messages. */
export const toLinkedEntry = (e: ProgressEntry): LinkedEntry => {
  const photos: LinkedPhoto[] = [];
  const seen = new Set<string>();
  const add = (p: string | null | undefined, type?: string | null) => {
    const name = p ? p.split(/[\\/]/).pop() : null;
    if (name && !seen.has(name)) { seen.add(name); photos.push({ filename: name, photo_type: type ?? null }); }
  };
  add(e.photo_path);
  e.photos?.forEach((p) => add(p.photo_path, p.photo_type));
  return { id: e.id, date: e.date, weight: e.weight, notes: e.notes, photos };
};
