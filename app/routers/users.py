from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.auth import UserResponse, UserRole, UserUpdate
from app.services import user_service
from app.auth.utils import get_current_user
from app.models.user import ClientProfile
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get current user information.
    """
    return current_user

@router.get("/", response_model=List[UserResponse])
async def get_users(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all users. Only admins and trainers can access this endpoint.
    """
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and trainers can view all users"
        )
    return user_service.get_users(db)

@router.get("/clients", response_model=List[UserResponse])
async def get_trainer_clients(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all clients for the current trainer, or all clients if admin.
    """
    if current_user.role == UserRole.TRAINER:
        return user_service.get_trainer_clients(db, current_user.id)
    elif current_user.role == UserRole.ADMIN:
        return user_service.get_users_by_role(db, UserRole.CLIENT)
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and trainers can view clients"
        )

@router.get("/trainers", response_model=List[UserResponse])
async def get_trainers(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all trainers. Only admins and trainers can access this endpoint.
    """
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and trainers can view trainers"
        )
    return user_service.get_users_by_role(db, UserRole.TRAINER)

@router.post("/clients/{client_id}/assign", status_code=status.HTTP_200_OK)
async def assign_client(
    client_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Assign a client to the current trainer.
    """
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can assign clients"
        )
    
    success = user_service.assign_client_to_trainer(db, current_user.id, client_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not assign client to trainer"
        )
    return {"message": "Client assigned successfully"}

@router.post("/clients/{client_id}/remove", status_code=status.HTTP_200_OK)
async def remove_client(
    client_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Remove a client from the current trainer.
    """
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can remove clients"
        )
    
    # Verify the client belongs to this trainer
    client = user_service.get_user_by_id(db, client_id)
    if not client or client.trainer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found or not assigned to you"
        )
    
    success = user_service.remove_client_from_trainer(db, current_user.id, client_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not remove client from trainer"
        )
    return {"message": "Client removed successfully"}

# Add missing endpoints that tests expect
@router.post("/trainer/{trainer_id}/clients/{client_id}", status_code=status.HTTP_200_OK)
async def assign_client_to_trainer(
    trainer_id: int,
    client_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Assign a client to a specific trainer.
    """
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can assign clients"
        )
    
    # Verify the trainer exists and current user is the trainer
    trainer = user_service.get_user_by_id(db, trainer_id)
    if not trainer or trainer.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trainer not found"
        )
    
    success = user_service.assign_client_to_trainer(db, trainer_id, client_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not assign client to trainer"
        )
    
    # Return the updated client
    client = user_service.get_user_by_id(db, client_id)
    return client

@router.delete("/trainer/{trainer_id}/clients/{client_id}", status_code=status.HTTP_200_OK)
async def remove_client_from_trainer(
    trainer_id: int,
    client_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Remove a client from a specific trainer.
    """
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can remove clients"
        )
    
    # Verify the trainer exists and current user is the trainer
    trainer = user_service.get_user_by_id(db, trainer_id)
    if not trainer or trainer.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trainer not found"
        )
    
    # Verify the client belongs to this trainer
    client = user_service.get_user_by_id(db, client_id)
    if not client or client.trainer_id != trainer_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found or not assigned to you"
        )
    
    success = user_service.remove_client_from_trainer(db, trainer_id, client_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not remove client from trainer"
        )
    
    # Return the updated client
    updated_client = user_service.get_user_by_id(db, client_id)
    return updated_client

