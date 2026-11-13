/**
 * Actions Agent EC can carry out (modelled on Agent LE): the agent proposes them, the trainer sees each
 * one in plain words and confirms, then it runs on the right page while they watch.
 * Navigation and "open a form" run immediately. Nothing is ever sent to a client or a prospect.
 */
import type { TFunction } from 'i18next';

export type AgentForm = 'prospect' | 'qa_ticket' | 'client';

export type AgentOp =
  | { kind: 'navigate'; href: string; label: string }
  | { kind: 'ui.open-form'; form: AgentForm }
  | { kind: 'lead.update'; leadId: number; leadName: string; status?: string | null; note?: string | null }
  | { kind: 'lead.create'; lead: { name: string; phone?: string; email?: string; goal?: string; program?: string; notes?: string } }
  | { kind: 'qa.create'; ticket: { title: string; body?: string; page?: string; priority?: string } }
  | { kind: 'qa.update'; ticketId: number; title?: string; status?: string | null; priority?: string | null }
  | { kind: 'site.text'; lang: string; path: string; value: string }
  | { kind: 'seo.page'; lang: string; title?: string; description?: string; keywords?: string };

export type OpState = 'pending' | 'running' | 'done' | 'cancelled' | 'failed';

/** Open Agent EC with a pre-filled request (the trainer reads it, then sends). */
export const AGENT_ASK_EVENT = 'ec-agent:ask';
/** Agent EC opens a "new …" form on the current page. */
export const AGENT_OPEN_FORM_EVENT = 'ec-agent:open-form';
/** Emitted after Agent EC changed data: open pages reload what they show. */
export const AGENT_CHANGED_EVENT = 'ec-agent:changed';

export function askAgent(prompt?: string) {
  window.dispatchEvent(new CustomEvent(AGENT_ASK_EVENT, { detail: { prompt } }));
}

export const opNeedsConfirm = (op: AgentOp) => op.kind !== 'navigate' && op.kind !== 'ui.open-form';
export const opAutoRun = (op: AgentOp) => op.kind === 'navigate' || op.kind === 'ui.open-form';
export const opIsDanger = (op: AgentOp) => op.kind === 'lead.update' && op.status === 'lost';

export function formHref(form: AgentForm) {
  return form === 'prospect' ? '/studio/prospects' : form === 'qa_ticket' ? '/studio/qa' : '/trainer-dashboard';
}

/** Page + element to show while an action runs (animated navigation + highlight). */
export function opTarget(op: AgentOp): { path: string; selector: string } | null {
  switch (op.kind) {
    case 'lead.update':
      return { path: '/studio/prospects', selector: `[data-lead-id="${op.leadId}"]` };
    case 'lead.create':
      return { path: '/studio/prospects', selector: '[data-ec-board="prospects"]' };
    case 'qa.update':
      return { path: '/studio/qa', selector: `[data-qa-id="${op.ticketId}"]` };
    case 'qa.create':
      return { path: '/studio/qa', selector: '[data-ec-board="qa"]' };
    case 'site.text':
      return { path: '/studio/site', selector: '[data-ec-board="site"]' };
    case 'seo.page':
      return { path: '/studio/seo', selector: '[data-ec-board="seo"]' };
    default:
      return null;
  }
}

/** One readable sentence for the confirmation card. */
export function opSummary(op: AgentOp, t: TFunction): string {
  const st = (s?: string | null) => (s ? t(`studio.prospects.status.${s}`) : '');
  const langName = (l: string) => t(`agent.lang.${l}`, l);
  switch (op.kind) {
    case 'navigate':
      return t('agent.op.navigate', { href: op.href });
    case 'ui.open-form':
      return t(`agent.op.form.${op.form}`);
    case 'lead.update':
      return [
        op.status ? t('agent.op.leadStatus', { name: op.leadName, status: st(op.status) }) : '',
        op.note ? t('agent.op.leadNote', { name: op.leadName, note: op.note }) : '',
      ].filter(Boolean).join(' ');
    case 'lead.create':
      return t('agent.op.leadCreate', { name: op.lead.name });
    case 'qa.create':
      return t('agent.op.qaCreate', { title: op.ticket.title, priority: t(`studio.qa.priorities.${op.ticket.priority || 'normal'}`) });
    case 'qa.update':
      return t('agent.op.qaUpdate', {
        title: op.title || `#${op.ticketId}`,
        change: [op.status ? t(`studio.qa.status.${op.status}`) : '', op.priority ? t(`studio.qa.priorities.${op.priority}`) : ''].filter(Boolean).join(' · '),
      });
    case 'site.text':
      return t('agent.op.siteText', { lang: langName(op.lang), path: op.path, value: op.value });
    case 'seo.page':
      return t('agent.op.seoPage', { lang: langName(op.lang), value: [op.title, op.description].filter(Boolean).join(' — ') });
  }
}

/** Scroll to an element and pulse it so the trainer sees what the agent is doing (waits for it after a navigation). */
export function spotlight(selector: string, timeoutMs = 10000) {
  const started = Date.now();
  const tick = () => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
      if (Date.now() - started < timeoutMs) window.setTimeout(tick, 150);
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('ec-agent-spotlight');
    void el.offsetWidth;
    el.classList.add('ec-agent-spotlight');
    window.setTimeout(() => el.classList.remove('ec-agent-spotlight'), 2600);
  };
  tick();
}

/** Progress line across the top of the page during a navigation started by the agent. */
export function travel() {
  const root = document.documentElement;
  root.classList.remove('ec-agent-traveling');
  void root.offsetWidth;
  root.classList.add('ec-agent-traveling');
  window.setTimeout(() => root.classList.remove('ec-agent-traveling'), 1100);
}

/** Visible text of the page (context sent to the agent), without the panel itself. */
export function pageSnapshot() {
  const root = document.querySelector<HTMLElement>('[data-ec-main]') || document.querySelector<HTMLElement>('main') || document.body;
  return (root.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 9000);
}

export function pageTitle() {
  return document.querySelector('[data-ec-main] h1, main h1')?.textContent?.trim() || document.title;
}

/** Suggested requests depending on the open page. */
export function quickPromptKeys(path: string): string {
  if (path.startsWith('/studio/prospects')) return 'prospects';
  if (path.startsWith('/studio/site')) return 'site';
  if (path.startsWith('/studio/seo')) return 'seo';
  if (path.startsWith('/studio/qa')) return 'qa';
  if (path.startsWith('/studio/settings')) return 'settings';
  if (path.startsWith('/client/')) return 'client';
  if (path.startsWith('/exercises') || path.startsWith('/meal-bank')) return 'banks';
  return 'dashboard';
}
