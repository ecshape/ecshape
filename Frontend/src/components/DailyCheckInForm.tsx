import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { YesNoSkipButtons } from './YesNoSkipButtons';
import { RatingScale } from './RatingScale';
import { API_BASE_URL } from '@/config/api';
import { useToast } from '@/hooks/use-toast';

interface DailyCheckInFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialDate?: Date;
}

export const DailyCheckInForm: React.FC<DailyCheckInFormProps> = ({
  open,
  onOpenChange,
  onSuccess,
  initialDate
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const isRtl = i18n.language === 'he';
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    date: initialDate ? initialDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    weight: '',
    steps: '',
    walked_10000_steps: null as boolean | null,
    sun_exposure_10min: null as boolean | null,
    hunger_level: null as number | null,
    sleep_hours: null as number | null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('access_token');
      
      const payload: any = {
        date: new Date(formData.date).toISOString(),
      };

      // הוספת שדות רק אם הם מולאו
      if (formData.weight) {
        payload.weight = parseFloat(formData.weight);
      }
      if (formData.steps) {
        payload.steps = parseInt(formData.steps);
      }
      if (formData.walked_10000_steps !== null) {
        payload.walked_10000_steps = formData.walked_10000_steps;
      }
      if (formData.sun_exposure_10min !== null) {
        payload.sun_exposure_10min = formData.sun_exposure_10min;
      }
      if (formData.hunger_level !== null) {
        payload.hunger_level = formData.hunger_level;
      }
      if (formData.sleep_hours !== null) {
        payload.sleep_hours = formData.sleep_hours;
      }

      const response = await fetch(`${API_BASE_URL}/check-ins`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast({
          title: t('checkIn.success'),
          description: t('checkIn.submitted'),
        });
        onOpenChange(false);
        if (onSuccess) {
          onSuccess();
        }
        // איפוס הטופס
        setFormData({
          date: new Date().toISOString().split('T')[0],
          weight: '',
          steps: '',
          walked_10000_steps: null,
          sun_exposure_10min: null,
          hunger_level: null,
          sleep_hours: null,
        });
      } else {
        const error = await response.json();
        toast({
          title: t('common.error'),
          description: error.detail || t('checkIn.error'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to submit check-in:', error);
      toast({
        title: t('common.error'),
        description: t('checkIn.error'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSetReminder = () => {
    // שמירה ב-localStorage
    const reminderTime = new Date();
    reminderTime.setHours(reminderTime.getHours() + 2);
    localStorage.setItem('checkInReminder', reminderTime.toISOString());
    
    toast({
      title: t('checkIn.reminderSet'),
      description: t('checkIn.reminderSetDescription'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background max-h-[90vh] overflow-y-auto" dir={isRtl ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <DialogTitle>{t('checkIn.title')}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="date">{t('common.date')}</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="bg-secondary border-border text-foreground"
              required
              dir={isRtl ? 'rtl' : 'ltr'}
            />
          </div>

          {/* Weight */}
          <div className="space-y-2">
            <Label htmlFor="weight">{t('checkIn.weight')} (kg)</Label>
            <Input
              id="weight"
              type="number"
              step="0.1"
              value={formData.weight}
              onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
              className="bg-secondary border-border text-foreground"
              placeholder={t('checkIn.optional')}
            />
          </div>

          {/* Steps */}
          <div className="space-y-2">
            <Label htmlFor="steps">{t('checkIn.steps')}</Label>
            <Input
              id="steps"
              type="number"
              value={formData.steps}
              onChange={(e) => setFormData({ ...formData, steps: e.target.value })}
              className="bg-secondary border-border text-foreground"
              placeholder={t('checkIn.optional')}
            />
          </div>

          {/* Walked 10,000 steps */}
          <YesNoSkipButtons
            value={formData.walked_10000_steps}
            onChange={(value) => setFormData({ ...formData, walked_10000_steps: value })}
            label={t('checkIn.walked10000Steps')}
          />

          {/* Sun exposure */}
          <YesNoSkipButtons
            value={formData.sun_exposure_10min}
            onChange={(value) => setFormData({ ...formData, sun_exposure_10min: value })}
            label={t('checkIn.sunExposure')}
          />

          {/* Hunger level */}
          <RatingScale
            value={formData.hunger_level}
            onChange={(value) => setFormData({ ...formData, hunger_level: value })}
            label={t('checkIn.hungerLevel')}
            min={1}
            max={10}
          />

          {/* Sleep hours */}
          <RatingScale
            value={formData.sleep_hours}
            onChange={(value) => setFormData({ ...formData, sleep_hours: value })}
            label={t('checkIn.sleepHours')}
            min={1}
            max={10}
          />

          {/* Optional note */}
          <p className="text-xs text-muted-foreground">{t('checkIn.optional')}</p>

          {/* Buttons */}
          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              className="gradient-orange text-background w-full py-3 font-semibold hover:scale-105 transition-all"
              disabled={loading}
            >
              {loading ? t('common.loading') : t('checkIn.submitButton')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSetReminder}
              className="bg-secondary hover:bg-secondary/80 text-foreground w-full py-2 border-border"
            >
              {t('checkIn.remindMe')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

