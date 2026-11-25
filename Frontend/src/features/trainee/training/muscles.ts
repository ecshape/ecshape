import type { ExerciseInfo, WorkoutDay, WorkoutExercise, WorkoutPlan } from '../types';

/** Drawable regions of the body map. */
export type Region =
  | 'neck' | 'traps' | 'frontDelts' | 'sideDelts' | 'rearDelts' | 'chest' | 'biceps' | 'triceps' | 'forearms'
  | 'abs' | 'obliques' | 'lats' | 'middleBack' | 'lowerBack' | 'glutes' | 'quads' | 'hamstrings' | 'calves'
  | 'adductors' | 'abductors';

export type Load = Partial<Record<Region, number>>;

/** Library muscle names (free-exercise-db) and bank muscle_group keys -> regions. */
const MUSCLE_REGIONS: Record<string, Region[]> = {
  chest: ['chest'],
  shoulders: ['frontDelts', 'sideDelts', 'rearDelts'],
  lats: ['lats'],
  'middle back': ['middleBack'],
  'lower back': ['lowerBack'],
  traps: ['traps'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearms'],
  abdominals: ['abs', 'obliques'],
  quadriceps: ['quads'],
  hamstrings: ['hamstrings'],
  glutes: ['glutes'],
  calves: ['calves'],
  adductors: ['adductors'],
  abductors: ['abductors'],
  neck: ['neck'],
  // bank muscle groups
  back: ['lats', 'middleBack', 'traps', 'lowerBack'],
  legs: ['quads', 'hamstrings', 'calves', 'glutes'],
  core: ['abs', 'obliques'],
  abs: ['abs', 'obliques'],
  arms: ['biceps', 'triceps', 'forearms'],
  quads: ['quads'],
  full_body: ['chest', 'lats', 'frontDelts', 'quads', 'glutes', 'hamstrings', 'abs'],
  fullbody: ['chest', 'lats', 'frontDelts', 'quads', 'glutes', 'hamstrings', 'abs'],
};

/** Region -> the library muscle it filters on (Explore). */
export const REGION_MUSCLE: Record<Region, string> = {
  neck: 'neck', traps: 'traps', frontDelts: 'shoulders', sideDelts: 'shoulders', rearDelts: 'shoulders', chest: 'chest',
  biceps: 'biceps', triceps: 'triceps', forearms: 'forearms', abs: 'abdominals', obliques: 'abdominals', lats: 'lats',
  middleBack: 'middle back', lowerBack: 'lower back', glutes: 'glutes', quads: 'quadriceps', hamstrings: 'hamstrings',
  calves: 'calves', adductors: 'adductors', abductors: 'abductors',
};

/** Library muscles, in display order. */
export const MUSCLES = [
  'chest', 'shoulders', 'lats', 'middle back', 'lower back', 'traps', 'biceps', 'triceps', 'forearms',
  'abdominals', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'neck',
] as const;

/** Muscle names -> stable i18n key (trainee.training2.muscle.<key>). */
export const muscleKey = (m: string) => m.trim().toLowerCase().replace(/[\s-]+/g, '_');

export const regionsOf = (muscle?: string | null): Region[] => {
  if (!muscle) return [];
  const k = muscle.trim().toLowerCase().replace(/_/g, ' ');
  return MUSCLE_REGIONS[k] ?? MUSCLE_REGIONS[k.replace(/ /g, '_')] ?? [];
};

/** Primary and secondary muscles of an exercise (library data first, bank group as fallback). */
export const exerciseMuscles = (e?: ExerciseInfo | null) => {
  const primary = e?.primary_muscles?.length ? e.primary_muscles : e?.muscle_group ? [e.muscle_group] : [];
  return { primary, secondary: e?.secondary_muscles ?? [] };
};

/** Region load for a single exercise: primary 1, secondary .45. */
export const exerciseLoad = (e?: ExerciseInfo | null): Load => {
  const out: Load = {};
  const { primary, secondary } = exerciseMuscles(e);
  for (const m of secondary) for (const r of regionsOf(m)) out[r] = Math.max(out[r] ?? 0, 0.45);
  for (const m of primary) for (const r of regionsOf(m)) out[r] = 1;
  return out;
};

/** Region load for a routine, weighted by sets and normalised to 0..1. */
export const dayLoad = (exs: WorkoutExercise[]): Load => {
  const raw: Load = {};
  for (const ex of exs) {
    const sets = Math.max(1, ex.target_sets || 1);
    const { primary, secondary } = exerciseMuscles(ex.exercise);
    for (const m of primary) for (const r of regionsOf(m)) raw[r] = (raw[r] ?? 0) + sets;
    for (const m of secondary) for (const r of regionsOf(m)) raw[r] = (raw[r] ?? 0) + sets * 0.4;
  }
  const max = Math.max(0, ...Object.values(raw).map((v) => v ?? 0));
  if (!max) return {};
  const out: Load = {};
  for (const [k, v] of Object.entries(raw)) out[k as Region] = Math.max(0.3, (v ?? 0) / max);
  return out;
};

const UPPER: Region[] = ['chest', 'frontDelts', 'sideDelts', 'rearDelts', 'biceps', 'triceps', 'forearms', 'lats', 'middleBack', 'traps', 'neck'];
const LOWER: Region[] = ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'];
const PUSH: Region[] = ['chest', 'frontDelts', 'sideDelts', 'triceps'];
const PULL: Region[] = ['lats', 'middleBack', 'traps', 'rearDelts', 'biceps', 'forearms'];

export type Goal = 'upper' | 'lower' | 'full' | 'push' | 'pull' | 'core' | 'arms' | 'legs';

/** "Train upper body" style goal, from where the routine's primary sets land. */
export const dayGoal = (exs: WorkoutExercise[]): Goal | null => {
  let up = 0, low = 0, core = 0, push = 0, pull = 0, arms = 0, total = 0;
  for (const ex of exs) {
    const sets = Math.max(1, ex.target_sets || 1);
    const regs = Array.from(new Set(exerciseMuscles(ex.exercise).primary.flatMap(regionsOf)));
    if (!regs.length) continue;
    const w = sets / regs.length;
    for (const r of regs) {
      total += w;
      if (UPPER.includes(r)) up += w;
      if (LOWER.includes(r)) low += w;
      if (r === 'abs' || r === 'obliques' || r === 'lowerBack') core += w;
      if (PUSH.includes(r)) push += w;
      if (PULL.includes(r)) pull += w;
      if (r === 'biceps' || r === 'triceps' || r === 'forearms') arms += w;
    }
  }
  if (!total) return null;
  if (core / total >= 0.7) return 'core';
  if (low / total >= 0.65) return 'lower';
  if (up / total >= 0.65) {
    if (arms / up >= 0.7) return 'arms';
    if (push / up >= 0.75) return 'push';
    if (pull / up >= 0.75) return 'pull';
    return 'upper';
  }
  return 'full';
};

/** Muscle-group summary rows: group -> exercises, sets, reps (from targets). */
export type GroupRow = { key: string; exercises: number; sets: number; reps: number };

export const repsOf = (r?: string | null) => {
  // "8-10" -> 9 (midpoint), "12" -> 12, "AMRAP" -> 0
  const nums = (r || '').match(/\d+/g)?.map(Number) ?? [];
  if (!nums.length) return 0;
  return nums.length > 1 ? Math.round((nums[0] + nums[1]) / 2) : nums[0];
};

export const groupSummary = (exs: WorkoutExercise[]): GroupRow[] => {
  const map = new Map<string, GroupRow>();
  for (const ex of exs) {
    const m = exerciseMuscles(ex.exercise).primary[0] || ex.exercise?.muscle_group || 'other';
    const key = muscleKey(m);
    const row = map.get(key) ?? { key, exercises: 0, sets: 0, reps: 0 };
    row.exercises += 1;
    row.sets += ex.target_sets || 0;
    row.reps += (ex.target_sets || 0) * repsOf(ex.target_reps);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.sets - a.sets);
};

/** How often a routine comes around: plan days per week spread over its routines. */
export const dayFrequency = (plan: WorkoutPlan | null | undefined): { kind: 'times'; count: number } | { kind: 'rotation'; perWeek: number } => {
  const n = plan?.workout_days?.length || 1;
  const dpw = plan?.days_per_week || n;
  const f = dpw / n;
  if (Number.isInteger(f) && f >= 1) return { kind: 'times', count: f };
  return { kind: 'rotation', perWeek: dpw };
};

export const allExercises = (day?: WorkoutDay | null) => day?.workout_exercises ?? [];
