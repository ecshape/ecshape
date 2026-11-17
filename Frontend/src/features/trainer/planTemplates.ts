/**
 * Ready-made workout and meal plan templates (#15). Pure data: the trainer previews one and assigns it to a client,
 * which creates the plan through the existing plan APIs (see TemplatesSheet.tsx).
 * Exercises are free-exercise-db library ids (imported into the trainer's bank on assign); foods are matched against
 * the trainer's food bank by name and fall back to the reference values below.
 */
export type L10n = { he: string; en: string; fr: string };
export const pick = (l: L10n, lang: string): string => (lang.startsWith('he') ? l.he : lang.startsWith('fr') ? l.fr : l.en);

/* ------------------------------------------------------------------ workouts */
export interface TplExercise { lib: string; sets: number; reps: string; rest: number }
export interface TplDay { name: L10n; ex: TplExercise[] }
export type TplLevel = 'beginner' | 'intermediate' | 'expert';
export interface WorkoutTemplate {
  id: string;
  name: L10n;
  goal: L10n;
  level: TplLevel;
  place: 'gym' | 'home';
  daysPerWeek: number;
  weeks: number;
  split: 'full_body' | 'push_pull_legs' | 'upper_lower' | 'custom';
  days: TplDay[];
}

const x = (lib: string, sets: number, reps: string, rest = 90): TplExercise => ({ lib, sets, reps, rest });
const d = (he: string, en: string, fr: string, ex: TplExercise[]): TplDay => ({ name: { he, en, fr }, ex });

/** Readable name for a library id ("Barbell_Bench_Press_-_Medium_Grip" -> "Barbell Bench Press - Medium Grip"). */
export const libName = (id: string) => id.replace(/_/g, ' ');

