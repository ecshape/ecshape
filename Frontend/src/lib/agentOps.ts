/**
 * Actions Agent EC can carry out (modelled on Agent LE): the agent proposes them, the trainer sees each
 * one in plain words and confirms, then it runs on the right page while they watch.
 * Navigation and "open a form" run immediately. Nothing is ever sent to a client or a prospect.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { scrollBehavior } from '@/lib/motion';
import type { UiEffect, UiStep } from '@/lib/agentUi';

export type AgentForm = 'prospect' | 'qa_ticket' | 'client' | 'article';

export type AgentOp =
  | { kind: 'navigate'; href: string; label: string }
  | { kind: 'ui.open-form'; form: AgentForm }
  | { kind: 'lead.update'; leadId: number; leadName: string; status?: string | null; note?: string | null }
  | { kind: 'lead.create'; lead: { name: string; phone?: string; email?: string; goal?: string; program?: string; notes?: string } }
  | { kind: 'qa.create'; ticket: { title: string; body?: string; page?: string; priority?: string } }
  | { kind: 'qa.update'; ticketId: number; title?: string; status?: string | null; priority?: string | null }
  | { kind: 'site.text'; lang: string; path: string; value: string }
  | { kind: 'seo.page'; lang: string; title?: string; description?: string; keywords?: string }
  | { kind: 'article.save'; article: { id?: string | null; lang: string; title: string; slug?: string; excerpt?: string; contentHtml: string;
      focusKeyword?: string; seoTitle?: string; metaDescription?: string; category?: string; faq?: { q: string; a: string }[]; status: 'draft' | 'published' } }
  | { kind: 'page.save'; page: { id?: string | null; lang: string; title: string; slug?: string; intro?: string; contentHtml: string; cta?: boolean;
      seo?: { title?: string; description?: string }; status: 'draft' | 'published' } }
  | { kind: 'site.menu'; lang: string; items: { label: string; href: string }[] }
  | { kind: 'site.layout'; order?: string[]; hidden?: string[] }
  | { kind: 'site.link'; path: string; target: string }
  /** Steps on the open page (click, type, pick, press…) the agent does while the trainer watches (agentUi.ts). */
  | { kind: 'ui.task'; summary: string; effect: UiEffect; steps: UiStep[]; continueAfter?: boolean };

/** What the server returned after an action ran (address of the new page / article). */
export type OpResult = { article?: { slug: string; lang: string; status: string }; page?: { slug: string; lang: string; status: string } };

/** Site actions keep a snapshot first: the trainer can undo them if the result is not what they wanted. */
export const opCanUndo = (op: AgentOp) =>
  ['site.text', 'seo.page', 'article.save', 'page.save', 'site.menu', 'site.layout', 'site.link'].includes(op.kind);

/** Public address where the trainer can look at the result. */
export function opViewHref(op: AgentOp, result?: OpResult | null): string | null {
  if (op.kind === 'article.save') {
    const a = result?.article;
    return a && a.status === 'published' ? `/blog/${a.slug}?lang=${a.lang}` : '/studio/seo';
  }
  if (op.kind === 'page.save') {
    const p = result?.page;
    return p ? `/p/${p.slug}?lang=${p.lang}${p.status === 'published' ? '' : '&preview=1'}` : null;
  }
  if (op.kind === 'site.menu') return `/home?lang=${op.lang}`;
  if (op.kind === 'site.layout' || op.kind === 'site.link' || op.kind === 'site.text') return '/home';
  return null;
}

export type OpState = 'pending' | 'running' | 'done' | 'cancelled' | 'failed' | 'approved' | 'undone';

/** Open Agent EC with a pre-filled request (the trainer reads it, then sends). */
export const AGENT_ASK_EVENT = 'ec-agent:ask';
/** Agent EC opens a "new …" form on the current page. */
export const AGENT_OPEN_FORM_EVENT = 'ec-agent:open-form';
/** Emitted after Agent EC changed data: open pages reload what they show. */
export const AGENT_CHANGED_EVENT = 'ec-agent:changed';
/** Opens the SEO editor's AI writer with a topic and keyword. */
export const AGENT_NEW_ARTICLE_EVENT = 'ec-agent:new-article';

export function askAgent(prompt?: string) {
  window.dispatchEvent(new CustomEvent(AGENT_ASK_EVENT, { detail: { prompt } }));
}

