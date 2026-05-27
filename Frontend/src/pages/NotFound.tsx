import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "../contexts/AuthContext";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  useEffect(() => {
    // Auto-redirect after 10 seconds
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          redirectToDashboard();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const redirectToDashboard = () => {
    if (user?.role === 'ADMIN') {
      navigate('/admin', { replace: true });
    } else if (user?.role === 'TRAINER') {
      navigate('/trainer-dashboard', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="text-center text-4xl font-bold mb-2">404</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-xl text-foreground mb-2">
            {t('error.pageNotFound', 'Page Not Found')}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {t('error.redirectMessage', 'You will be redirected automatically in {{count}} seconds', { count: countdown })}
          </p>
          <Button onClick={redirectToDashboard} className="w-full">
            {t('error.returnToDashboard', 'Return to Dashboard')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotFound;