export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: 'fb3-beginner',
    name: { he: 'פול באדי למתחילים', en: 'Beginner full body', fr: 'Full body débutant' },
    goal: { he: 'בניית בסיס כוח וטכניקה, 3 אימונים בשבוע', en: 'Build a strength and technique base, 3 sessions a week', fr: 'Bases de force et de technique, 3 séances par semaine' },
    level: 'beginner', place: 'gym', daysPerWeek: 3, weeks: 8, split: 'full_body',
    days: [
      d('אימון A', 'Workout A', 'Séance A', [x('Barbell_Squat', 3, '8-10', 120), x('Dumbbell_Bench_Press', 3, '8-10'), x('Seated_Cable_Rows', 3, '10-12'), x('Dumbbell_Shoulder_Press', 2, '10-12'), x('Plank', 3, '30s', 60)]),
      d('אימון B', 'Workout B', 'Séance B', [x('Leg_Press', 3, '10-12', 120), x('Wide-Grip_Lat_Pulldown', 3, '10-12'), x('Incline_Dumbbell_Press', 3, '10-12'), x('Lying_Leg_Curls', 2, '12'), x('Crunches', 3, '15', 60)]),
      d('אימון C', 'Workout C', 'Séance C', [x('Romanian_Deadlift', 3, '8-10', 120), x('Pushups', 3, '10-15'), x('One-Arm_Dumbbell_Row', 3, '10'), x('Dumbbell_Lunges', 2, '10'), x('Side_Lateral_Raise', 2, '12-15', 60)]),
    ],
  },
  {
    id: 'ppl-hypertrophy',
    name: { he: 'דחיפה / משיכה / רגליים', en: 'Hypertrophy push / pull / legs', fr: 'Hypertrophie push / pull / legs' },
    goal: { he: 'עלייה במסת שריר, כל קבוצה פעמיים בשבוע', en: 'Muscle gain, each muscle twice a week', fr: 'Prise de muscle, chaque muscle deux fois par semaine' },
    level: 'intermediate', place: 'gym', daysPerWeek: 6, weeks: 10, split: 'push_pull_legs',
    days: [
      d('דחיפה', 'Push', 'Poussée', [x('Barbell_Bench_Press_-_Medium_Grip', 4, '6-8', 150), x('Incline_Dumbbell_Press', 3, '8-10'), x('Standing_Military_Press', 3, '8-10'), x('Side_Lateral_Raise', 3, '12-15', 60), x('Cable_Crossover', 3, '12-15', 60), x('Triceps_Pushdown', 3, '10-12', 60)]),
      d('משיכה', 'Pull', 'Tirage', [x('Barbell_Deadlift', 3, '5', 180), x('Pullups', 3, '6-10', 120), x('Bent_Over_Barbell_Row', 3, '8-10'), x('Face_Pull', 3, '12-15', 60), x('Barbell_Curl', 3, '10', 60), x('Hammer_Curls', 2, '12', 60)]),
      d('רגליים', 'Legs', 'Jambes', [x('Barbell_Squat', 4, '6-8', 180), x('Romanian_Deadlift', 3, '8-10', 120), x('Leg_Press', 3, '10-12'), x('Lying_Leg_Curls', 3, '12', 60), x('Standing_Calf_Raises', 4, '12-15', 60)]),
    ],
  },
  {
    id: 'upper-lower-4',
    name: { he: 'עליון / תחתון, 4 ימים', en: 'Upper / lower, 4 days', fr: 'Haut / bas, 4 jours' },
    goal: { he: 'שילוב של כוח ונפח למתאמנים עם ניסיון', en: 'Strength and volume for trainees with some experience', fr: 'Force et volume pour pratiquants avec expérience' },
    level: 'intermediate', place: 'gym', daysPerWeek: 4, weeks: 8, split: 'upper_lower',
    days: [
      d('עליון A', 'Upper A', 'Haut A', [x('Barbell_Bench_Press_-_Medium_Grip', 4, '5-6', 150), x('Bent_Over_Barbell_Row', 4, '6-8', 120), x('Dumbbell_Shoulder_Press', 3, '8-10'), x('Chin-Up', 3, '8'), x('Lying_Triceps_Press', 2, '10', 60)]),
      d('תחתון A', 'Lower A', 'Bas A', [x('Barbell_Squat', 4, '5-6', 180), x('Romanian_Deadlift', 3, '8', 120), x('Dumbbell_Step_Ups', 3, '10'), x('Standing_Calf_Raises', 3, '12', 60), x('Hanging_Leg_Raise', 3, '10', 60)]),
      d('עליון B', 'Upper B', 'Haut B', [x('Incline_Dumbbell_Press', 3, '8-10'), x('Wide-Grip_Lat_Pulldown', 3, '10'), x('Seated_Cable_Rows', 3, '10'), x('Side_Lateral_Raise', 3, '15', 60), x('Dumbbell_Bicep_Curl', 3, '12', 60)]),
      d('תחתון B', 'Lower B', 'Bas B', [x('Barbell_Deadlift', 3, '5', 180), x('Leg_Press', 3, '10-12'), x('Lying_Leg_Curls', 3, '12', 60), x('Leg_Extensions', 3, '12-15', 60), x('Plank', 3, '45s', 60)]),
    ],
  },
  {
    id: 'fatloss-circuit',
    name: { he: 'סבב שריפת שומן', en: 'Fat-loss circuit', fr: 'Circuit perte de gras' },
    goal: { he: 'הוצאה קלורית גבוהה ושמירה על שריר, מנוחות קצרות', en: 'High energy burn while keeping muscle, short rests', fr: 'Dépense élevée en gardant le muscle, repos courts' },
    level: 'beginner', place: 'gym', daysPerWeek: 3, weeks: 6, split: 'full_body',
    days: [
      d('סבב 1', 'Circuit 1', 'Circuit 1', [x('Goblet_Squat', 3, '15', 30), x('Pushups', 3, '12', 30), x('Seated_Cable_Rows', 3, '15', 30), x('Mountain_Climbers', 3, '40s', 30), x('Rope_Jumping', 3, '60s', 45)]),
      d('סבב 2', 'Circuit 2', 'Circuit 2', [x('Dumbbell_Lunges', 3, '12', 30), x('Dumbbell_Shoulder_Press', 3, '12', 30), x('Wide-Grip_Lat_Pulldown', 3, '15', 30), x('Russian_Twist', 3, '20', 30), x('Mountain_Climbers', 3, '40s', 45)]),
      d('סבב 3', 'Circuit 3', 'Circuit 3', [x('Leg_Press', 3, '15', 30), x('Dumbbell_Bench_Press', 3, '12', 30), x('One-Arm_Dumbbell_Row', 3, '12', 30), x('Plank', 3, '40s', 30), x('Rope_Jumping', 3, '60s', 45)]),
    ],
  },
  {
    id: 'home-noequip',
    name: { he: 'אימון בית בלי ציוד', en: 'Home, no equipment', fr: 'Maison sans matériel' },
    goal: { he: 'כושר כללי ומשקל גוף בלבד, בכל מקום', en: 'General fitness with bodyweight only, anywhere', fr: 'Forme générale au poids du corps, partout' },
    level: 'beginner', place: 'home', daysPerWeek: 3, weeks: 6, split: 'full_body',
    days: [
      d('בית A', 'Home A', 'Maison A', [x('Bodyweight_Squat', 3, '15-20', 60), x('Pushups', 3, '8-15', 60), x('Inverted_Row', 3, '8-12', 60), x('Glute_Kickback', 3, '15', 45), x('Plank', 3, '30-45s', 45)]),
      d('בית B', 'Home B', 'Maison B', [x('Bodyweight_Walking_Lunge', 3, '12', 60), x('Bench_Dips', 3, '10-12', 60), x('Superman', 3, '12', 45), x('Single_Leg_Glute_Bridge', 3, '12', 45), x('Crunches', 3, '15-20', 45)]),
      d('בית C', 'Home C', 'Maison C', [x('Mountain_Climbers', 4, '30s', 30), x('Bodyweight_Squat', 4, '20', 30), x('Pushups', 4, '10', 30), x('Russian_Twist', 3, '20', 30), x('Butt_Lift_Bridge', 3, '15', 30)]),
    ],
  },
  {
    id: 'strength-5x5',
    name: { he: 'כוח 5x5', en: 'Strength 5x5', fr: 'Force 5x5' },
    goal: { he: 'עלייה בכוח בתרגילי הבסיס, עומס מתקדם בכל אימון', en: 'Strength on the big lifts, adding load every session', fr: 'Force sur les mouvements de base, charge progressive' },
    level: 'intermediate', place: 'gym', daysPerWeek: 3, weeks: 12, split: 'full_body',
    days: [
      d('אימון A', 'Workout A', 'Séance A', [x('Barbell_Squat', 5, '5', 180), x('Barbell_Bench_Press_-_Medium_Grip', 5, '5', 180), x('Bent_Over_Barbell_Row', 5, '5', 150)]),
      d('אימון B', 'Workout B', 'Séance B', [x('Barbell_Squat', 5, '5', 180), x('Standing_Military_Press', 5, '5', 180), x('Barbell_Deadlift', 1, '5', 180)]),
    ],
  },
  {
    id: 'glutes-focus',
    name: { he: 'דגש ישבן ורגליים', en: 'Glutes focus', fr: 'Focus fessiers' },
    goal: { he: 'חיזוק ועיצוב ישבן ורגליים, עם אימון פלג גוף עליון', en: 'Shape and strengthen glutes and legs, plus one upper day', fr: 'Renforcer et galber fessiers et jambes, plus un jour haut du corps' },
    level: 'beginner', place: 'gym', daysPerWeek: 3, weeks: 8, split: 'custom',
    days: [
      d('ישבן וירך אחורית', 'Glutes & hamstrings', 'Fessiers & ischios', [x('Barbell_Hip_Thrust', 4, '8-12', 120), x('Romanian_Deadlift', 3, '10'), x('Glute_Kickback', 3, '15', 60), x('Thigh_Abductor', 3, '15-20', 60), x('Lying_Leg_Curls', 3, '12', 60)]),
      d('פלג גוף עליון', 'Upper body', 'Haut du corps', [x('Wide-Grip_Lat_Pulldown', 3, '10-12'), x('Dumbbell_Shoulder_Press', 3, '10-12'), x('Seated_Cable_Rows', 3, '12'), x('Pushups', 3, '8-12'), x('Plank', 3, '40s', 60)]),
      d('ישבן וארבע ראשי', 'Glutes & quads', 'Fessiers & quadriceps', [x('Goblet_Squat', 4, '10-12', 120), x('Split_Squat_with_Dumbbells', 3, '10'), x('Barbell_Glute_Bridge', 3, '12'), x('Leg_Press', 3, '12-15'), x('Single_Leg_Glute_Bridge', 2, '12', 60)]),
    ],
  },
];

