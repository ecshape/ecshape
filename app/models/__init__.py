from app.models.user import User
from app.models.workout import Exercise, WorkoutPlan, WorkoutSession, WorkoutExercise, ExerciseCompletion
from app.models.muscle_group import MuscleGroup
from app.models.workout_split import WorkoutSplit
from app.models.nutrition import (
    NutritionPlan, Recipe, PlannedMeal, MealCompletion, WeighIn,
    MealPlan, MealEntry, MealComponent, MealUpload, NutritionEntry
)
from app.models.progress import ProgressEntry
from app.models.progress_photo import ProgressPhoto, PhotoType
from app.models.notification import Notification
from app.models.client_notification_setting import ClientNotificationSetting
from app.models.chat import ChatMessage
from app.models.check_in import DailyCheckIn

# New meal and workout system models
from app.models.meal_system import (
    MealPlanV2 as NewMealPlan,
    MealSlot,
    MacroCategory,
    FoodOption,
    ClientMealChoice,
    MealTemplate,
    MacroType,
    DailyMealHistory,
    MealBank
)
from app.models.workout_system import (
    WorkoutPlanV2 as NewWorkoutPlan,
    WorkoutDay,
    WorkoutExerciseV2 as NewWorkoutExercise,
    WorkoutSessionV2 as NewWorkoutSession,
    SetCompletion,
    ExercisePersonalRecord,
    WorkoutSplitType,
    DayType
)

__all__ = [
    "User",
    "Exercise",
    "MuscleGroup",
    "WorkoutSplit",
    "WorkoutPlan",
    "WorkoutSession",
    "WorkoutExercise",
    "ExerciseCompletion",
    "NutritionPlan",
    "Recipe",
    "PlannedMeal",
    "MealCompletion",
    "WeighIn",
    "MealPlan",
    "MealEntry",
    "MealComponent",
    "MealUpload",
    "NutritionEntry",
    "ProgressEntry",
    "ProgressPhoto",
    "PhotoType",
    "Notification",
    "ClientNotificationSetting",
    "ChatMessage",
    "DailyCheckIn",
    # New system models
    "NewMealPlan",
    "MealSlot",
    "MacroCategory",
    "FoodOption",
    "ClientMealChoice",
    "MealTemplate",
    "MacroType",
    "DailyMealHistory",
    "MealBank",
    "NewWorkoutPlan",
    "WorkoutDay",
    "NewWorkoutExercise",
    "NewWorkoutSession",
    "SetCompletion",
    "ExercisePersonalRecord",
    "WorkoutSplitType",
    "DayType",
]
