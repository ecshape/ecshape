import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, CheckCircle2, HeartPulse, Lock, Phone, Save, Target, User } from 'lucide-react';
import { Avatar, BackLink, EmptyState, Field, PageTitle, SectionCard, Skel } from '@/features/trainer/ui';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config/api';
import { useTranslation } from 'react-i18next';

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
  const [fetching, setFetching] = useState(true);
  
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
      setError(t('trainer.edit.loadError'));
    } finally {
      setFetching(false);
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
        throw new Error(errorData.detail || t('trainer.edit.saveError'));
      }

      // Update password if changed
      if (changePassword && passwordData.new_password) {
        if (passwordData.new_password !== passwordData.confirm_password) {
          throw new Error(t('trainerDashboard.passwordsDoNotMatch'));
        }
        if (passwordData.new_password.length < 8) {
          throw new Error(t('trainer.edit.passwordTooShort'));
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
          throw new Error(errorData.detail || t('trainer.edit.passwordError'));
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
        throw new Error(errorData.detail || t('trainer.edit.saveError'));
      }

      setSuccess(t('trainer.edit.saved'));
      setTimeout(() => {
        navigate(`/client/${clientId}`);
      }, 1500);
    } catch (error: any) {
      setError(error.message || t('trainer.edit.saveError'));
    } finally {
      setLoading(false);
    }
  };

  const set = (k: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData({ ...formData, [k]: e.target.value });

  if (!client) {
    return (
      <Layout currentPage="dashboard">
        <div className="tr-page tr-page--narrow">
          {fetching ? (
            <div aria-busy="true" aria-label={t('common.loading')}>
              <Skel className="mb-6 h-10 w-28 rounded-full" />
              <Skel className="mb-6 h-24 w-2/3" />
              <Skel className="mb-4 h-72 rounded-[1.5rem]" />
              <Skel className="h-72 rounded-[1.5rem]" />
            </div>
          ) : (
            <EmptyState
              icon={User}
              title={t('trainer.common.notFoundTitle')}
              body={error || t('clientProfile.clientNotFound')}
              action={<button type="button" className="tp-btn tp-btn--primary tp-press" onClick={() => navigate('/trainer-dashboard')}>{t('clientProfile.backToDashboard')}</button>}
            />
          )}
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage="dashboard">
      <div className="tr-page tr-page--narrow">
        <BackLink to={`/client/${clientId}`} className="mb-4" />
        <PageTitle
          eyebrow={t('clientProfile.editProfile', 'Edit Profile')}
          title={
            <span className="flex items-center gap-4">
              <Avatar name={formData.full_name || client.full_name} seed={client.id} size={64} />
              <span className="min-w-0">{formData.full_name || client.full_name}</span>
            </span>
          }
        />

        <form onSubmit={handleSubmit} className="space-y-5">
          <SectionCard icon={User} title={t('clientProfile.basicInformation', 'Basic Information')} className="tp-rise" style={{ ['--i' as string]: 1 }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`${t('clientProfile.fullName')} *`} htmlFor="full_name" className="sm:col-span-2">
                <input id="full_name" className="tp-input" value={formData.full_name} onChange={set('full_name')} required />
              </Field>
              <Field label={`${t('clientProfile.username')} *`} htmlFor="username">
                <input id="username" className="tp-input" dir="ltr" value={formData.username} onChange={set('username')} required />
              </Field>
              <Field label={`${t('clientProfile.email')} *`} htmlFor="email">
                <input id="email" type="email" className="tp-input" dir="ltr" value={formData.email} onChange={set('email')} required />
              </Field>
            </div>
            <div className="tr-toggle mt-4">
              <label htmlFor="is_active" className="min-w-0 flex-1 cursor-pointer">
                <span className="block font-semibold">{t('clientProfile.isActive')}</span>
                <span className="block text-sm text-muted-foreground">{t('trainer.edit.activeHint')}</span>
              </label>
              <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
            </div>
          </SectionCard>

          <SectionCard icon={HeartPulse} title={t('clientProfile.profileInformation', 'Profile Information')} info={t('tt.info.physical')} className="tp-rise" style={{ ['--i' as string]: 2 }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`${t('clientProfile.weight')} (${t('trainer.common.kg')})`} htmlFor="weight">
                <input id="weight" type="number" inputMode="decimal" step="0.1" className="tp-input" value={formData.weight} onChange={set('weight')} />
              </Field>
              <Field label={`${t('clientProfile.height')} (${t('trainer.common.cm')})`} htmlFor="height">
                <input id="height" type="number" inputMode="numeric" className="tp-input" value={formData.height} onChange={set('height')} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard icon={Target} title={t('clientProfile.goalsAndPreferences', 'Goals & Preferences')} info={t('tt.info.goals')} className="tp-rise" style={{ ['--i' as string]: 3 }}>
            <div className="grid gap-4">
              <Field label={t('clientProfile.goals')} htmlFor="goals">
                <textarea id="goals" className="tp-input tr-textarea" value={formData.goals} onChange={set('goals')} rows={3} />
              </Field>
              <Field label={<span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-primary" />{t('clientProfile.injuries')}</span>} htmlFor="injuries">
                <textarea id="injuries" className="tp-input tr-textarea" value={formData.injuries} onChange={set('injuries')} rows={3} />
              </Field>
              <Field label={t('clientProfile.preferences')} htmlFor="preferences">
                <textarea id="preferences" className="tp-input tr-textarea" value={formData.preferences} onChange={set('preferences')} rows={3} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard icon={Phone} title={t('trainer.edit.contact')} className="tp-rise" style={{ ['--i' as string]: 4 }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('clientProfile.phone')} htmlFor="phone">
                <input id="phone" type="tel" dir="ltr" className="tp-input" value={formData.phone} onChange={set('phone')} />
              </Field>
              <Field label={t('clientProfile.emergencyContact')} htmlFor="emergency_contact">
                <input id="emergency_contact" className="tp-input" value={formData.emergency_contact} onChange={set('emergency_contact')} />
              </Field>
              <Field label={t('clientProfile.address')} htmlFor="address" className="sm:col-span-2">
                <textarea id="address" className="tp-input tr-textarea !min-h-[4.5rem]" value={formData.address} onChange={set('address')} rows={2} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard icon={Lock} title={t('clientProfile.changePassword', 'Change Password')} info={t('tt.info.password')} className="tp-rise" style={{ ['--i' as string]: 5 }}>
            <div className="tr-toggle">
              <label htmlFor="change_password" className="min-w-0 flex-1 cursor-pointer font-semibold">{t('clientProfile.changePasswordToggle')}</label>
              <Switch id="change_password" checked={changePassword} onCheckedChange={setChangePassword} />
            </div>
            {changePassword && (
              <div className="tp-rise mt-4 grid gap-4 sm:grid-cols-2">
                <Field label={`${t('clientProfile.newPassword')} *`} htmlFor="new_password" hint={t('trainer.edit.passwordTooShort')}>
                  <input id="new_password" type="password" autoComplete="new-password" className="tp-input" value={passwordData.new_password} onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })} minLength={8} required={changePassword} />
                </Field>
                <Field label={`${t('clientProfile.confirmPassword')} *`} htmlFor="confirm_password">
                  <input id="confirm_password" type="password" autoComplete="new-password" className="tp-input" value={passwordData.confirm_password} onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })} minLength={8} required={changePassword} />
                </Field>
              </div>
            )}
          </SectionCard>

          <div className="tr-actionbar ec-glass">
            <div className="min-w-0 flex-1" aria-live="polite">
              {error ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--tr-bad))]"><AlertTriangle className="h-4 w-4 flex-none" />{error}</p>
              ) : success ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--tr-ok))]"><CheckCircle2 className="h-4 w-4 flex-none" />{success}</p>
              ) : (
                <p className="truncate text-sm text-muted-foreground">{client.full_name}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press" onClick={() => navigate(`/client/${clientId}`)}>{t('common.cancel')}</button>
              <button type="submit" disabled={loading} className="tp-btn tp-btn--primary tp-btn--sm tp-press">
                <Save className="h-4 w-4" />
                {loading ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default EditClient;
