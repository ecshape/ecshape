import { API_BASE_URL } from '@/config/api';

/** Small typed client for the trainer studio endpoints (/api/studio). */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${API_BASE_URL}/studio${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = typeof body.detail === 'string' ? body.detail : detail;
    } catch {
      /* not json */
    }
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
export interface Lead {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  goal?: string | null;
  program?: string | null;
  message?: string | null;
  lang?: string | null;
  source?: string | null;
  status: LeadStatus;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type QaStatus = 'new' | 'in_progress' | 'done' | 'cancelled';
export type QaPriority = 'low' | 'normal' | 'high';
export interface QaTicket {
  id: number;
  title: string;
  body?: string | null;
  page?: string | null;
  priority: QaPriority;
  status: QaStatus;
  created_at?: string | null;
  updated_at?: string | null;
  comment_count: number;
  comments?: { id: number; body: string; author?: string | null; created_at?: string | null }[];
}

export interface SeoSettings {
  pages?: Record<string, { title?: string; description?: string; keywords?: string; image?: string }>;
  social?: { instagram?: string; whatsapp?: string };
  analytics_id?: string;
}

export interface AgentTurn {
  role: 'user' | 'assistant';
  content: string;
}
export interface AgentReply {
  reply: string;
  actions: { tool: string; input: Record<string, unknown> }[];
}

export const studioApi = {
  overview: () => request<{ clients: number; leads_new: number; leads_open: number; qa_open: number }>('/overview'),

  leads: (status?: string) => request<Lead[]>(`/leads${status ? `?status=${status}` : ''}`),
  createLead: (data: Partial<Lead>) => request<Lead>('/leads', { method: 'POST', body: JSON.stringify(data) }),
  updateLead: (id: number, data: Partial<Lead>) => request<Lead>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLead: (id: number) => request<void>(`/leads/${id}`, { method: 'DELETE' }),

  siteContent: (lang: string) => request<{ content: Record<string, unknown>; brand: Record<string, unknown> }>(`/site/${lang}`),
  saveSiteContent: (lang: string, content: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/site/${lang}`, { method: 'PUT', body: JSON.stringify({ content }) }),

  seo: () => request<SeoSettings>('/seo'),
  saveSeo: (data: SeoSettings) => request<SeoSettings>('/seo', { method: 'PUT', body: JSON.stringify(data) }),

  tickets: (status?: string) => request<QaTicket[]>(`/qa${status ? `?status=${status}` : ''}`),
  ticket: (id: number) => request<QaTicket>(`/qa/${id}`),
  createTicket: (data: Partial<QaTicket>) => request<QaTicket>('/qa', { method: 'POST', body: JSON.stringify(data) }),
  updateTicket: (id: number, data: Partial<QaTicket>) => request<QaTicket>(`/qa/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  commentTicket: (id: number, body: string) => request<QaTicket>(`/qa/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  deleteTicket: (id: number) => request<void>(`/qa/${id}`, { method: 'DELETE' }),

  agentStatus: () => request<{ configured: boolean }>('/agent/status'),
  agentChat: (messages: AgentTurn[], lang: string, page?: string) =>
    request<AgentReply>('/agent/chat', { method: 'POST', body: JSON.stringify({ messages, lang, page }) }),
};
