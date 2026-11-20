import { UserAvatar } from '@/components/ui/user-avatar';
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dumbbell, House, MessageCircle, PanelLeftClose, PanelLeftOpen, TrendingUp, UtensilsCrossed } from 'lucide-react';
import { cn, isRtlLang } from '@/lib/utils';
import { EcMark } from '@/components/brand/EcMark';
import { useAuth } from '@/contexts/AuthContext';
import { usePortalRoot } from '@/lib/portalMotion';
import LanguageSelector from '@/components/LanguageSelector';
import ThemeToggle from '@/components/ThemeToggle';
import './qa2I18n';
import { useLiquid } from '@/features/trainer/ui';
import { useConversations } from './hooks';
import './trainee.css';

const RAIL_KEY = 'ec.trainee.rail';
import '@/features/trainer/trainer.css';

export type TraineeTab = 'dashboard' | 'training' | 'meals' | 'progress' | 'chat' | 'profile';


const APP_OPENED_AT = typeof performance !== 'undefined' ? performance.now() : 0;
const drawBrandOnce = () => typeof performance !== 'undefined' && performance.now() - APP_OPENED_AT < 2500;

const Wordmark: React.FC = () => (
  <span className="font-num text-lg leading-none tracking-wide" dir="ltr">
    EC<span className="text-primary">SHAPE</span>
  </span>
);

/**
 * App shell for the trainee: bottom tab bar on phones (safe-area aware), a calm sidebar from 1024px.
 * `immersive` hides the tab bar (the workout player owns the bottom of the screen).
 */
