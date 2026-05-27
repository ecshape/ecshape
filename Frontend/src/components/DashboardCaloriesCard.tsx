import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Utensils, ChevronRight } from 'lucide-react';

interface DashboardCaloriesCardProps {
  consumed: number;
  target: number;
  macros?: {
    protein: { consumed: number; target: number };
    carbs: { consumed: number; target: number };
    fat: { consumed: number; target: number };
  };
  onViewDetailsClick?: () => void;
}

export const DashboardCaloriesCard: React.FC<DashboardCaloriesCardProps> = ({
  consumed,
  target,
  onViewDetailsClick
}) => {
  const { t } = useTranslation();

  const percentage = target > 0 ? Math.min((consumed / target) * 100, 100) : 0;
  const roundedConsumed = Math.round(consumed);
  const roundedTarget = Math.round(target);
  
  // SVG ring progress
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <Card className="bg-gradient-to-br from-card to-secondary border-2 border-primary/30 shadow-xl hover:shadow-2xl transition-all">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {t('dashboard.caloriesTracker', 'CALORIES TRACKER')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Circular Progress - Simple design like nutrition page */}
        <div className="flex justify-center">
          <div className="relative">
            <svg width="128" height="128" className="transform -rotate-90">
              {/* Background Circle */}
              <circle
                cx="64"
                cy="64"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted/30"
              />
              
              {/* Progress Circle */}
              <circle
                cx="64"
                cy="64"
                r={radius}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-500 ease-out"
              />
            </svg>
            
            {/* Center Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-2xl font-bold text-foreground">
                {roundedConsumed}
              </div>
              <div className="text-sm text-muted-foreground">
                /{roundedTarget} {t('meals.kcal', 'kcal')}
              </div>
            </div>
          </div>
        </div>

        {/* Meals Access Button */}
        <Button
          onClick={onViewDetailsClick}
          className="w-full bg-primary hover:bg-primary/90 text-background font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all"
        >
          <Utensils className="w-4 h-4" />
          <span>{t('meals.meals', 'Meals')}</span>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
};
