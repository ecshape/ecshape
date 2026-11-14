import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, KeyRound, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import Layout from '@/components/Layout';
import { StudioHeader } from '@/components/studio/StudioHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AgentEcIcon } from '@/components/studio/AgentEcIcon';
import { AvatarEditor } from '@/components/avatar/AvatarEditor';
import { studioApi, type AiKey, type AiProvider } from '@/lib/studioApi';
import { spotlight } from '@/lib/agentOps';
import { cn } from '@/lib/utils';

type Draft = { id?: number; provider: string; apiKey: string; model: string; baseUrl: string };

/** Same prefix rules as the server (app/services/ai_providers.detect_provider). */
function detectProvider(raw: string): string | null {
  const key = raw.trim();
  if (key.length < 12) return null;
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('AIza')) return 'google';
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('xai-')) return 'xai';
  if (/^sk-[a-f0-9]{32}$/.test(key)) return 'deepseek';
  if (key.startsWith('sk-')) return 'openai';
  if (/^[A-Za-z0-9]{32}$/.test(key)) return 'mistral';
  return null;
}

/** Two-letter provider mark on a tinted tile: no logos, no emojis. */
const ProviderMark = ({ id, product }: { id: string; product: string }) => {
  const hue: Record<string, number> = { anthropic: 22, openai: 160, google: 210, mistral: 30, xai: 0, deepseek: 230, groq: 12, openrouter: 265, custom: 190 };
  const h = hue[id] ?? 190;
  return (
    <span
      className="ec-pmark grid h-11 w-11 flex-none place-items-center rounded-2xl font-num text-sm font-bold tracking-wide"
      style={{ background: `hsl(${h} 70% 50% / .14)`, color: `hsl(${h} 75% 62%)`, boxShadow: `inset 0 0 0 1px hsl(${h} 70% 55% / .25)` }}
      aria-hidden
    >
      {product.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'AI'}
    </span>
  );
};

