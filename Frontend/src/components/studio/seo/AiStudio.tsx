import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AgentEcIcon } from '@/components/studio/AgentEcIcon';
import { studioApi } from '@/lib/studioApi';
import { sanitizeArticleHtml } from '@/lib/seo/articles';
import { cn } from '@/lib/utils';
import type { SiteLang } from '@/site/content';

/* Live AI writing: brief → NDJSON stream → article appearing block by block */

export type ArticleBrief = { topic: string; keyword: string; notes: string; length: 'short' | 'standard' | 'long' };
export const BRIEF_LENGTHS: ArticleBrief['length'][] = ['short', 'standard', 'long'];

type Step = 'brief' | 'writing' | 'finishing';
const STEPS: Step[] = ['brief', 'writing', 'finishing'];

type MetaEvent = {
  type: 'meta';
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  tags: string[];
  focusKeyword: string;
  secondaryKeywords: string[];
  seoTitle: string;
  seoDescription: string;
  coverAlt: string;
};
type GenerateEvent =
  | { type: 'status'; step: Step; text: string }
  | MetaEvent
  | { type: 'block'; kind: string; html: string }
  | { type: 'faq'; items: { q: string; a: string }[] }
  | { type: 'error'; error: string }
  | { type: 'end'; engine: string };

export type GenerationResult = { meta: MetaEvent | null; html: string; faq: { q: string; a: string }[]; engine: string };

export type GenerationState = {
  running: boolean;
  step: Step | null;
  status: string;
  meta: MetaEvent | null;
  blocks: { kind: string; html: string }[];
  faq: { q: string; a: string }[];
  error: string | null;
};

const IDLE: GenerationState = { running: false, step: null, status: '', meta: null, blocks: [], faq: [], error: null };

export function useArticleGeneration(lang: SiteLang, onDone: (result: GenerationResult) => void) {
  const { t } = useTranslation();
  const [state, setState] = useState<GenerationState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  const errorText = (code: string) => t(`studio.seo.ai.error.${code}`, { defaultValue: code || t('studio.seo.ai.error.WRITER_FAILED') });

  async function start(brief: ArticleBrief, model?: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let current: GenerationState = { ...IDLE, running: true, step: 'brief', status: t('studio.seo.ai.connecting') };
    let engine = '';
    const commit = (next: GenerationState) => {
      current = next;
      setState(next);
    };
    commit(current);
    try {
      const res = await studioApi.generateArticle(
        {
          ...brief,
          lang,
          model,
          statuses: { brief: t('studio.seo.ai.status.brief'), writing: t('studio.seo.ai.status.writing'), finishing: t('studio.seo.ai.status.finishing') },
        },
        controller.signal,
      );
      if (!res.ok || !res.body) {
        const json = (await res.json().catch(() => null)) as { detail?: string } | null;
        commit({ ...current, running: false, error: json?.detail || t('studio.seo.ai.error.start') });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const apply = (event: GenerateEvent) => {
        if (event.type === 'status') commit({ ...current, step: event.step, status: event.text });
        else if (event.type === 'meta') commit({ ...current, meta: event });
        else if (event.type === 'block') commit({ ...current, blocks: [...current.blocks, { kind: event.kind, html: event.html }] });
        else if (event.type === 'faq') commit({ ...current, faq: event.items });
        else if (event.type === 'error') commit({ ...current, error: errorText(event.error) });
        else if (event.type === 'end') engine = event.engine;
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl = buffer.indexOf('\n');
        while (nl >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) {
            try {
              apply(JSON.parse(line) as GenerateEvent);
            } catch {
              /* incomplete line */
            }
          }
          nl = buffer.indexOf('\n');
        }
      }
      commit({ ...current, running: false, step: current.error ? current.step : 'finishing' });
      if (current.blocks.length) onDone({ meta: current.meta, html: current.blocks.map((b) => b.html).join('\n'), faq: current.faq, engine });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        commit({ ...current, running: false, error: t('studio.seo.ai.stopped') });
        return;
      }
      commit({ ...current, running: false, error: t('studio.seo.ai.error.connection') });
    }
  }

  const stop = () => abortRef.current?.abort();
  const reset = () => setState(IDLE);
  return { state, start, stop, reset };
}

interface AiBriefCardProps {
  ready: boolean;
  engine?: string;
  initialTopic?: string;
  initialKeyword?: string;
  onStart: (brief: ArticleBrief) => void;
  onSkip: () => void;
}

