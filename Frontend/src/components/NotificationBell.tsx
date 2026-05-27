import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const formatNotificationTime = (createdAt: string) => {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export const NotificationBell: React.FC = () => {
  const {
    serverNotifications,
    serverUnreadCount,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const handleMarkAllAsRead = () => {
    markAllAsRead();
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t('notifications.notifications')}>
          <Bell className="h-5 w-5" />
          {serverUnreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {serverUnreadCount > 99 ? '99+' : serverUnreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-semibold">{t('notifications.notifications')}</h4>
          {serverUnreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t('notifications.markAllAsRead')}
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {serverNotifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t('notifications.noNotifications')}</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {serverNotifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.is_read && markAsRead(n.id)}
                  className={cn(
                    'w-full text-start p-3 rounded-lg border transition-colors',
                    n.is_read ? 'bg-muted/50 border-border' : 'bg-background border-border hover:bg-accent'
                  )}
                >
                  <div className="flex justify-between gap-2">
                    <p className={cn('text-sm font-medium', !n.is_read && 'font-semibold')}>{n.title}</p>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatNotificationTime(n.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.message}</p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}; 