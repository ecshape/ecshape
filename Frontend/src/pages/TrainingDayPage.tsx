import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { CheckCircle2, ArrowLeft, Dumbbell, Clock, PlusCircle, Video, PlayCircle, History, Loader2, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { cn } from '@/lib/utils';

import { API_BASE_URL } from '../config/api';
const VIDEO_FALLBACK_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

interface Exercise {
  id: number;
  name: string;
  description?: string | null;
  muscle_group: string;
  equipment?: string | null;
  video_url?: string | null;
  image_path?: string | null;
  instructions?: string | null;
}

interface WorkoutExercise {
  id: number;
  exercise_id: number;
  exercise?: Exercise | null;
  order_index: number;
  target_sets: number;
  target_reps: string;
  target_weight?: number | null;
  rest_seconds: number;
  tempo?: string | null;
  notes?: string | null;
  video_url?: string | null;
  group_name?: string | null;
}

interface WorkoutDay {
  id: number;
  name: string;
  workout_plan_name?: string | null;
  day_type: string;
  order_index: number;
  notes?: string | null;
  estimated_duration?: number | null;
  workout_exercises: WorkoutExercise[];
}

interface SetCompletion {
  id: number;
  workout_exercise_id: number;
  set_number: number;
  reps_completed: number;
  weight_used: number;
  rest_taken?: number | null;
  rpe?: number | null;
  completed_at: string;
}

interface ExerciseDetail {
  id: number;
  name: string;
  description?: string | null;
  muscle_group: string;
  equipment_needed?: string | null;
  video_url?: string | null;
  image_path?: string | null;
  instructions?: string | null;
}

const formatRestTime = (seconds: number) => {
  if (seconds === null || seconds === undefined) return '';
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) return `${minutes}m`;
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
};

const ExerciseHistoryDialog: React.FC<{ exerciseId: number; exerciseName: string }> = ({ exerciseId, exerciseName }) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [history, setHistory] = useState<SetCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(50); // Show first 50 entries, allow scrolling

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token || !user?.id) return;

        // Fetch ALL history (no date filter - never reset)
        const response = await fetch(
          `${API_BASE_URL}/v2/workouts/set-completions?client_id=${user.id}&workout_exercise_id=${exerciseId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data: SetCompletion[] = await response.json();
          // Sort by date (newest first) - all history is preserved
          const sorted = data.sort(
            (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
          );
          setHistory(sorted);
        }
      } catch (error) {
        console.error('Failed to fetch exercise history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [exerciseId, user?.id]);

  // Group by date
  const groupedByDate = history.reduce<Record<string, SetCompletion[]>>((acc, completion) => {
    const date = new Date(completion.completed_at).toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(completion);
    return acc;
  }, {});

  const sortedDates = Object.entries(groupedByDate).sort((a, b) => (a[0] > b[0] ? -1 : 1));
  const displayedDates = sortedDates.slice(0, displayLimit);
  const hasMore = sortedDates.length > displayLimit;

  const exportToCSV = () => {
    // Create CSV content
    const headers = ['Date', 'Set Number', 'Weight (kg)', 'Reps', 'Rest (s)', 'RPE', 'Form Rating', 'Notes'];
    const rows = history.map(completion => {
      const date = new Date(completion.completed_at).toLocaleDateString();
      return [
        date,
        completion.set_number.toString(),
        completion.weight_used.toString(),
        completion.reps_completed.toString(),
        completion.rest_taken?.toString() || '',
        completion.rpe?.toString() || '',
        '', // form_rating not in interface
        '' // notes not in interface
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${exerciseName.replace(/[^a-z0-9]/gi, '_')}_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <DialogContent className="sm:max-w-2xl max-w-[95vw] mx-4 max-h-[90vh] flex flex-col">
      <DialogHeader>
        <div className="flex items-center justify-between">
          <div>
            <DialogTitle>{exerciseName} - {t('training.history', 'היסטוריה')}</DialogTitle>
            <DialogDescription>
              {t('training.allSetsHistory', 'כל הסטים והחזרות')} ({history.length} {t('training.sets', 'סטים')})
            </DialogDescription>
          </div>
          {history.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {t('common.export', 'ייצא')}
            </Button>
          )}
        </div>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t('training.noHistory', 'אין היסטוריה זמינה')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedDates.map(([date, completions]) => (
              <div key={date} className="space-y-2">
                <div className="text-sm font-semibold text-foreground border-b border-border pb-1">
                  {new Date(date).toLocaleDateString()}
                </div>
                <div className="space-y-1">
                  {completions
                    .sort((a, b) => a.set_number - b.set_number)
                    .map((completion) => (
                      <div
                        key={completion.id}
                        className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50"
                      >
                        <span className="text-muted-foreground">
                          {t('training.sets')} {completion.set_number}
                        </span>
                        <span className="text-foreground">
                          {completion.weight_used} {t('training.kg')} × {completion.reps_completed} {t('training.reps')}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
            {hasMore && (
              <div className="text-center py-4">
                <Button
                  variant="outline"
                  onClick={() => setDisplayLimit(prev => prev + 50)}
                  className="w-full"
                >
                  {t('common.loadMore', 'טען עוד')} ({sortedDates.length - displayLimit} {t('common.remaining', 'נותרו')})
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </DialogContent>
  );
};

const getYoutubeId = (url?: string | null) => {
  if (!url) return null;
  const standardMatch = url.match(/v=([^&]+)/);
  if (standardMatch) return standardMatch[1];
  const shortMatch = url.match(/youtu\.be\/([^?]+)/);
  if (shortMatch) return shortMatch[1];
  const embedMatch = url.match(/embed\/([^?]+)/);
  if (embedMatch) return embedMatch[1];
  return null;
};

const getVideoThumbnail = (url?: string | null) => {
  if (!url) return null;
  
  const videoId = getYoutubeId(url);
  if (!videoId) {
    // If no valid video ID found, try fallback
    const fallbackId = getYoutubeId(VIDEO_FALLBACK_URL);
    return fallbackId ? `https://img.youtube.com/vi/${fallbackId}/hqdefault.jpg` : null;
  }
  
  // Return thumbnail URL for the video ID
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
};

