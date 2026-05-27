"""
Pydantic schemas for the new workout system
"""

from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional
from datetime import datetime
from enum import Enum

class WorkoutSplitType(str, Enum):
    PUSH_PULL_LEGS = "push_pull_legs"
    UPPER_LOWER = "upper_lower"
    FULL_BODY = "full_body"
    BRO_SPLIT = "bro_split"
    CUSTOM = "custom"

class DayType(str, Enum):
    PUSH = "push"
    PULL = "pull"
    LEGS = "legs"
    UPPER = "upper"
    LOWER = "lower"
    FULL_BODY = "full_body"
    CHEST = "chest"
    BACK = "back"
    SHOULDERS = "shoulders"
    ARMS = "arms"
    REST = "rest"
    CARDIO = "cardio"
    CUSTOM = "custom"

# ============ Workout Exercise Schemas ============

class WorkoutExerciseBase(BaseModel):
    exercise_id: int
    order_index: int
    target_sets: Optional[int] = None  # Optional - trainer's choice
    target_reps: Optional[str] = None  # e.g., "8-12", "15", "to failure"
    target_weight: Optional[float] = None
    rest_seconds: Optional[int] = None  # Optional - trainer's choice
    tempo: Optional[str] = None
    notes: Optional[str] = None
    video_url: Optional[str] = None
    group_name: Optional[str] = None
    
    @field_validator('target_sets')
    @classmethod
    def validate_target_sets(cls, v):
        if v is not None and (v < 1 or v > 10):
            raise ValueError('target_sets must be between 1 and 10 if provided')
        return v
    
    @field_validator('rest_seconds')
    @classmethod
    def validate_rest_seconds(cls, v):
        if v is not None and (v < 0 or v > 600):
            raise ValueError('rest_seconds must be between 0 and 600 if provided')
        return v

class WorkoutExerciseCreate(WorkoutExerciseBase):
    workout_day_id: int

class WorkoutExerciseUpdate(BaseModel):
    order_index: Optional[int] = None
    target_sets: Optional[int] = Field(None, ge=1, le=10)
    target_reps: Optional[str] = None
    target_weight: Optional[float] = None
    rest_seconds: Optional[int] = Field(None, ge=0, le=600)
    tempo: Optional[str] = None
    notes: Optional[str] = None
    video_url: Optional[str] = None
    group_name: Optional[str] = None

class WorkoutExerciseResponse(WorkoutExerciseBase):
    id: int
    workout_day_id: int
    created_at: datetime
    exercise: Optional[dict] = None  # Will be populated with exercise details
    
    model_config = ConfigDict(from_attributes=True)

# ============ Workout Day Schemas ============

class WorkoutDayBase(BaseModel):
    name: str
    day_type: Optional[DayType] = None  # Optional - trainer defines custom day names
    order_index: int
    notes: Optional[str] = None
    estimated_duration: Optional[int] = None

class WorkoutDayCreate(WorkoutDayBase):
    workout_plan_id: int
    exercises: Optional[List[WorkoutExerciseCreate]] = []

class WorkoutDayUpdate(BaseModel):
    name: Optional[str] = None
    day_type: Optional[DayType] = None
    order_index: Optional[int] = None
    notes: Optional[str] = None
    estimated_duration: Optional[int] = None

class WorkoutDayResponse(WorkoutDayBase):
    id: int
    workout_plan_id: int
    created_at: datetime
    workout_exercises: List[WorkoutExerciseResponse] = []
    
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

# ============ Workout Plan Schemas ============

class WorkoutPlanBase(BaseModel):
    name: str
    description: Optional[str] = None
    split_type: Optional[WorkoutSplitType] = None  # Optional - trainer defines custom workout structure
    days_per_week: Optional[int] = Field(None, ge=1, le=7)
    duration_weeks: Optional[int] = None
    is_active: bool = True
    notes: Optional[str] = None

class WorkoutPlanCreate(WorkoutPlanBase):
    client_id: int
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class WorkoutPlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    split_type: Optional[WorkoutSplitType] = None
    days_per_week: Optional[int] = Field(None, ge=1, le=7)
    duration_weeks: Optional[int] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class WorkoutPlanResponse(WorkoutPlanBase):
    id: int
    client_id: int
    trainer_id: int
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    workout_days: List[WorkoutDayResponse] = []
    
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

# ============ Complete Workout Plan Creation (All at once) ============

class CompleteWorkoutExercise(BaseModel):
    exercise_id: int
    order_index: int
    target_sets: Optional[int] = None  # Optional - trainer's choice
    target_reps: Optional[str] = None
    target_weight: Optional[float] = None
    rest_seconds: Optional[int] = None  # Optional - trainer's choice
    tempo: Optional[str] = None
    notes: Optional[str] = None
    video_url: Optional[str] = None
    group_name: Optional[str] = None
    
    @field_validator('target_sets')
    @classmethod
    def validate_target_sets(cls, v):
        if v is not None and v < 1:
            raise ValueError('target_sets must be >= 1 if provided')
        return v
    
    @field_validator('rest_seconds')
    @classmethod
    def validate_rest_seconds(cls, v):
        if v is not None and (v < 0 or v > 600):
            raise ValueError('rest_seconds must be between 0 and 600 if provided')
        return v

class CompleteWorkoutDay(BaseModel):
    name: str
    day_type: Optional[DayType] = None  # Optional - trainer defines custom day names
    order_index: int
    notes: Optional[str] = None
    estimated_duration: Optional[int] = None
    exercises: List[CompleteWorkoutExercise]

class CompleteWorkoutPlanCreate(BaseModel):
    client_id: int
    name: str
    description: Optional[str] = None
    split_type: Optional[str] = None  # Optional - trainer can use any split type name or enum value
    days_per_week: Optional[int] = Field(None, ge=1, le=7)
    duration_weeks: Optional[int] = None
    notes: Optional[str] = None
    workout_days: List[CompleteWorkoutDay]

# ============ Set Completion Schemas (for client tracking) ============

class SetCompletionCreate(BaseModel):
    workout_exercise_id: int
    set_number: int = Field(..., ge=1)
    reps_completed: int = Field(..., ge=0)
    weight_used: float = Field(..., ge=0)
    rest_taken: Optional[int] = None
    rpe: Optional[int] = Field(None, ge=1, le=10)
    form_rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None
    completed_at: Optional[datetime] = None

class SetCompletionResponse(SetCompletionCreate):
    id: int
    workout_session_id: int
    client_id: int
    completed_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# ============ Workout Session Schemas (for client tracking) ============

class WorkoutSessionCreate(BaseModel):
    workout_day_id: int
    started_at: datetime

class WorkoutSessionUpdate(BaseModel):
    completed_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    is_completed: Optional[bool] = None
    overall_rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None

class WorkoutSessionResponse(BaseModel):
    id: int
    client_id: int
    workout_day_id: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    is_completed: bool
    overall_rating: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    set_completions: List[SetCompletionResponse] = []
    
    model_config = ConfigDict(from_attributes=True)

# ============ Personal Record Schemas ============

class PersonalRecordCreate(BaseModel):
    exercise_id: int
    pr_type: str  # "1RM", "Max Reps", "Max Volume"
    weight: Optional[float] = None
    reps: Optional[int] = None
    date_achieved: datetime
    set_completion_id: Optional[int] = None
    notes: Optional[str] = None

class PersonalRecordResponse(PersonalRecordCreate):
    id: int
    client_id: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

