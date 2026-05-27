"""
API endpoints for the new workout system
Trainers can create workout plans with splits (Push/Pull/Legs) and detailed tracking
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List

from app.database import get_db
from app.auth.utils import get_current_user
from app.schemas.auth import UserResponse, UserRole
from app.models.user import User
from app.schemas.workout_system import (
    WorkoutPlanCreate,
    WorkoutPlanUpdate,
    WorkoutPlanResponse,
    CompleteWorkoutPlanCreate,
    WorkoutDayCreate,
    WorkoutDayUpdate,
    WorkoutDayResponse,
    WorkoutExerciseCreate,
    WorkoutExerciseUpdate,
    WorkoutExerciseResponse,
    WorkoutSessionCreate,
    WorkoutSessionUpdate,
    WorkoutSessionResponse,
    SetCompletionCreate,
    SetCompletionResponse,
    PersonalRecordCreate,
    PersonalRecordResponse,
)
from app.schemas.workout import ExerciseResponse
from app.models.workout_system import (
    WorkoutPlanV2 as NewWorkoutPlan,
    WorkoutDay,
    WorkoutExerciseV2 as NewWorkoutExercise,
    WorkoutSessionV2 as NewWorkoutSession,
    SetCompletion,
    ExercisePersonalRecord,
    WorkoutSplitType,
    DayType,
)
from app.services.trainer_notification_helper import notify_trainer_immediate
from app.services.websocket_service import websocket_service
from app.models.workout import Exercise

router = APIRouter()

# ============ Exercise Metadata ============

@router.get("/exercises/{exercise_id}", response_model=ExerciseResponse)
def get_exercise_detail(
    exercise_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch exercise metadata for workout details."""
    exercise = db.query(Exercise).filter(Exercise.id == exercise_id).first()

    if not exercise:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")

    # Use from_attributes to automatically map all fields including image_path
    return ExerciseResponse.model_validate(exercise)

# ============ Workout Plan Endpoints ============

