import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, TrendingUp, CheckCircle, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { API_BASE_URL } from '../config/api';

interface MealHistoryChoice {
  choice_id: number;
  food_option_id?: number | null;
  meal_slot_id?: number | null;
  macro_type?: 'protein' | 'carb' | 'fat';
  food_name?: string | null;
  food_name_hebrew?: string | null;
  quantity?: string | null;
  is_custom: boolean;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  is_approved?: boolean | null;
  trainer_comment?: string | null;
  photo_path?: string | null;
}

interface MealHistoryMeal {
  meal_slot_id?: number | null;
  meal_name: string;
  time_suggestion?: string | null;
  choices: MealHistoryChoice[];
}

interface MealHistoryEntry {
  id: number;
  client_id: number;
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  is_complete: boolean;
  meals?: MealHistoryMeal[];
}

interface AverageData {
  average_calories: number;
  total_days: number;
  period: string;
  detail_history: Array<{
    date: string;
    calories: number;
    is_complete: boolean;
  }>;
}

interface MealHistoryProps {
  clientId?: number;
}

const MealHistory: React.FC<MealHistoryProps> = ({ clientId }) => {
  const { t, i18n } = useTranslation();
  const [history, setHistory] = useState<MealHistoryEntry[]>([]);
  const [averageData, setAverageData] = useState<AverageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
    fetchAverage();
  }, [clientId]);

  const fetchHistory = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const url = clientId 
        ? `${API_BASE_URL}/v2/meals/history?client_id=${clientId}`
        : `${API_BASE_URL}/v2/meals/history`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.error('Failed to fetch meal history:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAverage = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const url = clientId
        ? `${API_BASE_URL}/v2/meals/history/average?client_id=${clientId}&days=7`
        : `${API_BASE_URL}/v2/meals/history/average?days=7`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAverageData(data);
      }
    } catch (error) {
      console.error('Failed to fetch average data:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Average Calories Summary */}
      {averageData && averageData.total_days > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Average Calories (7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <div className="text-4xl font-bold text-orange-500 mb-2">
                {averageData.average_calories} kcal
              </div>
              <p className="text-muted-foreground">
                {averageData.total_days} days tracked
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily History List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Daily Meal History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('clientProfile.noMealHistory')}
            </div>
          ) : (
            <div className="space-y-4">
              {history.slice(0, 10).map((entry) => {
                const hasMeals = entry.meals && entry.meals.length > 0;
                return (
                  <div
                    key={entry.id}
                    className="p-4 border rounded-lg hover:bg-muted/40 transition-colors space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {entry.is_complete ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <Clock className="h-5 w-5 text-yellow-500" />
                        )}
                        <div>
                          <div className="font-medium">{formatDate(entry.date)}</div>
                          <div className="text-sm text-muted-foreground">
                            {entry.total_calories} {t('meals.calories')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        <span>P: {entry.total_protein}g</span>
                        <span>C: {entry.total_carbs}g</span>
                        <span>F: {entry.total_fat}g</span>
                        {entry.is_complete && (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            {t('clientProfile.dayCompleted') !== 'clientProfile.dayCompleted'
                              ? t('clientProfile.dayCompleted')
                              : t('common.completed')}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {hasMeals ? (
                      <div className="pt-3 border-t space-y-3">
                        {entry.meals?.map((meal) => {
                          const isCustomGroup = meal.meal_slot_id === null;
                          const mealTitle = isCustomGroup
                            ? t('clientProfile.customEntries')
                            : meal.meal_name;
                          return (
                            <div key={`${meal.meal_slot_id ?? 'custom'}-${meal.meal_name}`} className="rounded-lg border bg-muted/30 p-3 space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <div className="font-semibold text-sm">
                                  {mealTitle}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {meal.time_suggestion && (
                                    <Badge variant="secondary" className="capitalize">
                                      {meal.time_suggestion}
                                    </Badge>
                                  )}
                                  {!isCustomGroup && (
                                    <Badge variant="outline" className="text-primary border-primary/50">
                                      {t('clientProfile.macroBreakdown')}
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-2">
                                {meal.choices.map((choice) => {
                                  const macroBadgeStyles: Record<string, string> = {
                                    protein: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
                                    carb: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
                                    fat: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
                                  };
                                  const macroLabelMap: Record<string, string> = {
                                    protein: t('foodBank.protein'),
                                    carb: t('foodBank.carb'),
                                    fat: t('foodBank.fat'),
                                  };

                                  const isHebrew = i18n.language === 'he';
                                  const displayName = isHebrew
                                    ? choice.food_name_hebrew || choice.food_name || t('clientProfile.customEntries')
                                    : choice.food_name || choice.food_name_hebrew || t('clientProfile.customEntries');

                                  const macroTypeKey = choice.macro_type ?? 'custom';
                                  const macroBadgeClass = macroBadgeStyles[macroTypeKey] || "bg-muted text-muted-foreground";

                                  return (
                                    <div
                                      key={choice.choice_id}
                                      className="rounded-md border border-border/60 bg-background/70 p-3 space-y-2"
                                    >
                                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2 text-sm font-medium text-foreground flex-wrap">
                                            <span>{displayName}</span>
                                            {choice.macro_type && (
                                              <span className={`px-2 py-1 text-xs rounded-full ${macroBadgeClass}`}>
                                                {macroLabelMap[choice.macro_type]}
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {t('clientProfile.quantity')}: {choice.quantity || t('clientProfile.noQuantitySet')}
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                                          {choice.calories !== null && choice.calories !== undefined && (
                                            <span>{choice.calories} {t('meals.calories')}</span>
                                          )}
                                          {choice.protein !== null && choice.protein !== undefined && (
                                            <span>{choice.protein}g {t('meals.protein')}</span>
                                          )}
                                          {choice.carbs !== null && choice.carbs !== undefined && (
                                            <span>{choice.carbs}g {t('meals.carbs')}</span>
                                          )}
                                          {choice.fat !== null && choice.fat !== undefined && (
                                            <span>{choice.fat}g {t('meals.fat')}</span>
                                          )}
                                        </div>
                                      </div>
                                      {choice.trainer_comment && (
                                        <div className="text-xs text-muted-foreground bg-muted/60 rounded-md p-2">
                                          {choice.trainer_comment}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="pt-3 border-t text-sm text-muted-foreground">
                        {t('clientProfile.noMealHistoryDetails')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MealHistory;

