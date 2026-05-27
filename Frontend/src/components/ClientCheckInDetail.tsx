import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { YesNoSkipButtons } from './YesNoSkipButtons';
import { RatingScale } from './RatingScale';
import { format } from 'date-fns';
import { he, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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

interface ClientCheckInDetailProps {
  checkIn: CheckIn | null;
}

export const ClientCheckInDetail: React.FC<ClientCheckInDetailProps> = ({
  checkIn
}) => {
  const { t, i18n } = useTranslation();

  if (!checkIn) {
    return (
      <Card className="bg-gradient-to-br from-card to-secondary border-border/50">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            {t('checkIn.selectCheckIn')}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl">
      <CardHeader>
        <CardTitle>
          {t('checkIn.title')} - {format(new Date(checkIn.date), 'PPP', {
            locale: i18n.language === 'he' ? he : enUS
          })}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('checkIn.submittedAt')}: {format(new Date(checkIn.created_at), 'PPp', {
            locale: i18n.language === 'he' ? he : enUS
          })}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Weight */}
        {checkIn.weight !== null && checkIn.weight !== undefined && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t('checkIn.weight')}</label>
            <div className="bg-secondary/30 border border-border/50 rounded-lg px-4 py-2 text-foreground">
              {checkIn.weight} kg
            </div>
          </div>
        )}

        {/* Steps */}
        {checkIn.steps !== null && checkIn.steps !== undefined && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t('checkIn.steps')}</label>
            <div className="bg-secondary/30 border border-border/50 rounded-lg px-4 py-2 text-foreground">
              {checkIn.steps.toLocaleString()}
            </div>
          </div>
        )}

        {/* Walked 10,000 steps */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {t('checkIn.walked10000Steps')}
          </label>
          <YesNoSkipButtons
            value={checkIn.walked_10000_steps}
            onChange={() => {}}
            disabled={true}
          />
          {checkIn.walked_10000_steps === null && (
            <p className="text-xs text-muted-foreground italic">({t('checkIn.notAnswered')})</p>
          )}
        </div>

        {/* Sun exposure */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {t('checkIn.sunExposure')}
          </label>
          <YesNoSkipButtons
            value={checkIn.sun_exposure_10min}
            onChange={() => {}}
            disabled={true}
          />
          {checkIn.sun_exposure_10min === null && (
            <p className="text-xs text-muted-foreground italic">({t('checkIn.notAnswered')})</p>
          )}
        </div>

        {/* Hunger level */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {t('checkIn.hungerLevel')}
          </label>
          <RatingScale
            value={checkIn.hunger_level}
            onChange={() => {}}
            disabled={true}
          />
          {checkIn.hunger_level === null && (
            <p className="text-xs text-muted-foreground italic">({t('checkIn.notAnswered')})</p>
          )}
          {checkIn.hunger_level !== null && (
            <p className="text-xs text-muted-foreground">
              {t('checkIn.selected')}: {checkIn.hunger_level}
            </p>
          )}
        </div>

        {/* Sleep hours */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {t('checkIn.sleepHours')}
          </label>
          <RatingScale
            value={checkIn.sleep_hours}
            onChange={() => {}}
            disabled={true}
          />
          {checkIn.sleep_hours === null && (
            <p className="text-xs text-muted-foreground italic">({t('checkIn.notAnswered')})</p>
          )}
          {checkIn.sleep_hours !== null && (
            <p className="text-xs text-muted-foreground">
              {t('checkIn.selected')}: {checkIn.sleep_hours}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

