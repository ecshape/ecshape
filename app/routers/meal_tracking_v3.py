"""
Meal Tracking V3 API router.

This router exposes a new `/api/v3/meals` namespace that the redesigned frontend can use without touching the
existing `/api/v2/meals` flow.

Initial implementation is backed by Meal System V2 tables and logic.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.auth.utils import get_current_user
from app.schemas.auth import UserResponse, UserRole
from app.models.user import User
from app.models.meal_system import (
    MealPlanV2,
    MealSlot,
    MacroCategory,
    FoodOption,
    ClientMealChoice,
    MealCompletionStatus,
    MealBank,
    MacroType,
    MeasurementType,
)
from app.schemas.meal_system import (
    CompleteMealPlanCreate,
    MealPlanResponse,
    ClientMealChoiceCreate,
    ClientMealChoiceUpdate,
    ClientMealChoiceResponse,
    MealBankResponse,
    DailyMealHistoryResponse,
    MealCompletionStatusCreate,
    MealCompletionStatusResponse,
)
from app.schemas.meal_tracking_v3 import (
    V3CompleteMealPlanCreate,
    V3MealLogCreateRequest,
    V3DayViewResponse,
    V3FoodCatalogItemResponse,
    V3DailyMacrosResponse,
    V3MealPlanResponse,
)

from app.services.meal_tracking_v3_service import (
    _parse_v3_date_to_day,
    _compute_daily_macros_v3,
    build_v3_day_slots_view,
    _food_option_to_v3_food,
)

router = APIRouter(tags=["Meal Tracking V3"])


def _parse_v3_date_to_choice_datetime(date_str: str) -> datetime:
    """
    Store a choice at mid-day UTC so it reliably belongs to the target calendar date.
    """
    day = _parse_v3_date_to_day(date_str)
    return day.replace(hour=12, minute=0, second=0, microsecond=0)


def _resolve_target_client_id(
    current_user: UserResponse,
    client_id: Optional[int],
) -> int:
    if current_user.role == UserRole.CLIENT:
        return current_user.id

    if current_user.role in {UserRole.TRAINER, UserRole.ADMIN}:
        if not client_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="client_id is required")
        client = None
        if current_user.role == UserRole.TRAINER:
            client = (
                joinedload(User)
            )
        # Simple permission checks using existing semantics:
        from app.models.user import User as UserModel

        client_obj = current_user.id
        client = None
        client = None
        # We'll implement directly with a DB query inside endpoints instead (to keep this helper dumb).
        raise HTTPException(status_code=500, detail="Internal error: resolve_target_client_id should be called from endpoints")

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")


@router.get("/catalog", response_model=List[V3FoodCatalogItemResponse])
def get_food_catalog(
    macro_type: Optional[MacroType] = None,
    include_public: bool = True,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    v3 catalog endpoint used for swap selection.
    """
    query = db.query(MealBank)

    if macro_type is not None:
        query = query.filter(MealBank.macro_type == macro_type)

    if current_user.role in {UserRole.TRAINER, UserRole.ADMIN} and include_public:
        query = query.filter((MealBank.is_public == True) | (MealBank.created_by == current_user.id))  # noqa
    elif current_user.role == UserRole.CLIENT and include_public:
        # Trainees see public bank items plus their trainer's private meal-bank entries.
        trainer_id: Optional[int] = None
        active_plan = (
            db.query(MealPlanV2)
            .filter(MealPlanV2.client_id == current_user.id, MealPlanV2.is_active == True)
            .first()
        )
        if active_plan:
            trainer_id = active_plan.trainer_id
        if trainer_id is not None:
            query = query.filter((MealBank.is_public == True) | (MealBank.created_by == trainer_id))  # noqa
        else:
            query = query.filter(MealBank.is_public == True)
    elif include_public:
        query = query.filter(MealBank.is_public == True)

    items = query.order_by(MealBank.macro_type, MealBank.name).all()

    # Response mapping is done explicitly to keep v3 stable even if v2 shapes change.
    payload: List[V3FoodCatalogItemResponse] = []
    for item in items:
        payload.append(
            V3FoodCatalogItemResponse(
                id=item.id,
                name=item.name,
                name_hebrew=item.name_hebrew,
                calories=item.calories,
                protein=item.protein,
                carbs=item.carbs,
                fat=item.fat,
                serving_size=item.serving_size,
                measurement_type=item.measurement_type,
                notes=None,
                is_public=item.is_public,
                created_by=item.created_by,
                macro_type=item.macro_type,
            )
        )
    return payload


