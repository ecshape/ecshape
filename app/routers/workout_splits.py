"""
API endpoints for managing custom workout splits
Trainers can create and manage custom workout splits
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.auth.utils import get_current_user
from app.schemas.auth import UserResponse, UserRole
from app.models.workout_split import WorkoutSplit

router = APIRouter()

class WorkoutSplitCreate(BaseModel):
    name: str
    description: Optional[str] = None
    days_per_week: Optional[int] = None

class WorkoutSplitUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    days_per_week: Optional[int] = None

class WorkoutSplitResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    days_per_week: Optional[int] = None
    created_by: int
    created_at: str
    
    class Config:
        from_attributes = True

@router.post("/", response_model=WorkoutSplitResponse, status_code=status.HTTP_201_CREATED)
def create_workout_split(
    split_data: WorkoutSplitCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new workout split (trainer/admin only)"""
    if current_user.role != UserRole.TRAINER and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can create workout splits"
        )
    
    workout_split = WorkoutSplit(
        name=split_data.name.strip(),
        description=split_data.description.strip() if split_data.description and split_data.description.strip() else None,
        days_per_week=split_data.days_per_week,
        created_by=current_user.id
    )
    
    db.add(workout_split)
    db.commit()
    db.refresh(workout_split)
    
    return WorkoutSplitResponse(
        id=workout_split.id,
        name=workout_split.name,
        description=workout_split.description,
        days_per_week=workout_split.days_per_week,
        created_by=workout_split.created_by,
        created_at=workout_split.created_at.isoformat() if workout_split.created_at else ""
    )

@router.get("/", response_model=List[WorkoutSplitResponse])
def get_workout_splits(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all workout splits (trainer/admin see all, clients see public ones)"""
    if current_user.role == UserRole.TRAINER or current_user.role == UserRole.ADMIN:
        splits = db.query(WorkoutSplit).order_by(WorkoutSplit.name).all()
    else:
        # Clients can see all splits (or filter by created_by if needed)
        splits = db.query(WorkoutSplit).order_by(WorkoutSplit.name).all()
    
    return [
        WorkoutSplitResponse(
            id=split.id,
            name=split.name,
            description=split.description,
            days_per_week=split.days_per_week,
            created_by=split.created_by,
            created_at=split.created_at.isoformat() if split.created_at else ""
        )
        for split in splits
    ]

@router.get("/{split_id}", response_model=WorkoutSplitResponse)
def get_workout_split(
    split_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific workout split"""
    split = db.query(WorkoutSplit).filter(WorkoutSplit.id == split_id).first()
    
    if not split:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout split not found"
        )
    
    return WorkoutSplitResponse(
        id=split.id,
        name=split.name,
        description=split.description,
        days_per_week=split.days_per_week,
        created_by=split.created_by,
        created_at=split.created_at.isoformat() if split.created_at else ""
    )

@router.put("/{split_id}", response_model=WorkoutSplitResponse)
def update_workout_split(
    split_id: int,
    split_data: WorkoutSplitUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a workout split (trainer/admin only, or creator)"""
    split = db.query(WorkoutSplit).filter(WorkoutSplit.id == split_id).first()
    
    if not split:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout split not found"
        )
    
    if current_user.role != UserRole.ADMIN and split.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own workout splits"
        )
    
    if split_data.name is not None:
        split.name = split_data.name.strip()
    if split_data.description is not None:
        split.description = split_data.description.strip() if split_data.description else None
    if split_data.days_per_week is not None:
        split.days_per_week = split_data.days_per_week
    
    db.commit()
    db.refresh(split)
    
    return WorkoutSplitResponse(
        id=split.id,
        name=split.name,
        description=split.description,
        days_per_week=split.days_per_week,
        created_by=split.created_by,
        created_at=split.created_at.isoformat() if split.created_at else ""
    )

@router.delete("/{split_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout_split(
    split_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a workout split (trainer/admin only, or creator)"""
    split = db.query(WorkoutSplit).filter(WorkoutSplit.id == split_id).first()
    
    if not split:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout split not found"
        )
    
    if current_user.role != UserRole.ADMIN and split.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own workout splits"
        )
    
    db.delete(split)
    db.commit()
    
    return None





