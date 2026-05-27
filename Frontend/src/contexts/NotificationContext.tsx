import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../config/api';
import { notificationService } from '../services/notificationService';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  timestamp: Date;
}

export interface ServerNotification {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  created_at: string;
  read_at?: string;
  client_id?: number;
  event_type?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  serverNotifications: ServerNotification[];
  serverUnreadCount: number;
  refetchServerNotifications: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [serverNotifications, setServerNotifications] = useState<ServerNotification[]>([]);
  const [serverUnreadCount, setServerUnreadCount] = useState(0);
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const refetchServerNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [list, count] = await Promise.all([
        notificationService.getNotifications(50, 0, false),
        notificationService.getNotificationCount(),
      ]);
      setServerNotifications(list);
      setServerUnreadCount(count.unread_count);
    } catch {
      // ignore
    }
  }, [user?.id]);

  const markAsRead = useCallback(
    async (id: number) => {
      try {
        await notificationService.markAsRead(id);
        await refetchServerNotifications();
      } catch {
        // ignore
      }
    },
    [refetchServerNotifications]
  );

  const markAllAsRead = useCallback(async () => {
    try {
      await notificationService.markAllAsRead();
      await refetchServerNotifications();
    } catch {
      // ignore
    }
  }, [refetchServerNotifications]);

  useEffect(() => {
    refetchServerNotifications();
  }, [refetchServerNotifications]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp'>) => {
    const newNotification: Notification = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
    };

    setNotifications(prev => [...prev, newNotification]);

    // Auto-remove notification after duration (default: 5 seconds)
    const duration = notification.duration || 5000;
    setTimeout(() => {
      removeNotification(newNotification.id);
    }, duration);
  }, [removeNotification]);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // WebSocket connection for real-time notifications
  useEffect(() => {
    if (!user?.id) return;

    const connectWebSocket = () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        // Determine WebSocket URL
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Extract base URL from API_BASE_URL (remove /api if present)
        const baseUrl = API_BASE_URL.replace(/^https?:\/\//, '').replace(/\/api\/?$/, '');
        // Router is mounted at /api/ws and endpoint is /{user_id}, so full path is /api/ws/{user_id}
        const wsUrl = `${wsProtocol}//${baseUrl}/api/ws/${user.id}?token=${token}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected for notifications');
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle different notification types
            if (data.type === 'welcome' || data.type === 'connection_established') {
              console.log('WebSocket connection established');
              return;
            }
            if (data.type === 'new_notification') {
              refetchServerNotifications();
              return;
            }

            // Map backend notification types to frontend types
            let notificationType: 'success' | 'error' | 'warning' | 'info' = 'info';
            if (data.type === 'workout_completed' || data.type === 'meal_completed' || data.type === 'progress_updated') {
              notificationType = 'success';
            } else if (data.type === 'plan_updated') {
              notificationType = 'info';
            } else if (data.type === 'system') {
              notificationType = 'warning';
            }

            addNotification({
              type: notificationType,
              title: data.title || data.message || 'Notification',
              message: data.message || data.data?.message || '',
              duration: 5000
            });
            refetchServerNotifications();
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected, attempting to reconnect...');
          wsRef.current = null;
          
          // Reconnect after 5 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, 5000);
        };
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        // Retry connection after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      }
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [user?.id, addNotification, refetchServerNotifications]);

  const value = {
    notifications,
    addNotification,
    removeNotification,
    clearAll,
    serverNotifications,
    serverUnreadCount,
    refetchServerNotifications,
    markAsRead,
    markAllAsRead,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}; 