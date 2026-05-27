import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Flame, CheckCircle2, ChevronRight } from 'lucide-react';
import { DailyCheckInForm } from './DailyCheckInForm';
import { API_BASE_URL } from '@/config/api';
import { cn } from '@/lib/utils';
import { getWeekRange, formatDateForAPI, getWeekDays, getDayName, getDayNumber } from '@/utils/dashboard';

interface CheckInSummary {
  today_status: 'completed' | 'pending' | 'none';
  current_streak: number;
  last_7_days_completion: number;
  completion_rate: number;
}

interface WeekCheckIn {
  date: string;
  hasCheckIn: boolean;
}

export const DailyCheckInCardV2: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  const [summary, setSummary] = useState<CheckInSummary | null>(null);
  const [weekCheckIns, setWeekCheckIns] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchWeekCheckIns = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const weekRange = getWeekRange();
      const weekStart = formatDateForAPI(weekRange.start);
      const weekEnd = formatDateForAPI(weekRange.end);

      const response = await fetch(
        `${API_BASE_URL}/check-ins?start_date=${weekStart}&end_date=${weekEnd}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const checkInMap = new Map<string, boolean>();
        data.forEach((checkIn: any) => {
          const date = new Date(checkIn.date).toISOString().split('T')[0];
          checkInMap.set(date, true);
        });
        setWeekCheckIns(checkInMap);
      }
    } catch (error) {
      console.error('Failed to fetch week check-ins:', error);
    }
  };

  const fetchSummary = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/check-ins/summary`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSummary(data);
      }
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeekCheckIns();
    fetchSummary();
  }, []);

  const handleFormSuccess = () => {
    fetchWeekCheckIns();
    fetchSummary();
  };

  const weekDays = getWeekDays();
  const today = new Date().toISOString().split('T')[0];
  const todayStatus = summary?.today_status || 'none';
  
  // Check if today has a check-in
  const todayHasCheckIn = weekCheckIns.get(today) || false;

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">{t('common.loading')}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-foreground">
              {t('checkIn.title')}
            </CardTitle>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Daily Cards Row - Week Calendar */}
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day, index) => {
              const dateStr = formatDateForAPI(day);
              const hasCheckIn = weekCheckIns.get(dateStr) || false;
              const isToday = dateStr === today;
              
              return (
                <div
                  key={index}
                  className={cn(
                    "flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all",
                    hasCheckIn
                      ? "bg-primary/20 border-primary text-foreground"
                      : "bg-secondary/50 border-border text-muted-foreground",
                    isToday && "ring-2 ring-primary/50"
                  )}
                >
                  <span className="text-xs font-medium mb-1">{getDayName(day, i18n.language)}</span>
                  <span className="text-base font-bold">{getDayNumber(day)}</span>
                  {hasCheckIn && (
                    <CheckCircle2 className="w-3 h-3 text-primary mt-1" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Streak Indicator */}
          {summary && summary.current_streak > 0 && (
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-400" />
              <span className="text-base font-semibold text-orange-400">
                {summary.current_streak} {t('checkIn.streak')}
              </span>
            </div>
          )}

          {/* Check-In Banner */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{t('checkIn.checkIn', 'Check-In')}</p>
            {todayHasCheckIn || todayStatus === 'completed' ? (
              <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-green-400">{t('checkIn.checkInCompleted', 'Check-in completed today')}</span>
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
            ) : (
              <Button
                onClick={() => setFormOpen(true)}
                className="w-full bg-primary hover:bg-primary/90 text-background font-semibold py-3 rounded-lg"
              >
                <span className="flex-1 text-left">
                  {t('checkIn.submit', 'Submit Check-In')}
                </span>
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <DailyCheckInForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={handleFormSuccess}
      />
    </>
  );
};

