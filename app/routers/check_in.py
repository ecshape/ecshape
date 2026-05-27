from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from typing import List, Optional
from datetime import datetime, date, timedelta

from app.database import get_db
from app.auth.utils import get_current_user
from app.schemas.auth import UserResponse, UserRole
from app.models.check_in import DailyCheckIn
from app.models.user import User
from app.schemas.check_in import (
    DailyCheckInCreate,
    DailyCheckInUpdate,
    DailyCheckInResponse,
    CheckInSummary
)

router = APIRouter()

def normalize_date(value: datetime) -> datetime:
    """נרמול תאריך לתחילת היום"""
    return value.replace(hour=0, minute=0, second=0, microsecond=0)

@router.post("", response_model=DailyCheckInResponse, status_code=status.HTTP_201_CREATED)
def create_check_in(
    check_in_data: DailyCheckInCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """יצירת בדיקה יומית (לקוח בלבד)"""
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clients can create check-ins"
        )
    
    # נרמול תאריך לתחילת היום
    normalized_date = normalize_date(check_in_data.date)
    
    # בדיקה אם כבר קיימת בדיקה ליום הזה
    existing_check_in = db.query(DailyCheckIn).filter(
        and_(
            DailyCheckIn.client_id == current_user.id,
            DailyCheckIn.date == normalized_date
        )
    ).first()
    
    if existing_check_in:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Check-in already exists for this date"
        )
    
    # יצירת בדיקה חדשה
    check_in = DailyCheckIn(
        client_id=current_user.id,
        date=normalized_date,
        weight=check_in_data.weight,
        steps=check_in_data.steps,
        walked_10000_steps=check_in_data.walked_10000_steps,
        sun_exposure_10min=check_in_data.sun_exposure_10min,
        hunger_level=check_in_data.hunger_level,
        sleep_hours=check_in_data.sleep_hours
    )
    
    db.add(check_in)
    db.commit()
    db.refresh(check_in)
    
    return check_in

@router.get("", response_model=List[DailyCheckInResponse])
def get_check_ins(
    client_id: Optional[int] = Query(None, description="Client ID (for trainers)"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """קבלת בדיקות (לקוח/מאמן)"""
    query = db.query(DailyCheckIn)
    
    if current_user.role == UserRole.CLIENT:
        # לקוח רואה רק את שלו
        query = query.filter(DailyCheckIn.client_id == current_user.id)
    elif current_user.role == UserRole.TRAINER:
        # מאמן יכול לסנן לפי client_id
        if client_id:
            # בדיקה שהלקוח שייך למאמן
            client = db.query(User).filter(User.id == client_id).first()
            if not client or client.trainer_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only view check-ins for your clients"
                )
            query = query.filter(DailyCheckIn.client_id == client_id)
        else:
            # אם לא צוין client_id, מחזיר את כל הלקוחות של המאמן
            trainer_clients = db.query(User.id).filter(
                User.trainer_id == current_user.id
            ).subquery()
            query = query.filter(DailyCheckIn.client_id.in_(
                db.query(trainer_clients.c.id)
            ))
    else:
        # ADMIN יכול לראות הכל
        if client_id:
            query = query.filter(DailyCheckIn.client_id == client_id)
    
    # סינון לפי תאריך
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(DailyCheckIn.date >= normalize_date(start_dt))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid start_date format. Use YYYY-MM-DD"
            )
    
    if end_date:
        try:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
            # הוספת יום אחד כדי לכלול את היום האחרון
            end_dt = end_dt + timedelta(days=1)
            query = query.filter(DailyCheckIn.date < normalize_date(end_dt))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid end_date format. Use YYYY-MM-DD"
            )
    
    check_ins = query.order_by(DailyCheckIn.date.desc()).all()
    return check_ins

@router.get("/today", response_model=Optional[DailyCheckInResponse])
def get_today_check_in(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """בדיקה יומית של היום"""
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clients can view their today's check-in"
        )
    
    today = normalize_date(datetime.now())
    check_in = db.query(DailyCheckIn).filter(
        and_(
            DailyCheckIn.client_id == current_user.id,
            DailyCheckIn.date == today
        )
    ).first()
    
    return check_in

@router.get("/{check_in_id}", response_model=DailyCheckInResponse)
def get_check_in(
    check_in_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """בדיקה ספציפית"""
    check_in = db.query(DailyCheckIn).filter(DailyCheckIn.id == check_in_id).first()
    
    if not check_in:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Check-in not found"
        )
    
    # בדיקת הרשאות
    if current_user.role == UserRole.CLIENT:
        if check_in.client_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own check-ins"
            )
    elif current_user.role == UserRole.TRAINER:
        # בדיקה שהלקוח שייך למאמן
        client = db.query(User).filter(User.id == check_in.client_id).first()
        if not client or client.trainer_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view check-ins for your clients"
            )
    # ADMIN יכול לראות הכל
    
    return check_in

