"""
Enhanced Workout System Models
Features: Workout splits (Push/Pull/Legs), detailed set tracking, rest periods
"""

from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, DateTime, Float, Enum, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum

class WorkoutSplitType(str, enum.Enum):
    """Common workout split types"""
    PUSH_PULL_LEGS = "push_pull_legs"  # PPL
    UPPER_LOWER = "upper_lower"
    FULL_BODY = "full_body"
    BRO_SPLIT = "bro_split"  # Chest/Back/Shoulders/Arms/Legs
    CUSTOM = "custom"

class DayType(str, enum.Enum):
    """Specific day types for PPL and other splits"""
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

class WorkoutPlanV2(Base):
    """Main workout plan with split type"""
    __tablename__ = "workout_plans_v2"
    
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    trainer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)  # e.g., "Hypertrophy Phase 1"
    description = Column(Text)
    split_type = Column(Enum(WorkoutSplitType), nullable=True)  # Optional - deprecated, kept for backward compatibility
    days_per_week = Column(Integer)  # e.g., 6 (PPLPPL)
    duration_weeks = Column(Integer)  # How many weeks this plan lasts
    is_active = Column(Boolean, default=True)
    notes = Column(Text)  # Overall plan notes
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    
    # Relationships
    workout_days = relationship("WorkoutDay", back_populates="workout_plan", cascade="all, delete-orphan", order_by="WorkoutDay.order_index")

class WorkoutDay(Base):
    """Individual workout day (e.g., Push Day, Pull Day, Leg Day)"""
    __tablename__ = "workout_days_v2"
    
    id = Column(Integer, primary_key=True, index=True)
    workout_plan_id = Column(Integer, ForeignKey("workout_plans_v2.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)  # e.g., "Push Day", "Pull Day", "Leg Day"
    day_type = Column(Enum(DayType), nullable=True)  # Optional - trainer defines custom names
    order_index = Column(Integer, nullable=False)  # Day 1, Day 2, etc.
    notes = Column(Text)  # Trainer notes for this day
    estimated_duration = Column(Integer)  # minutes
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    workout_plan = relationship("WorkoutPlanV2", back_populates="workout_days")
    workout_exercises = relationship("WorkoutExerciseV2", back_populates="workout_day", cascade="all, delete-orphan", order_by="WorkoutExerciseV2.order_index")

class WorkoutExerciseV2(Base):
    """Exercise within a workout day with detailed tracking"""
    __tablename__ = "workout_exercises_v2"
    
    id = Column(Integer, primary_key=True, index=True)
    workout_day_id = Column(Integer, ForeignKey("workout_days_v2.id", ondelete="CASCADE"), nullable=False)
    exercise_id = Column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False)
    order_index = Column(Integer, nullable=False)  # Order in the workout
    group_name = Column(String)  # Optional grouping label (e.g., Superset A)
    
    # Target parameters set by trainer
    target_sets = Column(Integer, nullable=True)  # e.g., 4 (optional - trainer's choice)
    target_reps = Column(String, nullable=True)  # e.g., "8-12", "15", "to failure" (optional - trainer's choice)
    target_weight = Column(Float)  # kg (optional, for tracking progression)
    rest_seconds = Column(Integer, nullable=True)  # e.g., 90 (seconds between sets) (optional - trainer's choice)
    
    # Additional instructions
    tempo = Column(String)  # e.g., "3-0-1-0" (eccentric-pause-concentric-pause)
    notes = Column(Text)  # Exercise-specific notes (e.g., "Focus on form", "Dropset on last set")
    video_url = Column(String)  # Optional demo video
    
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    workout_day = relationship("WorkoutDay", back_populates="workout_exercises")
    exercise = relationship("Exercise")  # Links to existing Exercise model
    set_completions = relationship("SetCompletion", back_populates="workout_exercise", cascade="all, delete-orphan")

class WorkoutSessionV2(Base):
    """Client's actual workout session"""
    __tablename__ = "workout_sessions_v2"
    
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    workout_day_id = Column(Integer, ForeignKey("workout_days_v2.id", ondelete="CASCADE"), nullable=False)
    started_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime)
    duration_minutes = Column(Integer)  # Calculated from start/end
    is_completed = Column(Boolean, default=False)
    overall_rating = Column(Integer)  # 1-5 (how was the workout?)
    notes = Column(Text)  # Client notes about the session
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    set_completions = relationship("SetCompletion", back_populates="workout_session", cascade="all, delete-orphan")

class SetCompletion(Base):
    """Individual set completion tracking"""
    __tablename__ = "set_completions_v2"
    
    id = Column(Integer, primary_key=True, index=True)
    workout_session_id = Column(Integer, ForeignKey("workout_sessions_v2.id", ondelete="CASCADE"), nullable=False)
    workout_exercise_id = Column(Integer, ForeignKey("workout_exercises_v2.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    set_number = Column(Integer, nullable=False)  # 1, 2, 3, 4...
    reps_completed = Column(Integer, nullable=False)  # Actual reps done
    weight_used = Column(Float, nullable=False)  # kg
    rest_taken = Column(Integer)  # seconds (if they tracked it)
    rpe = Column(Integer)  # Rate of Perceived Exertion (1-10)
    form_rating = Column(Integer)  # Self-rated form quality (1-5)
    notes = Column(Text)  # Set-specific notes
    completed_at = Column(DateTime, default=func.now())
    
    # Relationships
    workout_session = relationship("WorkoutSessionV2", back_populates="set_completions")
    workout_exercise = relationship("WorkoutExerciseV2", back_populates="set_completions")

class ExercisePersonalRecord(Base):
    """Track personal records for exercises"""
    __tablename__ = "exercise_prs_v2"
    
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    exercise_id = Column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False)
    pr_type = Column(String, nullable=False)  # "1RM", "Max Reps", "Max Volume"
    weight = Column(Float)  # kg
    reps = Column(Integer)
    date_achieved = Column(DateTime, nullable=False)
    set_completion_id = Column(Integer, ForeignKey("set_completions_v2.id"))  # Link to the actual set
    notes = Column(Text)
    created_at = Column(DateTime, default=func.now())

