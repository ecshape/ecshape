import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, LayoutGrid, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EcMark } from '@/components/brand/EcMark';
import LanguageSelector from '@/components/LanguageSelector';
import ThemeToggle from '@/components/ThemeToggle';
import { usePortalMotion } from '@/lib/portalMotion';
import { useLiquid } from './ui';

export type TrainerNavEntry = { id: string; label: string; icon: React.ElementType; href: string; badge?: number };
export type TrainerNavGroup = { title: string; items: TrainerNavEntry[] };

const COLLAPSE_KEY = 'ec.trainer.rail';
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

/** The logo draws itself when the app opens, not on every page change. */
const APP_OPENED_AT = typeof performance !== 'undefined' ? performance.now() : 0;
const drawBrandOnce = () => typeof performance !== 'undefined' && performance.now() - APP_OPENED_AT < 2500;

const Wordmark: React.FC<{ className?: string }> = ({ className }) => (
  <span className={cn('font-num text-lg leading-none tracking-wide', className)} dir="ltr">
    EC<span className="text-primary">SHAPE</span>
  </span>
);

/**
 * Trainer app shell: glass sidebar with a liquid active indicator (collapsible to an icon rail), compact top bar,
 * phone bottom bar with a sliding pill, and a soft route transition. The root carries `data-ec-shell` so the docked
 * Agent EC panel can push it aside; `<main>` carries `data-ec-main`.
 */
