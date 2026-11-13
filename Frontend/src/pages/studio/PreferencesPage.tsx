import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Plus, Star, Trash2 } from 'lucide-react';
import Layout from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { studioApi } from '@/lib/studioApi';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type KeyRow = { id: number; provider: string; label: string; last4: string; is_preferred: boolean; created_at?: string | null };

const PreferencesPage = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => studioApi.aiKeys().then(setKeys).catch(() => setKeys([]));
  useEffect(() => {
    load();
    if (window.location.hash === '#ai-keys') {
      document.getElementById('ai-keys')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setBusy(true);
    try {
      await studioApi.addAiKey({ api_key: apiKey.trim(), label: label.trim() || undefined });
      setApiKey('');
      setLabel('');
      await load();
      toast({ title: t('studio.prefs.keySaved') });
    } catch (err) {
      toast({ title: t('messages.error.saveFailed'), description: String((err as Error).message), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout currentPage="preferences">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 md:py-10">
        <PageHeader
          eyebrow={t('studio.groupStudio')}
          title={t('studio.prefs.title')}
          description={t('studio.prefs.subtitle')}
        />

        <section id="ai-keys" className="ec-card mt-8 rounded-[1.5rem] border border-border/60 bg-card p-5 sm:p-6" data-ec-enter>
          <div className="mb-5 flex items-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-3xl leading-none">{t('studio.prefs.aiKeys')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('studio.prefs.aiKeysHint')}</p>
            </div>
          </div>

          <form onSubmit={add} className="mb-6 space-y-3 rounded-2xl border border-dashed border-border/70 bg-muted/25 p-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('studio.prefs.apiKey')}
              <Input
                className="mt-1.5 font-mono text-sm"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-…"
                required
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('studio.prefs.label')}
              <Input className="mt-1.5" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Claude / Opus" />
            </label>
            <Button type="submit" disabled={busy || !apiKey.trim()}>
              <Plus />
              {t('studio.prefs.addKeys')}
            </Button>
          </form>

          {keys.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('studio.prefs.emptyKeys')}</p>
          ) : (
            <ul className="space-y-2">
              {keys.map((k) => (
                <li
                  key={k.id}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3',
                    k.is_preferred ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-card',
                  )}
                >
                  <div>
                    <p className="text-sm font-bold">
                      {k.label}{' '}
                      <span className="ms-1 font-mono text-xs font-medium text-muted-foreground">••••{k.last4}</span>
                    </p>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{k.provider}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={k.is_preferred ? 'default' : 'outline'}
                      onClick={async () => {
                        await studioApi.preferAiKey(k.id);
                        await load();
                      }}
                    >
                      <Star className="h-3.5 w-3.5" />
                      {k.is_preferred ? t('studio.prefs.preferred') : t('studio.prefs.prefer')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={async () => {
                        if (!window.confirm(t('studio.prefs.deleteConfirm'))) return;
                        await studioApi.deleteAiKey(k.id);
                        await load();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
};

export default PreferencesPage;
