import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dumbbell, Plus, Search, Filter, Edit, Trash2,
  Video, FileText, Tag, Clock, Weight, Settings, Save, X, Image as ImageIcon,
  Download, Upload, Library, Sparkles, LayoutTemplate, Split, Tags, Gauge, FilterX
} from 'lucide-react';
import { ActionBtn, EmptyState, PageTitle } from '@/features/trainer/ui';
import { InfoTip } from '@/components/ui/info-tip';
import { BankExerciseSheet } from '@/features/trainer/BankExerciseSheet';
import { MuscleGroupsSheet, groupSlug, type MuscleGroup } from '@/features/trainer/MuscleGroupsSheet';
import { TemplatesSheet } from '@/features/trainer/TemplatesSheet';
import { ExerciseLibrary, LevelBars } from '@/components/exercises/ExerciseLibrary';
import { ExerciseDemo } from '@/components/exercises/ExerciseDemo';
import { exerciseFrames } from '@/lib/exerciseLibrary';
import '@/styles/exercises.css';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config/api';
import { useToast } from '../hooks/use-toast';
import { useTranslation } from 'react-i18next';
import {
  ExerciseImportReviewDialog,
  type ExerciseImportPreviewRow,
  type ExerciseImportDecision,
} from '../components/ExerciseImportReviewDialog';
interface Exercise {
  id: number;
  name: string;
  description: string;
  muscle_group: string;
  equipment_needed?: string;
  instructions?: string;
  video_url?: string;
  image_path?: string;
  category?: string;
  library_id?: string | null;
  created_by: number;
  created_at: string;
}

const levelOf = (e: Exercise) => (/\bexpert\b/.test(e.description || '') ? 'expert' : /\bintermediate\b/.test(e.description || '') ? 'intermediate' : /\bbeginner\b/.test(e.description || '') ? 'beginner' : '');

const staticMuscleGroups = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'legs', 'glutes', 'core', 'cardio', 'full body'
];

