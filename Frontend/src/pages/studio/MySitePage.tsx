/**
 * Studio -> My site.
 *  - Hub: the live site in a scaled thumbnail, its sections (show / hide), and the way into the editor.
 *  - Editor (?edit=1): full screen. The real site runs in an iframe in edit mode (site/editBridge.ts): the trainer
 *    types directly on the page, clicks photos to replace them, hides or moves sections from the page itself.
 *    The inspector on the side edits whatever is selected precisely (lists, photos, every field of a section).
 *    Drafts are kept in this browser for the three languages; "Publish" sends every changed language at once.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EcSpinner } from '@/components/brand/EcLoader';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown, ArrowUp, Check, ExternalLink, Eye, EyeOff, Globe, Monitor, MousePointerClick, Paintbrush, Pencil,
  PanelLeft, PanelRight, Redo2, RotateCcw, Smartphone, Sparkles, Tablet, Undo2, X,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { StudioHeader } from '@/components/studio/StudioHeader';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AgentEcIcon } from '@/components/studio/AgentEcIcon';
import { SiteInspector, type ListOp } from '@/components/studio/site/SiteInspector';
import { hasStoredDrafts, useSiteDraft, type SiteDraftApi } from '@/components/studio/site/useSiteDraft';
import { askAgent, useAgentChanged } from '@/lib/agentOps';
import { getIn, parsePath } from '@/lib/siteContentOps';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { SITE_LANGS, toSiteLang, type SiteLang } from '@/site/content';
import {
  EC_EDIT_PARAM, EC_EDIT_SOURCE, EC_PREVIEW_PARAM, isEcEditMessage, type EcChildMsg, type EcEditMode, type EcFrameLabels,
  type EcParentPayload, type EcSelect,
} from '@/site/editProtocol';
import { GLOBAL_GROUPS, SITE_SECTIONS, hiddenSections, sectionOfPath, sectionOrder, type SectionKey } from '@/site/sections';
import '@/styles/my-site.css';
import '@/i18n/ticketsStudio';

const LANG_LABEL: Record<SiteLang, string> = { he: 'עברית', en: 'English', fr: 'Français' };
type Device = 'desktop' | 'tablet' | 'mobile';
/** Real viewport widths: the page is rendered at this width and scaled down to fit the stage (#11). */
const DEVICE_WIDTH: Record<Device, number> = { desktop: 1440, tablet: 820, mobile: 390 };
const PANELS_KEY = 'ec-ms-panels';

function readPanels(): { side: boolean; insp: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(PANELS_KEY) || '{}');
    return { side: v.side !== false, insp: v.insp !== false };
  } catch {
    return { side: true, insp: true };
  }
}

/** Fits a device of `width` CSS px into the stage box: returns the scale and the frame height in device px. */
function useFit(box: React.RefObject<HTMLDivElement>, width: number) {
  const [fit, setFit] = useState({ scale: 1, w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setFit({ scale: Math.min(1, w / width), w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, width]);
  return fit;
}
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function useSectionLabel() {
  const { t } = useTranslation();
  return useCallback((key: string) => t(`studio.site.sections.${key}`, { defaultValue: key }), [t]);
}

/* =================================================================== hub */

const LiveThumb: React.FC<{ lang: SiteLang; version: number }> = ({ lang, version }) => {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1440));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="ec-ms-thumb" aria-hidden>
      <iframe
        key={`${lang}:${version}`}
        title="preview"
        tabIndex={-1}
        src={`/home?${EC_PREVIEW_PARAM}=1&lang=${lang}`}
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  );
};

