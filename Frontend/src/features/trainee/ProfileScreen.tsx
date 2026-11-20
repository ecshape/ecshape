import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Dumbbell, ExternalLink, KeyRound, Languages, LogOut, MessageCircle, Moon, Palette, ShieldCheck, SlidersHorizontal, Sun, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, PageTitle, SectionCard, Seg } from '@/features/trainer/ui';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { APP_LANGUAGES, setLanguage } from '@/i18n/setLanguage';
import { api } from './api';
import { useCheckInSummary, useConversations, useSessions } from './hooks';
import { Screen, Sheet } from './ui';
import { fmtDate, fmtNum } from './format';
import { AvatarEditor } from '@/components/avatar/AvatarEditor';
import PrivacyCard from './PrivacyCard';

const ProfileScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const convs = useConversations();
  const sessions = useSessions();
  const summary = useCheckInSummary();
  const [pwOpen, setPwOpen] = useState(false);
  const coachConv = convs.data?.[0];
  const coach = coachConv?.client_name;
  const workouts = (sessions.data ?? []).filter((s) => s.is_completed).length;
  const lang = APP_LANGUAGES.find((l) => i18n.language?.startsWith(l.code))?.code ?? APP_LANGUAGES[0].code;

  // QA #109: laid out like the coach's own settings: page title, glass section cards with an icon header,
  // sliding-pill selectors, a coach card and account rows with tinted icons.
  return (
    <Screen>
      <PageTitle eyebrow={t('trainee.profile.eyebrow')} title={t('trainee.profile.title')} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="ec-settings-card tp-rise rounded-[1.75rem] p-5 sm:p-7" style={{ ['--i' as string]: 2 }}>
          <div className="flex flex-wrap items-center gap-5">
            <AvatarEditor compact rounded="rounded-[1.6rem]" className="h-24 w-24 text-3xl shadow-[0_16px_32px_-16px_hsl(var(--primary))]" />
            <div className="min-w-0 flex-1">
              <h2 className="tp-title break-words text-[2.4rem] leading-none">{user?.full_name}</h2>
              <p className="mt-1.5 truncate text-sm text-muted-foreground" dir="ltr" style={{ textAlign: 'inherit' }}>{user?.email}</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2.5">
            <Stat icon={Dumbbell} label={t('trainee.profile.workouts')} value={fmtNum(workouts)} />
            <Stat icon={ClipboardCheck} label={t('trainee.profile.checkins')} value={fmtNum(summary.data?.total_check_ins ?? 0)} />
            <Stat icon={CalendarDays} label={t('trainee.profile.since')} value={user?.created_at ? fmtDate(user.created_at, { month: 'short', year: '2-digit' }) : '–'} />
          </div>
        </section>

        {coach && (
          <SectionCard icon={UserRound} title={t('trainee.profile.coach', { name: '' }).replace(/[:：]\s*$/, '').trim() || coach} className="tp-rise" style={{ ['--i' as string]: 3 }}>
            <div className="flex items-center gap-4">
              <Avatar name={coach} src={(coachConv as { client_avatar?: string | null } | undefined)?.client_avatar} size={56} />
              <p className="min-w-0 flex-1 break-words text-lg font-bold leading-tight">{coach}</p>
              <button type="button" onClick={() => navigate('/chat')} className="tp-icon-btn tp-press !bg-primary !text-primary-foreground" aria-label={t('trainee.nav.coach')} title={t('trainee.nav.coach')}>
                <MessageCircle className="h-5 w-5" />
              </button>
            </div>
          </SectionCard>
        )}

        <SectionCard icon={SlidersHorizontal} title={t('trainee.profile.preferences', { defaultValue: `${t('trainee.profile.language')} · ${t('trainee.profile.appearance')}` })} className="tp-rise" style={{ ['--i' as string]: 4 }} bodyClassName="space-y-5">
          <div>
            <p className="tp-label mb-2 flex items-center gap-1.5"><Languages className="h-3.5 w-3.5" />{t('trainee.profile.language')}</p>
            <Seg value={lang} onChange={(v) => setLanguage(v)} label={t('trainee.profile.language')} className="w-full" items={APP_LANGUAGES.map((l) => ({ id: l.code, label: l.name }))} />
          </div>
          <div>
            <p className="tp-label mb-2 flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" />{t('trainee.profile.appearance')}</p>
            <Seg value={theme === 'light' ? 'light' : 'dark'} onChange={(v) => setTheme(v)} label={t('trainee.profile.appearance')} className="w-full"
              items={[{ id: 'dark', label: t('trainee.profile.dark'), icon: Moon }, { id: 'light', label: t('trainee.profile.light'), icon: Sun }]} />
          </div>
        </SectionCard>

        <SectionCard icon={ShieldCheck} title={t('trainee.profile.account')} className="tp-rise" style={{ ['--i' as string]: 5 }} bodyClassName="-mx-2 space-y-1">
          <Row icon={KeyRound} label={t('trainee.profile.changePassword')} onClick={() => setPwOpen(true)} />
          <Row icon={ExternalLink} label={t('trainee.profile.website')} onClick={() => window.open('/home', '_blank')} />
          <Row icon={LogOut} label={t('trainee.profile.logout')} onClick={logout} danger />
        </SectionCard>

        <PrivacyCard style={{ ['--i' as string]: 6 }} />
      </div>

      <PasswordSheet open={pwOpen} onOpenChange={setPwOpen} />
    </Screen>
  );
};

