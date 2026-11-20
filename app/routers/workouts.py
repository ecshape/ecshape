from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import json

from app.database import get_db
from app.services.workout_service import WorkoutService
from app.auth.utils import get_current_user
from app.models.user import User
from app.schemas.auth import UserResponse, UserRole
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
from app.models.workout import MuscleGroup, WorkoutPlan
from app.auth.access import (
    require_trainer_of, require_plan_access, require_client_access, visible_client_ids, is_client, is_trainer, not_found,
)
from app.models.workout import WorkoutSession as _WSession, WorkoutExercise as _WExercise, ExerciseCompletion as _WCompletion


# ---- tenant guards (audit 2026-11, F-04): every id is checked against the caller's trainer / client
def _plan_guard(db, user, plan_id, write=False):
    plan = db.query(WorkoutPlan).filter(WorkoutPlan.id == plan_id).first()
    if not plan:
        raise not_found("Workout plan not found")
    require_plan_access(db, user, plan.trainer_id, plan.client_id, write=write, detail="Workout plan not found")
    return plan


def _session_guard(db, user, session_id, write=False):
    s = db.query(_WSession).filter(_WSession.id == session_id).first()
    if not s:
        raise not_found("Workout session not found")
    _plan_guard(db, user, s.workout_plan_id, write)
    return s


def _wexercise_guard(db, user, workout_exercise_id, write=False):
    w = db.query(_WExercise).filter(_WExercise.id == workout_exercise_id).first()
    if not w:
        raise not_found("Workout exercise not found")
    _session_guard(db, user, w.workout_session_id, write)
    return w


def _completion_guard(db, user, completion_id, write=False):
    c = db.query(_WCompletion).filter(_WCompletion.id == completion_id).first()
    if not c:
        raise not_found("Exercise completion not found")
    if write and not is_client(user):
        require_trainer_of(db, user, c.client_id, detail="Exercise completion not found")
    else:
        require_client_access(db, user, c.client_id, detail="Exercise completion not found")
    return c


def _own_exercise_slot(db, user, workout_exercise_id):
    """A client logs completions only against exercises of their own plan."""
    w = db.query(_WExercise).filter(_WExercise.id == workout_exercise_id).first()
    if not w:
        raise not_found("Workout exercise not found")
    s = db.query(_WSession).filter(_WSession.id == w.workout_session_id).first()
    plan = db.query(WorkoutPlan).filter(WorkoutPlan.id == s.workout_plan_id).first() if s else None
    if not plan or plan.client_id != user.id:
        raise not_found("Workout exercise not found")


router = APIRouter(tags=["workouts"])

# Exercise Bank Endpoints
@router.post("/exercises", response_model=ExerciseResponse, status_code=status.HTTP_201_CREATED)
def create_exercise(
    exercise_data: ExerciseCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new exercise in the trainer's exercise bank."""
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can create exercises"
        )
    
    workout_service = WorkoutService(db)
    return workout_service.create_exercise(exercise_data, current_user.id)

