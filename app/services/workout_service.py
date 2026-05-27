from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from typing import List, Optional, Tuple
from datetime import datetime
import os
import uuid
from pathlib import Path

from app.models.workout import (
    Exercise, WorkoutPlan, WorkoutSession, WorkoutExercise, ExerciseCompletion,
    MuscleGroup
)
from app.schemas.workout import (
    ExerciseCreate, ExerciseUpdate, ExerciseResponse, ExerciseFilter,
    WorkoutPlanCreate, WorkoutPlanUpdate, WorkoutPlanResponse, WorkoutPlanFilter,
    WorkoutSessionCreate, WorkoutSessionUpdate, WorkoutSessionResponse,
    WorkoutExerciseCreate, WorkoutExerciseUpdate, WorkoutExerciseResponse,
    ExerciseCompletionCreate, ExerciseCompletionUpdate, ExerciseCompletionResponse,
    CompleteWorkoutPlanResponse, CompleteWorkoutSessionResponse,
    WorkoutSummary, ExerciseProgress, ExerciseCompletionFilter,
    BulkWorkoutExerciseCreate, BulkExerciseCompletionCreate
)
from app.services.file_service import FileService

class WorkoutService:
    def __init__(self, db: Session):
        self.db = db
        self.file_service = FileService()

    # Exercise Bank Management
    def create_exercise(self, exercise_data: ExerciseCreate, trainer_id: int) -> ExerciseResponse:
        """Create a new exercise in the trainer's exercise bank."""
        exercise = Exercise(
            name=exercise_data.name,
            description=exercise_data.description,
            video_url=exercise_data.video_url,
            image_path=exercise_data.image_path,
            muscle_group=exercise_data.muscle_group,
            equipment_needed=exercise_data.equipment_needed,
            instructions=exercise_data.instructions,
            category=exercise_data.category,
            created_by=trainer_id
        )
        
        self.db.add(exercise)
        self.db.commit()
        self.db.refresh(exercise)
        
        return self._exercise_to_response(exercise)

    def get_exercises(self, filter_params: ExerciseFilter) -> Tuple[List[ExerciseResponse], int]:
        """Get exercises with filtering and pagination."""
        query = self.db.query(Exercise)
        
        # Apply filters
        if filter_params.trainer_id:
            query = query.filter(Exercise.created_by == filter_params.trainer_id)
        
        if filter_params.muscle_group:
            query = query.filter(Exercise.muscle_group == filter_params.muscle_group)
        
        if filter_params.search:
            search_term = f"%{filter_params.search}%"
            query = query.filter(
                or_(
                    Exercise.name.ilike(search_term),
                    Exercise.description.ilike(search_term),
                    Exercise.instructions.ilike(search_term)
                )
            )
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        offset = (filter_params.page - 1) * filter_params.size
        exercises = query.offset(offset).limit(filter_params.size).all()
        
        return [self._exercise_to_response(exercise) for exercise in exercises], total

    def get_exercise(self, exercise_id: int) -> Optional[ExerciseResponse]:
        """Get a specific exercise by ID."""
        exercise = self.db.query(Exercise).filter(Exercise.id == exercise_id).first()
        if not exercise:
            return None
        
        return self._exercise_to_response(exercise)

    def update_exercise(self, exercise_id: int, exercise_data: ExerciseUpdate, trainer_id: int) -> Optional[ExerciseResponse]:
        """Update an exercise. Any trainer can edit any exercise."""
        exercise = self.db.query(Exercise).filter(Exercise.id == exercise_id).first()
        
        if not exercise:
            return None
        
        # Update fields
        for field, value in exercise_data.dict(exclude_unset=True).items():
            setattr(exercise, field, value)
        
        self.db.commit()
        self.db.refresh(exercise)
        
        return self._exercise_to_response(exercise)

    def delete_exercise(self, exercise_id: int, trainer_id: int) -> bool:
        """Delete an exercise (only by the trainer who created it)."""
        exercise = self.db.query(Exercise).filter(
            and_(
                Exercise.id == exercise_id,
                Exercise.created_by == trainer_id
            )
        ).first()
        
        if not exercise:
            return False
        
        # Check if exercise is used in any workout exercises (old system)
        from app.models.workout import WorkoutExercise
        workout_exercise_count = self.db.query(WorkoutExercise).filter(
            WorkoutExercise.exercise_id == exercise_id
        ).count()
        
        # Check if exercise is used in any workout exercises v2 (new system)
        from app.models.workout_system import WorkoutExerciseV2
        workout_exercise_v2_count = self.db.query(WorkoutExerciseV2).filter(
            WorkoutExerciseV2.exercise_id == exercise_id
        ).count()
        
        if workout_exercise_count > 0 or workout_exercise_v2_count > 0:
            # Exercise is being used, cannot delete
            return False
        
        try:
            self.db.delete(exercise)
            self.db.commit()
            return True
        except Exception as e:
            self.db.rollback()
            # If there's a foreign key constraint error, return False
            return False

    # Workout Plan Management
    def create_workout_plan(self, workout_plan_data: WorkoutPlanCreate, trainer_id: int) -> WorkoutPlanResponse:
        """Create a new workout plan for a client, updating the existing one if present."""
        existing_plan = (
            self.db.query(WorkoutPlan)
            .filter(WorkoutPlan.client_id == workout_plan_data.client_id)
            .first()
        )

        if existing_plan:
            existing_plan.name = workout_plan_data.name
            existing_plan.description = workout_plan_data.description
            existing_plan.start_date = workout_plan_data.start_date
            existing_plan.end_date = workout_plan_data.end_date
            existing_plan.trainer_id = trainer_id

            self.db.commit()
            self.db.refresh(existing_plan)

            return self._workout_plan_to_response(existing_plan)

        workout_plan = WorkoutPlan(
            name=workout_plan_data.name,
            description=workout_plan_data.description,
            trainer_id=trainer_id,
            client_id=workout_plan_data.client_id,
            start_date=workout_plan_data.start_date,
            end_date=workout_plan_data.end_date,
        )

        self.db.add(workout_plan)
        self.db.commit()
        self.db.refresh(workout_plan)

        return self._workout_plan_to_response(workout_plan)

    def get_workout_plans(self, filter_params: WorkoutPlanFilter) -> Tuple[List[WorkoutPlanResponse], int]:
        """Get workout plans with filtering and pagination."""
        query = self.db.query(WorkoutPlan)
        
        # Apply filters
        if filter_params.trainer_id:
            query = query.filter(WorkoutPlan.trainer_id == filter_params.trainer_id)
        
        if filter_params.client_id:
            query = query.filter(WorkoutPlan.client_id == filter_params.client_id)
        
        if filter_params.search:
            search_term = f"%{filter_params.search}%"
            query = query.filter(
                or_(
                    WorkoutPlan.name.ilike(search_term),
                    WorkoutPlan.description.ilike(search_term)
                )
            )
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        offset = (filter_params.page - 1) * filter_params.size
        workout_plans = query.offset(offset).limit(filter_params.size).all()
        
        return [self._workout_plan_to_response(plan) for plan in workout_plans], total

    def get_workout_plan(self, workout_plan_id: int) -> Optional[WorkoutPlanResponse]:
        """Get a specific workout plan by ID."""
        workout_plan = self.db.query(WorkoutPlan).filter(WorkoutPlan.id == workout_plan_id).first()
        if not workout_plan:
            return None
        
        return self._workout_plan_to_response(workout_plan)

    def get_complete_workout_plan(self, workout_plan_id: int) -> Optional[CompleteWorkoutPlanResponse]:
        """Get a complete workout plan with all sessions and exercises."""
        workout_plan = self.db.query(WorkoutPlan).filter(WorkoutPlan.id == workout_plan_id).first()
        if not workout_plan:
            return None
        
        response = self._workout_plan_to_response(workout_plan)
        return CompleteWorkoutPlanResponse(
            **response.dict(),
            workout_sessions=[self._complete_workout_session_to_response(session) for session in workout_plan.workout_sessions]
        )

    def update_workout_plan(self, workout_plan_id: int, workout_plan_data: WorkoutPlanUpdate) -> Optional[WorkoutPlanResponse]:
        """Update a workout plan."""
        workout_plan = self.db.query(WorkoutPlan).filter(WorkoutPlan.id == workout_plan_id).first()
        if not workout_plan:
            return None
        
        # Update fields
        for field, value in workout_plan_data.dict(exclude_unset=True).items():
            setattr(workout_plan, field, value)
        
        self.db.commit()
        self.db.refresh(workout_plan)
        
        return self._workout_plan_to_response(workout_plan)

    def delete_workout_plan(self, workout_plan_id: int) -> bool:
        """Delete a workout plan."""
        workout_plan = self.db.query(WorkoutPlan).filter(WorkoutPlan.id == workout_plan_id).first()
        if not workout_plan:
            return False
        
        self.db.delete(workout_plan)
        self.db.commit()
        return True

    # Workout Session Management
    def create_workout_session(self, workout_session_data: WorkoutSessionCreate, workout_plan_id: int) -> WorkoutSessionResponse:
        """Create a new workout session for a workout plan."""
        workout_session = WorkoutSession(
            workout_plan_id=workout_plan_id,
            name=workout_session_data.name,
            day_of_week=workout_session_data.day_of_week,
            notes=workout_session_data.notes
        )
        
        self.db.add(workout_session)
        self.db.commit()
        self.db.refresh(workout_session)
        
        return self._workout_session_to_response(workout_session)

    def get_workout_session(self, workout_session_id: int) -> Optional[WorkoutSessionResponse]:
        """Get a specific workout session by ID."""
        workout_session = self.db.query(WorkoutSession).filter(WorkoutSession.id == workout_session_id).first()
        if not workout_session:
            return None
        
        return self._workout_session_to_response(workout_session)

    def get_complete_workout_session(self, workout_session_id: int) -> Optional[CompleteWorkoutSessionResponse]:
        """Get a complete workout session with all exercises."""
        workout_session = self.db.query(WorkoutSession).filter(WorkoutSession.id == workout_session_id).first()
        if not workout_session:
            return None
        
        return self._complete_workout_session_to_response(workout_session)

    def update_workout_session(self, workout_session_id: int, workout_session_data: WorkoutSessionUpdate) -> Optional[WorkoutSessionResponse]:
        """Update a workout session."""
        workout_session = self.db.query(WorkoutSession).filter(WorkoutSession.id == workout_session_id).first()
        if not workout_session:
            return None
        
        # Update fields
        for field, value in workout_session_data.dict(exclude_unset=True).items():
            setattr(workout_session, field, value)
        
        self.db.commit()
        self.db.refresh(workout_session)
        
        return self._workout_session_to_response(workout_session)

    def delete_workout_session(self, workout_session_id: int) -> bool:
        """Delete a workout session."""
        workout_session = self.db.query(WorkoutSession).filter(WorkoutSession.id == workout_session_id).first()
        if not workout_session:
            return False
        
        self.db.delete(workout_session)
        self.db.commit()
        return True

    # Workout Exercise Management
    def create_workout_exercise(self, workout_exercise_data: WorkoutExerciseCreate, workout_session_id: int) -> WorkoutExerciseResponse:
        """Add an exercise to a workout session."""
        workout_exercise = WorkoutExercise(
            workout_session_id=workout_session_id,
            exercise_id=workout_exercise_data.exercise_id,
            order=workout_exercise_data.order,
            sets=workout_exercise_data.sets,
            reps=workout_exercise_data.reps,
            weight=workout_exercise_data.weight,
            rest_time=workout_exercise_data.rest_time,
            notes=workout_exercise_data.notes
        )
        
        self.db.add(workout_exercise)
        self.db.commit()
        self.db.refresh(workout_exercise)
        
        return self._workout_exercise_to_response(workout_exercise)

    def create_bulk_workout_exercises(self, bulk_data: BulkWorkoutExerciseCreate, workout_session_id: int) -> List[WorkoutExerciseResponse]:
        """Add multiple exercises to a workout session at once."""
        workout_exercises = []
        
        for exercise_data in bulk_data.exercises:
            workout_exercise = WorkoutExercise(
                workout_session_id=workout_session_id,
                exercise_id=exercise_data.exercise_id,
                order=exercise_data.order,
                sets=exercise_data.sets,
                reps=exercise_data.reps,
                weight=exercise_data.weight,
                rest_time=exercise_data.rest_time,
                notes=exercise_data.notes
            )
            self.db.add(workout_exercise)
            workout_exercises.append(workout_exercise)
        
        self.db.commit()
        
        # Refresh all exercises to get IDs
        for exercise in workout_exercises:
            self.db.refresh(exercise)
        
        return [self._workout_exercise_to_response(exercise) for exercise in workout_exercises]

    def get_workout_exercise(self, workout_exercise_id: int) -> Optional[WorkoutExerciseResponse]:
        """Get a specific workout exercise by ID."""
        workout_exercise = self.db.query(WorkoutExercise).filter(WorkoutExercise.id == workout_exercise_id).first()
        if not workout_exercise:
            return None
        
        return self._workout_exercise_to_response(workout_exercise)

    def update_workout_exercise(self, workout_exercise_id: int, workout_exercise_data: WorkoutExerciseUpdate) -> Optional[WorkoutExerciseResponse]:
        """Update a workout exercise."""
        workout_exercise = self.db.query(WorkoutExercise).filter(WorkoutExercise.id == workout_exercise_id).first()
        if not workout_exercise:
            return None
        
        # Update fields
        for field, value in workout_exercise_data.dict(exclude_unset=True).items():
            setattr(workout_exercise, field, value)
        
        self.db.commit()
        self.db.refresh(workout_exercise)
        
        return self._workout_exercise_to_response(workout_exercise)

    def delete_workout_exercise(self, workout_exercise_id: int) -> bool:
        """Delete a workout exercise."""
        workout_exercise = self.db.query(WorkoutExercise).filter(WorkoutExercise.id == workout_exercise_id).first()
        if not workout_exercise:
            return False
        
        self.db.delete(workout_exercise)
        self.db.commit()
        return True

    # Exercise Completion Management
    def create_exercise_completion(self, completion_data: ExerciseCompletionCreate, client_id: int, form_photo=None) -> ExerciseCompletionResponse:
        """Log completion of an exercise with optional form photo."""
        # Handle form photo upload if provided
        form_photo_path = None
        if form_photo:
            # Generate unique filename
            file_extension = Path(form_photo.filename).suffix if form_photo.filename else '.jpg'
            filename = f"exercise_form_{client_id}_{uuid.uuid4()}{file_extension}"
            
            # Save file using file service
            form_photo_path = self.file_service.save_uploaded_file(
                form_photo, 
                "progress_photos", 
                filename
            )
        
        exercise_completion = ExerciseCompletion(
            workout_exercise_id=completion_data.workout_exercise_id,
            client_id=client_id,
            actual_sets=completion_data.actual_sets,
            actual_reps=completion_data.actual_reps,
            weight_used=completion_data.weight_used,
            difficulty_rating=completion_data.difficulty_rating,
            notes=completion_data.notes,
            form_photo_path=form_photo_path
        )
        
        self.db.add(exercise_completion)
        self.db.commit()
        self.db.refresh(exercise_completion)
        
        return self._exercise_completion_to_response(exercise_completion)

    def create_bulk_exercise_completions(self, bulk_data: BulkExerciseCompletionCreate, client_id: int) -> List[ExerciseCompletionResponse]:
        """Log completion of multiple exercises at once."""
        completions = []
        
        for completion_data in bulk_data.completions:
            exercise_completion = ExerciseCompletion(
                workout_exercise_id=completion_data.workout_exercise_id,
                client_id=client_id,
                actual_sets=completion_data.actual_sets,
                actual_reps=completion_data.actual_reps,
                weight_used=completion_data.weight_used,
                difficulty_rating=completion_data.difficulty_rating,
                notes=completion_data.notes
            )
            self.db.add(exercise_completion)
            completions.append(exercise_completion)
        
        self.db.commit()
        
        # Refresh all completions to get IDs
        for completion in completions:
            self.db.refresh(completion)
        
        return [self._exercise_completion_to_response(completion) for completion in completions]

    def get_exercise_completion(self, completion_id: int) -> Optional[ExerciseCompletionResponse]:
        """Get a specific exercise completion by ID."""
        completion = self.db.query(ExerciseCompletion).filter(ExerciseCompletion.id == completion_id).first()
        if not completion:
            return None
        
        return self._exercise_completion_to_response(completion)

    def update_exercise_completion(self, completion_id: int, completion_data: ExerciseCompletionUpdate) -> Optional[ExerciseCompletionResponse]:
        """Update an exercise completion."""
        completion = self.db.query(ExerciseCompletion).filter(ExerciseCompletion.id == completion_id).first()
        if not completion:
            return None
        
        # Update fields
        for field, value in completion_data.dict(exclude_unset=True).items():
            setattr(completion, field, value)
        
        self.db.commit()
        self.db.refresh(completion)
        
        return self._exercise_completion_to_response(completion)

    def delete_exercise_completion(self, completion_id: int) -> bool:
        """Delete an exercise completion."""
        completion = self.db.query(ExerciseCompletion).filter(ExerciseCompletion.id == completion_id).first()
        if not completion:
            return False
        
        # Delete associated form photo if it exists
        if completion.form_photo_path and os.path.exists(completion.form_photo_path):
            os.remove(completion.form_photo_path)
        
        self.db.delete(completion)
        self.db.commit()
        return True

    def get_exercise_completions(self, filter_params: ExerciseCompletionFilter) -> Tuple[List[ExerciseCompletionResponse], int]:
        """Get exercise completions with filtering and pagination."""
        query = self.db.query(ExerciseCompletion)
        
        # Apply filters
        if filter_params.client_id:
            query = query.filter(ExerciseCompletion.client_id == filter_params.client_id)
        
        if filter_params.workout_exercise_id:
            query = query.filter(ExerciseCompletion.workout_exercise_id == filter_params.workout_exercise_id)
        
        if filter_params.start_date:
            query = query.filter(ExerciseCompletion.completed_at >= filter_params.start_date)
        
        if filter_params.end_date:
            query = query.filter(ExerciseCompletion.completed_at <= filter_params.end_date)
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        offset = (filter_params.page - 1) * filter_params.size
        completions = query.offset(offset).limit(filter_params.size).all()
        
        return [self._exercise_completion_to_response(completion) for completion in completions], total

    # Analytics and Progress
    def get_workout_summary(self, workout_plan_id: int) -> Optional[WorkoutSummary]:
        """Get summary statistics for a workout plan."""
        workout_plan = self.db.query(WorkoutPlan).filter(WorkoutPlan.id == workout_plan_id).first()
        if not workout_plan:
            return None
        
        # Count sessions and exercises
        total_sessions = len(workout_plan.workout_sessions)
        total_exercises = sum(len(session.workout_exercises) for session in workout_plan.workout_sessions)
        
        # Count completed exercises
        completed_exercises = 0
        completed_sessions = 0
        last_workout_date = None
        
        for session in workout_plan.workout_sessions:
            session_completed = False
            for exercise in session.workout_exercises:
                completions = self.db.query(ExerciseCompletion).filter(
                    ExerciseCompletion.workout_exercise_id == exercise.id
                ).all()
                
                if completions:
                    completed_exercises += 1
                    session_completed = True
                    
                    # Track last workout date
                    for completion in completions:
                        if not last_workout_date or completion.completed_at > last_workout_date:
                            last_workout_date = completion.completed_at
            
            if session_completed:
                completed_sessions += 1
        
        completion_rate = (completed_exercises / total_exercises * 100) if total_exercises > 0 else 0
        
        return WorkoutSummary(
            workout_plan_id=workout_plan_id,
            workout_plan_name=workout_plan.name,
            total_sessions=total_sessions,
            completed_sessions=completed_sessions,
            total_exercises=total_exercises,
            completed_exercises=completed_exercises,
            completion_rate=completion_rate,
            last_workout_date=last_workout_date
        )

    def get_exercise_progress(self, exercise_id: int, client_id: int) -> Optional[ExerciseProgress]:
        """Get progress statistics for a specific exercise."""
        exercise = self.db.query(Exercise).filter(Exercise.id == exercise_id).first()
        if not exercise:
            return None
        
        # Get all completions for this exercise by this client
        completions = self.db.query(ExerciseCompletion).join(WorkoutExercise).filter(
            and_(
                WorkoutExercise.exercise_id == exercise_id,
                ExerciseCompletion.client_id == client_id
            )
        ).all()
        
        if not completions:
            return None
        
        # Calculate statistics
        total_completions = len(completions)
        total_sets = sum(c.actual_sets or 0 for c in completions)
        average_sets = total_sets / total_completions if total_completions > 0 else 0
        
        # Get most common reps and weight
        reps_counts = {}
        weight_counts = {}
        difficulty_sum = 0
        
        for completion in completions:
            if completion.actual_reps:
                reps_counts[completion.actual_reps] = reps_counts.get(completion.actual_reps, 0) + 1
            if completion.weight_used:
                weight_counts[completion.weight_used] = weight_counts.get(completion.weight_used, 0) + 1
            if completion.difficulty_rating:
                difficulty_sum += completion.difficulty_rating
        
        average_reps = max(reps_counts.items(), key=lambda x: x[1])[0] if reps_counts else "N/A"
        average_weight = max(weight_counts.items(), key=lambda x: x[1])[0] if weight_counts else "N/A"
        average_difficulty = difficulty_sum / total_completions if total_completions > 0 else 0
        
        # Get last completion date
        last_completed = max(c.completed_at for c in completions) if completions else None
        
        return ExerciseProgress(
            exercise_id=exercise_id,
            exercise_name=exercise.name,
            muscle_group=exercise.muscle_group,
            total_completions=total_completions,
            average_sets=average_sets,
            average_reps=average_reps,
            average_weight=average_weight,
            average_difficulty=average_difficulty,
            last_completed=last_completed
        )

    # Helper methods for converting models to responses
    def _exercise_to_response(self, exercise: Exercise) -> ExerciseResponse:
        """Convert Exercise model to ExerciseResponse."""
        return ExerciseResponse(
            id=exercise.id,
            name=exercise.name,
            description=exercise.description,
            video_url=exercise.video_url,
            image_path=exercise.image_path,
            muscle_group=exercise.muscle_group,
            equipment_needed=exercise.equipment_needed,
            instructions=exercise.instructions,
            category=exercise.category,
            created_by=exercise.created_by,
            created_at=exercise.created_at
        )

    def _workout_plan_to_response(self, workout_plan: WorkoutPlan) -> WorkoutPlanResponse:
        """Convert WorkoutPlan model to WorkoutPlanResponse."""
        return WorkoutPlanResponse(
            id=workout_plan.id,
            name=workout_plan.name,
            description=workout_plan.description,
            trainer_id=workout_plan.trainer_id,
            client_id=workout_plan.client_id,
            start_date=workout_plan.start_date,
            end_date=workout_plan.end_date,
            created_at=workout_plan.created_at,
            updated_at=workout_plan.updated_at
        )

    def _workout_session_to_response(self, workout_session: WorkoutSession) -> WorkoutSessionResponse:
        """Convert WorkoutSession model to WorkoutSessionResponse."""
        return WorkoutSessionResponse(
            id=workout_session.id,
            workout_plan_id=workout_session.workout_plan_id,
            name=workout_session.name,
            day_of_week=workout_session.day_of_week,
            notes=workout_session.notes,
            created_at=workout_session.created_at
        )

    def _workout_exercise_to_response(self, workout_exercise: WorkoutExercise) -> WorkoutExerciseResponse:
        """Convert WorkoutExercise model to WorkoutExerciseResponse."""
        return WorkoutExerciseResponse(
            id=workout_exercise.id,
            workout_session_id=workout_exercise.workout_session_id,
            exercise_id=workout_exercise.exercise_id,
            order=workout_exercise.order,
            sets=workout_exercise.sets,
            reps=workout_exercise.reps,
            rest_time=workout_exercise.rest_time,
            notes=workout_exercise.notes,
            exercise=self._exercise_to_response(workout_exercise.exercise) if workout_exercise.exercise else None
        )

    def _exercise_completion_to_response(self, completion: ExerciseCompletion) -> ExerciseCompletionResponse:
        """Convert ExerciseCompletion model to ExerciseCompletionResponse."""
        return ExerciseCompletionResponse(
            id=completion.id,
            workout_exercise_id=completion.workout_exercise_id,
            client_id=completion.client_id,
            actual_sets=completion.actual_sets,
            actual_reps=completion.actual_reps,
            weight_used=completion.weight_used,
            difficulty_rating=completion.difficulty_rating,
            notes=completion.notes,
            completed_at=completion.completed_at,
            form_photo_path=completion.form_photo_path
        )

    def _complete_workout_session_to_response(self, workout_session: WorkoutSession) -> CompleteWorkoutSessionResponse:
        """Convert WorkoutSession model to CompleteWorkoutSessionResponse."""
        session_response = self._workout_session_to_response(workout_session)
        return CompleteWorkoutSessionResponse(
            **session_response.dict(),
            workout_exercises=[self._workout_exercise_to_response(exercise) for exercise in workout_session.workout_exercises]
        ) 