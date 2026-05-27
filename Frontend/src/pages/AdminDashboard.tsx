import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dumbbell, Target, Utensils, TrendingUp, Plus, Calendar, Clock, CheckCircle, Users, Trophy, Flame, UserPlus, Shield, Settings, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config/api';

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({ username: '', email: '', password: '', confirmPassword: '', full_name: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

  // --- New state for real stats ---
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTrainers: 0,
    totalClients: 0,
    systemHealth: '100%',
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      setStatsError('');
      try {
        const token = localStorage.getItem('access_token');
        if (!token) {
          setStatsError(t('admin.noAccessToken'));
          navigate('/login');
          return;
        }
        // Fetch all users
        const usersRes = await fetch(`${API_BASE_URL}/users/`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const trainersRes = await fetch(`${API_BASE_URL}/users/trainers`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const clientsRes = await fetch(`${API_BASE_URL}/users/clients`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!usersRes.ok) {
          const err = await usersRes.text();
          console.error('Users fetch failed:', err);
        }
        if (!trainersRes.ok) {
          const err = await trainersRes.text();
          console.error('Trainers fetch failed:', err);
        }
        if (!clientsRes.ok) {
          const err = await clientsRes.text();
          console.error('Clients fetch failed:', err);
        }
        if (!usersRes.ok || !trainersRes.ok || !clientsRes.ok) {
          throw new Error('Failed to fetch user stats');
        }
        const users = await usersRes.json();
        const trainers = await trainersRes.json();
        const clients = await clientsRes.json();
        
        // Fetch real system health
        const healthRes = await fetch(`${API_BASE_URL}/system/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const systemHealth = healthRes.ok ? await healthRes.json() : null;
        const healthPercent = systemHealth?.system_health === 'healthy' ? '100%' : systemHealth?.system_health === 'degraded' ? '75%' : '50%';
        
        setStats({
          totalUsers: users.length,
          totalTrainers: trainers.length,
          totalClients: clients.length,
          systemHealth: healthPercent,
        });
      } catch (err: any) {
        setStatsError(err.message || t('admin.failedToLoadStats'));
        console.error('Stats error:', err);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [navigate]);

  const statsCards = [
    {
      label: t('admin.totalUsers'),
      value: statsLoading ? '...' : stats.totalUsers.toString(),
      icon: Users,
      gradient: 'bg-gradient-to-r from-blue-500 to-blue-600',
    },
    {
      label: t('admin.activeTrainers'),
      value: statsLoading ? '...' : stats.totalTrainers.toString(),
      icon: Shield,
      gradient: 'bg-gradient-to-r from-green-500 to-green-600',
    },
    {
      label: t('admin.totalClients'),
      value: statsLoading ? '...' : stats.totalClients.toString(),
      icon: Users,
      gradient: 'bg-gradient-to-r from-purple-500 to-purple-600',
    },
    {
      label: t('admin.systemHealth'),
      value: stats.systemHealth,
      icon: CheckCircle,
      gradient: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
    },
  ];

  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // Fetch recent activity from recent user registrations
  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        const usersRes = await fetch(`${API_BASE_URL}/users/`, { headers });
        if (usersRes.ok) {
          const users = await usersRes.json();
          // Sort by created_at and take last 5
          const sortedUsers = users.sort((a: any, b: any) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ).slice(0, 5);
          
          const activities = sortedUsers.map((u: any) => {
            const roleKey = u.role === 'ADMIN' || u.role === 'admin' ? 'admin' : 
                           u.role === 'TRAINER' || u.role === 'trainer' ? 'trainer' : 'client';
            return {
              title: `${t(`time.${roleKey}Registered`)}: ${u.full_name}`,
              description: `${u.email} ${t('admin.entered')}`,
              time: formatTimeAgo(new Date(u.created_at)),
              icon: UserPlus,
              color: (u.role === 'ADMIN' || u.role === 'admin') ? 'bg-gradient-to-tr from-red-500 to-red-700' : 
                     (u.role === 'TRAINER' || u.role === 'trainer') ? 'bg-gradient-to-tr from-green-500 to-green-700' : 
                     'bg-gradient-to-tr from-purple-500 to-purple-700',
            };
          });
          setRecentActivity(activities);
        }
      } catch (error) {
        console.error('Error fetching activity:', error);
      }
    };
    if (user && user.role === 'admin') {
      fetchActivity();
    }
  }, [user]);

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    if (diffInMinutes < 1) return t('time.justNow');
    if (diffInMinutes < 60) return diffInMinutes === 1 ? t('time.minuteAgo') : `${diffInMinutes} ${t('time.minutesAgo')}`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return diffInHours === 1 ? t('time.hourAgo') : `${diffInHours} ${t('time.hoursAgo')}`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return t('time.yesterday');
    if (diffInDays < 7) return `${diffInDays} ${t('time.daysAgo')}`;
    return date.toLocaleDateString();
  };

  const handleRegisterTrainer = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Frontend validation
    if (registerForm.password !== registerForm.confirmPassword) {
      alert(t('admin.passwordsDoNotMatch'));
      return;
    }
    
    setLoading(true);

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/auth/register/trainer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...registerForm,
          role: 'TRAINER'
        }),
      });

      if (response.ok) {
        alert(t('admin.trainerRegisteredSuccess'));
        setIsRegisterDialogOpen(false);
        setRegisterForm({ username: '', email: '', password: '', confirmPassword: '', full_name: '' });
      } else {
        let errorMsg = t('admin.registrationFailed') + ': ';
        try {
          const errorData = await response.json();
          // Handle FastAPI validation errors - detail can be an array or string
          if (errorData.detail) {
            if (Array.isArray(errorData.detail)) {
              errorMsg += errorData.detail.map((e: any) => {
                const field = Array.isArray(e.loc) ? e.loc.slice(1).join('.') : 'field';
                return `${field}: ${e.msg}`;
              }).join('; ');
            } else {
              errorMsg += String(errorData.detail);
            }
          } else {
            errorMsg += 'Unknown error';
          }
        } catch (jsonErr) {
          errorMsg += 'Failed to parse error response';
        }
        alert(errorMsg);
      }
    } catch (error) {
      console.error('Registration error:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      alert(t('admin.errorOccurred') + ': ' + errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while fetching stats
  if (statsLoading) {
    return (
      <Layout currentPage="dashboard">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
            <span className="text-muted-foreground">{t('admin.loadingAdminDashboard')}</span>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage="dashboard">
      <div className="pb-20 lg:pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-card to-secondary px-4 lg:px-6 py-6 lg:py-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-gradient">
                  {t('admin.adminDashboard')}
                </h1>
                <p className="text-muted-foreground mt-1">
                  {t('admin.adminDashboardSubtitle')}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 lg:gap-3 w-full sm:w-auto">
                <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      className="gradient-orange hover:gradient-orange-dark text-background font-semibold transform hover:scale-105 transition-all duration-200 shadow-lg text-xs sm:text-sm w-full sm:w-auto min-w-0"
                    >
                      <UserPlus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0" />
                      <span className="hidden sm:inline truncate">{t('admin.registerTrainer')}</span>
                      <span className="sm:hidden truncate">{t('admin.register')}</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>{t('admin.registerNewTrainer')}</DialogTitle>
                      <DialogDescription>
                        {t('admin.registerNewTrainerDesc')}
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={e => { 
                      e.preventDefault(); 
                      if (registerForm.password !== registerForm.confirmPassword) { 
                        setPasswordError(t('admin.passwordsDoNotMatch')); 
                        return; 
                      } 
                      setPasswordError(''); 
                      handleRegisterTrainer(e); 
                    }} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="username">{t('admin.username')}</Label>
                        <Input
                          id="username"
                          value={registerForm.username}
                          onChange={(e) => setRegisterForm({...registerForm, username: e.target.value})}
                          placeholder={t('admin.enterUsername')}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">{t('admin.email')}</Label>
                        <Input
                          id="email"
                          type="email"
                          value={registerForm.email}
                          onChange={(e) => setRegisterForm({...registerForm, email: e.target.value})}
                          placeholder={t('admin.enterEmail')}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="full_name">{t('admin.fullName')}</Label>
                        <Input
                          id="full_name"
                          value={registerForm.full_name}
                          onChange={(e) => setRegisterForm({...registerForm, full_name: e.target.value})}
                          placeholder={t('admin.enterFullName')}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">{t('admin.password')}</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={registerForm.password}
                            onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })}
                            placeholder={t('admin.enterPassword')}
                            className="pl-10 pr-3 text-right"
                            required
                          />
                          <button type="button" className="absolute left-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 flex items-center justify-center hover:bg-transparent" onClick={() => setShowPassword(v => !v)}>
                            {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">{t('admin.confirmPassword')}</Label>
                        <div className="relative">
                          <Input
                            id="confirmPassword"
                            type={showConfirmPassword ? "text" : "password"}
                            value={registerForm.confirmPassword}
                            onChange={e => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                            placeholder={t('admin.reEnterPassword')}
                            className="pl-10 pr-3 text-right"
                            required
                          />
                          <button type="button" className="absolute left-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 flex items-center justify-center hover:bg-transparent" onClick={() => setShowConfirmPassword(v => !v)}>
                            {showConfirmPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        </div>
                      </div>
                      {passwordError && <div className="text-red-500 text-sm">{passwordError}</div>}
                      <div className="flex space-x-2 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsRegisterDialogOpen(false)}
                          className="flex-1"
                        >
                          {t('admin.cancel')}
                        </Button>
                        <Button
                          type="submit"
                          className="flex-1 gradient-orange text-background"
                          disabled={loading}
                        >
                          {loading ? t('admin.registering') : t('admin.registerTrainer')}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/system')}
                  className="font-semibold transform hover:scale-105 transition-all duration-200 text-xs sm:text-sm w-full sm:w-auto min-w-0"
                >
                  <Settings className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0" />
                  <span className="hidden sm:inline truncate">{t('admin.systemSettings')}</span>
                  <span className="sm:hidden truncate">{t('admin.settings')}</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/secret-users')}
                  className="font-semibold transform hover:scale-105 transition-all duration-200 bg-red-50 border-red-200 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30 text-xs sm:text-sm w-full sm:w-auto min-w-0"
                >
                  <Shield className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0" />
                  <span className="hidden sm:inline truncate">{t('admin.secretUsers')}</span>
                  <span className="sm:hidden truncate">{t('admin.secret')}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 space-y-8 w-full overflow-x-hidden">
          {/* Stats Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Users */}
            <Card className="bg-gradient-to-r from-blue-500 to-blue-600 border-0 shadow-xl transform hover:scale-105 transition-all duration-300">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl lg:text-3xl font-bold text-background">
                      {statsLoading ? '...' : stats.totalUsers}
                    </p>
                    <p className="text-background/80 text-xs lg:text-sm font-medium">{t('admin.totalUsers')}</p>
                  </div>
                  <Users className="w-8 h-8 lg:w-10 lg:h-10 text-background/90" />
                </div>
              </CardContent>
            </Card>
            {/* Active Trainers */}
            <Card className="bg-gradient-to-r from-green-500 to-green-600 border-0 shadow-xl transform hover:scale-105 transition-all duration-300">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl lg:text-3xl font-bold text-background">
                      {statsLoading ? '...' : stats.totalTrainers}
                    </p>
                    <p className="text-background/80 text-xs lg:text-sm font-medium">{t('admin.activeTrainers')}</p>
                  </div>
                  <Shield className="w-8 h-8 lg:w-10 lg:h-10 text-background/90" />
                </div>
              </CardContent>
            </Card>
            {/* Total Clients */}
            <Card className="bg-gradient-to-r from-purple-500 to-purple-600 border-0 shadow-xl transform hover:scale-105 transition-all duration-300">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl lg:text-3xl font-bold text-background">
                      {statsLoading ? '...' : stats.totalClients}
                    </p>
                    <p className="text-background/80 text-xs lg:text-sm font-medium">{t('admin.totalClients')}</p>
                  </div>
                  <Users className="w-8 h-8 lg:w-10 lg:h-10 text-background/90" />
                </div>
              </CardContent>
            </Card>
            {/* System Health */}
            <Card className="bg-gradient-to-r from-emerald-500 to-emerald-600 border-0 shadow-xl transform hover:scale-105 transition-all duration-300">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl lg:text-3xl font-bold text-background">
                      {stats.systemHealth}
                    </p>
                    <p className="text-background/80 text-xs lg:text-sm font-medium">{t('admin.systemHealth')}</p>
                  </div>
                  <CheckCircle className="w-8 h-8 lg:w-10 lg:h-10 text-background/90" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* User Management Section */}
            <Card className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl hover:shadow-2xl transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-foreground">
                  <Users className="w-5 h-5 text-primary" />
                  <span>{t('admin.userManagement')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold text-foreground">
                    {statsLoading ? '...' : `${stats.totalUsers} ${t('admin.totalUsers')}`}
                  </span>
                  <Badge className="gradient-orange text-background">
                    {statsLoading ? '...' : `${stats.totalTrainers} ${t('admin.trainers')}`}
                  </Badge>
                </div>
                <Progress value={stats.totalUsers ? Math.round((stats.totalTrainers / stats.totalUsers) * 100) : 0} className="h-3 bg-secondary" />
                <Button 
                  onClick={() => navigate('/users')}
                  className="w-full gradient-orange text-background font-semibold transform hover:scale-105 transition-all duration-200"
                >
                  <Users className="w-4 h-4 mr-2" />
                  {t('admin.manageUsers')}
                </Button>
              </CardContent>
            </Card>

            {/* System Health Section */}
            <Card className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl hover:shadow-2xl transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-foreground">
                  <Shield className="w-5 h-5 text-green-500" />
                  <span>{t('admin.systemHealth')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold text-foreground">
                    {t('admin.systemUptime')}
                  </span>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    {t('admin.allSystemsOK')}
                  </Badge>
                </div>
                <Progress value={100} className="h-3 bg-secondary" />
                <Button 
                  onClick={() => navigate('/system')}
                  className="w-full bg-green-500 hover:bg-green-600 text-background font-semibold transform hover:scale-105 transition-all duration-200"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  {t('admin.viewSystemStatus')}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-foreground">
                <TrendingUp className="w-5 h-5 text-blue-500" />
                <span>{t('admin.recentSystemActivity')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center space-x-4 p-4 bg-secondary/30 rounded-xl border border-border/30 hover:bg-secondary/50 transition-colors">
                    <div className={`w-10 h-10 rounded-full ${activity.color} flex items-center justify-center shadow-lg`}>
                      <activity.icon className="w-5 h-5 text-background" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{activity.title}</p>
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          {statsError && (
            <div className="text-red-500 font-semibold text-center mt-4">
              {statsError}
              <Button onClick={() => window.location.reload()} className="ml-4">{t('admin.retry')}</Button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default AdminDashboard; 