@router.get("/exercises", response_model=List[ExerciseResponse])
def get_exercises(
    trainer_id: Optional[int] = Query(None, description="Filter by trainer ID"),
    muscle_group: Optional[MuscleGroup] = Query(None, description="Filter by muscle group"),
    search: Optional[str] = Query(None, description="Search in exercise name, description, or instructions"),
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(1000, ge=1, le=10000, description="Page size"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get exercises with filtering and pagination. All trainers can see all exercises."""
    workout_service = WorkoutService(db)
    
    # For trainers, don't filter by trainer_id unless explicitly requested
    # This ensures all trainers have access to all exercises
    filter_params = ExerciseFilter(
        trainer_id=trainer_id,  # Only filter if explicitly provided
        muscle_group=muscle_group,
        search=search,
        page=page,
        size=size
    )
    
    exercises, total = workout_service.get_exercises(filter_params)
    
    # Add pagination headers
    from fastapi.responses import Response
    response = Response()
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Size"] = str(size)
    
    return exercises

@router.get("/exercises/{exercise_id}", response_model=ExerciseResponse)
def get_exercise(
    exercise_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific exercise by ID."""
    workout_service = WorkoutService(db)
    exercise = workout_service.get_exercise(exercise_id)
    
    if not exercise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found"
        )
    
    return exercise

@router.put("/exercises/{exercise_id}", response_model=ExerciseResponse)
def update_exercise(
    exercise_id: int,
    exercise_data: ExerciseUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an exercise (only by the trainer who created it)."""
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can update exercises"
        )
    
    workout_service = WorkoutService(db)
    exercise = workout_service.update_exercise(exercise_id, exercise_data, current_user.id)
    
    if not exercise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found or you don't have permission to update it"
        )
    
    return exercise

@router.delete("/exercises/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise(
    exercise_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an exercise (only by the trainer who created it)."""
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can delete exercises"
        )
    
    workout_service = WorkoutService(db)
    success = workout_service.delete_exercise(exercise_id, current_user.id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found or you don't have permission to delete it"
        )

# Workout Plan Endpoints
@router.post("/plans", response_model=WorkoutPlanResponse, status_code=status.HTTP_201_CREATED)
def create_workout_plan(
    workout_plan_data: WorkoutPlanCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new workout plan for a client."""
    require_trainer_of(db, current_user, workout_plan_data.client_id)
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can create workout plans"
        )
    
    workout_service = WorkoutService(db)
    existing_plan = db.query(WorkoutPlan).filter(
        WorkoutPlan.client_id == workout_plan_data.client_id
    ).first()

    if existing_plan:
        if existing_plan.trainer_id != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Client already has a workout plan assigned by another trainer",
            )

        updatable_fields = ["name", "description", "start_date", "end_date"]
        for field in updatable_fields:
            setattr(existing_plan, field, getattr(workout_plan_data, field))

        existing_plan.trainer_id = current_user.id
        db.commit()
        db.refresh(existing_plan)

        refreshed_plan = workout_service.get_workout_plan(existing_plan.id)
        if not refreshed_plan:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to refresh workout plan",
            )

        return refreshed_plan

    return workout_service.create_workout_plan(workout_plan_data, current_user.id)

@router.get("/plans", response_model=List[WorkoutPlanResponse])
def get_workout_plans(
    trainer_id: Optional[int] = Query(None, description="Filter by trainer ID"),
    client_id: Optional[int] = Query(None, description="Filter by client ID"),
    search: Optional[str] = Query(None, description="Search in plan name or description"),
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get workout plans with filtering and pagination."""
    if is_trainer(current_user):
        trainer_id = current_user.id
        if client_id is not None:
            require_trainer_of(db, current_user, client_id)
    workout_service = WorkoutService(db)
    
    # If user is a client, only show their plans
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        client_id = current_user.id
    
    filter_params = WorkoutPlanFilter(
        trainer_id=trainer_id,
        client_id=client_id,
        search=search,
        page=page,
        size=size
    )
    
    workout_plans, total = workout_service.get_workout_plans(filter_params)
    
    # Add pagination headers
    from fastapi.responses import Response
    response = Response()
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Size"] = str(size)
    
    return workout_plans

@router.get("/plans/{workout_plan_id}", response_model=WorkoutPlanResponse)
def get_workout_plan(
    workout_plan_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific workout plan by ID."""
    _plan_guard(db, current_user, workout_plan_id)
    workout_service = WorkoutService(db)
    workout_plan = workout_service.get_workout_plan(workout_plan_id)
    
    if not workout_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout plan not found"
        )
    
    # Check permissions
    if current_user.role not in ["TRAINER", "ADMIN"] and workout_plan.client_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view this workout plan"
        )
    
    return workout_plan

@router.get("/plans/{workout_plan_id}/complete", response_model=CompleteWorkoutPlanResponse)
def get_complete_workout_plan(
    workout_plan_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a complete workout plan with all sessions and exercises."""
    _plan_guard(db, current_user, workout_plan_id)
    workout_service = WorkoutService(db)
    workout_plan = workout_service.get_complete_workout_plan(workout_plan_id)
    
    if not workout_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout plan not found"
        )
    
    # Check permissions
    if current_user.role not in ["TRAINER", "ADMIN"] and workout_plan.client_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view this workout plan"
        )
    
    return workout_plan

@router.put("/plans/{workout_plan_id}", response_model=WorkoutPlanResponse)
def update_workout_plan(
    workout_plan_id: int,
    workout_plan_data: WorkoutPlanUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a workout plan."""
    _plan_guard(db, current_user, workout_plan_id, write=True)
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can update workout plans"
        )
    
    workout_service = WorkoutService(db)
    workout_plan = workout_service.update_workout_plan(workout_plan_id, workout_plan_data)
    
    if not workout_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout plan not found"
        )
    
    return workout_plan

@router.delete("/plans/{workout_plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout_plan(
    workout_plan_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a workout plan."""
    _plan_guard(db, current_user, workout_plan_id, write=True)
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can delete workout plans"
        )
    
    workout_service = WorkoutService(db)
    success = workout_service.delete_workout_plan(workout_plan_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout plan not found"
        )

# Workout Session Endpoints
@router.post("/plans/{workout_plan_id}/sessions", response_model=WorkoutSessionResponse, status_code=status.HTTP_201_CREATED)
def create_workout_session(
    workout_plan_id: int,
    workout_session_data: WorkoutSessionCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new workout session for a workout plan."""
    _plan_guard(db, current_user, workout_plan_id, write=True)
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can create workout sessions"
        )
    
    workout_service = WorkoutService(db)
    return workout_service.create_workout_session(workout_session_data, workout_plan_id)

@router.get("/sessions/{workout_session_id}", response_model=WorkoutSessionResponse)
def get_workout_session(
    workout_session_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific workout session by ID."""
    _session_guard(db, current_user, workout_session_id)
    workout_service = WorkoutService(db)
    workout_session = workout_service.get_workout_session(workout_session_id)
    
    if not workout_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout session not found"
        )
    
    return workout_session

@router.get("/sessions/{workout_session_id}/complete", response_model=CompleteWorkoutSessionResponse)
def get_complete_workout_session(
    workout_session_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a complete workout session with all exercises."""
    _session_guard(db, current_user, workout_session_id)
    workout_service = WorkoutService(db)
    workout_session = workout_service.get_complete_workout_session(workout_session_id)
    
    if not workout_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout session not found"
        )
    
    return workout_session

@router.put("/sessions/{workout_session_id}", response_model=WorkoutSessionResponse)
def update_workout_session(
    workout_session_id: int,
    workout_session_data: WorkoutSessionUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a workout session."""
    _session_guard(db, current_user, workout_session_id, write=True)
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can update workout sessions"
        )
    
    workout_service = WorkoutService(db)
    workout_session = workout_service.update_workout_session(workout_session_id, workout_session_data)
    
    if not workout_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout session not found"
        )
    
    return workout_session

