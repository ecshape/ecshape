import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import TrainingScreen from '@/features/trainee/TrainingScreen';
import { useAuth } from '../contexts/AuthContext';

const TrainingPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Client-only page: send trainers/admins to their own dashboards.
  useEffect(() => {
    if (user?.role === 'ADMIN') navigate('/admin', { replace: true });
    else if (user?.role === 'TRAINER') navigate('/trainer-dashboard', { replace: true });
  }, [user, navigate]);

  if (!user || user.role !== 'CLIENT') return null;

  return (
    <Layout currentPage="training">
      <TrainingScreen />
    </Layout>
  );
};

export default TrainingPage;
