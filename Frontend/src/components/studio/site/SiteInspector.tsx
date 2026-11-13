/**
 * Inspector of the visual site editor: precise editing of what is selected on the page (text, photo, list item,
 * whole section). Every change goes through onSet / onList so it lands in the draft and streams to the preview.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Copy, Eye, EyeOff, ImageUp, Link2, Plus, RotateCcw, Sparkles, Trash2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getIn, parsePath } from '@/lib/siteContentOps';
import type { SiteContent } from '@/site/content';
import { isMultilinePath, type EcSelect } from '@/site/editProtocol';
import { SITE_SECTIONS, isSharedPath } from '@/site/sections';

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === 'object' && !Array.isArray(v);
export const humanize = (k: string) =>
  /^\d+$/.test(k) ? `#${Number(k) + 1}` : k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/(\D)(\d+)$/, '$1 $2');

export type ListOp = 'up' | 'down' | 'duplicate' | 'remove' | 'add';

/** Innermost list item that contains a path: "faq.items.2.q" -> "faq.items.2". */
export function itemPathOf(content: SiteContent, path: string): string | null {
  const parts = path.split('.');
  for (let i = parts.length; i >= 2; i--) {
    if (/^\d+$/.test(parts[i - 1]) && Array.isArray(getIn(content, parsePath(parts.slice(0, i - 1).join('.'))))) {
      return parts.slice(0, i).join('.');
    }
  }
  return null;
}