/* ------------------------------------------------------------------ meals */
export type Macro = 'protein' | 'carb' | 'fat';
export interface RefFood {
  /** Lower-case fragments (English and Hebrew) used to find this food in the trainer's food bank. */
  match: string[];
  name: string;
  he: string;
  kcal: number; p: number; c: number; f: number;
  per: 'per_100g' | 'per_portion';
  serving?: string;
}

export const FOODS: Record<string, RefFood> = {
  chicken: { match: ['chicken breast', 'חזה עוף'], name: 'Chicken breast', he: 'חזה עוף', kcal: 165, p: 31, c: 0, f: 3.6, per: 'per_100g' },
  turkey: { match: ['turkey', 'הודו'], name: 'Turkey breast', he: 'חזה הודו', kcal: 135, p: 30, c: 0, f: 1, per: 'per_100g' },
  beef: { match: ['lean beef', 'ground beef', 'בקר'], name: 'Lean beef', he: 'בקר רזה', kcal: 176, p: 26, c: 0, f: 8, per: 'per_100g' },
  salmon: { match: ['salmon', 'סלמון'], name: 'Salmon', he: 'סלמון', kcal: 208, p: 20, c: 0, f: 13, per: 'per_100g' },
  tuna: { match: ['tuna', 'טונה'], name: 'Tuna in water', he: 'טונה במים', kcal: 116, p: 26, c: 0, f: 1, per: 'per_100g' },
  eggs: { match: ['egg', 'ביצ'], name: 'Eggs', he: 'ביצים', kcal: 78, p: 6.3, c: 0.6, f: 5.3, per: 'per_portion', serving: '1' },
  whites: { match: ['egg white', 'חלבון ביצה'], name: 'Egg whites', he: 'חלבוני ביצה', kcal: 52, p: 11, c: 0.7, f: 0.2, per: 'per_100g' },
  cottage: { match: ['cottage', 'קוטג'], name: 'Cottage cheese 5%', he: 'קוטג׳ 5%', kcal: 98, p: 11, c: 3.4, f: 5, per: 'per_100g' },
  yogurt: { match: ['greek yogurt', 'יוגורט'], name: 'Greek yogurt 0%', he: 'יוגורט יווני 0%', kcal: 59, p: 10, c: 3.6, f: 0.4, per: 'per_100g' },
  whey: { match: ['whey', 'protein powder', 'אבקת חלבון'], name: 'Whey protein', he: 'אבקת חלבון', kcal: 120, p: 24, c: 3, f: 1.5, per: 'per_portion', serving: '30g' },
  tofu: { match: ['tofu', 'טופו'], name: 'Tofu', he: 'טופו', kcal: 144, p: 15, c: 3, f: 8.7, per: 'per_100g' },
  lentils: { match: ['lentil', 'עדשים'], name: 'Cooked lentils', he: 'עדשים מבושלות', kcal: 116, p: 9, c: 20, f: 0.4, per: 'per_100g' },
  chickpeas: { match: ['chickpea', 'חומוס'], name: 'Cooked chickpeas', he: 'חומוס מבושל', kcal: 164, p: 8.9, c: 27, f: 2.6, per: 'per_100g' },
  rice: { match: ['rice', 'אורז'], name: 'Cooked rice', he: 'אורז מבושל', kcal: 130, p: 2.7, c: 28, f: 0.3, per: 'per_100g' },
  oats: { match: ['oat', 'שיבולת'], name: 'Oats', he: 'שיבולת שועל', kcal: 389, p: 17, c: 66, f: 7, per: 'per_100g' },
  potato: { match: ['sweet potato', 'בטטה'], name: 'Sweet potato', he: 'בטטה', kcal: 86, p: 1.6, c: 20, f: 0.1, per: 'per_100g' },
  bread: { match: ['whole wheat bread', 'wholewheat', 'לחם מלא'], name: 'Whole wheat bread', he: 'לחם מלא', kcal: 70, p: 3.5, c: 12, f: 1, per: 'per_portion', serving: '1 slice' },
  pasta: { match: ['pasta', 'פסטה'], name: 'Cooked pasta', he: 'פסטה מבושלת', kcal: 158, p: 5.8, c: 31, f: 0.9, per: 'per_100g' },
  quinoa: { match: ['quinoa', 'קינואה'], name: 'Cooked quinoa', he: 'קינואה מבושלת', kcal: 120, p: 4.4, c: 21, f: 1.9, per: 'per_100g' },
  banana: { match: ['banana', 'בננה'], name: 'Banana', he: 'בננה', kcal: 105, p: 1.3, c: 27, f: 0.4, per: 'per_portion', serving: '1' },
  fruit: { match: ['apple', 'תפוח'], name: 'Apple', he: 'תפוח', kcal: 95, p: 0.5, c: 25, f: 0.3, per: 'per_portion', serving: '1' },
  avocado: { match: ['avocado', 'אבוקדו'], name: 'Avocado', he: 'אבוקדו', kcal: 160, p: 2, c: 9, f: 15, per: 'per_100g' },
  oil: { match: ['olive oil', 'שמן זית'], name: 'Olive oil', he: 'שמן זית', kcal: 40, p: 0, c: 0, f: 4.5, per: 'per_portion', serving: '1 tsp' },
  almonds: { match: ['almond', 'שקדים'], name: 'Almonds', he: 'שקדים', kcal: 579, p: 21, c: 22, f: 50, per: 'per_100g' },
  tahini: { match: ['tahini', 'טחינה'], name: 'Raw tahini', he: 'טחינה גולמית', kcal: 595, p: 17, c: 21, f: 54, per: 'per_100g' },
  peanut: { match: ['peanut butter', 'חמאת בוטנים'], name: 'Peanut butter', he: 'חמאת בוטנים', kcal: 94, p: 4, c: 3, f: 8, per: 'per_portion', serving: '1 tbsp' },
};