@router.post("/plans", response_model=WorkoutPlanResponse, status_code=status.HTTP_201_CREATED)
def create_workout_plan(
    plan_data: WorkoutPlanCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new workout plan (trainer only)"""
    if current_user.role != UserRole.TRAINER and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can create workout plans"
        )
    
    # Validate client exists and belongs to trainer (if trainer is creating)
    client = db.query(User).filter(User.id == plan_data.client_id).first()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    
    if client.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not a client"
        )
    
    # If trainer (not admin), verify client belongs to them
    if current_user.role == UserRole.TRAINER and client.trainer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found or not assigned to you"
        )
    
    # Enforce single active plan per client
    existing_plan = db.query(NewWorkoutPlan).filter(
        NewWorkoutPlan.client_id == plan_data.client_id,
        NewWorkoutPlan.is_active == True
    ).first()

    if existing_plan:
        if existing_plan.trainer_id != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Client already has an active workout plan assigned by another trainer"
            )

        updatable_fields = [
            "name",
            "description",
            "split_type",
            "days_per_week",
            "duration_weeks",
            "notes",
            "start_date",
            "end_date",
            "is_active",
        ]

        for field in updatable_fields:
            value = getattr(plan_data, field, None)
            if value is not None:
                setattr(existing_plan, field, value)

        existing_plan.trainer_id = current_user.id

        db.commit()
        db.refresh(existing_plan)
        return existing_plan

    # Create workout plan
    workout_plan = NewWorkoutPlan(
        client_id=plan_data.client_id,
        trainer_id=current_user.id,
        name=plan_data.name,
        description=plan_data.description,
        split_type=plan_data.split_type,
        days_per_week=plan_data.days_per_week,
        duration_weeks=plan_data.duration_weeks,
        is_active=plan_data.is_active,
        notes=plan_data.notes,
        start_date=plan_data.start_date,
        end_date=plan_data.end_date
    )
    
    db.add(workout_plan)
    db.commit()
    db.refresh(workout_plan)
    
    return workout_plan

@router.post("/plans/complete", response_model=WorkoutPlanResponse, status_code=status.HTTP_201_CREATED)
def create_complete_workout_plan(
    plan_data: CompleteWorkoutPlanCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a complete workout plan with all days and exercises at once (trainer only)"""
    if current_user.role != UserRole.TRAINER and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can create workout plans"
        )
    
    # Validate client exists and belongs to trainer (if trainer is creating)
    client = db.query(User).filter(User.id == plan_data.client_id).first()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    
    if client.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not a client"
        )
    
    # If trainer (not admin), verify client belongs to them
    if current_user.role == UserRole.TRAINER and client.trainer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found or not assigned to you"
        )
    
    existing_plan = db.query(NewWorkoutPlan).filter(
        NewWorkoutPlan.client_id == plan_data.client_id,
        NewWorkoutPlan.is_active == True
    ).options(joinedload(NewWorkoutPlan.workout_days)).first()

    if existing_plan:
        if existing_plan.trainer_id != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Client already has an active workout plan assigned by another trainer"
            )

        existing_plan.name = plan_data.name
        existing_plan.description = plan_data.description
        # Only update split_type if provided and valid enum value (to avoid NULL constraint issues)
        if plan_data.split_type is not None:
            try:
                # Try to convert to enum if it's a valid enum value
                if plan_data.split_type in [e.value for e in WorkoutSplitType]:
                    existing_plan.split_type = WorkoutSplitType(plan_data.split_type)
                else:
                    # If it's not a valid enum, set to CUSTOM to allow flexibility
                    existing_plan.split_type = WorkoutSplitType.CUSTOM
            except (ValueError, KeyError):
                existing_plan.split_type = WorkoutSplitType.CUSTOM
        existing_plan.days_per_week = plan_data.days_per_week
        existing_plan.duration_weeks = plan_data.duration_weeks
        existing_plan.notes = plan_data.notes
        existing_plan.trainer_id = current_user.id
        existing_plan.is_active = True

        # Remove existing days/exercises
        try:
            # Eagerly load exercises to avoid lazy loading issues
            existing_plan_with_exercises = db.query(NewWorkoutPlan).options(
                joinedload(NewWorkoutPlan.workout_days).joinedload(WorkoutDay.workout_exercises)
            ).filter(NewWorkoutPlan.id == existing_plan.id).first()
            
            if existing_plan_with_exercises and existing_plan_with_exercises.workout_days:
                for day in list(existing_plan_with_exercises.workout_days):
                    # Delete exercises first to avoid foreign key issues
                    if day.workout_exercises:
                        for exercise in list(day.workout_exercises):
                            db.delete(exercise)
                    db.delete(day)
            db.flush()
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update workout plan: {str(e)}"
            )

        target_plan = existing_plan
    else:
        # Use a default split_type if None to avoid NOT NULL constraint
        # SQLite doesn't allow NULL for this column even though model says nullable=True
        # Handle string split_type values - convert to enum if valid, otherwise use CUSTOM
        split_type_value = WorkoutSplitType.CUSTOM
        if plan_data.split_type is not None:
            try:
                # Try to convert to enum if it's a valid enum value
                if plan_data.split_type in [e.value for e in WorkoutSplitType]:
                    split_type_value = WorkoutSplitType(plan_data.split_type)
                else:
                    # If it's not a valid enum (e.g., workout split ID), use CUSTOM to allow flexibility
                    split_type_value = WorkoutSplitType.CUSTOM
            except (ValueError, KeyError):
                split_type_value = WorkoutSplitType.CUSTOM
        
        target_plan = NewWorkoutPlan(
            client_id=plan_data.client_id,
            trainer_id=current_user.id,
            name=plan_data.name,
            description=plan_data.description,
            split_type=split_type_value,
            days_per_week=plan_data.days_per_week,
            duration_weeks=plan_data.duration_weeks,
            notes=plan_data.notes,
            is_active=True
        )
        db.add(target_plan)
        db.flush()  # Get id
    
    # Create workout days
    for day_data in plan_data.workout_days:
        workout_day = WorkoutDay(
            workout_plan_id=target_plan.id,
            name=day_data.name,
            day_type=day_data.day_type,
            order_index=day_data.order_index,
            notes=day_data.notes,
            estimated_duration=getattr(day_data, "estimated_duration", None)
        )
        db.add(workout_day)
        db.flush()
        
        # Create workout exercises
        for exercise_data in day_data.exercises:
            workout_exercise = NewWorkoutExercise(
                workout_day_id=workout_day.id,
                exercise_id=exercise_data.exercise_id,
                order_index=exercise_data.order_index,
                group_name=getattr(exercise_data, "group_name", None),
                target_sets=exercise_data.target_sets,  # Don't force default, allow None
                target_reps=exercise_data.target_reps,  # Don't force default, allow None
                target_weight=exercise_data.target_weight,
                rest_seconds=exercise_data.rest_seconds,  # Don't force default, allow None
                tempo=exercise_data.tempo,
                notes=exercise_data.notes,  # Don't force default, allow None
                video_url=getattr(exercise_data, "video_url", None),
            )
            db.add(workout_exercise)
    
    try:
        db.commit()
        db.refresh(target_plan)
        
        # Manually serialize to convert exercise ORM objects to dicts
        from app.schemas.workout_system import WorkoutPlanResponse as WorkoutPlanResponseSchema
        from app.schemas.workout_system import WorkoutDayResponse, WorkoutExerciseResponse
        
        # Reload with relationships
        target_plan = db.query(NewWorkoutPlan).options(
            joinedload(NewWorkoutPlan.workout_days).joinedload(WorkoutDay.workout_exercises).joinedload(NewWorkoutExercise.exercise)
        ).filter(NewWorkoutPlan.id == target_plan.id).first()
        
        workout_days = []
        for day in target_plan.workout_days:
            exercises = []
            for ex in day.workout_exercises:
                exercise_dict = None
                if ex.exercise:
                    exercise_dict = {
                        "id": ex.exercise.id,
                        "name": ex.exercise.name,
                        "description": ex.exercise.description,
                        "muscle_group": ex.exercise.muscle_group,
                        "equipment": ex.exercise.equipment_needed,
                        "video_url": ex.exercise.video_url,
                    }
                exercises.append(WorkoutExerciseResponse(
                    id=ex.id,
                    workout_day_id=ex.workout_day_id,
                    exercise_id=ex.exercise_id,
                    order_index=ex.order_index,
                    group_name=ex.group_name,
                    target_sets=ex.target_sets,
                    target_reps=ex.target_reps,
                    target_weight=ex.target_weight,
                    rest_seconds=ex.rest_seconds,
                    tempo=ex.tempo,
                    notes=ex.notes,
                    video_url=ex.video_url,
                    created_at=ex.created_at,
                    exercise=exercise_dict
                ))
            workout_days.append(WorkoutDayResponse(
                id=day.id,
                workout_plan_id=day.workout_plan_id,
                name=day.name,
                day_type=day.day_type,
                order_index=day.order_index,
                notes=day.notes,
                estimated_duration=day.estimated_duration,
                created_at=day.created_at,
                workout_exercises=exercises
            ))
        
        return WorkoutPlanResponseSchema(
            id=target_plan.id,
            client_id=target_plan.client_id,
            trainer_id=target_plan.trainer_id,
            name=target_plan.name,
            description=target_plan.description,
            split_type=target_plan.split_type.value if target_plan.split_type else None,
            days_per_week=target_plan.days_per_week,
            duration_weeks=target_plan.duration_weeks,
            is_active=target_plan.is_active,
            notes=target_plan.notes,
            start_date=target_plan.start_date,
            end_date=target_plan.end_date,
            created_at=target_plan.created_at,
            updated_at=target_plan.updated_at,
            workout_days=workout_days
        )
    except Exception as e:
        db.rollback()
        import traceback
        error_detail = f"Failed to create workout plan: {str(e)}\n{traceback.format_exc()}"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": error_detail}
        )

