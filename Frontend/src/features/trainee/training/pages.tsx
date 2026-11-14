import React from 'react';
import { useParams } from 'react-router-dom';
import RoutineScreen from './RoutineScreen';
import SessionPlayer from './SessionPlayer';
import HistoryScreen, { SessionDetail } from './HistoryScreen';
import ExploreScreen from './ExploreScreen';
import MeasuresScreen from './MeasuresScreen';
import { TraineePage } from './shared';

/** Route pages of the trainee training area (client only, inside the trainee shell). */

export const RoutinePage: React.FC = () => {
  const { dayId } = useParams<{ dayId: string }>();
  return <TraineePage current="training"><RoutineScreen key={dayId} dayId={Number(dayId)} /></TraineePage>;
};

/** Exercise screen + live session: the tab bar is hidden, the player owns the bottom of the screen. */
export const SessionPage: React.FC = () => {
  const { dayId } = useParams<{ dayId: string }>();
  return <TraineePage current="training" immersive><SessionPlayer key={dayId} dayId={Number(dayId)} /></TraineePage>;
};

export const HistoryPage: React.FC = () => <TraineePage current="training"><HistoryScreen /></TraineePage>;

export const SessionDetailPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <TraineePage current="training"><SessionDetail sessionId={Number(sessionId)} /></TraineePage>;
};

export const ExplorePage: React.FC = () => <TraineePage current="training"><ExploreScreen /></TraineePage>;

export const MeasuresPage: React.FC = () => <TraineePage current="progress"><MeasuresScreen /></TraineePage>;