const SettingsPage = () => {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [keys, setKeys] = useState<AiKey[]>([]);
  const [engine, setEngine] = useState<{ configured: boolean; engine: string | null; source: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const info = (id?: string) => providers.find((p) => p.id === id);
  const emptyDraft = (provider = 'anthropic'): Draft => ({ provider, apiKey: '', model: info(provider)?.default_model || '', baseUrl: '' });

  const refresh = async () => {
    const [k, s] = await Promise.all([studioApi.aiKeys().catch(() => []), studioApi.agentStatus().catch(() => null)]);
    setKeys(k);
    setEngine(s);
  };

  useEffect(() => {
    studioApi.aiProviders().then(setProviders).catch(() => setProviders([]));
    refresh();
    // "Add a model" in Agent EC links here
    if (window.location.hash === '#ai-keys') window.setTimeout(() => spotlight('#ai-keys'), 350);
  }, []);

  const run = async (id: string, fn: () => Promise<string>) => {
    setBusy(id);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await fn() });
      await refresh();
      return true;
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message || t('studio.settings.failed') });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    const p = info(draft.provider);
    const ok = await run('save', async () => {
      if (draft.id) {
        await studioApi.updateAiKey(draft.id, { api_key: draft.apiKey.trim() || undefined, model: draft.model, base_url: draft.baseUrl || undefined });
      } else {
        const k = await studioApi.addAiKey({ api_key: draft.apiKey.trim(), provider: draft.provider, model: draft.model, base_url: draft.baseUrl || undefined });
        await studioApi.preferAiKey(k.id);
      }
      return t('studio.settings.saved', { product: p?.product || draft.provider });
    });
    if (ok) setDraft(null);
  };

  const p = draft ? info(draft.provider) : undefined;
  const editing = draft?.id ? keys.find((k) => k.id === draft.id) : undefined;
  const detected = draft && !editing ? detectProvider(draft.apiKey) : null;

  return (
    <Layout currentPage="preferences">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:py-10">
        <StudioHeader eyebrow={t('studio.groupStudio')} title={t('studio.settings.title')} lead={t('studio.settings.subtitle')} />

        <section id="profile" className="ec-settings-card mt-8 rounded-[1.75rem] p-5 sm:p-7" data-ec-enter>
          <h2 className="font-display text-3xl leading-none">{t('tix.avatar.sectionTitle')}</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t('tix.avatar.sectionHint')}</p>
          <div className="mt-5">
            <AvatarEditor />
          </div>
        </section>

        <section id="ai-keys" className="ec-settings-card mt-6 rounded-[1.75rem] p-5 sm:p-7" data-ec-enter>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <AgentEcIcon size="md" />
              <div>
                <h2 className="font-display text-3xl leading-none">{t('studio.settings.aiKeys')}</h2>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t('studio.settings.aiKeysHint')}</p>
              </div>
            </div>
            {!draft && (
              <Button onClick={() => setDraft(emptyDraft(keys.length ? 'openai' : 'anthropic'))}>
                <Plus />
                {t('studio.settings.add')}
              </Button>
            )}
          </div>

          {/* Engine line */}
          <div className={cn('ec-engine-line mt-6 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm', engine?.configured ? 'is-on' : 'is-off')}>
            <span className="ec-engine-dot" aria-hidden />
            <span>
              {engine?.configured
                ? t('studio.settings.engineOn', { engine: engine.engine, source: engine.source === 'server' ? t('studio.settings.sourceServer') : t('studio.settings.sourceYours') })
                : t('studio.settings.engineOff')}
            </span>
          </div>

          {/* Keys */}
          {keys.length > 0 && (
            <ul className="ec-stagger mt-5 space-y-2">
              {keys.map((k) => (
                <li key={k.id} className={cn('ec-key-row flex flex-wrap items-center gap-4 rounded-2xl border px-4 py-3', k.is_preferred ? 'is-preferred border-primary/40' : 'border-border/60')}>
                  <ProviderMark id={k.provider} product={k.product || k.provider} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {k.product} <span className="font-normal text-muted-foreground">· {k.model}</span>
                    </p>
                    <p className="font-mono text-xs text-muted-foreground" dir="ltr" style={{ textAlign: 'start' }}>
                      ••••{k.last4}
                      {k.base_url ? ` · ${k.base_url}` : ''}
                    </p>
                  </div>
                  {k.is_preferred && <span className="ec-key-pill rounded-full px-3 py-1 text-xs font-bold">{t('studio.settings.inUse')}</span>}
                  <div className="flex flex-wrap items-center gap-1">
                    {!k.is_preferred && (
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(`prefer-${k.id}`, async () => { await studioApi.preferAiKey(k.id); return t('studio.settings.nowUsed', { product: k.product }); })}>
                        <Check className="h-4 w-4" />
                        {t('studio.settings.use')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() =>
                        run(`test-${k.id}`, async () => {
                          const r = await studioApi.testAiKey(k.id);
                          if (!r.ok) throw new Error(r.error || t('studio.settings.failed'));
                          return t('studio.settings.works', { engine: r.engine });
                        })
                      }
                    >
                      <RefreshCw className={cn('h-4 w-4', busy === `test-${k.id}` && 'animate-spin')} />
                      {t('studio.settings.test')}
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={t('studio.settings.edit')} disabled={busy !== null} onClick={() => setDraft({ id: k.id, provider: k.provider, apiKey: '', model: k.model, baseUrl: k.base_url || '' })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      aria-label={t('studio.settings.remove')}
                      disabled={busy !== null}
                      onClick={() => {
                        if (!window.confirm(t('studio.settings.removeConfirm', { product: k.product }))) return;
                        run(`remove-${k.id}`, async () => { await studioApi.deleteAiKey(k.id); return t('studio.settings.removed'); });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {keys.length === 0 && !draft && (
            <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">
              <KeyRound className="h-6 w-6" />
              {t('studio.settings.empty')}
            </div>
          )}

          {/* Add / edit form */}
          {draft && p && (
            <form className="ec-key-form mt-5 grid gap-5 rounded-2xl p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
              {!editing && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('studio.settings.provider')}</p>
                  <div className="flex flex-wrap gap-2">
                    {providers.map((pr) => (
                      <button
                        key={pr.id}
                        type="button"
                        onClick={() => setDraft({ ...emptyDraft(pr.id), apiKey: draft.apiKey })}
                        className={cn('ec-chip rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all duration-300', draft.provider === pr.id ? 'is-active border-transparent' : 'border-border/70 text-muted-foreground hover:text-foreground')}
                      >
                        {pr.product}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <span>
                  {t('studio.settings.apiKey')}
                  {editing && <span className="ms-2 normal-case tracking-normal">{t('studio.settings.keepKey', { last4: editing.last4 })}</span>}
                </span>
                <Input
                  className="font-mono text-sm normal-case tracking-normal"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                  value={draft.apiKey}
                  placeholder={p.placeholder}
                  required={!editing}
                  onChange={(e) => {
                    const apiKey = e.target.value;
                    const found = editing || draft.provider === 'custom' ? null : detectProvider(apiKey);
                    if (found && found !== draft.provider) setDraft({ ...emptyDraft(found), apiKey });
                    else setDraft({ ...draft, apiKey });
                  }}
                />
                <span className="font-normal normal-case tracking-normal">
                  {editing ? null : detected ? t('studio.settings.detected', { product: p.product, model: draft.model || p.default_model }) : t('studio.settings.pasteHint')}
                  {p.key_url && (
                    <a href={p.key_url} target="_blank" rel="noreferrer" className="ms-2 inline-flex items-center gap-1 text-primary hover:underline">
                      {t('studio.settings.getKey')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </span>
              </label>

              {p.needs_base_url && (
                <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('studio.settings.baseUrl')}
                  <Input dir="ltr" className="normal-case tracking-normal" value={draft.baseUrl} placeholder="https://api.example.com/v1" onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} required />
                </label>
              )}

              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('studio.settings.model')}
                <Input dir="ltr" className="normal-case tracking-normal" value={draft.model} placeholder={p.default_model || 'model-name'} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
              </label>
              {p.models.length > 0 && (
                <div className="-mt-2 flex flex-wrap gap-2">
                  {p.models.map((m) => (
                    <button key={m} type="button" onClick={() => setDraft({ ...draft, model: m })} className={cn('ec-chip rounded-full border px-3 py-1 font-mono text-xs transition-all duration-300', draft.model === m ? 'is-active border-transparent' : 'border-border/70 text-muted-foreground hover:text-foreground')}>
                      {m}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy !== null || (!editing && !draft.apiKey.trim())}>
                  <Check />
                  {busy === 'save' ? t('studio.settings.saving') : editing ? t('studio.settings.saveEdit') : t('studio.settings.saveUse')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  <X />
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          )}

          {message && (
            <p role="status" className={cn('mt-4 text-sm', message.ok ? 'text-success' : 'text-destructive')}>
              {message.text}
            </p>
          )}
        </section>
      </div>
    </Layout>
  );
};

export default SettingsPage;
