import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

interface SetCompletion {
  id: number;
  workout_exercise_id: number;
  set_number: number;
  reps_completed: number;
  weight_used: number;
  completed_at: string;
}

interface ExerciseOption {
  workout_exercise_id: number;
  exercise_id: number;
  exercise_name: string;
  workout_day_name?: string;
}

interface ClientExerciseHistoryMatrixProps {
  clientId: number;
  exercises: ExerciseOption[];
  maxDates?: number;
}

const MAX_DATES_DEFAULT = 5;

const ClientExerciseHistoryMatrix: React.FC<ClientExerciseHistoryMatrixProps> = ({
  clientId,
  exercises,
  maxDates = MAX_DATES_DEFAULT,
}) => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(
    exercises.length > 0 ? exercises[0].workout_exercise_id : null
  );
  const [history, setHistory] = useState<SetCompletion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (exercises.length > 0 && selectedExerciseId === null) {
      setSelectedExerciseId(exercises[0].workout_exercise_id);
    }
  }, [exercises, selectedExerciseId]);

  useEffect(() => {
    if (!selectedExerciseId) return;

    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        const response = await fetch(
          `${API_BASE_URL}/v2/workouts/set-completions?client_id=${clientId}&workout_exercise_id=${selectedExerciseId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data: SetCompletion[] = await response.json();
          setHistory(data);
        } else {
          setError(t('clientProfile.noHistoryForExercise', 'No logged history for this exercise yet.'));
          setHistory([]);
        }
      } catch (err) {
        console.error('Failed to fetch exercise history:', err);
        setError(t('clientProfile.noHistoryForExercise', 'No logged history for this exercise yet.'));
        setHistory([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [clientId, selectedExerciseId, t]);

  const matrix = useMemo(() => {
    if (history.length === 0) return null;

    const byDate = new Map<string, SetCompletion[]>();
    for (const completion of history) {
      const dateKey = new Date(completion.completed_at).toISOString().split('T')[0];
      const existing = byDate.get(dateKey);
      if (existing) {
        existing.push(completion);
      } else {
        byDate.set(dateKey, [completion]);
      }
    }

    const sortedDateKeys = Array.from(byDate.keys()).sort();
    const displayDates = sortedDateKeys.slice(-maxDates);

    const setForDate = (dateKey: string, setNumber: number): SetCompletion | null => {
      const completions = byDate.get(dateKey) || [];
      const matches = completions.filter((c) => c.set_number === setNumber);
      if (matches.length === 0) return null;
      return matches.reduce((latest, current) =>
        new Date(current.completed_at).getTime() > new Date(latest.completed_at).getTime() ? current : latest
      );
    };

    const maxSetNumber = Math.max(
      0,
      ...displayDates.flatMap((dateKey) => (byDate.get(dateKey) || []).map((c) => c.set_number))
    );

    const volumeForDate = (dateKey: string): number =>
      (byDate.get(dateKey) || []).reduce((sum, c) => sum + c.reps_completed * c.weight_used, 0);

    const pctChange = (values: (number | null)[]): string | null => {
      const populated = values.filter((v): v is number => v !== null);
      if (populated.length < 2) return null;
      const prev = populated[populated.length - 2];
      const last = populated[populated.length - 1];
      if (prev === 0) return null;
      return (((last - prev) / prev) * 100).toFixed(1);
    };

    const setRows = Array.from({ length: maxSetNumber }, (_, i) => {
      const setNumber = i + 1;
      const cells = displayDates.map((dateKey) => setForDate(dateKey, setNumber));
      const values = cells.map((c) => (c ? c.reps_completed * c.weight_used : null));
      return {
        setNumber,
        cells,
        pctChange: pctChange(values),
      };
    });

    const volumeCells = displayDates.map((dateKey) => volumeForDate(dateKey));
    const volumePctChange = pctChange(volumeCells);

    return { displayDates, setRows, volumeCells, volumePctChange };
  }, [history, maxDates]);

  const selectedExercise = exercises.find((ex) => ex.workout_exercise_id === selectedExerciseId);

  return (
    <Card dir={isRtl ? 'rtl' : 'ltr'}>
      <CardHeader>
        <CardTitle>{t('clientProfile.workoutHistory', 'Workout History')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm">
          <Select
            value={selectedExerciseId ? String(selectedExerciseId) : undefined}
            onValueChange={(value) => setSelectedExerciseId(Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('clientProfile.selectExerciseForHistory', 'Select an exercise')} />
            </SelectTrigger>
            <SelectContent>
              {exercises.map((ex) => (
                <SelectItem key={ex.workout_exercise_id} value={String(ex.workout_exercise_id)}>
                  {ex.exercise_name}
                  {ex.workout_day_name ? ` (${ex.workout_day_name})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !selectedExercise ? (
          <p className="text-sm text-muted-foreground">{t('clientProfile.noExerciseSelected', 'Select an exercise to view its history.')}</p>
        ) : error || !matrix ? (
          <p className="text-sm text-muted-foreground">{t('clientProfile.noHistoryForExercise', 'No logged history for this exercise yet.')}</p>
        ) : (
          <div className="space-y-2">
            {matrix.displayDates.length === 1 && (
              <p className="text-xs text-muted-foreground">
                {t('clientProfile.onlyOneSessionLogged', 'Only one session logged — % change unavailable')}
              </p>
            )}
            <Table dir={isRtl ? 'rtl' : 'ltr'}>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  {matrix.displayDates.map((dateKey) => (
                    <TableHead key={dateKey}>
                      {new Date(dateKey).toLocaleDateString(isRtl ? 'he-IL' : 'en-US')}
                    </TableHead>
                  ))}
                  <TableHead title={t('clientProfile.volumeTooltip', '% change is based on volume (reps × weight)')}>
                    {t('clientProfile.percentChange', '% Change')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.setRows.map((row) => (
                  <TableRow key={row.setNumber}>
                    <TableCell className="font-medium">
                      {t('training.sets', 'Set')} {row.setNumber}
                    </TableCell>
                    {row.cells.map((cell, idx) => (
                      <TableCell key={matrix.displayDates[idx]}>
                        {cell ? `${cell.reps_completed}x${cell.weight_used} ${t('training.kg', 'kg')}` : '—'}
                      </TableCell>
                    ))}
                    <TableCell>{row.pctChange !== null ? `${row.pctChange}%` : '—'}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-semibold">{t('clientProfile.volume', 'Volume')}</TableCell>
                  {matrix.volumeCells.map((volume, idx) => (
                    <TableCell key={matrix.displayDates[idx]} className="font-semibold">
                      {Math.round(volume)}
                      {t('training.kg', 'kg')}
                    </TableCell>
                  ))}
                  <TableCell className="font-semibold">
                    {matrix.volumePctChange !== null ? `${matrix.volumePctChange}%` : '—'}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ClientExerciseHistoryMatrix;
