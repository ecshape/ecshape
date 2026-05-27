import React from 'react';
import { CheckCircle2, Clock, Circle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib';
import { useTranslation } from 'react-i18next';

interface CheckInStatusBadgeProps {
  status: 'completed' | 'pending' | 'none';
  className?: string;
}

export const CheckInStatusBadge: React.FC<CheckInStatusBadgeProps> = ({
  status,
  className
}) => {
  const { t } = useTranslation();

  const getStatusConfig = () => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle2,
          color: 'bg-green-500',
          ringColor: 'ring-green-500/30',
          tooltip: t('checkIn.completed')
        };
      case 'pending':
        return {
          icon: Clock,
          color: 'bg-orange-500',
          ringColor: 'ring-orange-500/30',
          tooltip: t('checkIn.pending')
        };
      default:
        return {
          icon: Circle,
          color: 'bg-muted',
          ringColor: 'ring-muted/30',
          tooltip: t('checkIn.noCheckIn')
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "w-3 h-3 rounded-full ring-2",
              config.color,
              config.ringColor,
              className
            )}
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

