import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  TrendingUp, Weight, Calendar, Edit2, Camera, 
  LineChart, Target, Activity, Plus, Upload, Image, Trash2, X
} from 'lucide-react';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { API_BASE_URL } from '../config/api';
import { useToast } from '../hooks/use-toast';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

interface ProgressEntry {
  id: number;
  client_id: number;
  date: string;
  weight: number;
  photo_path?: string;
  photos?: Array<{
    id: number;
    photo_path: string;
    photo_type: string;
  }>;
  notes?: string;
  chest?: number;
  waist?: number;
  hips?: number;
  thighs?: number;
  arms?: number;
  right_arm?: number;
  left_arm?: number;
  created_at: string;
}

type MeasurementField = 'chest' | 'waist' | 'hips' | 'thighs' | 'arms' | 'right_arm' | 'left_arm';

const MEASUREMENT_FIELD_CONFIG: ReadonlyArray<{ field: MeasurementField; labelKey: string }> = [
  { field: 'chest', labelKey: 'progress.chest' },
  { field: 'waist', labelKey: 'progress.waist' },
  { field: 'hips', labelKey: 'progress.hips' },
  { field: 'thighs', labelKey: 'progress.thighs' },
  { field: 'arms', labelKey: 'progress.arms' },
  { field: 'right_arm', labelKey: 'progress.rightArm' },
  { field: 'left_arm', labelKey: 'progress.leftArm' },
];

function getMeasurementRows(
  entry: ProgressEntry,
  t: TFunction
): Array<{ field: MeasurementField; label: string; value: number }> {
  const rows: Array<{ field: MeasurementField; label: string; value: number }> = [];
  for (const { field, labelKey } of MEASUREMENT_FIELD_CONFIG) {
    const raw = entry[field];
    if (raw == null) continue;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) continue;
    rows.push({ field, label: t(labelKey), value: n });
  }
  return rows;
}

interface ClientWeightProgressProps {
  clientId: string;
  progressEntries: ProgressEntry[];
  onProgressUpdate: () => void;
  isTrainer?: boolean;
}