@router.post("/plans", response_model=V3MealPlanResponse, status_code=status.HTTP_201_CREATED)
def create_or_update_complete_plan(
    plan_data: V3CompleteMealPlanCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Trainer endpoint: create/replace the complete meal plan in v3.

    Backed by V2 tables using the existing V2 complete-plan creation semantics.
    """
    if current_user.role not in {UserRole.TRAINER, UserRole.ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only trainers can create meal plans")

    existing_plan = (
        db.query(MealPlanV2)
        .filter(MealPlanV2.client_id == plan_data.client_id, MealPlanV2.is_active == True)
        .first()
    )

    if existing_plan:
        if current_user.role == UserRole.TRAINER and existing_plan.trainer_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Client already has an active meal plan from another trainer")

        existing_plan.name = plan_data.name
        existing_plan.description = plan_data.description
        existing_plan.number_of_meals = plan_data.number_of_meals
        existing_plan.total_calories = plan_data.total_calories
        existing_plan.protein_target = plan_data.protein_target
        existing_plan.carb_target = plan_data.carb_target
        existing_plan.fat_target = plan_data.fat_target
        existing_plan.trainer_id = current_user.id
        existing_plan.is_active = True
        existing_plan.start_date = plan_data.start_date
        existing_plan.end_date = plan_data.end_date

        # Replace structure
        existing_plan.meal_slots.clear()
        db.flush()

        target_plan = existing_plan
    else:
        target_plan = MealPlanV2(
            client_id=plan_data.client_id,
            trainer_id=current_user.id,
            name=plan_data.name,
            description=plan_data.description,
            number_of_meals=plan_data.number_of_meals,
            total_calories=plan_data.total_calories,
            protein_target=plan_data.protein_target,
            carb_target=plan_data.carb_target,
            fat_target=plan_data.fat_target,
            is_active=True,
            start_date=plan_data.start_date,
            end_date=plan_data.end_date,
        )
        db.add(target_plan)
        db.flush()

    # Create slots/cats/foods
    for order_index, slot_data in enumerate(plan_data.meal_slots):
        meal_slot = MealSlot(
            meal_plan_id=target_plan.id,
            name=slot_data.name,
            order_index=order_index,
            time_suggestion=slot_data.time_suggestion,
            target_calories=slot_data.target_calories,
            target_protein=slot_data.target_protein,
            target_carbs=slot_data.target_carbs,
            target_fat=slot_data.target_fat,
            notes=slot_data.notes,
        )
        db.add(meal_slot)
        db.flush()

        for macro_data in slot_data.macro_categories:
            macro_category = MacroCategory(
                meal_slot_id=meal_slot.id,
                macro_type=macro_data.macro_type,
                quantity_instruction=macro_data.quantity_instruction,
                calorie_goal=macro_data.calorie_goal,
                track_cross_macros=bool(macro_data.track_cross_macros),
                notes=macro_data.notes,
            )
            db.add(macro_category)
            db.flush()

            for food_index, food_data in enumerate(macro_data.food_options):
                food_option = FoodOption(
                    macro_category_id=macro_category.id,
                    name=food_data.name,
                    name_hebrew=food_data.name_hebrew,
                    calories=food_data.calories,
                    protein=food_data.protein,
                    carbs=food_data.carbs,
                    fat=food_data.fat,
                    serving_size=food_data.serving_size,
                    measurement_type=food_data.measurement_type,
                    notes=food_data.notes,
                    order_index=food_index,
                )
                db.add(food_option)

    db.commit()
    db.refresh(target_plan)

    # Hydrate nested response eagerly.
    target_plan = (
        db.query(MealPlanV2)
        .options(
            joinedload(MealPlanV2.meal_slots)
            .joinedload(MealSlot.macro_categories)
            .joinedload(MacroCategory.food_options)
        )
        .filter(MealPlanV2.id == target_plan.id)
        .first()
    )

    return V3MealPlanResponse.model_validate(target_plan)


@router.get("/plans", response_model=List[V3MealPlanResponse])
def list_plans(
    client_id: Optional[int] = None,
    active_only: bool = True,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(MealPlanV2)

    if current_user.role == UserRole.CLIENT:
        query = query.filter(MealPlanV2.client_id == current_user.id)
    elif current_user.role == UserRole.TRAINER:
        if client_id:
            from app.models.user import User as UserModel

            client = db.query(UserModel).filter(UserModel.id == client_id).first()
            if not client or client.trainer_id != current_user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your clients' meal plans")
            query = query.filter(MealPlanV2.client_id == client_id)
        else:
            query = query.filter(MealPlanV2.trainer_id == current_user.id)

    if active_only:
        query = query.filter(MealPlanV2.is_active == True)

    plans = (
        query.options(
            joinedload(MealPlanV2.meal_slots)
            .joinedload(MealSlot.macro_categories)
            .joinedload(MacroCategory.food_options)
        )
        .order_by(MealPlanV2.updated_at.desc() if hasattr(MealPlanV2, "updated_at") else MealPlanV2.id.desc())
        .all()
    )

    return [V3MealPlanResponse.model_validate(p) for p in plans]


@router.get("/plans/{plan_id}", response_model=V3MealPlanResponse)
def get_plan(
    plan_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = (
        db.query(MealPlanV2)
        .options(
            joinedload(MealPlanV2.meal_slots)
            .joinedload(MealSlot.macro_categories)
            .joinedload(MacroCategory.food_options)
        )
        .filter(MealPlanV2.id == plan_id)
        .first()
    )

    if not plan:
        raise HTTPException(status_code=404, detail="Meal plan not found")

    if current_user.role == UserRole.CLIENT and plan.client_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    if current_user.role == UserRole.TRAINER:
        from app.models.user import User as UserModel

        client = db.query(UserModel).filter(UserModel.id == plan.client_id).first()
        if not client or client.trainer_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your clients' meal plans")

    return V3MealPlanResponse.model_validate(plan)


def _select_meal_plan_v3_for_day(
    db: Session,
    target_client_id: int,
    target_day: datetime,
) -> Optional[MealPlanV2]:
    """
    Select the correct `MealPlanV2` version for a requested day.

    Priority order:
    1) Infer from slot-based `ClientMealChoice` rows for that day.
    2) If none exist, infer from `MealCompletionStatus` rows for that day.
    3) If still none exist, infer from `MealPlanV2.start_date/end_date`.
    4) Fall back to the current active plan.
    """
    start_of_day = target_day.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)

    slot_choice = (
        db.query(ClientMealChoice)
        .filter(
            ClientMealChoice.client_id == target_client_id,
            ClientMealChoice.date >= start_of_day,
            ClientMealChoice.date < end_of_day,
            ClientMealChoice.meal_slot_id != None,
        )
        .order_by(ClientMealChoice.date.desc())
        .first()
    )
    if slot_choice and slot_choice.meal_slot_id:
        slot = (
            db.query(MealSlot)
            .options(joinedload(MealSlot.meal_plan))
            .filter(MealSlot.id == slot_choice.meal_slot_id)
            .first()
        )
        if slot and slot.meal_plan:
            return (
                db.query(MealPlanV2)
                .options(
                    joinedload(MealPlanV2.meal_slots)
                    .joinedload(MealSlot.macro_categories)
                    .joinedload(MacroCategory.food_options)
                )
                .filter(MealPlanV2.id == slot.meal_plan.id)
                .first()
            )

    completion_choice = (
        db.query(MealCompletionStatus)
        .filter(
            MealCompletionStatus.client_id == target_client_id,
            MealCompletionStatus.date >= start_of_day,
            MealCompletionStatus.date < end_of_day,
            MealCompletionStatus.meal_slot_id != None,
        )
        .order_by(MealCompletionStatus.date.desc())
        .first()
    )
    if completion_choice and completion_choice.meal_slot_id:
        slot = (
            db.query(MealSlot)
            .options(joinedload(MealSlot.meal_plan))
            .filter(MealSlot.id == completion_choice.meal_slot_id)
            .first()
        )
        if slot and slot.meal_plan:
            return (
                db.query(MealPlanV2)
                .options(
                    joinedload(MealPlanV2.meal_slots)
                    .joinedload(MealSlot.macro_categories)
                    .joinedload(MacroCategory.food_options)
                )
                .filter(MealPlanV2.id == slot.meal_plan.id)
                .first()
            )

    plan = (
        db.query(MealPlanV2)
        .options(
            joinedload(MealPlanV2.meal_slots)
            .joinedload(MealSlot.macro_categories)
            .joinedload(MacroCategory.food_options)
        )
        .filter(MealPlanV2.client_id == target_client_id)
        .filter(MealPlanV2.start_date <= start_of_day)
        .filter((MealPlanV2.end_date == None) | (MealPlanV2.end_date > start_of_day))
        .order_by(MealPlanV2.start_date.desc())
        .first()
    )
    if plan:
        return plan

    return (
        db.query(MealPlanV2)
        .options(
            joinedload(MealPlanV2.meal_slots)
            .joinedload(MealSlot.macro_categories)
            .joinedload(MacroCategory.food_options)
        )
        .filter(MealPlanV2.client_id == target_client_id, MealPlanV2.is_active == True)
        .first()
    )


@router.get("/day/summary", response_model=V3DailyMacrosResponse)
def get_day_summary(
    date: str,
    client_id: Optional[int] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_client_id: int = current_user.id
    if current_user.role == UserRole.TRAINER:
        if not client_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="client_id is required for trainer preview")
        from app.models.user import User as UserModel

        client = db.query(UserModel).filter(UserModel.id == client_id).first()
        if not client or client.trainer_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your clients' progress")
        target_client_id = client_id
    elif current_user.role == UserRole.ADMIN and client_id:
        target_client_id = client_id

    target_day = _parse_v3_date_to_day(date)
    plan = _select_meal_plan_v3_for_day(db=db, target_client_id=target_client_id, target_day=target_day)
    return _compute_daily_macros_v3(db=db, target_client_id=target_client_id, target_day=target_day, meal_plan=plan)


@router.get("/history", response_model=List[DailyMealHistoryResponse])
def get_history(
    client_id: Optional[int] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Minimal v3 wrapper around v2 daily history.
    """
    target_client_id = current_user.id if current_user.role == UserRole.CLIENT else (client_id or current_user.id)

    if current_user.role == UserRole.TRAINER:
        from app.models.user import User as UserModel

        client = db.query(UserModel).filter(UserModel.id == target_client_id).first()
        if not client or client.trainer_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your clients' history")

    from app.models.meal_system import DailyMealHistory

    rows = (
        db.query(DailyMealHistory)
        .filter(DailyMealHistory.client_id == target_client_id)
        .order_by(DailyMealHistory.date.desc())
        .all()
    )
    return [DailyMealHistoryResponse.model_validate(r) for r in rows]