/** Photos are resized in the browser and stored with the site content (no separate upload service needed). */
export async function imageFileToDataUrl(file: File, max = 1600, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ------------------------------------------------------------------ fields */

const Label: React.FC<{ children: React.ReactNode; changed?: boolean }> = ({ children, changed }) => (
  <span className="ec-studio-label">
    {children}
    {changed && <i className="ec-studio-dot" aria-hidden />}
  </span>
);

const AutoText: React.FC<{ value: string; onChange: (v: string) => void; multiline: boolean; autoFocus?: boolean; dir?: string }> = ({ value, onChange, multiline, autoFocus, dir }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(320, el.scrollHeight + 2)}px`;
  }, [value]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <textarea
      ref={ref}
      dir={dir}
      className="ec-studio-input"
      rows={1}
      value={value}
      onChange={(e) => onChange(multiline ? e.target.value : e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') e.preventDefault();
      }}
    />
  );
};

interface ImageFieldProps {
  value: string;
  original?: string;
  shared?: boolean;
  onChange: (v: string) => void;
  pickSignal?: number;
}

export const ImageField: React.FC<ImageFieldProps> = ({ value, original, shared, onChange, pickSignal }) => {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (pickSignal) fileRef.current?.click();
  }, [pickSignal]);
  return (
    <div className="ec-studio-photo">
      <div className={cn('ec-studio-photo-frame', busy && 'is-busy')}>
        {value ? <img key={value.slice(0, 80)} src={value} alt="" /> : null}
        {busy && <span className="ec-studio-photo-busy">{t('mysite.studio.photo.preparing')}</span>}
      </div>
      <button type="button" className="ec-studio-btn is-primary is-block" onClick={() => fileRef.current?.click()} disabled={busy}>
        <ImageUp className="h-4 w-4" />
        {t('mysite.studio.photo.upload')}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          setError('');
          imageFileToDataUrl(file)
            .then(onChange)
            .catch(() => setError(t('mysite.studio.photo.failed')))
            .finally(() => setBusy(false));
        }}
      />
      <form
        className="ec-studio-url"
        onSubmit={(e) => {
          e.preventDefault();
          const v = url.trim();
          if (/^(https?:\/\/|\/)/.test(v)) {
            onChange(v);
            setUrl('');
          }
        }}
      >
        <Link2 className="h-4 w-4 flex-none opacity-60" />
        <input dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('mysite.studio.photo.url')} aria-label={t('mysite.studio.photo.url')} />
        <button type="submit" disabled={!url.trim()}>{t('mysite.studio.photo.apply')}</button>
      </form>
      {error && <p className="ec-studio-error">{error}</p>}
      {original && value !== original && (
        <button type="button" className="ec-studio-btn is-ghost is-block" onClick={() => onChange(original)}>
          <RotateCcw className="h-4 w-4" />
          {t('mysite.studio.photo.reset')}
        </button>
      )}
      {shared && <p className="ec-studio-note">{t('mysite.studio.photo.shared')}</p>}
    </div>
  );
};

interface EditorCtx {
  content: SiteContent;
  base: SiteContent;
  dir: string;
  onSet: (path: string, value: unknown, coalesce?: boolean) => void;
  onList: (listPath: string, op: ListOp, index: number) => void;
  focusPath?: string;
}

const ItemTools: React.FC<{ listPath: string; index: number; length: number; ctx: EditorCtx; compact?: boolean }> = ({ listPath, index, length, ctx, compact }) => {
  const { t } = useTranslation();
  const tools: [ListOp, React.ElementType, string, boolean][] = [
    ['up', ArrowUp, t('mysite.studio.items.moveUp'), index === 0],
    ['down', ArrowDown, t('mysite.studio.items.moveDown'), index >= length - 1],
    ['duplicate', Copy, t('mysite.studio.items.duplicate'), false],
    ['remove', Trash2, length <= 1 ? t('mysite.studio.items.keepOne') : t('mysite.studio.items.remove'), length <= 1],
  ];
  return (
    <span className={cn('ec-studio-itemtools', compact && 'is-compact')}>
      {tools.map(([op, Icon, label, disabled]) => (
        <button key={op} type="button" title={label} aria-label={label} disabled={disabled} className={op === 'remove' ? 'is-danger' : ''} onClick={() => ctx.onList(listPath, op, index)}>
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </span>
  );
};

const ValueEditor: React.FC<{ path: string; ctx: EditorCtx; label?: string }> = ({ path, ctx, label }) => {
  const { t } = useTranslation();
  const parts = parsePath(path);
  const value = getIn(ctx.content, parts);
  const base = getIn(ctx.base, parts);
  const key = String(parts[parts.length - 1]);
  const name = label ?? humanize(key);
  const changed = JSON.stringify(value) !== JSON.stringify(base);

  if (key === 'image' && typeof value === 'string') {
    return (
      <div className="ec-studio-field">
        <Label changed={changed}>{name}</Label>
        <ImageField value={value} original={typeof base === 'string' ? base : undefined} shared={isSharedPath(path)} onChange={(v) => ctx.onSet(path, v)} />
      </div>
    );
  }
  if (typeof value === 'string') {
    return (
      <label className={cn('ec-studio-field', ctx.focusPath === path && 'is-focus')}>
        <Label changed={changed}>{name}</Label>
        <AutoText dir={ctx.dir} value={value} multiline={isMultilinePath(path) || value.length > 90} onChange={(v) => ctx.onSet(path, v, true)} autoFocus={ctx.focusPath === path} />
      </label>
    );
  }
  if (typeof value === 'number') {
    return (
      <label className="ec-studio-field">
        <Label changed={changed}>{name}</Label>
        <input className="ec-studio-input" type="number" value={value} onChange={(e) => ctx.onSet(path, Number(e.target.value) || 0, true)} />
      </label>
    );
  }
  if (typeof value === 'boolean') {
    return (
      <label className="ec-studio-check">
        <input type="checkbox" checked={value} onChange={(e) => ctx.onSet(path, e.target.checked)} />
        <span>{name}</span>
      </label>
    );
  }
  if (Array.isArray(value)) return <ListEditor path={path} ctx={ctx} label={name} changed={changed} />;
  if (isObj(value)) {
    return (
      <div className="ec-studio-fields">
        {Object.keys(value).map((k) => (
          <ValueEditor key={k} path={`${path}.${k}`} ctx={ctx} />
        ))}
      </div>
    );
  }
  // Optional field absent from this item (e.g. a card without "big"): offer to add it.
  if (value === undefined && typeof base === 'string') {
    return (
      <button type="button" className="ec-studio-btn is-ghost is-sm" onClick={() => ctx.onSet(path, base)}>
        <Plus className="h-3.5 w-3.5" />
        {name}
      </button>
    );
  }
  return value === undefined ? null : <p className="ec-studio-note">{t('mysite.studio.content')}</p>;
};

const itemTitle = (item: Json, i: number) => {
  if (typeof item === 'string') return item;
  if (isObj(item)) {
    const v = item.title ?? item.name ?? item.q ?? item.label ?? item.text ?? item.from ?? item.value;
    if (v !== undefined && v !== '') return String(v);
  }
  return `#${i + 1}`;
};

