from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, func
from typing import List, Optional, Tuple
from datetime import datetime, date, timedelta
import os
import uuid
from fastapi import UploadFile, HTTPException
from app.models.nutrition import (
    NutritionPlan, Recipe, PlannedMeal, MealCompletion, WeighIn, MealType, MealStatus
)
from app.schemas.nutrition import (
    NutritionPlanCreate, NutritionPlanUpdate, NutritionPlanFilter,
    RecipeCreate, RecipeUpdate, RecipeFilter,
    PlannedMealCreate, PlannedMealUpdate,
    MealCompletionCreate, MealCompletionUpdate,
    WeighInCreate, WeighInUpdate, WeighInFilter,
    NutritionGoalsCreate, NutritionGoalsUpdate,
    DailyNutritionSummary
)

class NutritionService:
    def __init__(self, db: Session):
        self.db = db

    # Nutrition Plan Methods
    def create_nutrition_plan(self, nutrition_plan_data: NutritionPlanCreate, trainer_id: int) -> NutritionPlan:
        """Create a new nutrition plan for a client."""
        db_nutrition_plan = NutritionPlan(
            **nutrition_plan_data.model_dump(),
            trainer_id=trainer_id
        )
        self.db.add(db_nutrition_plan)
        self.db.commit()
        self.db.refresh(db_nutrition_plan)
        return db_nutrition_plan

    def get_nutrition_plan(self, nutrition_plan_id: int) -> Optional[NutritionPlan]:
        """Get a nutrition plan by ID."""
        return self.db.query(NutritionPlan).filter(NutritionPlan.id == nutrition_plan_id).first()

    def get_nutrition_plans(self, filter_params: NutritionPlanFilter) -> Tuple[List[NutritionPlan], int]:
        """Get nutrition plans with filtering and pagination."""
        query = self.db.query(NutritionPlan)
        
        if filter_params.trainer_id:
            query = query.filter(NutritionPlan.trainer_id == filter_params.trainer_id)
        
        if filter_params.client_id:
            query = query.filter(NutritionPlan.client_id == filter_params.client_id)
        
        if filter_params.search:
            search_term = f"%{filter_params.search}%"
            query = query.filter(
                or_(
                    NutritionPlan.name.ilike(search_term),
                    NutritionPlan.description.ilike(search_term)
                )
            )
        
        total = query.count()
        offset = (filter_params.page - 1) * filter_params.size
        nutrition_plans = query.offset(offset).limit(filter_params.size).all()
        
        return nutrition_plans, total

    def update_nutrition_plan(self, nutrition_plan_id: int, nutrition_plan_data: NutritionPlanUpdate) -> Optional[NutritionPlan]:
        """Update a nutrition plan."""
        db_nutrition_plan = self.get_nutrition_plan(nutrition_plan_id)
        if not db_nutrition_plan:
            return None
        
        update_data = nutrition_plan_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_nutrition_plan, field, value)
        
        self.db.commit()
        self.db.refresh(db_nutrition_plan)
        return db_nutrition_plan

    def delete_nutrition_plan(self, nutrition_plan_id: int) -> bool:
        """Delete a nutrition plan and all associated planned meals."""
        db_nutrition_plan = self.get_nutrition_plan(nutrition_plan_id)
        if not db_nutrition_plan:
            return False
        
        self.db.delete(db_nutrition_plan)
        self.db.commit()
        return True

    # Recipe Methods
    def create_recipe(self, recipe_data: RecipeCreate, trainer_id: int) -> Recipe:
        """Create a new recipe."""
        db_recipe = Recipe(
            **recipe_data.model_dump(),
            trainer_id=trainer_id
        )
        self.db.add(db_recipe)
        self.db.commit()
        self.db.refresh(db_recipe)
        return db_recipe

    def get_recipe(self, recipe_id: int) -> Optional[Recipe]:
        """Get a recipe by ID."""
        return self.db.query(Recipe).filter(Recipe.id == recipe_id).first()

    def get_recipes(self, filter_params: RecipeFilter) -> Tuple[List[Recipe], int]:
        """Get recipes with filtering and pagination."""
        query = self.db.query(Recipe)
        
        if filter_params.trainer_id:
            query = query.filter(Recipe.trainer_id == filter_params.trainer_id)
        
        if filter_params.search:
            search_term = f"%{filter_params.search}%"
            query = query.filter(
                or_(
                    Recipe.name.ilike(search_term),
                    Recipe.description.ilike(search_term),
                    Recipe.instructions.ilike(search_term)
                )
            )
        
        total = query.count()
        offset = (filter_params.page - 1) * filter_params.size
        recipes = query.offset(offset).limit(filter_params.size).all()
        
        return recipes, total

    def update_recipe(self, recipe_id: int, recipe_data: RecipeUpdate) -> Optional[Recipe]:
        """Update a recipe."""
        db_recipe = self.get_recipe(recipe_id)
        if not db_recipe:
            return None
        
        update_data = recipe_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_recipe, field, value)
        
        self.db.commit()
        self.db.refresh(db_recipe)
        return db_recipe

    def delete_recipe(self, recipe_id: int) -> bool:
        """Delete a recipe."""
        db_recipe = self.get_recipe(recipe_id)
        if not db_recipe:
            return False
        
        self.db.delete(db_recipe)
        self.db.commit()
        return True

    # Planned Meal Methods
    def create_planned_meal(self, planned_meal_data: PlannedMealCreate) -> PlannedMeal:
        """Create a new planned meal."""
        db_planned_meal = PlannedMeal(**planned_meal_data.model_dump())
        self.db.add(db_planned_meal)
        self.db.commit()
        self.db.refresh(db_planned_meal)
        return db_planned_meal

    def get_planned_meal(self, planned_meal_id: int) -> Optional[PlannedMeal]:
        """Get a planned meal by ID."""
        return self.db.query(PlannedMeal).options(
            joinedload(PlannedMeal.recipe)
        ).filter(PlannedMeal.id == planned_meal_id).first()

    def get_planned_meals_by_plan(self, nutrition_plan_id: int) -> List[PlannedMeal]:
        """Get all planned meals for a nutrition plan."""
        return self.db.query(PlannedMeal).options(
            joinedload(PlannedMeal.recipe)
        ).filter(
            PlannedMeal.nutrition_plan_id == nutrition_plan_id
        ).order_by(PlannedMeal.day_of_week, PlannedMeal.meal_type).all()

    def get_planned_meals_by_day(self, nutrition_plan_id: int, day_of_week: int) -> List[PlannedMeal]:
        """Get planned meals for a specific day of the week."""
        return self.db.query(PlannedMeal).options(
            joinedload(PlannedMeal.recipe)
        ).filter(
            PlannedMeal.nutrition_plan_id == nutrition_plan_id,
            PlannedMeal.day_of_week == day_of_week
        ).order_by(PlannedMeal.meal_type).all()

    def update_planned_meal(self, planned_meal_id: int, planned_meal_data: PlannedMealUpdate) -> Optional[PlannedMeal]:
        """Update a planned meal."""
        db_planned_meal = self.get_planned_meal(planned_meal_id)
        if not db_planned_meal:
            return None
        
        update_data = planned_meal_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_planned_meal, field, value)
        
        self.db.commit()
        self.db.refresh(db_planned_meal)
        return db_planned_meal

    def delete_planned_meal(self, planned_meal_id: int) -> bool:
        """Delete a planned meal."""
        db_planned_meal = self.get_planned_meal(planned_meal_id)
        if not db_planned_meal:
            return False
        
        self.db.delete(db_planned_meal)
        self.db.commit()
        return True

    # Meal Completion Methods
    def create_meal_completion(self, meal_completion_data: MealCompletionCreate, client_id: int) -> MealCompletion:
        """Create a new meal completion."""
        db_meal_completion = MealCompletion(
            **meal_completion_data.model_dump(),
            client_id=client_id
        )
        self.db.add(db_meal_completion)
        self.db.commit()
        self.db.refresh(db_meal_completion)
        return db_meal_completion

    def get_meal_completion(self, meal_completion_id: int) -> Optional[MealCompletion]:
        """Get a meal completion by ID."""
        return self.db.query(MealCompletion).filter(MealCompletion.id == meal_completion_id).first()

    def get_meal_completions_by_client(self, client_id: int, limit: int = 50) -> List[MealCompletion]:
        """Get meal completions for a client."""
        return self.db.query(MealCompletion).filter(
            MealCompletion.client_id == client_id
        ).order_by(MealCompletion.completed_at.desc()).limit(limit).all()

    def get_meal_completions_by_date(self, client_id: int, target_date: date) -> List[MealCompletion]:
        """Get meal completions for a specific date."""
        start_datetime = datetime.combine(target_date, datetime.min.time())
        end_datetime = datetime.combine(target_date, datetime.max.time())
        
        return self.db.query(MealCompletion).filter(
            MealCompletion.client_id == client_id,
            MealCompletion.completed_at >= start_datetime,
            MealCompletion.completed_at <= end_datetime
        ).order_by(MealCompletion.completed_at).all()

    def update_meal_completion(self, meal_completion_id: int, meal_completion_data: MealCompletionUpdate) -> Optional[MealCompletion]:
        """Update a meal completion."""
        db_meal_completion = self.get_meal_completion(meal_completion_id)
        if not db_meal_completion:
            return None
        
        update_data = meal_completion_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_meal_completion, field, value)
        
        self.db.commit()
        self.db.refresh(db_meal_completion)
        return db_meal_completion

    def delete_meal_completion(self, meal_completion_id: int) -> bool:
        """Delete a meal completion."""
        db_meal_completion = self.get_meal_completion(meal_completion_id)
        if not db_meal_completion:
            return False
        
        self.db.delete(db_meal_completion)
        self.db.commit()
        return True

    # Photo Upload Methods
    def save_meal_photo(self, file: UploadFile, meal_completion_id: int) -> str:
        """Save a meal photo and return the file path."""
        # Use persistent path for Railway, fallback to local for dev
        persistent_base = os.getenv("PERSISTENT_PATH", "/app/persistent")
        upload_dir = os.getenv("UPLOAD_DIR", os.path.join(persistent_base, "uploads"))
        meal_photos_dir = os.path.join(upload_dir, "meal_photos")
        os.makedirs(meal_photos_dir, exist_ok=True)
        
        file_extension = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
        unique_filename = f"meal_{meal_completion_id}_{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(meal_photos_dir, unique_filename)
        
        with open(file_path, "wb") as buffer:
            content = file.file.read()
            buffer.write(content)
        
        # Return just the filename for storage (consistent with progress photos)
        return unique_filename

    def update_meal_photo(self, meal_completion_id: int, file: UploadFile) -> Optional[str]:
        """Update the photo for a meal completion."""
        db_meal_completion = self.get_meal_completion(meal_completion_id)
        if not db_meal_completion:
            return None
        
        if db_meal_completion.photo_path and os.path.exists(db_meal_completion.photo_path):
            os.remove(db_meal_completion.photo_path)
        
        photo_path = self.save_meal_photo(file, meal_completion_id)
        
        db_meal_completion.photo_path = photo_path
        self.db.commit()
        self.db.refresh(db_meal_completion)
        
        return photo_path

    # Weigh In Methods
    def create_weigh_in(self, weigh_in_data: WeighInCreate, client_id: int) -> WeighIn:
        """Create a new weigh in record."""
        db_weigh_in = WeighIn(
            **weigh_in_data.model_dump(),
            client_id=client_id
        )
        self.db.add(db_weigh_in)
        self.db.commit()
        self.db.refresh(db_weigh_in)
        return db_weigh_in

    def get_weigh_in(self, weigh_in_id: int) -> Optional[WeighIn]:
        """Get a weigh in record by ID."""
        return self.db.query(WeighIn).filter(WeighIn.id == weigh_in_id).first()

    def get_weigh_ins(self, filter_params: WeighInFilter) -> Tuple[List[WeighIn], int]:
        """Get weigh in records with filtering and pagination."""
        query = self.db.query(WeighIn)
        
        if filter_params.client_id:
            query = query.filter(WeighIn.client_id == filter_params.client_id)
        
        if filter_params.start_date:
            query = query.filter(WeighIn.recorded_at >= filter_params.start_date)
        
        if filter_params.end_date:
            query = query.filter(WeighIn.recorded_at <= filter_params.end_date)
        
        total = query.count()
        offset = (filter_params.page - 1) * filter_params.size
        weigh_ins = query.order_by(WeighIn.recorded_at.desc()).offset(offset).limit(filter_params.size).all()
        
        return weigh_ins, total

    def get_latest_weigh_in(self, client_id: int) -> Optional[WeighIn]:
        """Get the latest weigh in for a client."""
        return self.db.query(WeighIn).filter(
            WeighIn.client_id == client_id
        ).order_by(WeighIn.recorded_at.desc()).first()

    def update_weigh_in(self, weigh_in_id: int, weigh_in_data: WeighInUpdate) -> Optional[WeighIn]:
        """Update a weigh in record."""
        db_weigh_in = self.get_weigh_in(weigh_in_id)
        if not db_weigh_in:
            return None
        
        update_data = weigh_in_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_weigh_in, field, value)
        
        self.db.commit()
        self.db.refresh(db_weigh_in)
        return db_weigh_in

    def delete_weigh_in(self, weigh_in_id: int) -> bool:
        """Delete a weigh in record."""
        db_weigh_in = self.get_weigh_in(weigh_in_id)
        if not db_weigh_in:
            return False
        
        self.db.delete(db_weigh_in)
        self.db.commit()
        return True

    # Nutrition Goals Methods
    def create_nutrition_goals(self, goals_data: NutritionGoalsCreate, client_id: int) -> dict:
        """Create nutrition goals for a client."""
        existing_goals = self.db.query(NutritionPlan).filter(
            NutritionPlan.client_id == client_id,
            NutritionPlan.end_date.is_(None)
        ).first()
        
        if existing_goals:
            update_data = goals_data.model_dump()
            for field, value in update_data.items():
                if value is not None:
                    setattr(existing_goals, field, value)
            
            self.db.commit()
            self.db.refresh(existing_goals)
            return {
                "id": existing_goals.id,
                "client_id": client_id,
                "daily_calories": existing_goals.daily_calories,
                "protein_target": existing_goals.protein_target,
                "carbs_target": existing_goals.carbs_target,
                "fat_target": existing_goals.fat_target,
                "created_at": existing_goals.created_at,
                "updated_at": existing_goals.updated_at
            }
        else:
            new_plan = NutritionPlan(
                client_id=client_id,
                trainer_id=client_id,
                name="Personal Nutrition Goals",
                description="Personal nutrition goals and targets",
                **goals_data.model_dump()
            )
            self.db.add(new_plan)
            self.db.commit()
            self.db.refresh(new_plan)
            
            return {
                "id": new_plan.id,
                "client_id": client_id,
                "daily_calories": new_plan.daily_calories,
                "protein_target": new_plan.protein_target,
                "carbs_target": new_plan.carbs_target,
                "fat_target": new_plan.fat_target,
                "created_at": new_plan.created_at,
                "updated_at": new_plan.updated_at
            }

    def get_nutrition_goals(self, client_id: int) -> Optional[dict]:
        """Get nutrition goals for a client."""
        nutrition_plan = self.db.query(NutritionPlan).filter(
            NutritionPlan.client_id == client_id,
            NutritionPlan.end_date.is_(None)
        ).first()
        
        if not nutrition_plan:
            return None
        
        return {
            "id": nutrition_plan.id,
            "client_id": client_id,
            "daily_calories": nutrition_plan.daily_calories,
            "protein_target": nutrition_plan.protein_target,
            "carbs_target": nutrition_plan.carbs_target,
            "fat_target": nutrition_plan.fat_target,
            "created_at": nutrition_plan.created_at,
            "updated_at": nutrition_plan.updated_at
        }

    def update_nutrition_goals(self, client_id: int, goals_data: NutritionGoalsUpdate) -> Optional[dict]:
        """Update nutrition goals for a client."""
        nutrition_plan = self.db.query(NutritionPlan).filter(
            NutritionPlan.client_id == client_id,
            NutritionPlan.end_date.is_(None)
        ).first()
        
        if not nutrition_plan:
            return None
        
        update_data = goals_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(nutrition_plan, field, value)
        
        self.db.commit()
        self.db.refresh(nutrition_plan)
        
        return {
            "id": nutrition_plan.id,
            "client_id": client_id,
            "daily_calories": nutrition_plan.daily_calories,
            "protein_target": nutrition_plan.protein_target,
            "carbs_target": nutrition_plan.carbs_target,
            "fat_target": nutrition_plan.fat_target,
            "created_at": nutrition_plan.created_at,
            "updated_at": nutrition_plan.updated_at
        }

    # Daily Nutrition Summary Methods
    def get_daily_nutrition_summary(self, client_id: int, target_date: date) -> DailyNutritionSummary:
        """Get daily nutrition summary for a client."""
        start_datetime = datetime.combine(target_date, datetime.min.time())
        end_datetime = datetime.combine(target_date, datetime.max.time())
        
        # Get meal completions for the day
        meal_completions = self.db.query(MealCompletion).options(
            joinedload(MealCompletion.planned_meal).joinedload(PlannedMeal.recipe)
        ).filter(
            MealCompletion.client_id == client_id,
            MealCompletion.completed_at >= start_datetime,
            MealCompletion.completed_at <= end_datetime,
            MealCompletion.status == MealStatus.COMPLETED
        ).all()
        
        # Calculate totals
        total_calories = 0
        total_protein = 0
        total_carbs = 0
        total_fat = 0
        
        for completion in meal_completions:
            if completion.planned_meal and completion.planned_meal.recipe:
                recipe = completion.planned_meal.recipe
                total_calories += recipe.calories or 0
                total_protein += recipe.protein or 0
                total_carbs += recipe.carbs or 0
                total_fat += recipe.fat or 0
        
        # Get nutrition goals
        goals = self.get_nutrition_goals(client_id)
        
        # Get total planned meals for the day
        total_meals = self.db.query(PlannedMeal).join(NutritionPlan).filter(
            NutritionPlan.client_id == client_id,
            PlannedMeal.day_of_week == target_date.weekday()
        ).count()
        
        return DailyNutritionSummary(
            date=start_datetime,
            total_calories=total_calories,
            total_protein=total_protein,
            total_carbs=total_carbs,
            total_fat=total_fat,
            completed_meals=len(meal_completions),
            total_meals=total_meals,
            goals=goals
        )

    def get_weekly_nutrition_summary(self, client_id: int, start_date: date) -> List[DailyNutritionSummary]:
        """Get weekly nutrition summary for a client."""
        summaries = []
        for i in range(7):
            current_date = start_date + timedelta(days=i)
            summary = self.get_daily_nutrition_summary(client_id, current_date)
            summaries.append(summary)
        return summaries 