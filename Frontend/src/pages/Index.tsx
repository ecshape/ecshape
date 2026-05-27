import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, Target, Utensils, TrendingUp, Plus, Calendar, Clock, CheckCircle, Users, Trophy, Flame, UserPlus, Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config/api';
import { DailyCheckInCardV2 } from '../components/DailyCheckInCardV2';
import { DashboardHeader } from '../components/DashboardHeader';
import { DashboardWeightCard } from '../components/DashboardWeightCard';
import { DashboardCaloriesCard } from '../components/DashboardCaloriesCard';

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
  const { t } = useTranslation();
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
          color: 'bg-gradient-to-tr from-blue-500 to-blue-700'
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
      gradient: 'bg-gradient-to-r from-blue-500 to-blue-600',
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
      gradient: 'bg-gradient-to-r from-purple-500 to-purple-600',
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
      gradient: 'bg-gradient-to-r from-purple-500 to-purple-600',
    },
  ];

  if (loading) {
    return (
      <Layout currentPage="dashboard">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
            <span className="text-muted-foreground">{t('dashboard.loading')}</span>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage="dashboard">
      <div className="pb-20 lg:pb-8 min-h-screen bg-background">
        {/* Dashboard Header (Client only) */}
        {!isTrainer && !isAdmin && user && (
          <DashboardHeader 
            user={user}
            unreadMessages={0}
            unreadNotifications={0}
          />
        )}

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
          {/* Daily Check-In Card (Client only) */}
          {!isTrainer && !isAdmin && (
            <DailyCheckInCardV2 />
          )}

          {/* Progress Cards Grid (Client only) */}
          {!isTrainer && !isAdmin && (
            <div className="grid grid-cols-1 gap-4">
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


          {/* Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Training Section */}
            <Card className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl hover:shadow-2xl transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-foreground">
                  <Dumbbell className="w-5 h-5 text-primary" />
                  <span>{isTrainer ? t('training.training') : t('training.training')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold text-foreground">
                    {isTrainer ? `${stats.totalWorkoutPlans} ${t('training.workoutPlans')}` : 
                      clientStats 
                        ? `${clientStats.totalDays} ${t('training.workouts')}`
                        : `0 ${t('training.workouts')}`}
                  </span>
                  <Badge className="gradient-orange text-background">
                    {isTrainer ? `${stats.totalCompletions} ${t('training.completed')}` : 
                      clientStats && clientStats.totalDays > 0
                        ? `${clientStats.completedDays}/${clientStats.totalDays} ${t('training.completed')}`
                        : `0/0 ${t('training.completed')}`}
                  </Badge>
                </div>
                <Progress 
                  value={isTrainer ? stats.completionRate : 
                    (clientStats && clientStats.totalDays > 0
                      ? (clientStats.completedDays / clientStats.totalDays) * 100
                      : 0)} 
                  className="h-3 bg-secondary" 
                />
                <Button 
                  onClick={() => navigate('/training')}
                  className="w-full gradient-orange text-background font-semibold transform hover:scale-105 transition-all duration-200"
                >
                  <Target className="w-4 h-4 mr-2" />
                  {isTrainer ? t('training.workoutPlans') : t('training.workouts')}
                </Button>
              </CardContent>
            </Card>

            {/* Nutrition Section */}
            <Card className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl hover:shadow-2xl transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-foreground">
                  <Utensils className="w-5 h-5 text-green-500" />
                  <span>{isTrainer ? t('meals.meals') : t('meals.meals')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold text-foreground">
                    {isTrainer ? `${stats.totalMealPlans} ${t('meals.mealPlans')}` : 
                      clientStats 
                        ? `${clientStats.completedMeals}/${clientStats.totalMeals} ${t('meals.meals')}`
                        : `0/0 ${t('meals.meals')}`}
                  </span>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    {isTrainer ? `${stats.activeClients} ${t('client.clients')}` : 
                      clientStats
                        ? `${Math.round(clientStats.averageCalories7Days)} ${t('meals.kcal')}`
                        : `0 ${t('meals.kcal')}`}
                  </Badge>
                </div>
                <Progress 
                  value={isTrainer ? (stats.totalMealPlans > 0 ? 67 : 0) : 
                    (clientStats && clientStats.totalMeals > 0
                      ? (clientStats.completedMeals / clientStats.totalMeals) * 100
                      : 0)} 
                  className="h-3 bg-secondary" 
                />
                <Button 
                  onClick={() => navigate('/meals')}
                  className="w-full bg-green-500 hover:bg-green-600 text-background font-semibold transform hover:scale-105 transition-all duration-200"
                >
                  <Utensils className="w-4 h-4 mr-2" />
                  {isTrainer ? t('meals.mealPlans') : t('meals.meals')}
                </Button>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </Layout>
  );
};

export default Index;
