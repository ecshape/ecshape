import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { EcMark } from '@/components/brand/EcMark';
import { useAuth } from '../contexts/AuthContext';
import '@/i18n/ticketsStudio';
import '@/features/trainee/trainee.css';

/**
 * 404 for everyone (A2A site #5 / r2 F3): visitors are offered the site's home, signed-in users their dashboard.
 * The redirect runs from an effect (calling navigate inside a state updater logged a React render warning).
 */
const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [countdown, setCountdown] = useState(10);

  const home = user?.role === 'ADMIN' ? '/admin' : user?.role === 'TRAINER' ? '/trainer-dashboard' : '/';
  const label = user ? t('error.returnToDashboard', 'Return to Dashboard') : t('notFound.backHome', 'Back to the home page');

  useEffect(() => {
    document.title = `404 · ECshape`;
    const timer = window.setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [location.pathname]);

  useEffect(() => {
    if (countdown === 0) navigate(home, { replace: true });
  }, [countdown, home, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="tp-card w-full max-w-md p-8 text-center">
        <EcMark variant="ring" className="mx-auto h-14 w-14" />
        <p className="tp-num mt-5 text-7xl leading-none text-primary">404</p>
        <h1 className="tp-title mt-3 text-4xl">{t('error.pageNotFound', 'Page Not Found')}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t('error.redirectMessage', 'You will be redirected automatically in {{count}} seconds', { count: countdown })}
        </p>
        <button type="button" onClick={() => navigate(home, { replace: true })} className="tp-btn tp-btn--primary tp-press mt-6 w-full">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {label}
        </button>
      </div>
    </div>
  );
};

export default NotFound;
