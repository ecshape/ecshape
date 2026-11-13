import React from 'react';
import { Dumbbell, Home, Utensils, Target, TrendingUp, LogOut, User, Settings, MessageSquare, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import LanguageSelector from './LanguageSelector';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface LayoutProps {
  children: React.ReactNode;
  currentPage?: string;
}

const getInitials = (name?: string) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

/** Logo mark + wordmark, same lockup as the marketing site. */
const Brand = ({ compact = false }: { compact?: boolean }) => (
  <div className="flex items-center gap-2.5 select-none" dir="ltr">
    <img
      src="/logonavbar.png"
      alt="ECshape"
      className={cn('w-auto object-contain', compact ? 'h-9' : 'h-11')}
      loading="eager"
    />
    <span className={cn('font-num tracking-wide leading-none', compact ? 'text-lg' : 'text-xl')}>
      EC<span className="text-primary">SHAPE</span>
    </span>
  </div>
);

const Layout = ({ children, currentPage = 'dashboard' }: LayoutProps) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const dir = i18n.language === 'he' ? 'rtl' : 'ltr';

  const isTrainer = user?.role === 'TRAINER';
  const isAdmin = user?.role === 'ADMIN';

  const navigationItems = isAdmin
    ? [
        { id: 'dashboard', label: t('navigation.dashboard'), icon: Home, href: '/' },
        { id: 'users', label: t('navigation.users'), icon: User, href: '/users' },
        { id: 'system', label: t('navigation.system'), icon: Settings, href: '/system' },
      ]
    : isTrainer
    ? [
        { id: 'dashboard', label: t('navigation.dashboard'), icon: Home, href: '/trainer-dashboard' },
        { id: 'exercises', label: t('navigation.exercises'), icon: Dumbbell, href: '/exercises' },
        { id: 'meal-bank', label: t('foodBank.title'), icon: Utensils, href: '/meal-bank' },
        { id: 'chat', label: t('navigation.chat'), icon: MessageSquare, href: '/chat' },
      ]
    : [
        { id: 'dashboard', label: t('navigation.dashboard'), icon: Home, href: '/' },
        { id: 'meals', label: t('navigation.meals'), icon: Utensils, href: '/meals' },
        { id: 'training', label: t('navigation.training'), icon: Target, href: '/training' },
        { id: 'progress', label: t('navigation.progress'), icon: TrendingUp, href: '/progress' },
        { id: 'chat', label: t('navigation.chat'), icon: MessageSquare, href: '/chat' },
      ];

  const areaLabel = isAdmin ? t('layout.adminPanel') : isTrainer ? t('layout.trainerDashboard') : t('layout.clientPortal');

  const UserMenu = ({ showName }: { showName: boolean }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="group flex items-center gap-2.5 rounded-full p-1 pe-3 transition-colors hover:bg-foreground/[.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={user?.full_name || 'account'}
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/.8)]">
            {getInitials(user?.full_name)}
          </span>
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
        <DropdownMenuItem
          onClick={logout}
          className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          {t('auth.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background" dir={dir}>
      {/* ---------- Top bar ---------- */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-3 sm:px-5 lg:h-[76px] lg:px-8">
          <button onClick={() => navigate(navigationItems[0].href)} className="flex items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="lg:hidden"><Brand compact /></span>
            <span className="hidden lg:block"><Brand /></span>
            <span className="hidden border-s border-border/60 ps-3 text-xs font-medium text-muted-foreground sm:block">{areaLabel}</span>
          </button>

          {/* Desktop navigation: segmented pill */}
          <nav
            className="hidden items-center gap-1 rounded-full border border-border/60 bg-card/70 p-1 lg:flex"
            aria-label={t('navigation.dashboard')}
          >
            {navigationItems.map((item) => {
              const active = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.href)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_hsl(var(--primary)/.9)]'
                      : 'text-muted-foreground hover:bg-foreground/[.06] hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageSelector />
            <ThemeToggle />
            <UserMenu showName />
          </div>
        </div>
      </header>

      {/* ---------- Content ---------- */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-28 lg:pb-0">
        <div className="animate-fade-in">{children}</div>
      </main>

      {/* ---------- Mobile floating tab bar ---------- */}
      <nav
        className="fixed inset-x-3 z-50 lg:hidden"
        style={{ bottom: 'max(12px, env(safe-area-inset-bottom))' }}
        aria-label={t('navigation.dashboard')}
      >
        <div className="flex items-stretch justify-between gap-1 rounded-[1.6rem] border border-border/60 bg-card/85 p-1.5 shadow-[0_20px_40px_-16px_rgba(0,0,0,.7)] backdrop-blur-xl">
          {navigationItems.map((item) => {
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.href)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[1.2rem] px-1 py-2 text-[11px] font-semibold transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] active:scale-95',
                  active ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-full transition-all duration-300',
                    active && 'bg-primary text-primary-foreground shadow-[0_6px_14px_-6px_hsl(var(--primary)/.9)]'
                  )}
                >
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

export default Layout;
