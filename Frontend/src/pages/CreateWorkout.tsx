import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Plus, X, Search, GripVertical, Trash2, Dumbbell } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config/api';
import { useTranslation } from 'react-i18next';

interface Client {
  id: number;
  full_name: string;
  email: string;
  profile?: {
    injuries?: string;
    goals?: string;
  };
}

interface Exercise {
  id: number;
  name: string;
  description: string;
  muscle_group: string;
  equipment_needed?: string;
  instructions?: string;
  difficulty_level: string;
}

interface WorkoutExercise {
  exercise_id: number;
  exercise_name: string;
  exercise_description: string;
  muscle_group: string;
  order: number;
  sets: number;
  reps: string;
  weight?: number;
  rest_time: number;
  notes: string;
}

const CreateWorkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('all');

  // Get client from location state
  const client = location.state?.client as Client;

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    client_id: client?.id || null,
    sessions_count: 1,
    difficulty_level: 'beginner',
    estimated_duration: '',
    notes: ''
  });

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<WorkoutExercise[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(true);

  // Redirect non-trainers away from trainer-only pages
  useEffect(() => {
    if (user) {
      if (user.role === 'CLIENT') {
        navigate('/', { replace: true });
      }
      // Admin can access (for monitoring purposes)
    }
  }, [user, navigate]);

  // Fetch exercises from database
  useEffect(() => {
    const fetchExercises = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/exercises/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setExercises(data);
        }
      } catch (error) {
        console.error('Error fetching exercises:', error);
      } finally {
        setLoadingExercises(false);
      }
    };

    fetchExercises();
  }, []);

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const filteredExercises = exercises.filter(exercise =>
    exercise.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (selectedMuscleGroup === 'all' || exercise.muscle_group === selectedMuscleGroup)
  );

  const muscleGroups = [...new Set(exercises.map(e => e.muscle_group))];

  const addExercise = (exercise: Exercise) => {
    const newWorkoutExercise: WorkoutExercise = {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      exercise_description: exercise.description,
      muscle_group: exercise.muscle_group,
      order: selectedExercises.length + 1,
      sets: 3,
      reps: '10-12',
      rest_time: 60,
      notes: ''
    };

    setSelectedExercises(prev => [...prev, newWorkoutExercise]);
  };

  const removeExercise = (index: number) => {
    setSelectedExercises(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Reorder remaining exercises
      return updated.map((exercise, i) => ({
        ...exercise,
        order: i + 1
      }));
    });
  };

  const updateExercise = (index: number, field: string, value: string | number) => {
    setSelectedExercises(prev => prev.map((exercise, i) => 
      i === index ? { ...exercise, [field]: value } : exercise
    ));
  };

  const moveExercise = (fromIndex: number, toIndex: number) => {
    setSelectedExercises(prev => {
      const updated = [...prev];
      const [movedExercise] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, movedExercise);
      return updated.map((exercise, i) => ({
        ...exercise,
        order: i + 1
      }));
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (selectedExercises.length === 0) {
      setError('Please add at least one exercise to the workout');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/workouts/plans`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          created_by: user?.id,
          estimated_duration: formData.estimated_duration ? parseInt(formData.estimated_duration) : null,
          exercises: selectedExercises
        }),
      });

      if (response.ok) {
        navigate('/trainer-dashboard?tab=workouts');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to create workout plan');
      }
    } catch (error) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    return formData.name && formData.client_id && selectedExercises.length > 0;
  };

  return (
    <Layout currentPage="dashboard">
      <div className="container mx-auto p-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('workoutCreation.back')}
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground">{t('workoutCreation.title')}</h1>
              <p className="text-muted-foreground">
                {client ? `${t('workoutCreation.creatingWorkoutFor')} ${client.full_name}` : t('workoutCreation.subtitle')}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Workout Information */}
          <Card>
            <CardHeader>
              <CardTitle>{t('workoutCreation.workoutInformation')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('workoutCreation.workoutNameRequired')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder={t('workoutCreation.workoutNamePlaceholder')}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sessions">{t('workoutCreation.numberOfSessions')}</Label>
                  <Input
                    id="sessions"
                    type="number"
                    value={formData.sessions_count}
                    onChange={(e) => handleInputChange('sessions_count', parseInt(e.target.value))}
                    min="1"
                    max="10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('workoutCreation.description')}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder={t('workoutCreation.descriptionPlaceholder')}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="difficulty">{t('workoutCreation.difficultyLevel')}</Label>
                  <Select value={formData.difficulty_level} onValueChange={(value) => handleInputChange('difficulty_level', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">{t('workoutCreation.beginner')}</SelectItem>
                      <SelectItem value="intermediate">{t('workoutCreation.intermediate')}</SelectItem>
                      <SelectItem value="advanced">{t('workoutCreation.advanced')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">{t('workoutCreation.estimatedDuration')}</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={formData.estimated_duration}
                    onChange={(e) => handleInputChange('estimated_duration', e.target.value)}
                    placeholder="e.g., 45"
                    min="15"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">{t('workoutCreation.generalNotes')}</Label>
                  <Input
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder={t('workoutCreation.generalNotesPlaceholder')}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Client Information */}
          {client && (
            <Card>
              <CardHeader>
                <CardTitle>{t('workoutCreation.clientInformation')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">{t('workoutCreation.clientName')}</Label>
                    <p className="text-foreground font-medium">{client.full_name}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">{t('workoutCreation.email')}</Label>
                    <p className="text-foreground">{client.email}</p>
                  </div>
                  {client.profile?.goals && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Goals</Label>
                      <p className="text-foreground">{client.profile.goals}</p>
                    </div>
                  )}
                  {client.profile?.injuries && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Injuries/Concerns</Label>
                      <p className="text-foreground text-orange-600">{client.profile.injuries}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Exercise Database */}
            <Card>
              <CardHeader>
                <CardTitle>{t('workoutCreation.exerciseDatabase')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder={t('workoutCreation.searchExercises')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={selectedMuscleGroup} onValueChange={setSelectedMuscleGroup}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('workoutCreation.allGroups')}</SelectItem>
                      {muscleGroups.map(group => (
                        <SelectItem key={group} value={group}>{group}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {loadingExercises ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                    </div>
                  ) : filteredExercises.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No exercises found</p>
                  ) : (
                    filteredExercises.map((exercise) => (
                      <div
                        key={exercise.id}
                        className="p-3 border rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors"
                        onClick={() => addExercise(exercise)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-foreground">{exercise.name}</h4>
                            <p className="text-sm text-muted-foreground line-clamp-1">{exercise.description}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge variant="outline" className="text-xs">{exercise.muscle_group}</Badge>
                              <Badge variant="outline" className="text-xs">{exercise.difficulty_level}</Badge>
                            </div>
                          </div>
                          <Plus className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Selected Exercises */}
            <Card>
              <CardHeader>
                <CardTitle>{t('workoutCreation.workoutExercises')} ({selectedExercises.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedExercises.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Dumbbell className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{t('workoutCreation.noExercisesSelected')}</p>
                    <p className="text-sm">{t('workoutCreation.clickToAddExercises')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedExercises.map((exercise, index) => (
                      <div key={index} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <GripVertical className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-muted-foreground">#{exercise.order}</span>
                            <h4 className="font-medium text-foreground">{exercise.exercise_name}</h4>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeExercise(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Sets</Label>
                            <Input
                              type="number"
                              value={exercise.sets}
                              onChange={(e) => updateExercise(index, 'sets', parseInt(e.target.value))}
                              min="1"
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Reps</Label>
                            <Input
                              value={exercise.reps}
                              onChange={(e) => updateExercise(index, 'reps', e.target.value)}
                              placeholder="10-12"
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Weight (kg)</Label>
                            <Input
                              type="number"
                              value={exercise.weight || ''}
                              onChange={(e) => updateExercise(index, 'weight', e.target.value ? parseFloat(e.target.value) : null)}
                              placeholder="Optional"
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Rest (sec)</Label>
                            <Input
                              type="number"
                              value={exercise.rest_time}
                              onChange={(e) => updateExercise(index, 'rest_time', parseInt(e.target.value))}
                              min="30"
                              className="h-8"
                            />
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground">Personalized Notes</Label>
                          <Textarea
                            value={exercise.notes}
                            onChange={(e) => updateExercise(index, 'notes', e.target.value)}
                            placeholder="Add personalized notes for this client (e.g., modifications, form cues, injury considerations)..."
                            rows={2}
                            className="text-sm"
                          />
                        </div>

                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="text-xs">{exercise.muscle_group}</Badge>
                          <span className="text-xs text-muted-foreground">{exercise.exercise_description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Error Display */}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2 text-red-600">
                  <X className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/trainer-dashboard')}
              disabled={loading}
            >
              {t('workoutCreation.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid() || loading}
              className="gradient-green"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Creating...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Save className="w-4 h-4" />
                  <span>{t('workoutCreation.createWorkoutPlan')}</span>
                </div>
              )}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default CreateWorkout; 