@router.get("/plans", response_model=List[dict])
def get_workout_plans(
    client_id: int = None,
    active_only: bool = True,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get workout plans (trainers see their plans, admins see all, clients see their own)"""
    from app.models.user import User
    
    query = db.query(NewWorkoutPlan).options(
        joinedload(NewWorkoutPlan.workout_days).joinedload(WorkoutDay.workout_exercises)
    )
    
    if current_user.role == UserRole.CLIENT:
        query = query.filter(NewWorkoutPlan.client_id == current_user.id)
    elif current_user.role == UserRole.TRAINER:
        # If trainer queries with client_id, verify the client belongs to them
        if client_id:
            client = db.query(User).filter(User.id == client_id).first()
            if not client or client.trainer_id != current_user.id:
                raise HTTPException(status_code=403, detail="You can only view your clients' workout plans")
        query = query.filter(NewWorkoutPlan.trainer_id == current_user.id)
    # Admins see all
    
    if client_id:
        query = query.filter(NewWorkoutPlan.client_id == client_id)
    
    if active_only:
        query = query.filter(NewWorkoutPlan.is_active == True)
    
    plans = query.all()
    
    # Manually serialize to avoid enum serialization issues
    return [
        {
            "id": plan.id,
            "client_id": plan.client_id,
            "trainer_id": plan.trainer_id,
            "name": plan.name,
            "description": plan.description,
            "split_type": plan.split_type.value if plan.split_type and hasattr(plan.split_type, 'value') else (str(plan.split_type) if plan.split_type else None),
            "days_per_week": plan.days_per_week,
            "duration_weeks": plan.duration_weeks,
            "is_active": plan.is_active,
            "notes": plan.notes,
            "start_date": plan.start_date.isoformat() if plan.start_date else None,
            "end_date": plan.end_date.isoformat() if plan.end_date else None,
            "created_at": plan.created_at.isoformat() if plan.created_at else None,
            "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
            "workout_days": [
                {
                    "id": day.id,
                    "workout_plan_id": day.workout_plan_id,
                    "name": day.name,
                    "day_type": day.day_type.value if hasattr(day.day_type, 'value') else str(day.day_type),
                    "order_index": day.order_index,
                    "notes": day.notes,
                    "estimated_duration": day.estimated_duration,
                    "created_at": day.created_at.isoformat() if day.created_at else None,
                    "workout_exercises": [
                        {
                            "id": ex.id,
                            "workout_day_id": ex.workout_day_id,
                            "exercise_id": ex.exercise_id,
                            "order_index": ex.order_index,
                    "group_name": ex.group_name,
                            "target_sets": ex.target_sets,
                            "target_reps": ex.target_reps,
                            "target_weight": ex.target_weight,
                            "rest_seconds": ex.rest_seconds,
                            "tempo": ex.tempo,
                            "notes": ex.notes,
                    "video_url": ex.video_url,
                    "group_name": ex.group_name,
                            "created_at": ex.created_at.isoformat() if ex.created_at else None,
                            "exercise_name": ex.exercise.name if ex.exercise else None
                        }
                        for ex in day.workout_exercises
                    ]
                }
                for day in plan.workout_days
            ]
        }
        for plan in plans
    ]

@router.get("/plans/{plan_id}", response_model=WorkoutPlanResponse)
def get_workout_plan(
    plan_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific workout plan with all details"""
    workout_plan = db.query(NewWorkoutPlan).options(
        joinedload(NewWorkoutPlan.workout_days).joinedload(WorkoutDay.workout_exercises).joinedload(NewWorkoutExercise.exercise)
    ).filter(NewWorkoutPlan.id == plan_id).first()
    
    if not workout_plan:
        raise HTTPException(status_code=404, detail="Workout plan not found")
    
    # Check permissions
    if current_user.role == UserRole.CLIENT and workout_plan.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this workout plan")
    elif current_user.role == UserRole.TRAINER and workout_plan.trainer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this workout plan")
    
    # Manually serialize to convert exercise ORM objects to dicts
    from app.schemas.workout_system import WorkoutPlanResponse as WorkoutPlanResponseSchema
    from app.schemas.workout_system import WorkoutDayResponse, WorkoutExerciseResponse
    
    workout_days = []
    for day in workout_plan.workout_days:
        exercises = []
        for ex in day.workout_exercises:
            exercise_dict = None
            if ex.exercise:
                exercise_dict = {
                    "id": ex.exercise.id,
                    "name": ex.exercise.name,
                    "description": ex.exercise.description,
                    "muscle_group": ex.exercise.muscle_group,
                    "equipment": ex.exercise.equipment_needed,
                    "video_url": ex.exercise.video_url,
                }
            exercises.append(WorkoutExerciseResponse(
                id=ex.id,
                workout_day_id=ex.workout_day_id,
                exercise_id=ex.exercise_id,
                order_index=ex.order_index,
                group_name=ex.group_name,
                target_sets=ex.target_sets,
                target_reps=ex.target_reps,
                target_weight=ex.target_weight,
                rest_seconds=ex.rest_seconds,
                tempo=ex.tempo,
                notes=ex.notes,
                video_url=ex.video_url,
                created_at=ex.created_at,
                exercise=exercise_dict
            ))
        workout_days.append(WorkoutDayResponse(
            id=day.id,
            workout_plan_id=day.workout_plan_id,
            name=day.name,
            day_type=day.day_type,
            order_index=day.order_index,
            notes=day.notes,
            estimated_duration=day.estimated_duration,
            created_at=day.created_at,
            workout_exercises=exercises
        ))
    
    return WorkoutPlanResponseSchema(
        id=workout_plan.id,
        client_id=workout_plan.client_id,
        trainer_id=workout_plan.trainer_id,
        name=workout_plan.name,
        description=workout_plan.description,
        split_type=workout_plan.split_type.value if workout_plan.split_type else None,
        days_per_week=workout_plan.days_per_week,
        duration_weeks=workout_plan.duration_weeks,
        is_active=workout_plan.is_active,
        notes=workout_plan.notes,
        start_date=workout_plan.start_date,
        end_date=workout_plan.end_date,
        created_at=workout_plan.created_at,
        updated_at=workout_plan.updated_at,
        workout_days=workout_days
    )

@router.put("/plans/{plan_id}", response_model=WorkoutPlanResponse)
def update_workout_plan(
    plan_id: int,
    plan_data: WorkoutPlanUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a workout plan (trainer only)"""
    if current_user.role != UserRole.TRAINER and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only trainers can update workout plans")
    
    workout_plan = db.query(NewWorkoutPlan).options(
        joinedload(NewWorkoutPlan.workout_days).joinedload(WorkoutDay.workout_exercises).joinedload(NewWorkoutExercise.exercise)
    ).filter(NewWorkoutPlan.id == plan_id).first()
    
    if not workout_plan:
        raise HTTPException(status_code=404, detail="Workout plan not found")
    
    if current_user.role == UserRole.TRAINER and workout_plan.trainer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this workout plan")
    
    try:
        # Update fields
        for field, value in plan_data.dict(exclude_unset=True).items():
            setattr(workout_plan, field, value)
        
        db.commit()
        db.refresh(workout_plan)
        
        # Reload with relationships
        workout_plan = db.query(NewWorkoutPlan).options(
            joinedload(NewWorkoutPlan.workout_days).joinedload(WorkoutDay.workout_exercises).joinedload(NewWorkoutExercise.exercise)
        ).filter(NewWorkoutPlan.id == plan_id).first()
        
        # Manually serialize to convert exercise ORM objects to dicts
        from app.schemas.workout_system import WorkoutPlanResponse as WorkoutPlanResponseSchema
        from app.schemas.workout_system import WorkoutDayResponse, WorkoutExerciseResponse
        
        workout_days = []
        for day in workout_plan.workout_days:
            exercises = []
            for ex in day.workout_exercises:
                exercise_dict = None
                if ex.exercise:
                    exercise_dict = {
                        "id": ex.exercise.id,
                        "name": ex.exercise.name,
                        "description": ex.exercise.description,
                        "muscle_group": ex.exercise.muscle_group,
                        "equipment": ex.exercise.equipment_needed,
                        "video_url": ex.exercise.video_url,
                    }
                exercises.append(WorkoutExerciseResponse(
                    id=ex.id,
                    workout_day_id=ex.workout_day_id,
                    exercise_id=ex.exercise_id,
                    order_index=ex.order_index,
                    group_name=ex.group_name,
                    target_sets=ex.target_sets,
                    target_reps=ex.target_reps,
                    target_weight=ex.target_weight,
                    rest_seconds=ex.rest_seconds,
                    tempo=ex.tempo,
                    notes=ex.notes,
                    video_url=ex.video_url,
                    created_at=ex.created_at,
                    exercise=exercise_dict
                ))
            workout_days.append(WorkoutDayResponse(
                id=day.id,
                workout_plan_id=day.workout_plan_id,
                name=day.name,
                day_type=day.day_type,
                order_index=day.order_index,
                notes=day.notes,
                estimated_duration=day.estimated_duration,
                created_at=day.created_at,
                workout_exercises=exercises
            ))
        
        return WorkoutPlanResponseSchema(
            id=workout_plan.id,
            client_id=workout_plan.client_id,
            trainer_id=workout_plan.trainer_id,
            name=workout_plan.name,
            description=workout_plan.description,
            split_type=workout_plan.split_type.value if workout_plan.split_type else None,
            days_per_week=workout_plan.days_per_week,
            duration_weeks=workout_plan.duration_weeks,
            is_active=workout_plan.is_active,
            notes=workout_plan.notes,
            start_date=workout_plan.start_date,
            end_date=workout_plan.end_date,
            created_at=workout_plan.created_at,
            updated_at=workout_plan.updated_at,
            workout_days=workout_days
        )
    except Exception as e:
        db.rollback()
        import traceback
        error_detail = f"Failed to update workout plan: {str(e)}\n{traceback.format_exc()}"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": error_detail}
        )

@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout_plan(
    plan_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a workout plan (trainer only)"""
    if current_user.role != UserRole.TRAINER and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only trainers can delete workout plans")
    
    workout_plan = db.query(NewWorkoutPlan).filter(NewWorkoutPlan.id == plan_id).first()
    
    if not workout_plan:
        raise HTTPException(status_code=404, detail="Workout plan not found")
    
    if current_user.role == UserRole.TRAINER and workout_plan.trainer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this workout plan")
    
    db.delete(workout_plan)
    db.commit()
    
    return None

# ============ Workout Day Endpoints ============

@router.post("/plans/{plan_id}/days", response_model=WorkoutDayResponse, status_code=status.HTTP_201_CREATED)
def add_workout_day(
    plan_id: int,
    day_data: WorkoutDayCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a workout day to a plan (trainer only)"""
    if current_user.role != UserRole.TRAINER and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only trainers can add workout days")
    
    # Verify plan exists and trainer owns it
    workout_plan = db.query(NewWorkoutPlan).filter(NewWorkoutPlan.id == plan_id).first()
    if not workout_plan:
        raise HTTPException(status_code=404, detail="Workout plan not found")
    
    if current_user.role == UserRole.TRAINER and workout_plan.trainer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    workout_day = WorkoutDay(
        workout_plan_id=plan_id,
        name=day_data.name,
        day_type=day_data.day_type,
        order_index=day_data.order_index,
        notes=day_data.notes,
        estimated_duration=day_data.estimated_duration
    )
    
    db.add(workout_day)
    db.commit()
    db.refresh(workout_day)
    
    return workout_day

@router.get("/days/{day_id}")
def get_workout_day(
    day_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific workout day with all exercises"""
    workout_day = db.query(WorkoutDay).options(
        joinedload(WorkoutDay.workout_exercises).joinedload(NewWorkoutExercise.exercise)
    ).filter(WorkoutDay.id == day_id).first()
    
    if not workout_day:
        raise HTTPException(status_code=404, detail="Workout day not found")
    
    # Check permissions - verify user has access to the plan
    workout_plan = db.query(NewWorkoutPlan).filter(NewWorkoutPlan.id == workout_day.workout_plan_id).first()
    if not workout_plan:
        raise HTTPException(status_code=404, detail="Workout plan not found")
    
    if current_user.role == UserRole.CLIENT and workout_plan.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this workout day")
    elif current_user.role == UserRole.TRAINER and workout_plan.trainer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this workout day")
    
    # Manually serialize everything to avoid ORM object issues
    exercises_data = []
    for ex in workout_day.workout_exercises:
        exercise_dict = None
        if ex.exercise:
            exercise_dict = {
                "id": ex.exercise.id,
                "name": ex.exercise.name,
                "description": ex.exercise.description,
                "video_url": ex.exercise.video_url,
                "muscle_group": ex.exercise.muscle_group,
                "equipment_needed": ex.exercise.equipment_needed,
                "instructions": ex.exercise.instructions,
            }
        
        exercises_data.append({
            "id": ex.id,
            "workout_day_id": ex.workout_day_id,
            "exercise_id": ex.exercise_id,
            "order_index": ex.order_index,
            "group_name": ex.group_name,
            "target_sets": ex.target_sets,
            "target_reps": ex.target_reps,
            "target_weight": ex.target_weight,
            "rest_seconds": ex.rest_seconds,
            "tempo": ex.tempo,
            "notes": ex.notes,
            "video_url": ex.video_url,
            "created_at": ex.created_at.isoformat() if ex.created_at else None,
            "exercise": exercise_dict,
        })
    
    # Return as JSON to bypass response model validation issues (include plan name for day page header)
    day_dict = {
        "id": workout_day.id,
        "workout_plan_id": workout_day.workout_plan_id,
        "name": workout_day.name,
        "workout_plan_name": workout_plan.name if workout_plan else None,
        "day_type": workout_day.day_type.value if workout_day.day_type and hasattr(workout_day.day_type, 'value') else (str(workout_day.day_type) if workout_day.day_type else None),
        "order_index": workout_day.order_index,
        "notes": workout_day.notes,
        "estimated_duration": workout_day.estimated_duration,
        "created_at": workout_day.created_at.isoformat() if workout_day.created_at else None,
        "workout_exercises": exercises_data,
    }
    return JSONResponse(content=day_dict)

@router.put("/days/{day_id}", response_model=WorkoutDayResponse)
def update_workout_day(
    day_id: int,
    day_data: WorkoutDayUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a workout day (trainer only)"""
    if current_user.role != UserRole.TRAINER and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only trainers can update workout days")
    
    workout_day = db.query(WorkoutDay).filter(WorkoutDay.id == day_id).first()
    
    if not workout_day:
        raise HTTPException(status_code=404, detail="Workout day not found")
    
    for field, value in day_data.dict(exclude_unset=True).items():
        setattr(workout_day, field, value)
    
    db.commit()
    db.refresh(workout_day)
    
    return workout_day

# ============ Workout Exercise Endpoints ============

@router.post("/days/{day_id}/exercises", response_model=WorkoutExerciseResponse, status_code=status.HTTP_201_CREATED)
def add_workout_exercise(
    day_id: int,
    exercise_data: WorkoutExerciseCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add an exercise to a workout day (trainer only)"""
    if current_user.role != UserRole.TRAINER and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only trainers can add exercises")
    
    # Verify exercise exists
    exercise = db.query(Exercise).filter(Exercise.id == exercise_data.exercise_id).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    
    workout_exercise = NewWorkoutExercise(
        workout_day_id=day_id,
        exercise_id=exercise_data.exercise_id,
        order_index=exercise_data.order_index,
        group_name=getattr(exercise_data, "group_name", None),
        target_sets=exercise_data.target_sets or 3,
        target_reps=exercise_data.target_reps or '',
        target_weight=exercise_data.target_weight,
        rest_seconds=exercise_data.rest_seconds or 90,
        tempo=exercise_data.tempo,
        notes=exercise_data.notes or '',
        video_url=getattr(exercise_data, "video_url", None),
    )
    
    db.add(workout_exercise)
    db.commit()
    db.refresh(workout_exercise)
    
    return workout_exercise

@router.put("/exercises/{exercise_id}", response_model=WorkoutExerciseResponse)
def update_workout_exercise(
    exercise_id: int,
    exercise_data: WorkoutExerciseUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a workout exercise (trainer only)"""
    if current_user.role != UserRole.TRAINER and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only trainers can update exercises")
    
    workout_exercise = db.query(NewWorkoutExercise).filter(NewWorkoutExercise.id == exercise_id).first()
    
    if not workout_exercise:
        raise HTTPException(status_code=404, detail="Workout exercise not found")
    
    for field, value in exercise_data.dict(exclude_unset=True).items():
        if field == "target_sets" and value is None:
            value = 3
        if field == "target_reps" and value is None:
            value = ""
        if field == "rest_seconds" and value is None:
            value = 90
        setattr(workout_exercise, field, value)
    
    db.commit()
    db.refresh(workout_exercise)
    
    return workout_exercise

@router.delete("/exercises/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout_exercise(
    exercise_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a workout exercise (trainer only)"""
    if current_user.role != UserRole.TRAINER and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only trainers can delete exercises")
    
    workout_exercise = db.query(NewWorkoutExercise).filter(NewWorkoutExercise.id == exercise_id).first()
    
    if not workout_exercise:
        raise HTTPException(status_code=404, detail="Workout exercise not found")
    
    db.delete(workout_exercise)
    db.commit()
    
    return None

# ============ Workout Session Endpoints (for client tracking) ============

@router.post("/sessions", response_model=WorkoutSessionResponse, status_code=status.HTTP_201_CREATED)
def start_workout_session(
    session_data: WorkoutSessionCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start a new workout session (client only)"""
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Only clients can start workout sessions")
    
    session = NewWorkoutSession(
        client_id=current_user.id,
        workout_day_id=session_data.workout_day_id,
        started_at=session_data.started_at
    )
    
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return session

@router.put("/sessions/{session_id}", response_model=WorkoutSessionResponse)
def update_workout_session(
    session_id: int,
    session_data: WorkoutSessionUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a workout session (client only)"""
    session = db.query(NewWorkoutSession).filter(NewWorkoutSession.id == session_id).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Workout session not found")
    
    if current_user.role == UserRole.CLIENT and session.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    for field, value in session_data.model_dump(exclude_unset=True).items():
        setattr(session, field, value)

    db.commit()
    db.refresh(session)

    background_tasks = BackgroundTasks()
    if getattr(session_data, "is_completed", None) is True and session.is_completed:
        client = db.query(User).filter(User.id == session.client_id).first()
        client_name = (client.full_name or client.username) if client else "Client"
        created = notify_trainer_immediate(
            db,
            session.client_id,
            title="Training completed",
            message=f"{client_name} completed a workout",
            event_type="training_completion",
            notification_type="success",
        )
        if created:
            background_tasks.add_task(websocket_service.send_new_notification_hint, created.recipient_id)

    body = WorkoutSessionResponse.model_validate(session)
    return JSONResponse(content=body.model_dump(mode="json"), background=background_tasks)

@router.get("/sessions", response_model=List[WorkoutSessionResponse])
def get_workout_sessions(
    client_id: int = None,
    workout_day_id: int = None,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get workout sessions (trainers see their clients, clients see their own)"""
    query = db.query(NewWorkoutSession)
    
    if current_user.role == UserRole.CLIENT:
        query = query.filter(NewWorkoutSession.client_id == current_user.id)
    elif current_user.role == UserRole.TRAINER and client_id:
        query = query.filter(NewWorkoutSession.client_id == client_id)
    # Admins see all
    
    # Filter by workout_day_id if provided
    if workout_day_id is not None:
        query = query.filter(NewWorkoutSession.workout_day_id == workout_day_id)
    
    return query.all()

# ============ Set Completion Endpoints (for client tracking) ============

@router.post("/sessions/{session_id}/sets", response_model=SetCompletionResponse, status_code=status.HTTP_201_CREATED)
def record_set_completion(
    session_id: int,
    set_data: SetCompletionCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Record a completed set (client only)"""
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Only clients can record set completions")
    
    set_completion = SetCompletion(
        workout_session_id=session_id,
        workout_exercise_id=set_data.workout_exercise_id,
        client_id=current_user.id,
        set_number=set_data.set_number,
        reps_completed=set_data.reps_completed,
        weight_used=set_data.weight_used,
        rest_taken=set_data.rest_taken,
        rpe=set_data.rpe,
        form_rating=set_data.form_rating,
        notes=set_data.notes
    )
    
    db.add(set_completion)
    db.commit()
    db.refresh(set_completion)
    
    return set_completion

# ============ Personal Record Endpoints ============

@router.post("/set-completions", response_model=SetCompletionResponse, status_code=status.HTTP_201_CREATED)
def create_set_completion_direct(
    set_data: SetCompletionCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a set completion directly (simplified endpoint for clients)"""
    # Create or get today's workout session
    from datetime import datetime
    today = datetime.now().date()
    
    # Get the workout exercise to find the workout day
    workout_exercise = db.query(NewWorkoutExercise).filter(
        NewWorkoutExercise.id == set_data.workout_exercise_id
    ).first()
    
    if not workout_exercise:
        raise HTTPException(status_code=404, detail="Workout exercise not found")
    
    # Find or create workout session for today
    workout_session = db.query(NewWorkoutSession).filter(
        NewWorkoutSession.client_id == current_user.id,
        NewWorkoutSession.workout_day_id == workout_exercise.workout_day_id,
        func.date(NewWorkoutSession.started_at) == today
    ).first()
    
    if not workout_session:
        workout_session = NewWorkoutSession(
            client_id=current_user.id,
            workout_day_id=workout_exercise.workout_day_id,
            started_at=datetime.now(),
            is_completed=False
        )
        db.add(workout_session)
        db.commit()
        db.refresh(workout_session)
    
    # Create set completion
    set_completion = SetCompletion(
        workout_session_id=workout_session.id,
        workout_exercise_id=set_data.workout_exercise_id,
        client_id=current_user.id,
        set_number=set_data.set_number,
        reps_completed=set_data.reps_completed,
        weight_used=set_data.weight_used,
        rest_taken=set_data.rest_taken,
        rpe=set_data.rpe,
        form_rating=set_data.form_rating,
        notes=set_data.notes,
        completed_at=set_data.completed_at or datetime.now()
    )
    
    db.add(set_completion)
    db.commit()
    db.refresh(set_completion)
    
    return set_completion

@router.get("/set-completions", response_model=List[SetCompletionResponse])
def get_set_completions(
    client_id: int = None,
    workout_exercise_id: int = None,
    date: str = None,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get set completions"""
    from datetime import datetime
    
    query = db.query(SetCompletion)
    
    if current_user.role == UserRole.CLIENT:
        query = query.filter(SetCompletion.client_id == current_user.id)
    elif client_id:
        query = query.filter(SetCompletion.client_id == client_id)
    
    if workout_exercise_id:
        query = query.filter(SetCompletion.workout_exercise_id == workout_exercise_id)
    
    if date:
        target_date = datetime.fromisoformat(date.replace('Z', '+00:00')).date()
        query = query.filter(func.date(SetCompletion.completed_at) == target_date)
    
    return query.all()

@router.delete("/set-completions/{completion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_set_completion(
    completion_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a set completion"""
    set_completion = db.query(SetCompletion).filter(SetCompletion.id == completion_id).first()
    
    if not set_completion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Set completion not found"
        )
    
    # Check permissions - clients can only delete their own, trainers/admins can delete any
    if current_user.role == UserRole.CLIENT and set_completion.client_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this set completion"
        )
    
    db.delete(set_completion)
    db.commit()
    
    return None

@router.post("/prs", response_model=PersonalRecordResponse, status_code=status.HTTP_201_CREATED)
def record_personal_record(
    pr_data: PersonalRecordCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Record a personal record (client or trainer on behalf of client)"""
    pr = ExercisePersonalRecord(
        client_id=current_user.id if current_user.role == UserRole.CLIENT else pr_data.client_id,
        exercise_id=pr_data.exercise_id,
        pr_type=pr_data.pr_type,
        weight=pr_data.weight,
        reps=pr_data.reps,
        date_achieved=pr_data.date_achieved,
        set_completion_id=pr_data.set_completion_id,
        notes=pr_data.notes
    )
    
    db.add(pr)
    db.commit()
    db.refresh(pr)
    
    return pr

@router.get("/prs", response_model=List[PersonalRecordResponse])
def get_personal_records(
    client_id: int = None,
    exercise_id: int = None,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get personal records"""
    query = db.query(ExercisePersonalRecord)
    
    if current_user.role == UserRole.CLIENT:
        query = query.filter(ExercisePersonalRecord.client_id == current_user.id)
    elif client_id:
        query = query.filter(ExercisePersonalRecord.client_id == client_id)
    
    if exercise_id:
        query = query.filter(ExercisePersonalRecord.exercise_id == exercise_id)
    
    return query.all()

