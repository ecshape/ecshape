from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, DateTime, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import enum

class MuscleGroup(str, enum.Enum):
    """Legacy enum - kept for backward compatibility"""
    CHEST = "chest"
    BACK = "back"
    SHOULDERS = "shoulders"
    BICEPS = "biceps"
    TRICEPS = "triceps"
    LEGS = "legs"
    CORE = "core"
    CARDIO = "cardio"
    FULL_BODY = "full_body"
    OTHER = "other"

class Exercise(Base):
    __tablename__ = "exercises"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String)
    video_url = Column(String)
    image_path = Column(String)  # Optional image path for exercise demonstration
    muscle_group = Column(String, nullable=False)  # Changed to String - can be enum value or custom name
    muscle_group_id = Column(Integer, ForeignKey("muscle_groups.id"), nullable=True)  # FK to dynamic muscle groups
    equipment_needed = Column(String)
    instructions = Column(String)  # How to perform the exercise
    category = Column(String)  # Custom category for organizing exercises (e.g., "Strength", "Hypertrophy", "Endurance", "Mobility")
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)  # Trainer who created it
    created_at = Column(DateTime, default=func.now())  # SQLite compatible

    # Relationships
    workout_exercises = relationship("WorkoutExercise", back_populates="exercise")
    muscle_group_rel = relationship("MuscleGroup", foreign_keys=[muscle_group_id], back_populates="exercises")

class WorkoutPlan(Base):
    __tablename__ = "workout_plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String)
    trainer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    start_date = Column(DateTime)  # SQLite compatible
    end_date = Column(DateTime)  # SQLite compatible
    created_at = Column(DateTime, default=func.now())  # SQLite compatible
    updated_at = Column(DateTime, onupdate=func.now())  # SQLite compatible

    # Relationships
    workout_sessions = relationship("WorkoutSession", back_populates="workout_plan", cascade="all, delete-orphan")

class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id = Column(Integer, primary_key=True, index=True)
    workout_plan_id = Column(Integer, ForeignKey("workout_plans.id"), nullable=False)
    name = Column(String, nullable=False)  # e.g., "Day 1: Upper Body", "Cardio Day"
    day_of_week = Column(Integer)  # 0-6 for Monday-Sunday
    notes = Column(String)  # Trainer notes for this session
    created_at = Column(DateTime, default=func.now())  # SQLite compatible

    # Relationships
    workout_plan = relationship("WorkoutPlan", back_populates="workout_sessions")
    workout_exercises = relationship("WorkoutExercise", back_populates="workout_session", cascade="all, delete-orphan")

class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"

    id = Column(Integer, primary_key=True, index=True)
    workout_session_id = Column(Integer, ForeignKey("workout_sessions.id"), nullable=False)
    exercise_id = Column(Integer, ForeignKey("exercises.id"), nullable=False)
    order = Column(Integer, nullable=False)  # Order in the workout
    sets = Column(Integer)
    reps = Column(String)  # Can be "8-12", "30 seconds", "to failure", etc.
    weight = Column(Integer)  # Target weight in kg
    rest_time = Column(Integer)  # in seconds
    notes = Column(String)  # Specific notes for this exercise in this workout

    # Relationships
    workout_session = relationship("WorkoutSession", back_populates="workout_exercises")
    exercise = relationship("Exercise", back_populates="workout_exercises")
    exercise_completions = relationship("ExerciseCompletion", back_populates="workout_exercise", cascade="all, delete-orphan")

class ExerciseCompletion(Base):
    __tablename__ = "exercise_completions"

    id = Column(Integer, primary_key=True, index=True)
    workout_exercise_id = Column(Integer, ForeignKey("workout_exercises.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    completed_at = Column(DateTime, default=func.now())  # SQLite compatible
    actual_sets = Column(Integer)
    actual_reps = Column(String)  # What they actually did
    weight_used = Column(String)  # e.g., "50kg", "bodyweight", "resistance band"
    difficulty_rating = Column(Integer)  # 1-5 scale
    notes = Column(String)  # Client notes about the exercise
    form_photo_path = Column(String)  # Optional photo of exercise form

    # Relationships
    workout_exercise = relationship("WorkoutExercise", back_populates="exercise_completions") 