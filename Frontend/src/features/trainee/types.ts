export interface ExerciseInfo {
  id: number;
  name: string;
  description?: string | null;
  video_url?: string | null;
  muscle_group?: string | null;
  equipment_needed?: string | null;
  instructions?: string | null;
}

export interface WorkoutExercise {
  id: number;
  workout_day_id: number;
  exercise_id: number;
  order_index: number;
  group_name?: string | null;
  target_sets: number;
  target_reps: string;
  target_weight?: number | null;
  rest_seconds: number;
  tempo?: string | null;
  notes?: string | null;
  video_url?: string | null;
  exercise_name?: string | null;
  exercise?: ExerciseInfo | null;
}

export interface WorkoutDay {
  id: number;
  workout_plan_id: number;
  workout_plan_name?: string | null;
  name: string;
  day_type?: string | null;
  order_index: number;
  notes?: string | null;
  estimated_duration?: number | null;
  workout_exercises: WorkoutExercise[];
}

export interface WorkoutPlan {
  id: number;
  client_id: number;
  trainer_id: number;
  name: string;
  description?: string | null;
  split_type?: string | null;
  days_per_week?: number | null;
  duration_weeks?: number | null;
  is_active: boolean;
  notes?: string | null;
  start_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  workout_days: WorkoutDay[];
}

export interface SetCompletion {
  id: number;
  workout_session_id?: number | null;
  workout_exercise_id: number;
  client_id?: number;
  set_number: number;
  reps_completed: number;
  weight_used: number;
  rpe?: number | null;
  completed_at: string;
  /** Client-only flag for optimistic rows not yet confirmed by the server. */
  pending?: boolean;
}

export interface WorkoutSession {
  id: number;
  client_id: number;
  workout_day_id: number;
  started_at: string;
  completed_at?: string | null;
  duration_minutes?: number | null;
  is_completed: boolean;
  notes?: string | null;
  set_completions: SetCompletion[];
}

export interface CheckIn {
  id: number;
  date: string;
  weight?: number | null;
  steps?: number | null;
  walked_10000_steps?: boolean | null;
  sun_exposure_10min?: boolean | null;
  hunger_level?: number | null;
  sleep_hours?: number | null;
}

export interface CheckInSummary {
  today_status: string;
  current_streak: number;
  last_7_days_completion: number;
  completion_rate: number;
  avg_weight?: number | null;
  avg_steps?: number | null;
  avg_sleep_hours?: number | null;
  total_check_ins: number;
}

export interface ProgressPhoto {
  id: number;
  photo_path: string;
  photo_type: string;
}

export interface ProgressEntry {
  id: number;
  client_id: number;
  date: string;
  weight?: number | null;
  photo_path?: string | null;
  photos?: ProgressPhoto[];
  notes?: string | null;
  chest?: number | null;
  waist?: number | null;
  hips?: number | null;
  thighs?: number | null;
  arms?: number | null;
  right_arm?: number | null;
  left_arm?: number | null;
  created_at?: string | null;
}

export interface ChatMessage {
  id: number;
  message: string;
  sender_id: number;
  trainer_id: number;
  client_id: number;
  created_at: string;
  read_at?: string | null;
}

export interface Conversation {
  client_id: number;
  client_name: string;
  last_message?: ChatMessage | null;
  unread_count: number;
}
