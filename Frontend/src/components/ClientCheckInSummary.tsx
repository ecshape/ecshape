import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, TrendingUp, Activity, Moon, Heart } from 'lucide-react';

interface CheckInSummary {
  today_status: 'completed' | 'pending' | 'none';
  current_streak: number;
  last_7_days_completion: number;
  completion_rate: number;
  avg_weight?: number | null;
  avg_steps?: number | null;
  avg_sleep_hours?: number | null;
  avg_hunger_level?: number | null;
  total_check_ins: number;
  first_check_in?: string | null;
  last_check_in?: string | null;
}

interface ClientCheckInSummaryProps {
  summary: CheckInSummary | null;
  loading?: boolean;
}

export const ClientCheckInSummary: React.FC<ClientCheckInSummaryProps> = ({
  summary,
  loading = false
}) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-card to-secondary border-border/50">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">{t('common.loading')}</div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  const stats = [
    {
      label: t('checkIn.todayStatus'),
      value: summary.today_status === 'completed' ? t('checkIn.completed') : 
             summary.today_status === 'pending' ? t('checkIn.pending') : 
             t('checkIn.none'),
      icon: summary.today_status === 'completed' ? CheckCircle2 : Clock,
      color: summary.today_status === 'completed' ? 'text-green-400' : 
             summary.today_status === 'pending' ? 'text-orange-400' : 
             'text-muted-foreground'
    },
    {
      label: t('checkIn.streak'),
      value: `${summary.current_streak}`,
      icon: TrendingUp,
      color: 'text-orange-400'
    },
    {
      label: t('checkIn.completionRate'),
      value: `${summary.completion_rate.toFixed(1)}%`,
      icon: Activity,
      color: 'text-primary'
    },
    {
      label: t('checkIn.avgWeight'),
      value: summary.avg_weight ? `${summary.avg_weight.toFixed(1)} kg` : '-',
      icon: Activity,
      color: 'text-foreground'
    },
    {
      label: t('checkIn.avgSteps'),
      value: summary.avg_steps ? Math.round(summary.avg_steps).toLocaleString() : '-',
      icon: Activity,
      color: 'text-foreground'
    },
    {
      label: t('checkIn.avgSleep'),
      value: summary.avg_sleep_hours ? `${summary.avg_sleep_hours.toFixed(1)}h` : '-',
      icon: Moon,
      color: 'text-foreground'
    }
  ];

  return (
    <Card className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl">
      <CardHeader>
        <CardTitle>{t('checkIn.trainer.summary')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div
                key={index}
                className="bg-secondary/50 rounded-lg p-4 border border-border/30 hover:bg-secondary/70 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 ${stat.color} bg-opacity-10 rounded-full flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </div>
                <div className={`text-2xl font-bold ${stat.color}`}>
                  {stat.value}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

