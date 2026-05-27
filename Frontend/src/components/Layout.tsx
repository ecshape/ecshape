import React from 'react';
import { Button } from "@/components/ui/button";
import { Dumbbell, Home, Utensils, Target, TrendingUp, Menu, X, LogOut, User, Shield, Settings, Users, MessageSquare } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import LanguageSelector from './LanguageSelector';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface LayoutProps {
  children: React.ReactNode;
  currentPage?: string;
}

const LogoBadge = ({ variant }: { variant: 'mobile' | 'desktop' }) => {
  const sizeClasses =
    variant === 'mobile'
      ? 'h-16 sm:h-20 md:h-24 w-auto'
      : 'h-full w-auto';

  return (
    <div
      className={`${sizeClasses} flex items-center justify-center flex-shrink-0 overflow-hidden`}
      aria-hidden="true"
    >
      <img
        src="/logonavbar.png"
        alt="ECshape logo"
        className="h-full w-auto object-contain"
        loading="lazy"
        style={{ maxHeight: '100%', maxWidth: '100%' }}
      />
    </div>
  );
};

const Layout = ({ children, currentPage = 'dashboard' }: LayoutProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const isTrainer = user?.role === 'TRAINER';
  const isAdmin = user?.role === 'ADMIN';

  const baseNavigationItems = isAdmin ? [
    { id: 'dashboard', label: t('navigation.dashboard'), icon: Home, href: '/' },
    { id: 'users', label: t('navigation.users'), icon: User, href: '/users' },
    { id: 'system', label: t('navigation.system'), icon: Settings, href: '/system' }
  ] : isTrainer ? [
    { id: 'dashboard', label: t('navigation.dashboard'), icon: Home, href: '/trainer-dashboard' },
    { id: 'exercises', label: t('navigation.exercises'), icon: Dumbbell, href: '/exercises' },
    { id: 'meal-bank', label: t('foodBank.title'), icon: Utensils, href: '/meal-bank' },
    { id: 'chat', label: t('navigation.chat'), icon: MessageSquare, href: '/chat' }
  ] : [
    { id: 'dashboard', label: t('navigation.dashboard'), icon: Home, href: '/' },
    { id: 'meals', label: t('navigation.meals'), icon: Utensils, href: '/meals' },
    { id: 'training', label: t('navigation.training'), icon: Target, href: '/training' }, 
    { id: 'progress', label: t('navigation.progress'), icon: TrendingUp, href: '/progress' },
    { id: 'chat', label: t('navigation.chat'), icon: MessageSquare, href: '/chat' }
  ];

  const navigationItems =
    i18n.language === "he" ? [...baseNavigationItems].reverse() : baseNavigationItems;

  const handleNavigation = (href: string) => {
    navigate(href);
    setMobileMenuOpen(false);
  };

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      {/* Mobile Header */}
      <div className="sticky top-0 z-50 bg-card/95 backdrop-blur-lg border-b border-border/50 lg:hidden">
        <div className="flex items-center justify-between px-2 sm:px-4 h-24 sm:h-28 md:h-32 gap-2 overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="transform hover:scale-105 transition-transform duration-300">
              <LogoBadge variant="mobile" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground truncate">
                {isAdmin ? t('layout.adminPanel') : isTrainer ? t('layout.trainerDashboard') : t('layout.clientPortal')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <LanguageSelector />
            <ThemeToggle />
            <div className="flex items-center gap-1 sm:gap-2 me-1 sm:me-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-r from-primary to-primary/80 flex items-center justify-center text-sm sm:text-base flex-shrink-0">
                👤
              </div>
              <span className="text-xs sm:text-sm font-medium text-foreground hidden md:inline truncate max-w-[80px]">{user?.full_name}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 sm:w-6 sm:h-6" /> : <Menu className="w-5 h-5 sm:w-6 sm:h-6" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div 
            className="absolute top-full left-0 right-0 bg-card/95 backdrop-blur-lg border-b border-border/50 animate-slide-up"
            dir={i18n.language === 'he' ? 'rtl' : 'ltr'}
          >
            <div className="px-4 py-3 space-y-1">
              {navigationItems.map((item) => (
                <Button
                  key={item.id}
                  variant={currentPage === item.id ? "default" : "ghost"}
                  className={`w-full justify-start transform hover:scale-105 transition-all duration-200 ${
                    currentPage === item.id 
                      ? "gradient-orange text-background font-semibold shadow-lg" 
                      : "hover:bg-secondary"
                  }`}
                  onClick={() => handleNavigation(item.href)}
                >
                  <item.icon className="w-5 h-5 me-3" />
                  <span>{item.label}</span>
                </Button>
              ))}
              <div className="pt-2 border-t border-border/30">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={logout}
                >
                  <LogOut className="w-5 h-5 me-3" />
                  <span>{t('auth.logout')}</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Header */}
      <div
        className="hidden lg:block sticky top-0 z-50 bg-card/95 backdrop-blur-lg border-b border-border/50 overflow-hidden"
        dir="ltr"
      >
        <div className="w-full h-32">
          <div className="flex items-center justify-between h-full gap-2">
            {/* Left side: Logout -> Username & Icon -> Theme & Language */}
            <div className="flex items-center gap-2 xl:gap-3 flex-shrink-0 pl-4 lg:pl-6">
              {/* Logout */}
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0 w-10 h-10 xl:w-12 xl:h-12"
              >
                <LogOut className="w-5 h-5 xl:w-6 xl:h-6" />
              </Button>
              
              {/* Username & Icon */}
              <div className="flex items-center gap-2 xl:gap-3 border-r border-border/30 pr-2 xl:pr-3 h-full">
                <div className="w-10 h-10 xl:w-12 xl:h-12 rounded-full bg-gradient-to-r from-primary to-primary/80 flex items-center justify-center text-base xl:text-lg shadow-lg flex-shrink-0">
                  👤
                </div>
                <div className="text-end hidden xl:block">
                  <p className="text-sm font-semibold text-foreground">{user?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{user?.role ? t(`roles.${user.role}`) : ''}</p>
                </div>
              </div>
              
              {/* Theme & Language */}
              <div className="flex items-center gap-2 xl:gap-3 border-r border-border/30 pr-2 xl:pr-3 h-full">
                <ThemeToggle />
                <LanguageSelector />
              </div>
            </div>

            {/* Center: 4 Navigation Tabs */}
            <div className="flex-1 min-w-0 flex items-center justify-center h-full">
              <nav 
                className={`flex items-center gap-1 lg:gap-2 xl:gap-3 overflow-x-auto scrollbar-hide px-2 h-full ${i18n.language === 'he' ? 'flex-row-reverse' : ''}`}
                dir={i18n.language === 'he' ? 'rtl' : 'ltr'}
              >
                {navigationItems.map((item) => (
                  <Button
                    key={item.id}
                    variant={currentPage === item.id ? "default" : "ghost"}
                    className={`flex items-center gap-1.5 lg:gap-2 px-3 lg:px-4 xl:px-5 text-xs lg:text-sm xl:text-base whitespace-nowrap transform hover:scale-105 transition-all duration-200 flex-shrink-0 h-auto ${
                      currentPage === item.id 
                        ? "gradient-orange text-background font-semibold shadow-lg" 
                        : "hover:bg-secondary"
                    }`}
                    onClick={() => handleNavigation(item.href)}
                  >
                    <item.icon className="w-4 h-4 xl:w-5 xl:h-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </Button>
                ))}
              </nav>
            </div>

            {/* Right side: Page Title -> Logo */}
            <div className="flex items-center gap-2 xl:gap-3 flex-shrink-0 h-full pr-4 lg:pr-6">
              {/* Page Title */}
              <div className="flex-shrink-0 border-r border-border/30 pr-2 xl:pr-3 h-full flex items-center">
                <div className="bg-card border border-border/50 rounded-lg px-2 xl:px-3 py-1.5 xl:py-2 max-w-[160px] xl:max-w-[180px]">
                  <p
                    className="text-[10px] xl:text-xs text-muted-foreground break-words leading-tight text-center"
                    dir="rtl"
                  >
                    {isAdmin ? t('layout.adminSubtitle') : isTrainer ? t('layout.trainerSubtitle') : t('layout.clientSubtitle')}
                  </p>
                </div>
              </div>
              
              {/* Logo - Constrained to navbar height */}
              <div className="flex-shrink-0 h-full w-32 xl:w-40 flex items-center justify-end overflow-hidden">
                <div className="h-full w-full flex items-center justify-end">
                  <img
                    src="/logonavbar.png"
                    alt="ECshape logo"
                    className="h-full w-auto object-contain max-h-full max-w-full"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 lg:pb-0">
        {children}
      </main>

      {/* Mobile Bottom Navigation - Alternative approach */}
      <div 
        className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-lg border-t border-border/50 lg:hidden shadow-2xl z-50 overflow-hidden"
        dir={i18n.language === 'he' ? 'rtl' : 'ltr'}
      >
        <div className={`flex items-center justify-around px-2 sm:px-3 pt-3 pb-2 overflow-x-auto scrollbar-hide ${i18n.language === 'he' ? 'flex-row-reverse' : ''}`} style={{ paddingBottom: 'max(8px, calc(env(safe-area-inset-bottom) + 8px))' }}>
          {navigationItems.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              className={`flex flex-col items-center gap-1 sm:gap-1.5 min-h-[56px] sm:min-h-[52px] py-2 sm:py-2.5 px-3 sm:px-4 min-w-0 flex-shrink-0 transform hover:scale-105 transition-all duration-200 ${
                currentPage === item.id 
                  ? "text-primary bg-primary/10" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => handleNavigation(item.href)}
            >
              <item.icon className={`w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 ${currentPage === item.id ? 'text-primary' : ''}`} />
              <span className="text-xs sm:text-sm font-medium truncate max-w-[70px] sm:max-w-none leading-tight">{item.label}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Layout;