const TrainerShell: React.FC<{
  groups: TrainerNavGroup[];
  currentPage: string;
  mobilePrimary: string[];
  userMenu: React.ReactNode;
  children: React.ReactNode;
}> = ({ groups, currentPage, mobilePrimary, userMenu, children }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dir = i18n.language?.startsWith('he') ? 'rtl' : 'ltr';
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  usePortalMotion(mainRef);

  const all = groups.flatMap((g) => g.items);
  const active = all.find((i) => i.id === currentPage);
  const activeGroup = groups.find((g) => g.items.some((i) => i.id === currentPage));
  const phoneItems = mobilePrimary.map((id) => all.find((i) => i.id === id)).filter(Boolean) as TrainerNavEntry[];
  const phoneActive = phoneItems.some((i) => i.id === currentPage) ? currentPage : '__more';

  const sideBlob = useLiquid(navRef, active ? `${currentPage}:${collapsed}` : null, 'y', 'trainer-side');
  const barBlob = useLiquid(barRef, phoneActive, 'x', 'trainer-bar');

  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const toggleRail = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* private mode */
      }
      return !c;
    });
  };

  const go = (href: string) => {
    if (href !== pathname) navigate(href);
  };

  return (
    <div className="tr-root tp-root tr-shell ec-portal-shell" dir={dir} data-ec-shell>
      {/* Desktop sidebar */}
      <aside className="tr-side ec-glass" data-collapsed={collapsed} aria-label={t('trainer.shell.sidebar')}>
        <button
          type="button"
          onClick={() => go('/trainer-dashboard')}
          className="tp-press mb-5 flex min-h-[3rem] items-center gap-2.5 overflow-hidden rounded-2xl px-2 text-start"
          aria-label={t('trainer.shell.home')}
        >
          <EcMark variant="trainer" className={cn('h-10 w-auto flex-none', drawBrandOnce() && 'ec-brand-mark')} />
          <span className="tr-hide-rail flex min-w-0 flex-1 items-center justify-between gap-2">
            <Wordmark />
            <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">{t('studio.name')}</span>
          </span>
        </button>

        <div className="-me-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pe-1">
          <nav ref={navRef} className="tr-nav" aria-label={t('trainer.shell.navigation')}>
            <span className="tr-blob" data-phase={sideBlob.phase} style={sideBlob.style} aria-hidden />
            {groups.map((g) => (
              <div key={g.title} className="tr-nav-group">
                <p className="tr-nav-title tr-hide-rail">{g.title}</p>
                {g.items.map((item) => {
                  const on = item.id === currentPage;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => go(item.href)}
                      aria-current={on ? 'page' : undefined}
                      data-liquid-active={on || undefined}
                      className="tr-nav-link"
                      title={collapsed ? item.label : undefined}
                    >
                      <item.icon className="tr-nav-ico" />
                      <span className="tr-hide-rail min-w-0 truncate">{item.label}</span>
                      {!!item.badge && <span className="tr-nav-badge">{item.badge > 99 ? '99+' : item.badge}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-3 border-t border-border/50 pt-3">
          <button
            type="button"
            onClick={toggleRail}
            className="tr-nav-link"
            aria-expanded={!collapsed}
            aria-label={collapsed ? t('trainer.shell.expand') : t('trainer.shell.collapse')}
            title={collapsed ? t('trainer.shell.expand') : undefined}
          >
            {(dir === 'rtl') !== collapsed ? <PanelLeftOpen className="tr-nav-ico" /> : <PanelLeftClose className="tr-nav-ico" />}
            <span className="tr-hide-rail truncate">{t('trainer.shell.collapse')}</span>
          </button>
        </div>
      </aside>

      <div className="tr-main">
        <header className="tr-topbar" data-scrolled={scrolled}>
          <button type="button" onClick={() => go('/trainer-dashboard')} className="tp-press flex items-center gap-2 rounded-xl lg:hidden" aria-label={t('trainer.shell.home')}>
            <EcMark variant="trainer" className="h-9 w-auto" />
            <Wordmark />
          </button>
          <div className="tr-crumb hidden lg:flex">
            {activeGroup && <span className="truncate">{activeGroup.title}</span>}
            {activeGroup && active && <ChevronRight className="h-3.5 w-3.5 flex-none opacity-60 rtl:rotate-180" />}
            {active && <b className="truncate">{active.label}</b>}
          </div>
          <div className="flex items-center gap-1.5">
            <LanguageSelector compact />
            <ThemeToggle />
            {userMenu}
          </div>
        </header>

        <main
          ref={mainRef}
          className="tr-body ec-portal-body"
          data-ec-main
          onScroll={(e) => {
            const s = e.currentTarget.scrollTop > 8;
            if (s !== scrolled) setScrolled(s);
          }}
        >
          <div className="tr-route" key={pathname}>{children}</div>
        </main>
      </div>

      {/* Phone bottom bar */}
      <nav className="tr-tabbar" aria-label={t('trainer.shell.navigation')}>
        <div ref={barRef} className="ec-glass relative flex items-stretch gap-0.5 rounded-[1.6rem] p-1.5">
          <span className="tr-hblob" data-phase={barBlob.phase} style={barBlob.style} aria-hidden />
          {phoneItems.map((item) => {
            const on = currentPage === item.id;
            return (
              <button key={item.id} type="button" onClick={() => go(item.href)} aria-current={on ? 'page' : undefined} data-liquid-active={on || undefined} className="tr-tab">
                <item.icon className="h-[19px] w-[19px]" />
                <span className="max-w-full truncate px-0.5 leading-none">{item.label}</span>
                {!!item.badge && <span className="tp-dot">{item.badge > 9 ? '9+' : item.badge}</span>}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-current={phoneActive === '__more' ? 'page' : undefined}
            data-liquid-active={phoneActive === '__more' || undefined}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className="tr-tab"
          >
            <LayoutGrid className="h-[19px] w-[19px]" />
            <span className="leading-none">{t('navigation.menu')}</span>
          </button>
        </div>
      </nav>

      {/* Phone "more" sheet */}
      <div className={cn('tr-more lg:hidden', !moreOpen && 'pointer-events-none')} data-open={moreOpen} aria-hidden={!moreOpen}>
        <div className="tr-more-scrim" onClick={() => setMoreOpen(false)} />
        <div className="tr-more-panel ec-glass" role="dialog" aria-modal="true" aria-label={t('navigation.menu')}>
          <div className="mb-3 flex items-center justify-between">
            <span className="tp-title text-4xl">{t('studio.name')}</span>
            <button type="button" onClick={() => setMoreOpen(false)} className="tp-icon-btn tp-press" aria-label={t('trainer.common.close')} tabIndex={moreOpen ? 0 : -1}>
              <X className="h-5 w-5" />
            </button>
          </div>
          {groups.map((g, gi) => (
            <div key={g.title} className="mb-4">
              <p className="tp-label mb-2 px-1">{g.title}</p>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map((i, ii) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => go(i.href)}
                    aria-current={currentPage === i.id ? 'page' : undefined}
                    className="tr-more-item tp-press relative"
                    style={{ ['--i' as string]: gi * 4 + ii }}
                    tabIndex={moreOpen ? 0 : -1}
                  >
                    <i.icon className="h-5 w-5" />
                    <span className="max-w-full truncate">{i.label}</span>
                    {!!i.badge && <span className="tp-dot" style={{ insetInlineEnd: '.5rem', top: '.5rem' }}>{i.badge > 9 ? '9+' : i.badge}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrainerShell;