const ClientWeightProgress: React.FC<ClientWeightProgressProps> = ({
  clientId,
  progressEntries,
  onProgressUpdate,
  isTrainer = false
}) => {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const [editingEntry, setEditingEntry] = useState<ProgressEntry | null>(null);
  const [editForm, setEditForm] = useState({
    weight: '',
    notes: ''
  });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({
    weight: '',
    notes: '',
    chest: '',
    waist: '',
    hips: '',
    thighs: '',
    right_arm: '',
    left_arm: ''
  });
  // Multiple photos support
  const [photoFiles, setPhotoFiles] = useState<{
    front: File | null;
    side: File | null;
    back: File | null;
  }>({
    front: null,
    side: null,
    back: null
  });
  const [photoPreviews, setPhotoPreviews] = useState<{
    front: string | null;
    side: string | null;
    back: string | null;
  }>({
    front: null,
    side: null,
    back: null
  });
  const [uploading, setUploading] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<ProgressEntry | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [deletingEntry, setDeletingEntry] = useState<ProgressEntry | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Load photos when viewing dialog opens
  useEffect(() => {
    if (viewingPhoto) {
      if (viewingPhoto.photos && viewingPhoto.photos.length > 0) {
        viewingPhoto.photos.forEach(photo => {
          if (!photoUrls[photo.photo_type]) {
            loadPhotoWithAuth(photo.photo_path, photo.photo_type);
          }
        });
      } else if (viewingPhoto.photo_path) {
        // Legacy: single photo_path
        if (!photoUrls['front'] && !photoUrls['single']) {
          loadPhotoWithAuth(viewingPhoto.photo_path, 'front');
        }
      }
    }
  }, [viewingPhoto]);

  // Sort entries by date (newest first for list)
  const sortedEntries = [...progressEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Chart data: chronological order for graph, with locale-aware date label
  const chartData = [...progressEntries]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(entry => ({
      date: new Date(entry.date).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' }),
      weight: entry.weight,
      fullDate: entry.date,
    }));

  // Calculate statistics
  const latestEntry = sortedEntries[0];
  const previousEntry = sortedEntries[1];
  const weightChange = latestEntry?.weight && previousEntry?.weight 
    ? latestEntry.weight - previousEntry.weight 
    : 0;

  const startEdit = (entry: ProgressEntry) => {
    if (!isTrainer) return; // Only trainers can edit
    
    setEditingEntry(entry);
    setEditForm({
      weight: entry.weight.toString(),
      notes: entry.notes || ''
    });
  };

  const handleDeleteClick = (entry: ProgressEntry) => {
    setDeletingEntry(entry);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingEntry) return;

    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/progress/weight/${deletingEntry.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok || response.status === 204) {
        toast({
          title: "Success",
          description: t('weightProgress.successDelete')
        });
        setShowDeleteDialog(false);
        setDeletingEntry(null);
        onProgressUpdate();
      } else {
        const error = await response.json().catch(() => ({ detail: t('weightProgress.errorDelete') }));
        toast({
          title: "Error",
          description: error.detail || t('weightProgress.errorDelete'),
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error deleting entry:', error);
      toast({
        title: "Error",
        description: t('weightProgress.errorDelete'),
        variant: "destructive"
      });
    }
  };

  const loadPhotoWithAuth = async (photoPath: string, photoType?: string) => {
    try {
      const token = localStorage.getItem('access_token');
      const filename = photoPath.split('/').pop();
      const response = await fetch(`${API_BASE_URL}/files/media/progress_photos/${filename}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        if (photoType) {
          setPhotoUrls(prev => ({ ...prev, [photoType]: url }));
        } else {
          // Legacy single photo
          setPhotoUrls(prev => ({ ...prev, 'single': url }));
        }
      }
    } catch (error) {
      console.error('Error loading photo:', error);
    }
  };

  const handlePhotoChange = (type: 'front' | 'side' | 'back', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFiles(prev => ({ ...prev, [type]: file }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreviews(prev => ({ ...prev, [type]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = (type: 'front' | 'side' | 'back') => {
    setPhotoFiles(prev => ({ ...prev, [type]: null }));
    setPhotoPreviews(prev => ({ ...prev, [type]: null }));
  };

  const handleViewPhoto = (entry: ProgressEntry) => {
    setViewingPhoto(entry);
    // Load all photos for this entry
    if (entry.photos && entry.photos.length > 0) {
      entry.photos.forEach(photo => {
        if (!photoUrls[photo.photo_type]) {
          loadPhotoWithAuth(photo.photo_path, photo.photo_type);
        }
      });
    } else if (entry.photo_path) {
      // Legacy: single photo_path
      loadPhotoWithAuth(entry.photo_path, 'front');
    }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.weight) {
      toast({
        title: "Error",
        description: t('weightProgress.weightRequired'),
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    try {
      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      
      formData.append('weight', addForm.weight);
      formData.append('date', new Date().toISOString());
      if (addForm.notes) {
        formData.append('notes', addForm.notes);
      }
      // Add measurements
      if (addForm.chest) {
        formData.append('chest', addForm.chest);
      }
      if (addForm.waist) {
        formData.append('waist', addForm.waist);
      }
      if (addForm.hips) {
        formData.append('hips', addForm.hips);
      }
      if (addForm.thighs) {
        formData.append('thighs', addForm.thighs);
      }
      if (addForm.right_arm) {
        formData.append('right_arm', addForm.right_arm);
      }
      if (addForm.left_arm) {
        formData.append('left_arm', addForm.left_arm);
      }
      // Add multiple photos
      if (photoFiles.front) {
        formData.append('photo_front', photoFiles.front);
      }
      if (photoFiles.side) {
        formData.append('photo_side', photoFiles.side);
      }
      if (photoFiles.back) {
        formData.append('photo_back', photoFiles.back);
      }
      // If this is a trainer adding an entry for a client, include client_id
      if (isTrainer && clientId) {
        formData.append('client_id', clientId);
      }

      const response = await fetch(`${API_BASE_URL}/progress/weight`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: t('weightProgress.successAdd')
        });
        // Reset form
        setAddForm({ weight: '', notes: '', chest: '', waist: '', hips: '', thighs: '', right_arm: '', left_arm: '' });
        setPhotoFiles({ front: null, side: null, back: null });
        setPhotoPreviews({ front: null, side: null, back: null });
        // Close dialog after reset
        setShowAddDialog(false);
        // Update progress data
        onProgressUpdate();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.detail || t('weightProgress.errorAdd'),
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error adding weight entry:', error);
      toast({
        title: "Error",
        description: t('weightProgress.errorAdd'),
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    try {
      const token = localStorage.getItem('access_token');
      // Create FormData for the PUT request
      const formData = new FormData();
      if (editForm.weight) {
        formData.append('weight', editForm.weight);
      }
      if (editForm.notes) {
        formData.append('notes', editForm.notes);
      }

      const response = await fetch(`${API_BASE_URL}/progress/entries/${editingEntry.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: t('weightProgress.successUpdate')
        });
        setEditingEntry(null);
        onProgressUpdate();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.detail || t('weightProgress.errorUpdate'),
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error updating entry:', error);
      toast({
        title: "Error",
        description: t('weightProgress.errorUpdate'),
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center px-4 pb-4 pt-6 min-w-0">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-12 h-12 shrink-0 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <Weight className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-muted-foreground">{t('weightProgress.currentWeight')}</p>
                <p className="text-xl sm:text-2xl font-bold text-foreground truncate" title={latestEntry?.weight ? `${latestEntry.weight} ${t('weightProgress.kg')}` : t('weightProgress.na')}>
                  {latestEntry?.weight ? `${latestEntry.weight} ${t('weightProgress.kg')}` : t('weightProgress.na')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center px-4 pb-4 pt-6 min-w-0">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-12 h-12 shrink-0 bg-gradient-to-r from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-muted-foreground">{t('weightProgress.weightChange')}</p>
                <p className="text-xl sm:text-2xl font-bold text-foreground truncate" title={`${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} ${t('weightProgress.kg')}`}>
                  {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} {t('weightProgress.kg')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center px-4 pb-4 pt-6 min-w-0">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-12 h-12 shrink-0 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-muted-foreground">{t('weightProgress.totalEntries')}</p>
                <p className="text-xl sm:text-2xl font-bold text-foreground">
                  {sortedEntries.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weight Progress Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <LineChart className="w-5 h-5 me-2" />
            {t('weightProgress.weightProgressChart')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height={256}>
                <RechartsLineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    tickFormatter={(v) => `${v} ${t('weightProgress.kg')}`}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value} ${t('weightProgress.kg')}`, t('weightProgress.weight')]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate ? new Date(payload[0].payload.fullDate).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', { dateStyle: 'medium' }) : ''}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                  />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 bg-secondary/20 rounded-lg flex items-center justify-center">
              <p className="text-muted-foreground text-center">{t('weightProgress.chartVisualization')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress Entries */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>{t('weightProgress.progressHistory')}</CardTitle>
          <Button 
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('weightProgress.addEntry')}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sortedEntries.map((entry) => {
              const measurementRows = getMeasurementRows(entry, t);
              return (
              <div key={entry.id} className="flex items-start justify-between gap-4 p-4 rounded-lg border hover:bg-secondary/50 transition-colors">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-primary to-primary/80">
                    <Calendar className="size-5 shrink-0 text-white" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">
                      {new Date(entry.date).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{t('weightProgress.weight')}: {entry.weight} {t('weightProgress.kg')}</span>
                    </div>
                    {measurementRows.length > 0 && (
                        <div
                          className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground"
                          aria-label={t('progress.measurements')}
                        >
                          {measurementRows.map((row) => (
                            <span key={row.field} className="break-words">
                              {row.label}:{' '}
                              <span className="tabular-nums font-medium text-foreground/90">
                                {row.value}
                              </span>{' '}
                              {t('progress.cm')}
                            </span>
                          ))}
                        </div>
                    )}
                    {entry.notes && (
                      <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>
                    )}
                    {(entry.photos && entry.photos.length > 0) || entry.photo_path ? (
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewPhoto(entry)}
                          className="flex items-center gap-1"
                        >
                          <Image className="w-3 h-3" />
                          {t('weightProgress.viewPhoto', 'View Photos')}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-start gap-2 pt-0.5">
                  {((entry.photos && entry.photos.length > 0) || entry.photo_path) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleViewPhoto(entry)}
                      title={t('weightProgress.viewPhoto', 'View Photos')}
                    >
                      <Image className="w-4 h-4" />
                    </Button>
                  )}
                  {isTrainer && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(entry)}
                        title={t('weightProgress.editEntry')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteClick(entry)}
                        title={t('weightProgress.deleteEntry')}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Add Weight Entry Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('weightProgress.addEntry')}</DialogTitle>
            <DialogDescription>
              {t('weightProgress.addDescription')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddEntry} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-weight">{t('weightProgress.weightKg')}</Label>
              <Input
                id="add-weight"
                type="number"
                step="0.1"
                value={addForm.weight}
                onChange={(e) => setAddForm({...addForm, weight: e.target.value})}
                placeholder={t('weightProgress.enterWeight')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-notes">{t('weightProgress.notes', 'Notes (Optional)')}</Label>
              <Textarea
                id="add-notes"
                value={addForm.notes}
                onChange={(e) => setAddForm({...addForm, notes: e.target.value})}
                placeholder={t('weightProgress.addNotes', 'Add notes...')}
                rows={3}
              />
            </div>

            {/* Body Measurements */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('progress.measurements', 'Measurements')}</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="chest" className="text-xs text-muted-foreground">{t('progress.chest', 'Chest')}</Label>
                  <Input
                    id="chest"
                    type="number"
                    step="0.1"
                    placeholder={t('progress.cm', 'cm')}
                    value={addForm.chest}
                    onChange={(e) => setAddForm({...addForm, chest: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="waist" className="text-xs text-muted-foreground">{t('progress.waist', 'Waist')}</Label>
                  <Input
                    id="waist"
                    type="number"
                    step="0.1"
                    placeholder={t('progress.cm', 'cm')}
                    value={addForm.waist}
                    onChange={(e) => setAddForm({...addForm, waist: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="hips" className="text-xs text-muted-foreground">{t('progress.hips', 'Hips')}</Label>
                  <Input
                    id="hips"
                    type="number"
                    step="0.1"
                    placeholder={t('progress.cm', 'cm')}
                    value={addForm.hips}
                    onChange={(e) => setAddForm({...addForm, hips: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="thighs" className="text-xs text-muted-foreground">{t('progress.thighs', 'Thighs')}</Label>
                  <Input
                    id="thighs"
                    type="number"
                    step="0.1"
                    placeholder={t('progress.cm', 'cm')}
                    value={addForm.thighs}
                    onChange={(e) => setAddForm({...addForm, thighs: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="right_arm" className="text-xs text-muted-foreground">{t('progress.rightArm', 'Right Arm')}</Label>
                  <Input
                    id="right_arm"
                    type="number"
                    step="0.1"
                    placeholder={t('progress.cm', 'cm')}
                    value={addForm.right_arm}
                    onChange={(e) => setAddForm({...addForm, right_arm: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="left_arm" className="text-xs text-muted-foreground">{t('progress.leftArm', 'Left Arm')}</Label>
                  <Input
                    id="left_arm"
                    type="number"
                    step="0.1"
                    placeholder={t('progress.cm', 'cm')}
                    value={addForm.left_arm}
                    onChange={(e) => setAddForm({...addForm, left_arm: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Progress Photos */}
            <div>
              <Label>{t('progress.progressPhotoOptional', 'Progress Photo (Optional)')}</Label>
              <p className="text-xs text-muted-foreground mb-2">{t('progress.uploadHint', 'Upload front, side, and back photos')}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                {/* Front Photo */}
                <div>
                  <Label htmlFor="photo-front" className="text-xs mb-1 block">{t('progress.frontPhoto', 'Front')}</Label>
                  {photoPreviews.front ? (
                    <div className="relative">
                      <img 
                        src={photoPreviews.front} 
                        alt={t('progress.frontPhoto')}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-1 right-1"
                        onClick={() => removePhoto('front')}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <label htmlFor="photo-front" className="cursor-pointer">
                      <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:bg-accent transition-colors h-32 flex flex-col items-center justify-center">
                        <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                        <p className="text-xs text-muted-foreground">{t('progress.addPhoto', 'Add')}</p>
                      </div>
                    </label>
                  )}
                  <input
                    id="photo-front"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoChange('front', e)}
                  />
                </div>

                {/* Side Photo */}
                <div>
                  <Label htmlFor="photo-side" className="text-xs mb-1 block">{t('progress.sidePhoto', 'Side')}</Label>
                  {photoPreviews.side ? (
                    <div className="relative">
                      <img 
                        src={photoPreviews.side} 
                        alt={t('progress.sidePhoto')}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-1 right-1"
                        onClick={() => removePhoto('side')}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <label htmlFor="photo-side" className="cursor-pointer">
                      <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:bg-accent transition-colors h-32 flex flex-col items-center justify-center">
                        <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                        <p className="text-xs text-muted-foreground">{t('progress.addPhoto', 'Add')}</p>
                      </div>
                    </label>
                  )}
                  <input
                    id="photo-side"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoChange('side', e)}
                  />
                </div>

                {/* Back Photo */}
                <div>
                  <Label htmlFor="photo-back" className="text-xs mb-1 block">{t('progress.backPhoto', 'Back')}</Label>
                  {photoPreviews.back ? (
                    <div className="relative">
                      <img 
                        src={photoPreviews.back} 
                        alt={t('progress.backPhoto')}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-1 right-1"
                        onClick={() => removePhoto('back')}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <label htmlFor="photo-back" className="cursor-pointer">
                      <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:bg-accent transition-colors h-32 flex flex-col items-center justify-center">
                        <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                        <p className="text-xs text-muted-foreground">{t('progress.addPhoto', 'Add')}</p>
                      </div>
                    </label>
                  )}
                  <input
                    id="photo-back"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoChange('back', e)}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false);
                  setAddForm({ weight: '', notes: '', chest: '', waist: '', hips: '', thighs: '', right_arm: '', left_arm: '' });
                  setPhotoFiles({ front: null, side: null, back: null });
                  setPhotoPreviews({ front: null, side: null, back: null });
                }}
              >
                {t('weightProgress.cancel')}
              </Button>
              <Button type="submit" disabled={uploading}>
                {uploading ? t('weightProgress.uploading') : t('weightProgress.addEntry')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog for Trainers */}
      {isTrainer && (
        <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('weightProgress.editEntry')}</DialogTitle>
              <DialogDescription>
                {t('weightProgress.editDescription')}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateEntry} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="weight">{t('weightProgress.weightKg')}</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.1"
                  value={editForm.weight}
                  onChange={(e) => setEditForm({...editForm, weight: e.target.value})}
                  placeholder={t('weightProgress.enterWeight')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">{t('weightProgress.notes')}</Label>
                <Input
                  id="notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                  placeholder={t('weightProgress.addNotes')}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingEntry(null)}
                >
                  {t('weightProgress.cancel')}
                </Button>
                <Button type="submit">
                  {t('weightProgress.updateEntry')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Photo Viewing Dialog */}
      <Dialog open={!!viewingPhoto} onOpenChange={(open) => {
        if (!open) {
          setViewingPhoto(null);
          // Clean up photo URLs
          Object.values(photoUrls).forEach(url => {
            if (url) URL.revokeObjectURL(url);
          });
          setPhotoUrls({});
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('weightProgress.viewPhoto', 'View Progress Photos')}</DialogTitle>
            <DialogDescription>
              {viewingPhoto && `${t('weightProgress.weight')}: ${viewingPhoto.weight} ${t('weightProgress.kg')} - ${new Date(viewingPhoto.date).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US')}`}
            </DialogDescription>
          </DialogHeader>
          {viewingPhoto && (() => {
            const viewingMeasurements = getMeasurementRows(viewingPhoto, t);
            return (
            <div className="space-y-4">
              {viewingMeasurements.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-sm font-medium text-foreground mb-2">{t('progress.measurements')}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                    {viewingMeasurements.map((row) => (
                      <div key={row.field} className="min-w-0">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="ms-1 tabular-nums font-medium text-foreground">
                          {row.value} {t('progress.cm')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Display all photos */}
              {viewingPhoto.photos && viewingPhoto.photos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {['front', 'side', 'back'].map((type) => {
                    const photo = viewingPhoto.photos?.find(p => p.photo_type === type);
                    const photoUrl = photo ? photoUrls[type] : null;
                    return (
                      <div key={type} className="space-y-2">
                        <Label className="text-sm font-medium capitalize">{t(`progress.${type}Photo`, type)}</Label>
                        {photoUrl ? (
                          <img 
                            src={photoUrl}
                            alt={t(`progress.${type}Photo`, type)}
                            className="w-full h-auto max-h-[50vh] object-contain rounded-lg border"
                          />
                        ) : photo ? (
                          <div className="w-full h-48 bg-secondary/20 rounded-lg flex items-center justify-center">
                            <p className="text-muted-foreground text-sm">{t('progress.loading', 'Loading...')}</p>
                          </div>
                        ) : (
                          <div className="w-full h-48 bg-secondary/20 rounded-lg flex items-center justify-center">
                            <p className="text-muted-foreground text-sm">{t('progress.noPhoto', 'No photo')}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : viewingPhoto.photo_path ? (
                // Legacy: single photo_path
                <div className="relative">
                  {photoUrls['front'] || photoUrls['single'] ? (
                    <img 
                      src={photoUrls['front'] || photoUrls['single']}
                      alt={t('weightProgress.progressPhoto')}
                      className="w-full h-auto max-h-[70vh] object-contain rounded-lg border"
                    />
                  ) : (
                    <div className="w-full h-64 bg-secondary/20 rounded-lg flex items-center justify-center">
                      <p className="text-muted-foreground">{t('weightProgress.photoNotFound', 'Photo not found')}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-64 bg-secondary/20 rounded-lg flex items-center justify-center">
                  <p className="text-muted-foreground">{t('weightProgress.noPhotos', 'No photos available')}</p>
                </div>
              )}
              {viewingPhoto.notes && (
                <div className="p-3 bg-secondary/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>{t('weightProgress.notes')}:</strong> {viewingPhoto.notes}
                  </p>
                </div>
              )}
            </div>
            );
          })()}
          </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && deletingEntry && (
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('weightProgress.deleteEntry')}</DialogTitle>
              <DialogDescription>
                {t('weightProgress.deleteConfirm', { 
                  date: new Date(deletingEntry.date).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US'),
                  weight: deletingEntry.weight
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeletingEntry(null);
                }}
              >
                {t('weightProgress.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
              >
                {t('weightProgress.delete')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ClientWeightProgress;