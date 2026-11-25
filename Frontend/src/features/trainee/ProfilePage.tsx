import React from 'react';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import ProfileScreen from './ProfileScreen';

/** /me: the trainee's profile and settings. Other roles have their own settings pages. */
const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== 'CLIENT') return <Navigate to="/" replace />;
  return (
    <Layout currentPage="profile">
      <ProfileScreen />
    </Layout>
  );
};

export default ProfilePage;
