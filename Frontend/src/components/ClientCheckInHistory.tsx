import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock } from 'lucide-react';
import { API_BASE_URL } from '@/config/api';
import { format } from 'date-fns';
import { he, enUS } from 'date-fns/locale';

interface CheckIn {
  id: number;
  client_id: number;
  date: string;
  weight?: number | null;
  steps?: number | null;
  walked_10000_steps?: boolean | null;
  sun_exposure_10min?: boolean | null;
  hunger_level?: number | null;
  sleep_hours?: number | null;
  created_at: string;
  updated_at?: string | null;
}

interface ClientCheckInHistoryProps {
  clientId: number;
  onSelectCheckIn?: (checkIn: CheckIn) => void;
}

export const ClientCheckInHistory: React.FC<ClientCheckInHistoryProps> = ({
  clientId,
  onSelectCheckIn
}) => {
  const { t, i18n } = useTranslation();
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  useEffect(() => {
    fetchCheckIns();
  }, [clientId]);

  const fetchCheckIns = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/check-ins?client_id=${clientId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCheckIns(data);
      }
    } catch (error) {
      console.error('Failed to fetch check-ins:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCheckInForDate = (date: Date): CheckIn | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return checkIns.find(ci => ci.date.startsWith(dateStr));
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      const checkIn = getCheckInForDate(date);
      if (checkIn && onSelectCheckIn) {
        onSelectCheckIn(checkIn);
      }
    }
  };

  const calendarModifiers = {
    hasCheckIn: (date: Date) => {
      return getCheckInForDate(date) !== undefined;
    },
    today: (date: Date) => {
      return format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
    }
  };

  const calendarModifiersClassNames = {
    hasCheckIn: 'bg-primary/20 border border-primary/30 !rounded-md',
    today: 'ring-2 ring-primary !rounded-md'
  };

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-card to-secondary border-border/50">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">{t('common.loading')}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl">
      <CardHeader>
        <CardTitle>{t('checkIn.trainer.history')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'calendar')}>
          <TabsList className="mb-4 flex flex-wrap h-auto gap-1 p-1 min-w-0 w-full">
            <TabsTrigger value="list" className="min-w-0 flex-1 sm:flex-initial text-xs sm:text-sm px-2 sm:px-3 py-2 whitespace-nowrap">{t('checkIn.listView')}</TabsTrigger>
            <TabsTrigger value="calendar" className="min-w-0 flex-1 sm:flex-initial text-xs sm:text-sm px-2 sm:px-3 py-2 whitespace-nowrap">{t('checkIn.calendarView')}</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {checkIns.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {t('checkIn.noCheckIns')}
              </div>
            ) : (
              <div className="space-y-3">
                {checkIns.map((checkIn) => (
                  <Card
                    key={checkIn.id}
                    className="bg-card border border-border rounded-lg p-4 hover:bg-secondary/50 transition-colors cursor-pointer"
                    onClick={() => onSelectCheckIn && onSelectCheckIn(checkIn)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg font-semibold text-foreground">
                            {format(new Date(checkIn.date), 'PPP', {
                              locale: i18n.language === 'he' ? he : enUS
                            })}
                          </span>
                          <Badge
                            variant="outline"
                            className="bg-green-500/20 text-green-400 border-green-500/30"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            {t('checkIn.completed')}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          {checkIn.weight && (
                            <div>{t('checkIn.weight')}: {checkIn.weight} kg</div>
                          )}
                          {checkIn.steps && (
                            <div>{t('checkIn.steps')}: {checkIn.steps.toLocaleString()}</div>
                          )}
                          {checkIn.sleep_hours && (
                            <div>{t('checkIn.sleepHours')}: {checkIn.sleep_hours}h</div>
                          )}
                          {checkIn.hunger_level && (
                            <div>{t('checkIn.hungerLevel')}: {checkIn.hunger_level}/10</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="calendar">
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                modifiers={calendarModifiers}
                modifiersClassNames={calendarModifiersClassNames}
                className="rounded-md border"
                classNames={{
                  // Force the container (table cell) to be transparent so the square doesn't show
                  cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-transparent focus-within:relative z-20",
                  // Ensure the selected button itself is rounded
                  day_selected: "!bg-primary !text-primary-foreground hover:!bg-primary hover:!text-primary-foreground focus:!bg-primary focus:!text-primary-foreground !rounded-md",
                  // Ensure base days are rounded
                  day: "h-9 w-9 p-0 font-normal aria-selected:opacity-100 rounded-md"
                }}
              />
            </div>
            {selectedDate && getCheckInForDate(selectedDate) && (
              <div className="mt-4 p-4 bg-secondary/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  {t('checkIn.selectedDate')}: {format(selectedDate, 'PPP', {
                    locale: i18n.language === 'he' ? he : enUS
                  })}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelectCheckIn && onSelectCheckIn(getCheckInForDate(selectedDate)!)}
                >
                  {t('checkIn.trainer.viewDetails')}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

