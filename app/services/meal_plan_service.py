from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from typing import List, Optional, Tuple
from datetime import date, datetime
import os
import uuid
from pathlib import Path

from app.models.nutrition import (
    MealPlan, MealEntry, MealComponent, MealUpload,
    ComponentType
)
from app.schemas.nutrition import (
    MealPlanCreate, MealPlanUpdate, MealPlanResponse, MealPlanFilter,
    MealEntryCreate, MealEntryUpdate, MealEntryResponse,
    MealComponentCreate, MealComponentUpdate, MealComponentResponse,
    MealUploadCreate, MealUploadUpdate, MealUploadResponse,
    CompleteMealPlanResponse, MealPlanSummary
)
from app.services.file_service import FileService

class MealPlanService:
    def __init__(self, db: Session):
        self.db = db
        self.file_service = FileService()

    def create_meal_plan(self, meal_plan_data: MealPlanCreate, trainer_id: int) -> MealPlanResponse:
        """Create a new meal plan with entries and components."""
        # Create the meal plan
        meal_plan = MealPlan(
            client_id=meal_plan_data.client_id,
            trainer_id=trainer_id,
            date=meal_plan_data.date,
            title=meal_plan_data.title,
            total_calories=meal_plan_data.total_calories,
            protein_target=meal_plan_data.protein_target,
            carb_target=meal_plan_data.carb_target,
            fat_target=meal_plan_data.fat_target,
            notes=meal_plan_data.notes
        )
        
        self.db.add(meal_plan)
        self.db.flush()  # Get the ID
        
        # Create meal entries and components
        for entry_data in meal_plan_data.meal_entries:
            meal_entry = MealEntry(
                meal_plan_id=meal_plan.id,
                name=entry_data.name,
                order_index=entry_data.order_index,
                notes=entry_data.notes
            )
            self.db.add(meal_entry)
            self.db.flush()  # Get the ID
            
            # Create meal components
            for component_data in entry_data.meal_components:
                meal_component = MealComponent(
                    meal_entry_id=meal_entry.id,
                    type=component_data.type,
                    description=component_data.description,
                    calories=component_data.calories,
                    protein=component_data.protein,
                    carbs=component_data.carbs,
                    fat=component_data.fat,
                    is_optional=component_data.is_optional
                )
                self.db.add(meal_component)
        
        self.db.commit()
        self.db.refresh(meal_plan)
        
        return self._meal_plan_to_response(meal_plan)

    def get_meal_plans(self, filter_params: MealPlanFilter) -> Tuple[List[MealPlanResponse], int]:
        """Get meal plans with filtering and pagination."""
        query = self.db.query(MealPlan)
        
        # Apply filters
        if filter_params.trainer_id:
            query = query.filter(MealPlan.trainer_id == filter_params.trainer_id)
        
        if filter_params.client_id:
            query = query.filter(MealPlan.client_id == filter_params.client_id)
        
        if filter_params.start_date:
            query = query.filter(MealPlan.date >= filter_params.start_date)
        
        if filter_params.end_date:
            query = query.filter(MealPlan.date <= filter_params.end_date)
        
        if filter_params.search:
            search_term = f"%{filter_params.search}%"
            query = query.filter(
                or_(
                    MealPlan.title.ilike(search_term),
                    MealPlan.notes.ilike(search_term)
                )
            )
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        offset = (filter_params.page - 1) * filter_params.size
        meal_plans = query.offset(offset).limit(filter_params.size).all()
        
        return [self._meal_plan_to_response(plan) for plan in meal_plans], total

    def get_meal_plan(self, meal_plan_id: int) -> Optional[MealPlanResponse]:
        """Get a specific meal plan by ID."""
        meal_plan = self.db.query(MealPlan).filter(MealPlan.id == meal_plan_id).first()
        if not meal_plan:
            return None
        
        return self._meal_plan_to_response(meal_plan)

    def get_complete_meal_plan(self, meal_plan_id: int) -> Optional[CompleteMealPlanResponse]:
        """Get a complete meal plan with uploads."""
        meal_plan = self.db.query(MealPlan).filter(MealPlan.id == meal_plan_id).first()
        if not meal_plan:
            return None
        
        # Get meal uploads for this plan
        meal_uploads = []
        for entry in meal_plan.meal_entries:
            uploads = self.db.query(MealUpload).filter(MealUpload.meal_entry_id == entry.id).all()
            meal_uploads.extend(uploads)
        
        response = self._meal_plan_to_response(meal_plan)
        return CompleteMealPlanResponse(
            **response.dict(),
            meal_uploads=[self._meal_upload_to_response(upload) for upload in meal_uploads]
        )

    def update_meal_plan(self, meal_plan_id: int, meal_plan_data: MealPlanUpdate) -> Optional[MealPlanResponse]:
        """Update a meal plan."""
        meal_plan = self.db.query(MealPlan).filter(MealPlan.id == meal_plan_id).first()
        if not meal_plan:
            return None
        
        # Update fields
        for field, value in meal_plan_data.dict(exclude_unset=True).items():
            setattr(meal_plan, field, value)
        
        self.db.commit()
        self.db.refresh(meal_plan)
        
        return self._meal_plan_to_response(meal_plan)

    def delete_meal_plan(self, meal_plan_id: int) -> bool:
        """Delete a meal plan."""
        meal_plan = self.db.query(MealPlan).filter(MealPlan.id == meal_plan_id).first()
        if not meal_plan:
            return False
        
        self.db.delete(meal_plan)
        self.db.commit()
        return True

    def create_meal_entry(self, meal_entry_data: MealEntryCreate, meal_plan_id: int) -> MealEntryResponse:
        """Create a new meal entry with components."""
        meal_entry = MealEntry(
            meal_plan_id=meal_plan_id,
            name=meal_entry_data.name,
            order_index=meal_entry_data.order_index,
            notes=meal_entry_data.notes
        )
        
        self.db.add(meal_entry)
        self.db.flush()  # Get the ID
        
        # Create meal components
        for component_data in meal_entry_data.meal_components:
            meal_component = MealComponent(
                meal_entry_id=meal_entry.id,
                type=component_data.type,
                description=component_data.description,
                calories=component_data.calories,
                protein=component_data.protein,
                carbs=component_data.carbs,
                fat=component_data.fat,
                is_optional=component_data.is_optional
            )
            self.db.add(meal_component)
        
        self.db.commit()
        self.db.refresh(meal_entry)
        
        return self._meal_entry_to_response(meal_entry)

    def get_meal_entry(self, meal_entry_id: int) -> Optional[MealEntryResponse]:
        """Get a specific meal entry by ID."""
        meal_entry = self.db.query(MealEntry).filter(MealEntry.id == meal_entry_id).first()
        if not meal_entry:
            return None
        
        return self._meal_entry_to_response(meal_entry)

    def update_meal_entry(self, meal_entry_id: int, meal_entry_data: MealEntryUpdate) -> Optional[MealEntryResponse]:
        """Update a meal entry."""
        meal_entry = self.db.query(MealEntry).filter(MealEntry.id == meal_entry_id).first()
        if not meal_entry:
            return None
        
        # Update fields
        for field, value in meal_entry_data.dict(exclude_unset=True).items():
            setattr(meal_entry, field, value)
        
        self.db.commit()
        self.db.refresh(meal_entry)
        
        return self._meal_entry_to_response(meal_entry)

    def delete_meal_entry(self, meal_entry_id: int) -> bool:
        """Delete a meal entry."""
        meal_entry = self.db.query(MealEntry).filter(MealEntry.id == meal_entry_id).first()
        if not meal_entry:
            return False
        
        self.db.delete(meal_entry)
        self.db.commit()
        return True

    def create_meal_component(self, meal_component_data: MealComponentCreate, meal_entry_id: int) -> MealComponentResponse:
        """Create a new meal component."""
        meal_component = MealComponent(
            meal_entry_id=meal_entry_id,
            type=meal_component_data.type,
            description=meal_component_data.description,
            calories=meal_component_data.calories,
            protein=meal_component_data.protein,
            carbs=meal_component_data.carbs,
            fat=meal_component_data.fat,
            is_optional=meal_component_data.is_optional
        )
        
        self.db.add(meal_component)
        self.db.commit()
        self.db.refresh(meal_component)
        
        return self._meal_component_to_response(meal_component)

    def get_meal_component(self, meal_component_id: int) -> Optional[MealComponentResponse]:
        """Get a specific meal component by ID."""
        meal_component = self.db.query(MealComponent).filter(MealComponent.id == meal_component_id).first()
        if not meal_component:
            return None
        
        return self._meal_component_to_response(meal_component)

    def update_meal_component(self, meal_component_id: int, meal_component_data: MealComponentUpdate) -> Optional[MealComponentResponse]:
        """Update a meal component."""
        meal_component = self.db.query(MealComponent).filter(MealComponent.id == meal_component_id).first()
        if not meal_component:
            return None
        
        # Update fields
        for field, value in meal_component_data.dict(exclude_unset=True).items():
            setattr(meal_component, field, value)
        
        self.db.commit()
        self.db.refresh(meal_component)
        
        return self._meal_component_to_response(meal_component)

    def delete_meal_component(self, meal_component_id: int) -> bool:
        """Delete a meal component."""
        meal_component = self.db.query(MealComponent).filter(MealComponent.id == meal_component_id).first()
        if not meal_component:
            return False
        
        self.db.delete(meal_component)
        self.db.commit()
        return True

    def create_meal_upload(self, meal_upload_data: MealUploadCreate, client_id: int, image_file=None) -> MealUploadResponse:
        """Create a new meal upload with optional image."""
        # Handle image upload if provided
        image_path = None
        if image_file:
            # Generate unique filename
            file_extension = Path(image_file.filename).suffix if image_file.filename else '.jpg'
            filename = f"meal_upload_{client_id}_{uuid.uuid4()}{file_extension}"
            
            # Save file using file service
            image_path = self.file_service.save_uploaded_file(
                image_file, 
                "meal_photos", 
                filename
            )
        
        meal_upload = MealUpload(
            client_id=client_id,
            meal_entry_id=meal_upload_data.meal_entry_id,
            image_path=image_path,
            marked_ok=meal_upload_data.marked_ok
        )
        
        self.db.add(meal_upload)
        self.db.commit()
        self.db.refresh(meal_upload)
        
        return self._meal_upload_to_response(meal_upload)

    def get_meal_upload(self, meal_upload_id: int) -> Optional[MealUploadResponse]:
        """Get a specific meal upload by ID."""
        meal_upload = self.db.query(MealUpload).filter(MealUpload.id == meal_upload_id).first()
        if not meal_upload:
            return None
        
        return self._meal_upload_to_response(meal_upload)

    def update_meal_upload(self, meal_upload_id: int, meal_upload_data: MealUploadUpdate) -> Optional[MealUploadResponse]:
        """Update a meal upload."""
        meal_upload = self.db.query(MealUpload).filter(MealUpload.id == meal_upload_id).first()
        if not meal_upload:
            return None
        
        # Update fields
        for field, value in meal_upload_data.dict(exclude_unset=True).items():
            setattr(meal_upload, field, value)
        
        self.db.commit()
        self.db.refresh(meal_upload)
        
        return self._meal_upload_to_response(meal_upload)

    def delete_meal_upload(self, meal_upload_id: int) -> bool:
        """Delete a meal upload."""
        meal_upload = self.db.query(MealUpload).filter(MealUpload.id == meal_upload_id).first()
        if not meal_upload:
            return False
        
        # Delete associated image file
        if meal_upload.image_path and os.path.exists(meal_upload.image_path):
            os.remove(meal_upload.image_path)
        
        self.db.delete(meal_upload)
        self.db.commit()
        return True

    def get_meal_plan_summary(self, client_id: int, target_date: date) -> Optional[MealPlanSummary]:
        """Get meal plan summary for a specific date."""
        meal_plan = self.db.query(MealPlan).filter(
            and_(
                MealPlan.client_id == client_id,
                MealPlan.date == target_date
            )
        ).first()
        
        if not meal_plan:
            return None
        
        # Count total and completed meals
        total_meals = len(meal_plan.meal_entries)
        completed_meals = 0
        total_calories = 0
        total_protein = 0
        total_carbs = 0
        total_fat = 0
        
        for entry in meal_plan.meal_entries:
            # Check if meal is completed (has upload)
            upload = self.db.query(MealUpload).filter(MealUpload.meal_entry_id == entry.id).first()
            if upload and upload.marked_ok:
                completed_meals += 1
            
            # Calculate totals from components
            for component in entry.meal_components:
                if component.calories:
                    total_calories += component.calories
                if component.protein:
                    total_protein += component.protein
                if component.carbs:
                    total_carbs += component.carbs
                if component.fat:
                    total_fat += component.fat
        
        completion_rate = (completed_meals / total_meals * 100) if total_meals > 0 else 0
        
        return MealPlanSummary(
            date=target_date,
            total_meals=total_meals,
            completed_meals=completed_meals,
            total_calories=total_calories,
            total_protein=total_protein,
            total_carbs=total_carbs,
            total_fat=total_fat,
            completion_rate=completion_rate
        )

    # Helper methods for converting models to responses
    def _meal_plan_to_response(self, meal_plan: MealPlan) -> MealPlanResponse:
        """Convert MealPlan model to MealPlanResponse."""
        return MealPlanResponse(
            id=meal_plan.id,
            client_id=meal_plan.client_id,
            trainer_id=meal_plan.trainer_id,
            date=meal_plan.date,
            title=meal_plan.title,
            total_calories=meal_plan.total_calories,
            protein_target=meal_plan.protein_target,
            carb_target=meal_plan.carb_target,
            fat_target=meal_plan.fat_target,
            notes=meal_plan.notes,
            created_at=meal_plan.created_at,
            meal_entries=[self._meal_entry_to_response(entry) for entry in meal_plan.meal_entries]
        )

    def _meal_entry_to_response(self, meal_entry: MealEntry) -> MealEntryResponse:
        """Convert MealEntry model to MealEntryResponse."""
        return MealEntryResponse(
            id=meal_entry.id,
            meal_plan_id=meal_entry.meal_plan_id,
            name=meal_entry.name,
            order_index=meal_entry.order_index,
            notes=meal_entry.notes,
            meal_components=[self._meal_component_to_response(component) for component in meal_entry.meal_components]
        )

    def _meal_component_to_response(self, meal_component: MealComponent) -> MealComponentResponse:
        """Convert MealComponent model to MealComponentResponse."""
        return MealComponentResponse(
            id=meal_component.id,
            meal_entry_id=meal_component.meal_entry_id,
            type=meal_component.type,
            description=meal_component.description,
            calories=meal_component.calories,
            protein=meal_component.protein,
            carbs=meal_component.carbs,
            fat=meal_component.fat,
            is_optional=meal_component.is_optional
        )

    def _meal_upload_to_response(self, meal_upload: MealUpload) -> MealUploadResponse:
        """Convert MealUpload model to MealUploadResponse."""
        return MealUploadResponse(
            id=meal_upload.id,
            client_id=meal_upload.client_id,
            meal_entry_id=meal_upload.meal_entry_id,
            image_path=meal_upload.image_path,
            marked_ok=meal_upload.marked_ok,
            uploaded_at=meal_upload.uploaded_at
        ) 