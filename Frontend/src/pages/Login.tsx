import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dumbbell, User, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../components/LanguageSelector';
import ThemeToggle from '../components/ThemeToggle';
import { useTheme } from '../contexts/ThemeContext';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { theme } = useTheme();

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
          // Fallback to home
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
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Layer 1: Base Background (z-0) - always visible */}
      {/* Base background is handled by the div's className */}
      
      {/* Layer 2: PNG Image (z-1) - both themes */}
      <div 
        className="absolute inset-0 z-[1]"
        style={{
          backgroundImage: `url(/elior.png?v=${__STATIC_BUST__})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      
      {/* Layer 3: Overlay Background (z-2) - both themes, on top of PNG */}
      <div 
        className="absolute inset-0 z-[2]" 
        style={{
          backgroundColor: theme === 'dark' 
            ? 'hsl(var(--background) / 0.5)'
            : 'hsl(var(--background) / 0.3)',
        }}
      />

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden z-[3]">
        <div className="absolute -top-1/2 -left-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-1/2 -right-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      </div>

      {/* Language and Theme Toggle - Outside card */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        <LanguageSelector />
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in mt-24 sm:mt-32 md:mt-40">
        {/* Login Form with Halo Gradient Background */}
        <div className="relative">
          {/* Halo gradient background */}
          <div 
            className="absolute inset-0 -z-10 rounded-lg blur-2xl opacity-60"
            style={{
              background: 'radial-gradient(circle at center, rgba(251, 146, 60, 0.3) 0%, rgba(251, 146, 60, 0.1) 40%, transparent 70%)',
            }}
          />
          
          {/* Matte card - completely matte with slight transparency */}
          <Card className="border-border/50 shadow-lg transform hover:scale-[1.02] transition-all duration-300 !bg-background/85 backdrop-blur-sm">
            <CardHeader className="text-center py-4">
              {/* ECShape Brand Text - Inside card with Airbolt font */}
              <div className="mb-4">
                <h1 
                  className="text-4xl sm:text-5xl md:text-6xl font-bold text-gradient mb-1" 
                  style={{ 
                    fontFamily: "'Airbolt', 'Racing Sans One', cursive",
                    letterSpacing: '0.1em',
                    textShadow: '0 0 20px rgba(251, 146, 60, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3)',
                    fontWeight: 'normal'
                  }}
                >
                  ECShape
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  התחברות למערכת
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-foreground font-medium">{t('auth.username', 'Username')}</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={`pl-10 border-border/50 focus:border-primary transition-colors ${
                        theme === 'dark' 
                          ? 'bg-muted/80 text-foreground' 
                          : 'bg-secondary text-foreground'
                      }`}
                      placeholder={t('auth.enterUsername', 'Enter username')}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground font-medium">{t('auth.password')}</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`pl-12 pr-3 text-right border-border/50 focus:border-primary transition-colors ${
                        theme === 'dark' 
                          ? 'bg-muted/80 text-foreground' 
                          : 'bg-secondary text-foreground'
                      }`}
                      placeholder={t('auth.enterPassword')}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute left-10 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-transparent z-10 flex items-center justify-center"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>

                {error && (
                  <div className="text-destructive text-sm font-medium bg-destructive/10 p-3 rounded-lg border border-destructive/20">
                    {error}
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full gradient-orange hover:gradient-orange-dark text-background font-semibold h-12 transform hover:scale-105 transition-all duration-200"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin"></div>
                      <span>{t('common.loading')}</span>
                    </div>
                  ) : (
                    t('auth.signIn')
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Login;
