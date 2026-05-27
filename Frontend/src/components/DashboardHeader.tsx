import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MessageCircle, Bell, ChevronRight, Dumbbell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DashboardHeaderProps {
  user: {
    id: number;
    full_name: string;
    email?: string;
  };
  unreadMessages?: number;
  unreadNotifications?: number;
  onProfileClick?: () => void;
  onMessagesClick?: () => void;
  onNotificationsClick?: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  user,
  unreadMessages = 0,
  unreadNotifications = 0,
  onProfileClick,
  onMessagesClick,
  onNotificationsClick
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleProfileClick = () => {
    if (onProfileClick) {
      onProfileClick();
    } else {
      // Default: navigate to profile or settings
    }
  };

  const handleMessagesClick = () => {
    if (onMessagesClick) {
      onMessagesClick();
    } else {
      navigate('/chat');
    }
  };

  const handleNotificationsClick = () => {
    if (onNotificationsClick) {
      onNotificationsClick();
    }
    // Could navigate to notifications page
  };

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-background border-b border-border/50">
      {/* Left: Profile */}
      <div 
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
        onClick={handleProfileClick}
      >
        <Avatar className="w-12 h-12 flex-shrink-0">
          <AvatarFallback className="bg-gradient-to-r from-primary to-primary/80 text-background font-semibold">
            {getInitials(user.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">{t('dashboard.hiThere', 'Hi there')}</p>
          <div className="flex items-center gap-1">
            <span className="text-lg font-semibold text-foreground truncate">
              {user.full_name}
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </div>
        </div>
      </div>

      {/* Right: Icons */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={handleMessagesClick}
          className="relative p-2 rounded-full hover:bg-secondary transition-colors"
          aria-label={t('navigation.chat')}
        >
          <MessageCircle className="w-6 h-6 text-foreground" />
          {unreadMessages > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-primary text-background text-xs">
              {unreadMessages > 9 ? '9+' : unreadMessages}
            </Badge>
          )}
        </button>
        
        <button
          onClick={handleNotificationsClick}
          className="relative p-2 rounded-full hover:bg-secondary transition-colors"
          aria-label={t('notifications.notifications')}
        >
          <Bell className="w-6 h-6 text-foreground" />
          {unreadNotifications > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-destructive text-background text-xs">
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </Badge>
          )}
        </button>
      </div>
    </div>
  );
};

