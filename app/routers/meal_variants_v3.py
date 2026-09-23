"""
Meal Variants V3 API router.
Handles favorite foods, variant generation (AI + fallback), and variant selection.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_

from app.database import get_db
from app.auth.utils import get_current_user
from app.schemas.auth import UserResponse, UserRole
from app.models.user import User
from app.models.meal_system import (
    MealPlanV2,
    MealSlot,
    MealBank,
    ClientMealChoice,
    MacroType,
)
from app.models.meal_variants import (
    ClientFavoriteFood,
    MealVariant,
    MealVariantFood,
)
from app.schemas.meal_variants_v3 import (
    FavoriteFoodCreate,
    FavoriteFoodResponse,
    MealVariantResponse,
    DailyTargetsUpdate,
    DailyTargetsResponse,
    VariantGenerateRequest,
    VariantSelectRequest,
    VariantSelectResponse,
)
from app.services.meal_tracking_v3_service import (
    _parse_v3_date_to_choice_datetime,
    _compute_daily_macros_v3,
    build_v3_day_slots_view,
)
from app.services.meal_variant_solver import (
    MacroBudget,
    food_from_bank_values,
    solve_macro_targets,
    round_quantity,
    enum_value as _enum_value,
)
from app.services.meal_variant_ai_service import (
    compose_variants_with_claude,
    validate_and_clamp_variants,
    retry_with_error,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Meal Variants V3"])


# ===== Helper functions =====

def _require_coach(current_user: UserResponse) -> None:
    """Ensure user is TRAINER or ADMIN."""
    if current_user.role not in (UserRole.TRAINER, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only coaches can perform this action"
        )


def _assert_can_manage_client(
    db: Session,
    current_user: UserResponse,
    client_id: int,
) -> User:
    """
    Verify current user can manage this client.
    Returns the client User object.
    """
    client = db.query(User).filter(User.id == client_id).first()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )

    if current_user.role == UserRole.ADMIN:
        return client
    elif current_user.role == UserRole.TRAINER:
        if client.trainer_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot manage this client"
            )
        return client
    else:
        if client.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot view this client's data"
            )
        return client


def _get_meal_bank_visibility_filter(db: Session, current_user: UserResponse):
    """
    Return SQLAlchemy filter for visible meal_bank items.
    Trainers see: public + their own
    Clients see: public + their plan trainer's
    """
    if current_user.role == UserRole.ADMIN:
        return True  # No filter

    if current_user.role == UserRole.TRAINER:
        return MealBank.is_public | (MealBank.created_by == current_user.id)

    # CLIENT: see public + their trainer's
    # Find their trainer from active meal plan
    client_plan = db.query(MealPlanV2).filter(
        MealPlanV2.client_id == current_user.id,
        MealPlanV2.is_active == True,
    ).first()

    if not client_plan:
        return MealBank.is_public

    return MealBank.is_public | (MealBank.created_by == client_plan.trainer_id)


# ===== Targets endpoint =====

@router.put("/plans/{plan_id}/targets", response_model=DailyTargetsResponse)
def update_plan_targets(
    plan_id: int,
    targets: DailyTargetsUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update daily + per-meal targets.
    Returns drift (sum of meal targets - daily target).
    """
    _require_coach(current_user)

    plan = db.query(MealPlanV2).filter(MealPlanV2.id == plan_id).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal plan not found"
        )

    # Permission check
    if current_user.role == UserRole.TRAINER and plan.trainer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify this plan"
        )

    # Update daily targets
    plan.total_calories = targets.total_calories
    plan.protein_target = targets.protein_target
    plan.carb_target = targets.carb_target
    plan.fat_target = targets.fat_target

    # Update per-meal targets if provided. Match by meal_slot_id when the client sends
    # one; only fall back to list position for older clients that don't.
    if targets.meal_targets:
        slots_by_id = {slot.id: slot for slot in plan.meal_slots}
        for i, slot_targets in enumerate(targets.meal_targets):
            if slot_targets.meal_slot_id is not None:
                target_slot = slots_by_id.get(slot_targets.meal_slot_id)
                if target_slot is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"meal_slot_id {slot_targets.meal_slot_id} is not in this plan",
                    )
            elif i < len(plan.meal_slots):
                target_slot = plan.meal_slots[i]
            else:
                continue

            target_slot.target_calories = slot_targets.target_calories
            target_slot.target_protein = slot_targets.target_protein
            target_slot.target_carbs = slot_targets.target_carbs
            target_slot.target_fat = slot_targets.target_fat

    db.commit()

    # Compute drift
    total_slot_calories = sum(
        slot.target_calories or 0 for slot in plan.meal_slots
    )
    drift = total_slot_calories - plan.total_calories

    return DailyTargetsResponse(
        total_calories=plan.total_calories,
        protein_target=plan.protein_target,
        carb_target=plan.carb_target,
        fat_target=plan.fat_target,
        drift=drift,
        meal_targets=[
            {
                "meal_slot_id": slot.id,
                "target_calories": slot.target_calories or 0,
                "target_protein": slot.target_protein or 0,
                "target_carbs": slot.target_carbs or 0,
                "target_fat": slot.target_fat or 0,
            }
            for slot in plan.meal_slots
        ]
    )


