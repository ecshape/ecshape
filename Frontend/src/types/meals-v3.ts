export type MacroType = "protein" | "carb" | "fat";

export type MeasurementType = "per_100g" | "per_portion";

export interface V3FoodOption {
  id?: number | null;
  name: string;
  name_hebrew?: string | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  serving_size?: string | null;
  measurement_type?: MeasurementType;
  notes?: string | null;
  macro_type?: MacroType;
}

export interface V3ClientMealChoiceResponse {
  id: number;
  client_id: number;
  food_option_id?: number | null;
  meal_slot_id?: number | null;
  date: string;
  quantity?: string | null;
  photo_path?: string | null;
  is_approved?: boolean | null;
  trainer_comment?: string | null;
  created_at?: string;
  custom_food_name?: string | null;
  custom_calories?: number | null;
  custom_protein?: number | null;
  custom_carbs?: number | null;
  custom_fat?: number | null;
}

export interface V3MealCompletionStatusResponse {
  id: number;
  client_id: number;
  meal_slot_id: number;
  date: string;
  is_completed: boolean;
  completion_method?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface V3MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface V3DailyMacrosResponse {
  consumed: V3MacroTotals;
  targets: V3MacroTotals;
  remaining: V3MacroTotals;
  percentages: V3MacroTotals;
}

export interface V3ChosenFood {
  source: "plan_food" | "custom_food";
  meal_slot_id: number;
  macro_type: MacroType;
  food_option_id?: number | null;
  custom_food_name?: string | null;
  custom_calories?: number | null;
  custom_protein?: number | null;
  custom_carbs?: number | null;
  custom_fat?: number | null;
  quantity?: string | null;
  display_calories?: number | null;
  display_protein?: number | null;
  display_carbs?: number | null;
  display_fat?: number | null;
}

export interface V3MacroCategoryView {
  macro_type: MacroType;
  macro_category_id?: number | null;
  quantity_instruction?: string | null;
  notes?: string | null;
  recommended_foods: V3FoodOption[];
  chosen_food?: V3ChosenFood | null;
}

export interface V3MealSlotView {
  meal_slot_id: number;
  name: string;
  time_suggestion?: string | null;
  notes?: string | null;
  order_index: number;
  categories: V3MacroCategoryView[];
}

export interface V3DayViewResponse {
  date: string;
  meal_plan?: unknown | null;
  slots: V3MealSlotView[];
  daily_macros: V3DailyMacrosResponse;
  choices: V3ClientMealChoiceResponse[];
}

export interface V3MealLogCreateRequest {
  date: string;
  meal_slot_id: number;
  macro_type: MacroType;
  food_option_id?: number | null;
  quantity?: string | null;
  custom_food_name?: string | null;
  custom_calories?: number | null;
  custom_protein?: number | null;
  custom_carbs?: number | null;
  custom_fat?: number | null;
  photo_path?: string | null;
}