export const AiBriefCard = ({ ready, engine, initialTopic, initialKeyword, onStart, onSkip }: AiBriefCardProps) => {
  const { t } = useTranslation();
  const [brief, setBrief] = useState<ArticleBrief>({ topic: initialTopic || '', keyword: initialKeyword || '', notes: '', length: 'standard' });

  return (
    <section className="ec-ai-brief" aria-label={t('studio.seo.ai.title')}>
      <div className="ec-ai-brief-head">
        <span className="ec-ai-orb" aria-hidden />
        <div>
          <h2>{t('studio.seo.ai.title')}</h2>
          <p>{t('studio.seo.ai.intro')}</p>
        </div>
      </div>
      {!ready ? (
        <p className="ec-ai-warn">
          {t('studio.seo.ai.noKey')} <Link to="/studio/preferences#ai-keys">{t('studio.seo.ai.addKey')}</Link>
        </p>
      ) : null}
      <form
        className="ec-ai-brief-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && brief.topic.trim()) onStart(brief);
        }}
      >
        <label className="ec-rm-field ec-ai-brief-topic">
          <span className="ec-rm-label">{t('studio.seo.ai.topic')}</span>
          <Input dir="auto" autoFocus value={brief.topic} placeholder={t('studio.seo.ai.topicPh')} onChange={(e) => setBrief({ ...brief, topic: e.target.value })} />
        </label>
        <label className="ec-rm-field">
          <span className="ec-rm-label">
            {t('studio.seo.rm.focusKeyword')} <small>({t('studio.seo.ai.optional')})</small>
          </span>
          <Input dir="auto" value={brief.keyword} placeholder={t('studio.seo.rm.focusKeywordPh')} onChange={(e) => setBrief({ ...brief, keyword: e.target.value })} />
        </label>
        <label className="ec-rm-field">
          <span className="ec-rm-label">
            {t('studio.seo.ai.notes')} <small>({t('studio.seo.ai.notesHint')})</small>
          </span>
          <Textarea dir="auto" rows={2} value={brief.notes} placeholder={t('studio.seo.ai.notesPh')} onChange={(e) => setBrief({ ...brief, notes: e.target.value })} />
        </label>
        <div className="ec-ai-lengths" role="radiogroup" aria-label={t('studio.seo.ai.length')}>
          {BRIEF_LENGTHS.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={brief.length === l} className={cn(brief.length === l && 'is-active')} onClick={() => setBrief({ ...brief, length: l })}>
              {t(`studio.seo.ai.lengths.${l}`)} <small>{t(`studio.seo.ai.lengthWords.${l}`)}</small>
            </button>
          ))}
        </div>
        <div className="ec-ai-brief-actions">
          <Button type="submit" disabled={!ready || !brief.topic.trim()}>
            <Wand2 />
            {t('studio.seo.ai.write')}
          </Button>
          <Button type="button" variant="ghost" onClick={onSkip}>
            {t('studio.seo.ai.myself')}
          </Button>
          {ready && engine ? <span className="ec-ai-engine">{t('studio.seo.ai.engine', { engine })}</span> : null}
        </div>
      </form>
    </section>
  );
};

/** The article being written, shown in the blog template (hero, blocks, FAQ). */
export const LiveArticleCanvas = ({ state, onStop }: { state: GenerationState; onStop: () => void }) => {
  const { t } = useTranslation();
  const words = state.blocks.map((b) => b.html.replace(/<[^>]+>/g, ' ')).join(' ').split(/\s+/).filter(Boolean).length;
  const stepIndex = STEPS.findIndex((s) => s === state.step);
  const done = !state.running && !state.error;
  return (
    <div className="ec-ai-live">
      <aside className="ec-ai-live-steps" aria-live="polite">
        <strong>
          <AgentEcIcon size="sm" busy={state.running} />
          {state.running ? t('studio.seo.ai.writing') : state.error ? t('studio.seo.ai.interrupted') : t('studio.seo.ai.ready')}
        </strong>
        <ol>
          {STEPS.map((s, i) => (
            <li key={s} className={cn(i < stepIndex || done ? 'is-done' : i === stepIndex ? 'is-active' : undefined)}>
              {t(`studio.seo.ai.steps.${s}`)}
            </li>
          ))}
        </ol>
        <p>
          {state.status}
          <br />
          {t('studio.seo.ai.progress', { words, blocks: state.blocks.length })}
        </p>
        {state.error ? <p className="ec-ai-warn">{state.error}</p> : null}
        {state.running ? (
          <Button size="sm" variant="outline" onClick={onStop}>
            {t('studio.seo.ai.stop')}
          </Button>
        ) : null}
      </aside>
      <div className="ec-ai-live-page">
        <header className="ec-ai-live-hero">
          {state.meta?.category ? <span className="ec-ai-live-cat">{t(`studio.seo.categories.${state.meta.category}`, { defaultValue: state.meta.category })}</span> : <span className="ec-ai-skel is-chip" />}
          {state.meta?.title ? <h1 className="ec-ai-appear" dir="auto">{state.meta.title}</h1> : <span className="ec-ai-skel is-title" />}
          {state.meta?.excerpt ? <p className="ec-ai-appear" dir="auto">{state.meta.excerpt}</p> : <span className="ec-ai-skel is-line" />}
          <div className="ec-ai-live-meta">
            <span>{t('studio.seo.ai.today')}</span>
            <span>{t('studio.seo.readMinutes', { count: Math.max(1, Math.round(words / 220)) })}</span>
          </div>
        </header>
        <div className="ec-article-body ec-ai-live-content" dir="auto">
          {state.blocks.map((b, i) => (
            <div key={i} className={cn('ec-ai-block', `is-${b.kind}`)} dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(b.html) }} />
          ))}
          {state.running ? <span className="ec-ai-caret" aria-hidden /> : null}
        </div>
        {state.faq.length ? (
          <section className="ec-ai-live-faq ec-ai-appear">
            <h2>{t('studio.seo.faqHeading')}</h2>
            {state.faq.map((f) => (
              <details key={f.q} open>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
};
