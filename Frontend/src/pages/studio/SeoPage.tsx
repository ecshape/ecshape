import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Check, Save, Sparkles, X, Instagram, MessageCircle, BarChart3 } from 'lucide-react';
import Layout from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { studioApi, type SeoSettings } from '@/lib/studioApi';
import { DEFAULT_CONTENT, SITE_LANGS, type SiteLang } from '@/site/content';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type PageSeo = { title?: string; description?: string; keywords?: string; image?: string };

const scoreOf = (p: PageSeo) => {
  const title = p.title || '';
  const desc = p.description || '';
  const checks = {
    titleLength: title.length >= 30 && title.length <= 60,
    descLength: desc.length >= 70 && desc.length <= 160,
    keywords: (p.keywords || '').split(',').filter((k) => k.trim()).length >= 3,
    image: !!p.image,
    brand: /ecshape/i.test(title),
  };
  const score = Math.round((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);
  return { checks, score };
};

const SeoPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<SeoSettings>({});
  const [lang, setLang] = useState<SiteLang>('he');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    studioApi.seo().then((s) => setData(s || {})).catch(() => setData({}));
  }, []);

  const defaults = DEFAULT_CONTENT[lang].meta;
  const page: PageSeo = { title: defaults.title, description: defaults.description, ...(data.pages?.[lang] || {}) };
  const { checks, score } = scoreOf(page);

  const setPage = (patch: PageSeo) => setData((d) => ({ ...d, pages: { ...(d.pages || {}), [lang]: { ...page, ...patch } } }));
  const setSocial = (patch: SeoSettings['social']) => setData((d) => ({ ...d, social: { ...(d.social || {}), ...patch } }));

  const save = async () => {
    setBusy(true);
    try {
      await studioApi.saveSeo(data);
      toast({ title: t('studio.seo.saved') });
    } catch (e) {
      toast({ title: t('messages.error.saveFailed'), description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const ring = 2 * Math.PI * 52;

  return (
    <Layout currentPage="seo">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-10">
        <PageHeader
          eyebrow={t('studio.groupStudio')}
          title={t('studio.seo.title')}
          description={t('studio.seo.subtitle')}
          actions={<Button onClick={save} disabled={busy}><Save />{t('studio.seo.save')}</Button>}
        />

        <div className="ec-glass mb-6 inline-flex rounded-full p-1">
          {SITE_LANGS.map((l) => (
            <button key={l} onClick={() => setLang(l)} className={cn('rounded-full px-4 py-2 text-sm font-bold transition-all duration-300', lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {l === 'he' ? 'עברית' : l === 'en' ? 'English' : 'Français'}
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <section className="ec-card rounded-[1.5rem] border border-border/60 bg-card p-6" dir={lang === 'he' ? 'rtl' : 'ltr'}>
              <div className="space-y-5">
                <label className="block">
                  <span className="mb-1.5 flex justify-between text-sm font-semibold">{t('studio.seo.pageTitle')}<span className={cn('text-xs', checks.titleLength ? 'text-success' : 'text-muted-foreground')}>{(page.title || '').length}/60</span></span>
                  <Input value={page.title || ''} onChange={(e) => setPage({ title: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1.5 flex justify-between text-sm font-semibold">{t('studio.seo.pageDescription')}<span className={cn('text-xs', checks.descLength ? 'text-success' : 'text-muted-foreground')}>{(page.description || '').length}/160</span></span>
                  <Textarea rows={3} value={page.description || ''} onChange={(e) => setPage({ description: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold">{t('studio.seo.keywords')}</span>
                  <Input value={page.keywords || ''} placeholder="personal trainer, online coaching, …" onChange={(e) => setPage({ keywords: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold">{t('studio.seo.image')}</span>
                  <Input dir="ltr" value={page.image || ''} placeholder="https://ecshape.org/site/photos/opt/trainer.jpg" onChange={(e) => setPage({ image: e.target.value })} />
                </label>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-5"
                onClick={() => navigate('/studio/agent', { state: { seed: `${t('studio.seo.writeWithAgent')} (${lang}): ${t('studio.seo.pageTitle')} + ${t('studio.seo.pageDescription')}` } })}
              >
                <Sparkles />{t('studio.seo.writeWithAgent')}
              </Button>
            </section>

            <section className="ec-card rounded-[1.5rem] border border-border/60 bg-card p-6">
              <h2 className="font-display mb-5 text-4xl">{t('studio.seo.social')}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><Instagram className="h-4 w-4" />{t('studio.seo.instagram')}</span>
                  <Input dir="ltr" value={data.social?.instagram || ''} placeholder="ecshape" onChange={(e) => setSocial({ instagram: e.target.value.replace(/^@/, '') })} />
                </label>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><MessageCircle className="h-4 w-4" />{t('studio.seo.whatsapp')}</span>
                  <Input dir="ltr" value={data.social?.whatsapp || ''} placeholder="972546683867" onChange={(e) => setSocial({ whatsapp: e.target.value.replace(/[^\d]/g, '') })} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4" />{t('studio.seo.analytics')}</span>
                  <Input dir="ltr" value={data.analytics_id || ''} placeholder="G-XXXXXXXXXX" onChange={(e) => setData((d) => ({ ...d, analytics_id: e.target.value }))} />
                </label>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="ec-card flex items-center gap-6 rounded-[1.5rem] border border-border/60 bg-card p-6">
              <svg viewBox="0 0 120 120" className="h-32 w-32 flex-none -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - score / 100)} style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.22,1,.36,1)' }} />
                <text x="60" y="60" textAnchor="middle" dominantBaseline="central" className="rotate-90 fill-foreground font-num" style={{ fontSize: 30, transformOrigin: '60px 60px' }}>{score}</text>
              </svg>
              <div className="min-w-0">
                <p className="font-display text-3xl">{t('studio.seo.score')}</p>
                <ul className="mt-2 space-y-1.5">
                  {(Object.keys(checks) as (keyof typeof checks)[]).map((k) => (
                    <li key={k} className={cn('flex items-center gap-2 text-sm', checks[k] ? 'text-foreground' : 'text-muted-foreground')}>
                      {checks[k] ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4" />}
                      {t(`studio.seo.checks.${k}`)}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="rounded-[1.5rem] bg-white p-6 text-[#202124] shadow-sm" dir={lang === 'he' ? 'rtl' : 'ltr'}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#5f6368]">{t('studio.seo.preview')}</p>
              <p className="text-sm text-[#202124]" dir="ltr" style={{ textAlign: lang === 'he' ? 'right' : 'left' }}>ecshape.org</p>
              <p className="mt-1 line-clamp-1 text-xl text-[#1a0dab]">{page.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-[#4d5156]">{page.description}</p>
            </section>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SeoPage;