# ===== Favorites endpoints =====

@router.get("/favorites", response_model=List[FavoriteFoodResponse])
def get_favorites(
    client_id: Optional[int] = None,
    slot_order: Optional[int] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List favorite foods for a client.
    Optional filters: slot_order (0=breakfast, 1=lunch, 2=dinner)
    """
    if current_user.role == UserRole.CLIENT:
        client_id = current_user.id
    elif not client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_id required"
        )

    _assert_can_manage_client(db, current_user, client_id)

    query = db.query(ClientFavoriteFood).filter(
        ClientFavoriteFood.client_id == client_id
    )

    if slot_order is not None:
        query = query.filter(ClientFavoriteFood.meal_slot_order_index == slot_order)

    favorites = query.all()
    return [FavoriteFoodResponse.model_validate(f) for f in favorites]


@router.post("/favorites", response_model=FavoriteFoodResponse)
def add_favorite(
    favorite: FavoriteFoodCreate,
    client_id: Optional[int] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Add a favorite food (idempotent).
    If already exists, return 200 with existing record.
    """
    if current_user.role == UserRole.CLIENT:
        client_id = current_user.id
    elif not client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_id required"
        )

    _assert_can_manage_client(db, current_user, client_id)

    # Check meal_bank visibility
    food = db.query(MealBank).filter(MealBank.id == favorite.meal_bank_id).first()
    if not food:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food not found"
        )

    visibility_filter = _get_meal_bank_visibility_filter(db, current_user)
    if not db.query(MealBank).filter(
        MealBank.id == favorite.meal_bank_id,
        visibility_filter
    ).first():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot use this food"
        )

    # Check if already exists
    existing = db.query(ClientFavoriteFood).filter(
        ClientFavoriteFood.client_id == client_id,
        ClientFavoriteFood.meal_bank_id == favorite.meal_bank_id,
        ClientFavoriteFood.meal_slot_order_index == favorite.meal_slot_order_index,
    ).first()

    if existing:
        return FavoriteFoodResponse.model_validate(existing)

    # Create new
    new_favorite = ClientFavoriteFood(
        client_id=client_id,
        meal_bank_id=favorite.meal_bank_id,
        meal_slot_order_index=favorite.meal_slot_order_index,
        created_by=current_user.id,
    )
    db.add(new_favorite)
    db.commit()
    db.refresh(new_favorite)

    return FavoriteFoodResponse.model_validate(new_favorite)


