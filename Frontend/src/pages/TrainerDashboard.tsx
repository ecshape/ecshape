import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dumbbell, Target, Utensils, TrendingUp, Plus, Calendar, Clock, 
  CheckCircle, Users, Trophy, Flame, UserPlus, Activity, 
  Search, Filter, Eye, Edit, Trash2, PlusCircle, Weight, Camera, EyeOff
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import ClientWeightProgress from '../components/ClientWeightProgress';
import { PageHeader, StatTile } from '../components/PageHeader';
import { useTranslation } from 'react-i18next';
import { CheckInStatusBadge } from '../components/CheckInStatusBadge';
import UnmatchedQuestionnaires from '../components/meals/UnmatchedQuestionnaires';

interface Client {
  id: number;
  username: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
  profile?: {
    weight?: number;
    height?: number;
    goals?: string;
    injuries?: string;
    preferences?: string;
  };
}

interface Exercise {
  id: number;
  name: string;
  description: string;
  muscle_group: string;
  equipment_needed?: string;
  instructions?: string;
  video_url?: string;
  created_by: number;
}

interface WorkoutPlan {
  id: number;
  name: string;
  client_id: number;
  client_name: string;
  created_at: string;
  sessions_count: number;
  completed_sessions: number;
}

interface MealPlan {
  id: number;
  title: string;
  client_id: number;
  client_name: string;
  total_calories: number;
  created_at: string;
  meals_count: number;
}

interface ProgressEntry {
  id: number;
  client_id: number;
  client_name: string;
  weight?: number;
  body_fat?: number;
  photo_path?: string;
  notes?: string;
  recorded_at: string;
}

const TrainerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState({
    totalClients: 0,
    activeClients: 0,
    totalExercises: 0,
    totalWorkoutPlans: 0,
    totalMealPlans: 0,
    completionRate: 0,
    checkInCompletionRate: 0
  });
  const [clientCheckInStatuses, setClientCheckInStatuses] = useState<Record<number, 'completed' | 'pending' | 'none'>>({});
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [progressEntries, setProgressEntries] = useState<any[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [addClientDialogOpen, setAddClientDialogOpen] = useState(false);
  const [addClientForm, setAddClientForm] = useState({ username: '', email: '', full_name: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [addClientLoading, setAddClientLoading] = useState(false);
  const [addClientError, setAddClientError] = useState('');

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      // Fetch stats only
      const [clientsRes, exercisesRes, workoutPlansRes, mealPlansRes, checkInDashboardRes] = await Promise.all([
        fetch(`${API_BASE_URL}/users/clients`, { headers }),
        fetch(`${API_BASE_URL}/exercises/`, { headers }),
        fetch(`${API_BASE_URL}/workouts/plans`, { headers }),
        fetch(`${API_BASE_URL}/meal-plans/`, { headers }),
        fetch(`${API_BASE_URL}/check-ins/trainer/dashboard`, { headers })
      ]);
      const clientsData = clientsRes.ok ? await clientsRes.json() : [];
      const exercisesData = exercisesRes.ok ? await exercisesRes.json() : [];
      const workoutPlansData = workoutPlansRes.ok ? await workoutPlansRes.json() : [];
      const mealPlansData = mealPlansRes.ok ? await mealPlansRes.json() : [];
      
      // Process check-in statuses
      const checkInStatusMap: Record<number, 'completed' | 'pending' | 'none'> = {};
      let completedCheckIns = 0;
      if (checkInDashboardRes.ok) {
        const checkInData = await checkInDashboardRes.json();
        checkInData.forEach((item: any) => {
          checkInStatusMap[item.client_id] = item.check_in_status;
          if (item.check_in_status === 'completed') {
            completedCheckIns++;
          }
        });
      }
      setClientCheckInStatuses(checkInStatusMap);
      
      const activeClients = clientsData.filter((c: any) => c.is_active).length;
      const totalCompletions = workoutPlansData.reduce((sum: number, plan: any) => sum + plan.completed_sessions, 0);
      const totalSessions = workoutPlansData.reduce((sum: number, plan: any) => sum + plan.sessions_count, 0);
      const completionRate = totalSessions > 0 ? (totalCompletions / totalSessions) * 100 : 0;
      setStats({
        totalClients: clientsData.length,
        activeClients,
        totalExercises: exercisesData.length,
        totalWorkoutPlans: workoutPlansData.length,
        totalMealPlans: mealPlansData.length,
        completionRate: Math.min(completionRate, 100),
        checkInCompletionRate: clientsData.length > 0 
          ? (completedCheckIns / clientsData.length) * 100 
          : 0
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/users/clients`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const handleViewProgress = async (client: Client) => {
    setSelectedClient(client);
    setProgressModalOpen(true);
    setProgressLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/progress/?client_id=${client.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProgressEntries(data);
      } else {
        setProgressEntries([]);
      }
    } catch {
      setProgressEntries([]);
    } finally {
      setProgressLoading(false);
    }
  };

  React.useEffect(() => {
    fetchDashboardData();
    fetchClients();
  }, []);
  if (loading) {
    return <Layout currentPage="dashboard"><div className="flex items-center justify-center h-full"><div>{t('common.loading')}</div></div></Layout>;
  }
  return (
    <Layout currentPage="dashboard">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
        <PageHeader
          eyebrow={t('layout.trainerDashboard')}
          title={t('trainerDashboard.title')}
          actions={
            <Button size="lg" onClick={() => setAddClientDialogOpen(true)}>
              <UserPlus />
              {t('client.addClient')}
            </Button>
          }
        />
        <UnmatchedQuestionnaires clients={clients} />
        {/* Stats Section */}
        <div className="ec-stagger mb-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile icon={Users} value={stats.totalClients} label={t('trainerDashboard.totalClients')} highlight />
          <StatTile icon={Dumbbell} value={stats.totalExercises} label={t('trainerDashboard.exercises')} />
          <StatTile icon={TrendingUp} value={`${stats.completionRate.toFixed(1)}%`} label={t('trainerDashboard.workoutCompletion')} />
          <StatTile icon={CheckCircle} value={`${stats.checkInCompletionRate.toFixed(1)}%`} label={t('trainerDashboard.checkInCompletion')} />
        </div>

        {/* Clients Section */}
        <div className="mb-6">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-display text-4xl sm:text-5xl">{t('client.yourClients')}</h2>
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t('client.searchClients')}
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                className="ps-11"
              />
            </div>
          </div>
          <div className="ec-stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clients.filter(client =>
              client.full_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
              client.email.toLowerCase().includes(clientSearch.toLowerCase()) ||
              client.username.toLowerCase().includes(clientSearch.toLowerCase())
            ).length === 0 ? (
              <div className="col-span-full rounded-[1.25rem] border border-dashed border-border py-16 text-center text-lg text-muted-foreground">{t('trainerDashboard.noClientsFound')}</div>
            ) : (
              clients.filter(client =>
                client.full_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
                client.email.toLowerCase().includes(clientSearch.toLowerCase()) ||
                client.username.toLowerCase().includes(clientSearch.toLowerCase())
              ).map(client => (
                <Card key={client.id} className="card-hover group relative flex h-full flex-col justify-between">
                  <CardContent className="flex h-full flex-col p-5 sm:p-6">
                    <div className="absolute end-4 top-4">
                      <CheckInStatusBadge status={clientCheckInStatuses[client.id] || 'none'} />
                    </div>
                    <div className="mb-4 mt-1 flex items-center gap-4 pe-20">
                      <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-primary/12 text-primary transition-colors duration-500 group-hover:bg-primary group-hover:text-primary-foreground">
                        <span className="font-num text-2xl">
                          {client.full_name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-lg font-bold text-foreground">{client.full_name}</h3>
                        <p className="truncate text-sm text-muted-foreground">{client.email}</p>
                      </div>
                    </div>
                    <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                      <Button variant="outline" onClick={() => handleViewProgress(client)}><TrendingUp />{t('client.viewProgress')}</Button>
                      <Button onClick={() => navigate(`/client/${client.id}`)}>{t('client.viewProfile')}</Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
        <Dialog open={progressModalOpen} onOpenChange={setProgressModalOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle dir={i18n.language === 'he' ? 'rtl' : 'ltr'}>{t('trainerDashboard.weightProgress')} - {selectedClient?.full_name}</DialogTitle>
              </DialogHeader>
              {progressLoading ? (
                <div className="p-8 text-center">{t('trainerDashboard.loading')}</div>
              ) : (
                <ClientWeightProgress
                  clientId={selectedClient?.id?.toString() || ''}
                  progressEntries={progressEntries}
                  onProgressUpdate={() => handleViewProgress(selectedClient!)}
                  isTrainer={true}
                />
              )}
            </DialogContent>
          </Dialog>
        <Dialog open={addClientDialogOpen} onOpenChange={setAddClientDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t('trainerDashboard.addNewClient')}</DialogTitle>
              <DialogDescription>{t('trainerDashboard.registerNewClient')}</DialogDescription>
            </DialogHeader>
            <form onSubmit={async e => {
              e.preventDefault();
              setAddClientError('');
              
              // Frontend validation
              if (addClientForm.password !== addClientForm.confirmPassword) {
                setAddClientError(t('trainerDashboard.passwordsDoNotMatch'));
                return;
              }
              
              setAddClientLoading(true);
              try {
                const token = localStorage.getItem('access_token');
                // Register client
                const res = await fetch(`${API_BASE_URL}/auth/register/client`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    username: addClientForm.username,
                    email: addClientForm.email,
                    full_name: addClientForm.full_name,
                    password: addClientForm.password,
                    role: 'CLIENT'
                  })
                });
                if (!res.ok) {
                  let errMsg = t('trainerDashboard.failedToRegisterClient');
                  try {
                    const err = await res.json();
                    // Handle FastAPI validation errors - detail can be an array or string
                    if (err.detail) {
                      if (Array.isArray(err.detail)) {
                        // Format validation errors array into readable message
                        errMsg = err.detail.map((e: any) => {
                          const field = Array.isArray(e.loc) ? e.loc.slice(1).join('.') : 'field';
                          return `${field}: ${e.msg}`;
                        }).join('; ');
                      } else {
                        // detail is a string
                        errMsg = String(err.detail);
                      }
                    } else {
                      errMsg = JSON.stringify(err);
                    }
                  } catch (jsonErr) {
                    const textErr = await res.text();
                    errMsg = textErr || String(jsonErr);
                  }
                  // Ensure errMsg is always a string
                  setAddClientError(String(errMsg));
                  setAddClientLoading(false);
                  return;
                }
                const client = await res.json();
                // Assign client to trainer
                const assignRes = await fetch(`${API_BASE_URL}/users/clients/${client.id}/assign`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!assignRes.ok) {
                  let assignErrMsg = t('trainerDashboard.clientRegisteredButFailedToAssign');
                  try {
                    const err = await assignRes.json();
                    // Handle FastAPI validation errors - detail can be an array or string
                    if (err.detail) {
                      if (Array.isArray(err.detail)) {
                        // Format validation errors array into readable message
                        assignErrMsg = err.detail.map((e: any) => {
                          const field = Array.isArray(e.loc) ? e.loc.slice(1).join('.') : 'field';
                          return `${field}: ${e.msg}`;
                        }).join('; ');
                      } else {
                        // detail is a string
                        assignErrMsg = String(err.detail);
                      }
                    } else {
                      assignErrMsg = JSON.stringify(err);
                    }
                  } catch (jsonErr) {
                    const textErr = await assignRes.text();
                    assignErrMsg = textErr || String(jsonErr);
                  }
                  // Ensure errMsg is always a string
                  setAddClientError(String(assignErrMsg));
                  setAddClientLoading(false);
                  return;
                }
                setAddClientDialogOpen(false);
                setAddClientForm({ username: '', email: '', full_name: '', password: '', confirmPassword: '' });
                fetchClients();
              } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                setAddClientError(t('trainerDashboard.unexpectedError') + ': ' + errorMsg);
                console.error('Add client error:', err);
              } finally {
                setAddClientLoading(false);
              }
            }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t('trainerDashboard.username')}</Label>
                <Input id="username" value={addClientForm.username} onChange={e => setAddClientForm({ ...addClientForm, username: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('trainerDashboard.email')}</Label>
                <Input id="email" type="email" value={addClientForm.email} onChange={e => setAddClientForm({ ...addClientForm, email: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="full_name">{t('trainerDashboard.fullName')}</Label>
                <Input id="full_name" value={addClientForm.full_name} onChange={e => setAddClientForm({ ...addClientForm, full_name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('trainerDashboard.password')}</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? 'text' : 'password'} value={addClientForm.password} onChange={e => setAddClientForm({ ...addClientForm, password: e.target.value })} className="pl-10 pr-3 text-right" required />
                  <button type="button" className="absolute left-2 top-1/2 transform -translate-y-1/2 h-10 w-10 p-0 flex items-center justify-center hover:bg-transparent touch-manipulation" onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff className="w-5 h-5 text-muted-foreground" /> : <Eye className="w-5 h-5 text-muted-foreground" />}</button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('trainerDashboard.confirmPassword')}</Label>
                <div className="relative">
                  <Input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} value={addClientForm.confirmPassword} onChange={e => setAddClientForm({ ...addClientForm, confirmPassword: e.target.value })} className="pl-10 pr-3 text-right" required />
                  <button type="button" className="absolute left-2 top-1/2 transform -translate-y-1/2 h-10 w-10 p-0 flex items-center justify-center hover:bg-transparent touch-manipulation" onClick={() => setShowConfirmPassword(v => !v)}>{showConfirmPassword ? <EyeOff className="w-5 h-5 text-muted-foreground" /> : <Eye className="w-5 h-5 text-muted-foreground" />}</button>
                </div>
              </div>
              {addClientError && <div className="text-red-500 text-sm">{addClientError}</div>}
              <div className="flex space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setAddClientDialogOpen(false)} className="flex-1">{t('trainerDashboard.cancel')}</Button>
                <Button type="submit" className="flex-1 gradient-orange text-background" disabled={addClientLoading}>{addClientLoading ? t('trainerDashboard.adding') : t('trainerDashboard.addClient')}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};
export default TrainerDashboard; 