const ExerciseBank = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();

  const getMuscleGroupDisplayName = (value: string): string => {
    if (staticMuscleGroups.includes(value)) {
      return t(`exerciseBank.muscleGroups.${value}`, value);
    }
    const dyn = dynamicMuscleGroups.find(
      (mg) => mg.name.toLowerCase().replace(/\s+/g, '_') === value
    );
    if (dyn) {
      return i18n.language === 'he' && dyn.name_he ? dyn.name_he : dyn.name;
    }
    return value;
  };

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false); // Track if user clicked X to remove image
  const [mediaType, setMediaType] = useState<'video' | 'image'>('video');
  const [muscleGroups, setMuscleGroups] = useState<string[]>(staticMuscleGroups);
  const [dynamicMuscleGroups, setDynamicMuscleGroups] = useState<Array<{id: number, name: string, name_he?: string | null}>>([]);
  const [muscleGroupDialogOpen, setMuscleGroupDialogOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [detail, setDetail] = useState<Exercise | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'library' | 'custom'>('all');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importReviewOpen, setImportReviewOpen] = useState(false);
  const [importReviewData, setImportReviewData] = useState<{ rows: ExerciseImportPreviewRow[]; message?: string } | null>(null);

  const [exerciseForm, setExerciseForm] = useState({
    name: '',
    description: '',
    muscle_group: '',
    equipment_needed: '',
    instructions: '',
    video_url: '',
    category: ''
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const [libraryOpen, setLibraryOpen] = useState(false);

  const fetchExercises = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE_URL}/exercises/`, {
        headers
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Fetched exercises:', data);
        setExercises(Array.isArray(data) ? data : []);
      } else {
        const errorText = await response.text();
        console.error('Failed to fetch exercises:', response.status, errorText);
        toast({
          title: t('common.error'),
          description: t('exerciseBank.errorLoad'),
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error fetching exercises:', error);
      toast({
        title: t('common.error'),
        description: t('exerciseBank.errorLoad'),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExercises();
  }, []);

  // Fetch dynamic muscle groups
  useEffect(() => {
    const fetchMuscleGroups = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/muscle-groups/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          setDynamicMuscleGroups(data);
          // Combine static and dynamic muscle groups (value = slug of English name for API compatibility)
          const dynamicGroupNames = data.map((mg: {id: number, name: string}) => mg.name.toLowerCase().replace(/\s+/g, '_'));
          const combined = [...staticMuscleGroups, ...dynamicGroupNames].filter((v, i, a) => a.indexOf(v) === i);
          setMuscleGroups(combined);
        }
      } catch (error) {
        console.error('Failed to load muscle groups:', error);
      }
    };
    fetchMuscleGroups();
  }, []);

  const q = searchTerm.trim().toLowerCase();
  const matches = (exercise: Exercise, skip?: 'muscle') =>
    (!q || exercise.name.toLowerCase().includes(q) || (exercise.instructions || '').toLowerCase().includes(q)) &&
    (skip === 'muscle' || selectedMuscleGroup === 'all' || exercise.muscle_group === selectedMuscleGroup) &&
    (equipmentFilter === 'all' || (exercise.equipment_needed || '') === equipmentFilter) &&
    (levelFilter === 'all' || levelOf(exercise) === levelFilter) &&
    (sourceFilter === 'all' || (sourceFilter === 'library' ? !!exercise.library_id : !exercise.library_id));

  const filteredExercises = exercises.filter((exercise) => matches(exercise));
  const countBy = (list: Exercise[]) =>
    list.reduce<Record<string, number>>((acc, e) => {
      acc[e.muscle_group] = (acc[e.muscle_group] ?? 0) + 1;
      return acc;
    }, {});
  const muscleCounts = countBy(exercises.filter((e) => matches(e, 'muscle')));
  const totalCounts = countBy(exercises);
  const chipGroups = muscleGroups.filter((g) => (muscleCounts[g] ?? 0) > 0 || g === selectedMuscleGroup);
  const equipmentOptions = [...new Set(exercises.map((e) => e.equipment_needed || '').filter(Boolean))].sort();
  const filtersActive = !!q || selectedMuscleGroup !== 'all' || equipmentFilter !== 'all' || levelFilter !== 'all' || sourceFilter !== 'all';
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedMuscleGroup('all');
    setEquipmentFilter('all');
    setLevelFilter('all');
    setSourceFilter('all');
  };
  const onGroupsChange = (groups: MuscleGroup[]) => {
    setDynamicMuscleGroups(groups);
    setMuscleGroups([...staticMuscleGroups, ...groups.map((g) => groupSlug(g.name))].filter((v, i, a) => a.indexOf(v) === i));
  };

  const groupedExercises = filteredExercises.reduce((acc, exercise) => {
    const group = exercise.muscle_group;
    if (!acc[group]) acc[group] = [];
    acc[group].push(exercise);
    return acc;
  }, {} as Record<string, Exercise[]>);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: t('common.error'),
          description: 'Please select an image file',
          variant: "destructive"
        });
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: t('common.error'),
          description: 'Image file size must be less than 10MB',
          variant: "destructive"
        });
        return;
      }

      setImageFile(file);
      setImageRemoved(false); // Reset removal flag when new image is selected

      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateExercise = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields and set errors
    const errors: Record<string, boolean> = {};
    let firstErrorField: string | null = null;

    if (!exerciseForm.name || !exerciseForm.name.trim()) {
      errors.name = true;
      if (!firstErrorField) firstErrorField = 'name';
    }

    if (!exerciseForm.muscle_group || !exerciseForm.muscle_group.trim()) {
      errors.muscle_group = true;
      if (!firstErrorField) firstErrorField = 'muscle_group';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Scroll to first error field
      if (firstErrorField) {
        setTimeout(() => {
          const errorElement = document.getElementById(firstErrorField);
          if (errorElement) {
            errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            errorElement.focus();
          }
        }, 100);
      }
      return;
    }

    // Clear errors if validation passes
    setFieldErrors({});

    try {
      const token = localStorage.getItem('access_token');

      // Prepare exercise data (without created_by - backend adds it)
      const exerciseData = {
        name: exerciseForm.name.trim(),
        description: exerciseForm.description?.trim() || null,
        muscle_group: exerciseForm.muscle_group.trim(),
        equipment_needed: exerciseForm.equipment_needed?.trim() || null,
        instructions: exerciseForm.instructions?.trim() || null,
        video_url: exerciseForm.video_url?.trim() || null,
        category: exerciseForm.category?.trim() || null,
      };

      // If image is uploaded, use multipart/form-data
      if (imageFile) {
        const formDataToSend = new FormData();
        formDataToSend.append('exercise_json', JSON.stringify(exerciseData));
        formDataToSend.append('image', imageFile);

        const response = await fetch(`${API_BASE_URL}/exercises/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formDataToSend,
        });

        if (response.ok) {
          const newExercise = await response.json();
          setExercises([...exercises, newExercise]);
          setCreateDialogOpen(false);
          resetForm();
          setImageFile(null);
          setImagePreview(null);
          toast({
            title: t('common.success'),
            description: t('exerciseBank.successCreated')
          });
        } else {
          let errorMessage = t('exerciseBank.errorCreate');
          try {
            const error = await response.json();
            errorMessage = error.detail || error.message || errorMessage;
          } catch (e) {
            errorMessage = `Error ${response.status}: ${response.statusText}`;
          }
          toast({
            title: t('common.error'),
            description: errorMessage,
            variant: "destructive"
          });
        }
      } else {
        // No image, use JSON body
        const response = await fetch(`${API_BASE_URL}/exercises/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(exerciseData)
        });

        if (response.ok) {
          const newExercise = await response.json();
          setExercises([...exercises, newExercise]);
          setCreateDialogOpen(false);
          resetForm();
          toast({
            title: t('common.success'),
            description: t('exerciseBank.successCreated')
          });
        } else {
          let errorMessage = t('exerciseBank.errorCreate');
          try {
            const error = await response.json();
            errorMessage = error.detail || error.message || errorMessage;
          } catch (e) {
            errorMessage = `Error ${response.status}: ${response.statusText}`;
          }
          toast({
            title: t('common.error'),
            description: errorMessage,
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error('Error creating exercise:', error);
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('exerciseBank.errorCreate'),
        variant: "destructive"
      });
    }
  };

  const handleUpdateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExercise) return;

    // Validate required fields and set errors
    const errors: Record<string, boolean> = {};
    let firstErrorField: string | null = null;

    if (!exerciseForm.name || !exerciseForm.name.trim()) {
      errors.name = true;
      if (!firstErrorField) firstErrorField = 'name';
    }

    if (!exerciseForm.muscle_group || !exerciseForm.muscle_group.trim()) {
      errors.muscle_group = true;
      if (!firstErrorField) firstErrorField = 'muscle_group';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Scroll to first error field
      if (firstErrorField) {
        setTimeout(() => {
          const errorElement = document.getElementById(firstErrorField);
          if (errorElement) {
            errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            errorElement.focus();
          }
        }, 100);
      }
      return;
    }

    // Clear errors if validation passes
    setFieldErrors({});

    try {
      const token = localStorage.getItem('access_token');

      // If new image is uploaded, use multipart/form-data
      if (imageFile) {
        const exerciseData = {
          ...exerciseForm,
          video_url: exerciseForm.video_url || null,
        };

        const formDataToSend = new FormData();
        formDataToSend.append('exercise_json', JSON.stringify(exerciseData));
        formDataToSend.append('image', imageFile);

        const response = await fetch(`${API_BASE_URL}/exercises/${editingExercise.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formDataToSend,
        });

        if (response.ok) {
          const updatedExercise = await response.json();
          setExercises(exercises.map(ex =>
            ex.id === updatedExercise.id ? updatedExercise : ex
          ));
          setEditingExercise(null);
          resetForm();
          toast({
            title: t('common.success'),
            description: t('exerciseBank.successUpdated')
          });
        } else {
          const error = await response.json();
          toast({
            title: t('common.error'),
            description: error.detail || t('exerciseBank.errorUpdate'),
            variant: "destructive"
          });
        }
      } else {
        // No new image, use JSON
        // If image was removed (user clicked X), explicitly set image_path to null
        const exerciseData = {
          ...exerciseForm,
          video_url: exerciseForm.video_url || null,
          ...(imageRemoved && editingExercise?.image_path ? { image_path: null } : {})
        };

        const response = await fetch(`${API_BASE_URL}/exercises/${editingExercise.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(exerciseData)
        });

        if (response.ok) {
          const updatedExercise = await response.json();
          setExercises(exercises.map(ex =>
            ex.id === updatedExercise.id ? updatedExercise : ex
          ));
          setEditingExercise(null);
          resetForm();
          toast({
            title: t('common.success'),
            description: t('exerciseBank.successUpdated')
          });
        } else {
          const error = await response.json();
          toast({
            title: t('common.error'),
            description: error.detail || t('exerciseBank.errorUpdate'),
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error('Error updating exercise:', error);
      toast({
        title: t('common.error'),
        description: t('exerciseBank.errorUpdate'),
        variant: "destructive"
      });
    }
  };

  const handleDeleteExercise = async (exerciseId: number) => {
    if (!confirm(t('exerciseBank.deleteConfirm'))) return;

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/exercises/${exerciseId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setExercises(exercises.filter(ex => ex.id !== exerciseId));
        toast({
          title: t('common.success'),
          description: t('exerciseBank.successDeleted')
        });
      } else {
        // Try to parse error message from response
        let errorMessage = t('exerciseBank.errorDelete');
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            if (errorData.detail) {
              errorMessage = errorData.detail;
            }
          } else {
            const text = await response.text();
            if (text) {
              errorMessage = text;
            }
          }
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
        }

        toast({
          title: t('common.error'),
          description: errorMessage,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error deleting exercise:', error);
      toast({
        title: t('common.error'),
        description: t('exerciseBank.errorDelete'),
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setExerciseForm({
      name: '',
      description: '',
      muscle_group: '',
      equipment_needed: '',
      instructions: '',
      video_url: '',
      category: ''
    });
    setFieldErrors({});
    setImageFile(null);
    setImagePreview(null);
    setImageRemoved(false);
    setMediaType('video');
  };

  const startEdit = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setFieldErrors({}); // Clear any previous errors
    setExerciseForm({
      name: exercise.name,
      description: exercise.description,
      muscle_group: exercise.muscle_group,
      equipment_needed: exercise.equipment_needed || '',
      instructions: exercise.instructions || '',
      video_url: exercise.video_url || '',
      category: exercise.category || ''
    });

    // Set media type based on what exists
    setImageRemoved(false); // Reset removal flag when starting to edit
    if (exercise.video_url) {
      setMediaType('video');
      setImageFile(null);
      setImagePreview(null);
    } else if (exercise.image_path) {
      setMediaType('image');
      setImageFile(null); // No new file selected yet
      // Construct URL for existing image
      let imageUrl: string;
      // Check if path already contains API URL or is a full URL
      if (exercise.image_path.startsWith('http://') || exercise.image_path.startsWith('https://') || exercise.image_path.startsWith(API_BASE_URL)) {
        imageUrl = exercise.image_path;
      } else {
        // Extract filename from path (handles both / and \ separators)
        const imageFileName = exercise.image_path.split('/').pop() || exercise.image_path.split('\\').pop();
        imageUrl = `${API_BASE_URL}/files/media/exercise_images/${imageFileName}`;
      }
      setImagePreview(imageUrl);
    } else {
      setMediaType('video');
      setImageFile(null);
      setImagePreview(null);
    }
  };

  const handleExportExcel = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/exercises/export/excel`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `exercises_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({
          title: t('common.success'),
          description: 'Exercises exported successfully'
        });
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: 'Failed to export exercises',
        variant: "destructive"
      });
    }
  };

  const handleImportExcel = async () => {
    const fileToImport = importFile;
    if (!fileToImport) {
      toast({
        title: t('common.error'),
        description: t('exerciseBank.selectFileToImport', 'Please select a file to import'),
        variant: "destructive"
      });
      return;
    }

    setIsImporting(true);
    try {
      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      formData.append('file', fileToImport);

      const response = await fetch(`${API_BASE_URL}/exercises/import/excel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        const rows: ExerciseImportPreviewRow[] = result.rows ?? [];
        if (rows.length === 0) {
          toast({
            title: t('common.warning', 'Warning'),
            description: result.message || t('exerciseBank.importReviewNoRows', 'No valid rows to import.'),
            variant: 'destructive'
          });
          setImportFile(null);
          return;
        }
        setImportReviewData({ rows, message: result.message });
        setImportReviewOpen(true);
      } else {
        const error = await response.json();
        throw new Error(error.detail || 'Import failed');
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('exerciseBank.errorImport', 'Failed to import exercises'),
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportReviewConfirm = async (decisions: Record<number, ExerciseImportDecision>) => {
    if (!importReviewData?.rows) return;

    setIsImporting(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/exercises/import/excel/process`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rows: importReviewData.rows,
          decisions
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: t('common.success'),
          description: result.message || `Imported ${result.imported_count} exercises`
        });
        setImportReviewOpen(false);
        setImportReviewData(null);
        setImportFile(null);
        fetchExercises();
      } else {
        const error = await response.json();
        throw new Error(error.detail || 'Import processing failed');
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('exerciseBank.errorImport', 'Failed to process import'),
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
    }
  };

  if (loading) {
    return (
      <Layout currentPage="exercises">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
            <span className="text-muted-foreground">{t('exerciseBank.loading')}</span>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage="exercises">
      <div className="container mx-auto p-4 md:p-6 space-y-5">
        <PageTitle
          eyebrow={<span className="inline-flex items-center gap-1.5">{t('tt.bank.eyebrow', { count: exercises.length })}<InfoTip>{t('banks.exercise.ctaScale')}</InfoTip></span>}
          title={t('exerciseBank.title')}
          lead={t('exerciseBank.subtitle')}
          actions={
            <>
              <button type="button" onClick={() => setLibraryOpen(true)} className="tp-btn tp-btn--primary tp-btn--sm tp-press max-sm:flex-1">
                <Library className="h-4 w-4" />
                {t('exerciseLibrary.open')}
              </button>
              <ActionBtn icon={Plus} label={t('exerciseBank.addExercise')} onClick={() => setCreateDialogOpen(true)} />
              <ActionBtn icon={LayoutTemplate} label={t('tt.tpl.button')} onClick={() => setTemplatesOpen(true)} />
              <ActionBtn icon={Split} label={t('exerciseBank.createWorkoutSplit', 'צור פיצול אימון')} onClick={() => navigate('/create-workout-plan-v2?createSplit=true')} />
              <ActionBtn icon={Tags} label={t('tt.mg.button')} onClick={() => setMuscleGroupDialogOpen(true)} />
              <ActionBtn icon={Download} label={t('common.exportExcel')} onClick={handleExportExcel} compact />
              <input
                type="file"
                id="exercise-import-file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setImportFile(file);
                    setTimeout(() => handleImportExcel(), 100);
                  }
                }}
                className="hidden"
                disabled={isImporting}
              />
              <ActionBtn
                icon={Upload}
                label={isImporting ? t('common.importing') : t('common.importExcel')}
                onClick={() => document.getElementById('exercise-import-file')?.click()}
                disabled={isImporting}
                compact
              />
            </>
          }
        />

        {/* Filters (#15) */}
        <section className="tp-card space-y-3 p-3 sm:p-4" aria-label={t('tt.bank.filters')}>
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <label className="tr-sbox min-w-0 flex-1">
              <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
              <span className="sr-only">{t('tt.common.search')}</span>
              <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t('exerciseBank.searchPlaceholder')} dir="auto" />
              {searchTerm && (
                <button type="button" className="tp-icon-btn !h-7 !w-7" onClick={() => setSearchTerm('')} aria-label={t('tt.common.clear')}><X className="h-3.5 w-3.5" /></button>
              )}
            </label>
            <div className="grid grid-cols-3 gap-2 lg:flex">
              <label className="tr-filter">
                <span className="sr-only">{t('tt.bank.equipment')}</span>
                <Weight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
                <select value={equipmentFilter} onChange={(e) => setEquipmentFilter(e.target.value)} title={t('tt.bank.equipment')}>
                  <option value="all">{t('tt.bank.anyEquipment')}</option>
                  {equipmentOptions.map((eq) => <option key={eq} value={eq}>{t(`exerciseLibrary.equipment.${eq}`, { defaultValue: eq })}</option>)}
                </select>
              </label>
              <label className="tr-filter">
                <span className="sr-only">{t('tt.bank.level')}</span>
                <Gauge className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
                <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} title={t('tt.bank.level')}>
                  <option value="all">{t('tt.bank.anyLevel')}</option>
                  {['beginner', 'intermediate', 'expert'].map((l) => <option key={l} value={l}>{t(`exerciseLibrary.level.${l}`, { defaultValue: l })}</option>)}
                </select>
              </label>
              <label className="tr-filter">
                <span className="sr-only">{t('tt.bank.source')}</span>
                <Library className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as 'all' | 'library' | 'custom')} title={t('tt.bank.source')}>
                  <option value="all">{t('tt.bank.anySource')}</option>
                  <option value="library">{t('tt.bank.fromLibrary')}</option>
                  <option value="custom">{t('tt.bank.custom')}</option>
                </select>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="tr-chips" role="group" aria-label={t('tt.bank.muscle')}>
              <button type="button" className="tr-chip" aria-pressed={selectedMuscleGroup === 'all'} onClick={() => setSelectedMuscleGroup('all')}>
                {t('tt.common.all')}<span>{exercises.filter((e) => matches(e, 'muscle')).length}</span>
              </button>
              {chipGroups.map((g) => (
                <button key={g} type="button" className="tr-chip" aria-pressed={selectedMuscleGroup === g} onClick={() => setSelectedMuscleGroup(selectedMuscleGroup === g ? 'all' : g)}>
                  {getMuscleGroupDisplayName(g)}<span>{muscleCounts[g] ?? 0}</span>
                </button>
              ))}
            </div>
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="tp-icon-btn tp-press !h-9 !w-9 flex-none" aria-label={t('tt.common.clear')} title={t('tt.common.clear')}>
                <FilterX className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>

        {/* Exercise List by Muscle Group */}
        <div className="space-y-6">
          {Object.keys(groupedExercises).length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title={t('exerciseBank.noExercises', 'אין תרגילים')}
              body={filtersActive
                ? t('exerciseBank.noExercisesFiltered', 'לא נמצאו תרגילים התואמים לחיפוש שלך')
                : t('exerciseBank.noExercisesDescription', 'עדיין לא נוצרו תרגילים. צור תרגיל חדש כדי להתחיל.')}
              action={filtersActive ? (
                <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press" onClick={clearFilters}><FilterX className="h-4 w-4" />{t('tt.common.clear')}</button>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" className="tp-btn tp-btn--primary tp-btn--sm tp-press" onClick={() => setLibraryOpen(true)}><Sparkles className="h-4 w-4" />{t('exerciseLibrary.open')}</button>
                  <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm tp-press" onClick={() => setCreateDialogOpen(true)}><Plus className="h-4 w-4" />{t('exerciseBank.addExercise')}</button>
                </div>
              )}
            />
          ) : (
            Object.entries(groupedExercises).map(([muscleGroup, groupExercises]) => (
              <section key={muscleGroup}>
                <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
                  {getMuscleGroupDisplayName(muscleGroup)}
                  <span className="tp-chip tabular-nums">{groupExercises.length}</span>
                </h2>
                <div className="tr-ex-grid">
                  {groupExercises.map((exercise, idx) => {
                    const frames = exerciseFrames(exercise);
                    const level = levelOf(exercise);
                    return (
                      <article
                        key={exercise.id}
                        style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}
                        className="ec-excard group relative overflow-hidden rounded-[1.25rem] border border-border/60 bg-card"
                      >
                        <button type="button" className="block w-full text-start focus-visible:outline-none" onClick={() => setDetail(exercise)} aria-label={t('tt.bank.openDetails', { name: exercise.name })}>
                          {frames.length > 0 ? (
                            <ExerciseDemo frames={frames} alt={exercise.name} className="aspect-[16/10] w-full" />
                          ) : (
                            <span className="grid aspect-[16/10] w-full place-items-center bg-primary/[.07] text-primary"><Dumbbell className="h-8 w-8" /></span>
                          )}
                          <span className="block space-y-2 p-3 sm:p-4">
                            <span className="flex items-start gap-2">
                              <span className="line-clamp-2 min-w-0 flex-1 text-[.95rem] font-bold leading-snug sm:text-lg">{exercise.name}</span>
                              {level && <span className="mt-1.5 max-sm:hidden"><LevelBars level={level} /></span>}
                            </span>
                            <span className="flex flex-wrap gap-1.5 text-xs">
                              {exercise.equipment_needed && (
                                <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                                  <Weight className="h-3 w-3" />
                                  {t(`exerciseLibrary.equipment.${exercise.equipment_needed}`, { defaultValue: exercise.equipment_needed })}
                                </span>
                              )}
                              {exercise.video_url && <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-primary"><Video className="h-3 w-3" /></span>}
                            </span>
                          </span>
                        </button>
                        <div className="absolute end-2 top-2 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
                          <button type="button" className="tr-card-ibtn" onClick={() => startEdit(exercise)} aria-label={t('common.edit', 'Edit')} title={t('common.edit', 'Edit')}>
                            <Edit className="h-4 w-4" />
                          </button>
                          <button type="button" className="tr-card-ibtn text-destructive" onClick={() => handleDeleteExercise(exercise.id)} aria-label={t('common.delete', 'Delete')} title={t('common.delete', 'Delete')}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <BankExerciseSheet
          exercise={detail}
          onClose={() => setDetail(null)}
          muscleLabel={getMuscleGroupDisplayName}
          onEdit={(e) => { setDetail(null); startEdit(e as Exercise); }}
          onDelete={(e) => { setDetail(null); handleDeleteExercise(e.id); }}
        />
        <MuscleGroupsSheet
          open={muscleGroupDialogOpen}
          onOpenChange={setMuscleGroupDialogOpen}
          builtIn={staticMuscleGroups}
          groups={dynamicMuscleGroups}
          counts={totalCounts}
          labelOf={getMuscleGroupDisplayName}
          onChange={onGroupsChange}
        />
        <TemplatesSheet open={templatesOpen} onOpenChange={setTemplatesOpen} initialKind="workout" />
        <ExerciseLibrary
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          onImported={(n) => {
            toast({ title: t('exerciseLibrary.imported', { count: n }) });
            fetchExercises();
          }}
        />

        {/* Create/Edit Exercise Dialog */}
        <Dialog open={createDialogOpen || !!editingExercise}
                onOpenChange={(open) => {
                  if (!open) {
                    setCreateDialogOpen(false);
                    setEditingExercise(null);
                    resetForm();
                    setFieldErrors({});
                  }
                }}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="pb-3">
              <DialogTitle className="text-lg">
                {editingExercise ? t('exerciseBank.editExercise') : t('exerciseBank.addNewExercise')}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {editingExercise
                  ? t('exerciseBank.editDescription')
                  : t('exerciseBank.createDescription')}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={editingExercise ? handleUpdateExercise : handleCreateExercise}
                  className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm">{t('exerciseBank.exerciseName')}</Label>
                  <Input
                    id="name"
                    value={exerciseForm.name}
                    onChange={(e) => {
                      setExerciseForm({...exerciseForm, name: e.target.value});
                      // Clear error when user starts typing
                      if (fieldErrors.name) {
                        setFieldErrors({...fieldErrors, name: false});
                      }
                    }}
                    placeholder={t('exerciseBank.exerciseNamePlaceholder')}
                    className={`h-9 text-sm ${fieldErrors.name ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    required
                  />
                  {fieldErrors.name && (
                    <p className="text-xs text-destructive mt-1">Exercise name is required</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="muscle_group" className="text-sm">{t('exerciseBank.muscleGroup')}</Label>
                  <Select
                    value={exerciseForm.muscle_group}
                    onValueChange={(value) => {
                      setExerciseForm({...exerciseForm, muscle_group: value});
                      // Clear error when user selects a value
                      if (fieldErrors.muscle_group) {
                        setFieldErrors({...fieldErrors, muscle_group: false});
                      }
                    }}
                  >
                    <SelectTrigger
                      id="muscle_group"
                      className={`h-9 text-sm ${fieldErrors.muscle_group ? 'border-destructive focus:ring-destructive' : ''}`}
                    >
                      <SelectValue placeholder={t('exerciseBank.selectMuscleGroup')} />
                    </SelectTrigger>
                    <SelectContent>
                      {muscleGroups.map((group) => (
                        <SelectItem key={group} value={group}>
                          {getMuscleGroupDisplayName(group)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.muscle_group && (
                    <p className="text-xs text-destructive mt-1">Muscle group is required</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-sm">{t('exerciseBank.description')}</Label>
                <Textarea
                  id="description"
                  value={exerciseForm.description}
                  onChange={(e) => setExerciseForm({...exerciseForm, description: e.target.value})}
                  placeholder={t('exerciseBank.descriptionPlaceholder')}
                  rows={2}
                  className="text-sm resize-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="equipment_needed" className="text-sm">{t('exerciseBank.equipmentNeeded')}</Label>
                  <Input
                    id="equipment_needed"
                    value={exerciseForm.equipment_needed}
                    onChange={(e) => setExerciseForm({...exerciseForm, equipment_needed: e.target.value})}
                    placeholder={t('exerciseBank.equipmentPlaceholder')}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor={mediaType === 'video' ? 'video_url' : 'exercise_image'} className="text-sm">
                    {mediaType === 'video' ? t('exerciseBank.videoUrl') : t('exerciseBank.exerciseImageOptional')}
                  </Label>
                  <div className="flex gap-2 items-center">
                    <ToggleGroup
                      type="single"
                      value={mediaType}
                      onValueChange={(value) => {
                        if (value === 'video' || value === 'image') {
                          setMediaType(value);
                          // Clear the other field when switching
                          if (value === 'video') {
                            setImageFile(null);
                            setImagePreview(null);
                            // If switching to video and there was an existing image, mark it as removed
                            if (editingExercise?.image_path) {
                              setImageRemoved(true);
                            }
                          } else {
                            setExerciseForm({...exerciseForm, video_url: ''});
                            setImageRemoved(false); // Reset removal flag when switching to image
                          }
                        }
                      }}
                      className="flex-shrink-0"
                    >
                      <ToggleGroupItem value="video" aria-label="Video URL" size="sm">
                        <Video className="w-4 h-4" />
                      </ToggleGroupItem>
                      <ToggleGroupItem value="image" aria-label="Upload Image" size="sm">
                        <ImageIcon className="w-4 h-4" />
                      </ToggleGroupItem>
                    </ToggleGroup>
                    {mediaType === 'video' ? (
                      <Input
                        id="video_url"
                        type="url"
                        value={exerciseForm.video_url}
                        onChange={(e) => setExerciseForm({...exerciseForm, video_url: e.target.value})}
                        placeholder={t('exerciseBank.videoUrlPlaceholder')}
                        className="flex-1 h-9 text-sm"
                      />
                    ) : (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          id="exercise_image"
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="cursor-pointer flex-1 h-9 text-sm"
                        />
                        {imagePreview && (
                          <div className="relative flex-shrink-0">
                            <img
                              src={imagePreview}
                              alt="Exercise preview"
                              className="w-16 h-16 object-cover rounded-lg border"
                              onError={(e) => {
                                // If image fails to load, hide the preview
                                console.error('Failed to load image preview:', imagePreview);
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setImageFile(null);
                                setImagePreview(null);
                                // Mark that user intentionally removed the image
                                if (editingExercise?.image_path) {
                                  setImageRemoved(true);
                                }
                              }}
                              className="absolute -top-1 -end-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600 text-xs z-10"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category" className="text-sm">{t('exerciseBank.category')}</Label>
                <Input
                  id="category"
                  value={exerciseForm.category}
                  onChange={(e) => setExerciseForm({...exerciseForm, category: e.target.value})}
                  placeholder={t('exerciseBank.categoryPlaceholder')}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="instructions" className="text-sm">{t('exerciseBank.instructions')}</Label>
                <Textarea
                  id="instructions"
                  value={exerciseForm.instructions}
                  onChange={(e) => setExerciseForm({...exerciseForm, instructions: e.target.value})}
                  placeholder={t('exerciseBank.instructionsPlaceholder')}
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCreateDialogOpen(false);
                    setEditingExercise(null);
                    resetForm();
                  }}
                >
                  {t('exerciseBank.cancel')}
                </Button>
                <Button type="submit" size="sm" className="gradient-green">
                  {editingExercise ? t('exerciseBank.updateExercise') : t('exerciseBank.createExercise')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {importReviewData?.rows && (
          <ExerciseImportReviewDialog
            open={importReviewOpen}
            rows={importReviewData.rows}
            message={importReviewData.message}
            onClose={() => {
              setImportReviewOpen(false);
              setImportReviewData(null);
              setImportFile(null);
            }}
            onConfirm={handleImportReviewConfirm}
          />
        )}
      </div>
    </Layout>
  );
};

export default ExerciseBank;