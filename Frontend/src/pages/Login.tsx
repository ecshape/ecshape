import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Lock, Eye, EyeOff, ArrowLeft, ArrowRight, Dumbbell, UserRound } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { EcMark } from '@/components/brand/EcMark';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../components/LanguageSelector';
import ThemeToggle from '../components/ThemeToggle';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, demoLogin } = useAuth();
  const [demoRoles, setDemoRoles] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/demo-accounts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDemoRoles(d?.enabled ? d.roles : []))
      .catch(() => setDemoRoles([]));
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  const goHome = (role?: string) => {
    if (role === 'ADMIN') navigate('/admin', { replace: true });
    else if (role === 'TRAINER') navigate('/trainer-dashboard', { replace: true });
    else navigate(location.state?.from?.pathname || '/', { replace: true });
  };

  const handleDemo = async (role: 'trainer' | 'client') => {
    setLoading(true);
    setError('');
    try {
      const u = await demoLogin(role);
      if (u) goHome(u.role);
      else setError(t('messages.error.general'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const loggedInUser = await login(username, password);
      if (loggedInUser) {
        // Redirect to appropriate dashboard based on user role
        if (loggedInUser.role === 'ADMIN') {
          navigate('/admin', { replace: true });
        } else if (loggedInUser.role === 'TRAINER') {
          navigate('/trainer-dashboard', { replace: true });
        } else if (loggedInUser.role === 'CLIENT') {
          navigate('/', { replace: true });
        } else {
          const from = location.state?.from?.pathname || '/';
          navigate(from, { replace: true });
        }
      } else {
        setError(t('auth.invalidCredentials'));
      }
    } catch (error) {
      console.error('Login error:', error);
      setError(t('messages.error.general'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* ---------- Form side ---------- */}
      <section className="relative z-10 flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" dir="ltr" aria-label="ECshape">
            <EcMark variant="trainer" className="h-11 w-auto" />
            <span className="font-num text-xl tracking-wide">EC<span className="text-primary">SHAPE</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <ThemeToggle />
          </div>
        </header>

        <div className="flex flex-1 items-center">
          <div className="ec-stagger mx-auto w-full max-w-[420px] py-12">
            <span className="ec-eyebrow">{t('auth.welcomeBack')}</span>
            <h1 className="font-display mt-4 text-[clamp(3.6rem,9vw,5.6rem)]">
              {t('auth.login')}
              <span className="text-primary">.</span>
            </h1>
            <p className="mt-3 text-muted-foreground">{t('auth.loginToContinue')}</p>

            <form onSubmit={handleSubmit} className="mt-10 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username" className="font-semibold">{t('auth.username', 'Username')}</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-14 ps-12 text-base"
                    placeholder={t('auth.enterUsername', 'Enter username')}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="font-semibold">{t('auth.password')}</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-14 pe-12 ps-12 text-base"
                    placeholder={t('auth.enterPassword')}
                    required
                  />
                  <button
                    type="button"
                    className="absolute end-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[.06] hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="animate-fade-in rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" size="lg" className="h-14 w-full justify-between ps-7 pe-2 text-base" disabled={loading}>
                <span>{loading ? t('common.loading') : t('auth.signIn')}</span>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15">
                  {loading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <Arrow className="!size-5" />
                  )}
                </span>
              </Button>
            </form>

            {demoRoles.length > 0 && (
              <div className="mt-8">
                <div className="mb-3 flex items-center gap-3 text-xs font-bold uppercase tracking-[.2em] text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  {t('auth.demoAccess')}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(['trainer', 'client'] as const).filter((r) => demoRoles.includes(r)).map((r) => {
                    const Icon = r === 'trainer' ? Dumbbell : UserRound;
                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={loading}
                        onClick={() => handleDemo(r)}
                        className="ec-demo-btn group flex items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-3 text-start transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/[.06] disabled:opacity-50"
                      >
                        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-primary/12 text-primary transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold">{t(`auth.demo.${r}`)}</span>
                          <span className="block truncate text-xs text-muted-foreground">{t(`auth.demo.${r}Hint`)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <Link
          to="/"
          className="group mx-auto mb-6 inline-flex w-full max-w-[420px] items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <Arrow className="h-4 w-4 rotate-180 transition-transform duration-300 group-hover:-translate-x-0.5" />
          {isRtl ? 'חזרה לאתר ECshape' : 'Back to the ECshape site'}
        </Link>
        <footer className="text-xs text-muted-foreground">© {new Date().getFullYear()} ECshape · Elior Cremisi</footer>
      </section>

      {/* ---------- Brand side (desktop) ---------- */}
      <aside className="relative hidden overflow-hidden lg:block" aria-hidden="true">
        <div className="absolute inset-3 overflow-hidden rounded-[2rem] bg-primary">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(70% 60% at 50% 30%, hsl(var(--gold) / .55), transparent 70%), linear-gradient(180deg, hsl(var(--primary)), hsl(18 85% 38%))',
            }}
          />
          <div
            className="absolute inset-x-0 top-10 select-none text-center font-num leading-[.8] text-white/15"
            style={{ fontSize: 'clamp(7rem, 15vw, 15rem)' }}
            dir="ltr"
          >
            ECSHAPE
          </div>
          <img
            src={`/elior.png?v=${__STATIC_BUST__}`}
            alt=""
            className="absolute bottom-0 left-1/2 h-[88%] w-auto max-w-none -translate-x-1/2 object-contain object-bottom drop-shadow-[0_30px_40px_rgba(0,0,0,.35)]"
          />
          <div className="absolute inset-x-6 bottom-6 flex items-end justify-between gap-4 rounded-3xl bg-black/25 p-5 text-white backdrop-blur-md">
            <p className="font-display text-4xl leading-[.95]">
              {isRtl ? <>לא עוד מאמן,<br />שותף לדרך.</> : <>Not just a coach —<br />a partner.</>}
            </p>
            <span className="font-num text-5xl leading-none">100+</span>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default Login;
