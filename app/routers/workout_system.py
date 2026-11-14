"""
API endpoints for the new workout system
Trainers can create workout plans with splits (Push/Pull/Legs) and detailed tracking
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List
from datetime import datetime, timezone

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

_LIB_INDEX = None


def _library_muscles(library_id, with_details: bool = False) -> dict:
    """Muscles (and, for the day view, level / equipment / instructions) of a free-exercise-db exercise.

    Additive fields for the trainee app body map; empty when the exercise is not from the library.
    """
    global _LIB_INDEX
    if not library_id or str(library_id).startswith("wger:"):
        return {}
    if _LIB_INDEX is None:
        try:
            from app.routers.exercise_library import _library
            _LIB_INDEX = {e["id"]: e for e in _library()}
        except Exception:
            _LIB_INDEX = {}
    e = _LIB_INDEX.get(library_id)
    if not e:
        return {}
    out = {"primary_muscles": e.get("primaryMuscles", []), "secondary_muscles": e.get("secondaryMuscles", [])}
    if with_details:
        out.update({"level": e.get("level"), "equipment": e.get("equipment"), "mechanic": e.get("mechanic"),
                    "library_instructions": e.get("instructions", [])})
    return out


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

def _archive_plan(db: Session, plan, cache: dict):
    """Inactive plan that keeps removed days / exercises with logged history (never deleted, A2A cross B1)."""
    if "__plan__" in cache:
        return cache["__plan__"]
    archive = db.query(NewWorkoutPlan).filter(
        NewWorkoutPlan.client_id == plan.client_id,
        NewWorkoutPlan.is_active == False,  # noqa: E712
        NewWorkoutPlan.name == "__history__",
    ).first()
    if not archive:
        archive = NewWorkoutPlan(
            client_id=plan.client_id, trainer_id=plan.trainer_id, name="__history__",
            description="Days and exercises removed from earlier plans, kept for the client's history",
            split_type=WorkoutSplitType.CUSTOM, is_active=False,
        )
        db.add(archive)
        db.flush()
    cache["__plan__"] = archive
    return archive


def _archive_day(db: Session, plan, day_name: str, cache: dict):
    """Day of the archive plan (same name as the day an exercise was removed from)."""
    key = day_name
    if key in cache:
        return cache[key]
    archive = _archive_plan(db, plan, cache)
    day = db.query(WorkoutDay).filter(WorkoutDay.workout_plan_id == archive.id, WorkoutDay.name == day_name).first()
    if not day:
        n = db.query(WorkoutDay).filter(WorkoutDay.workout_plan_id == archive.id).count()
        day = WorkoutDay(workout_plan_id=archive.id, name=day_name, order_index=n)
        db.add(day)
        db.flush()
    cache[key] = day
    return day


def _sync_plan_days(db: Session, plan, days_in) -> None:
    """Update the plan's days and exercises IN PLACE. Deleting and recreating them cascaded to every workout session
    and logged set of the client (history wiped on each plan save, A2A cross B1). Days / exercises are matched by id,
    then by position / exercise; anything removed that has history moves to an inactive archive plan instead."""
    existing_days = sorted(
        db.query(WorkoutDay).filter(WorkoutDay.workout_plan_id == plan.id).all(), key=lambda d: d.order_index or 0
    )
    by_id = {d.id: d for d in existing_days}
    original_names = {d.id: d.name for d in existing_days}
    used = set()
    cache: dict = {}
    pairs = []
    # Clients that send day ids (current builder): a day without an id is NEW — never reuse a removed day for it, or
    # that day's past sessions would be renamed (r2 R1). Legacy payloads without any id: match by name, then position.
    with_ids = any(getattr(d, "id", None) for d in days_in)
    for i, day_in in enumerate(days_in):
        day = by_id.get(getattr(day_in, "id", None) or -1)
        if day is not None and day.id in used:
            day = None
        if day is None and not with_ids:
            day = next((d for d in existing_days if d.id not in used and d.name == day_in.name), None)
            if day is None:
                day = next((d for d in existing_days if d.id not in used and (d.order_index == day_in.order_index or d.order_index == i)), None)
        if day is None:
            day = WorkoutDay(workout_plan_id=plan.id, name=day_in.name, order_index=day_in.order_index)
            db.add(day)
            db.flush()
        used.add(day.id)
        pairs.append((day, day_in))

    for d in existing_days:
        if d.id in used:
            continue
        has_history = db.query(NewWorkoutSession).filter(NewWorkoutSession.workout_day_id == d.id).first() is not None
        if has_history:
            # the whole day (with its exercises and sessions) moves to the archive plan
            d.workout_plan_id = _archive_plan(db, plan, cache).id
        else:
            db.delete(d)

    for day, day_in in pairs:
        day.name = day_in.name
        day.day_type = day_in.day_type
        day.order_index = day_in.order_index
        day.notes = day_in.notes
        day.estimated_duration = getattr(day_in, "estimated_duration", None)
        current = list(db.query(NewWorkoutExercise).filter(NewWorkoutExercise.workout_day_id == day.id).all())
        cur_by_id = {e.id: e for e in current}
        taken = set()
        for ex_in in day_in.exercises:
            ex = cur_by_id.get(getattr(ex_in, "id", None) or -1)
            if ex is None or ex.id in taken:
                ex = next((e for e in current if e.id not in taken and e.exercise_id == ex_in.exercise_id), None)
            if ex is None:
                ex = NewWorkoutExercise(workout_day_id=day.id, exercise_id=ex_in.exercise_id, order_index=ex_in.order_index)
                db.add(ex)
            if ex.id is not None:
                taken.add(ex.id)
            ex.exercise_id = ex_in.exercise_id
            ex.order_index = ex_in.order_index
            ex.group_name = getattr(ex_in, "group_name", None)
            ex.target_sets = ex_in.target_sets
            ex.target_reps = ex_in.target_reps
            ex.target_weight = ex_in.target_weight
            ex.rest_seconds = ex_in.rest_seconds
            ex.tempo = ex_in.tempo
            ex.notes = ex_in.notes
            ex.video_url = getattr(ex_in, "video_url", None)
        for e in current:
            if e.id in taken:
                continue
            if db.query(SetCompletion).filter(SetCompletion.workout_exercise_id == e.id).first() is not None:
                e.workout_day_id = _archive_day(db, plan, original_names.get(day.id, day.name), cache).id
            else:
                db.delete(e)
    db.flush()


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
    
    _sync_plan_days(db, target_plan, plan_data.workout_days)

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
    include_history: bool = False,
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
    
    # the history archive (removed days / exercises with logged sets) is not a plan anyone picks
    # (history screens ask for it with include_history=true to name exercises removed from the plan, r2 R2)
    plans = [p for p in query.all() if include_history or p.name != "__history__"]
    
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
                    "day_type": day.day_type.value if hasattr(day.day_type, 'value') else (day.day_type or None),
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
                            "exercise_name": ex.exercise.name if ex.exercise else None,
                            "exercise": {
                                "id": ex.exercise.id,
                                "name": ex.exercise.name,
                                "muscle_group": ex.exercise.muscle_group,
                                "image_path": ex.exercise.image_path,
                                "library_id": getattr(ex.exercise, "library_id", None),
                                **_library_muscles(getattr(ex.exercise, "library_id", None)),
                            } if ex.exercise else None,
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
                "image_path": ex.exercise.image_path,
                "library_id": getattr(ex.exercise, "library_id", None),
                **_library_muscles(getattr(ex.exercise, "library_id", None), with_details=True),
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
        # aware timestamps from the app (ISO with Z) are stored as naive UTC like the rest of the database
        if isinstance(value, datetime) and value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
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
        if client and client.trainer_id:
            background_tasks.add_task(websocket_service.send_live_refresh, client.trainer_id, "workout")

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
    elif current_user.role == UserRole.TRAINER:
        # A trainer only ever sees their own clients' sessions (was: everyone's, r2 N2)
        own_ids = [u.id for u in db.query(User.id).filter(User.trainer_id == current_user.id).all()]
        if client_id is not None:
            if client_id not in own_ids:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your client")
            query = query.filter(NewWorkoutSession.client_id == client_id)
        else:
            query = query.filter(NewWorkoutSession.client_id.in_(own_ids or [-1]))
    elif client_id is not None:
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
    owned = db.query(NewWorkoutSession).filter(NewWorkoutSession.id == session_id, NewWorkoutSession.client_id == current_user.id).first()
    if not owned:
        raise HTTPException(status_code=404, detail="Session not found")
    
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
        notes=set_data.notes,
        performed_exercise_name=set_data.performed_exercise_name,
        performed_library_id=set_data.performed_library_id,
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
    from datetime import datetime, timezone
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
            started_at=datetime.utcnow(),  # UTC like every other stored timestamp (A2A cross M2)
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
        completed_at=(set_data.completed_at.astimezone(timezone.utc).replace(tzinfo=None) if set_data.completed_at and set_data.completed_at.tzinfo else set_data.completed_at) or datetime.utcnow(),
        performed_exercise_name=set_data.performed_exercise_name,
        performed_library_id=set_data.performed_library_id,
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
    elif current_user.role == UserRole.TRAINER:
        if not client_id:
            raise HTTPException(status_code=400, detail="client_id is required")
        client = db.query(User).filter(User.id == client_id).first()
        if not client or client.trainer_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only view your clients' set completions")
        query = query.filter(SetCompletion.client_id == client_id)
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



def ensure_set_substitution_columns(engine) -> None:
    """Additive migration: set_completions_v2.performed_* (SQLite and Postgres, idempotent)."""
    import logging
    from sqlalchemy import inspect, text
    try:
        insp = inspect(engine)
        if "set_completions_v2" not in insp.get_table_names():
            return
        cols = {c["name"] for c in insp.get_columns("set_completions_v2")}
        with engine.begin() as conn:
            if "performed_exercise_name" not in cols:
                conn.execute(text("ALTER TABLE set_completions_v2 ADD COLUMN performed_exercise_name VARCHAR(200)"))
            if "performed_library_id" not in cols:
                conn.execute(text("ALTER TABLE set_completions_v2 ADD COLUMN performed_library_id VARCHAR(120)"))
    except Exception as e:  # never block startup
        logging.getLogger(__name__).error("set substitution migration failed: %s", e)


from app.database import engine as _ws_engine  # noqa: E402

ensure_set_substitution_columns(_ws_engine)
