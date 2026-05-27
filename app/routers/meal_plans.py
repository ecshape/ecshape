from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from app.database import get_db
from app.services.meal_plan_service import MealPlanService
from app.schemas.nutrition import (
    MealPlanCreate, MealPlanUpdate, MealPlanResponse, MealPlanFilter,
    MealEntryCreate, MealEntryUpdate, MealEntryResponse,
    MealComponentCreate, MealComponentUpdate, MealComponentResponse,
    MealUploadCreate, MealUploadUpdate, MealUploadResponse,
    CompleteMealPlanResponse, MealPlanSummary
)
from app.schemas.auth import UserResponse, UserRole
from app.auth.utils import get_current_user

router = APIRouter()

# Helper function to get meal plan service
def get_meal_plan_service(db: Session = Depends(get_db)) -> MealPlanService:
    return MealPlanService(db)

# Test endpoint
@router.get("/test")
async def test_meal_plans_router():
    """Test endpoint for meal plans router."""
    return {"message": "Meal Plans router working"}

# Meal Plans Endpoints
@router.post("/", response_model=MealPlanResponse)
async def create_meal_plan(
    meal_plan_data: MealPlanCreate,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Create a new meal plan for a client."""
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Only trainers can create meal plans")
    
    meal_plan = meal_plan_service.create_meal_plan(meal_plan_data, current_user.id)
    return meal_plan

@router.get("/", response_model=List[MealPlanResponse])
async def get_meal_plans(
    trainer_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Get meal plans with filtering and pagination."""
    filter_params = MealPlanFilter(
        trainer_id=trainer_id,
        client_id=client_id,
        start_date=start_date,
        end_date=end_date,
        search=search,
        page=page,
        size=size
    )
    
    meal_plans, total = meal_plan_service.get_meal_plans(filter_params)
    return meal_plans

@router.get("/{meal_plan_id}", response_model=MealPlanResponse)
async def get_meal_plan(
    meal_plan_id: int,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Get a specific meal plan by ID."""
    meal_plan = meal_plan_service.get_meal_plan(meal_plan_id)
    if not meal_plan:
        raise HTTPException(status_code=404, detail="Meal plan not found")
    
    return meal_plan

@router.get("/{meal_plan_id}/complete", response_model=CompleteMealPlanResponse)
async def get_complete_meal_plan(
    meal_plan_id: int,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Get a complete meal plan with uploads."""
    meal_plan = meal_plan_service.get_complete_meal_plan(meal_plan_id)
    if not meal_plan:
        raise HTTPException(status_code=404, detail="Meal plan not found")
    
    return meal_plan

@router.put("/{meal_plan_id}", response_model=MealPlanResponse)
async def update_meal_plan(
    meal_plan_id: int,
    meal_plan_data: MealPlanUpdate,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Update a meal plan."""
    meal_plan = meal_plan_service.update_meal_plan(meal_plan_id, meal_plan_data)
    if not meal_plan:
        raise HTTPException(status_code=404, detail="Meal plan not found")
    
    return meal_plan

@router.delete("/{meal_plan_id}")
async def delete_meal_plan(
    meal_plan_id: int,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Delete a meal plan."""
    success = meal_plan_service.delete_meal_plan(meal_plan_id)
    if not success:
        raise HTTPException(status_code=404, detail="Meal plan not found")
    
    return {"message": "Meal plan deleted successfully"}

# Meal Entries Endpoints
@router.post("/{meal_plan_id}/entries", response_model=MealEntryResponse)
async def create_meal_entry(
    meal_plan_id: int,
    meal_entry_data: MealEntryCreate,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Create a new meal entry for a meal plan."""
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Only trainers can create meal entries")
    
    meal_entry = meal_plan_service.create_meal_entry(meal_entry_data, meal_plan_id)
    return meal_entry

@router.get("/entries/{meal_entry_id}", response_model=MealEntryResponse)
async def get_meal_entry(
    meal_entry_id: int,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Get a specific meal entry by ID."""
    meal_entry = meal_plan_service.get_meal_entry(meal_entry_id)
    if not meal_entry:
        raise HTTPException(status_code=404, detail="Meal entry not found")
    
    return meal_entry

@router.put("/entries/{meal_entry_id}", response_model=MealEntryResponse)
async def update_meal_entry(
    meal_entry_id: int,
    meal_entry_data: MealEntryUpdate,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Update a meal entry."""
    meal_entry = meal_plan_service.update_meal_entry(meal_entry_id, meal_entry_data)
    if not meal_entry:
        raise HTTPException(status_code=404, detail="Meal entry not found")
    
    return meal_entry

@router.delete("/entries/{meal_entry_id}")
async def delete_meal_entry(
    meal_entry_id: int,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Delete a meal entry."""
    success = meal_plan_service.delete_meal_entry(meal_entry_id)
    if not success:
        raise HTTPException(status_code=404, detail="Meal entry not found")
    
    return {"message": "Meal entry deleted successfully"}

# Meal Components Endpoints
@router.post("/entries/{meal_entry_id}/components", response_model=MealComponentResponse)
async def create_meal_component(
    meal_entry_id: int,
    meal_component_data: MealComponentCreate,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Create a new meal component for a meal entry."""
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Only trainers can create meal components")
    
    meal_component = meal_plan_service.create_meal_component(meal_component_data, meal_entry_id)
    return meal_component

@router.get("/components/{meal_component_id}", response_model=MealComponentResponse)
async def get_meal_component(
    meal_component_id: int,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Get a specific meal component by ID."""
    meal_component = meal_plan_service.get_meal_component(meal_component_id)
    if not meal_component:
        raise HTTPException(status_code=404, detail="Meal component not found")
    
    return meal_component

@router.put("/components/{meal_component_id}", response_model=MealComponentResponse)
async def update_meal_component(
    meal_component_id: int,
    meal_component_data: MealComponentUpdate,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Update a meal component."""
    meal_component = meal_plan_service.update_meal_component(meal_component_id, meal_component_data)
    if not meal_component:
        raise HTTPException(status_code=404, detail="Meal component not found")
    
    return meal_component

@router.delete("/components/{meal_component_id}")
async def delete_meal_component(
    meal_component_id: int,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Delete a meal component."""
    success = meal_plan_service.delete_meal_component(meal_component_id)
    if not success:
        raise HTTPException(status_code=404, detail="Meal component not found")
    
    return {"message": "Meal component deleted successfully"}

# Meal Uploads Endpoints
@router.post("/uploads", response_model=MealUploadResponse)
async def create_meal_upload(
    meal_upload_data: MealUploadCreate,
    image: Optional[UploadFile] = File(None),
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Create a new meal upload with optional image."""
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Only clients can upload meal photos")
    
    meal_upload = meal_plan_service.create_meal_upload(meal_upload_data, current_user.id, image)
    return meal_upload

@router.post("/uploads/{meal_entry_id}/photo", response_model=MealUploadResponse)
async def upload_meal_photo(
    meal_entry_id: int,
    image: UploadFile = File(...),
    marked_ok: Optional[bool] = Query(None),
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Upload a photo for a specific meal entry."""
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Only clients can upload meal photos")
    
    meal_upload_data = MealUploadCreate(
        meal_entry_id=meal_entry_id,
        marked_ok=marked_ok
    )
    
    meal_upload = meal_plan_service.create_meal_upload(meal_upload_data, current_user.id, image)
    return meal_upload

@router.get("/uploads/{meal_upload_id}", response_model=MealUploadResponse)
async def get_meal_upload(
    meal_upload_id: int,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Get a specific meal upload by ID."""
    meal_upload = meal_plan_service.get_meal_upload(meal_upload_id)
    if not meal_upload:
        raise HTTPException(status_code=404, detail="Meal upload not found")
    
    return meal_upload

@router.put("/uploads/{meal_upload_id}", response_model=MealUploadResponse)
async def update_meal_upload(
    meal_upload_id: int,
    meal_upload_data: MealUploadUpdate,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Update a meal upload."""
    meal_upload = meal_plan_service.update_meal_upload(meal_upload_id, meal_upload_data)
    if not meal_upload:
        raise HTTPException(status_code=404, detail="Meal upload not found")
    
    return meal_upload

@router.delete("/uploads/{meal_upload_id}")
async def delete_meal_upload(
    meal_upload_id: int,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Delete a meal upload."""
    success = meal_plan_service.delete_meal_upload(meal_upload_id)
    if not success:
        raise HTTPException(status_code=404, detail="Meal upload not found")
    
    return {"message": "Meal upload deleted successfully"}

# Summary and Analytics Endpoints
@router.get("/summary/{client_id}/{target_date}", response_model=MealPlanSummary)
async def get_meal_plan_summary(
    client_id: int,
    target_date: date,
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Get meal plan summary for a specific client and date."""
    # Check permissions
    if current_user.role == UserRole.CLIENT and current_user.id != client_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    summary = meal_plan_service.get_meal_plan_summary(client_id, target_date)
    if not summary:
        raise HTTPException(status_code=404, detail="No meal plan found for this date")
    
    return summary

@router.get("/summary/today", response_model=MealPlanSummary)
async def get_today_meal_plan_summary(
    current_user: UserResponse = Depends(get_current_user),
    meal_plan_service: MealPlanService = Depends(get_meal_plan_service)
):
    """Get today's meal plan summary for the current user."""
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Only clients can view their meal summaries")
    
    today = date.today()
    summary = meal_plan_service.get_meal_plan_summary(current_user.id, today)
    if not summary:
        raise HTTPException(status_code=404, detail="No meal plan found for today")
    
    return summary 