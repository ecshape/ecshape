import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Scale, Camera, TrendingDown, TrendingUp, Plus, Calendar, Upload, X, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

import { API_BASE_URL } from '../config/api';

interface ProgressEntry {
  id: number;
  client_id: number;
  date: string;
  weight: number;
  body_fat_percentage?: number;
  muscle_mass?: number;
  notes: string;
  photo_path: string;
  photos?: Array<{
    id: number;
    photo_path: string;
    photo_type: string;
  }>;
  chest?: number;
  waist?: number;
  hips?: number;
  thighs?: number;
  arms?: number;
  right_arm?: number;
  left_arm?: number;
  created_at: string;
}

const ProgressTrackingV2 = () => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [progressData, setProgressData] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form state
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newChest, setNewChest] = useState('');
  const [newWaist, setNewWaist] = useState('');
  const [newHips, setNewHips] = useState('');
  const [newThighs, setNewThighs] = useState('');
  const [newArms, setNewArms] = useState('');
  const [newRightArm, setNewRightArm] = useState('');
  const [newLeftArm, setNewLeftArm] = useState('');
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
  const [viewingPhoto, setViewingPhoto] = useState<ProgressEntry | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // State for photo URLs in grid view - store by entry ID and photo type
  const [photoUrls, setPhotoUrls] = useState<Record<number, Record<string, string>>>({});

  useEffect(() => {
    if (user?.id) {
      fetchProgressData();
    }
  }, [user]);

  // Load photos for grid when progress data changes
  useEffect(() => {
    photosWithData.forEach(entry => {
      // Load all photos for this entry (front, side, back)
      if (entry.photos && entry.photos.length > 0) {
        entry.photos.forEach(photo => {
          if (!photoUrls[entry.id]?.[photo.photo_type]) {
            loadPhotoForGrid(entry.id, photo.photo_path, photo.photo_type);
          }
        });
      } else if (entry.photo_path && !photoUrls[entry.id]?.['front']) {
        // Legacy: single photo_path, treat as front
        loadPhotoForGrid(entry.id, entry.photo_path, 'front');
      }
    });
  }, [progressData]);

  const fetchProgressData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/progress/?client_id=${user?.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProgressData(data.sort((a: ProgressEntry, b: ProgressEntry) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        ));
      }
    } catch (error) {
      console.error('Failed to fetch progress data:', error);
      setError(t('progress.loadError'));
    } finally {
      setLoading(false);
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

  const loadPhotoWithAuth = async (photoPath: string) => {
    try {
      const token = localStorage.getItem('access_token');
      // Extract just the filename from the full path
      const filename = photoPath.split('/').pop();
      const response = await fetch(`${API_BASE_URL}/files/media/progress_photos/${filename}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPhotoUrl(url);
      } else {
        console.error('Failed to load photo:', response.status);
        setPhotoUrl(null);
      }
    } catch (error) {
      console.error('Error loading photo:', error);
      setPhotoUrl(null);
    }
  };

  // Load photo for grid display
  const loadPhotoForGrid = async (entryId: number, photoPath: string, photoType: string) => {
    if (!photoPath || photoUrls[entryId]?.[photoType]) return;
    
    try {
      const token = localStorage.getItem('access_token');
      const filename = photoPath.split('/').pop();
      const response = await fetch(`${API_BASE_URL}/files/media/progress_photos/${filename}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPhotoUrls(prev => ({
          ...prev,
          [entryId]: {
            ...(prev[entryId] || {}),
            [photoType]: url
          }
        }));
      }
    } catch (error) {
      console.error('Failed to load photo for grid:', error);
    }
  };

  const handleViewPhoto = (entry: ProgressEntry) => {
    setViewingPhoto(entry);
    if (entry.photo_path) {
      loadPhotoWithAuth(entry.photo_path);
    }
  };

  const handleDeleteEntry = async (entry: ProgressEntry) => {
    if (!confirm(t('progress.confirmDelete', 'Are you sure you want to delete this entry?'))) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/progress/weight/${entry.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok || response.status === 204) {
        // Remove from local state
        setProgressData(progressData.filter(e => e.id !== entry.id));
        // Clear photo URLs if needed
        if (photoUrls[entry.id]) {
          URL.revokeObjectURL(photoUrls[entry.id]);
          const newPhotoUrls = { ...photoUrls };
          delete newPhotoUrls[entry.id];
          setPhotoUrls(newPhotoUrls);
        }
      } else {
        const errorData = await response.json().catch(() => ({ detail: t('progress.deleteError', 'Failed to delete entry') }));
        setError(errorData.detail || t('progress.deleteError', 'Failed to delete entry'));
      }
    } catch (error) {
      console.error('Error deleting entry:', error);
      setError(t('progress.deleteError', 'Failed to delete entry'));
    }
  };

  const addEntry = async () => {
    if (!newWeight) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      formData.append('weight', newWeight);
      formData.append('date', new Date().toISOString());
      
      if (newNotes) {
        formData.append('notes', newNotes);
      }
      if (newChest) {
        formData.append('chest', newChest);
      }
      if (newWaist) {
        formData.append('waist', newWaist);
      }
      if (newHips) {
        formData.append('hips', newHips);
      }
      if (newThighs) {
        formData.append('thighs', newThighs);
      }
      if (newArms) {
        formData.append('arms', newArms);
      }
      if (newRightArm) {
        formData.append('right_arm', newRightArm);
      }
      if (newLeftArm) {
        formData.append('left_arm', newLeftArm);
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

      const response = await fetch(`${API_BASE_URL}/progress/weight`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const newEntry = await response.json();
        setProgressData([...progressData, newEntry].sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        ));
        
        // Reset form first
        setNewWeight('');
        setNewNotes('');
        setNewChest('');
        setNewWaist('');
        setNewHips('');
        setNewThighs('');
        setNewArms('');
        setNewRightArm('');
        setNewLeftArm('');
        setPhotoFiles({ front: null, side: null, back: null });
        setPhotoPreviews({ front: null, side: null, back: null });
        // Close dialog after reset
        setIsAddingEntry(false);
        // Clear any errors
        setError('');
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to add entry' }));
        setError(errorData.detail || 'Failed to add entry');
      }
    } catch (error) {
      console.error('Failed to add entry:', error);
      setError('Failed to add entry');
    }
  };

  const currentWeight = progressData[progressData.length - 1]?.weight || 0;
  const startWeight = progressData[0]?.weight || 0;
  const weightChange = currentWeight - startWeight;
  const weightChangePercentage = startWeight > 0 ? ((weightChange / startWeight) * 100).toFixed(1) : '0.0';

  // Prepare chart data
  const chartData = progressData.map(entry => ({
    date: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: entry.weight,
    fullDate: entry.date,
  }));

  // Photos with progress data
  const photosWithData = progressData.filter(entry => entry.photo_path);

  if (loading) {
    return (
      <div className="pb-20 lg:pb-8">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">{t('progress.loading')}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-gradient-to-br from-card to-secondary px-4 lg:px-6 py-6 lg:py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gradient">{t('progress.title')}</h1>
              <p className="text-muted-foreground mt-1">{t('progress.subtitle')}</p>
            </div>
            <Dialog open={isAddingEntry} onOpenChange={setIsAddingEntry}>
              <DialogTrigger asChild>
                <Button className="gradient-blue text-background">
                  <Plus className="w-4 h-4 mr-2" />
                  {t('progress.addEntry')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{t('progress.addProgressEntry')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="weight">{t('progress.weightKgRequired')}</Label>
                    <Input
                      id="weight"
                      type="number"
                      step="0.1"
                      placeholder={t('progress.weightPlaceholder')}
                      value={newWeight}
                      onChange={(e) => setNewWeight(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="notes">{t('progress.notesOptional')}</Label>
                    <Textarea
                      id="notes"
                      placeholder={t('progress.notesPlaceholder')}
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                  
                  {/* Body Measurements */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('progress.measurements')}</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="chest" className="text-xs text-muted-foreground">{t('progress.chest', 'Chest')}</Label>
                        <Input
                          id="chest"
                          type="number"
                          step="0.1"
                          placeholder={t('progress.cm')}
                          value={newChest}
                          onChange={(e) => setNewChest(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="waist" className="text-xs text-muted-foreground">{t('progress.waist', 'Waist')}</Label>
                        <Input
                          id="waist"
                          type="number"
                          step="0.1"
                          placeholder={t('progress.cm')}
                          value={newWaist}
                          onChange={(e) => setNewWaist(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="hips" className="text-xs text-muted-foreground">{t('progress.hips', 'Hips')}</Label>
                        <Input
                          id="hips"
                          type="number"
                          step="0.1"
                          placeholder={t('progress.cm')}
                          value={newHips}
                          onChange={(e) => setNewHips(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="thighs" className="text-xs text-muted-foreground">{t('progress.thighs', 'Thighs')}</Label>
                        <Input
                          id="thighs"
                          type="number"
                          step="0.1"
                          placeholder={t('progress.cm')}
                          value={newThighs}
                          onChange={(e) => setNewThighs(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="right_arm" className="text-xs text-muted-foreground">{t('progress.rightArm', 'Right Arm')}</Label>
                        <Input
                          id="right_arm"
                          type="number"
                          step="0.1"
                          placeholder={t('progress.cm')}
                          value={newRightArm}
                          onChange={(e) => setNewRightArm(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="left_arm" className="text-xs text-muted-foreground">{t('progress.leftArm', 'Left Arm')}</Label>
                        <Input
                          id="left_arm"
                          type="number"
                          step="0.1"
                          placeholder={t('progress.cm')}
                          value={newLeftArm}
                          onChange={(e) => setNewLeftArm(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <Label>{t('progress.progressPhotoOptional')}</Label>
                    <p className="text-xs text-muted-foreground mb-2">{t('progress.uploadHint')}</p>
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
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setIsAddingEntry(false)}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      className="flex-1 gradient-green text-background"
                      onClick={addEntry}
                      disabled={!newWeight}
                    >
                      {t('progress.addEntry')}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-blue-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('progress.currentWeight')}</p>
                  <p className="text-3xl font-bold text-foreground">{currentWeight || '-'} {t('progress.kg')}</p>
                </div>
                <Scale className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className={`bg-gradient-to-br ${weightChange < 0 ? 'from-green-500/10 to-green-600/10 border-green-500/20' : 'from-red-500/10 to-red-600/10 border-red-500/20'}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('progress.totalChange')}</p>
                  <div className="flex items-center space-x-2">
                    <p className={`text-3xl font-bold ${weightChange < 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} {t('progress.kg')}
                    </p>
                    {weightChange < 0 ? (
                      <TrendingDown className="w-6 h-6 text-green-500" />
                    ) : (
                      <TrendingUp className="w-6 h-6 text-red-500" />
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/10 border-purple-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('progress.progress')}</p>
                  <p className={`text-3xl font-bold ${weightChange < 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {weightChangePercentage}%
                  </p>
                </div>
                <Calendar className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="chart" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="chart">{t('progress.weightChart')}</TabsTrigger>
            <TabsTrigger value="photos">{t('progress.progressPhotos')}</TabsTrigger>
          </TabsList>

          <TabsContent value="chart" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('progress.weightProgress')}</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        label={{ value: t('progress.date'), position: 'insideBottom', offset: -5 }}
                      />
                      <YAxis 
                        label={{ value: `${t('progress.weight')} (${t('progress.kg')})`, angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="weight" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-12">{t('progress.noWeightData')}</p>
                )}
              </CardContent>
            </Card>

            {/* Weight History */}
            <Card>
              <CardHeader>
                <CardTitle>{t('progress.weightHistory')}</CardTitle>
              </CardHeader>
              <CardContent>
                {progressData.length > 0 ? (
                  <div className="space-y-3">
                    {progressData.slice().reverse().map((entry) => (
                      <div key={entry.id} className="flex items-start justify-between gap-3 p-3 bg-muted rounded-lg">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15">
                            <Calendar className="size-4 shrink-0 text-primary" aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{entry.weight} kg</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(entry.date).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', { 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
                              })}
                            </p>
                            {entry.notes && (
                              <p className="text-sm text-muted-foreground italic mt-1">{entry.notes}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
                          {entry.photo_path && (
                            <button
                              onClick={() => handleViewPhoto(entry)}
                              className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-border bg-transparent hover:bg-primary/10 cursor-pointer"
                            >
                              <Camera className="w-3 h-3 mr-1" />
                              {t('progress.photo')}
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteEntry(entry)}
                            className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-destructive/50 bg-transparent hover:bg-destructive/10 text-destructive cursor-pointer"
                            title={t('common.delete', 'Delete')}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    {t('progress.noEntriesYet')}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="photos" className="space-y-4">
            <Card>
                    <CardHeader>
                <CardTitle className="flex items-center">
                  <Camera className="w-5 h-5 mr-2" />
                  {t('progress.progressPhotos')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {photosWithData.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {photosWithData.map((entry) => {
                      const entryPhotos = entry.photos || (entry.photo_path ? [{ photo_path: entry.photo_path, photo_type: 'front' }] : []);
                      const hasPhotos = entryPhotos.length > 0;
                      
                      return (
                        <Card 
                          key={entry.id} 
                          className="overflow-hidden hover:shadow-lg transition-shadow"
                        >
                          {hasPhotos ? (
                            <div className="grid grid-cols-3 gap-1">
                              {['front', 'side', 'back'].map((type) => {
                                const photo = entryPhotos.find(p => p.photo_type === type);
                                const photoUrl = photo ? photoUrls[entry.id]?.[type] : null;
                                
                                return (
                                  <div
                                    key={type}
                                    className="relative aspect-square cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => {
                                      if (photo) {
                                        setViewingPhoto(entry);
                                        loadPhotoWithAuth(photo.photo_path);
                                      }
                                    }}
                                  >
                                    {photoUrl ? (
                                      <img 
                                        src={photoUrl}
                                        alt={`${type} view - ${entry.date}`}
                                        className="w-full h-full object-cover"
                                        style={{ transform: 'rotate(0deg)' }}
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                        }}
                                      />
                                    ) : photo ? (
                                      <div className="w-full h-full bg-muted flex items-center justify-center">
                                        <Camera className="w-4 h-4 text-muted-foreground" />
                                      </div>
                                    ) : (
                                      <div className="w-full h-full bg-muted/50 flex items-center justify-center border border-dashed border-muted-foreground/30">
                                        <span className="text-xs text-muted-foreground">{type}</span>
                                      </div>
                                    )}
                                    {photo && (
                                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 text-center">
                                        {type === 'front' ? (i18n.language === 'he' ? 'קדמי' : 'Front') :
                                         type === 'side' ? (i18n.language === 'he' ? 'צד' : 'Side') :
                                         (i18n.language === 'he' ? 'אחורי' : 'Back')}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="w-full h-48 bg-muted flex items-center justify-center">
                              <div className="text-center text-muted-foreground">
                                <Camera className="w-8 h-8 mx-auto mb-2" />
                                <p className="text-sm">{t('progress.photoNotAvailable')}</p>
                              </div>
                            </div>
                          )}
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-bold text-lg">{entry.weight} {t('progress.kg')}</p>
                              <Badge variant="outline">
                                {new Date(entry.date).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' })}
                              </Badge>
                            </div>
                            {entry.notes && (
                              <p className="text-sm text-muted-foreground">{entry.notes}</p>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-lg font-medium">{t('progress.noPhotosTitle')}</p>
                    <p className="text-sm text-muted-foreground mt-2">{t('progress.noPhotosSubtitle')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {error && (
          <Card className="bg-destructive/10 border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive text-center">{error}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Photo Viewing Dialog */}
      <Dialog open={!!viewingPhoto} onOpenChange={(open) => {
        if (!open) {
          setViewingPhoto(null);
          if (photoUrl) {
            URL.revokeObjectURL(photoUrl);
            setPhotoUrl(null);
          }
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('progress.viewPhoto', 'View Progress Photo')}</DialogTitle>
          </DialogHeader>
          {viewingPhoto && (
            <div className="space-y-4">
              <div className="relative">
                {photoUrl ? (
                  <img 
                    src={photoUrl}
                    alt={t('progress.progressPhoto', 'Progress photo')}
                    className="w-full h-auto max-h-[70vh] object-contain rounded-lg border"
                  />
                ) : (
                  <div className="w-full h-64 bg-secondary/20 rounded-lg flex items-center justify-center">
                    <p className="text-muted-foreground">{t('progress.photoNotFound', 'Photo not found')}</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-semibold">{viewingPhoto.weight} {t('progress.kg')}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(viewingPhoto.date).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                  </div>
                </div>
                {viewingPhoto.notes && (
                  <div className="p-3 bg-secondary/20 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong>{t('progress.notes')}:</strong> {viewingPhoto.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProgressTrackingV2;

