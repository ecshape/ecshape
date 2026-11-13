import React, { useEffect, useRef, useState } from 'react';
import {
  Dumbbell, Home, Utensils, Target, TrendingUp, LogOut, User, Settings, MessageSquare, ChevronDown,
  Users2, Sparkles, Globe2, Megaphone, Bug, LayoutGrid, X, ExternalLink, SlidersHorizontal,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import LanguageSelector from './LanguageSelector';
import ThemeToggle from './ThemeToggle';
import LiquidNav, { type LiquidItem } from './LiquidNav';
import AgentSidekick from './studio/AgentSidekick';
import { AgentSidekickProvider } from '@/contexts/AgentSidekickContext';
import { usePortalMotion, usePortalRoot } from '@/lib/portalMotion';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { studioApi } from '@/lib/studioApi';

interface LayoutProps {
  children: React.ReactNode;
  currentPage?: string;
}

const getInitials = (name?: string) =>
  (name || '?').split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().slice(0, 2);

const Brand = ({ compact = false }: { compact?: boolean }) => (
  <div className="flex select-none items-center gap-2.5" dir="ltr">
    <img src="/logonavbar.png" alt="ECshape" className={cn('w-auto object-contain', compact ? 'h-9' : 'h-11')} />
    <span className={cn('font-num leading-none tracking-wide', compact ? 'text-lg' : 'text-xl')}>
      EC<span className="text-primary">SHAPE</span>
    </span>
  </div>
);

type NavEntry = { id: string; label: string; icon: React.ElementType; href: string; badge?: number };

const LayoutInner = ({ children, currentPage = 'dashboard' }: LayoutProps) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const dir = i18n.language?.startsWith('he') ? 'rtl' : 'ltr';
  const [moreOpen, setMoreOpen] = useState(false);
  const [newLeads, setNewLeads] = useState(0);
  const mainRef = useRef<HTMLElement>(null);

  const isTrainer = user?.role === 'TRAINER';
  const isAdmin = user?.role === 'ADMIN';

  usePortalRoot(true);
  usePortalMotion(mainRef);

  useEffect(() => {
    if (!isTrainer) return;
    studioApi.overview().then((o) => setNewLeads(o.leads_new)).catch(() => setNewLeads(0));
  }, [isTrainer, location.pathname]);
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

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
        { id: 'chat', label: t('navigation.chat'), icon: MessageSquare, href: '/chat' },
      ],
    },
    {
      title: t('studio.groupBusiness'),
      items: [
        { id: 'prospects', label: t('studio.nav.prospects'), icon: Users2, href: '/studio/prospects', badge: newLeads },
        { id: 'agent', label: t('studio.nav.agent'), icon: Sparkles, href: '/studio/agent' },
      ],
    },
    {
      title: t('studio.groupStudio'),
      items: [
        { id: 'site', label: t('studio.nav.site'), icon: Globe2, href: '/studio/site' },
        { id: 'seo', label: t('studio.nav.seo'), icon: Megaphone, href: '/studio/seo' },
        { id: 'qa', label: t('studio.nav.qa'), icon: Bug, href: '/studio/qa' },
        { id: 'preferences', label: t('studio.nav.preferences'), icon: SlidersHorizontal, href: '/studio/preferences' },
      ],
    },
  ];
  const trainerAll = trainerGroups.flatMap((g) => g.items);
  const topNav = isAdmin ? adminNav : clientNav;
  const toLiquid = (items: NavEntry[]): LiquidItem[] => items.map((i) => ({ id: i.id, label: i.label, icon: i.icon, badge: i.badge, onClick: () => go(i.href) }));

  const areaLabel = isAdmin ? t('layout.adminPanel') : isTrainer ? t('layout.trainerDashboard') : t('layout.clientPortal');

  const UserMenu = ({ showName }: { showName: boolean }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="group flex items-center gap-2.5 rounded-full p-1 pe-3 transition-colors hover:bg-foreground/[.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={user?.full_name || 'account'}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/.8)]">{getInitials(user?.full_name)}</span>
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
          <DropdownMenuItem onClick={() => go('/studio/preferences')} className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            {t('studio.nav.preferences')}
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
    const mobilePrimary = ['dashboard', 'prospects', 'agent', 'chat'].map((id) => trainerAll.find((i) => i.id === id)!) as NavEntry[];
    return (
      <div className="ec-portal-shell flex h-screen overflow-hidden bg-background" dir={dir}>
        <aside className="ec-glass relative z-40 m-3 hidden w-[264px] flex-none flex-col rounded-[1.75rem] p-4 lg:flex" data-ec-enter>
          <button onClick={() => go('/trainer-dashboard')} className="mb-6 flex items-center justify-between rounded-2xl px-2 py-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Brand compact />
            <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">{t('studio.name')}</span>
          </button>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pe-1">
            {trainerGroups.map((g) => (
              <div key={g.title}>
                <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[.14em] text-muted-foreground/80">{g.title}</p>
                <LiquidNav orientation="vertical" items={toLiquid(g.items)} active={g.items.some((i) => i.id === currentPage) ? currentPage : '__none'} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-4">
            <UserMenu showName={false} />
            <div className="flex items-center gap-1.5">
              <LanguageSelector compact />
              <ThemeToggle />
            </div>
          </div>
        </aside>

        <div className="ec-portal-main flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-2 border-b border-border/50 bg-background/70 px-3 backdrop-blur-xl lg:hidden">
            <button onClick={() => go('/trainer-dashboard')}><Brand compact /></button>
            <div className="flex items-center gap-1.5">
              <LanguageSelector compact />
              <ThemeToggle />
              <UserMenu showName={false} />
            </div>
          </header>

          <main ref={mainRef} className="ec-portal-body min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-28 lg:pb-0">
            <div className="ec-page-enter">{children}</div>
          </main>
        </div>

        <nav className="fixed inset-x-3 z-50 lg:hidden" style={{ bottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="ec-glass flex items-stretch justify-between gap-1 rounded-[1.6rem] p-1.5">
            {mobilePrimary.map((item) => {
              const active = currentPage === item.id;
              return (
                <button key={item.id} onClick={() => go(item.href)} aria-current={active ? 'page' : undefined} className={cn('relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[1.2rem] px-1 py-2 text-[11px] font-semibold transition-all duration-300 active:scale-95', active ? 'text-primary' : 'text-muted-foreground')}>
                  <span className={cn('grid h-8 w-8 place-items-center rounded-full transition-all duration-300', active && 'bg-primary text-primary-foreground shadow-[0_6px_14px_-6px_hsl(var(--primary)/.9)]')}>
                    <item.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="max-w-full truncate leading-none">{item.label}</span>
                  {!!item.badge && <span className="absolute end-3 top-1 min-w-4 rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">{item.badge}</span>}
                </button>
              );
            })}
            <button onClick={() => setMoreOpen(true)} className={cn('flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[1.2rem] px-1 py-2 text-[11px] font-semibold text-muted-foreground transition-all active:scale-95', !mobilePrimary.some((m) => m.id === currentPage) && 'text-primary')}>
              <span className="grid h-8 w-8 place-items-center rounded-full"><LayoutGrid className="h-[18px] w-[18px]" /></span>
              <span className="leading-none">{t('navigation.menu')}</span>
            </button>
          </div>
        </nav>

        <div className={cn('fixed inset-0 z-[60] lg:hidden', moreOpen ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!moreOpen}>
          <div className={cn('absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300', moreOpen ? 'opacity-100' : 'opacity-0')} onClick={() => setMoreOpen(false)} />
          <div className={cn('ec-glass absolute inset-x-3 bottom-3 rounded-[1.75rem] p-4 transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)]', moreOpen ? 'translate-y-0' : 'translate-y-[110%]')}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-3xl">{t('studio.name')}</span>
              <button onClick={() => setMoreOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-muted"><X className="h-4 w-4" /></button>
            </div>
            {trainerGroups.map((g) => (
              <div key={g.title} className="mb-3">
                <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-[.14em] text-muted-foreground">{g.title}</p>
                <div className="grid grid-cols-3 gap-2">
                  {g.items.map((i) => (
                    <button key={i.id} onClick={() => go(i.href)} className={cn('flex flex-col items-center gap-1.5 rounded-2xl border border-border/60 px-2 py-3 text-xs font-semibold transition-colors', currentPage === i.id ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card/60')}>
                      <i.icon className="h-5 w-5" />
                      <span className="truncate">{i.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Docked beside the portal — site/studio stay visible */}
        {currentPage !== 'agent' && <AgentSidekick />}
      </div>
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

      <main ref={mainRef} className="ec-portal-body flex-1 overflow-y-auto overflow-x-hidden pb-28 lg:pb-0">
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
  const isTrainer = user?.role === 'TRAINER';
  return (
    <AgentSidekickProvider enabled={!!isTrainer}>
      <LayoutInner {...props} />
    </AgentSidekickProvider>
  );
};

export default Layout;
