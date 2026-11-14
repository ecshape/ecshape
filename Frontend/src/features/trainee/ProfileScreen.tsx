import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, ExternalLink, KeyRound, LogOut, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { APP_LANGUAGES, setLanguage } from '@/i18n/setLanguage';
import { api } from './api';
import { useCheckInSummary, useConversations, useSessions } from './hooks';
import { Screen, ScreenHeader, SectionTitle, Sheet } from './ui';
import { fmtDate, fmtNum } from './format';
import { AvatarEditor } from '@/components/avatar/AvatarEditor';

const ProfileScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const convs = useConversations();
  const sessions = useSessions();
  const summary = useCheckInSummary();
  const [pwOpen, setPwOpen] = useState(false);
  const coach = convs.data?.[0]?.client_name;
  const workouts = (sessions.data ?? []).filter((s) => s.is_completed).length;

  return (
    <Screen>
      <ScreenHeader eyebrow={t('trainee.profile.eyebrow')} title={t('trainee.profile.title')} />

      <section className="tp-card tp-card--hero tp-rise flex flex-wrap items-center gap-4 p-5 sm:p-6" style={{ ['--i' as string]: 2 }}>
        {/* Profile photo (tap to change) */}
        <AvatarEditor compact rounded="rounded-[1.6rem]" className="h-20 w-20 text-2xl shadow-[0_16px_32px_-16px_hsl(var(--primary))]" />
        <div className="min-w-0 flex-1">
          <h2 className="tp-title break-words text-[2.4rem]">{user?.full_name}</h2>
          <p className="truncate text-sm text-muted-foreground" dir="ltr" style={{ textAlign: 'inherit' }}>{user?.email}</p>
          {coach && <p className="mt-1 text-sm">{t('trainee.profile.coach', { name: coach })}</p>}
        </div>
        <div className="grid w-full grid-cols-3 gap-2 sm:w-auto">
          <Mini label={t('trainee.profile.workouts')} value={fmtNum(workouts)} />
          <Mini label={t('trainee.profile.checkins')} value={fmtNum(summary.data?.total_check_ins ?? 0)} />
          <Mini label={t('trainee.profile.since')} value={user?.created_at ? fmtDate(user.created_at, { month: 'short', year: '2-digit' }) : '–'} />
        </div>
      </section>

      <SectionTitle>{t('trainee.profile.language')}</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {APP_LANGUAGES.map((l) => {
          const on = i18n.language?.startsWith(l.code);
          return (
            <button key={l.code} type="button" onClick={() => setLanguage(l.code)} aria-pressed={on} className={cn('tp-card tp-press flex min-h-[4.5rem] flex-col items-center justify-center gap-1 p-3', on && 'ring-2 ring-primary')}>
              <span className="font-semibold">{l.name}</span>
              {on && <Check className="h-4 w-4 text-primary" />}
            </button>
          );
        })}
      </div>

      <SectionTitle>{t('trainee.profile.appearance')}</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {(['dark', 'light'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setTheme(m)} aria-pressed={theme === m} className={cn('tp-card tp-press flex min-h-[4.5rem] items-center justify-center gap-2 p-3 font-semibold', theme === m && 'ring-2 ring-primary')}>
            {m === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            {t(`trainee.profile.${m}`)}
          </button>
        ))}
      </div>

      <SectionTitle>{t('trainee.profile.account')}</SectionTitle>
      <div className="tp-card divide-y divide-border/50">
        <Row icon={KeyRound} label={t('trainee.profile.changePassword')} onClick={() => setPwOpen(true)} />
        <Row icon={ExternalLink} label={t('trainee.profile.website')} onClick={() => window.open('/home', '_blank')} />
        <Row icon={LogOut} label={t('trainee.profile.logout')} onClick={logout} danger />
      </div>

      <PasswordSheet open={pwOpen} onOpenChange={setPwOpen} />
    </Screen>
  );
};

const Mini: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl bg-foreground/[.06] px-3 py-2.5 text-center">
    <div className="tp-num text-xl leading-none">{value}</div>
    <div className="mt-1 truncate text-[11px] text-muted-foreground">{label}</div>
  </div>
);

const Row: React.FC<{ icon: React.ElementType; label: string; onClick: () => void; danger?: boolean }> = ({ icon: Icon, label, onClick, danger }) => (
  <button type="button" onClick={onClick} className={cn('tp-press flex min-h-[3.5rem] w-full items-center gap-3 px-4 text-start font-semibold first:rounded-t-[1.5rem] last:rounded-b-[1.5rem] hover:bg-foreground/[.04]', danger && 'text-destructive')}>
    <Icon className="h-5 w-5 flex-none" />
    <span className="min-w-0 flex-1 truncate">{label}</span>
  </button>
);

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
      await api('/auth/password/change', { method: 'POST', body: { current_password: cur, new_password: next } });
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