@router.get("/day", response_model=V3DayViewResponse)
def get_v3_day_view(
    date: str,
    client_id: Optional[int] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Trainee day view for the new v3 UI.

    Initial implementation:
    - loads active v2 meal plan structure
    - returns daily macros from v2 daily-macros computation
    - returns raw choices for the day so the frontend can render custom selections
    """
    target_client_id: int = current_user.id
    if current_user.role == UserRole.TRAINER:
        if not client_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="client_id is required for trainer preview")
        from app.models.user import User as UserModel

        client = db.query(UserModel).filter(UserModel.id == client_id).first()
        if not client or client.trainer_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your clients' progress")
        target_client_id = client_id
    elif current_user.role == UserRole.ADMIN:
        if client_id:
            target_client_id = client_id

    target_day = _parse_v3_date_to_day(date)
    start_of_day = target_day
    end_of_day = start_of_day + timedelta(days=1)

    plan = _select_meal_plan_v3_for_day(db=db, target_client_id=target_client_id, target_day=target_day)

    if not plan:
        # No plan => still return daily macros with defaults and empty slots.
        daily_macros = _compute_daily_macros_v3(
            db=db,
            target_client_id=target_client_id,
            target_day=target_day,
            meal_plan=None,
        )
        return V3DayViewResponse(
            date=target_day.date().isoformat(),
            meal_plan=None,
            slots=[],
            daily_macros=daily_macros,
            choices=[],
        )

    # Load raw choices for the day.
    raw_choices: List[ClientMealChoice] = (
        db.query(ClientMealChoice)
        .filter(
            ClientMealChoice.client_id == target_client_id,
            ClientMealChoice.date >= start_of_day,
            ClientMealChoice.date < end_of_day,
        )
        .order_by(ClientMealChoice.date.desc())
        .all()
    )

    # Map raw choices for stable frontend contract.
    choices_payload = [ClientMealChoiceResponse.model_validate(c) for c in raw_choices]

    daily_macros = _compute_daily_macros_v3(
        db=db,
        target_client_id=target_client_id,
        target_day=target_day,
        meal_plan=plan,
    )
    slots = build_v3_day_slots_view(db=db, plan=plan, choices=raw_choices)

    return V3DayViewResponse(
        date=target_day.date().isoformat(),
        meal_plan=None,
        slots=slots,
        daily_macros=daily_macros,
        choices=choices_payload,
    )


def _normalize_completion_datetime_to_day(dt: datetime) -> datetime:
    """
    Match how v2 stores `MealCompletionStatus.date`: naive UTC start-of-day.
    """
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


@router.get("/completions", response_model=List[MealCompletionStatusResponse])
def get_v3_meal_completions(
    date: Optional[str] = None,
    client_id: Optional[int] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    v3 completion wrapper (used by the v3 UI to lock swapping after "Complete").
    Backed by v2 `MealCompletionStatus`.
    """
    if current_user.role == UserRole.CLIENT:
        target_client_id = current_user.id
    else:
        if client_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="client_id is required")
        target_client_id = client_id

        if current_user.role == UserRole.TRAINER:
            plan_exists = (
                db.query(MealPlanV2)
                .filter(
                    MealPlanV2.client_id == target_client_id,
                    MealPlanV2.trainer_id == current_user.id,
                    MealPlanV2.is_active == True,
                )
                .first()
            )
            if not plan_exists:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    target_date = _parse_v3_date_to_day(date) if date else datetime.utcnow()
    normalized_date = _normalize_completion_datetime_to_day(target_date)

    return [
        MealCompletionStatusResponse.model_validate(row)
        for row in (
            db.query(MealCompletionStatus)
            .filter(
                MealCompletionStatus.client_id == target_client_id,
                MealCompletionStatus.date == normalized_date,
            )
            .all()
        )
    ]


