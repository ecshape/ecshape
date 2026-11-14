import React, { useState, useEffect } from 'react';
import { EcSpinner } from '@/components/brand/EcLoader';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, Target, Utensils, ArrowLeft, ArrowRight, TrendingUp, Plus, Calendar, Clock, CheckCircle, Users, Trophy, Flame, UserPlus, Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config/api';
import { DailyCheckInCardV2 } from '../components/DailyCheckInCardV2';
import { PageHeader } from '../components/PageHeader';
import { DashboardWeightCard } from '../components/DashboardWeightCard';
import { DashboardCaloriesCard } from '../components/DashboardCaloriesCard';
import TodayScreen from '@/features/trainee/TodayScreen';

interface DashboardStats {
  totalClients: number;
  totalWorkoutPlans: number;
  totalMealPlans: number;
  totalCompletions: number;
  activeClients: number;
  completionRate: number;
}

interface RecentActivity {
  id: string;
  title: string;
  description: string;
  time: string;
  type: 'workout' | 'meal' | 'client' | 'progress';
  clientName?: string;
  icon: any;
  color: string;
}

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isTrainer = user?.role === 'TRAINER';
  const isAdmin = user?.role === 'ADMIN';
  
  // Redirect trainers to trainer dashboard and admins to admin dashboard
  useEffect(() => {
    if (isTrainer) {
      navigate('/trainer-dashboard');
    } else if (isAdmin) {
      navigate('/admin');
    }
  }, [isTrainer, isAdmin, navigate]);
  
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    totalWorkoutPlans: 0,
    totalMealPlans: 0,
    totalCompletions: 0,
    activeClients: 0,
    completionRate: 0
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientStats, setClientStats] = useState<{
    totalDays: number;
    completedDays: number;
    totalMeals: number;
    completedMeals: number;
    averageCalories7Days: number; // Actually total calories for 7 days
  } | null>(null);
  
  // New state for dashboard cards
  const [weightData, setWeightData] = useState<Array<{ date: string; weight: number }>>([]);
  const [caloriesData, setCaloriesData] = useState<{ 
    consumed: number; 
    target: number;
    macros?: {
      protein: { consumed: number; target: number };
      carbs: { consumed: number; target: number };
      fat: { consumed: number; target: number };
    };
  }>({ consumed: 0, target: 0 });

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // If client, fetch their real stats
      if (!isTrainer && !isAdmin && user?.id) {
        // Fetch workout plans and sessions
        const [workoutPlansRes, mealPlansRes] = await Promise.all([
          fetch(`${API_BASE_URL}/v2/workouts/plans?client_id=${user.id}`, { headers }),
          fetch(`${API_BASE_URL}/v2/meals/plans?client_id=${user.id}`, { headers })
        ]);

        const workoutPlans = workoutPlansRes.ok ? await workoutPlansRes.json() : [];
        const mealPlans = mealPlansRes.ok ? await mealPlansRes.json() : [];

        // Count total workouts (workout days) in the training plan
        let totalWorkouts = 0;
        let completedWorkouts = 0;
        
        for (const plan of workoutPlans) {
          if (plan.workout_days && Array.isArray(plan.workout_days)) {
            totalWorkouts += plan.workout_days.length;
            
            // Check completed sessions for each day
            for (const day of plan.workout_days) {
              try {
                const sessionsRes = await fetch(
                  `${API_BASE_URL}/v2/workouts/sessions?client_id=${user.id}&workout_day_id=${day.id}`,
                  { headers }
                );
                if (sessionsRes.ok) {
                  const sessions = await sessionsRes.json();
                  const hasCompleted = Array.isArray(sessions) && sessions.some((s: any) => s.is_completed === true);
                  if (hasCompleted) {
                    completedWorkouts++;
                  }
                }
              } catch (err) {
                console.error(`Failed to fetch sessions for day ${day.id}:`, err);
              }
            }
          }
        }

        // Count meals per day from active meal plan and completed meals for today
        // Meals reset at midnight (00:00)
        let totalMealsPerDay = 0;
        let completedMealsToday = 0;
        const today = new Date().toISOString().split('T')[0];

        // Find active meal plan to get number_of_meals per day
        const activeMealPlan = mealPlans.find((plan: any) => plan.is_active === true);
        if (activeMealPlan && activeMealPlan.number_of_meals) {
          totalMealsPerDay = activeMealPlan.number_of_meals;
        }

        // Fetch today's meal completions (resets at midnight)
        try {
          const completionsRes = await fetch(
            `${API_BASE_URL}/v2/meals/completions?date=${today}`,
            { headers }
          );
          if (completionsRes.ok) {
            const completions = await completionsRes.json();
            completedMealsToday = Array.isArray(completions) 
              ? completions.filter((c: any) => c.is_completed === true).length
              : 0;
          }
        } catch (err) {
          console.error('Failed to fetch meal completions:', err);
        }

        // Fetch total calories for last 7 days (sum of calories per day)
        let totalCalories7Days = 0;
        try {
          const avgCaloriesRes = await fetch(
            `${API_BASE_URL}/v2/meals/history/average?days=7`,
            { headers }
          );
          if (avgCaloriesRes.ok) {
            const avgData = await avgCaloriesRes.json();
            // Use total_calories if available, otherwise calculate from average
            if (avgData.total_calories !== undefined) {
              totalCalories7Days = Math.round(avgData.total_calories);
            } else if (avgData.average_calories && avgData.total_days) {
              totalCalories7Days = Math.round(avgData.average_calories * avgData.total_days);
            }
          }
        } catch (err) {
          console.error('Failed to fetch calories:', err);
        }

        // Fetch weight data for dashboard
        try {
          const progressRes = await fetch(`${API_BASE_URL}/progress/?client_id=${user.id}`, { headers });
          if (progressRes.ok) {
            const progressData = await progressRes.json();
            const weightEntries = progressData
              .filter((entry: any) => entry.weight !== null && entry.weight !== undefined)
              .sort((a: any, b: any) => new Date(a.date || a.recorded_at).getTime() - new Date(b.date || b.recorded_at).getTime())
              .slice(-7)
              .map((entry: any) => ({
                date: entry.date || entry.recorded_at,
                weight: entry.weight
              }));
            setWeightData(weightEntries);
          }
        } catch (err) {
          console.error('Failed to fetch weight data:', err);
        }

        // Fetch today's calories and macros
        try {
          const today = new Date().toISOString().split('T')[0];
          const macrosRes = await fetch(
            `${API_BASE_URL}/v2/meals/daily-macros?client_id=${user.id}&date=${today}`,
            { headers }
          );
          if (macrosRes.ok) {
            const macros = await macrosRes.json();
            setCaloriesData({
              consumed: macros.consumed?.calories || 0,
              target: macros.targets?.calories || 0,
              macros: {
                protein: {
                  consumed: macros.consumed?.protein || 0,
                  target: macros.targets?.protein || 0
                },
                carbs: {
                  consumed: macros.consumed?.carbs || 0,
                  target: macros.targets?.carbs || 0
                },
                fat: {
                  consumed: macros.consumed?.fat || 0,
                  target: macros.targets?.fat || 0
                }
              }
            });
          }
        } catch (err) {
          console.error('Failed to fetch today calories:', err);
        }


        setStats({
          totalClients: 0,
          totalWorkoutPlans: workoutPlans.length,
          totalMealPlans: mealPlans.length,
          totalCompletions: completedWorkouts,
          activeClients: 0,
          completionRate: totalWorkouts > 0 ? (completedWorkouts / totalWorkouts) * 100 : 0
        });

        // Store client-specific stats for display
        setClientStats({
          totalDays: totalWorkouts, // Total workouts in plan
          completedDays: completedWorkouts, // Completed workouts
          totalMeals: totalMealsPerDay, // Meals per day (resets at midnight)
          completedMeals: completedMealsToday, // Completed meals today
          averageCalories7Days: totalCalories7Days // Total calories in 7 days (sum)
        });

        setLoading(false);
        return;
      }

      // Trainer/Admin dashboard logic continues below...
      if (!isTrainer) {
        setLoading(false);
        return;
      }

      // Fetch clients
      const clientsResponse = await fetch(`${API_BASE_URL}/users/`, { headers });
      const clients = clientsResponse.ok ? await clientsResponse.json() : [];
      const clientUsers = clients.filter((u: any) => u.role === 'CLIENT');

      // Fetch workout plans
      const workoutResponse = await fetch(`${API_BASE_URL}/workouts/plans`, { headers });
      const workoutPlans = workoutResponse.ok ? await workoutResponse.json() : [];

      // Fetch meal plans
      const mealResponse = await fetch(`${API_BASE_URL}/meal-plans/`, { headers });
      const mealPlans = mealResponse.ok ? await mealResponse.json() : [];

      // Fetch recent completions
      const completionsResponse = await fetch(`${API_BASE_URL}/workouts/completions?size=5`, { headers });
      const completions = completionsResponse.ok ? await completionsResponse.json() : [];

      // Calculate stats
      const activeClients = clientUsers.filter((c: any) => c.is_active).length;
      const totalCompletions = completions.length;
      const completionRate = workoutPlans.length > 0 ? (totalCompletions / (workoutPlans.length * 10)) * 100 : 0; // Rough estimate

      setStats({
        totalClients: clientUsers.length,
        totalWorkoutPlans: workoutPlans.length,
        totalMealPlans: mealPlans.length,
        totalCompletions,
        activeClients,
        completionRate: Math.min(completionRate, 100)
      });

      // Build recent activity
      const activities: RecentActivity[] = [];

      // Add recent workout completions
      completions.slice(0, 3).forEach((completion: any) => {
        activities.push({
          id: `completion-${completion.id}`,
          title: `${completion.client_name || 'Client'} completed workout`,
          description: `${completion.exercise_name || 'Exercise'} - ${completion.actual_sets} sets`,
          time: formatTimeAgo(new Date(completion.completed_at)),
          type: 'workout',
          clientName: completion.client_name,
          icon: CheckCircle,
          color: 'bg-gradient-to-tr from-green-500 to-green-700'
        });
      });

      // Add recent client registrations
      const recentClients = clientUsers
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 2);
      
      recentClients.forEach((client: any) => {
        activities.push({
          id: `client-${client.id}`,
          title: `New client joined: ${client.full_name}`,
          description: `Started their fitness journey`,
          time: formatTimeAgo(new Date(client.created_at)),
          type: 'client',
          clientName: client.full_name,
          icon: UserPlus,
          color: 'bg-gradient-to-tr from-primary to-[hsl(18_85%_40%)]'
        });
      });

      // Add recent meal plan activities
      const recentMealPlans = mealPlans
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 2);
      
      recentMealPlans.forEach((plan: any) => {
        activities.push({
          id: `meal-${plan.id}`,
          title: `Created meal plan: ${plan.title}`,
          description: `${plan.total_calories} calories for ${plan.client_name || 'client'}`,
          time: formatTimeAgo(new Date(plan.created_at)),
          type: 'meal',
          clientName: plan.client_name,
          icon: Utensils,
          color: 'bg-gradient-to-tr from-orange-500 to-orange-700'
        });
      });

      // Sort activities by time and take top 5
      activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setRecentActivity(activities.slice(0, 5));

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [isTrainer]);

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return t('dates.today');
    if (diffInHours < 24) return `${diffInHours} ${t('common.time')}`;
    if (diffInHours < 48) return t('dates.yesterday');
    return `${Math.floor(diffInHours / 24)} ${t('dates.today')}`;
  };

  const statsCards = isTrainer || isAdmin ? [
    {
      label: t('dashboard.totalClients'),
      value: stats.totalClients.toString(),
      icon: Users,
      gradient: 'bg-gradient-to-r from-primary to-[hsl(18_85%_44%)]',
    },
    {
      label: t('training.workoutPlans'),
      value: stats.totalWorkoutPlans.toString(),
      icon: CheckCircle,
      gradient: 'bg-gradient-to-r from-green-500 to-green-600',
    },
    {
      label: t('meals.mealPlans'),
      value: stats.totalMealPlans.toString(),
      icon: Utensils,
      gradient: 'bg-gradient-to-r from-orange-500 to-orange-600',
    },
    {
      label: t('training.completionRate'),
      value: `${Math.round(stats.completionRate)}%`,
      icon: Trophy,
      gradient: 'bg-gradient-to-r from-[hsl(var(--gold))] to-primary',
    },
  ] : [
    {
      label: t('meals.totalCaloriesWeek', 'סה"כ קלוריות בשבוע'),
      value: clientStats ? `${clientStats.averageCalories7Days} ${t('meals.kcal')}` : `0 ${t('meals.kcal')}`,
      icon: Flame,
      gradient: 'bg-gradient-to-r from-orange-500 to-orange-600',
    },
    {
      label: t('training.workoutPlans'),
      value: stats.totalWorkoutPlans.toString(),
      icon: CheckCircle,
      gradient: 'bg-gradient-to-r from-green-500 to-green-600',
    },
    {
      label: t('meals.mealPlans'),
      value: stats.totalMealPlans.toString(),
      icon: Utensils,
      gradient: 'bg-gradient-to-r from-orange-500 to-orange-600',
    },
    {
      label: t('training.completionRate'),
      value: `${Math.round(stats.completionRate)}%`,
      icon: Trophy,
      gradient: 'bg-gradient-to-r from-[hsl(var(--gold))] to-primary',
    },
  ];

  if (loading) {
    return (
      <Layout currentPage="dashboard">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex items-center space-x-2">
            <EcSpinner className="w-6 h-6" />
            <span className="text-muted-foreground">{t('dashboard.loading')}</span>
          </div>
        </div>
      </Layout>
    );
  }

  const firstName = (user?.full_name || '').split(' ')[0];
  const trainingPct = isTrainer
    ? stats.completionRate
    : clientStats && clientStats.totalDays > 0
    ? (clientStats.completedDays / clientStats.totalDays) * 100
    : 0;
  const mealsPct = isTrainer
    ? (stats.totalMealPlans > 0 ? 67 : 0)
    : clientStats && clientStats.totalMeals > 0
    ? (clientStats.completedMeals / clientStats.totalMeals) * 100
    : 0;
  const ArrowIcon = i18n.language === 'he' ? ArrowLeft : ArrowRight;

  return (
    <Layout currentPage="dashboard">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
        <PageHeader
          eyebrow={new Date().toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          title={<>{t('dashboard.hiThere', 'Hi there')}{firstName ? `, ${firstName}` : ''}</>}
          accent={t('dashboard.letsMove')}
        />

        <div className="ec-stagger space-y-4 sm:space-y-6">
          {/* Daily Check-In Card (Client only) */}
          {!isTrainer && !isAdmin && <DailyCheckInCardV2 />}

          {/* Quick Actions */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Training */}
            <button
              onClick={() => navigate('/training')}
              className="group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-[1.5rem] bg-primary p-6 text-start text-primary-foreground shadow-[0_24px_50px_-24px_hsl(var(--primary)/.9)] transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Dumbbell className="pointer-events-none absolute -bottom-6 -end-6 h-40 w-40 rotate-[-18deg] text-white/10 transition-transform duration-700 group-hover:rotate-0" />
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
                  <Target className="h-4 w-4" />
                  {t('training.training')}
                </span>
                <span className="grid h-11 w-11 place-items-center rounded-full bg-white/15 transition-transform duration-500 group-hover:scale-110">
                  <ArrowIcon className="h-5 w-5" />
                </span>
              </div>
              <div>
                <div className="font-num text-5xl leading-none" dir="ltr" style={{ textAlign: i18n.language === 'he' ? 'right' : 'left' }}>
                  {isTrainer
                    ? stats.totalWorkoutPlans
                    : clientStats && clientStats.totalDays > 0
                    ? `${clientStats.completedDays}/${clientStats.totalDays}`
                    : '0/0'}
                </div>
                <p className="mt-1 text-white/85">
                  {isTrainer ? t('training.workoutPlans') : `${t('training.workouts')} · ${t('training.completed')}`}
                </p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white transition-[width] duration-1000 ease-[cubic-bezier(.22,1,.36,1)]" style={{ width: `${Math.min(100, trainingPct)}%` }} />
                </div>
              </div>
            </button>

            {/* Nutrition */}
            <button
              onClick={() => navigate('/meals')}
              className="ec-card group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-[1.5rem] border border-border/60 bg-card p-6 text-start transition-[transform,border-color] duration-500 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Utensils className="pointer-events-none absolute -bottom-6 -end-6 h-40 w-40 rotate-[-18deg] text-foreground/[.04] transition-transform duration-700 group-hover:rotate-0" />
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-3 py-1 text-sm font-semibold text-primary">
                  <Utensils className="h-4 w-4" />
                  {t('meals.meals')}
                </span>
                <span className="grid h-11 w-11 place-items-center rounded-full bg-muted transition-colors duration-500 group-hover:bg-primary group-hover:text-primary-foreground">
                  <ArrowIcon className="h-5 w-5" />
                </span>
              </div>
              <div>
                <div className="flex items-end justify-between gap-3">
                  <div className="font-num text-5xl leading-none" dir="ltr">
                    {isTrainer
                      ? stats.totalMealPlans
                      : clientStats
                      ? `${clientStats.completedMeals}/${clientStats.totalMeals}`
                      : '0/0'}
                  </div>
                  <Badge variant="outline" className="mb-1">
                    {isTrainer
                      ? `${stats.activeClients} ${t('client.clients')}`
                      : `${clientStats ? Math.round(clientStats.averageCalories7Days) : 0} ${t('meals.kcal')}`}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{isTrainer ? t('meals.mealPlans') : t('meals.meals')}</p>
                <Progress value={mealsPct} className="mt-4 h-2" />
              </div>
            </button>
          </div>

          {/* Progress Cards (Client only) */}
          {!isTrainer && !isAdmin && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <DashboardWeightCard
                weightEntries={weightData}
                onViewDetailsClick={() => navigate('/progress')}
              />
              <DashboardCaloriesCard
                consumed={caloriesData.consumed}
                target={caloriesData.target}
                macros={caloriesData.macros}
                onViewDetailsClick={() => navigate('/meals')}
              />
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

/** Trainees get the "Today" home; trainers/admins keep their dashboards (they are redirected from here). */
const IndexRoute = () => {
  const { user } = useAuth();
  if (user?.role === 'CLIENT') {
    return (
      <Layout currentPage="dashboard">
        <TodayScreen />
      </Layout>
    );
  }
  return <Index />;
};

export default IndexRoute;