const ListEditor: React.FC<{ path: string; ctx: EditorCtx; label: string; changed: boolean }> = ({ path, ctx, label, changed }) => {
  const { t } = useTranslation();
  const list = (getIn(ctx.content, parsePath(path)) as Json[]) || [];
  const [open, setOpen] = useState<number | null>(null);
  const strings = list.every((x) => typeof x === 'string');
  return (
    <div className="ec-studio-field">
      <Label changed={changed}>
        {label}
        <small>{t('mysite.studio.items.count', { count: list.length })}</small>
      </Label>
      <div className="ec-studio-list">
        {list.map((item, i) =>
          strings ? (
            <div key={i} className="ec-studio-listrow">
              <AutoText dir={ctx.dir} value={String(item)} multiline={false} onChange={(v) => ctx.onSet(`${path}.${i}`, v, true)} />
              <ItemTools listPath={path} index={i} length={list.length} ctx={ctx} compact />
            </div>
          ) : (
            <div key={i} className={cn('ec-studio-card', open === i && 'is-open')}>
              <div className="ec-studio-card-head">
                <button type="button" className="ec-studio-card-toggle" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  <span className="ec-studio-card-idx">{i + 1}</span>
                  <span className="truncate">{itemTitle(item, i)}</span>
                  <ChevronDown className="ec-studio-chev h-4 w-4" />
                </button>
                <ItemTools listPath={path} index={i} length={list.length} ctx={ctx} compact />
              </div>
              <div className="ec-studio-collapse">
                <div>{open === i && <div className="ec-studio-card-body"><ValueEditor path={`${path}.${i}`} ctx={ctx} /></div>}</div>
              </div>
            </div>
          ),
        )}
        <button type="button" className="ec-studio-add" onClick={() => { ctx.onList(path, 'add', list.length); setOpen(list.length); }}>
          <Plus className="h-4 w-4" />
          {t('mysite.studio.items.add')}
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ panel */

export interface SiteInspectorProps {
  select: EcSelect | null;
  content: SiteContent;
  base: SiteContent;
  dir: 'rtl' | 'ltr';
  sectionLabel: (key: string) => string;
  hidden: Set<string>;
  pickSignal: number;
  onSet: (path: string, value: unknown, coalesce?: boolean) => void;
  onList: (listPath: string, op: ListOp, index: number) => void;
  onSelect: (select: EcSelect | null, scroll?: boolean) => void;
  onToggleSection: (key: string) => void;
  onAgent: (prompt: string) => void;
  langName: string;
}

export const SiteInspector: React.FC<SiteInspectorProps> = (p) => {
  const { t } = useTranslation();
  const { select, content } = p;
  const Back = p.dir === 'rtl' ? ArrowRight : ArrowLeft;
  if (!select) return null;
  const ctx: EditorCtx = { content, base: p.base, dir: p.dir, onSet: p.onSet, onList: p.onList, focusPath: select.kind === 'text' ? select.path : undefined };
  const group = select.path.split('.')[0];
  const sectionKey = SITE_SECTIONS.find((s) => (s.groups as string[]).includes(group))?.key || group;
  const kindLabel = t(`mysite.studio.kinds.${select.kind}`);
  const title = select.kind === 'section' ? p.sectionLabel(select.path) : humanize(select.path.split('.').pop() || '');
  const sub = select.kind === 'section' ? kindLabel : `${kindLabel} · ${p.sectionLabel(sectionKey)}`;
  const itemPath = select.kind === 'section' ? null : itemPathOf(content, select.path);
  const listPath = itemPath ? itemPath.split('.').slice(0, -1).join('.') : null;
  const itemIndex = itemPath ? Number(itemPath.split('.').pop()) : -1;
  const listLen = listPath ? ((getIn(content, parsePath(listPath)) as unknown[]) || []).length : 0;
  const sectionDef = SITE_SECTIONS.find((s) => s.key === select.path);
  const textValue = select.kind === 'text' ? String(getIn(content, parsePath(select.path)) ?? '') : '';

  return (
    <div className="ec-studio-inspector-inner" key={`${select.kind}:${select.path}`}>
      <div className="ec-studio-panel-head">
        {select.kind !== 'section' && (
          <button type="button" className="ec-studio-icon" onClick={() => p.onSelect({ kind: 'section', path: sectionKey }, true)} title={t('mysite.studio.backToSection')} aria-label={t('mysite.studio.backToSection')}>
            <Back className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <strong>{title}</strong>
          <span>{sub}</span>
        </div>
        <button type="button" className="ec-studio-icon" onClick={() => p.onSelect(null)} title={t('mysite.studio.close')} aria-label={t('mysite.studio.close')}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="ec-studio-inspector-body">
        {select.kind === 'text' && (
          <>
            <ValueEditor path={select.path} ctx={ctx} label={t('mysite.studio.content')} />
            {isMultilinePath(select.path) && <p className="ec-studio-note">{t('mysite.studio.multiline')}</p>}
          </>
        )}

        {select.kind === 'image' && (
          <ImageField
            value={String(getIn(content, parsePath(select.path)) ?? '')}
            original={String(getIn(p.base, parsePath(select.path)) ?? '')}
            shared={isSharedPath(select.path)}
            pickSignal={p.pickSignal}
            onChange={(v) => p.onSet(select.path, v)}
          />
        )}

        {itemPath && listPath && (
          <div className="ec-studio-group">
            <div className="ec-studio-group-head">
              <span>{select.kind === 'item' ? t('mysite.studio.kinds.item') : t('mysite.studio.inThisItem')}</span>
              <ItemTools listPath={listPath} index={itemIndex} length={listLen} ctx={ctx} />
            </div>
            {select.kind !== 'text' || itemPath !== select.path ? <ValueEditor path={itemPath} ctx={{ ...ctx, focusPath: undefined }} /> : null}
          </div>
        )}

        {select.kind === 'section' && (
          <>
            {sectionDef && sectionDef.key !== 'hero' && (
              <button type="button" className="ec-studio-btn is-ghost is-block" onClick={() => p.onToggleSection(select.path)}>
                {p.hidden.has(select.path) ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {p.hidden.has(select.path) ? t('mysite.studio.show') : t('mysite.studio.hide')}
              </button>
            )}
            {(sectionDef ? sectionDef.groups : [select.path as keyof SiteContent]).map((g) => (
              <ValueEditor key={g} path={g} ctx={ctx} />
            ))}
          </>
        )}

        <button
          type="button"
          className="ec-studio-btn is-agent is-block"
          onClick={() =>
            p.onAgent(
              select.kind === 'text'
                ? t('mysite.studio.rewritePrompt', { lang: p.langName, path: select.path, text: textValue.slice(0, 400) })
                : t('mysite.studio.sectionPrompt', { lang: p.langName, section: p.sectionLabel(sectionKey) }),
            )
          }
        >
          <Sparkles className="h-4 w-4" />
          {t('mysite.studio.rewrite')}
        </button>
      </div>
    </div>
  );
};