@router.post("/completions", response_model=MealCompletionStatusResponse)
def upsert_v3_meal_completion(
    completion_data: MealCompletionStatusCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create/update completion state for a (slot, day) pair.
    Backed by v2 `MealCompletionStatus`.
    """
    target_client_id = completion_data.client_id or current_user.id

    if current_user.role == UserRole.CLIENT and target_client_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    slot = (
        db.query(MealSlot)
        .options(joinedload(MealSlot.meal_plan))
        .filter(MealSlot.id == completion_data.meal_slot_id)
        .first()
    )

    if not slot or not slot.meal_plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal slot not found")

    if slot.meal_plan.client_id != target_client_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Meal slot does not belong to target client")

    if current_user.role == UserRole.TRAINER and slot.meal_plan.trainer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    normalized_date = _normalize_completion_datetime_to_day(completion_data.date)

    existing_status = (
        db.query(MealCompletionStatus)
        .filter(
            MealCompletionStatus.client_id == target_client_id,
            MealCompletionStatus.meal_slot_id == completion_data.meal_slot_id,
            MealCompletionStatus.date == normalized_date,
        )
        .first()
    )

    completed_at = datetime.utcnow() if completion_data.is_completed else None

    if existing_status:
        existing_status.is_completed = completion_data.is_completed
        existing_status.completion_method = completion_data.completion_method
        existing_status.completed_at = completed_at
        db.commit()
        db.refresh(existing_status)
        return MealCompletionStatusResponse.model_validate(existing_status)

    new_status = MealCompletionStatus(
        client_id=target_client_id,
        meal_slot_id=completion_data.meal_slot_id,
        date=normalized_date,
        is_completed=completion_data.is_completed,
        completion_method=completion_data.completion_method,
        completed_at=completed_at,
    )
    db.add(new_status)
    db.commit()
    db.refresh(new_status)
    return MealCompletionStatusResponse.model_validate(new_status)


@router.post("/logs", response_model=ClientMealChoiceResponse, status_code=status.HTTP_201_CREATED)
def create_v3_log(
    payload: V3MealLogCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a v3 log entry for the trainee.

    Backed by v2 `POST /v2/meals/choices`.
    """
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only clients can log meals")

    # v2 rule: either food_option_id or custom_food_name must exist
    if not payload.food_option_id and not payload.custom_food_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Either food_option_id or custom_food_name must be provided")

    if payload.food_option_id and not payload.meal_slot_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="meal_slot_id is required when logging a plan food option")

    date_dt = _parse_v3_date_to_choice_datetime(payload.date)

    choice = ClientMealChoice(
        client_id=current_user.id,
        food_option_id=payload.food_option_id,
        meal_slot_id=payload.meal_slot_id,
        date=date_dt,
        quantity=payload.quantity,
        photo_path=payload.photo_path,
        custom_food_name=payload.custom_food_name,
        custom_calories=payload.custom_calories,
        custom_protein=payload.custom_protein,
        custom_carbs=payload.custom_carbs,
        custom_fat=payload.custom_fat,
    )

    db.add(choice)
    db.commit()
    db.refresh(choice)

    return ClientMealChoiceResponse.model_validate(choice)


