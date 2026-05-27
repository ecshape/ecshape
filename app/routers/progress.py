from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date
import os

from app.database import get_db
from app.auth.utils import get_current_user
from app.schemas.auth import UserResponse, UserRole
from app.models.progress import ProgressEntry
from app.models.progress_photo import ProgressPhoto, PhotoType
from app.services.file_service import FileService
from app.services.notification_triggers import check_client_goals
from app.services.trainer_notification_helper import notify_trainer_immediate
from app.services.websocket_service import websocket_service

router = APIRouter(tags=["progress"])

@router.post("/weight", status_code=status.HTTP_201_CREATED)
async def add_weight_entry(
    weight: float = Form(..., description="Weight in kg"),
    notes: Optional[str] = Form(None, description="Optional notes"),
    photo: Optional[UploadFile] = File(None, description="Optional progress photo (deprecated - use photos)"),
    # Multiple photos support
    photo_front: Optional[UploadFile] = File(None, description="Front progress photo"),
    photo_side: Optional[UploadFile] = File(None, description="Side progress photo"),
    photo_back: Optional[UploadFile] = File(None, description="Back progress photo"),
    client_id: Optional[int] = Form(None, description="Client ID (for trainers)"),
    chest: Optional[float] = Form(None, description="Chest measurement in cm"),
    waist: Optional[float] = Form(None, description="Waist measurement in cm"),
    hips: Optional[float] = Form(None, description="Hips measurement in cm"),
    thighs: Optional[float] = Form(None, description="Thighs measurement in cm"),
    arms: Optional[float] = Form(None, description="Arms measurement in cm (deprecated)"),
    right_arm: Optional[float] = Form(None, description="Right arm circumference in cm"),
    left_arm: Optional[float] = Form(None, description="Left arm circumference in cm"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a new weight entry with optional photo"""
    from app.models.user import User
    
    # Determine the target client ID
    target_client_id = current_user.id  # Default to current user
    if client_id and current_user.role == UserRole.TRAINER:
        # Verify that the client belongs to this trainer
        client = db.query(User).filter(User.id == client_id).first()
        if not client or client.trainer_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only add entries for your clients")
        target_client_id = client_id
    
    # Save photos if provided (support multiple photos with types)
    photo_path = None  # Keep for backward compatibility
    file_service = FileService()
    
    # Handle legacy single photo
    if photo:
        file_result = await file_service.save_file(photo, "progress_photo", target_client_id)
        photo_path = file_result.get("filename") or file_result["original_path"]
    
    # Handle new multiple photos system
    photos_to_save = []
    if photo_front:
        photos_to_save.append((photo_front, PhotoType.FRONT))
    if photo_side:
        photos_to_save.append((photo_side, PhotoType.SIDE))
    if photo_back:
        photos_to_save.append((photo_back, PhotoType.BACK))
    
    # Limit to 3 photos
    if len(photos_to_save) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 photos allowed (front, side, back)")
    
    # Create progress entry
    progress_entry = ProgressEntry(
        client_id=target_client_id,
        date=date.today(),
        weight=weight,
        photo_path=photo_path,
        notes=notes,
        chest=chest,
        waist=waist,
        hips=hips,
        thighs=thighs,
        arms=arms,  # Keep for backward compatibility
        right_arm=right_arm,
        left_arm=left_arm
    )
    
    db.add(progress_entry)
    db.commit()
    db.refresh(progress_entry)
    
    # Save multiple photos if provided
    saved_photos = []
    for photo_file, photo_type in photos_to_save:
        file_result = await file_service.save_file(photo_file, "progress_photo", target_client_id)
        photo_filename = file_result.get("filename") or os.path.basename(file_result["original_path"])
        
        progress_photo = ProgressPhoto(
            progress_entry_id=progress_entry.id,
            photo_path=photo_filename,
            photo_type=photo_type
        )
        db.add(progress_photo)
        saved_photos.append({
            "id": progress_photo.id,
            "photo_path": photo_filename,
            "photo_type": photo_type.value
        })
    
    if saved_photos:
        db.commit()

    client = db.query(User).filter(User.id == target_client_id).first()
    client_name = (client.full_name or client.username) if client else "Client"
    created = notify_trainer_immediate(
        db,
        target_client_id,
        title="Weight logged",
        message=f"{client_name} logged weight: {weight} kg",
        event_type="weight_change",
        notification_type="info",
    )
    if created:
        await websocket_service.send_new_notification_hint(created.recipient_id)

    # Check for goal achievements
    check_client_goals(db, target_client_id)
    
    # Normalize photo_path to just filename
    photo_path = progress_entry.photo_path
    if photo_path and ('/' in photo_path or '\\' in photo_path):
        photo_path = os.path.basename(photo_path)
    
    return {
        "id": progress_entry.id,
        "date": progress_entry.date.isoformat(),
        "weight": progress_entry.weight,
        "photo_path": photo_path,  # Normalized to just filename
        "notes": progress_entry.notes,
        "chest": getattr(progress_entry, 'chest', None),
        "waist": getattr(progress_entry, 'waist', None),
        "hips": getattr(progress_entry, 'hips', None),
        "thighs": getattr(progress_entry, 'thighs', None),
        "arms": getattr(progress_entry, 'arms', None),
        "right_arm": getattr(progress_entry, 'right_arm', None),
        "left_arm": getattr(progress_entry, 'left_arm', None),
        "photos": saved_photos,  # List of photos with types
        "created_at": progress_entry.created_at.isoformat()
    }

@router.get("/weight", response_model=List[dict])
async def get_weight_history(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get weight history for the current user"""
    
    entries = db.query(ProgressEntry).filter(
        ProgressEntry.client_id == current_user.id
    ).order_by(ProgressEntry.date.desc()).all()
    
    # Normalize photo_path to just filename for all entries
    normalized_entries = []
    for entry in entries:
        photo_path = entry.photo_path
        # If photo_path contains a path separator, extract just the filename
        if photo_path and ('/' in photo_path or '\\' in photo_path):
            photo_path = os.path.basename(photo_path)
        
        # Safely get body measurements (may not exist in old database entries)
        normalized_entries.append({
            "id": entry.id,
            "date": entry.date.isoformat(),
            "weight": entry.weight,
            "photo_path": photo_path,  # Normalized to just filename
            "notes": entry.notes,
            "chest": getattr(entry, 'chest', None),
            "waist": getattr(entry, 'waist', None),
            "hips": getattr(entry, 'hips', None),
            "thighs": getattr(entry, 'thighs', None),
            "arms": getattr(entry, 'arms', None),
            "right_arm": getattr(entry, 'right_arm', None),
            "left_arm": getattr(entry, 'left_arm', None),
            "created_at": entry.created_at.isoformat()
        })
    
    return normalized_entries

@router.get("/", response_model=List[dict])
async def get_progress_entries(
    client_id: Optional[int] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get progress entries (trainers can get their clients' entries)"""
    from app.models.user import User
    
    # If trainer, they can query their clients' progress
    if current_user.role == UserRole.TRAINER and client_id:
        # Check if the client belongs to this trainer
        client = db.query(User).filter(User.id == client_id).first()
        if not client or client.trainer_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only view your clients' progress")
        query_client_id = client_id
    else:
        # Clients can only see their own progress
        query_client_id = current_user.id
    
    entries = db.query(ProgressEntry).filter(
        ProgressEntry.client_id == query_client_id
    ).order_by(ProgressEntry.date.desc()).all()
    
    # Normalize photo_path to just filename for all entries
    # This handles both old entries (with full paths) and new entries (just filename)
    normalized_entries = []
    for entry in entries:
        photo_path = entry.photo_path
        # If photo_path contains a path separator, extract just the filename
        if photo_path and ('/' in photo_path or '\\' in photo_path):
            photo_path = os.path.basename(photo_path)
        
        # Get photos for this entry
        photos = []
        if hasattr(entry, 'photos'):
            for photo in entry.photos:
                photos.append({
                    "id": photo.id,
                    "photo_path": photo.photo_path,
                    "photo_type": photo.photo_type.value if hasattr(photo.photo_type, 'value') else str(photo.photo_type)
                })
        
        # Safely get body measurements (may not exist in old database entries)
        normalized_entries.append({
            "id": entry.id,
            "client_id": entry.client_id,
            "date": entry.date.isoformat(),
            "weight": entry.weight,
            "photo_path": photo_path,  # Normalized to just filename (legacy)
            "photos": photos,  # New multiple photos system
            "notes": entry.notes,
            "chest": getattr(entry, 'chest', None),
            "waist": getattr(entry, 'waist', None),
            "hips": getattr(entry, 'hips', None),
            "thighs": getattr(entry, 'thighs', None),
            "arms": getattr(entry, 'arms', None),
            "right_arm": getattr(entry, 'right_arm', None),
            "left_arm": getattr(entry, 'left_arm', None),
            "created_at": entry.created_at.isoformat()
        })
    
    return normalized_entries

@router.get("/{entry_id}", response_model=dict)
async def get_progress_entry(
    entry_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single progress entry by ID (trainers can get their clients' entries)"""
    from app.models.user import User
    
    entry = db.query(ProgressEntry).filter(ProgressEntry.id == entry_id).first()
    
    if not entry:
        raise HTTPException(status_code=404, detail="Progress entry not found")
    
    # Check permissions
    if current_user.role == UserRole.TRAINER:
        # Check if the client belongs to this trainer
        client = db.query(User).filter(User.id == entry.client_id).first()
        if not client or client.trainer_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only view your clients' progress")
    elif current_user.id != entry.client_id:
        raise HTTPException(status_code=403, detail="You can only view your own progress")
    
    # Normalize photo_path to just filename
    photo_path = entry.photo_path
    if photo_path and ('/' in photo_path or '\\' in photo_path):
        photo_path = os.path.basename(photo_path)
    
    return {
        "id": entry.id,
        "client_id": entry.client_id,
        "date": entry.date.isoformat(),
        "weight": entry.weight,
        "photo_path": photo_path,  # Normalized to just filename
        "notes": entry.notes,
        "chest": getattr(entry, 'chest', None),
        "waist": getattr(entry, 'waist', None),
        "hips": getattr(entry, 'hips', None),
        "thighs": getattr(entry, 'thighs', None),
        "arms": getattr(entry, 'arms', None),
        "right_arm": getattr(entry, 'right_arm', None),
        "left_arm": getattr(entry, 'left_arm', None),
        "created_at": entry.created_at.isoformat()
    }

@router.get("/weight/current")
async def get_current_weight(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the most recent weight entry"""
    
    latest_entry = db.query(ProgressEntry).filter(
        ProgressEntry.client_id == current_user.id
    ).order_by(ProgressEntry.date.desc()).first()
    
    if not latest_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No weight entries found"
        )
    
    return {
        "weight": latest_entry.weight,
        "date": latest_entry.date.isoformat(),
        "notes": latest_entry.notes
    }

@router.delete("/weight/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_weight_entry(
    entry_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a weight entry (trainers can delete their clients' entries)"""
    from app.models.user import User
    
    entry = db.query(ProgressEntry).filter(ProgressEntry.id == entry_id).first()
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Weight entry not found"
        )
    
    # Check permissions
    if current_user.role == UserRole.TRAINER:
        # Check if the client belongs to this trainer
        client = db.query(User).filter(User.id == entry.client_id).first()
        if not client or client.trainer_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only delete your clients' progress entries")
    elif current_user.id != entry.client_id:
        raise HTTPException(status_code=403, detail="You can only delete your own progress entries")
    
    # Delete associated photo if exists
    if entry.photo_path:
        try:
            # Extract just the filename
            filename = os.path.basename(entry.photo_path) if '/' in entry.photo_path or '\\' in entry.photo_path else entry.photo_path
            # Use the files router endpoint to delete the file
            from app.routers.files import delete_media_file
            # We'll delete it directly using os.remove since we have the path
            persistent_base = os.getenv("PERSISTENT_PATH", "/app/persistent")
            upload_dir = os.getenv("UPLOAD_DIR", os.path.join(persistent_base, "uploads"))
            photo_path = os.path.join(upload_dir, "progress_photos", filename)
            
            # Try multiple possible locations
            possible_paths = [
                photo_path,
                os.path.join(persistent_base, "uploads", "progress_photos", filename),
                f"uploads/progress_photos/{filename}",
                f"/app/uploads/progress_photos/{filename}",
            ]
            
            for path in possible_paths:
                if os.path.exists(path):
                    os.remove(path)
                    break
        except Exception as e:
            # Log error but don't fail the deletion
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to delete photo for entry {entry_id}: {e}")
    
    db.delete(entry)
    db.commit()

@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_progress_entry(
    entry_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a progress entry (clients can delete their own, trainers can delete their clients')"""
    from app.models.user import User
    
    entry = db.query(ProgressEntry).filter(ProgressEntry.id == entry_id).first()
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progress entry not found"
        )
    
    # Check permissions
    if current_user.role == UserRole.TRAINER:
        # Check if the client belongs to this trainer
        client = db.query(User).filter(User.id == entry.client_id).first()
        if not client or client.trainer_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only delete your clients' progress entries")
    elif current_user.id != entry.client_id:
        raise HTTPException(status_code=403, detail="You can only delete your own progress entries")
    
    # Delete associated photo if exists
    if entry.photo_path:
        try:
            # Extract just the filename
            filename = os.path.basename(entry.photo_path) if '/' in entry.photo_path or '\\' in entry.photo_path else entry.photo_path
            # Use the files router endpoint to delete the file
            persistent_base = os.getenv("PERSISTENT_PATH", "/app/persistent")
            upload_dir = os.getenv("UPLOAD_DIR", os.path.join(persistent_base, "uploads"))
            photo_path = os.path.join(upload_dir, "progress_photos", filename)
            
            # Try multiple possible locations
            possible_paths = [
                photo_path,
                os.path.join(persistent_base, "uploads", "progress_photos", filename),
                f"uploads/progress_photos/{filename}",
                f"/app/uploads/progress_photos/{filename}",
            ]
            
            for path in possible_paths:
                if os.path.exists(path):
                    os.remove(path)
                    break
        except Exception as e:
            # Log error but don't fail the deletion
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to delete photo for entry {entry_id}: {e}")
    
    db.delete(entry)
    db.commit()

@router.put("/entries/{entry_id}")
async def update_progress_entry(
    entry_id: int,
    weight: Optional[float] = Form(None),
    notes: Optional[str] = Form(None),
    chest: Optional[float] = Form(None, description="Chest measurement in cm"),
    waist: Optional[float] = Form(None, description="Waist measurement in cm"),
    hips: Optional[float] = Form(None, description="Hips measurement in cm"),
    thighs: Optional[float] = Form(None, description="Thighs measurement in cm"),
    arms: Optional[float] = Form(None, description="Arms measurement in cm (deprecated)"),
    right_arm: Optional[float] = Form(None, description="Right arm circumference in cm"),
    left_arm: Optional[float] = Form(None, description="Left arm circumference in cm"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a progress entry (trainers can update their clients' entries)"""
    from app.models.user import User
    
    # Get the entry
    entry = db.query(ProgressEntry).filter(ProgressEntry.id == entry_id).first()
    
    if not entry:
        raise HTTPException(status_code=404, detail="Progress entry not found")
    
    # Check permissions
    if current_user.role == UserRole.TRAINER:
        # Check if the client belongs to this trainer
        client = db.query(User).filter(User.id == entry.client_id).first()
        if not client or client.trainer_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only update your clients' progress")
    elif current_user.id != entry.client_id:
        raise HTTPException(status_code=403, detail="You can only update your own progress")
    
    # Update fields
    if weight is not None:
        entry.weight = weight
    if notes is not None:
        entry.notes = notes
    if chest is not None:
        entry.chest = chest
    if waist is not None:
        entry.waist = waist
    if hips is not None:
        entry.hips = hips
    if thighs is not None:
        entry.thighs = thighs
    if arms is not None:
        entry.arms = arms
    if right_arm is not None:
        entry.right_arm = right_arm
    if left_arm is not None:
        entry.left_arm = left_arm
    
    db.commit()
    db.refresh(entry)
    
    # Return updated entry
    # Normalize photo_path to just filename
    photo_path = entry.photo_path
    if photo_path and ('/' in photo_path or '\\' in photo_path):
        photo_path = os.path.basename(photo_path)
    
    return {
        "id": entry.id,
        "client_id": entry.client_id,
        "date": entry.date.isoformat(),
        "weight": entry.weight,
        "photo_path": photo_path,  # Normalized to just filename
        "notes": entry.notes,
        "chest": getattr(entry, 'chest', None),
        "waist": getattr(entry, 'waist', None),
        "hips": getattr(entry, 'hips', None),
        "thighs": getattr(entry, 'thighs', None),
        "arms": getattr(entry, 'arms', None),
        "right_arm": getattr(entry, 'right_arm', None),
        "left_arm": getattr(entry, 'left_arm', None),
        "created_at": entry.created_at.isoformat()
    } 