@router.get("/summary", response_model=CheckInSummary)
def get_check_in_summary(
    client_id: Optional[int] = Query(None, description="Client ID (for trainers)"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """סיכום סטטיסטיקות"""
    # קביעת client_id
    target_client_id = current_user.id
    if client_id:
        if current_user.role == UserRole.CLIENT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Clients cannot view other clients' summaries"
            )
        elif current_user.role == UserRole.TRAINER:
            # בדיקה שהלקוח שייך למאמן
            client = db.query(User).filter(User.id == client_id).first()
            if not client or client.trainer_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only view summaries for your clients"
                )
        target_client_id = client_id
    
    # חישוב תאריכים
    today = normalize_date(datetime.now())
    seven_days_ago = today - timedelta(days=7)
    
    # בדיקת היום
    today_check_in = db.query(DailyCheckIn).filter(
        and_(
            DailyCheckIn.client_id == target_client_id,
            DailyCheckIn.date == today
        )
    ).first()
    
    today_status = "none"
    if today_check_in:
        today_status = "completed"
    
    # חישוב streak
    current_streak = 0
    check_date = today
    while True:
        check_in = db.query(DailyCheckIn).filter(
            and_(
                DailyCheckIn.client_id == target_client_id,
                DailyCheckIn.date == check_date
            )
        ).first()
        
        if check_in:
            current_streak += 1
            check_date = check_date - timedelta(days=1)
        else:
            break
    
    # חישוב השלמה ב-7 ימים האחרונים
    last_7_days_check_ins = db.query(DailyCheckIn).filter(
        and_(
            DailyCheckIn.client_id == target_client_id,
            DailyCheckIn.date >= seven_days_ago,
            DailyCheckIn.date <= today
        )
    ).count()
    
    # חישוב ממוצעים
    all_check_ins = db.query(DailyCheckIn).filter(
        DailyCheckIn.client_id == target_client_id
    ).all()
    
    total_check_ins = len(all_check_ins)
    
    # חישוב ממוצעים
    weights = [ci.weight for ci in all_check_ins if ci.weight is not None]
    steps_list = [ci.steps for ci in all_check_ins if ci.steps is not None]
    sleep_hours_list = [ci.sleep_hours for ci in all_check_ins if ci.sleep_hours is not None]
    hunger_levels = [ci.hunger_level for ci in all_check_ins if ci.hunger_level is not None]
    
    avg_weight = sum(weights) / len(weights) if weights else None
    avg_steps = sum(steps_list) / len(steps_list) if steps_list else None
    avg_sleep_hours = sum(sleep_hours_list) / len(sleep_hours_list) if sleep_hours_list else None
    avg_hunger_level = sum(hunger_levels) / len(hunger_levels) if hunger_levels else None
    
    # תאריכים ראשון ואחרון
    first_check_in = None
    last_check_in = None
    if all_check_ins:
        sorted_check_ins = sorted(all_check_ins, key=lambda x: x.date)
        first_check_in = sorted_check_ins[0].date
        last_check_in = sorted_check_ins[-1].date
    
    # אחוז השלמה (מבוסס על כל הבדיקות)
    # נחשב כמה ימים עברו מהבדיקה הראשונה
    if first_check_in and last_check_in:
        days_diff = (last_check_in - first_check_in).days + 1
        completion_rate = (total_check_ins / days_diff * 100) if days_diff > 0 else 0.0
    else:
        completion_rate = 0.0
    
    # Ensure completion_rate is a valid float between 0 and 100
    completion_rate = max(0.0, min(100.0, float(round(completion_rate, 2))))
    
    # Helper function to safely round optional floats
    def safe_round(value: Optional[float]) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(round(value, 2))
        except (ValueError, TypeError, OverflowError):
            return None
    
    # Build response data with explicit type validation
    # Debug logging removed - use standard logging instead
    # logger.debug(f"Building summary for client {target_client_id}: {total_check_ins} check-ins, rate={completion_rate}")
    
    summary_data = {
        "today_status": str(today_status),  # Ensure it's a string
        "current_streak": int(current_streak),  # Ensure it's an int
        "last_7_days_completion": int(last_7_days_check_ins),  # Ensure it's an int
        "completion_rate": float(completion_rate),  # Ensure it's a float
        "avg_weight": safe_round(avg_weight),
        "avg_steps": safe_round(avg_steps),
        "avg_sleep_hours": safe_round(avg_sleep_hours),
        "avg_hunger_level": safe_round(avg_hunger_level),
        "total_check_ins": int(total_check_ins),  # Ensure it's an int
        "first_check_in": first_check_in,  # datetime or None
        "last_check_in": last_check_in  # datetime or None
    }
    
    # Debug logging removed - use standard logging instead
    
    try:
        # Validate and create response
        summary = CheckInSummary(**summary_data)
        # Debug logging removed - use standard logging instead
        return summary
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error creating CheckInSummary: {e}")
        logger.error(f"Summary data: {summary_data}")
        # Return a valid default response instead of failing
        return CheckInSummary(
            today_status="none",
            current_streak=0,
            last_7_days_completion=0,
            completion_rate=0.0,
            avg_weight=None,
            avg_steps=None,
            avg_sleep_hours=None,
            avg_hunger_level=None,
            total_check_ins=0,
            first_check_in=None,
            last_check_in=None
        )

@router.get("/trainer/dashboard", response_model=List[dict])
def get_trainer_dashboard(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """סטטוס כל הלקוחות (מאמן בלבד)"""
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can access this endpoint"
        )
    
    # קבלת כל הלקוחות של המאמן
    clients = db.query(User).filter(User.trainer_id == current_user.id).all()
    
    today = normalize_date(datetime.now())
    
    result = []
    for client in clients:
        # בדיקת סטטוס הבדיקה של היום
        today_check_in = db.query(DailyCheckIn).filter(
            and_(
                DailyCheckIn.client_id == client.id,
                DailyCheckIn.date == today
            )
        ).first()
        
        status = "none"
        if today_check_in:
            status = "completed"
        
        result.append({
            "client_id": client.id,
            "client_name": client.full_name,
            "check_in_status": status,
            "check_in_id": today_check_in.id if today_check_in else None
        })
    
    return result

