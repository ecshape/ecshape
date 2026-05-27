import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
// Simple date formatting without date-fns
const formatDate = (dateStr: string, locale: string): string => {
  const date = new Date(dateStr);
  const month = date.toLocaleDateString(locale, { month: 'short' });
  const day = date.getDate();
  return `${day} ${month}`;
};

interface WeightEntry {
  date: string;
  weight: number;
}

interface DashboardWeightCardProps {
  weightEntries: WeightEntry[];
  onViewDetailsClick?: () => void;
}

export const DashboardWeightCard: React.FC<DashboardWeightCardProps> = ({
  weightEntries,
  onViewDetailsClick
}) => {
  const { t, i18n } = useTranslation();

  // Get last 7 entries (or less if not available)
  const chartData = weightEntries.slice(-7).map(entry => ({
    date: formatDate(entry.date, i18n.language),
    weight: entry.weight,
    fullDate: entry.date
  }));

  const latestWeight = weightEntries.length > 0 ? weightEntries[weightEntries.length - 1] : null;
  const previousWeight = weightEntries.length > 1 ? weightEntries[weightEntries.length - 2] : null;
  
  const weightChange = latestWeight && previousWeight
    ? latestWeight.weight - previousWeight.weight
    : 0;

  const hasData = weightEntries.length > 0;

  if (!hasData) {
    return (
      <Card className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t('dashboard.weight', 'WEIGHT')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            {t('dashboard.noData', 'No data to show')}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl hover:shadow-2xl transition-all cursor-pointer"
      onClick={onViewDetailsClick}
    >
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {t('dashboard.weight', 'WEIGHT')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current Weight */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold text-foreground">
              {latestWeight?.weight.toFixed(1)} {t('weightProgress.kg', 'KG')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('dashboard.today', 'Today')}
            </p>
          </div>
          {weightChange !== 0 && (
            <div className={cn(
              "flex items-center gap-1",
              weightChange > 0 ? "text-red-400" : "text-green-400"
            )}>
              {weightChange > 0 ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <TrendingDown className="w-5 h-5" />
              )}
            </div>
          )}
        </div>

        {/* Mini Line Chart */}
        {chartData.length > 0 && (
          <div className="h-16 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    padding: '4px 8px'
                  }}
                  formatter={(value: number) => [`${value.toFixed(1)} kg`, t('dashboard.weight')]}
                />
                <Line 
                  type="monotone" 
                  dataKey="weight" 
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

