import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import TrainingDayPage from "./pages/TrainingDayPage";
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
import './i18n/config';
const queryClient = new QueryClient();

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
          <ProtectedRoute requiredRole="TRAINER">
            <ClientProfile />
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
          <ProtectedRoute requiredRole="TRAINER">
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

      {/* Trainer/Client routes */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <Index />
          </ProtectedRoute>
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
      <Route 
        path="/training/day/:dayId" 
        element={
          <ProtectedRoute>
            <TrainingDayPage />
          </ProtectedRoute>
        } 
      />
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

      {/* Catch all route - show 404 */}
      <Route 
        path="*" 
        element={
          <ProtectedRoute>
            <NotFound />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
};

const App = () => {
  const { i18n } = useTranslation();

  useEffect(() => {
    // Set initial direction and language based on current language
    // Check localStorage first, then i18n language, then default to Hebrew
    const storedLang = typeof window !== 'undefined' ? localStorage.getItem('i18nextLng') : null;
    const currentLang = storedLang && (storedLang === 'he' || storedLang === 'en')
      ? storedLang
      : (i18n.language || 'he');
    document.documentElement.dir = currentLang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;
    // Fallback language should match user preference so missing keys show in chosen language
    if (i18n.options) {
      i18n.options.fallbackLng = currentLang;
    }
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
                  <AppRoutes />
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
