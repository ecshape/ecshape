import { API_BASE_URL } from '@/config/api';

/** Error carrying the HTTP status, so screens can decide between "empty" and "retry". */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Body = Record<string, unknown> | unknown[] | FormData | null | undefined;

/** Authenticated JSON fetch for the trainee portal. Throws ApiError on any non-2xx. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: Body; signal?: AbortSignal } = {}): Promise<T> {
  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (init.body instanceof FormData) body = init.body;
  else if (init.body !== undefined && init.body !== null) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { method: init.method || 'GET', headers, body, signal: init.signal });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (typeof j?.detail === 'string') detail = j.detail;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Fetches an authenticated file (progress photos) and returns an object URL. */
export async function apiBlobUrl(path: string): Promise<string> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
  return URL.createObjectURL(await res.blob());
}
