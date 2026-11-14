/**
 * Inline Agent EC draft (#22): a small Agent EC button in the top inline-end corner of a studio text box.
 * One click asks /api/studio/agent/draft for a text written with the context of the record (prospect, QA ticket,
 * SEO fields, site text). The server picks the model for the task (fast model for short texts, strongest for long
 * ones). While drafting the box shimmers; once inserted, an "Undo" chip restores what was there before.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Undo2, X } from 'lucide-react';
import '@/i18n/ticketsStudio';
import '@/styles/agent-draft.css';
import { AgentEcIcon } from '@/components/studio/AgentEcIcon';
import { studioApi, type AgentDraftKind } from '@/lib/studioApi';
import { cn } from '@/lib/utils';

type Props = {
  kind: AgentDraftKind;
  /** Which text of the record: reply, notes, body, comment, title, description, excerpt, intro, text… */
  field: string;
  contextId?: string | number | null;
  /** Small flat context shown next to the box (other field values) */
  extra?: Record<string, string | number | boolean | null | undefined>;
  value: string;
  onChange: (text: string) => void;
  /** Output language; defaults to the portal language */
  lang?: string;
  /** The text box itself (Textarea / Input). It gets extra inline-end padding for the button. */
  children: React.ReactElement;
  className?: string;
  /** Single-line inputs: centre the button vertically */
  inline?: boolean;
};

/** Plain text of an HTML fragment, clipped (context for drafts). */
export const plainText = (html?: string | null, max = 2500) => {
  const txt = (html || '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return txt.length > max ? `${txt.slice(0, max)}…` : txt;
};

export function AgentDraft({ kind, field, contextId, extra, value, onChange, lang, children, className, inline }: Props) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);
  const [error, setError] = useState<{ msg: string; settings: boolean } | null>(null);
  const [meta, setMeta] = useState('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Undo is offered until the text is edited by hand
  const inserted = useRef<string | null>(null);
  useEffect(() => {
    if (undo !== null && inserted.current !== null && value !== inserted.current) {
      setUndo(null);
      inserted.current = null;
    }
  }, [value, undo]);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const clean: Record<string, string | number | boolean> = {};
      Object.entries(extra || {}).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') clean[k] = v;
      });
      const res = await studioApi.agentDraft({
        kind,
        field,
        context_id: contextId === null || contextId === undefined ? undefined : String(contextId),
        lang: (lang || i18n.language || 'he').slice(0, 2),
        current: value || undefined,
        extra: clean,
      });
      if (!alive.current) return;
      if (!res.ok || !res.text) {
        const noKey = /no ai key/i.test(res.error || '');
        setError({ msg: noKey ? t('tix.draft.noKey') : res.error || t('tix.draft.failed'), settings: noKey || !!res.fix?.href });
        return;
      }
      setUndo(value);
      inserted.current = res.text;
      onChange(res.text);
      setMeta(res.model || '');
    } catch (e) {
      if (alive.current) setError({ msg: (e as Error).message || t('tix.draft.failed'), settings: false });
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const child = React.cloneElement(children, {
    className: cn(children.props.className, 'ec-draft-input'),
    'aria-busy': busy || undefined,
    readOnly: busy || children.props.readOnly,
  });

  return (
    <div className={cn('ec-draft', inline && 'is-inline', busy && 'is-busy', className)}>
      {child}
      {busy && <span className="ec-draft-shimmer" aria-hidden />}
      <button
        type="button"
        className="ec-draft-btn"
        onClick={run}
        disabled={busy}
        aria-label={value ? t('tix.draft.improve') : t('tix.draft.write')}
        title={value ? t('tix.draft.improve') : t('tix.draft.write')}
      >
        <AgentEcIcon size="xs" busy={busy} />
      </button>
      {(undo !== null || error) && (
        <div className="ec-draft-bar" role="status" aria-live="polite">
          {error ? (
            <>
              <span className="ec-draft-err">{error.msg}</span>
              {error.settings && <Link to="/studio/settings#ai-keys" className="ec-draft-link">{t('tix.draft.openSettings')}</Link>}
              <button type="button" className="ec-draft-x" onClick={() => setError(null)} aria-label={t('tix.common.close')}><X size={12} /></button>
            </>
          ) : (
            <>
              <span className="ec-draft-meta">{t('tix.draft.done')}{meta ? ` · ${meta}` : ''}</span>
              <button
                type="button"
                className="ec-draft-undo"
                onClick={() => {
                  onChange(undo || '');
                  setUndo(null);
                  inserted.current = null;
                }}
              >
                <Undo2 size={12} />
                {t('tix.draft.undo')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AgentDraft;