@router.put("/logs/{choice_id}", response_model=ClientMealChoiceResponse)
def update_v3_log(
    choice_id: int,
    choice_data: ClientMealChoiceUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role == UserRole.CLIENT:
        choice = db.query(ClientMealChoice).filter(ClientMealChoice.id == choice_id).first()
        if not choice:
            raise HTTPException(status_code=404, detail="Meal choice not found")
        if choice.client_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")

        for field, value in choice_data.dict(exclude_unset=True).items():
            setattr(choice, field, value)

        db.commit()
        db.refresh(choice)
        return ClientMealChoiceResponse.model_validate(choice)

    # Trainers/admins can update choices (v2 allows approval/comments)
    choice = db.query(ClientMealChoice).filter(ClientMealChoice.id == choice_id).first()
    if not choice:
        raise HTTPException(status_code=404, detail="Meal choice not found")

    for field, value in choice_data.dict(exclude_unset=True).items():
        setattr(choice, field, value)

    db.commit()
    db.refresh(choice)
    return ClientMealChoiceResponse.model_validate(choice)


@router.delete("/logs/{choice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_v3_log(
    choice_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    choice = db.query(ClientMealChoice).filter(ClientMealChoice.id == choice_id).first()
    if not choice:
        raise HTTPException(status_code=404, detail="Meal choice not found")

    if current_user.role == UserRole.CLIENT and choice.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(choice)
    db.commit()
    return None