@router.get("/{user_id}")
async def get_user(
    user_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get user by ID. Trainers can view their clients, admins can view any user, clients can only view themselves.
    Returns user data with profile information if available.
    """
    # Admins can view anyone
    if current_user.role == UserRole.ADMIN:
        pass
    # Clients can only view themselves
    elif current_user.role == UserRole.CLIENT:
        if current_user.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    # Trainers can view their clients
    elif current_user.role == UserRole.TRAINER:
        if current_user.id != user_id:
            # Check if the requested user is a client of this trainer
            target_user = user_service.get_user_by_id(db, user_id)
            if not target_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )
            if target_user.role != UserRole.CLIENT or target_user.trainer_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Client not found or not assigned to you"
                )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    user = user_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Build response with profile data
    response_data = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "trainer_id": user.trainer_id,
        "last_login": getattr(user, 'last_login', None),
    }
    
    # Get profile data if it exists (handle missing columns gracefully)
    try:
        from sqlalchemy import inspect
        # Use raw SQL to only select columns that exist
        inspector = inspect(db.bind)
        columns = [col['name'] for col in inspector.get_columns('client_profiles')]
        
        # Build select statement with only existing columns
        from sqlalchemy import text
        select_cols = []
        if 'height' in columns:
            select_cols.append('height')
        if 'target_weight' in columns:
            select_cols.append('target_weight')
        if 'fitness_goals' in columns:
            select_cols.append('fitness_goals')
        if 'medical_conditions' in columns:
            select_cols.append('medical_conditions')
        if 'dietary_restrictions' in columns:
            select_cols.append('dietary_restrictions')
        if 'phone' in columns:
            select_cols.append('phone')
        if 'address' in columns:
            select_cols.append('address')
        if 'emergency_contact' in columns:
            select_cols.append('emergency_contact')
        
        if select_cols:
            result = db.execute(text(f"SELECT {', '.join(select_cols)} FROM client_profiles WHERE user_id = :user_id"), {"user_id": user_id}).first()
            if result:
                profile_dict = dict(result._mapping)
                response_data["profile"] = {
                    "weight": profile_dict.get('target_weight', 0) / 1000 if profile_dict.get('target_weight') else None,
                    "height": profile_dict.get('height'),
                    "goals": profile_dict.get('fitness_goals'),
                    "injuries": profile_dict.get('medical_conditions'),
                    "preferences": profile_dict.get('dietary_restrictions'),
                    "phone": profile_dict.get('phone'),
                    "address": profile_dict.get('address'),
                    "emergency_contact": profile_dict.get('emergency_contact'),
                }
            else:
                response_data["profile"] = None
        else:
            response_data["profile"] = None
    except Exception as e:
        # If profile query fails (e.g., missing columns or table), just return None for profile
        response_data["profile"] = None
    
    return response_data

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update user by ID. Admins can update anyone, trainers can update their clients, users can only update themselves.
    """
    # Check permissions
    if current_user.role == UserRole.ADMIN:
        # Admins can update anyone
        pass
    elif current_user.role == UserRole.TRAINER:
        # Trainers can update their clients
        target_user = user_service.get_user_by_id(db, user_id)
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        if target_user.trainer_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own clients"
            )
    elif current_user.id != user_id:
        # Regular users can only update themselves
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own profile"
        )
    
    updated_user = user_service.update_user(db, user_id, user_update)
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return updated_user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a user. Admins can delete any user, trainers can delete their clients, users can delete themselves.
    """
    # Check if user has permission to delete
    if current_user.id != user_id and current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this user"
        )

    # If trainer is deleting a client, verify the client belongs to them
    if current_user.role == UserRole.TRAINER and current_user.id != user_id:
        client = user_service.get_user_by_id(db, user_id)
        if not client or client.trainer_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Client not found or not assigned to you"
            )
    # Admins can delete any user
    try:
        deleted = user_service.delete_user(db, user_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete user: {str(e)}"
        )

@router.put("/me", response_model=UserResponse)
async def update_user_me(
    user_update: UserUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update current user's information.
    """
    updated_user = user_service.update_user(db, current_user.id, user_update)
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return updated_user

class ClientProfileUpdate(BaseModel):
    weight: Optional[float] = None
    height: Optional[int] = None
    goals: Optional[str] = None
    injuries: Optional[str] = None
    preferences: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None

@router.put("/{user_id}/profile")
async def update_client_profile(
    user_id: int,
    profile_update: ClientProfileUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update client profile information. Trainers can update their clients' profiles.
    """
    # Check permissions
    if current_user.role == UserRole.ADMIN:
        # Admins can update anyone
        pass
    elif current_user.role == UserRole.TRAINER:
        # Trainers can update their clients
        target_user = user_service.get_user_by_id(db, user_id)
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        if target_user.trainer_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own clients' profiles"
            )
    elif current_user.id != user_id:
        # Regular users can only update themselves
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own profile"
        )
    
    # Get or create client profile
    client_profile = db.query(ClientProfile).filter(ClientProfile.user_id == user_id).first()
    
    if not client_profile:
        # Create new profile if it doesn't exist
        target_user = user_service.get_user_by_id(db, user_id)
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        client_profile = ClientProfile(
            user_id=user_id,
            trainer_id=target_user.trainer_id or current_user.id,
            height=profile_update.height,
            target_weight=int(profile_update.weight * 1000) if profile_update.weight else None,  # Convert kg to grams
            fitness_goals=profile_update.goals,
            medical_conditions=profile_update.injuries,
            dietary_restrictions=profile_update.preferences,
            phone=profile_update.phone,
            address=profile_update.address,
            emergency_contact=profile_update.emergency_contact
        )
        db.add(client_profile)
    else:
        # Update existing profile
        if profile_update.height is not None:
            client_profile.height = profile_update.height
        if profile_update.weight is not None:
            client_profile.target_weight = int(profile_update.weight * 1000)  # Convert kg to grams
        if profile_update.goals is not None:
            client_profile.fitness_goals = profile_update.goals
        if profile_update.injuries is not None:
            client_profile.medical_conditions = profile_update.injuries
        if profile_update.preferences is not None:
            client_profile.dietary_restrictions = profile_update.preferences
        if profile_update.phone is not None:
            client_profile.phone = profile_update.phone
        if profile_update.address is not None:
            client_profile.address = profile_update.address
        if profile_update.emergency_contact is not None:
            client_profile.emergency_contact = profile_update.emergency_contact
    
    db.commit()
    db.refresh(client_profile)
    
    return {
        "message": "Profile updated successfully",
        "profile": {
            "height": client_profile.height,
            "weight": client_profile.target_weight / 1000 if client_profile.target_weight else None,  # Convert grams to kg
            "goals": client_profile.fitness_goals,
            "injuries": client_profile.medical_conditions,
            "preferences": client_profile.dietary_restrictions,
            "phone": client_profile.phone,
            "address": client_profile.address,
            "emergency_contact": client_profile.emergency_contact
        }
    } 