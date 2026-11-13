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
  author?: string | null;
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
  ok: boolean;
  reply?: string;
  actions?: import('./agentOps').AgentOp[];
  engine?: string;
  error?: string;
  fix?: { label: string; href: string } | null;
}
export interface AgentPage {
  path: string;
  title: string;
  snapshot: string;
  selection: string;
}
export interface AiProvider {
  id: string;
  label: string;
  product: string;
  placeholder: string;
  key_url: string;
  default_model: string;
  models: string[];
  base_url: string | null;
  needs_base_url?: boolean;
}
export interface AiKey {
  id: number;
  provider: string;
  product: string;
  label: string;
  model: string;
  base_url: string;
  last4: string;
  is_preferred: boolean;
  created_at?: string | null;
}
export interface AgentRecommendation {
  id: 'leads' | 'silent' | 'qa' | 'seo';
  count?: number;
  names?: string[];
  langs?: string[];
  href: string;
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

  agentStatus: () => request<{ configured: boolean; engine: string | null; source: string }>('/agent/status'),
  agentChat: (messages: AgentTurn[], lang: string, page: AgentPage, provider: string) =>
    request<AgentReply>('/agent/chat', { method: 'POST', body: JSON.stringify({ messages, lang, page, provider }) }),
  agentExecute: (op: import('./agentOps').AgentOp) => request<{ ok: boolean }>('/agent/execute', { method: 'POST', body: JSON.stringify({ op }) }),
  agentRecommendations: () => request<AgentRecommendation[]>('/agent/recommendations'),

  aiProviders: () => request<AiProvider[]>('/ai-providers'),
  aiKeys: () => request<AiKey[]>('/ai-keys'),
  addAiKey: (data: { api_key: string; provider?: string; model?: string; base_url?: string; label?: string }) =>
    request<AiKey>('/ai-keys', { method: 'POST', body: JSON.stringify(data) }),
  updateAiKey: (id: number, data: { api_key?: string; model?: string; base_url?: string; label?: string }) =>
    request<AiKey>(`/ai-keys/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  testAiKey: (id: number) => request<{ ok: boolean; engine?: string; error?: string }>(`/ai-keys/${id}/test`, { method: 'POST' }),
  preferAiKey: (id: number) => request<{ ok: boolean }>(`/ai-keys/${id}/prefer`, { method: 'POST' }),
  deleteAiKey: (id: number) => request<void>(`/ai-keys/${id}`, { method: 'DELETE' }),
};
