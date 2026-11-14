import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { publicApi } from "@/lib/studioApi";
import { useTranslation } from 'react-i18next';
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { NotificationContainer } from "./components/NotificationContainer";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import TrainingPage from "./pages/TrainingPage";
import { ExplorePage, HistoryPage, MeasuresPage, RoutinePage, SessionDetailPage, SessionPage } from "./features/trainee/training/pages";
import ProgressPage from "./pages/ProgressPage";
import WorkoutDetailPage from "./pages/WorkoutDetailPage";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";
import UsersPage from './pages/UsersPage';
import SystemPage from './pages/SystemPage';
import TrainerDashboard from './pages/TrainerDashboard';
import ClientProfile from './pages/ClientProfile';
import EditClient from './pages/EditClient';
import CreateExercise from './pages/CreateExercise';
import CreateWorkout from './pages/CreateWorkout';
import ExerciseBank from './pages/ExerciseBank';
import MealBank from './pages/MealBank';
import SecretUsersPage from './pages/SecretUsersPage';
import CreateWorkoutPlanV2 from './pages/CreateWorkoutPlanV2';
import ChatPage from './pages/ChatPage';
import MealsPageV3 from './pages/MealsPageV3';
import SandboxMealsV3 from './pages/SandboxMealsV3';
import TrainerWeeklyMealsPlannerV3 from './pages/TrainerWeeklyMealsPlannerV3';
import ClientFavoritesPage from './pages/ClientFavoritesPage';
import TraineeProfilePage from './features/trainee/ProfilePage';
import ProspectsPage from './pages/studio/ProspectsPage';
import MySitePage from './pages/studio/MySitePage';
import SeoPage from './pages/studio/SeoPage';
import QaPage from './pages/studio/QaPage';
import PreferencesPage from './pages/studio/PreferencesPage';
import { AgentSidekickProvider } from './contexts/AgentSidekickContext';
import AgentEc from './components/studio/AgentEc';
import './styles/agent-ec.css';
import './styles/info-tip.css';
import QaCaptureWidget from './components/studio/QaCaptureWidget';
import { useAuth } from './contexts/AuthContext';
import './i18n/config';
import './styles/qa-capture.css';
import './styles/portal-chrome.css';
import './styles/seo-studio.css';

// Public site (gsap + lenis) is code-split so the portal bundle stays lean.
const SitePage = lazy(() => import('./pages/SitePage'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const SiteFallback = () => <div className="min-h-screen" style={{ background: '#0b0a08' }} />;

/** "/" is the public site for visitors and the dashboard for signed-in users. */
const HomeRoute = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <SiteFallback />;
  if (isAuthenticated) {
    return (
      <ProtectedRoute>
        <Index />
      </ProtectedRoute>
    );
  }
  return (
    <Suspense fallback={<SiteFallback />}>
      <SitePage />
    </Suspense>
  );
};
/** Redirects followed in a row (guards against A -> B -> A loops). */
const redirectHops = { count: 0 };

/** Applies the SEO redirects managed in Studio → SEO before falling back to the 404 page. */
const RedirectGate = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    setChecked(false);
    publicApi
      .redirects()
      .then((rules) => {
        const norm = (p: string) => p.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
        const path = norm(location.pathname);
        const rule = rules.find((r) => norm(r.from) === path);
        // No rule, a rule pointing to this same page, or a chain of rules (A -> B -> A): show the 404 instead of looping.
        if (!rule || !alive || redirectHops.count >= 3 || (!/^https?:\/\//.test(rule.to) && norm(rule.to) === path)) {
          redirectHops.count = 0;
          return setChecked(true);
        }
        redirectHops.count += 1;
        window.setTimeout(() => (redirectHops.count = 0), 4000);
        if (/^https?:\/\//.test(rule.to)) window.location.replace(rule.to);
        else navigate(rule.to, { replace: true });
      })
      .catch(() => alive && setChecked(true));
    return () => {
      alive = false;
    };
  }, [location.pathname, navigate]);
  if (!checked) return <SiteFallback />;
  // Visitors get the 404 page too (not the login page): unknown public URLs must answer "not found" (A2A site #5)
  return <NotFound />;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

/** Agent EC lives at app level so it stays open from page to page (trainer studio only). */
const AgentHost = () => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const studio = isAuthenticated && user?.role === 'TRAINER';
  const onPublic = location.pathname === '/login' || location.pathname.startsWith('/home');
  if (!studio || onPublic) return null;
  return <AgentEc />;
};

