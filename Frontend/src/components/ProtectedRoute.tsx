import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NotFound from '../pages/NotFound';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'ADMIN' | 'TRAINER' | 'CLIENT';
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If role is required and user doesn't have it, show 404 instead of redirect
  if (requiredRole && user?.role !== requiredRole) {
    return <NotFound />;
  }

  return <>{children}</>;
};

export default ProtectedRoute; 