import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/features/trainee/api';
import { isRtlLang, cn } from '@/lib/utils';
import { consentCopy, HEALTH_QUESTIONS, type HealthQuestion } from '@/legal/consentText';
import '@/features/trainee/trainee.css';

export interface ConsentStatus {
  version: string;
  role: string;
  required: string[];
  missing: string[];
  accepted: Record<string, { version: string; at: string | null }>;
  marketing: boolean;
}

/** Tell the gate to check again (after a withdrawal in Settings). */
export const recheckConsent = () => window.dispatchEvent(new Event('ec:consent-recheck'));

/**
 * Legal audit 2026-11: trainees are created by their coach and never went through a sign-up form, so the first
 * time anyone signs in (and again whenever the policy version changes) they must agree to the terms and privacy
 * policy, and trainees also give explicit consent to health-data processing, confirm 18+ and fill in the health
 * declaration. Nothing is pre-ticked (Privacy Protection Law, Amendment 13; GDPR Art. 7 & 9(2)(a)).
 */
const ConsentGate: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { i18n } = useTranslation();
  const location = useLocation();
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [tick, setTick] = useState(0);
  const lang = (i18n.language || 'he').slice(0, 2);
  const c = consentCopy(lang);
  const rtl = isRtlLang(lang);

  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    window.addEventListener('ec:consent-recheck', on);
    return () => window.removeEventListener('ec:consent-recheck', on);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) { setStatus(null); return; }
    let alive = true;
    api<ConsentStatus>('/privacy/consent').then((s) => alive && setStatus(s)).catch(() => alive && setStatus(null));
    return () => { alive = false; };
  }, [isAuthenticated, user?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // The legal pages stay readable from the gate's links (they open in a new tab, but a direct visit works too).
  const onLegal = location.pathname.startsWith('/legal/') || location.pathname === '/login' || location.pathname.startsWith('/home');
  if (!status || status.missing.length === 0 || onLegal) return null;
  return <GateDialog status={status} c={c} rtl={rtl} lang={lang} onDone={setStatus} onLogout={logout} />;
};

const GateDialog: React.FC<{
  status: ConsentStatus;
  c: ReturnType<typeof consentCopy>;
  rtl: boolean;
  lang: string;
  onDone: (s: ConsentStatus) => void;
  onLogout: () => void;
}> = ({ status, c, rtl, lang, onDone, onLogout }) => {
  const needs = (k: string) => status.missing.includes(k);
  const [terms, setTerms] = useState(false);
  const [health, setHealth] = useState(false);
  const [age, setAge] = useState(false);
  const [answers, setAnswers] = useState<Partial<Record<HealthQuestion, boolean>>>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const anyYes = useMemo(() => Object.values(answers).some(Boolean), [answers]);
  const declDone = HEALTH_QUESTIONS.every((q) => typeof answers[q] === 'boolean');
  const valid =
    (!needs('terms') && !needs('privacy') || terms) &&
    (!needs('health_data') || health) &&
    (!needs('age_18') || age) &&
    (!needs('health_declaration') || declDone);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) { setMsg(c.required); return; }
    setBusy(true);
    setMsg('');
    try {
      const kinds = status.missing.filter((k) => k !== 'marketing');
      const s = await api<ConsentStatus>('/privacy/consent', {
        method: 'POST',
        body: { kinds, lang, ...(needs('health_declaration') ? { health_declaration: { answers, notes: notes.trim() || null } } : {}) },
      });
      onDone(s);
    } catch {
      setMsg(c.error);
    } finally {
      setBusy(false);
    }
  };

  const link = (to: string, label: string) => (
    <a href={to} target="_blank" rel="noopener" className="font-semibold text-primary underline underline-offset-2">{label}</a>
  );

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-background/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="ec-consent-title" dir={rtl ? 'rtl' : 'ltr'} lang={lang}>
      <form onSubmit={submit} className="mx-auto max-w-2xl px-4 py-8 sm:py-12" noValidate>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary"><ShieldCheck className="h-6 w-6" /></span>
        <h1 id="ec-consent-title" className="tp-title mt-4 text-[2.6rem] leading-none">{c.title}</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">{status.role === 'CLIENT' ? c.intro : c.staffIntro}</p>

        <div className="mt-6 space-y-3">
          {(needs('terms') || needs('privacy')) && (
            <Check checked={terms} onChange={setTerms}>
              {c.terms[0]}{link('/legal/terms', c.terms[1])}{c.terms[2]}{link('/legal/privacy', c.terms[3])}.
            </Check>
          )}
          {needs('health_data') && <Check checked={health} onChange={setHealth}>{c.health}</Check>}
          {needs('age_18') && <Check checked={age} onChange={setAge}>{c.age}</Check>}
        </div>

        {needs('health_declaration') && (
          <fieldset className="mt-8 rounded-[1.5rem] p-5 ring-1 ring-border/60 sm:p-6">
            <legend className="px-1 text-xl font-bold">{c.declTitle}</legend>
            <p className="text-sm text-muted-foreground">{c.declIntro}</p>
            <ol className="mt-4 space-y-4">
              {HEALTH_QUESTIONS.map((q, i) => (
                <li key={q} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span id={`hq-${q}`} className="leading-snug">{i + 1}. {c.q[q]}</span>
                  <div role="radiogroup" aria-labelledby={`hq-${q}`} className="flex flex-none gap-2">
                    {[true, false].map((v) => (
                      <button key={String(v)} type="button" role="radio" aria-checked={answers[q] === v}
                        onClick={() => setAnswers((a) => ({ ...a, [q]: v }))}
                        className={cn('tp-press min-h-11 min-w-[4.5rem] rounded-full px-4 text-sm font-semibold ring-1 ring-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          answers[q] === v && 'bg-primary text-primary-foreground ring-primary')}>
                        {v ? c.yes : c.no}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
            <label className="mt-5 block">
              <span className="mb-1 block text-sm text-muted-foreground">{c.notes}</span>
              <textarea className="tp-input min-h-[4.5rem]" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {anyYes && <p className="mt-4 rounded-2xl bg-amber-500/12 p-3 text-sm font-semibold text-amber-700 dark:text-amber-300" role="status">{c.clearance}</p>}
          </fieldset>
        )}

        {status.role === 'CLIENT' && <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{c.disclaimer}</p>}
        <p className="mt-4 min-h-5 text-sm font-semibold text-destructive" role="alert" aria-live="polite">{msg}</p>
        <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onLogout} className="tp-btn tp-press">{c.logout}</button>
          <button type="submit" disabled={busy} aria-disabled={!valid} className={cn('tp-btn tp-btn--primary tp-press', !valid && 'opacity-60')}>{c.submit}</button>
        </div>
      </form>
    </div>
  );
};

const Check: React.FC<{ checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }> = ({ checked, onChange, children }) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-1 ring-border/60 hover:bg-foreground/[.04]">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 flex-none accent-[hsl(var(--primary))]" />
    <span className="leading-relaxed">{children}</span>
  </label>
);

export default ConsentGate;