@router.delete("/favorites/{favorite_id}")
def delete_favorite(
    favorite_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a favorite food."""
    favorite = db.query(ClientFavoriteFood).filter(
        ClientFavoriteFood.id == favorite_id
    ).first()

    if not favorite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Favorite not found"
        )

    # Owner, their coach, or an admin. Shared helper so an unhandled role can't fall
    # through the check the way a role-by-role if/elif chain allows.
    _assert_can_manage_client(db, current_user, favorite.client_id)

    db.delete(favorite)
    db.commit()

    return {"status": "deleted"}


# ===== Variant generation & selection =====

def _generate_variants_for_slot(
    db: Session,
    meal_slot: MealSlot,
    favorite_foods: List[MealBank],
    force: bool = False,
) -> List[MealVariant]:
    """
    Generate 3 variants for a meal slot, replacing any that already exist.
    Returns the variants in variant_index order (empty list when nothing was generated).
    """
    if not favorite_foods:
        logger.warning(f"Slot {meal_slot.id}: no favorites, skipping")
        return []

    favorite_dict = {f.id: f for f in favorite_foods}

    budget = MacroBudget(
        calories=meal_slot.target_calories or 0,
        protein=meal_slot.target_protein or 0,
        carbs=meal_slot.target_carbs or 0,
        fat=meal_slot.target_fat or 0,
    )

    # Compute source hash for caching
    food_ids = sorted([f.id for f in favorite_foods])
    source_str = json.dumps({
        "slot_id": meal_slot.id,
        "food_ids": food_ids,
        "budget": {
            "calories": budget.calories,
            "protein": budget.protein,
            "carbs": budget.carbs,
            "fat": budget.fat,
        },
        "algo_version": "v1",
    }, sort_keys=True)
    source_hash = hashlib.sha256(source_str.encode()).hexdigest()

    # Check cache
    if not force:
        existing = (
            db.query(MealVariant)
            .filter(
                MealVariant.meal_slot_id == meal_slot.id,
                MealVariant.source_hash == source_hash,
            )
            .order_by(MealVariant.variant_index)
            .all()
        )
        if existing:
            logger.info(f"Slot {meal_slot.id}: using cached variants")
            return existing

    # Try Claude first
    ai_variant_set = None
    try:
        ai_variant_set = compose_variants_with_claude(
            favorite_foods=favorite_foods,
            calories_target=budget.calories,
            protein_target=budget.protein,
            carbs_target=budget.carbs,
            fat_target=budget.fat,
            slot_name=meal_slot.name,
        )
    except Exception as e:
        logger.error(f"Claude call failed: {e}")

    # Validate AI output; give Claude one retry with the validation error as context.
    if ai_variant_set:
        validated_set, error = validate_and_clamp_variants(
            ai_variant_set,
            favorite_dict,
            (budget.calories, budget.protein, budget.carbs, budget.fat),
        )

        if validated_set:
            ai_variant_set = validated_set
        else:
            logger.warning(f"Validation error: {error}, retrying once...")
            retry_set = retry_with_error(
                favorite_foods=favorite_foods,
                calories_target=budget.calories,
                protein_target=budget.protein,
                carbs_target=budget.carbs,
                fat_target=budget.fat,
                slot_name=meal_slot.name,
                error_message=error,
            )
            if retry_set:
                validated_retry, retry_error = validate_and_clamp_variants(
                    retry_set,
                    favorite_dict,
                    (budget.calories, budget.protein, budget.carbs, budget.fat),
                )
                if validated_retry:
                    ai_variant_set = validated_retry
                else:
                    logger.warning(f"Retry validation also failed: {retry_error}, using fallback")
                    ai_variant_set = None
            else:
                ai_variant_set = None

    # Use AI result or fall back to deterministic composer
    if ai_variant_set:
        generated_by = "ai"
        variant_set = ai_variant_set
    else:
        generated_by = "fallback"
        variant_set = _deterministic_compose_variants(favorite_foods)

    # Replace any existing variants for this slot. variant_index is unique per slot, so
    # re-inserting 0/1/2 on regenerate would violate the constraint; and a stale set left
    # behind would leak into the response alongside the new one.
    db.query(MealVariant).filter(
        MealVariant.meal_slot_id == meal_slot.id
    ).delete(synchronize_session=False)
    db.flush()

    # Solve and create variants
    created_variants: List[MealVariant] = []

    for variant_idx, ai_variant in enumerate(variant_set.variants):
        # Build food list for solver
        solver_foods = []

        for food_info in ai_variant.foods:
            food = favorite_dict[food_info.food_id]
            solver_foods.append(food_from_bank_values(
                id=food.id,
                name=food.name,
                # MealBank.name_hebrew is nullable; MealVariantFood.name_hebrew is not.
                name_hebrew=food.name_hebrew or food.name,
                measurement_type=_enum_value(food.measurement_type),
                calories=float(food.calories or 0),
                protein=float(food.protein or 0),
                carbs=float(food.carbs or 0),
                fat=float(food.fat or 0),
                min_amount=food_info.min_amount,
                max_amount=food_info.max_amount,
            ))

        # Solve, then round to human-friendly quantities. Everything downstream is derived
        # from the ROUNDED amounts, so the stored variant totals are exactly the sum of the
        # stored foods and fit_status describes the meal the client is actually shown.
        solution = solve_macro_targets(solver_foods, budget)

        rounded_foods = []
        computed = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
        for order, food in enumerate(solver_foods):
            quantity_amount, quantity_label = round_quantity(
                solution.food_amounts[food.id],
                food.measurement_type,
            )
            macros = {
                "calories": quantity_amount * food.per_unit_calories,
                "protein": quantity_amount * food.per_unit_protein,
                "carbs": quantity_amount * food.per_unit_carbs,
                "fat": quantity_amount * food.per_unit_fat,
            }
            for key in computed:
                computed[key] += macros[key]
            rounded_foods.append((order, food, quantity_amount, quantity_label, macros))

        # Determine fit status
        cal_tolerance = max(30, budget.calories * 0.04)
        pro_tolerance = max(5, budget.protein * 0.08)
        carb_tolerance = max(5, budget.carbs * 0.08)
        fat_tolerance = max(5, budget.fat * 0.08)

        cal_ok = abs(computed["calories"] - budget.calories) <= cal_tolerance
        pro_ok = abs(computed["protein"] - budget.protein) <= pro_tolerance
        carb_ok = abs(computed["carbs"] - budget.carbs) <= carb_tolerance
        fat_ok = abs(computed["fat"] - budget.fat) <= fat_tolerance

        if cal_ok and pro_ok and carb_ok and fat_ok:
            fit_status = "ok"
            note_hebrew = None
        elif len(solver_foods) >= 2:
            fit_status = "approximate"
            note_hebrew = (
                f"המזונות שבחרת לא מגיעים בדיוק ליעד של הארוחה. "
                f"הכמויות שמוצגות הן ההתאמה הטובה ביותר האפשרית."
            )
        else:
            fit_status = "infeasible"
            note_hebrew = "אין מספיק מזונות מועדפים כדי להתאים לתקציב הארוחה."

        # Create variant
        variant = MealVariant(
            meal_slot_id=meal_slot.id,
            variant_index=variant_idx,
            name=f"Option {variant_idx + 1}",
            name_hebrew=ai_variant.name_hebrew,
            computed_calories=computed["calories"],
            computed_protein=computed["protein"],
            computed_carbs=computed["carbs"],
            computed_fat=computed["fat"],
            fit_status=fit_status,
            note_hebrew=note_hebrew,
            generated_by=generated_by,
            source_hash=source_hash,
        )

        # Create foods from the same rounded values the totals were summed from.
        for order, food, quantity_amount, quantity_label, macros in rounded_foods:
            abs_calories = macros["calories"]
            abs_protein = macros["protein"]
            abs_carbs = macros["carbs"]
            abs_fat = macros["fat"]

            variant_food = MealVariantFood(
                meal_bank_id=food.id,
                name=food.name,
                name_hebrew=food.name_hebrew,
                measurement_type=food.measurement_type,
                quantity_amount=quantity_amount,
                quantity_label=quantity_label,
                calories=abs_calories,
                protein=abs_protein,
                carbs=abs_carbs,
                fat=abs_fat,
                order_index=order,
            )
            variant.foods.append(variant_food)

        db.add(variant)
        created_variants.append(variant)

    db.commit()
    return created_variants


def _deterministic_compose_variants(favorite_foods: List[MealBank]):
    """
    Fallback composer: partition by macro_type, pick round-robin.
    Bounds are clamped through the same hard limits as the AI path so a
    misconfigured favorite list can't produce a nonsensical quantity band.
    """
    from app.schemas.meal_variants_v3 import AIVariantSet, AIVariant, AIVariantFood
    from app.services.meal_variant_solver import clamp_bounds

    proteins = [f for f in favorite_foods if f.macro_type == MacroType.PROTEIN]
    carbs = [f for f in favorite_foods if f.macro_type == MacroType.CARB]
    fats = [f for f in favorite_foods if f.macro_type == MacroType.FAT]

    # Starting bands per macro, in the food's own unit. per_portion foods are counted in
    # portions, so a gram-scale band here would be nonsense (50 eggs, not 50 grams).
    GRAM_BANDS = {"protein": (80.0, 200.0), "carb": (50.0, 200.0), "fat": (5.0, 20.0)}
    PORTION_BANDS = {"protein": (1.0, 3.0), "carb": (1.0, 3.0), "fat": (0.5, 2.0)}

    def _bounded_food(food: MealBank) -> AIVariantFood:
        macro_type = _enum_value(food.macro_type)
        measurement_type = _enum_value(food.measurement_type)
        bands = PORTION_BANDS if measurement_type == "per_portion" else GRAM_BANDS
        min_amount, max_amount = bands.get(macro_type, (1.0, 2.0))
        clamped_min, clamped_max = clamp_bounds(min_amount, max_amount, measurement_type, macro_type)
        return AIVariantFood(food_id=food.id, min_amount=clamped_min, max_amount=clamped_max)

    variants = []

    for k in range(3):
        foods = []

        if proteins:
            foods.append(_bounded_food(proteins[k % len(proteins)]))
        if carbs:
            foods.append(_bounded_food(carbs[k % len(carbs)]))
        if fats:
            foods.append(_bounded_food(fats[k % len(fats)]))

        variants.append(AIVariant(
            name_hebrew=f"אפשרות {k+1}",
            foods=foods,
        ))

    return AIVariantSet(variants=variants)


@router.post("/variants/generate")
def generate_variants(
    request: VariantGenerateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate variants for a client's meal plan.
    Optionally specify meal_slot_id to generate only one slot.
    """
    if current_user.role == UserRole.CLIENT:
        if request.client_id and request.client_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot generate for other clients"
            )
        client_id = current_user.id
    else:
        _require_coach(current_user)
        if not request.client_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="client_id required"
            )
        client_id = request.client_id
        _assert_can_manage_client(db, current_user, client_id)

    # Get active plan
    plan = db.query(MealPlanV2).filter(
        MealPlanV2.client_id == client_id,
        MealPlanV2.is_active == True,
    ).first()

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active meal plan"
        )

    results = []

    for meal_slot in plan.meal_slots:
        if request.meal_slot_id and meal_slot.id != request.meal_slot_id:
            continue

        # Get favorites for this slot
        favorites = db.query(MealBank).join(
            ClientFavoriteFood,
            MealBank.id == ClientFavoriteFood.meal_bank_id,
        ).filter(
            ClientFavoriteFood.client_id == client_id,
            ClientFavoriteFood.meal_slot_order_index == meal_slot.order_index,
        ).all()

        if not favorites:
            logger.warning(f"Slot {meal_slot.id} ({meal_slot.name}): no favorites")
            results.append({
                "slot_id": meal_slot.id,
                "slot_name": meal_slot.name,
                "status": "skipped",
                "reason": "no_favorites",
            })
            continue

        # Generate
        slot_variants = _generate_variants_for_slot(
            db, meal_slot, favorites, force=request.force
        )

        if slot_variants:
            results.append({
                "slot_id": meal_slot.id,
                "slot_name": meal_slot.name,
                "status": "generated",
                "variants": [
                    {
                        "variant_id": v.id,
                        "variant_index": v.variant_index,
                        "name_hebrew": v.name_hebrew,
                        "fit_status": v.fit_status,
                    }
                    for v in slot_variants
                ],
            })
        else:
            results.append({
                "slot_id": meal_slot.id,
                "slot_name": meal_slot.name,
                "status": "failed",
            })

    return {"results": results}


