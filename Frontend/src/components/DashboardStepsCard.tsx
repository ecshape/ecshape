import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardStepsCardProps {
  steps?: number | null;
  target?: number;
  onViewDetailsClick?: () => void;
}

export const DashboardStepsCard: React.FC<DashboardStepsCardProps> = ({
  steps = null,
  target = 10000,
  onViewDetailsClick
}) => {
  const { t } = useTranslation();

  const hasData = steps !== null && steps !== undefined;
  const percentage = hasData ? Math.min((steps! / target) * 100, 100) : 0;

  return (
    <Card 
      className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl hover:shadow-2xl transition-all cursor-pointer"
      onClick={onViewDetailsClick}
    >
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Activity className="w-4 h-4" />
          {t('dashboard.steps', 'STEPS')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="text-center text-muted-foreground py-8">
            {t('dashboard.noData', 'No data to show')}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">
                {steps!.toLocaleString()} / {target.toLocaleString()}
              </p>
            </div>
            
            <Progress 
              value={percentage} 
              className="h-3 bg-secondary"
            />
            
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                {Math.round(percentage)}% {t('common.complete', 'complete')}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