const TrainingDayPage: React.FC = () => {
  const { dayId } = useParams<{ dayId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [workoutDay, setWorkoutDay] = useState<WorkoutDay | null>(null);
  const [exerciseDetails, setExerciseDetails] = useState<Record<number, ExerciseDetail>>({});
  const [setCompletions, setSetCompletions] = useState<SetCompletion[]>([]);
  const [previousSessions, setPreviousSessions] = useState<Record<number, SetCompletion[]>>({});
  const [tempSets, setTempSets] = useState<Record<string, { reps: string; weight: string }>>({});
  const [customSetCounts, setCustomSetCounts] = useState<Record<number, number>>({});
  const [dayCompleted, setDayCompleted] = useState(false);
  const [highlightedExerciseId, setHighlightedExerciseId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [swipedSetKey, setSwipedSetKey] = useState<string | null>(null);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);

  useEffect(() => {
    if (!user?.id || !dayId) return;

    const loadData = async () => {
      setLoading(true);
      setError('');

      try {
        const token = localStorage.getItem('access_token');
        if (!token) throw new Error('missing_token');

        // Fetch workout day
        const dayResponse = await fetch(`${API_BASE_URL}/v2/workouts/days/${dayId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!dayResponse.ok) throw new Error('failed_day_request');
        const day: WorkoutDay = await dayResponse.json();
        setWorkoutDay(day);

        // Fetch exercise details
        const exerciseIds = day.workout_exercises.map(ex => ex.exercise_id);
        if (exerciseIds.length > 0) {
          const detailsMap: Record<number, ExerciseDetail> = {};
          await Promise.all(
            exerciseIds.map(async (id) => {
              try {
                const response = await fetch(`${API_BASE_URL}/v2/workouts/exercises/${id}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (response.ok) {
                  detailsMap[id] = await response.json();
                }
              } catch (err) {
                console.error(`Failed to fetch exercise ${id}:`, err);
              }
            })
          );
          setExerciseDetails(detailsMap);
        }

        // Fetch set completions for this day
        // Fetch set completions from current week only (Monday to Sunday)
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Monday = 0
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - daysFromMonday);
        weekStart.setHours(0, 0, 0, 0);
        
        const completionsResponse = await fetch(
          `${API_BASE_URL}/v2/workouts/set-completions?client_id=${user.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (completionsResponse.ok) {
          const allCompletions: SetCompletion[] = await completionsResponse.json();
          // Filter to only current week and current workout day
          const weekCompletions = allCompletions.filter((c: SetCompletion) => {
            if (!c.completed_at) return false;
            const completionDate = new Date(c.completed_at);
            // Check if completion is from current week and matches current workout day exercises
            const isCurrentWeek = completionDate >= weekStart;
            const matchesDay = day.workout_exercises.some(ex => ex.id === c.workout_exercise_id);
            return isCurrentWeek && matchesDay;
          });
          setSetCompletions(weekCompletions);
        }

        // Fetch previous sets for all exercises (for history/suggestions)
        // This will be used to show last 2 sets if history exists
        const workoutExerciseIds = day.workout_exercises.map(ex => ex.id);
        const previousSetsMap: Record<number, SetCompletion[]> = {};
        await Promise.all(
          workoutExerciseIds.map(async (exerciseId) => {
            try {
              const historyResponse = await fetch(
                `${API_BASE_URL}/v2/workouts/set-completions?client_id=${user.id}&workout_exercise_id=${exerciseId}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (historyResponse.ok) {
                const history: SetCompletion[] = await historyResponse.json();
                // Filter out today's sets and sort by date (newest first)
                const today = new Date().toISOString().split('T')[0];
                const previousSets = (history || [])
                  .filter(s => {
                    if (!s.completed_at) return false;
                    const setDate = new Date(s.completed_at).toISOString().split('T')[0];
                    return setDate !== today;
                  })
                  .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
                previousSetsMap[exerciseId] = previousSets;
              }
            } catch (err) {
              console.error(`Failed to fetch history for exercise ${exerciseId}:`, err);
            }
          })
        );
        // Store previous sets in state (we'll use it in renderExerciseCard)
        setPreviousSessions(previousSetsMap);

        // Check day completion (only check sessions from current week - Monday to Sunday)
        // Reuse weekStart from above, calculate weekEnd
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        
        const sessionResponse = await fetch(
          `${API_BASE_URL}/v2/workouts/sessions?client_id=${user.id}&workout_day_id=${dayId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (sessionResponse.ok) {
          const sessions = await sessionResponse.json();
          // Filter sessions to only current week
          const currentWeekSessions = Array.isArray(sessions) 
            ? sessions.filter((s: any) => {
                if (!s.started_at) return false;
                const sessionDate = new Date(s.started_at);
                return sessionDate >= weekStart && sessionDate < weekEnd;
              })
            : [];
          const completedSession = currentWeekSessions.find((s: any) => s.is_completed);
          setDayCompleted(!!completedSession);
        }
      } catch (err) {
        console.error('Failed to load training day:', err);
        setError(t('training.errors.loadFailed', 'טעינת יום האימון נכשלה'));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, dayId, t]);

  // Check if all exercises are completed
  const checkDayCompletion = useMemo(() => {
    if (!workoutDay) return false;
    
    return workoutDay.workout_exercises.every((exercise) => {
      const completedSets = setCompletions.filter(
        (c) => c.workout_exercise_id === exercise.id
      );
      const targetSets = exercise.target_sets || 0;
      return completedSets.length >= targetSets && targetSets > 0;
    });
  }, [workoutDay, setCompletions]);

  // Auto-complete day when all exercises are finished
  useEffect(() => {
    if (checkDayCompletion && !dayCompleted && workoutDay && !loading) {
      handleToggleDayCompletion(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkDayCompletion, dayCompleted, workoutDay, loading]);

  // When day is marked as completed, highlight only the first completed exercise
  useEffect(() => {
    if (dayCompleted && workoutDay && !highlightedExerciseId) {
      const firstCompleteExercise = workoutDay.workout_exercises.find((exercise) => {
        const completedSets = setCompletions.filter((c) => c.workout_exercise_id === exercise.id);
        const targetSets = exercise.target_sets || 0;
        return completedSets.length >= targetSets && targetSets > 0;
      });
      if (firstCompleteExercise) {
        setHighlightedExerciseId(firstCompleteExercise.id);
      }
    } else if (!dayCompleted) {
      // Clear highlight when day is uncompleted
      setHighlightedExerciseId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayCompleted, workoutDay]);

  const handleToggleDayCompletion = async (completed: boolean) => {
    if (!user?.id || !dayId) return;

    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const today = new Date().toISOString().split('T')[0];
      
      // Check for existing session (today's session)
      const sessionResponse = await fetch(
        `${API_BASE_URL}/v2/workouts/sessions?client_id=${user.id}&workout_day_id=${dayId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      let sessionId: number | null = null;
      if (sessionResponse.ok) {
        const sessions = await sessionResponse.json();
        // Find today's session or most recent session
        const todaySession = Array.isArray(sessions) 
          ? sessions.find((s: any) => s.started_at && s.started_at.startsWith(today))
          : null;
        const existingSession = todaySession || (Array.isArray(sessions) ? sessions[0] : null);
        if (existingSession) {
          sessionId = existingSession.id;
        }
      }

      if (completed) {
        // Create or update session
        if (sessionId) {
          await fetch(`${API_BASE_URL}/v2/workouts/sessions/${sessionId}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              is_completed: true,
              completed_at: new Date().toISOString(),
            }),
          });
        } else {
          await fetch(`${API_BASE_URL}/v2/workouts/sessions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              workout_day_id: Number(dayId),
              started_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
              is_completed: true,
            }),
          });
        }
        setDayCompleted(true);
      } else {
        // Uncomplete session
        if (sessionId) {
          await fetch(`${API_BASE_URL}/v2/workouts/sessions/${sessionId}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              is_completed: false,
              completed_at: null,
            }),
          });
        }
        setDayCompleted(false);
      }
    } catch (err) {
      console.error('Failed to toggle day completion:', err);
    }
  };

  const updateTempSet = (exerciseId: number, setNumber: number, field: 'reps' | 'weight', value: string) => {
    const key = `${exerciseId}-${setNumber}`;
    setTempSets((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const handleAddSet = (exerciseId: number) => {
    const completedSets = setCompletions.filter((c) => c.workout_exercise_id === exerciseId);
    const exercise = workoutDay?.workout_exercises.find(e => e.id === exerciseId);
    const targetSets = exercise?.target_sets || 0;
    const currentCustomCount = customSetCounts[exerciseId] ?? 0;
    const previousSets = previousSessions[exerciseId] || [];
    const hasHistory = previousSets.length > 0;
    const hasStarted = completedSets.length > 0;
    
    // Calculate what the last displayed set number would be (same logic as cardSetCount)
    let lastDisplayedSetNumber: number;
    if (hasStarted) {
      // Show at least completed sets, target sets, and custom sets
      lastDisplayedSetNumber = Math.max(targetSets + currentCustomCount, completedSets.length || 0);
    } else if (hasHistory) {
      lastDisplayedSetNumber = targetSets + currentCustomCount;
    } else {
      // If no history and not started, show at least 1 set if customCount is 0, otherwise show customCount
      lastDisplayedSetNumber = currentCustomCount === 0 ? 1 : currentCustomCount;
    }
    
    // Check if the last displayed set has any data or is completed
    const lastSetKey = `${exerciseId}-${lastDisplayedSetNumber}`;
    const hasLastSetData = !!(tempSets[lastSetKey]?.reps || tempSets[lastSetKey]?.weight);
    const isLastSetCompleted = isSetCompleted(exerciseId, lastDisplayedSetNumber);
    
    // Always allow adding a new set if:
    // 1. The last displayed set is completed, OR
    // 2. The last displayed set is completely empty (no temp data)
    // This allows users to add sets beyond the target number
    // The key is: if the last set is empty or completed, we can add another one
    if (isLastSetCompleted || !hasLastSetData) {
      // Only increment by 1 to prevent multiple sets from being added
      setCustomSetCounts((prev) => {
        const current = prev[exerciseId] ?? 0;
        return { ...prev, [exerciseId]: current + 1 };
      });
    }
  };

  const isSetCompleted = (exerciseId: number, setNumber: number) =>
    setCompletions.some(
      (c) => c.workout_exercise_id === exerciseId && c.set_number === setNumber
    );

  const handleDeleteSet = async (exerciseId: number, setNumber: number) => {
    const completed = isSetCompleted(exerciseId, setNumber);
    
    if (completed) {
      // Delete completed set from backend
      try {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        const completion = getCompletedSet(exerciseId, setNumber);
        if (completion) {
          const response = await fetch(`${API_BASE_URL}/v2/workouts/set-completions/${completion.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            // Reload data to refresh UI
            await loadData();
          }
        }
      } catch (err) {
        console.error('Failed to delete set:', err);
      }
    } else {
      // Delete temp set (just clear the data)
      const key = `${exerciseId}-${setNumber}`;
      setTempSets((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    
    // Reset swipe state
    setSwipedSetKey(null);
    setSwipeOffset(0);
  };

  const handleSwipeStart = (e: React.TouchEvent, setKey: string) => {
    const clientX = e.touches[0].clientX;
    setSwipeStartX(clientX);
    setSwipedSetKey(setKey);
    setSwipeOffset(0);
  };

  const handleSwipeMove = (e: React.TouchEvent, setKey: string) => {
    if (swipeStartX === null || swipedSetKey !== setKey) return;
    
    const clientX = e.touches[0].clientX;
    const diff = swipeStartX - clientX;
    
    // Only allow swiping left (negative diff) on mobile
    if (diff > 0) {
      setSwipeOffset(Math.min(diff, 100)); // Max 100px swipe
    } else {
      setSwipeOffset(0);
    }
  };

  const handleSwipeEnd = (setKey: string) => {
    if (swipeOffset > 50) {
      // Swipe threshold reached - trigger delete
      handleDeleteSet(
        parseInt(setKey.split('-')[0]),
        parseInt(setKey.split('-')[1])
      );
      // Reset after delete
      setSwipeOffset(0);
      setSwipedSetKey(null);
    } else {
      // Reset swipe
      setSwipeOffset(0);
      setSwipedSetKey(null);
    }
    setSwipeStartX(null);
  };

  const getCompletedSet = (exerciseId: number, setNumber: number) =>
    setCompletions.find(
      (c) => c.workout_exercise_id === exerciseId && c.set_number === setNumber
    );

  const handleLogSet = async (exerciseId: number, setNumber: number) => {
    const key = `${exerciseId}-${setNumber}`;
    const payload = tempSets[key];

    if (!payload?.reps || !payload.weight) return;

    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/v2/workouts/set-completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workout_exercise_id: exerciseId,
          set_number: setNumber,
          reps_completed: Number(payload.reps),
          weight_used: Number(payload.weight),
          completed_at: new Date().toISOString(),
        }),
      });

      if (!response.ok) throw new Error('failed_request');

      const newCompletion: SetCompletion = await response.json();
      
      // Refresh completions to get latest state
      const refreshResponse = await fetch(
        `${API_BASE_URL}/v2/workouts/set-completions?client_id=${user.id}&workout_day_id=${dayId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (refreshResponse.ok) {
        const refreshed = await refreshResponse.json();
        setSetCompletions(refreshed);
        
        // IMPORTANT: Reset customSetCounts for this exercise to prevent multiple empty sets
        // When a set is saved, we should only show sets up to the next one after the saved set
        // Don't automatically add empty sets - let user click "Add Set" if they want more
        const exercise = workoutDay?.workout_exercises.find(e => e.id === exerciseId);
        const targetSets = exercise?.target_sets || 0;
        const completedSetsAfterSave = refreshed.filter((c: SetCompletion) => c.workout_exercise_id === exerciseId);
        
        // Always reset customSetCounts when a set is saved to prevent showing empty sets
        // The cardSetCount logic will handle showing the next set
        setCustomSetCounts((prev) => {
          const next = { ...prev };
          delete next[exerciseId];
          return next;
        });
      } else {
        setSetCompletions((prev) => [...prev, newCompletion]);
        
        // Fallback: reset customSetCounts to prevent empty sets
        setCustomSetCounts((prev) => {
          const next = { ...prev };
          delete next[exerciseId];
          return next;
        });
      }
      
      // Clear the temp set data
      setTempSets((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err) {
      console.error('Failed to log set:', err);
    }
  };

  const renderExerciseCard = (exercise: WorkoutExercise, badgeLabel: string) => {
    const detail = exerciseDetails[exercise.exercise_id];
    // Priority: video_url > image_path > fallback
    const videoUrl = exercise.video_url || detail?.video_url || null;
    const imagePath = detail?.image_path || null;
    const resolvedVideoUrl = videoUrl || (imagePath ? null : VIDEO_FALLBACK_URL);
    // Get thumbnail for video URL, or fallback video if no video/image
    let thumbnail: string | null = null;
    if (videoUrl && getYoutubeId(videoUrl)) {
      thumbnail = getVideoThumbnail(videoUrl);
    } else if (!videoUrl && !imagePath) {
      // Use fallback video thumbnail if no video or image
      thumbnail = getVideoThumbnail(VIDEO_FALLBACK_URL);
    }
    const exerciseName =
      detail?.name || exercise.exercise?.name || t('training.unnamedExercise', 'תרגיל ללא שם');
    
    const completedSets = setCompletions.filter((c) => c.workout_exercise_id === exercise.id);
    const hasStarted = completedSets.length > 0;
    const targetSets = exercise.target_sets || 0;
    const previousSets = previousSessions[exercise.id] || [];
    const hasHistory = previousSets.length > 0;
    
    // If no sets recorded (no history and no completed sets today), show only "Add Set" button
    // If history exists, show last 2 sets as suggestions, then show target sets
    // If sets are already completed today, show them
    // Allow unlimited sets beyond target - users can do more than recommended
    const customCount = customSetCounts[exercise.id] ?? 0;
    let cardSetCount: number;
    
    if (hasStarted) {
      // If started, show completed sets + 1 empty set for the next set to fill
      // Only show all target sets if we've completed all of them
      const maxCompletedSetNumber = completedSets.length > 0 
        ? Math.max(...completedSets.map(c => c.set_number))
        : 0;
      
      // Show sets up to the next one after the last completed set, or target sets (whichever is higher)
      // But don't show all target sets at once - only show one empty set at a time
      if (maxCompletedSetNumber >= targetSets) {
        // All target sets completed, show them + any custom sets
        cardSetCount = targetSets + customCount;
      } else {
        // Show completed sets + 1 empty set for next set
        cardSetCount = Math.max(maxCompletedSetNumber + 1, completedSets.length + 1);
      }
    } else if (hasHistory) {
      // If history exists, show target sets + any additional custom sets
      cardSetCount = targetSets + customCount;
    } else {
      // If no history and not started, show at least 1 set if customCount is 0, otherwise show customCount
      // This ensures the first "Add Set" click will show a set
      cardSetCount = customCount === 0 ? 1 : customCount;
    }
    
    const lastTwoSets = previousSets.slice(0, 2); // Get last 2 sets from history
    const isExerciseComplete = completedSets.length >= targetSets && targetSets > 0;

    return (
      <Card
        key={exercise.id}
        className={cn(
          'overflow-hidden rounded-2xl border shadow-sm',
          hasStarted && 'border-primary/30 bg-primary/5',
          // Only highlight if this is the highlighted exercise AND day is completed
          dayCompleted && highlightedExerciseId === exercise.id && isExerciseComplete && 'border-green-500/30 bg-green-500/5',
          // If day is not completed, show normal completion highlighting
          !dayCompleted && isExerciseComplete && 'border-green-500/30 bg-green-500/5'
        )}
      >
        <CardHeader className="gap-3 space-y-3 pb-3 px-4 md:px-6">
          <div className="flex gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="relative h-20 w-16 md:h-24 md:w-20 shrink-0 overflow-hidden rounded-xl border border-border/40"
                  aria-label={t('training.watchVideo', 'Watch video')}
                >
                  {thumbnail ? (
                    <img src={thumbnail} alt={exerciseName} className="h-full w-full object-cover" loading="lazy" />
                  ) : imagePath ? (
                    <img src={`${API_BASE_URL}/files/media/exercise_images/${imagePath.split('/').pop() || imagePath.split('\\').pop()}`} alt={exerciseName} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted">
                      <Video className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground" />
                    </div>
                  )}
                  {(videoUrl || (!videoUrl && !imagePath)) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <PlayCircle className="h-5 w-5 md:h-6 md:w-6 text-white drop-shadow" />
                    </div>
                  )}
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-3xl max-w-[95vw] mx-4 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-base md:text-lg">{exerciseName}</DialogTitle>
                  <DialogDescription>
                    {detail?.description || exercise.exercise?.description || t('training.exerciseDetails', 'פרטי התרגיל')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {videoUrl ? (
                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl w-full">
                      <iframe
                        src={(() => {
                          const videoId = getYoutubeId(videoUrl);
                          if (!videoId) return VIDEO_FALLBACK_URL.replace('watch?v=', 'embed/');
                          // Check if already an embed URL
                          if (videoUrl.includes('/embed/')) return videoUrl;
                          // Convert to embed URL
                          return `https://www.youtube.com/embed/${videoId}`;
                        })()}
                        title={exerciseName}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </AspectRatio>
                  ) : imagePath ? (
                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl w-full">
                      <img
                        src={`${API_BASE_URL}/files/media/exercise_images/${imagePath.split('/').pop() || imagePath.split('\\').pop()}`}
                        alt={exerciseName}
                        className="h-full w-full object-cover"
                      />
                    </AspectRatio>
                  ) : (
                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl w-full">
                      <iframe
                        src={VIDEO_FALLBACK_URL.replace('watch?v=', 'embed/')}
                        title={exerciseName}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </AspectRatio>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <div className="flex flex-1 flex-col gap-2 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <CardTitle className="text-sm md:text-base font-semibold leading-tight truncate">
                      {exerciseName}
                    </CardTitle>
                    <Badge variant="secondary" className="rounded-full h-6 w-6 md:h-7 md:w-7 p-0 flex items-center justify-center text-xs md:text-sm font-semibold shrink-0">
                      {badgeLabel}
                    </Badge>
                    {isExerciseComplete && (
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {t('training.completed', 'Completed')}
                      </Badge>
                    )}
                    {hasStarted && !isExerciseComplete && (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                        {t('training.inProgress', 'In progress')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:text-sm text-muted-foreground">
                    {exercise.target_sets != null && exercise.target_sets > 0 && (
                      <span>{t('training.sets')}: {exercise.target_sets}</span>
                    )}
                    {exercise.target_reps && (
                      <span>{t('training.reps')}: {exercise.target_reps}</span>
                    )}
                    {exercise.target_weight != null && exercise.target_weight > 0 && (
                      <span>{t('training.weight')}: {exercise.target_weight} {t('training.kg')}</span>
                    )}
                    {exercise.rest_seconds != null && exercise.rest_seconds > 0 && (
                      <span>{t('training.rest')}: {formatRestTime(exercise.rest_seconds)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 w-10 sm:h-9 sm:w-9 p-0 touch-manipulation"
                        aria-label={t('training.history', 'היסטוריה')}
                      >
                        <History className="h-5 w-5 sm:h-4 sm:w-4 text-muted-foreground hover:text-foreground" />
                      </Button>
                    </DialogTrigger>
                    <ExerciseHistoryDialog exerciseId={exercise.id} exerciseName={exerciseName} />
                  </Dialog>
                </div>
              </div>

              {detail?.instructions && (
                <div className="text-xs md:text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  {detail.instructions}
                </div>
              )}

              {exercise.notes && (
                <div className="text-xs md:text-sm text-primary">{exercise.notes}</div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-2 px-4 md:px-6 pb-4 pt-3">
          {/* Show last 2 sets as suggestions if no sets completed today and history exists */}
          {!hasStarted && hasHistory && lastTwoSets.length > 0 && (
            <div className="space-y-2 mb-3">
              <p className="text-xs text-muted-foreground mb-2">
                {t('training.lastTwoSets', 'Last 2 sets (suggestions)')}:
              </p>
              {lastTwoSets.map((prevSet, idx) => (
                <div
                  key={`suggestion-${prevSet.id}`}
                  className="flex items-center gap-2 md:gap-3 rounded-lg border border-border/40 bg-muted/20 p-2.5 md:p-3"
                >
                  <span className="flex h-8 w-8 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-full bg-muted/50 text-xs md:text-sm font-semibold text-muted-foreground">
                    {prevSet.set_number.toString().padStart(2, '0')}
                  </span>
                  <div className="flex flex-1 items-center gap-3">
                    <div className="flex flex-col gap-0.5 text-xs md:text-sm">
                      <span className="text-muted-foreground">
                        {prevSet.weight_used} {t('training.kg')}
                      </span>
                      <span className="text-muted-foreground">
                        {prevSet.reps_completed} {t('training.reps')}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground/60 ml-auto">
                      {new Date(prevSet.completed_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {Array.from({ length: cardSetCount }).map((_, indexSet) => {
              const setNumber = indexSet + 1;
              const completed = isSetCompleted(exercise.id, setNumber);
              const currentKey = `${exercise.id}-${setNumber}`;
              
              // Get suggestion from last 2 sets for first set if available
              const suggestionSet = setNumber === 1 && lastTwoSets.length > 0 
                ? lastTwoSets[lastTwoSets.length - 1] 
                : null;

              const isSwiped = swipedSetKey === currentKey && swipeOffset > 50;
              const swipePercentage = Math.min((swipeOffset / 100) * 100, 100);
              
              return (
                <div
                  key={currentKey}
                  className="relative"
                  onTouchStart={(e) => handleSwipeStart(e, currentKey)}
                  onTouchMove={(e) => handleSwipeMove(e, currentKey)}
                  onTouchEnd={() => handleSwipeEnd(currentKey)}
                >
                  {/* Set box - stays in place */}
                  <div
                    className={cn(
                      'flex items-center gap-2 md:gap-3 rounded-lg border p-2.5 md:p-3 relative overflow-hidden transition-colors duration-300',
                      completed ? 'bg-muted/50 border-border/60' : 'bg-muted/30 border-border/60'
                    )}
                  >
                    {/* Red fill overlay - fills from right to left on mobile */}
                    <div
                      className={cn(
                        'absolute inset-0 bg-destructive transition-all duration-300 ease-out pointer-events-none',
                        'md:hidden' // Only show on mobile
                      )}
                      style={{
                        clipPath: `inset(0 ${100 - swipePercentage}% 0 0)`,
                        opacity: swipePercentage > 0 ? 0.3 + (swipePercentage / 100) * 0.4 : 0,
                      }}
                    />
                    
                    {/* Delete icon for desktop - always visible */}
                    <button
                      onClick={() => handleDeleteSet(exercise.id, setNumber)}
                      className="hidden md:flex items-center justify-center h-8 w-8 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive transition-all duration-200 ml-auto shrink-0"
                      aria-label={t('training.delete', 'Delete')}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                    
                    {/* Delete text overlay for mobile - appears when swiped */}
                    <div
                      className={cn(
                        'absolute right-4 top-1/2 -translate-y-1/2 text-destructive-foreground font-semibold text-sm transition-opacity duration-300 pointer-events-none md:hidden',
                        isSwiped ? 'opacity-100' : 'opacity-0'
                      )}
                    >
                      {t('training.delete', 'Delete')}
                    </div>
                    <span className="flex h-8 w-8 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs md:text-sm font-semibold text-foreground">
                      {setNumber.toString().padStart(2, '0')}
                    </span>

                    <div className="flex flex-1 items-center gap-2 md:gap-3 relative z-10">
                      {completed ? (
                        <>
                          <div className="flex flex-col gap-0.5 text-xs md:text-sm">
                            <span className="text-foreground">
                              {getCompletedSet(exercise.id, setNumber)?.weight_used ?? 0} {t('training.kg')}
                            </span>
                            <span className="text-muted-foreground">
                              {getCompletedSet(exercise.id, setNumber)?.reps_completed ?? 0} {t('training.reps')}
                            </span>
                          </div>
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted ml-auto">
                            <CheckCircle2 className="h-4 w-4 text-foreground" />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                placeholder={suggestionSet ? String(suggestionSet.reps_completed) : t('training.enterReps')}
                                value={tempSets[currentKey]?.reps ?? ''}
                                onChange={(e) => updateTempSet(exercise.id, setNumber, 'reps', e.target.value)}
                                className="h-10 md:h-9 rounded-lg border-border/50 bg-background/90 text-sm"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <Input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.5"
                                placeholder={suggestionSet ? String(suggestionSet.weight_used) : t('training.enterWeight')}
                                value={tempSets[currentKey]?.weight ?? ''}
                                onChange={(e) => updateTempSet(exercise.id, setNumber, 'weight', e.target.value)}
                                className="h-10 md:h-9 rounded-lg border-border/50 bg-background/90 text-sm disabled:opacity-60"
                              />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="h-10 md:h-9 shrink-0 rounded-lg px-3 md:px-4 text-xs"
                            onClick={() => handleLogSet(exercise.id, setNumber)}
                            disabled={!tempSets[currentKey]?.reps || !tempSets[currentKey]?.weight}
                          >
                            {t('training.logSet', 'Log set')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            variant="outline"
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 md:py-3 text-xs md:text-sm"
            onClick={() => handleAddSet(exercise.id)}
          >
            <PlusCircle className="h-4 w-4" />
            + {t('training.addSet')}
          </Button>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Layout currentPage="training">
        <div className="pb-20 lg:pb-8">
          <div className="max-w-6xl mx-auto flex flex-col items-center gap-3 px-4 py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">{t('training.loadingPlan', 'טוען את יום האימון...')}</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !workoutDay) {
    return (
      <Layout currentPage="training">
        <div className="pb-20 lg:pb-8">
          <div className="max-w-6xl mx-auto px-4 py-12">
            <Card className="border-destructive/40 bg-destructive/10">
              <CardContent className="flex items-center gap-3 pt-6 px-6">
                <p className="text-sm text-destructive">{error || t('training.dayNotFound', 'יום אימון לא נמצא')}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </Layout>
    );
  }

  const sortedExercises = [...workoutDay.workout_exercises].sort((a, b) => a.order_index - b.order_index);
  const groupMap = new Map<string, { name: string | null; exercises: WorkoutExercise[] }>();
  const groupOrder: Array<{ key: string; name: string | null }> = [];

  sortedExercises.forEach((exercise) => {
    const trimmed = exercise.group_name?.trim();
    const key = trimmed ? `group:${trimmed}` : `single:${exercise.id}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { name: trimmed || null, exercises: [] });
      groupOrder.push({ key, name: trimmed || null });
    }
    groupMap.get(key)!.exercises.push(exercise);
  });

  let runningIndex = 0;

  return (
    <Layout currentPage="training">
      <div className="pb-20">
        <div className="bg-gradient-to-br from-card to-secondary px-4 lg:px-6 py-4 lg:py-6 shadow-sm">
          <div className="max-w-6xl mx-auto space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate('/training')}
                  className="shrink-0"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate" dir="auto">{workoutDay.workout_plan_name || workoutDay.name}</h1>
                  {workoutDay.notes && (
                    <p className="text-sm sm:text-base text-muted-foreground mt-2 line-clamp-2">{workoutDay.notes}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Checkbox
                  id="day-complete"
                  checked={dayCompleted}
                  onCheckedChange={(checked) => handleToggleDayCompletion(Boolean(checked))}
                  className="h-5 w-5"
                />
                <label htmlFor="day-complete" className="text-xs sm:text-sm font-medium cursor-pointer whitespace-nowrap">
                  {dayCompleted ? t('training.dayCompleted', 'Day completed') : t('training.markDayComplete', 'Mark day complete')}
                </label>
              </div>
            </div>
            {workoutDay.estimated_duration && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{t('training.estimatedDuration', { minutes: workoutDay.estimated_duration, defaultValue: '{{minutes}} min' })}</span>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-6xl mx-auto space-y-4 md:space-y-6 px-4 lg:px-6 py-4 md:py-6">
          <div className="space-y-4 md:space-y-6">
            {groupOrder.map(({ key, name }) => {
              const groupData = groupMap.get(key);
              const groupExercises = groupData?.exercises ?? [];
              const isGrouped = !!name && groupExercises.length > 1;
              return (
                <div
                  key={key}
                  className={cn('space-y-6', isGrouped && 'rounded-2xl border border-border/60 bg-muted/40 p-4')}
                >
                  {name && (
                    <div className="text-sm font-semibold text-muted-foreground">{name}</div>
                  )}
                  {groupExercises.map((exercise, groupExerciseIndex) => {
                    const badgeLabel = name
                      ? `${name} · ${groupExerciseIndex + 1}`
                      : String.fromCharCode(65 + runningIndex);
                    runningIndex += 1;
                    return renderExerciseCard(exercise, badgeLabel);
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default TrainingDayPage;