const Hub: React.FC<{ draft: SiteDraftApi; onEdit: (select?: EcSelect) => void }> = ({ draft, onEdit }) => {
  const { t, i18n } = useTranslation();
  const label = useSectionLabel();
  const [lang, setLang] = useState<SiteLang>(toSiteLang(i18n.language));
  const layout = draft.drafts[lang].layout;
  const order = sectionOrder(layout);
  const hidden = hiddenSections(layout);
  const unpublished = draft.dirty || hasStoredDrafts();

  return (
    <Layout currentPage="site">
      <div className="container mx-auto p-4 md:p-6">
        <StudioHeader
          eyebrow={t('studio.site.title')}
          title={t('mysite.home.title')}
          lead={t('mysite.home.body')}
          actions={
            <>
              <Button variant="outline" asChild>
                <a href={`/home?lang=${lang}`} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  {t('mysite.home.view')}
                </a>
              </Button>
              <Button onClick={() => onEdit()}>
                <Paintbrush />
                {t('mysite.home.customize')}
              </Button>
            </>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="ec-ms-card">
            <div className="ec-ms-browser">
              <span className="ec-ms-dots" aria-hidden><i /><i /><i /></span>
              <span className="ec-ms-url" dir="ltr"><Globe className="h-3.5 w-3.5" />{t('mysite.home.url')}</span>
              <span className={cn('ec-ms-badge', unpublished ? 'is-draft' : 'is-live')}>
                <i aria-hidden />
                {unpublished ? t('mysite.home.badgeDraft') : t('mysite.home.badgeLive')}
              </span>
            </div>
            <button type="button" className="ec-ms-thumb-btn" onClick={() => onEdit()} aria-label={t('mysite.home.customize')}>
              <LiveThumb lang={lang} version={JSON.stringify(draft.published[lang]).length} />
              <span className="ec-ms-thumb-cta"><Pencil className="h-4 w-4" />{t('mysite.home.customize')}</span>
            </button>
            <div className="ec-ms-card-foot">
              <span className="text-sm text-muted-foreground">
                {t('mysite.home.meta', { count: order.length, hidden: hidden.size })}
              </span>
              <div className="ec-ms-seg" role="tablist" aria-label={t('mysite.home.previewLang')}>
                {SITE_LANGS.map((l) => (
                  <button key={l} type="button" role="tab" aria-selected={lang === l} className={cn(lang === l && 'is-on')} onClick={() => setLang(l)}>
                    {LANG_LABEL[l]}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="ec-ms-card">
            <h2 className="ec-ms-h2">{t('mysite.home.sections')}</h2>
            <ol className="ec-ms-seclist">
              {order.map((key, i) => {
                const off = hidden.has(key);
                return (
                  <li key={key} className={cn(off && 'is-off')} style={{ ['--i' as string]: i }}>
                    <span className="ec-ms-secidx">{String(i + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{label(key)}</span>
                    <span className={cn('ec-ms-pill', off ? 'is-off' : 'is-on')}>
                      {off ? t('mysite.home.hiddenStatus') : t('mysite.home.visible')}
                    </span>
                    <button type="button" className="ec-ms-icon" onClick={() => onEdit({ kind: 'section', path: key })} title={t('mysite.home.edit')} aria-label={`${t('mysite.home.edit')} · ${label(key)}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </Layout>
  );
};

/* ================================================================ editor */

const SiteStudio: React.FC<{ draft: SiteDraftApi; initialSelect: EcSelect | null; onExit: () => void }> = ({ draft, initialSelect, onExit }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const label = useSectionLabel();
  const [lang, setLang] = useState<SiteLang>(toSiteLang(i18n.language));
  const [device, setDevice] = useState<Device>('desktop');
  const [mode, setMode] = useState<EcEditMode>('edit');
  const [select, setSelectState] = useState<EcSelect | null>(initialSelect);
  const [pickSignal, setPickSignal] = useState(0);
  const [frameReady, setFrameReady] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const stageBox = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<EcSelect | null>(initialSelect);
  const [panels, setPanelsState] = useState(readPanels);
  const setPanels = (next: { side: boolean; insp: boolean }) => {
    setPanelsState(next);
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };

  const content = draft.drafts[lang];
  const base = draft.published[lang];
  const order = sectionOrder(content.layout);
  const hidden = hiddenSections(content.layout);
  const uiDir: 'rtl' | 'ltr' = i18n.language?.startsWith('he') ? 'rtl' : 'ltr';
  const contentDir: 'rtl' | 'ltr' = lang === 'he' ? 'rtl' : 'ltr';

  const labels: EcFrameLabels = useMemo(
    () => ({
      sections: Object.fromEntries(SITE_SECTIONS.map((s) => [s.key, label(s.key)])),
      hide: t('mysite.studio.hide'),
      show: t('mysite.studio.show'),
      hidden: t('mysite.studio.hidden'),
      up: t('mysite.studio.moveUp'),
      down: t('mysite.studio.moveDown'),
      changePhoto: t('mysite.studio.photo.change'),
    }),
    [t, label],
  );

  const post = useCallback((msg: EcParentPayload) => {
    frame.current?.contentWindow?.postMessage({ source: EC_EDIT_SOURCE, ...msg }, window.location.origin);
  }, []);

  const setSelect = useCallback(
    (next: EcSelect | null, scroll = false) => {
      setSelectState(next);
      if (next) setPanelsState((p) => (p.insp ? p : { ...p, insp: true }));
      if (next && scroll) post({ type: 'scroll', select: next });
    },
    [post],
  );

  /* ---- draft operations */
  const setLayout = useCallback(
    (next: { order: string[]; hidden: string[] }) => draft.setValue(lang, 'layout', next),
    [draft, lang],
  );
  const toggleSection = useCallback(
    (key: string) => {
      if (key === 'hero') return;
      const h = new Set(hidden);
      if (h.has(key)) h.delete(key);
      else h.add(key);
      setLayout({ order, hidden: [...h] });
    },
    [hidden, order, setLayout],
  );
  const moveSection = useCallback(
    (key: string, dir: -1 | 1) => {
      const i = order.indexOf(key as SectionKey);
      const j = i + dir;
      if (i < 1 || j < 1 || j >= order.length) return; // the hero stays first
      const next = [...order];
      [next[i], next[j]] = [next[j], next[i]];
      setLayout({ order: next, hidden: [...hidden] });
    },
    [order, hidden, setLayout],
  );
  const onSet = useCallback((path: string, value: unknown, coalesce?: boolean) => draft.setValue(lang, path, value, { coalesce }), [draft, lang]);
  const onList = useCallback(
    (listPath: string, op: ListOp, index: number) => {
      const list = [...(((getIn(content, parsePath(listPath)) as unknown[]) || []))];
      if (op === 'up' && index > 0) [list[index - 1], list[index]] = [list[index], list[index - 1]];
      else if (op === 'down' && index < list.length - 1) [list[index + 1], list[index]] = [list[index], list[index + 1]];
      else if (op === 'duplicate') list.splice(index + 1, 0, clone(list[index]));
      else if (op === 'remove' && list.length > 1) list.splice(index, 1);
      else if (op === 'add' && list.length) list.push(clone(list[list.length - 1]));
      else return;
      draft.setValue(lang, listPath, list);
      if (op === 'remove' && select && select.path.startsWith(`${listPath}.${index}`)) {
        setSelect({ kind: 'section', path: sectionOfPath(listPath) || listPath.split('.')[0] });
      }
    },
    [content, draft, lang, select, setSelect],
  );

  /* ---- messages from the page */
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || ev.source !== frame.current?.contentWindow || !isEcEditMessage(ev.data)) return;
      const msg = ev.data as EcChildMsg;
      switch (msg.type) {
        case 'ready':
          setFrameReady(true);
          break;
        case 'select':
          setSelectState(msg.select);
          // Selecting on the page re-opens a collapsed inspector
          if (msg.select) setPanelsState((p) => (p.insp ? p : { ...p, insp: true }));
          break;
        case 'text':
          draft.setValue(lang, msg.path, msg.value, { coalesce: true });
          break;
        case 'pick-image':
          setSelectState({ kind: 'image', path: msg.path });
          setPickSignal((n) => n + 1);
          break;
        case 'section':
          if (msg.action === 'toggle') toggleSection(msg.key);
          else moveSection(msg.key, msg.action === 'up' ? -1 : 1);
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [draft, lang, toggleSection, moveSection]);

  /* ---- keep the page in sync with the draft */
  useEffect(() => {
    if (!frameReady) return;
    post({ type: 'sync', lang, content, select, mode, labels });
    if (pendingScroll.current) {
      post({ type: 'scroll', select: pendingScroll.current });
      pendingScroll.current = null;
    }
  }, [frameReady, lang, content, select, mode, labels, post]);

  // Changing language reloads the page in that language.
  useEffect(() => setFrameReady(false), [lang]);

  // Agent EC edited the site (site.text): take it in without losing the trainer's own edits.
  useAgentChanged(() => {
    void draft.refreshFromServer().then((changed) => changed && toast({ title: t('mysite.studio.agentUpdated') }));
  });

  // Undo / redo / deselect from the keyboard (not while typing in a field of the studio).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) draft.redo();
        else draft.undo();
      } else if (e.key === 'Escape') setSelectState(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft]);

  // The editor covers the portal: lock the page behind it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (draft.restored) toast({ title: t('mysite.studio.restored') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.restored]);

  const publish = async () => {
    setPublishing(true);
    try {
      await draft.publish();
      toast({ title: t('mysite.studio.publishedToast') });
    } catch (e) {
      toast({ title: t('mysite.studio.publishFailed'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setPublishing(false);
    }
  };

  const selectedSection = select ? (select.kind === 'section' ? select.path : sectionOfPath(select.path)) : null;
  const width = DEVICE_WIDTH[device];
  const fit = useFit(stageBox, width);
  const frameH = fit.scale ? fit.h / fit.scale : fit.h;

  return createPortal(
    <div className={cn('ec-ms-studio', mode === 'preview' && 'is-preview', !panels.side && 'no-side', !panels.insp && 'no-insp')} dir={uiDir}>
      {/* ---- top bar */}
      <header className="ec-ms-bar">
        <div className="ec-ms-bar-start">
          <button type="button" className="ec-ms-exit" onClick={onExit}>
            <X className="h-4 w-4" />
            <span className="ec-ms-label">{t('mysite.studio.exit')}</span>
          </button>
          <div className="ec-ms-bar-title">
            <strong>{t('mysite.studio.title')}</strong>
            <span className={cn('ec-ms-status', draft.dirty ? 'is-draft' : 'is-saved')}>
              <i aria-hidden />
              {draft.dirty ? t('mysite.studio.statusDraft') : t('mysite.studio.statusSaved')}
            </span>
          </div>
        </div>

        <div className="ec-ms-bar-mid">
          <div className="ec-ms-seg" role="tablist" aria-label={t('mysite.studio.language')}>
            {SITE_LANGS.map((l) => (
              <button key={l} type="button" role="tab" aria-selected={lang === l} className={cn(lang === l && 'is-on')} onClick={() => setLang(l)}>
                {LANG_LABEL[l]}
                {draft.dirtyLangs.includes(l) && <i className="ec-ms-dirtydot" aria-hidden />}
              </button>
            ))}
          </div>
          <div className="ec-ms-seg is-icons" role="tablist" aria-label={t('mysite.studio.devices.desktop')}>
            {([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
              <button key={d} type="button" role="tab" aria-selected={device === d} className={cn(device === d && 'is-on')} onClick={() => setDevice(d)} title={t(`mysite.studio.devices.${d}`)} aria-label={t(`mysite.studio.devices.${d}`)}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        <div className="ec-ms-bar-end">
          <button
            type="button"
            className={cn('ec-ms-icon ec-ms-panel-btn', panels.side && 'is-on')}
            onClick={() => setPanels({ ...panels, side: !panels.side })}
            aria-pressed={panels.side}
            title={t('tix.site.togglePages')}
            aria-label={t('tix.site.togglePages')}
          >
            {uiDir === 'rtl' ? <PanelRight className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </button>
          <button
            type="button"
            className={cn('ec-ms-icon ec-ms-panel-btn ec-ms-insp-btn', panels.insp && 'is-on')}
            onClick={() => setPanels({ ...panels, insp: !panels.insp })}
            aria-pressed={panels.insp}
            title={t('tix.site.toggleInspector')}
            aria-label={t('tix.site.toggleInspector')}
          >
            {uiDir === 'rtl' ? <PanelLeft className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
          </button>
          <button type="button" className="ec-ms-icon" onClick={draft.undo} disabled={!draft.canUndo} title={t('mysite.studio.undo')} aria-label={t('mysite.studio.undo')}>
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" className="ec-ms-icon" onClick={draft.redo} disabled={!draft.canRedo} title={t('mysite.studio.redo')} aria-label={t('mysite.studio.redo')}>
            <Redo2 className="h-4 w-4" />
          </button>
          <button type="button" className="ec-ms-icon" onClick={() => setConfirmDiscard(true)} disabled={!draft.dirty} title={t('mysite.studio.discard')} aria-label={t('mysite.studio.discard')}>
            <RotateCcw className="h-4 w-4" />
          </button>
          <button type="button" className="ec-ms-icon" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')} title={mode === 'edit' ? t('mysite.studio.preview') : t('mysite.studio.backToEdit')} aria-pressed={mode === 'preview'}>
            {mode === 'edit' ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </button>
          <a className="ec-ms-icon" href={`/home?lang=${lang}`} target="_blank" rel="noreferrer" title={t('mysite.studio.openSite')} aria-label={t('mysite.studio.openSite')}>
            <ExternalLink className="h-4 w-4" />
          </a>
          <button type="button" className="ec-ms-agent" onClick={() => askAgent()}>
            <AgentEcIcon size="xs" />
            <span className="ec-ms-label">{t('mysite.studio.agent')}</span>
          </button>
          <Button onClick={publish} disabled={!draft.dirty || publishing} className="ec-ms-publish">
            {publishing ? <EcSpinner mono /> : <Check />}
            {publishing ? t('mysite.studio.publishing') : draft.dirty ? t('mysite.studio.publish') : t('mysite.studio.published')}
          </Button>
        </div>
      </header>

      <div className="ec-ms-body">
        {/* ---- sections */}
        <aside className="ec-ms-side" aria-label={t('mysite.studio.sectionsTitle')}>
          <div className="ec-ms-side-head">
            <strong>{t('mysite.studio.sectionsTitle')}</strong>
            <span>{t('mysite.studio.pageGroup')}</span>
          </div>
          <ol className="ec-ms-tree">
            {order.map((key, i) => {
              const off = hidden.has(key);
              const fixed = key === 'hero';
              return (
                <li key={key} className={cn(selectedSection === key && 'is-active', off && 'is-off')}>
                  <button type="button" className="ec-ms-tree-name" onClick={() => setSelect({ kind: 'section', path: key }, true)}>
                    <span className="ec-ms-secidx">{String(i + 1).padStart(2, '0')}</span>
                    <span className="truncate">{label(key)}</span>
                  </button>
                  <span className="ec-ms-tree-tools">
                    {fixed ? (
                      <span className="ec-ms-fixed" title={t('mysite.studio.fixedFirst')}>{t('mysite.studio.fixedFirst')}</span>
                    ) : (
                      <>
                        <button type="button" onClick={() => moveSection(key, -1)} disabled={i <= 1} title={t('mysite.studio.moveUp')} aria-label={t('mysite.studio.moveUp')}><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => moveSection(key, 1)} disabled={i >= order.length - 1} title={t('mysite.studio.moveDown')} aria-label={t('mysite.studio.moveDown')}><ArrowDown className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => toggleSection(key)} title={off ? t('mysite.studio.show') : t('mysite.studio.hide')} aria-label={off ? t('mysite.studio.show') : t('mysite.studio.hide')}>
                          {off ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="ec-ms-side-head is-sub"><span>{t('mysite.studio.wholeSite')}</span></div>
          <ul className="ec-ms-tree">
            {GLOBAL_GROUPS.map((g) => (
              <li key={g} className={cn(selectedSection === null && select?.path === g && 'is-active')}>
                <button type="button" className="ec-ms-tree-name" onClick={() => setSelect({ kind: 'section', path: g })}>
                  <span className="truncate">{label(g)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="ec-ms-side-note">{t('mysite.studio.layoutShared')}</p>
        </aside>

        {/* ---- the page */}
        <main className={cn('ec-ms-stage', `is-${device}`)}>
          {/* The page renders at the real device width (1440 / 820 / 390 px) and is scaled down to fit (#11) */}
          <div ref={stageBox} className="ec-ms-fit">
            <div
              className="ec-ms-device"
              style={{ width: Math.round(width * fit.scale), height: fit.h || undefined }}
            >
              <iframe
                ref={frame}
                key={lang}
                title={t('mysite.studio.title')}
                src={`/home?${EC_EDIT_PARAM}=1&lang=${lang}`}
                style={{ width, height: frameH || '100%', transform: fit.scale < 1 ? `scale(${fit.scale})` : undefined }}
              />
              {!frameReady && (
                <div className="ec-ms-loading">
                  <EcSpinner className="h-5 w-5" mono />
                  <span>{t('mysite.studio.loading')}</span>
                </div>
              )}
            </div>
          </div>
          <p className="ec-ms-tip">
            <span className="ec-ms-scale" dir="ltr">{width}px · {Math.round(fit.scale * 100)}%</span>
            {mode === 'edit' && (
              <>
                <MousePointerClick className="h-4 w-4" />
                {t('mysite.studio.tip')}
              </>
            )}
          </p>
        </main>

        {/* ---- inspector */}
        <aside className={cn('ec-ms-inspector', select && 'is-open')} aria-label={t('mysite.studio.content')}>
          {select ? (
            <SiteInspector
              select={select}
              content={content}
              base={base}
              dir={contentDir}
              sectionLabel={label}
              hidden={hidden}
              pickSignal={pickSignal}
              onSet={onSet}
              onList={onList}
              onSelect={setSelect}
              onToggleSection={toggleSection}
              onAgent={(prompt) => askAgent(prompt)}
              langName={LANG_LABEL[lang]}
              lang={lang}
            />
          ) : (
            <div className="ec-ms-empty">
              <span className="ec-ms-empty-mark"><MousePointerClick className="h-6 w-6" /></span>
              <strong>{t('mysite.studio.emptyTitle')}</strong>
              <p>{t('mysite.studio.emptyBody')}</p>
              <button type="button" className="ec-studio-btn is-agent is-block" onClick={() => askAgent(t('mysite.studio.sectionPrompt', { lang: LANG_LABEL[lang], section: label('hero') }))}>
                <Sparkles className="h-4 w-4" />
                {t('mysite.studio.emptyNote')}
              </button>
            </div>
          )}
        </aside>
      </div>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('mysite.studio.discardTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('mysite.studio.discardBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('mysite.studio.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                draft.discard();
                setSelectState(null);
              }}
            >
              {t('mysite.studio.discardConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>,
    document.body,
  );
};

/* ================================================================== page */

const MySitePage = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const editing = params.get('edit') === '1';
  const draft = useSiteDraft();
  const [initialSelect, setInitialSelect] = useState<EcSelect | null>(null);

  const open = (select?: EcSelect) => {
    setInitialSelect(select || null);
    setParams({ edit: '1' });
  };
  const exit = () => setParams({}, { replace: false });

  if (editing && !draft.loaded) {
    return createPortal(
      <div className="ec-ms-studio">
        <div className="ec-ms-loading is-full">
          {draft.loadError ? (
            <>
              <span>{t('mysite.studio.loadFailed')}</span>
              <Button variant="outline" size="sm" onClick={() => void draft.reload()}>{t('mysite.studio.retry')}</Button>
              <Button variant="ghost" size="sm" onClick={exit}>{t('mysite.studio.exit')}</Button>
            </>
          ) : (
            <>
              <EcSpinner className="h-5 w-5" mono />
              <span>{t('mysite.studio.loading')}</span>
            </>
          )}
        </div>
      </div>,
      document.body,
    );
  }
  return (
    <>
      <Hub draft={draft} onEdit={open} />
      {editing && <SiteStudio draft={draft} initialSelect={initialSelect} onExit={exit} />}
    </>
  );
};

export default MySitePage;
