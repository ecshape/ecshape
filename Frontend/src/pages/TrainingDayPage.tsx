import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import WorkoutPlayer from '@/features/trainee/WorkoutPlayer';
import { useAuth } from '../contexts/AuthContext';

/** Focused workout player (the tab bar is hidden; the player owns the bottom of the screen). */
const TrainingDayPage = () => {
  const { dayId } = useParams<{ dayId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === 'ADMIN') navigate('/admin', { replace: true });
    else if (user?.role === 'TRAINER') navigate('/trainer-dashboard', { replace: true });
  }, [user, navigate]);

  if (!user || user.role !== 'CLIENT') return null;

  return (
    <Layout currentPage="training" immersive>
      <WorkoutPlayer key={dayId} dayId={Number(dayId)} />
    </Layout>
  );
};

export default TrainingDayPage;
