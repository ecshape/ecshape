from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timedelta
from app.database import get_db
from app.services.nutrition_service import NutritionService
from app.schemas.nutrition import (
    NutritionPlanCreate, NutritionPlanUpdate, NutritionPlanResponse, NutritionPlanFilter,
    RecipeCreate, RecipeUpdate, RecipeResponse, RecipeFilter,
    PlannedMealCreate, PlannedMealUpdate, PlannedMealResponse,
    MealCompletionCreate, MealCompletionUpdate, MealCompletionResponse,
    WeighInCreate, WeighInUpdate, WeighInResponse, WeighInFilter,
    NutritionGoalsCreate, NutritionGoalsUpdate, NutritionGoalsResponse,
    DailyNutritionSummary, CompleteNutritionPlanResponse
)
from app.schemas.auth import UserResponse, UserRole
from app.auth.utils import get_current_user

router = APIRouter()

# Test endpoint
@router.get("/test")
async def test_nutrition_router():
    """Test endpoint for nutrition router."""
    return {"message": "Nutrition router working"}

# Helper function to get nutrition service
def get_nutrition_service(db: Session = Depends(get_db)) -> NutritionService:
    return NutritionService(db)

# Nutrition Plans Endpoints
@router.post("/plans", response_model=NutritionPlanResponse)
async def create_nutrition_plan(
    nutrition_plan_data: NutritionPlanCreate,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Create a new nutrition plan for a client."""
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Only trainers can create nutrition plans")
    
    nutrition_plan = nutrition_service.create_nutrition_plan(nutrition_plan_data, current_user.id)
    return nutrition_plan

@router.get("/plans", response_model=List[NutritionPlanResponse])
async def get_nutrition_plans(
    trainer_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Get nutrition plans with filtering and pagination."""
    filter_params = NutritionPlanFilter(
        trainer_id=trainer_id,
        client_id=client_id,
        search=search,
        page=page,
        size=size
    )
    
    nutrition_plans, total = nutrition_service.get_nutrition_plans(filter_params)
    return nutrition_plans

@router.get("/plans/{nutrition_plan_id}", response_model=NutritionPlanResponse)
async def get_nutrition_plan(
    nutrition_plan_id: int,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Get a specific nutrition plan by ID."""
    nutrition_plan = nutrition_service.get_nutrition_plan(nutrition_plan_id)
    if not nutrition_plan:
        raise HTTPException(status_code=404, detail="Nutrition plan not found")
    
    return nutrition_plan

@router.get("/plans/{nutrition_plan_id}/complete", response_model=CompleteNutritionPlanResponse)
async def get_complete_nutrition_plan(
    nutrition_plan_id: int,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Get a complete nutrition plan with all planned meals."""
    nutrition_plan = nutrition_service.get_nutrition_plan(nutrition_plan_id)
    if not nutrition_plan:
        raise HTTPException(status_code=404, detail="Nutrition plan not found")
    
    planned_meals = nutrition_service.get_planned_meals_by_plan(nutrition_plan_id)
    
    # Create complete response
    complete_plan = CompleteNutritionPlanResponse(
        id=nutrition_plan.id,
        trainer_id=nutrition_plan.trainer_id,
        client_id=nutrition_plan.client_id,
        name=nutrition_plan.name,
        description=nutrition_plan.description,
        daily_calories=nutrition_plan.daily_calories,
        protein_target=nutrition_plan.protein_target,
        carbs_target=nutrition_plan.carbs_target,
        fat_target=nutrition_plan.fat_target,
        start_date=nutrition_plan.start_date,
        end_date=nutrition_plan.end_date,
        created_at=nutrition_plan.created_at,
        updated_at=nutrition_plan.updated_at,
        planned_meals=planned_meals
    )
    
    return complete_plan

@router.put("/plans/{nutrition_plan_id}", response_model=NutritionPlanResponse)
async def update_nutrition_plan(
    nutrition_plan_id: int,
    nutrition_plan_data: NutritionPlanUpdate,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Update a nutrition plan."""
    nutrition_plan = nutrition_service.update_nutrition_plan(nutrition_plan_id, nutrition_plan_data)
    if not nutrition_plan:
        raise HTTPException(status_code=404, detail="Nutrition plan not found")
    
    return nutrition_plan

@router.delete("/plans/{nutrition_plan_id}")
async def delete_nutrition_plan(
    nutrition_plan_id: int,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Delete a nutrition plan."""
    success = nutrition_service.delete_nutrition_plan(nutrition_plan_id)
    if not success:
        raise HTTPException(status_code=404, detail="Nutrition plan not found")
    
    return {"message": "Nutrition plan deleted successfully"}

# Recipe Endpoints
@router.post("/recipes", response_model=RecipeResponse)
async def create_recipe(
    recipe_data: RecipeCreate,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Create a new recipe."""
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Only trainers can create recipes")
    
    recipe = nutrition_service.create_recipe(recipe_data, current_user.id)
    return recipe

@router.get("/recipes", response_model=List[RecipeResponse])
async def get_recipes(
    trainer_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Get recipes with filtering and pagination."""
    filter_params = RecipeFilter(
        trainer_id=trainer_id,
        search=search,
        page=page,
        size=size
    )
    
    recipes, total = nutrition_service.get_recipes(filter_params)
    return recipes

@router.get("/recipes/{recipe_id}", response_model=RecipeResponse)
async def get_recipe(
    recipe_id: int,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Get a specific recipe by ID."""
    recipe = nutrition_service.get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    return recipe

@router.put("/recipes/{recipe_id}", response_model=RecipeResponse)
async def update_recipe(
    recipe_id: int,
    recipe_data: RecipeUpdate,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Update a recipe."""
    recipe = nutrition_service.update_recipe(recipe_id, recipe_data)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    return recipe

@router.delete("/recipes/{recipe_id}")
async def delete_recipe(
    recipe_id: int,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Delete a recipe."""
    success = nutrition_service.delete_recipe(recipe_id)
    if not success:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    return {"message": "Recipe deleted successfully"}

# Planned Meals Endpoints
@router.post("/planned-meals", response_model=PlannedMealResponse)
async def create_planned_meal(
    planned_meal_data: PlannedMealCreate,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Create a new planned meal."""
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Only trainers can create planned meals")
    
    planned_meal = nutrition_service.create_planned_meal(planned_meal_data)
    return planned_meal

@router.get("/planned-meals/{planned_meal_id}", response_model=PlannedMealResponse)
async def get_planned_meal(
    planned_meal_id: int,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Get a specific planned meal by ID."""
    planned_meal = nutrition_service.get_planned_meal(planned_meal_id)
    if not planned_meal:
        raise HTTPException(status_code=404, detail="Planned meal not found")
    
    return planned_meal

@router.put("/planned-meals/{planned_meal_id}", response_model=PlannedMealResponse)
async def update_planned_meal(
    planned_meal_id: int,
    planned_meal_data: PlannedMealUpdate,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Update a planned meal."""
    planned_meal = nutrition_service.update_planned_meal(planned_meal_id, planned_meal_data)
    if not planned_meal:
        raise HTTPException(status_code=404, detail="Planned meal not found")
    
    return planned_meal

@router.delete("/planned-meals/{planned_meal_id}")
async def delete_planned_meal(
    planned_meal_id: int,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Delete a planned meal."""
    success = nutrition_service.delete_planned_meal(planned_meal_id)
    if not success:
        raise HTTPException(status_code=404, detail="Planned meal not found")
    
    return {"message": "Planned meal deleted successfully"}

# Meal Completion Endpoints
@router.post("/meal-completions", response_model=MealCompletionResponse)
async def create_meal_completion(
    meal_completion_data: MealCompletionCreate,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Create a new meal completion."""
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Only clients can create meal completions")
    
    meal_completion = nutrition_service.create_meal_completion(meal_completion_data, current_user.id)
    return meal_completion

@router.get("/meal-completions/{meal_completion_id}", response_model=MealCompletionResponse)
async def get_meal_completion(
    meal_completion_id: int,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Get a specific meal completion by ID."""
    meal_completion = nutrition_service.get_meal_completion(meal_completion_id)
    if not meal_completion:
        raise HTTPException(status_code=404, detail="Meal completion not found")
    
    return meal_completion

@router.put("/meal-completions/{meal_completion_id}", response_model=MealCompletionResponse)
async def update_meal_completion(
    meal_completion_id: int,
    meal_completion_data: MealCompletionUpdate,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Update a meal completion."""
    meal_completion = nutrition_service.update_meal_completion(meal_completion_id, meal_completion_data)
    if not meal_completion:
        raise HTTPException(status_code=404, detail="Meal completion not found")
    
    return meal_completion

@router.delete("/meal-completions/{meal_completion_id}")
async def delete_meal_completion(
    meal_completion_id: int,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Delete a meal completion."""
    success = nutrition_service.delete_meal_completion(meal_completion_id)
    if not success:
        raise HTTPException(status_code=404, detail="Meal completion not found")
    
    return {"message": "Meal completion deleted successfully"}

# Photo Upload Endpoints
@router.post("/meal-completions/{meal_completion_id}/photo")
async def upload_meal_photo(
    meal_completion_id: int,
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Upload a photo for a meal completion with enhanced file management."""
    from app.services.file_service import FileService
    from app.services.websocket_service import websocket_service
    
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Only clients can upload meal photos")
    
    # Verify meal completion exists and belongs to user
    meal_completion = nutrition_service.get_meal_completion(meal_completion_id)
    if not meal_completion:
        raise HTTPException(status_code=404, detail="Meal completion not found")
    
    if meal_completion.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        # Use FileService for enhanced file handling
        file_service = FileService()
        
        # Save file with proper organization and processing
        file_result = await file_service.save_file(
            file=file,
            category="meal_photo",
            entity_id=meal_completion_id,
            process_image=True
        )
        
        # Update meal completion with photo path
        photo_path = nutrition_service.update_meal_photo(meal_completion_id, file_result["original_path"])
        
        # Send WebSocket notification
        await websocket_service.notify_file_upload(
            user_id=current_user.id,
            file_data={
                "filename": file_result["filename"],
                "file_size": file_result["file_size"],
                "mime_type": file_result["mime_type"],
                "meal_completion_id": meal_completion_id,
                "thumbnail_path": file_result.get("thumbnail_path"),
                "medium_path": file_result.get("medium_path")
            },
            file_type="meal_photo"
        )
        
        return {
            "photo_path": photo_path,
            "file_info": file_result,
            "message": "Photo uploaded and processed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading photo: {str(e)}")

# Weigh In Endpoints
@router.post("/weigh-ins", response_model=WeighInResponse)
async def create_weigh_in(
    weigh_in_data: WeighInCreate,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Create a new weigh in record."""
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Only clients can create weigh in records")
    
    weigh_in = nutrition_service.create_weigh_in(weigh_in_data, current_user.id)
    return weigh_in

@router.get("/weigh-ins", response_model=List[WeighInResponse])
async def get_weigh_ins(
    client_id: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Get weigh in records with filtering and pagination."""
    filter_params = WeighInFilter(
        client_id=client_id,
        start_date=start_date,
        end_date=end_date,
        page=page,
        size=size
    )
    
    weigh_ins, total = nutrition_service.get_weigh_ins(filter_params)
    return weigh_ins

@router.get("/weigh-ins/{weigh_in_id}", response_model=WeighInResponse)
async def get_weigh_in(
    weigh_in_id: int,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Get a specific weigh in record by ID."""
    weigh_in = nutrition_service.get_weigh_in(weigh_in_id)
    if not weigh_in:
        raise HTTPException(status_code=404, detail="Weigh in record not found")
    
    return weigh_in

@router.get("/weigh-ins/latest", response_model=WeighInResponse)
async def get_latest_weigh_in(
    client_id: Optional[int] = Query(None),
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Get the latest weigh in for a client."""
    target_client_id = client_id or current_user.id
    weigh_in = nutrition_service.get_latest_weigh_in(target_client_id)
    if not weigh_in:
        raise HTTPException(status_code=404, detail="No weigh in records found")
    
    return weigh_in

@router.put("/weigh-ins/{weigh_in_id}", response_model=WeighInResponse)
async def update_weigh_in(
    weigh_in_id: int,
    weigh_in_data: WeighInUpdate,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Update a weigh in record."""
    weigh_in = nutrition_service.update_weigh_in(weigh_in_id, weigh_in_data)
    if not weigh_in:
        raise HTTPException(status_code=404, detail="Weigh in record not found")
    
    return weigh_in

@router.delete("/weigh-ins/{weigh_in_id}")
async def delete_weigh_in(
    weigh_in_id: int,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Delete a weigh in record."""
    success = nutrition_service.delete_weigh_in(weigh_in_id)
    if not success:
        raise HTTPException(status_code=404, detail="Weigh in record not found")
    
    return {"message": "Weigh in record deleted successfully"}

# Nutrition Goals Endpoints
@router.post("/goals", response_model=NutritionGoalsResponse)
async def create_nutrition_goals(
    goals_data: NutritionGoalsCreate,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Create nutrition goals for a client."""
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Only clients can create nutrition goals")
    
    goals = nutrition_service.create_nutrition_goals(goals_data, current_user.id)
    return NutritionGoalsResponse(**goals)

@router.get("/goals", response_model=NutritionGoalsResponse)
async def get_nutrition_goals(
    client_id: Optional[int] = Query(None),
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Get nutrition goals for a client."""
    target_client_id = client_id or current_user.id
    goals = nutrition_service.get_nutrition_goals(target_client_id)
    if not goals:
        raise HTTPException(status_code=404, detail="Nutrition goals not found")
    
    return NutritionGoalsResponse(**goals)

@router.put("/goals", response_model=NutritionGoalsResponse)
async def update_nutrition_goals(
    goals_data: NutritionGoalsUpdate,
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Update nutrition goals for a client."""
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Only clients can update nutrition goals")
    
    goals = nutrition_service.update_nutrition_goals(current_user.id, goals_data)
    if not goals:
        raise HTTPException(status_code=404, detail="Nutrition goals not found")
    
    return NutritionGoalsResponse(**goals)

# Daily Nutrition Summary Endpoints
@router.get("/daily-summary", response_model=DailyNutritionSummary)
async def get_daily_nutrition_summary(
    target_date: date = Query(default_factory=date.today),
    client_id: Optional[int] = Query(None),
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Get daily nutrition summary for a client."""
    target_client_id = client_id or current_user.id
    summary = nutrition_service.get_daily_nutrition_summary(target_client_id, target_date)
    return summary

@router.get("/weekly-summary", response_model=List[DailyNutritionSummary])
async def get_weekly_nutrition_summary(
    start_date: date = Query(default_factory=lambda: date.today() - timedelta(days=6)),
    client_id: Optional[int] = Query(None),
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """Get weekly nutrition summary for a client."""
    target_client_id = client_id or current_user.id
    summaries = nutrition_service.get_weekly_nutrition_summary(target_client_id, start_date)
    return summaries

# Enhanced File Upload Endpoints for Sprint 5
@router.post("/photos/upload")
async def upload_nutrition_photo(
    file: UploadFile = File(...),
    meal_completion_id: Optional[int] = Query(None, description="Meal completion ID for meal photos"),
    progress_id: Optional[int] = Query(None, description="Progress record ID for progress photos"),
    current_user: UserResponse = Depends(get_current_user),
    nutrition_service: NutritionService = Depends(get_nutrition_service)
):
    """
    Enhanced photo upload endpoint for nutrition-related photos.
    Supports meal photos and progress photos with proper file management.
    """
    from app.services.file_service import FileService
    from app.services.websocket_service import websocket_service
    
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Only clients can upload nutrition photos")
    
    # Determine photo type and entity
    if meal_completion_id:
        category = "meal_photo"
        entity_id = meal_completion_id
        
        # Verify meal completion exists and belongs to user
        meal_completion = nutrition_service.get_meal_completion(meal_completion_id)
        if not meal_completion:
            raise HTTPException(status_code=404, detail="Meal completion not found")
        if meal_completion.client_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
            
    elif progress_id:
        category = "progress_photo"
        entity_id = progress_id
        
        # Note: You might want to add progress record verification here
        # For now, assuming progress records exist in your system
        
    else:
        raise HTTPException(status_code=400, detail="Must specify either meal_completion_id or progress_id")
    
    try:
        # Use FileService for enhanced file handling
        file_service = FileService()
        
        # Save file with proper organization and processing
        file_result = await file_service.save_file(
            file=file,
            category=category,
            entity_id=entity_id,
            process_image=True
        )
        
        # Update the relevant record with photo path
        if category == "meal_photo":
            nutrition_service.update_meal_photo(entity_id, file_result["original_path"])
        
        # Send WebSocket notification
        await websocket_service.notify_file_upload(
            user_id=current_user.id,
            file_data={
                "filename": file_result["filename"],
                "file_size": file_result["file_size"],
                "mime_type": file_result["mime_type"],
                "entity_id": entity_id,
                "category": category,
                "thumbnail_path": file_result.get("thumbnail_path"),
                "medium_path": file_result.get("medium_path")
            },
            file_type=category
        )
        
        return {
            "success": True,
            "file_info": file_result,
            "message": f"{category.replace('_', ' ').title()} uploaded and processed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading photo: {str(e)}")

@router.get("/photos/list")
async def list_nutrition_photos(
    meal_completion_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    current_user: UserResponse = Depends(get_current_user)
):
    """List nutrition-related photos for a user."""
    import os
    from pathlib import Path
    
    # Determine target client
    if current_user.role == UserRole.TRAINER and client_id:
        target_client_id = client_id
    else:
        target_client_id = current_user.id
    
    photo_list = []
    
    # List meal photos - use persistent path for Railway
    persistent_base = os.getenv("PERSISTENT_PATH", "/app/persistent")
    upload_dir = os.getenv("UPLOAD_DIR", os.path.join(persistent_base, "uploads"))
    
    # Try multiple possible locations
    possible_dirs = [
        os.path.join(upload_dir, "meal_photos"),  # Railway persistent
        f"{persistent_base}/uploads/meal_photos",  # Alternative persistent path
        "uploads/meal_photos",  # Local dev
        "/app/uploads/meal_photos",  # Legacy path
    ]
    
    meal_photos_dir = None
    for path in possible_dirs:
        if os.path.exists(path):
            meal_photos_dir = path
            break
    
    if meal_photos_dir:
        for filename in os.listdir(meal_photos_dir):
            if filename.startswith(f"meal_photo_{target_client_id}_") or (
                meal_completion_id and filename.startswith(f"meal_photo_{meal_completion_id}_")
            ):
                file_path = os.path.join(meal_photos_dir, filename)
                photo_info = {
                    "filename": filename,
                    "category": "meal_photo",
                    "size": os.path.getsize(file_path),
                    "created_at": os.path.getctime(file_path),
                    "url": f"/api/files/media/meal_photos/{filename}"
                }
                photo_list.append(photo_info)
    
    # List progress photos - use persistent path for Railway
    # Try multiple possible locations
    possible_dirs = [
        os.path.join(upload_dir, "progress_photos"),  # Railway persistent
        f"{persistent_base}/uploads/progress_photos",  # Alternative persistent path
        "uploads/progress_photos",  # Local dev
        "/app/uploads/progress_photos",  # Legacy path
    ]
    
    progress_photos_dir = None
    for path in possible_dirs:
        if os.path.exists(path):
            progress_photos_dir = path
            break
    
    if progress_photos_dir:
        for filename in os.listdir(progress_photos_dir):
            if filename.startswith(f"progress_photo_{target_client_id}_"):
                file_path = os.path.join(progress_photos_dir, filename)
                photo_info = {
                    "filename": filename,
                    "category": "progress_photo",
                    "size": os.path.getsize(file_path),
                    "created_at": os.path.getctime(file_path),
                    "url": f"/api/files/media/progress_photos/{filename}"
                }
                photo_list.append(photo_info)
    
    return {
        "photos": photo_list,
        "total": len(photo_list)
    } 