const TraineeShell: React.FC<{ current: string; children: React.ReactNode; immersive?: boolean; /** Same account menu as the trainer header (QA #37). */ userMenu?: React.ReactNode }> = ({ current, children, immersive, userMenu }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dir = isRtlLang(i18n.language) ? 'rtl' : 'ltr';
  const { data: convs } = useConversations();
  const unread = (convs ?? []).reduce((n, c) => n + (c.unread_count || 0), 0);

  const sideRef = useRef<HTMLElement>(null);
  const footRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  // QA #106: the same sidebar as the coach's, including folding it to an icon rail (remembered on this device)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(RAIL_KEY) === '1'; } catch { return false; } });
  const toggleRail = () => setCollapsed((c) => { try { localStorage.setItem(RAIL_KEY, c ? '0' : '1'); } catch { /* private mode */ } return !c; });

  usePortalRoot(true);
  useEffect(() => {
    // Same frosted top bar as the trainer app once the page scrolls.
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
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

  const active = tabs.find((x) => x.id === current);
  const crumb = active?.label ?? (current === 'profile' ? t('trainee.nav.profile') : '');
  const sideBlob = useLiquid(sideRef, current, 'y', 'trainee-side');
  const footBlob = useLiquid(footRef, current === 'profile' ? 'profile' : null, 'y', 'trainee-foot');
  const barBlob = useLiquid(barRef, current, 'x', 'trainee-bar');

  return (
    <div className="tr-root tp-root tp-shell ec-portal-shell bg-background" dir={dir} data-rail={collapsed || undefined}>
      {/* Desktop sidebar: same glass rail and liquid indicator as the trainer app */}
      <aside className="tr-side tp-side-fixed ec-glass" data-collapsed={collapsed} aria-label={t('trainee.nav.label')}>
        <button type="button" onClick={() => go('/')} className="tp-press mb-5 flex min-h-[3rem] items-center gap-2.5 overflow-hidden rounded-2xl px-2 text-start">
          <EcMark variant="trainer" className={cn('h-10 w-auto flex-none', drawBrandOnce() && 'ec-brand-mark')} />
          <span className="tr-hide-rail"><Wordmark /></span>
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <nav ref={sideRef} className="tr-nav" data-arrived={sideBlob.arrived} aria-label={t('trainee.nav.label')}>
            <span className="tr-blob" data-phase={sideBlob.phase} style={sideBlob.style} aria-hidden />
            {tabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => go(tab.href)} aria-current={current === tab.id ? 'page' : undefined} data-liquid-active={current === tab.id || undefined} className="tr-nav-link" title={collapsed ? tab.label : undefined}>
                <tab.icon className="tr-nav-ico" />
                <span className="tr-hide-rail min-w-0 flex-1 truncate text-start">{tab.label}</span>
                {!!tab.badge && <span className="tr-nav-badge">{tab.badge > 99 ? '99+' : tab.badge}</span>}
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-3 border-t border-border/50 pt-3">
          <button
            type="button" onClick={toggleRail} className="tr-nav-link" aria-expanded={!collapsed}
            aria-label={collapsed ? t('trainer.shell.expand') : t('trainer.shell.collapse')} title={collapsed ? t('trainer.shell.expand') : undefined}
          >
            {(dir === 'rtl') !== collapsed ? <PanelLeftOpen className="tr-nav-ico" /> : <PanelLeftClose className="tr-nav-ico" />}
            <span className="tr-hide-rail truncate">{t('trainer.shell.collapse')}</span>
          </button>
        </div>
        <nav ref={footRef} className="tr-nav mt-1" data-arrived={footBlob.arrived} aria-label={t('trainee.nav.profile')}>
          <span className="tr-blob" data-phase={footBlob.phase} style={footBlob.style} aria-hidden />
          <button type="button" onClick={() => go('/me')} aria-current={current === 'profile' ? 'page' : undefined} data-liquid-active={current === 'profile' || undefined} className="tr-nav-link !min-h-[3.4rem]" title={collapsed ? t('trainee.nav.profile') : undefined}>
            <UserAvatar name={user?.full_name} src={user?.avatar_url} className="h-9 w-9 flex-none bg-primary text-xs text-primary-foreground" />
            <span className="tr-hide-rail min-w-0 text-start leading-tight">
              <span className="block truncate text-sm font-semibold">{user?.full_name}</span>
              <span className="block truncate text-xs opacity-70">{t('trainee.nav.profile')}</span>
            </span>
          </button>
        </nav>
      </aside>

      <div className="tp-content">
        <header className="tr-topbar tp-topbar" data-scrolled={scrolled}>
          <button type="button" onClick={() => go('/')} className="tp-press flex items-center gap-2 rounded-xl lg:hidden" aria-label={t('trainee.nav.today')}>
            <EcMark variant="trainer" className="h-9 w-auto" />
            <Wordmark />
          </button>
          <div className="tr-crumb hidden lg:flex">{crumb && <b className="truncate">{crumb}</b>}</div>
          <div className="flex items-center gap-1.5">
            <LanguageSelector compact />
            <ThemeToggle />
            {userMenu ?? <button type="button" onClick={() => go('/me')} className="tp-press grid h-11 w-11 place-items-center rounded-full" aria-label={t('trainee.nav.profile')}>
              <UserAvatar name={user?.full_name} src={user?.avatar_url} className={cn('h-9 w-9 text-xs', 'bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/.8)]', current === 'profile' && 'ring-2 ring-primary ring-offset-2 ring-offset-background')} />
            </button>}
          </div>
        </header>

        <main ref={mainRef} data-ec-main className={cn('ec-portal-body min-w-0', immersive ? 'pb-36 lg:pb-10' : 'pb-32 lg:pb-8')}>
          <div className="tr-route" key={pathname}>{children}</div>
        </main>
      </div>

      {!immersive && (
        <nav className="tr-tabbar" aria-label={t('trainee.nav.label')}>
          <div ref={barRef} data-arrived={barBlob.arrived} className="ec-glass relative flex items-stretch gap-0.5 rounded-[1.6rem] p-1.5">
            <span className="tr-hblob" data-phase={barBlob.phase} style={barBlob.style} aria-hidden />
            {tabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => go(tab.href)} aria-current={current === tab.id ? 'page' : undefined} data-liquid-active={current === tab.id || undefined} className="tr-tab">
                <tab.icon className="h-[19px] w-[19px]" />
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