/** Looking around (navigate, open a form, page steps with effect "none") runs at once; anything that changes data asks first. */
export const opAutoRun = (op: AgentOp) => op.kind === 'navigate' || op.kind === 'ui.open-form' || (op.kind === 'ui.task' && op.effect === 'none');
export const opNeedsConfirm = (op: AgentOp) => !opAutoRun(op);
export const opIsDanger = (op: AgentOp) =>
  (op.kind === 'lead.update' && op.status === 'lost') || (op.kind === 'site.layout' && (op.hidden?.length ?? 0) > 3) || (op.kind === 'ui.task' && op.effect === 'danger');

export function formHref(form: AgentForm) {
  if (form === 'article') return '/studio/seo';
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
    case 'article.save':
      return { path: '/studio/seo', selector: '[data-ec-board="seo"]' };
    case 'page.save':
    case 'site.menu':
    case 'site.layout':
    case 'site.link':
      return { path: '/studio/site', selector: '[data-ec-board="site"]' };
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
    case 'article.save':
      return t(op.article.status === 'published' ? 'agent.op.articlePublish' : 'agent.op.articleDraft', { title: op.article.title, lang: langName(op.article.lang) });
    case 'page.save':
      return t(op.page.status === 'published' ? 'agent.op.pagePublish' : 'agent.op.pageDraft', { title: op.page.title, lang: langName(op.page.lang), slug: op.page.slug || '…' });
    case 'site.menu':
      return op.items.length
        ? t('agent.op.menu', { lang: langName(op.lang), items: op.items.map((i) => i.label).join(' · ') })
        : t('agent.op.menuDefault', { lang: langName(op.lang) });
    case 'site.layout':
      return [
        op.order?.length ? t('agent.op.layoutOrder', { order: op.order.join(' → ') }) : '',
        op.hidden ? (op.hidden.length ? t('agent.op.layoutHidden', { hidden: op.hidden.join(', ') }) : t('agent.op.layoutAllShown')) : '',
      ].filter(Boolean).join(' ');
    case 'site.link':
      return op.target ? t('agent.op.link', { button: op.path, target: op.target }) : t('agent.op.linkDefault', { button: op.path });
    case 'ui.task':
      return op.summary || t('agent.task.default');
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
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
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

/**
 * Lets a page open its "new …" form when the agent asks: through the event (already on the page)
 * or through `?new=<form>` after a navigation.
 */
export function useAgentForm(form: AgentForm, open: () => void) {
  const location = useLocation();
  const navigate = useNavigate();
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<{ form?: AgentForm }>).detail?.form === form) openRef.current();
    };
    window.addEventListener(AGENT_OPEN_FORM_EVENT, onOpen);
    return () => window.removeEventListener(AGENT_OPEN_FORM_EVENT, onOpen);
  }, [form]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('new') !== form) return;
    openRef.current();
    params.delete('new');
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
  }, [form, location.pathname, location.search, navigate]);
}

/** Reloads page data after the agent changed something. */
export function useAgentChanged(reload: () => void) {
  const ref = useRef(reload);
  ref.current = reload;
  useEffect(() => {
    const on = () => ref.current();
    window.addEventListener(AGENT_CHANGED_EVENT, on);
    return () => window.removeEventListener(AGENT_CHANGED_EVENT, on);
  }, []);
}

/* ---------------------------------------------------------------- page bridge
 * A page can publish what it is working on (the SEO article editor) so the agent can act on it live. */

/** Changes proposed for the article open in the SEO editor. */
export type ArticlePatch = {
  title?: string;
  focus_keyword?: string;
  seo_title?: string;
  meta_description?: string;
  excerpt?: string;
  content_html?: string;
  faq?: { q: string; a: string }[];
};

export type ArticleBridge = {
  title: string;
  keyword: string;
  /** Article state sent to the agent as page context. */
  context: string;
  apply: (patch: ArticlePatch) => void;
};

let currentBridge: ArticleBridge | null = null;
const bridgeListeners = new Set<() => void>();

export function publishArticleBridge(bridge: ArticleBridge | null) {
  currentBridge = bridge;
  bridgeListeners.forEach((l) => l());
}

export function useArticleBridge() {
  return useSyncExternalStore(
    (cb) => {
      bridgeListeners.add(cb);
      return () => bridgeListeners.delete(cb);
    },
    () => currentBridge,
    () => null,
  );
}