@router.delete("/sessions/{workout_session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout_session(
    workout_session_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a workout session."""
    _session_guard(db, current_user, workout_session_id, write=True)
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can delete workout sessions"
        )
    
    workout_service = WorkoutService(db)
    success = workout_service.delete_workout_session(workout_session_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout session not found"
        )

# Workout Exercise Endpoints
@router.post("/sessions/{workout_session_id}/exercises", response_model=WorkoutExerciseResponse, status_code=status.HTTP_201_CREATED)
def create_workout_exercise(
    workout_session_id: int,
    workout_exercise_data: WorkoutExerciseCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add an exercise to a workout session."""
    _session_guard(db, current_user, workout_session_id, write=True)
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can add exercises to workout sessions"
        )
    
    workout_service = WorkoutService(db)
    return workout_service.create_workout_exercise(workout_exercise_data, workout_session_id)

@router.post("/sessions/{workout_session_id}/exercises/bulk", response_model=List[WorkoutExerciseResponse], status_code=status.HTTP_201_CREATED)
def create_bulk_workout_exercises(
    workout_session_id: int,
    bulk_data: BulkWorkoutExerciseCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add multiple exercises to a workout session at once."""
    _session_guard(db, current_user, workout_session_id, write=True)
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can add exercises to workout sessions"
        )
    
    workout_service = WorkoutService(db)
    return workout_service.create_bulk_workout_exercises(bulk_data, workout_session_id)

@router.get("/exercises/workout/{workout_exercise_id}", response_model=WorkoutExerciseResponse)
def get_workout_exercise(
    workout_exercise_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific workout exercise by ID."""
    _wexercise_guard(db, current_user, workout_exercise_id)
    workout_service = WorkoutService(db)
    workout_exercise = workout_service.get_workout_exercise(workout_exercise_id)
    
    if not workout_exercise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout exercise not found"
        )
    
    return workout_exercise