const AppRoutes = () => {
  return (
    <Routes>
      {/* Public route - Login page */}
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        } 
      />

      {/* Admin routes */}
      <Route 
        path="/admin" 
        element={
          <ProtectedRoute requiredRole="ADMIN">
            <AdminDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/users" 
        element={
          <ProtectedRoute requiredRole="ADMIN">
            <UsersPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/system" 
        element={
          <ProtectedRoute requiredRole="ADMIN">
            <SystemPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/secret-users" 
        element={
          <ProtectedRoute requiredRole="ADMIN">
            <SecretUsersPage />
          </ProtectedRoute>
        } 
      />

      {/* Trainer routes */}
      <Route 
        path="/trainer-dashboard" 
        element={
          <ProtectedRoute requiredRole="TRAINER">
            <TrainerDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/client/:clientId" 
        element={
          <ProtectedRoute requiredRole={["TRAINER", "ADMIN"]}>
            <ClientProfile />
          </ProtectedRoute>
        } 
      />
      <Route
        path="/client/:clientId/favorites"
        element={
          <ProtectedRoute requiredRole={["TRAINER", "ADMIN"]}>
            <ClientFavoritesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/client/:clientId/edit"
        element={
          <ProtectedRoute requiredRole="TRAINER">
            <EditClient />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/create-exercise" 
        element={
          <ProtectedRoute requiredRole="TRAINER">
            <CreateExercise />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/create-workout" 
        element={
          <ProtectedRoute requiredRole="TRAINER">
            <CreateWorkout />
          </ProtectedRoute>
        } 
      />
      <Route
        path="/create-meal-plan"
        element={
          <ProtectedRoute requiredRole="TRAINER">
            <Navigate to="/trainer-weekly-meals-v3" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/create-meal-plan-v3"
        element={
          <ProtectedRoute requiredRole="TRAINER">
            <Navigate to="/trainer-weekly-meals-v3" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trainer-weekly-meals-v3"
        element={
          <ProtectedRoute requiredRole={["TRAINER", "ADMIN"]}>
            <TrainerWeeklyMealsPlannerV3 />
          </ProtectedRoute>
        }
      />
      <Route 
        path="/create-workout-plan-v2" 
        element={
          <ProtectedRoute requiredRole="TRAINER">
            <CreateWorkoutPlanV2 />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/exercises" 
        element={
          <ProtectedRoute requiredRole="TRAINER">
            <ExerciseBank />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/meal-bank" 
        element={
          <ProtectedRoute requiredRole="TRAINER">
            <MealBank />
          </ProtectedRoute>
        } 
      />

      {/* Trainer studio */}
      <Route path="/studio" element={<Navigate to="/studio/prospects" replace />} />
      <Route path="/studio/prospects" element={<ProtectedRoute requiredRole={["TRAINER", "ADMIN"]}><ProspectsPage /></ProtectedRoute>} />
      <Route path="/studio/agent" element={<Navigate to="/trainer-dashboard" replace />} />
      <Route path="/studio/site" element={<ProtectedRoute requiredRole={["TRAINER", "ADMIN"]}><MySitePage /></ProtectedRoute>} />
      <Route path="/studio/seo" element={<ProtectedRoute requiredRole={["TRAINER", "ADMIN"]}><SeoPage /></ProtectedRoute>} />
      <Route path="/studio/qa" element={<ProtectedRoute requiredRole={["TRAINER", "ADMIN"]}><QaPage /></ProtectedRoute>} />
      <Route path="/studio/settings" element={<ProtectedRoute requiredRole={["TRAINER", "ADMIN"]}><PreferencesPage /></ProtectedRoute>} />
      <Route path="/studio/preferences" element={<Navigate to="/studio/settings" replace />} />

      {/* Trainer/Client routes */}
      <Route path="/" element={<HomeRoute />} />
      {/* Public site, reachable also when signed in */}
      <Route
        path="/home"
        element={
          <Suspense fallback={<SiteFallback />}>
            <SitePage />
          </Suspense>
        }
      />
      <Route
        path="/meals"
        element={
          <ProtectedRoute>
            <MealsPageV3 />
          </ProtectedRoute>
        }
      />
      <Route
        path="/meals/favorites"
        element={
          <ProtectedRoute requiredRole="CLIENT">
            <ClientFavoritesPage />
          </ProtectedRoute>
        }
      />
      <Route path="/me" element={<ProtectedRoute requiredRole="CLIENT"><TraineeProfilePage /></ProtectedRoute>} />
      <Route path="/meals-v3" element={<Navigate to="/meals" replace />} />
      <Route
        path="/sandbox/meals-v3"
        element={
          <ProtectedRoute requiredRole="CLIENT">
            <SandboxMealsV3 />
          </ProtectedRoute>
        }
      />
      <Route 
        path="/training" 
        element={
          <ProtectedRoute>
            <TrainingPage />
          </ProtectedRoute>
        } 
      />
      <Route path="/training/day/:dayId" element={<ProtectedRoute><RoutinePage /></ProtectedRoute>} />
      <Route path="/training/day/:dayId/session" element={<ProtectedRoute><SessionPage /></ProtectedRoute>} />
      <Route path="/training/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
      <Route path="/training/history/:sessionId" element={<ProtectedRoute><SessionDetailPage /></ProtectedRoute>} />
      <Route path="/training/explore" element={<ProtectedRoute><ExplorePage /></ProtectedRoute>} />
      <Route path="/progress/measures" element={<ProtectedRoute><MeasuresPage /></ProtectedRoute>} />
      <Route 
        path="/progress" 
        element={
          <ProtectedRoute>
            <ProgressPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/chat" 
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/workout/:id" 
        element={
          <ProtectedRoute>
            <WorkoutDetailPage />
          </ProtectedRoute>
        } 
      />

      <Route path="/blog" element={<Suspense fallback={<SiteFallback />}><BlogPage /></Suspense>} />
      <Route path="/blog/:slug" element={<Suspense fallback={<SiteFallback />}><BlogPage /></Suspense>} />

      {/* Catch all: SEO redirects first, then 404 */}
      <Route path="*" element={<RedirectGate />} />
    </Routes>
  );
};

const App = () => {
  const { i18n } = useTranslation();

  useEffect(() => {
    // Set initial direction and language based on current language
    // Check localStorage first, then i18n language, then default to Hebrew
    const storedLang = typeof window !== 'undefined' ? localStorage.getItem('i18nextLng') : null;
    const currentLang = storedLang && ['he', 'en', 'fr'].includes(storedLang) ? storedLang : (i18n.language || 'he');
    document.documentElement.dir = currentLang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;
  }, [i18n.language]);

  return (
    <div dir={i18n.language === 'he' ? 'rtl' : 'ltr'}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <ThemeProvider>
            <AuthProvider>
              <NotificationProvider>
                <BrowserRouter>
                  <AgentSidekickProvider>
                  <AppRoutes />
                  <AgentHost />
                  </AgentSidekickProvider>
                  {/* never inside the site editor / preview frames */}
                  {window.self === window.top && <QaCaptureWidget />}
                  <NotificationContainer />
                </BrowserRouter>
              </NotificationProvider>
            </AuthProvider>
          </ThemeProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </div>
  );
};

export default App;
