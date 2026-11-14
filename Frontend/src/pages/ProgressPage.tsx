
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import ProgressScreen from '@/features/trainee/ProgressScreen';
import { useAuth } from '../contexts/AuthContext';

const ProgressPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Redirect non-clients away from client-only pages
  useEffect(() => {
    if (user) {
      if (user.role === 'ADMIN') {
        navigate('/admin', { replace: true });
      } else if (user.role === 'TRAINER') {
        navigate('/trainer-dashboard', { replace: true });
      }
    }
  }, [user, navigate]);

  // Only render if user is a client
  if (!user || user.role !== 'CLIENT') {
    return null;
  }

  return (
    <Layout currentPage="progress">
      <ProgressScreen />
    </Layout>
  );
};

export default ProgressPage;