export interface TplCat { macro: Macro; qty: L10n; foods: (keyof typeof FOODS)[] }
export interface TplSlot { name: L10n; time: string; kcal: number; cats: TplCat[] }
export interface MealTemplate {
  id: string;
  name: L10n;
  goal: L10n;
  kcal: number; p: number; c: number; f: number;
  slots: TplSlot[];
}

const q = (he: string, en: string, fr: string): L10n => ({ he, en, fr });
const S = {
  breakfast: q('ארוחת בוקר', 'Breakfast', 'Petit-déjeuner'),
  snack: q('ביניים', 'Snack', 'Collation'),
  lunch: q('ארוחת צהריים', 'Lunch', 'Déjeuner'),
  pre: q('לפני אימון', 'Pre-workout', 'Avant l’entraînement'),
  dinner: q('ארוחת ערב', 'Dinner', 'Dîner'),
};
const c = (macro: Macro, qty: L10n, foods: (keyof typeof FOODS)[]): TplCat => ({ macro, qty, foods });

export const MEAL_TEMPLATES: MealTemplate[] = [
  {
    id: 'cutting',
    name: q('חיטוב', 'Cutting', 'Sèche'),
    goal: q('גירעון קלורי מתון עם הרבה חלבון לשמירה על שריר', 'Moderate deficit with high protein to keep muscle', 'Déficit modéré, riche en protéines pour garder le muscle'),
    kcal: 1700, p: 150, c: 150, f: 55,
    slots: [
      { name: S.breakfast, time: '08:00', kcal: 400, cats: [c('protein', q('3 ביצים או 200 גרם', '3 eggs or 200 g', '3 œufs ou 200 g'), ['eggs', 'cottage', 'yogurt']), c('carb', q('2 פרוסות או 40 גרם', '2 slices or 40 g', '2 tranches ou 40 g'), ['bread', 'oats'])] },
      { name: S.lunch, time: '13:00', kcal: 550, cats: [c('protein', q('150 גרם', '150 g', '150 g'), ['chicken', 'turkey', 'tuna']), c('carb', q('150 גרם', '150 g', '150 g'), ['rice', 'potato', 'quinoa']), c('fat', q('כפית', '1 tsp', '1 c. à café'), ['oil', 'tahini'])] },
      { name: S.snack, time: '16:30', kcal: 200, cats: [c('protein', q('מנה', '1 serving', '1 portion'), ['yogurt', 'whey']), c('carb', q('פרי אחד', '1 fruit', '1 fruit'), ['fruit', 'banana'])] },
      { name: S.dinner, time: '20:00', kcal: 550, cats: [c('protein', q('150 גרם', '150 g', '150 g'), ['salmon', 'chicken', 'beef']), c('carb', q('120 גרם', '120 g', '120 g'), ['potato', 'rice']), c('fat', q('50 גרם', '50 g', '50 g'), ['avocado', 'oil'])] },
    ],
  },
  {
    id: 'bulking',
    name: q('מסה', 'Bulking', 'Prise de masse'),
    goal: q('עודף קלורי לבניית שריר, 5 ארוחות ביום', 'Calorie surplus for muscle gain, 5 meals a day', 'Surplus calorique pour la prise de muscle, 5 repas'),
    kcal: 2900, p: 180, c: 360, f: 85,
    slots: [
      { name: S.breakfast, time: '08:00', kcal: 650, cats: [c('protein', q('3 ביצים + מנה', '3 eggs + 1 serving', '3 œufs + 1 portion'), ['eggs', 'whey']), c('carb', q('80 גרם', '80 g', '80 g'), ['oats', 'bread']), c('fat', q('כף', '1 tbsp', '1 c. à soupe'), ['peanut', 'almonds'])] },
      { name: S.snack, time: '11:00', kcal: 400, cats: [c('protein', q('200 גרם', '200 g', '200 g'), ['yogurt', 'cottage']), c('carb', q('בננה', '1 banana', '1 banane'), ['banana', 'fruit']), c('fat', q('20 גרם', '20 g', '20 g'), ['almonds'])] },
      { name: S.lunch, time: '14:00', kcal: 750, cats: [c('protein', q('200 גרם', '200 g', '200 g'), ['chicken', 'beef', 'turkey']), c('carb', q('250 גרם', '250 g', '250 g'), ['rice', 'pasta', 'quinoa']), c('fat', q('2 כפיות', '2 tsp', '2 c. à café'), ['oil', 'tahini'])] },
      { name: S.pre, time: '17:30', kcal: 400, cats: [c('protein', q('מנה', '1 serving', '1 portion'), ['whey', 'yogurt']), c('carb', q('2 פרוסות', '2 slices', '2 tranches'), ['bread', 'banana'])] },
      { name: S.dinner, time: '20:30', kcal: 700, cats: [c('protein', q('200 גרם', '200 g', '200 g'), ['salmon', 'beef', 'chicken']), c('carb', q('250 גרם', '250 g', '250 g'), ['potato', 'rice', 'pasta']), c('fat', q('70 גרם', '70 g', '70 g'), ['avocado', 'oil'])] },
    ],
  },
  {
    id: 'maintenance',
    name: q('שמירה', 'Maintenance', 'Maintien'),
    goal: q('איזון לשמירה על המשקל ואנרגיה יציבה', 'Balanced plan to hold weight with steady energy', 'Plan équilibré pour maintenir le poids'),
    kcal: 2200, p: 140, c: 250, f: 70,
    slots: [
      { name: S.breakfast, time: '08:00', kcal: 500, cats: [c('protein', q('2 ביצים + 100 גרם', '2 eggs + 100 g', '2 œufs + 100 g'), ['eggs', 'cottage']), c('carb', q('2 פרוסות', '2 slices', '2 tranches'), ['bread', 'oats']), c('fat', q('30 גרם', '30 g', '30 g'), ['avocado'])] },
      { name: S.lunch, time: '13:00', kcal: 700, cats: [c('protein', q('170 גרם', '170 g', '170 g'), ['chicken', 'turkey', 'tuna']), c('carb', q('200 גרם', '200 g', '200 g'), ['rice', 'quinoa', 'pasta']), c('fat', q('כפית', '1 tsp', '1 c. à café'), ['oil', 'tahini'])] },
      { name: S.snack, time: '16:30', kcal: 300, cats: [c('protein', q('200 גרם', '200 g', '200 g'), ['yogurt']), c('carb', q('פרי', '1 fruit', '1 fruit'), ['fruit', 'banana']), c('fat', q('15 גרם', '15 g', '15 g'), ['almonds'])] },
      { name: S.dinner, time: '20:00', kcal: 700, cats: [c('protein', q('170 גרם', '170 g', '170 g'), ['salmon', 'beef', 'chicken']), c('carb', q('200 גרם', '200 g', '200 g'), ['potato', 'rice']), c('fat', q('כפית', '1 tsp', '1 c. à café'), ['oil'])] },
    ],
  },
  {
    id: 'vegetarian',
    name: q('צמחוני', 'Vegetarian', 'Végétarien'),
    goal: q('מקורות חלבון מהצומח, ביצים ומוצרי חלב', 'Protein from plants, eggs and dairy', 'Protéines végétales, œufs et produits laitiers'),
    kcal: 2000, p: 120, c: 230, f: 65,
    slots: [
      { name: S.breakfast, time: '08:00', kcal: 500, cats: [c('protein', q('3 ביצים או 200 גרם', '3 eggs or 200 g', '3 œufs ou 200 g'), ['eggs', 'yogurt', 'cottage']), c('carb', q('60 גרם', '60 g', '60 g'), ['oats', 'bread'])] },
      { name: S.lunch, time: '13:00', kcal: 650, cats: [c('protein', q('200 גרם', '200 g', '200 g'), ['tofu', 'lentils', 'chickpeas']), c('carb', q('180 גרם', '180 g', '180 g'), ['quinoa', 'rice']), c('fat', q('כף', '1 tbsp', '1 c. à soupe'), ['tahini', 'oil'])] },
      { name: S.snack, time: '16:30', kcal: 250, cats: [c('protein', q('200 גרם', '200 g', '200 g'), ['yogurt', 'cottage']), c('fat', q('20 גרם', '20 g', '20 g'), ['almonds'])] },
      { name: S.dinner, time: '20:00', kcal: 600, cats: [c('protein', q('200 גרם', '200 g', '200 g'), ['tofu', 'eggs', 'lentils']), c('carb', q('200 גרם', '200 g', '200 g'), ['potato', 'pasta']), c('fat', q('50 גרם', '50 g', '50 g'), ['avocado', 'oil'])] },
    ],
  },
  {
    id: 'high-protein',
    name: q('עתיר חלבון', 'High protein', 'Riche en protéines'),
    goal: q('כ-2 גרם חלבון לק״ג, למתאמני כוח', 'About 2 g protein per kg, for strength trainees', 'Environ 2 g de protéines par kg, pour la musculation'),
    kcal: 2300, p: 190, c: 220, f: 70,
    slots: [
      { name: S.breakfast, time: '08:00', kcal: 550, cats: [c('protein', q('2 ביצים + 150 גרם חלבונים', '2 eggs + 150 g whites', '2 œufs + 150 g de blancs'), ['eggs', 'whites']), c('carb', q('60 גרם', '60 g', '60 g'), ['oats', 'bread'])] },
      { name: S.lunch, time: '13:00', kcal: 650, cats: [c('protein', q('200 גרם', '200 g', '200 g'), ['chicken', 'turkey', 'beef']), c('carb', q('180 גרם', '180 g', '180 g'), ['rice', 'potato']), c('fat', q('כפית', '1 tsp', '1 c. à café'), ['oil', 'tahini'])] },
      { name: S.pre, time: '17:00', kcal: 450, cats: [c('protein', q('מנה + 200 גרם', '1 serving + 200 g', '1 portion + 200 g'), ['whey', 'yogurt', 'cottage']), c('carb', q('בננה', '1 banana', '1 banane'), ['banana', 'fruit'])] },
      { name: S.dinner, time: '20:30', kcal: 650, cats: [c('protein', q('200 גרם', '200 g', '200 g'), ['salmon', 'tuna', 'chicken']), c('carb', q('150 גרם', '150 g', '150 g'), ['quinoa', 'potato']), c('fat', q('50 גרם', '50 g', '50 g'), ['avocado', 'almonds'])] },
    ],
  },
];
