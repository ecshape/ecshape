"""
Meal Variants V3 API router.
Handles favorite foods, trainer-authored meal variants, and client variant selection.
"""

from __future__ import annotations

import hmac
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from sqlalchemy import and_, func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.auth.utils import get_current_user
from app.schemas.auth import UserResponse, UserRole
from app.models.user import User
from app.models.meal_system import (
    MealPlanV2,
    MealSlot,
    MealBank,
    ClientMealChoice,
)
from app.models.meal_variants import (
    ClientFavoriteFood,
    MealVariant,
    MealVariantFood,
    ClientNutritionProfile,
)
from app.schemas.meal_variants_v3 import (
    FavoriteFoodCreate,
    FavoriteFoodResponse,
    MealVariantResponse,
    DailyTargetsUpdate,
    DailyTargetsResponse,
    ManualVariantsRequest,
    VariantSelectRequest,
    VariantSelectResponse,
    NutritionProfileUpdate,
    NutritionProfileResponse,
    QuestionnaireWebhookPayload,
    QuestionnaireLinkRequest,
    ParsedMenuPdfResponse,
    ParsedSlot,
    ParsedVariant,
    ParsedFoodPlaceholder,
    DailyTargetsFields,
    MealSlotTargetFields,
    EnsurePlanRequest,
)
from app.schemas.meal_tracking_v3 import V3MealPlanResponse
from app.services.meal_tracking_v3_service import (
    _parse_v3_date_to_choice_datetime,
    _compute_daily_macros_v3,
    build_v3_day_slots_view,
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


# ===== Trainer-authored variants & selection =====

@router.post("/plans/ensure", response_model=V3MealPlanResponse)
def ensure_plan(
    request: EnsurePlanRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Additive plan/slot creation for the PDF-import flow. Deliberately narrower than
    POST /v3/meals/plans (create_or_update_complete_plan), which always clears and
    rebuilds every slot on an existing plan - that would silently wipe other meals'
    saved options. This endpoint only ever ADDS:
      - creates a MealPlanV2 if the client has none, using daily_targets if given;
      - appends one new MealSlot per entry in new_slots, after the plan's current max
        order_index.
    An existing plan's own fields (name, daily targets, etc.) and existing slots are
    never read for modification and never touched.
    """
    _require_coach(current_user)
    _assert_can_manage_client(db, current_user, request.client_id)

    plan = db.query(MealPlanV2).filter(
        MealPlanV2.client_id == request.client_id,
        MealPlanV2.is_active == True,
    ).first()

    if plan is None:
        dt = request.daily_targets
        plan = MealPlanV2(
            client_id=request.client_id,
            trainer_id=current_user.id,
            name="Imported plan",
            number_of_meals=len(request.new_slots),
            total_calories=dt.total_calories if dt else None,
            protein_target=dt.protein_target if dt else None,
            carb_target=dt.carb_target if dt else None,
            fat_target=dt.fat_target if dt else None,
            is_active=True,
        )
        db.add(plan)
        db.flush()

    # Guards a double-submit (double-click, retry) from creating a second slot with
    # the same name - the only identity a caller provides for "this meal already
    # exists on the plan". Existing slots are still never modified, only skipped.
    existing_names = {s.name for s in plan.meal_slots}
    next_order_index = (max((s.order_index for s in plan.meal_slots), default=-1)) + 1
    i = 0
    for slot_input in request.new_slots:
        if slot_input.raw_name in existing_names:
            continue
        db.add(MealSlot(
            meal_plan_id=plan.id,
            name=slot_input.raw_name,
            order_index=next_order_index + i,
            target_calories=slot_input.target_calories,
            target_protein=slot_input.target_protein,
            target_carbs=slot_input.target_carbs,
            target_fat=slot_input.target_fat,
        ))
        existing_names.add(slot_input.raw_name)
        i += 1

    # number_of_meals is a trainer-chosen display figure elsewhere in the app; keep it
    # at least as large as the plan's real slot count so it's never understated.
    db.flush()
    plan.number_of_meals = max(plan.number_of_meals, len(plan.meal_slots))

    db.commit()
    db.refresh(plan)
    return V3MealPlanResponse.model_validate(plan)


@router.post("/plans/{plan_id}/variants/manual", response_model=List[MealVariantResponse])
def create_manual_variants(
    plan_id: int,
    request: ManualVariantsRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Trainer-authored meal options, typed in by the coach (e.g. copied from a plan they
    built themselves). Replaces any existing variants for each submitted slot.

    Absolute macros are always recomputed server-side as the sum of the submitted foods,
    so the stored totals (and the daily macro rollup) can never drift from what's shown.
    """
    _require_coach(current_user)

    plan = db.query(MealPlanV2).filter(MealPlanV2.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal plan not found")
    _assert_can_manage_client(db, current_user, plan.client_id)

    plan_slot_ids = {slot.id for slot in plan.meal_slots}

    created_variants: List[MealVariant] = []

    for slot_input in request.slots:
        if slot_input.meal_slot_id not in plan_slot_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"meal_slot_id {slot_input.meal_slot_id} is not in this plan",
            )

        # Replace any existing variants for this slot. variant_index is unique per slot,
        # so re-inserting 0/1/2 without clearing first would violate the constraint.
        db.query(MealVariant).filter(
            MealVariant.meal_slot_id == slot_input.meal_slot_id
        ).delete(synchronize_session=False)
        db.flush()

        for variant_idx, variant_input in enumerate(slot_input.variants):
            computed = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
            for food_input in variant_input.foods:
                computed["calories"] += food_input.calories
                computed["protein"] += food_input.protein
                computed["carbs"] += food_input.carbs
                computed["fat"] += food_input.fat

            variant = MealVariant(
                meal_slot_id=slot_input.meal_slot_id,
                variant_index=variant_idx,
                name=f"Option {variant_idx + 1}",
                name_hebrew=variant_input.name_hebrew,
                computed_calories=computed["calories"],
                computed_protein=computed["protein"],
                computed_carbs=computed["carbs"],
                computed_fat=computed["fat"],
                fit_status="ok",
                note_hebrew=None,
                generated_by="manual",
                source_hash=None,
            )

            for order, food_input in enumerate(variant_input.foods):
                variant.foods.append(MealVariantFood(
                    meal_bank_id=None,
                    name=food_input.name,
                    name_hebrew=food_input.name_hebrew,
                    measurement_type=food_input.measurement_type,
                    quantity_amount=food_input.quantity_amount,
                    quantity_label=food_input.quantity_label,
                    calories=food_input.calories,
                    protein=food_input.protein,
                    carbs=food_input.carbs,
                    fat=food_input.fat,
                    order_index=order,
                ))

            db.add(variant)
            created_variants.append(variant)

    db.commit()
    for v in created_variants:
        db.refresh(v)
    return [MealVariantResponse.model_validate(v) for v in created_variants]


MAX_PDF_BYTES = 15 * 1024 * 1024  # 15MB


@router.post("/variants/parse-pdf", response_model=ParsedMenuPdfResponse)
async def parse_menu_pdf(
    client_id: int,
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a trainer-authored nutrition-plan PDF and get back a DRAFT of meal options for
    review. This never writes to the database - it only parses and returns a best-effort
    structure for the trainer to review, edit, and then submit via the existing
    POST /plans/{plan_id}/variants/manual endpoint (and, when a meal has no matching
    slot yet, POST /plans/ensure first). Ambiguous macro splits are resolved
    automatically (see resolve_macro_blob); unmatched meal slots are surfaced as either
    a slot the trainer picks from, or - when the PDF's own breakdown table has a target
    for that meal - an offer to create a new slot for it, never a silent guess.

    Takes client_id rather than plan_id so this can be called before any plan exists at
    all (the client-id-keyed lookup pattern already used by list_variants/favorites).
    """
    _require_coach(current_user)
    _assert_can_manage_client(db, current_user, client_id)

    plan = db.query(MealPlanV2).filter(
        MealPlanV2.client_id == client_id,
        MealPlanV2.is_active == True,
    ).first()

    is_pdf = (file.content_type == "application/pdf") or (file.filename or "").lower().endswith(".pdf")
    if not is_pdf:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF files are supported")

    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")
    if len(raw) > MAX_PDF_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PDF is too large (max 15MB)")

    from app.services.menu_pdf_parser import (
        parse_menu_pdf_bytes,
        match_parsed_slots_to_plan,
        PdfParseError,
        SlotMatch,
    )

    try:
        parsed = parse_menu_pdf_bytes(raw)
    except PdfParseError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e))

    has_plan = plan is not None
    if has_plan:
        plan_slots = [{"id": s.id, "name": s.name, "order_index": s.order_index} for s in plan.meal_slots]
        slot_matches = match_parsed_slots_to_plan(parsed.slots, plan_slots)
    else:
        # Nothing to match against yet - every section proposes a brand new slot below.
        slot_matches = [
            SlotMatch(raw_name=ps.raw_name, matched_meal_slot_id=None, match_confidence="none")
            for ps in parsed.slots
        ]

    response_slots: List[ParsedSlot] = []
    for ps, match in zip(parsed.slots, slot_matches):
        response_variants: List[ParsedVariant] = []
        for opt in ps.options:
            resolved = opt.resolved_macros  # (protein, carbs, fat, calories) or None
            response_variants.append(ParsedVariant(
                option_index=opt.index,
                name_hebrew=opt.name_hebrew_raw,
                raw_ingredient_text=opt.raw_ingredient_text,
                resolved_protein=resolved[0] if resolved else None,
                resolved_carbs=resolved[1] if resolved else None,
                resolved_fat=resolved[2] if resolved else None,
                resolved_calories=resolved[3] if resolved else None,
                macro_blob_raw=opt.macro_blob,
                foods=[ParsedFoodPlaceholder()],
            ))

        proposed_target = None
        if match.matched_meal_slot_id is None:
            meal_target = parsed.meal_targets.get(ps.raw_name)
            if meal_target:
                mt_protein, mt_carbs, mt_fat, mt_calories = meal_target
                proposed_target = MealSlotTargetFields(
                    target_calories=mt_calories,
                    target_protein=mt_protein,
                    target_carbs=mt_carbs,
                    target_fat=mt_fat,
                )

        response_slots.append(ParsedSlot(
            raw_meal_name=ps.raw_name,
            matched_meal_slot_id=match.matched_meal_slot_id,
            match_confidence=match.match_confidence,
            candidate_meal_slot_ids=match.candidate_meal_slot_ids,
            proposed_target=proposed_target,
            variants=response_variants,
        ))

    warnings = list(parsed.warnings)
    if not response_slots or all(len(s.variants) == 0 for s in response_slots):
        warnings.append("No meal options could be found in this PDF.")

    daily_targets = None
    if not has_plan and parsed.daily_targets:
        dt_protein, dt_carbs, dt_fat, dt_calories = parsed.daily_targets
        daily_targets = DailyTargetsFields(
            total_calories=dt_calories,
            protein_target=dt_protein,
            carb_target=dt_carbs,
            fat_target=dt_fat,
        )

    return ParsedMenuPdfResponse(
        slots=response_slots,
        warnings=warnings,
        has_plan=has_plan,
        daily_targets=daily_targets,
    )


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

    # The day the client is viewing (defaults to today), stored at 12:00 UTC
    choice_datetime = _parse_v3_date_to_choice_datetime(
        request.date or datetime.now(timezone.utc).date().isoformat()
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


# ===== Nutrition questionnaire =====

def _client_by_email(db: Session, email: str) -> Optional[User]:
    return (
        db.query(User)
        .filter(func.lower(User.email) == email, User.role == UserRole.CLIENT)
        .first()
    )


@router.post("/questionnaire/webhook", response_model=NutritionProfileResponse)
def questionnaire_webhook(
    payload: QuestionnaireWebhookPayload,
    x_webhook_secret: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """
    Receives a Google Form response from Apps Script. Authenticated by a shared secret
    header instead of a user login. Matches the client by email; unmatched responses are
    stored with client_id=NULL for a coach to link.
    """
    expected = os.getenv("QUESTIONNAIRE_WEBHOOK_SECRET")
    if not expected:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Questionnaire import is not configured")
    if not x_webhook_secret or not hmac.compare_digest(x_webhook_secret, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook secret")

    email = payload.email.strip().lower()
    client = _client_by_email(db, email)

    profile = None
    if client:
        profile = db.query(ClientNutritionProfile).filter(ClientNutritionProfile.client_id == client.id).first()
    if not profile:
        profile = db.query(ClientNutritionProfile).filter(
            ClientNutritionProfile.client_id.is_(None),
            ClientNutritionProfile.email == email,
        ).first()
    if not profile:
        profile = ClientNutritionProfile()
        db.add(profile)

    profile.client_id = client.id if client else None
    profile.email = email
    for field, value in payload.model_dump(exclude={"email", "raw_answers"}).items():
        setattr(profile, field, value)
    profile.raw_answers = json.dumps(payload.raw_answers, ensure_ascii=False) if payload.raw_answers else None
    profile.source = "google_form"
    profile.submitted_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(profile)
    logger.info(f"Questionnaire received for {'client ' + str(client.id) if client else 'unmatched email'}")
    return NutritionProfileResponse.model_validate(profile)


@router.get("/questionnaire", response_model=Optional[NutritionProfileResponse])
def get_questionnaire(
    client_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_coach(current_user)
    _assert_can_manage_client(db, current_user, client_id)
    profile = db.query(ClientNutritionProfile).filter(ClientNutritionProfile.client_id == client_id).first()
    return NutritionProfileResponse.model_validate(profile) if profile else None


@router.put("/questionnaire", response_model=NutritionProfileResponse)
def update_questionnaire(
    client_id: int,
    body: NutritionProfileUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_coach(current_user)
    client = _assert_can_manage_client(db, current_user, client_id)
    profile = db.query(ClientNutritionProfile).filter(ClientNutritionProfile.client_id == client_id).first()
    if not profile:
        profile = ClientNutritionProfile(client_id=client_id, email=(client.email or "").lower(), source="manual")
        db.add(profile)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return NutritionProfileResponse.model_validate(profile)


@router.get("/questionnaire/unmatched", response_model=List[NutritionProfileResponse])
def list_unmatched_questionnaires(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_coach(current_user)
    profiles = (
        db.query(ClientNutritionProfile)
        .filter(ClientNutritionProfile.client_id.is_(None))
        .order_by(ClientNutritionProfile.submitted_at.desc())
        .all()
    )
    return [NutritionProfileResponse.model_validate(p) for p in profiles]


@router.post("/questionnaire/{profile_id}/link", response_model=NutritionProfileResponse)
def link_questionnaire(
    profile_id: int,
    body: QuestionnaireLinkRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_coach(current_user)
    _assert_can_manage_client(db, current_user, body.client_id)
    profile = db.query(ClientNutritionProfile).filter(
        ClientNutritionProfile.id == profile_id,
        ClientNutritionProfile.client_id.is_(None),
    ).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unmatched questionnaire not found")
    if db.query(ClientNutritionProfile).filter(ClientNutritionProfile.client_id == body.client_id).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This client already has a questionnaire; edit it instead",
        )
    profile.client_id = body.client_id
    db.commit()
    db.refresh(profile)
    return NutritionProfileResponse.model_validate(profile)