const Stat: React.FC<{ icon: React.ElementType; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="rounded-2xl bg-foreground/[.05] p-3 ring-1 ring-border/40">
    <Icon className="h-4 w-4 text-primary" />
    <div className="tp-num mt-2 text-2xl leading-none">{value}</div>
    <div className="mt-1 truncate text-[11px] text-muted-foreground">{label}</div>
  </div>
);

const Row: React.FC<{ icon: React.ElementType; label: string; onClick: () => void; danger?: boolean }> = ({ icon: Icon, label, onClick, danger }) => {
  const Chev = document.dir === 'rtl' ? ChevronLeft : ChevronRight;
  return (
    <button type="button" onClick={onClick} className={cn('tp-press flex min-h-[3.25rem] w-full items-center gap-3 rounded-2xl px-2 text-start font-semibold hover:bg-foreground/[.05]', danger && 'text-destructive')}>
      <span className={cn('grid h-9 w-9 flex-none place-items-center rounded-xl', danger ? 'bg-destructive/12' : 'bg-primary/12 text-primary')}><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {!danger && <Chev className="h-4 w-4 flex-none text-muted-foreground" />}
    </button>
  );
};

const PasswordSheet: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void }> = ({ open, onOpenChange }) => {
  const { t } = useTranslation();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = cur.length > 0 && next.length >= 8;
  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      // The server ends every other session and returns a fresh token for this device.
      const res = await api<{ access_token?: string }>('/auth/password/change', { method: 'POST', body: { current_password: cur, new_password: next } });
      if (res?.access_token) localStorage.setItem('access_token', res.access_token);
      toast.success(t('trainee.profile.passwordChanged'));
      setCur('');
      setNext('');
      onOpenChange(false);
    } catch {
      toast.error(t('trainee.profile.passwordError'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('trainee.profile.changePassword')}
      footer={<button type="button" onClick={submit} disabled={!valid || busy} className="tp-btn tp-btn--primary tp-press w-full">{t('trainee.profile.savePassword')}</button>}
    >
      <form className="space-y-4 pb-2 pt-1" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">{t('trainee.profile.currentPassword')}</span>
          <input type="password" autoComplete="current-password" className="tp-input" value={cur} onChange={(e) => setCur(e.target.value)} dir="ltr" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">{t('trainee.profile.newPassword')}</span>
          <input type="password" autoComplete="new-password" className="tp-input" value={next} onChange={(e) => setNext(e.target.value)} dir="ltr" />
          <span className="mt-1 block text-xs text-muted-foreground">{t('trainee.profile.passwordHint')}</span>
        </label>
      </form>
    </Sheet>
  );
};

export default ProfileScreen;
