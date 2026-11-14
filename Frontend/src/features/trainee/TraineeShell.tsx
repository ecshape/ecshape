import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dumbbell, House, MessageCircle, TrendingUp, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EcMark } from '@/components/brand/EcMark';
import { useAuth } from '@/contexts/AuthContext';
import { usePortalRoot } from '@/lib/portalMotion';
import { useConversations } from './hooks';
import './i18n';
import './trainee.css';

export type TraineeTab = 'dashboard' | 'training' | 'meals' | 'progress' | 'chat' | 'profile';

const initials = (name?: string) => (name || '?').split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().slice(0, 2);

const Brand: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => (
  <span className="flex select-none items-center gap-2" dir="ltr">
    <EcMark variant="trainer" className={cn('w-auto', size === 'sm' ? 'h-8' : 'h-10')} />
    <span className={cn('font-num leading-none tracking-wide', size === 'sm' ? 'text-base' : 'text-xl')}>
      EC<span className="text-primary">SHAPE</span>
    </span>
  </span>
);

/**
 * App shell for the trainee: bottom tab bar on phones (safe-area aware), a calm sidebar from 1024px.
 * `immersive` hides the tab bar (the workout player owns the bottom of the screen).
 */
const TraineeShell: React.FC<{ current: string; children: React.ReactNode; immersive?: boolean }> = ({ current, children, immersive }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dir = i18n.language?.startsWith('he') ? 'rtl' : 'ltr';
  const { data: convs } = useConversations();
  const unread = (convs ?? []).reduce((n, c) => n + (c.unread_count || 0), 0);

  usePortalRoot(true);
  useEffect(() => {
    // overflow-x: clip (not hidden) on the page roots so sticky bars work inside the trainee app.
    document.documentElement.classList.add('tp-on');
    return () => document.documentElement.classList.remove('tp-on');
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const tabs: { id: TraineeTab; label: string; icon: React.ElementType; href: string; badge?: number }[] = [
    { id: 'dashboard', label: t('trainee.nav.today'), icon: House, href: '/' },
    { id: 'training', label: t('trainee.nav.training'), icon: Dumbbell, href: '/training' },
    { id: 'meals', label: t('trainee.nav.meals'), icon: UtensilsCrossed, href: '/meals' },
    { id: 'progress', label: t('trainee.nav.progress'), icon: TrendingUp, href: '/progress' },
    { id: 'chat', label: t('trainee.nav.coach'), icon: MessageCircle, href: '/chat', badge: unread },
  ];

  const go = (href: string) => {
    if (href !== pathname) navigate(href);
  };

  return (
    <div className="tp-root tp-shell bg-background" dir={dir}>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-[264px] flex-col border-e border-border/50 bg-background/80 px-4 pb-5 pt-6 backdrop-blur-xl lg:flex">
        <button type="button" onClick={() => go('/')} className="tp-press mb-8 rounded-2xl px-2 py-1 text-start">
          <Brand />
        </button>
        <nav className="flex flex-1 flex-col gap-1" aria-label={t('trainee.nav.label')}>
          {tabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => go(tab.href)} aria-current={current === tab.id ? 'page' : undefined} className="tp-side-link tp-press">
              <tab.icon className="h-5 w-5 flex-none" />
              <span className="min-w-0 flex-1 truncate text-start">{tab.label}</span>
              {!!tab.badge && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{tab.badge}</span>}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => go('/me')}
          aria-current={current === 'profile' ? 'page' : undefined}
          className={cn('tp-press flex items-center gap-3 rounded-2xl p-2.5 text-start transition-colors hover:bg-foreground/5', current === 'profile' && 'bg-primary/10')}
        >
          <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{initials(user?.full_name)}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{user?.full_name}</span>
            <span className="block truncate text-xs text-muted-foreground">{t('trainee.nav.profile')}</span>
          </span>
        </button>
      </aside>

      {/* Phone top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border/40 bg-background/75 px-4 backdrop-blur-xl lg:hidden" style={{ paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box' }}>
        <button type="button" onClick={() => go('/')} className="tp-press rounded-xl">
          <Brand size="sm" />
        </button>
        <button
          type="button"
          onClick={() => go('/me')}
          className="tp-press grid h-11 w-11 place-items-center rounded-full"
          aria-label={t('trainee.nav.profile')}
        >
          <span className={cn('grid h-9 w-9 place-items-center rounded-full text-xs font-bold', current === 'profile' ? 'bg-primary text-primary-foreground' : 'bg-foreground/10')}>
            {initials(user?.full_name)}
          </span>
        </button>
      </header>

      <main className={cn('min-w-0 pt-[calc(3.5rem+env(safe-area-inset-top))] lg:ps-[264px] lg:pt-0', immersive ? 'pb-36 lg:pb-10' : 'pb-32 lg:pb-8')}>{children}</main>

      {!immersive && (
        <nav className="tp-tabbar lg:hidden" aria-label={t('trainee.nav.label')}>
          <div className="ec-glass flex items-stretch gap-0.5 rounded-[1.6rem] p-1.5">
            {tabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => go(tab.href)} aria-current={current === tab.id ? 'page' : undefined} className="tp-tab tp-press">
                <span className="tp-tab-ico">
                  <tab.icon className="h-[19px] w-[19px]" />
                </span>
                <span className="max-w-full truncate px-0.5 leading-none">{tab.label}</span>
                {!!tab.badge && <span className="tp-dot">{tab.badge > 9 ? '9+' : tab.badge}</span>}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
};

export default TraineeShell;
