import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ExternalLink, Plus, RotateCcw, Save, Trash2, Eye, EyeOff } from 'lucide-react';
import Layout from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { studioApi } from '@/lib/studioApi';
import { DEFAULT_CONTENT, SITE_LANGS, mergeContent, type SiteLang } from '@/site/content';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const humanize = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/\d+$/, (n) => ` ${n}`);

/** Only what differs from the defaults is stored, so future default improvements still reach the site. */
function diff(base: Json, value: Json): Json | undefined {
  if (Array.isArray(base) || Array.isArray(value)) return JSON.stringify(base) === JSON.stringify(value) ? undefined : value;
  if (isObj(base) && isObj(value)) {
    const out: Record<string, Json> = {};
    for (const k of Object.keys(value)) {
      const d = diff(base[k], value[k]);
      if (d !== undefined) out[k] = d;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return base === value ? undefined : value;
}

const setIn = (obj: Json, path: (string | number)[], v: Json): Json => {
  if (!path.length) return v;
  const [h, ...rest] = path;
  const copy: any = Array.isArray(obj) ? [...obj] : { ...(obj as object) };
  copy[h as any] = setIn((obj as any)?.[h as any], rest, v);
  return copy;
};

interface FieldProps {
  name: string;
  value: Json;
  base: Json;
  path: (string | number)[];
  onChange: (path: (string | number)[], v: Json) => void;
  t: (k: string) => string;
}

/** Renders an editor for any JSON value shape found in the site content. */
const Field: React.FC<FieldProps> = ({ name, value, base, path, onChange, t }) => {
  const changed = JSON.stringify(value) !== JSON.stringify(base);
  const labelEl = (
    <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
      {humanize(name)}
      {changed && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">{t('studio.site.modified')}</span>}
    </span>
  );

  if (typeof value === 'string') {
    const long = value.length > 70 || ['text', 'sub', 'lead', 'a', 'description', 'p1', 'p2'].includes(name);
    const isImage = name === 'image' || /\.(jpe?g|png|webp|gif)$/i.test(value);
    return (
      <label className="block">
        {labelEl}
        <div className="flex gap-3">
          {isImage && value && <img src={value} alt="" className="h-14 w-14 flex-none rounded-xl object-cover" />}
          {long ? (
            <Textarea value={value} rows={Math.min(6, Math.ceil(value.length / 70) + 1)} onChange={(e) => onChange(path, e.target.value)} />
          ) : (
            <Input value={value} onChange={(e) => onChange(path, e.target.value)} />
          )}
        </div>
      </label>
    );
  }
  if (typeof value === 'number') {
    return (
      <label className="block">
        {labelEl}
        <Input type="number" value={value} onChange={(e) => onChange(path, Number(e.target.value))} />
      </label>
    );
  }
  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={value} onChange={(e) => onChange(path, e.target.checked)} className="h-5 w-5 accent-[hsl(var(--primary))]" />
        <span className="text-sm font-semibold">{humanize(name)}</span>
      </label>
    );
  }
  if (Array.isArray(value)) {
    const template = (Array.isArray(base) && base[0]) ?? value[0] ?? '';
    return (
      <div>
        {labelEl}
        <div className="space-y-3">
          {value.map((item, i) => (
            <div key={i} className={cn('relative', isObj(item) && 'rounded-2xl border border-border/60 bg-muted/30 p-4')}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {isObj(item) ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Object.keys(item).map((k) => (
                        <div key={k} className={cn((typeof item[k] === 'string' && (item[k] as string).length > 50) || Array.isArray(item[k]) ? 'sm:col-span-2' : '')}>
                          <Field name={k} value={item[k]} base={(Array.isArray(base) && isObj(base[i]) ? base[i][k] : undefined) as Json} path={[...path, i, k]} onChange={onChange} t={t} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Field name={`${name} ${i + 1}`} value={item} base={Array.isArray(base) ? base[i] : undefined} path={[...path, i]} onChange={onChange} t={t} />
                  )}
                </div>
                <button type="button" onClick={() => onChange(path, value.filter((_, k) => k !== i))} className="mt-6 grid h-9 w-9 flex-none place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" aria-label={t('studio.site.remove')}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(path, [...value, clone(template)])}>
            <Plus />{t('studio.site.add')}
          </Button>
        </div>
      </div>
    );
  }
  if (isObj(value)) {
    return (
      <fieldset className="space-y-4">
        {Object.keys(value).map((k) => (
          <Field key={k} name={k} value={value[k]} base={isObj(base) ? base[k] : undefined} path={[...path, k]} onChange={onChange} t={t} />
        ))}
      </fieldset>
    );
  }
  return null;
};

const MySitePage = () => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [lang, setLang] = useState<SiteLang>((SITE_LANGS.find((l) => i18n.language?.startsWith(l)) || 'he') as SiteLang);
  const [draft, setDraft] = useState<Record<string, Json>>(clone(DEFAULT_CONTENT[lang]) as any);
  const [saved, setSaved] = useState<string>('');
  const [open, setOpen] = useState<string | null>('hero');
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [previewKey, setPreviewKey] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  const defaults = DEFAULT_CONTENT[lang] as unknown as Record<string, Json>;

  useEffect(() => {
    studioApi
      .siteContent(lang)
      .then(({ content }) => {
        const merged = mergeContent(DEFAULT_CONTENT[lang], content) as unknown as Record<string, Json>;
        setDraft(clone(merged));
        setSaved(JSON.stringify(merged));
      })
      .catch(() => {
        setDraft(clone(defaults));
        setSaved(JSON.stringify(defaults));
      });
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(draft) !== saved;
  const sections = useMemo(() => Object.keys(defaults), [defaults]);
  const onChange = (path: (string | number)[], v: Json) => setDraft((d) => setIn(d, path, v) as Record<string, Json>);

  const save = async () => {
    setBusy(true);
    try {
      const overrides = (diff(defaults, draft) || {}) as Record<string, unknown>;
      await studioApi.saveSiteContent(lang, overrides);
      setSaved(JSON.stringify(draft));
      setPreviewKey((k) => k + 1);
      toast({ title: t('studio.site.saved') });
    } catch (e) {
      toast({ title: t('messages.error.saveFailed'), description: String((e as Error).message), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm(t('studio.site.resetConfirm'))) return;
    await studioApi.saveSiteContent(lang, {});
    setDraft(clone(defaults));
    setSaved(JSON.stringify(defaults));
    setPreviewKey((k) => k + 1);
  };

  return (
    <Layout currentPage="site">
      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 md:py-10">
        <PageHeader
          eyebrow={t('studio.groupStudio')}
          title={t('studio.site.title')}
          description={t('studio.site.subtitle')}
          actions={
            <>
              <Button variant="outline" onClick={() => window.open(`/home?lang=${lang}`, '_blank')}><ExternalLink />{t('studio.site.open')}</Button>
              <Button variant="ghost" onClick={reset}><RotateCcw />{t('studio.site.reset')}</Button>
              <Button onClick={save} disabled={!dirty || busy}><Save />{t('studio.site.save')}</Button>
            </>
          }
        />

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="ec-glass inline-flex rounded-full p-1">
            {SITE_LANGS.map((l) => (
              <button
                key={l}
                onClick={() => {
                  if (dirty && !window.confirm(t('studio.site.unsaved') + ' — ' + t('common.confirm') + '?')) return;
                  setLang(l);
                }}
                className={cn('rounded-full px-4 py-2 text-sm font-bold transition-all duration-300', lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {l === 'he' ? 'עברית' : l === 'en' ? 'English' : 'Français'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {dirty && <span className="animate-fade-in rounded-full bg-[hsl(var(--gold)/.15)] px-3 py-1 text-xs font-bold text-[hsl(var(--gold))]">{t('studio.site.unsaved')}</span>}
            <Button variant="ghost" size="sm" className="hidden xl:inline-flex" onClick={() => setShowPreview((s) => !s)}>
              {showPreview ? <EyeOff /> : <Eye />}{t('studio.site.preview')}
            </Button>
          </div>
        </div>

        <div className={cn('grid gap-6', showPreview && 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
          <div className="space-y-3" dir={lang === 'he' ? 'rtl' : 'ltr'}>
            {sections.map((key) => {
              const isOpen = open === key;
              const sectionChanged = JSON.stringify(draft[key]) !== JSON.stringify(defaults[key]);
              return (
                <div key={key} className={cn('ec-card overflow-hidden rounded-[1.25rem] border bg-card transition-colors', isOpen ? 'border-primary/40' : 'border-border/60')}>
                  <button onClick={() => setOpen(isOpen ? null : key)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start">
                    <span className="flex items-center gap-2">
                      <span className="font-display text-3xl leading-none">{t(`studio.site.sections.${key}`, humanize(key))}</span>
                      {sectionChanged && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform duration-500', isOpen && 'rotate-180')} />
                  </button>
                  <div className={cn('grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.22,1,.36,1)]', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                    <div className="overflow-hidden">
                      <div className="border-t border-border/60 px-5 pb-6 pt-5">
                        {isOpen && <Field name={key} value={draft[key]} base={defaults[key]} path={[key]} onChange={onChange} t={t} />}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {showPreview && (
            <div className="hidden xl:block">
              <div className="ec-glass sticky top-6 overflow-hidden rounded-[1.75rem] p-2">
                <div className="flex items-center gap-1.5 px-3 py-2">
                  <i className="h-2.5 w-2.5 rounded-full bg-red-400/70" /><i className="h-2.5 w-2.5 rounded-full bg-amber-400/70" /><i className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
                  <span className="ms-3 truncate text-xs text-muted-foreground" dir="ltr">ecshape.org/?lang={lang}</span>
                </div>
                <iframe key={`${lang}-${previewKey}`} ref={frame} title={t('studio.site.preview')} src={`/home?lang=${lang}`} className="h-[calc(100vh-10rem)] w-full rounded-[1.25rem] bg-[#0b0a08]" />
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default MySitePage;