@router.put("/exercises/workout/{workout_exercise_id}", response_model=WorkoutExerciseResponse)
def update_workout_exercise(
    workout_exercise_id: int,
    workout_exercise_data: WorkoutExerciseUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a workout exercise."""
    _wexercise_guard(db, current_user, workout_exercise_id, write=True)
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can update workout exercises"
        )
    
    workout_service = WorkoutService(db)
    workout_exercise = workout_service.update_workout_exercise(workout_exercise_id, workout_exercise_data)
    
    if not workout_exercise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout exercise not found"
        )
    
    return workout_exercise

@router.delete("/exercises/workout/{workout_exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout_exercise(
    workout_exercise_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a workout exercise."""
    _wexercise_guard(db, current_user, workout_exercise_id, write=True)
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can delete workout exercises"
        )
    
    workout_service = WorkoutService(db)
    success = workout_service.delete_workout_exercise(workout_exercise_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout exercise not found"
        )

# Exercise Completion Endpoints
@router.post("/completions", response_model=ExerciseCompletionResponse, status_code=status.HTTP_201_CREATED)
def create_exercise_completion(
    completion_data: ExerciseCompletionCreate,
    form_photo: Optional[UploadFile] = File(None, description="Optional form photo"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Log completion of an exercise with optional form photo."""
    if not is_client(current_user):
        raise HTTPException(status_code=403, detail="Only clients can log completions")
    _own_exercise_slot(db, current_user, completion_data.workout_exercise_id)
    workout_service = WorkoutService(db)
    return workout_service.create_exercise_completion(completion_data, current_user.id, form_photo)

@router.post("/completions/bulk", response_model=List[ExerciseCompletionResponse], status_code=status.HTTP_201_CREATED)
def create_bulk_exercise_completions(
    bulk_data: BulkExerciseCompletionCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Log completion of multiple exercises at once."""
    if not is_client(current_user):
        raise HTTPException(status_code=403, detail="Only clients can log completions")
    for _c in bulk_data.completions:
        _own_exercise_slot(db, current_user, _c.workout_exercise_id)
    workout_service = WorkoutService(db)
    return workout_service.create_bulk_exercise_completions(bulk_data, current_user.id)

@router.get("/completions", response_model=List[ExerciseCompletionResponse])
def get_exercise_completions(
    client_id: Optional[int] = Query(None, description="Filter by client ID"),
    workout_exercise_id: Optional[int] = Query(None, description="Filter by workout exercise ID"),
    start_date: Optional[str] = Query(None, description="Filter by start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Filter by end date (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get exercise completions with filtering and pagination."""
    workout_service = WorkoutService(db)
    
    # If user is not a trainer, only show their completions
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        client_id = current_user.id
    
    # Parse dates if provided
    from datetime import datetime
    parsed_start_date = None
    parsed_end_date = None
    
    if start_date:
        try:
            parsed_start_date = datetime.strptime(start_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid start_date format. Use YYYY-MM-DD"
            )
    
    if end_date:
        try:
            parsed_end_date = datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid end_date format. Use YYYY-MM-DD"
            )
    
    scope = None
    if client_id is not None and not is_client(current_user):
        require_client_access(db, current_user, client_id)
    elif client_id is None:
        scope = visible_client_ids(db, current_user)
        scope = list(scope) if scope is not None else None
    filter_params = ExerciseCompletionFilter(
        client_ids=scope,
        client_id=client_id,
        workout_exercise_id=workout_exercise_id,
        start_date=parsed_start_date,
        end_date=parsed_end_date,
        page=page,
        size=size
    )
    
    completions, total = workout_service.get_exercise_completions(filter_params)
    
    # Add pagination headers
    from fastapi.responses import Response
    response = Response()
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Size"] = str(size)
    
    return completions

@router.get("/completions/{completion_id}", response_model=ExerciseCompletionResponse)
def get_exercise_completion(
    completion_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific exercise completion by ID."""
    _completion_guard(db, current_user, completion_id)
    workout_service = WorkoutService(db)
    completion = workout_service.get_exercise_completion(completion_id)
    
    if not completion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise completion not found"
        )
    
    # Check permissions
    if current_user.role not in ["TRAINER", "ADMIN"] and completion.client_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view this completion"
        )
    
    return completion

@router.put("/completions/{completion_id}", response_model=ExerciseCompletionResponse)
def update_exercise_completion(
    completion_id: int,
    completion_data: ExerciseCompletionUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an exercise completion."""
    _completion_guard(db, current_user, completion_id, write=True)
    workout_service = WorkoutService(db)
    completion = workout_service.get_exercise_completion(completion_id)
    
    if not completion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise completion not found"
        )
    
    # Check permissions
    if current_user.role not in ["TRAINER", "ADMIN"] and completion.client_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this completion"
        )
    
    updated_completion = workout_service.update_exercise_completion(completion_id, completion_data)
    return updated_completion

@router.delete("/completions/{completion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise_completion(
    completion_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an exercise completion."""
    _completion_guard(db, current_user, completion_id, write=True)
    workout_service = WorkoutService(db)
    completion = workout_service.get_exercise_completion(completion_id)
    
    if not completion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise completion not found"
        )
    
    # Check permissions
    if current_user.role not in ["TRAINER", "ADMIN"] and completion.client_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this completion"
        )
    
    success = workout_service.delete_exercise_completion(completion_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise completion not found"
        )

# Analytics Endpoints
@router.get("/plans/{workout_plan_id}/summary", response_model=WorkoutSummary)
def get_workout_summary(
    workout_plan_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get summary statistics for a workout plan."""
    _plan_guard(db, current_user, workout_plan_id)
    workout_service = WorkoutService(db)
    summary = workout_service.get_workout_summary(workout_plan_id)
    
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout plan not found"
        )
    
    return summary

@router.get("/exercises/{exercise_id}/progress", response_model=ExerciseProgress)
def get_exercise_progress(
    exercise_id: int,
    client_id: Optional[int] = Query(None, description="Client ID (required if user is trainer)"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get progress statistics for a specific exercise."""
    if client_id is not None and not is_client(current_user):
        require_client_access(db, current_user, client_id)
    workout_service = WorkoutService(db)
    
    # If user is not a trainer, use their ID
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        client_id = current_user.id
    elif not client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_id is required for trainers"
        )
    
    progress = workout_service.get_exercise_progress(exercise_id, client_id)
    
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise progress not found"
        )
    
    return progress 
