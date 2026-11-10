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

export interface V3FoodCatalogItem extends V3FoodOption {
  id: number;
  is_public?: boolean | null;
  created_by?: number | null;
}

export interface V3FavoriteFood {
  id: number;
  client_id: number;
  meal_bank_id: number;
  /** 0=breakfast, 1=lunch, 2=dinner; keyed by slot order so favorites survive plan re-saves. */
  meal_slot_order_index: number;
  created_by: number;
  created_at: string;
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
  /** Set when the row was written by choosing a meal option. */
  meal_variant_food_id?: number | null;
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
  target_calories?: number | null;
  target_protein?: number | null;
  target_carbs?: number | null;
  target_fat?: number | null;
  categories: V3MacroCategoryView[];
  variants?: V3MealVariantView[];
  selected_variant_id?: number | null;
}

export type V3VariantFitStatus = "ok" | "approximate" | "infeasible";

export interface V3MealVariantFoodView {
  id: number;
  name: string;
  name_hebrew: string;
  measurement_type: MeasurementType;
  quantity_label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface V3MealVariantView {
  id: number;
  variant_index: number;
  name_hebrew: string;
  computed_calories: number;
  computed_protein: number;
  computed_carbs: number;
  computed_fat: number;
  fit_status: V3VariantFitStatus;
  note_hebrew?: string | null;
  generated_by: "manual";
  foods: V3MealVariantFoodView[];
}

export interface V3ManualVariantFoodInput {
  name: string;
  name_hebrew: string;
  measurement_type: MeasurementType;
  quantity_amount: number;
  quantity_label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface V3ManualVariantInput {
  name_hebrew: string;
  foods: V3ManualVariantFoodInput[];
}

export interface V3ManualVariantSlotInput {
  meal_slot_id: number;
  variants: V3ManualVariantInput[];
}

export interface V3ManualVariantsRequest {
  slots: V3ManualVariantSlotInput[];
}

export interface V3ParsedFoodPlaceholder {
  name: string;
  name_hebrew: string;
  measurement_type: MeasurementType;
  quantity_amount: number;
  quantity_label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface V3ParsedVariant {
  option_index: number;
  name_hebrew: string;
  raw_ingredient_text: string;
  /** Auto-resolved macro split; null only when the PDF option had no parseable macro line. */
  resolved_protein: number | null;
  resolved_carbs: number | null;
  resolved_fat: number | null;
  resolved_calories: number | null;
  macro_blob_raw: string | null;
  foods: V3ParsedFoodPlaceholder[];
}

export interface V3ProposedSlotTarget {
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
}

export interface V3ParsedSlot {
  raw_meal_name: string;
  matched_meal_slot_id: number | null;
  match_confidence: "exact" | "fuzzy" | "none";
  candidate_meal_slot_ids: number[];
  /** Set only when matched_meal_slot_id is null and the PDF's own breakdown table had
   * a target for this meal - lets the trainer create a brand new slot for it instead
   * of being hard-blocked with nowhere to put this meal's options. */
  proposed_target: V3ProposedSlotTarget | null;
  variants: V3ParsedVariant[];
}

export interface V3ProposedDailyTargets {
  total_calories: number;
  protein_target: number;
  carb_target: number;
  fat_target: number;
}

export interface V3ParsedMenuPdfResponse {
  slots: V3ParsedSlot[];
  warnings: string[];
  /** False when the client had no active meal plan at parse time - every slot then
   * has matched_meal_slot_id=null and the review screen should offer to create the
   * whole plan. */
  has_plan: boolean;
  /** The PDF's own daily totals; only set when has_plan is false. */
  daily_targets: V3ProposedDailyTargets | null;
}

export interface V3MealSlotTargets {
  /** Identifies the slot these targets belong to, so matching never relies on position. */
  meal_slot_id?: number | null;
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
}

export interface V3DailyTargetsPayload {
  total_calories: number;
  protein_target: number;
  carb_target: number;
  fat_target: number;
  meal_targets?: V3MealSlotTargets[];
}

export interface V3DailyTargetsResponse {
  total_calories: number;
  protein_target: number;
  carb_target: number;
  fat_target: number;
  drift: number;
  meal_targets: V3MealSlotTargets[];
}

export interface V3DayViewResponse {
  date: string;
  meal_plan?: unknown | null;
  /** Name of the plan version that applies to this day (shown in the menu header). */
  meal_plan_name?: string | null;
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


export interface V3NutritionProfile {
  id: number;
  client_id?: number | null;
  email?: string | null;
  full_name?: string | null;
  food_preferences?: string | null;
  training_times?: string | null;
  extra_foods?: string | null;
  must_keep_foods?: string | null;
  raw_answers?: string | null;
  source: "google_form" | "manual";
  submitted_at?: string | null;
  updated_at?: string | null;
}
