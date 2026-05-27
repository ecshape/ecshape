// Universal API Configuration
// Automatically adapts to any deployment scenario

const getApiUrl = () => {
  // Check for environment variable first (highest priority)
  if (import.meta.env.VITE_API_URL) {
    if (import.meta.env.DEV) {
      console.log('Using VITE_API_URL:', import.meta.env.VITE_API_URL);
    }
    return import.meta.env.VITE_API_URL;
  }
  
  // Local development detection: check for specific ports or localhost hostname
  const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname === '';
  const isDevPort = window.location.port === '5173' || 
                    window.location.port === '3000' ||
                    window.location.port === '5174';
  
  // Only use localhost:8000 if we're actually on localhost with dev port
  if (isLocalhost && isDevPort) {
    const apiUrl = 'http://localhost:8000/api';
    if (import.meta.env.DEV) {
      console.log('Local Development API URL:', apiUrl);
    }
    return apiUrl;
  }
  
  // Production/Docker/Railway: Use same domain as frontend with /api path
  // This works for any reverse proxy setup (Caddy, Nginx, Railway, etc.)
  const apiUrl = `${window.location.origin}/api`;
  if (import.meta.env.DEV) {
    console.log('Production API URL:', apiUrl);
  }
  
  return apiUrl;
};

export const API_BASE_URL = getApiUrl();

// Log the API URL being used (for debugging - only in development)
if (import.meta.env.DEV) {
  console.log('API Base URL:', API_BASE_URL);
}

// Helper function to make API calls
export const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = localStorage.getItem('access_token');
  
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  return fetch(url, {
    ...options,
    headers: defaultHeaders,
  });
};

// API Endpoints
export const ENDPOINTS = {
  // Auth
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  REFRESH: '/auth/refresh',
  
  // Users
  USERS: '/users/',
  USERS_BY_ID: (id: number) => `/users/${id}`,
  
  // Exercises
  EXERCISES: '/exercises/',
  EXERCISES_BY_ID: (id: number) => `/exercises/${id}`,
  
  // Workouts
  WORKOUT_PLANS: '/workouts/plans',
  WORKOUT_PLANS_BY_ID: (id: number) => `/workouts/plans/${id}`,
  WORKOUT_COMPLETIONS: '/workouts/completions',
  
  // Meal Plans
  MEAL_PLANS: '/meal-plans/',
  MEAL_PLANS_BY_ID: (id: number) => `/meal-plans/${id}`,
  
  // Progress
  PROGRESS: '/progress/',
  PROGRESS_BY_ID: (id: number) => `/progress/${id}`,
  
  // Notifications
  NOTIFICATIONS: '/notifications/',
  NOTIFICATIONS_BY_ID: (id: number) => `/notifications/${id}`,
  NOTIFICATIONS_MARK_READ: (id: number) => `/notifications/${id}/mark-read`,
  
  // System
  SYSTEM_HEALTH: '/system/health',
  SYSTEM_STATS: '/system/stats',
};

// API Headers
export const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  // Only add Authorization header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

// API Error Handling
export const handleApiError = (response: Response) => {
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  return response;
}; 