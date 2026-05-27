import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Save, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config/api';
import { useTranslation } from 'react-i18next';
import { Separator } from "@/components/ui/separator";

interface Client {
  id: number;
  username: string;
  full_name: string;
  email: string;
  is_active: boolean;
  profile?: {
    weight?: number;
    height?: number;
    goals?: string;
    injuries?: string;
    preferences?: string;
    phone?: string;
    address?: string;
    emergency_contact?: string;
  };
}

const EditClient: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [client, setClient] = useState<Client | null>(null);
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    is_active: true,
    weight: '',
    height: '',
    goals: '',
    injuries: '',
    preferences: '',
    phone: '',
    address: '',
    emergency_contact: '',
  });
  
  const [passwordData, setPasswordData] = useState({
    new_password: '',
    confirm_password: '',
  });
  const [changePassword, setChangePassword] = useState(false);

  useEffect(() => {
    fetchClientData();
  }, [clientId, location.state]);

  const fetchClientData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Use client from location state if available, otherwise fetch
      if (location.state?.client) {
        const clientData = location.state.client;
        setClient(clientData);
        setFormData({
          username: clientData.username || '',
          email: clientData.email || '',
          full_name: clientData.full_name || '',
          is_active: clientData.is_active !== false,
          weight: clientData.profile?.weight?.toString() || '',
          height: clientData.profile?.height?.toString() || '',
          goals: clientData.profile?.goals || '',
          injuries: clientData.profile?.injuries || '',
          preferences: clientData.profile?.preferences || '',
          phone: clientData.profile?.phone || '',
          address: clientData.profile?.address || '',
          emergency_contact: clientData.profile?.emergency_contact || '',
        });
      } else if (clientId) {
        const response = await fetch(`${API_BASE_URL}/users/${clientId}`, { headers });
        if (response.ok) {
          const clientData = await response.json();
          setClient(clientData);
          setFormData({
            username: clientData.username || '',
            email: clientData.email || '',
            full_name: clientData.full_name || '',
            is_active: clientData.is_active !== false,
            weight: clientData.profile?.weight?.toString() || '',
            height: clientData.profile?.height?.toString() || '',
            goals: clientData.profile?.goals || '',
            injuries: clientData.profile?.injuries || '',
            preferences: clientData.profile?.preferences || '',
            phone: clientData.profile?.phone || '',
            address: clientData.profile?.address || '',
            emergency_contact: clientData.profile?.emergency_contact || '',
          });
        }
      }
    } catch (error) {
      console.error('Error fetching client data:', error);
      setError('Failed to load client data');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('access_token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Update user information
      const userUpdate = {
        username: formData.username,
        email: formData.email,
        full_name: formData.full_name,
        is_active: formData.is_active,
      };

      const response = await fetch(`${API_BASE_URL}/users/${clientId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(userUpdate),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update client');
      }

      // Update password if changed
      if (changePassword && passwordData.new_password) {
        if (passwordData.new_password !== passwordData.confirm_password) {
          throw new Error('Passwords do not match');
        }
        if (passwordData.new_password.length < 8) {
          throw new Error('Password must be at least 8 characters');
        }

        const passwordResponse = await fetch(`${API_BASE_URL}/auth/password/reset`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: parseInt(clientId!),
            new_password: passwordData.new_password,
          }),
        });

        if (!passwordResponse.ok) {
          const errorData = await passwordResponse.json();
          throw new Error(errorData.detail || 'Failed to reset password');
        }
      }

      // Update profile information
      const profileUpdate = {
        weight: formData.weight ? parseFloat(formData.weight) : null,
        height: formData.height ? parseInt(formData.height) : null,
        goals: formData.goals || null,
        injuries: formData.injuries || null,
        preferences: formData.preferences || null,
        phone: formData.phone || null,
        address: formData.address || null,
        emergency_contact: formData.emergency_contact || null,
      };

      const profileResponse = await fetch(`${API_BASE_URL}/users/${clientId}/profile`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(profileUpdate),
      });

      if (!profileResponse.ok) {
        const errorData = await profileResponse.json();
        throw new Error(errorData.detail || 'Failed to update profile');
      }

      setSuccess('Client updated successfully');
      setTimeout(() => {
        navigate(`/client/${clientId}`);
      }, 1500);
    } catch (error: any) {
      setError(error.message || 'Failed to update client');
    } finally {
      setLoading(false);
    }
  };

  if (!client) {
    return (
      <Layout currentPage="dashboard">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground mb-2">Client Not Found</h2>
            <p className="text-muted-foreground mb-4">{t('clientProfile.clientNotFound')}</p>
            <Button onClick={() => navigate('/trainer-dashboard')}>Back to Dashboard</Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage="dashboard">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/client/${clientId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('clientProfile.editProfile', 'Edit Profile')}</h1>
            <p className="text-muted-foreground">{client.full_name}</p>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive rounded-md text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="p-4 bg-green-500/10 border border-green-500 rounded-md text-green-600 dark:text-green-400">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>{t('clientProfile.basicInformation', 'Basic Information')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="username">{t('clientProfile.username')} *</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">{t('clientProfile.email')} *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="full_name">{t('clientProfile.fullName')} *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">{t('clientProfile.isActive')}</Label>
              </div>
            </CardContent>
          </Card>

          {/* Password Change */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                {t('clientProfile.changePassword', 'Change Password')}
              </CardTitle>
            </CardHeader>
          <CardContent className="space-y-4 overflow-hidden">
              <div className="flex items-center space-x-2">
                <Switch
                  id="change_password"
                  checked={changePassword}
                  onCheckedChange={setChangePassword}
                />
                <Label htmlFor="change_password">{t('clientProfile.changePasswordToggle')}</Label>
              </div>
              {changePassword && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  <div>
                    <Label htmlFor="new_password">{t('clientProfile.newPassword')} *</Label>
                    <Input
                      id="new_password"
                      type="password"
                      value={passwordData.new_password}
                      onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                      minLength={8}
                      required={changePassword}
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirm_password">{t('clientProfile.confirmPassword')} *</Label>
                    <Input
                      id="confirm_password"
                      type="password"
                      value={passwordData.confirm_password}
                      onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                      minLength={8}
                      required={changePassword}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Profile Information */}
          <Card>
            <CardHeader>
              <CardTitle>{t('clientProfile.profileInformation', 'Profile Information')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="weight">{t('clientProfile.weight')} (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.1"
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="height">{t('clientProfile.height')} (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    value={formData.height}
                    onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="goals">{t('clientProfile.goals')}</Label>
                <Textarea
                  id="goals"
                  value={formData.goals}
                  onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="injuries">{t('clientProfile.injuries')}</Label>
                <Textarea
                  id="injuries"
                  value={formData.injuries}
                  onChange={(e) => setFormData({ ...formData, injuries: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="preferences">{t('clientProfile.preferences')}</Label>
                <Textarea
                  id="preferences"
                  value={formData.preferences}
                  onChange={(e) => setFormData({ ...formData, preferences: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="phone">{t('clientProfile.phone')}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="address">{t('clientProfile.address')}</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="emergency_contact">{t('clientProfile.emergencyContact')}</Label>
                <Input
                  id="emergency_contact"
                  value={formData.emergency_contact}
                  onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate(`/client/${clientId}`)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading} className="gradient-orange">
              <Save className="h-4 w-4 mr-2" />
              {loading ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default EditClient;