@router.get("/variants", response_model=List[MealVariantResponse])
def list_variants(
    client_id: Optional[int] = None,
    plan_id: Optional[int] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List variants for a client/plan."""
    if current_user.role == UserRole.CLIENT:
        client_id = current_user.id
    elif not client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_id required"
        )

    _assert_can_manage_client(db, current_user, client_id)

    # Find plan. The client_id filter must apply to the explicit plan_id path too,
    # otherwise an authorized caller could read any other client's plan by guessing an id.
    if plan_id:
        plan = db.query(MealPlanV2).filter(
            MealPlanV2.id == plan_id,
            MealPlanV2.client_id == client_id,
        ).first()
    else:
        plan = db.query(MealPlanV2).filter(
            MealPlanV2.client_id == client_id,
            MealPlanV2.is_active == True,
        ).first()

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No meal plan found"
        )

    # Collect variants
    variants_list = []
    for slot in plan.meal_slots:
        slot_variants = db.query(MealVariant).filter(
            MealVariant.meal_slot_id == slot.id
        ).order_by(MealVariant.variant_index).all()
        variants_list.extend(slot_variants)

    return [MealVariantResponse.model_validate(v) for v in variants_list]


@router.post("/variants/select", response_model=VariantSelectResponse)
def select_variant(
    request: VariantSelectRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Select a variant for a meal.
    Replaces day's choices for that slot with variant foods.
    """
    variant = db.query(MealVariant).filter(
        MealVariant.id == request.variant_id
    ).first()

    if not variant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variant not found"
        )

    meal_slot = variant.meal_slot
    plan = meal_slot.meal_plan

    # Permission check
    if current_user.role == UserRole.CLIENT:
        if plan.client_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot select for other clients"
            )
    else:
        _assert_can_manage_client(db, current_user, plan.client_id)

    # Use today's date, stored at 12:00 UTC
    choice_datetime = _parse_v3_date_to_choice_datetime(
        datetime.now(timezone.utc).date().isoformat()
    )

    # Clear the whole calendar day for this slot. The macro rollup reads choices over a
    # day range, so deleting only the exact 12:00 timestamp would leave earlier/later
    # rows behind and double-count them.
    start_of_day = choice_datetime.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    db.query(ClientMealChoice).filter(
        ClientMealChoice.client_id == plan.client_id,
        ClientMealChoice.meal_slot_id == meal_slot.id,
        ClientMealChoice.date >= start_of_day,
        ClientMealChoice.date < end_of_day,
    ).delete(synchronize_session=False)

    # Create new choices from variant foods
    for variant_food in variant.foods:
        choice = ClientMealChoice(
            client_id=plan.client_id,
            food_option_id=None,
            meal_slot_id=meal_slot.id,
            date=choice_datetime,
            quantity=variant_food.quantity_label,
            custom_food_name=variant_food.name,
            custom_calories=variant_food.calories,
            custom_protein=variant_food.protein,
            custom_carbs=variant_food.carbs,
            custom_fat=variant_food.fat,
            meal_variant_food_id=variant_food.id,  # Link for UI discrimination
        )
        db.add(choice)

    db.commit()

    # Recompute daily macros
    daily_macros = _compute_daily_macros_v3(
        db,
        plan.client_id,
        choice_datetime,
        meal_plan=plan,
    )

    return VariantSelectResponse(
        variant_id=request.variant_id,
        daily_macros=daily_macros,
    )
