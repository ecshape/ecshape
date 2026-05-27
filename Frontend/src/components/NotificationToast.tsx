import React from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Notification } from '../contexts/NotificationContext';
import { cn } from '@/lib/utils';

interface NotificationToastProps {
  notification: Notification;
  onRemove: (id: string) => void;
}

const getIcon = (type: Notification['type']) => {
  switch (type) {
    case 'success':
      return <CheckCircle className="w-5 h-5" />;
    case 'error':
      return <AlertCircle className="w-5 h-5" />;
    case 'warning':
      return <AlertTriangle className="w-5 h-5" />;
    case 'info':
      return <Info className="w-5 h-5" />;
    default:
      return <Info className="w-5 h-5" />;
  }
};

const getStyles = (type: Notification['type']) => {
  switch (type) {
    case 'success':
      return {
        container: 'bg-green-50 border-green-200 text-green-800',
        icon: 'text-green-600',
        closeButton: 'text-green-600 hover:bg-green-100'
      };
    case 'error':
      return {
        container: 'bg-red-50 border-red-200 text-red-800',
        icon: 'text-red-600',
        closeButton: 'text-red-600 hover:bg-red-100'
      };
    case 'warning':
      return {
        container: 'bg-yellow-50 border-yellow-200 text-yellow-800',
        icon: 'text-yellow-600',
        closeButton: 'text-yellow-600 hover:bg-yellow-100'
      };
    case 'info':
      return {
        container: 'bg-blue-50 border-blue-200 text-blue-800',
        icon: 'text-blue-600',
        closeButton: 'text-blue-600 hover:bg-blue-100'
      };
    default:
      return {
        container: 'bg-gray-50 border-gray-200 text-gray-800',
        icon: 'text-gray-600',
        closeButton: 'text-gray-600 hover:bg-gray-100'
      };
  }
};

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notification,
  onRemove
}) => {
  const { t } = useTranslation();
  const styles = getStyles(notification.type);

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border shadow-lg max-w-sm w-full',
        'transform transition-all duration-300 ease-in-out',
        'animate-in slide-in-from-right-full',
        styles.container
      )}
    >
      <div className={cn('flex-shrink-0 mt-0.5', styles.icon)}>
        {getIcon(notification.type)}
      </div>
      
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold mb-1">
          {notification.title}
        </h4>
        <p className="text-sm opacity-90">
          {notification.message}
        </p>
        <p className="text-xs opacity-70 mt-1">
          {notification.timestamp.toLocaleTimeString()}
        </p>
      </div>
      
      <button
        onClick={() => onRemove(notification.id)}
        className={cn(
          'flex-shrink-0 p-1 rounded-md transition-colors',
          styles.closeButton
        )}
        aria-label={t('notifications.close')}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}; 