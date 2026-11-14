import React, { useRef } from 'react';
import {
  Dumbbell, Home, Utensils, Target, TrendingUp, LogOut, User, Settings, MessageSquare, ChevronDown,
  Users2, Globe2, Megaphone, Bug, ExternalLink, SlidersHorizontal,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { EcMark } from '@/components/brand/EcMark';
import LanguageSelector from './LanguageSelector';
import ThemeToggle from './ThemeToggle';
import LiquidNav, { type LiquidItem } from './LiquidNav';
import { usePortalMotion, usePortalRoot } from '@/lib/portalMotion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { studioApi } from '@/lib/studioApi';
import TraineeShell from '@/features/trainee/TraineeShell';
import TrainerShell from '@/features/trainer/TrainerShell';
import { useQuery } from '@tanstack/react-query';
import { UserAvatar } from '@/components/ui/user-avatar';
import { API_BASE_URL } from '@/config/api';

interface LayoutProps {
  children: React.ReactNode;
  currentPage?: string;
  /** Trainee only: hide the bottom tab bar (focused screens such as the workout player). */
  immersive?: boolean;
}

const getInitials = (name?: string) =>
  (name || '?').split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().slice(0, 2);

/** The logo draws itself when the app opens, not on every page change. */
const APP_OPENED_AT = typeof performance !== 'undefined' ? performance.now() : 0;
const drawBrandOnce = () => typeof performance !== 'undefined' && performance.now() - APP_OPENED_AT < 2500;

const Brand = ({ compact = false }: { compact?: boolean }) => (
  <div className="flex select-none items-center gap-2.5" dir="ltr">
    <EcMark variant="trainer" className={cn('w-auto', drawBrandOnce() && 'ec-brand-mark', compact ? 'h-9' : 'h-11')} />
    <span className={cn('font-num leading-none tracking-wide', compact ? 'text-lg' : 'text-xl')}>
      EC<span className="text-primary">SHAPE</span>
    </span>
  </div>
);

type NavEntry = { id: string; label: string; icon: React.ElementType; href: string; badge?: number };

const LayoutInner = ({ children, currentPage = 'dashboard' }: LayoutProps) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const dir = i18n.language?.startsWith('he') ? 'rtl' : 'ltr';
  const mainRef = useRef<HTMLElement>(null);

  const isTrainer = user?.role === 'TRAINER';
  const isAdmin = user?.role === 'ADMIN';

  usePortalRoot(true);
  usePortalMotion(mainRef);

  const { data: overview } = useQuery({
    queryKey: ['trainer', 'overview'],
    queryFn: () => studioApi.overview(),
    enabled: isTrainer,
    staleTime: 30_000,
    refetchInterval: 90_000,
  });
  const newLeads = overview?.leads_new ?? 0;
  // Unread chat messages from clients (A2A cross M5): same conversations endpoint as the trainee app
  const { data: convs } = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: async () => {
      const token = localStorage.getItem('access_token');
      const r = await fetch(`${API_BASE_URL}/v2/chat/conversations`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      return r.ok ? ((await r.json()) as { unread_count?: number }[]) : [];
    },
    enabled: isTrainer,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const unreadChats = (convs ?? []).reduce((n, c) => n + (c.unread_count || 0), 0);

  const go = (href: string) => navigate(href);

  const clientNav: NavEntry[] = [
    { id: 'dashboard', label: t('navigation.dashboard'), icon: Home, href: '/' },
    { id: 'meals', label: t('navigation.meals'), icon: Utensils, href: '/meals' },
    { id: 'training', label: t('navigation.training'), icon: Target, href: '/training' },
    { id: 'progress', label: t('navigation.progress'), icon: TrendingUp, href: '/progress' },
    { id: 'chat', label: t('navigation.chat'), icon: MessageSquare, href: '/chat' },
  ];
  const adminNav: NavEntry[] = [
    { id: 'dashboard', label: t('navigation.dashboard'), icon: Home, href: '/' },
    { id: 'users', label: t('navigation.users'), icon: User, href: '/users' },
    { id: 'system', label: t('navigation.system'), icon: Settings, href: '/system' },
  ];
  const trainerGroups: { title: string; items: NavEntry[] }[] = [
    {
      title: t('studio.groupCoaching'),
      items: [
        { id: 'dashboard', label: t('navigation.dashboard'), icon: Home, href: '/trainer-dashboard' },
        { id: 'exercises', label: t('navigation.exercises'), icon: Dumbbell, href: '/exercises' },
        { id: 'meal-bank', label: t('foodBank.title'), icon: Utensils, href: '/meal-bank' },
        { id: 'chat', label: t('navigation.chat'), icon: MessageSquare, href: '/chat', badge: unreadChats },
      ],
    },
    {
      title: t('studio.groupBusiness'),
      items: [
        { id: 'prospects', label: t('studio.nav.prospects'), icon: Users2, href: '/studio/prospects', badge: newLeads },
      ],
    },
    {
      title: t('studio.groupStudio'),
      items: [
        { id: 'site', label: t('studio.nav.site'), icon: Globe2, href: '/studio/site' },
        { id: 'seo', label: t('studio.nav.seo'), icon: Megaphone, href: '/studio/seo' },
        { id: 'qa', label: t('studio.nav.qa'), icon: Bug, href: '/studio/qa' },
        { id: 'settings', label: t('studio.nav.settings'), icon: SlidersHorizontal, href: '/studio/settings' },
      ],
    },
  ];
  const topNav = isAdmin ? adminNav : clientNav;
  const toLiquid = (items: NavEntry[]): LiquidItem[] => items.map((i) => ({ id: i.id, label: i.label, icon: i.icon, badge: i.badge, onClick: () => go(i.href) }));

  const areaLabel = isAdmin ? t('layout.adminPanel') : isTrainer ? t('layout.trainerDashboard') : t('layout.clientPortal');

  const UserMenu = ({ showName }: { showName: boolean }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="group flex items-center gap-2.5 rounded-full p-1 pe-3 transition-colors hover:bg-foreground/[.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={user?.full_name || 'account'}>
          <UserAvatar name={user?.full_name} src={user?.avatar_url} className="h-9 w-9 bg-primary text-sm text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/.8)]" />
          {showName && (
            <span className="hidden text-start leading-tight xl:block">
              <span className="block max-w-[140px] truncate text-sm font-semibold">{user?.full_name}</span>
              <span className="block text-xs text-muted-foreground">{user?.role ? t(`roles.${user.role}`) : ''}</span>
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold">{user?.full_name}</p>
          <p className="text-xs text-muted-foreground">{areaLabel}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.open('/home', '_blank')} className="gap-2">
          <ExternalLink className="h-4 w-4" />
          {t('studio.site.open')}
        </DropdownMenuItem>
        {isTrainer && (
          <DropdownMenuItem onClick={() => go('/studio/settings')} className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            {t('studio.nav.settings')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={logout} className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive">
          <LogOut className="h-4 w-4" />
          {t('auth.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isTrainer) {
    return (
      <TrainerShell groups={trainerGroups} currentPage={currentPage} mobilePrimary={['dashboard', 'prospects', 'site', 'chat']} userMenu={<UserMenu showName={false} />}>
        {children}
      </TrainerShell>
    );
  }

  // CLIENT / ADMIN
  return (
    <div className="ec-portal-shell flex h-screen flex-col overflow-hidden bg-background" dir={dir}>
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-xl" data-ec-enter>
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-3 sm:px-5 lg:h-[76px] lg:px-8">
          <button onClick={() => go(topNav[0].href)} className="flex items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="lg:hidden"><Brand compact /></span>
            <span className="hidden lg:block"><Brand /></span>
            <span className="hidden border-s border-border/60 ps-3 text-xs font-medium text-muted-foreground sm:block">{areaLabel}</span>
          </button>
          <div className="ec-glass hidden rounded-full p-1 lg:block">
            <LiquidNav items={toLiquid(topNav)} active={currentPage} ariaLabel={t('navigation.dashboard')} />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageSelector />
            <ThemeToggle />
            <UserMenu showName />
          </div>
        </div>
      </header>

      <main ref={mainRef} className="ec-portal-body flex-1 overflow-y-auto overflow-x-hidden pb-28 lg:pb-0" data-ec-main>
        <div className="ec-page-enter">{children}</div>
      </main>

      <nav className="fixed inset-x-3 z-50 lg:hidden" style={{ bottom: 'max(12px, env(safe-area-inset-bottom))' }} aria-label={t('navigation.menu')}>
        <div className="ec-glass flex items-stretch justify-between gap-1 rounded-[1.6rem] p-1.5">
          {topNav.map((item) => {
            const active = currentPage === item.id;
            return (
              <button key={item.id} onClick={() => go(item.href)} aria-current={active ? 'page' : undefined} className={cn('flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[1.2rem] px-1 py-2 text-[11px] font-semibold transition-all duration-300 active:scale-95', active ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
                <span className={cn('grid h-8 w-8 place-items-center rounded-full transition-all duration-300', active && 'bg-primary text-primary-foreground shadow-[0_6px_14px_-6px_hsl(var(--primary)/.9)]')}>
                  <item.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="max-w-full truncate leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

const Layout = (props: LayoutProps) => {
  const { user } = useAuth();
  if (user?.role === 'CLIENT') {
    return (
      <TraineeShell current={props.currentPage || 'dashboard'} immersive={props.immersive}>
        {props.children}
      </TraineeShell>
    );
  }
  return <LayoutInner {...props} />;
};

export default Layout;
