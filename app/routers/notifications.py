from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.auth.utils import get_current_user
from app.schemas.auth import UserResponse, UserRole
from app.schemas.notification import (
    NotificationCreate,
    NotificationResponse,
    NotificationUpdate,
    NotificationCount,
)
from app.schemas.client_notification_setting import (
    ClientNotificationSettingResponse,
    ClientNotificationSettingUpdate,
    ClientNotificationSettingWithClient,
)
from app.services.notification_service import notification_service
from app.services.client_notification_setting_service import client_notification_setting_service
from app.services.notification_triggers import (
    NotificationTriggers,
    run_weekly_notification_checks,
    check_client_goals,
)
from app.models.user import User

router = APIRouter()

@router.get("/", response_model=List[NotificationResponse])
async def get_notifications(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    client_id: Optional[int] = Query(None, description="Filter by client (trainee)"),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Get notifications for the current user"""
    notifications = notification_service.get_user_notifications(
        db=db,
        user_id=current_user.id,
        limit=limit,
        offset=offset,
        unread_only=unread_only,
        client_id=client_id,
    )
    return notifications

@router.get("/count", response_model=NotificationCount)
async def get_notification_count(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """Get notification count for the current user"""
    unread_count = notification_service.get_unread_count(db, current_user.id)
    total_count = len(notification_service.get_user_notifications(db, current_user.id))
    
    return NotificationCount(
        unread_count=unread_count,
        total_count=total_count
    )

@router.post("/", response_model=NotificationResponse)
async def create_notification(
    notification: NotificationCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """Create a new notification (admin/trainer only)"""
    if current_user.role not in ["ADMIN", "TRAINER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and trainers can create notifications"
        )
    
    return notification_service.create_notification(
        db=db,
        notification_data=notification,
        sender_id=current_user.id
    )

@router.put("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """Mark a notification as read"""
    notification = notification_service.mark_as_read(
        db=db,
        notification_id=notification_id,
        user_id=current_user.id
    )
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    return notification

@router.put("/read-all")
async def mark_all_notifications_as_read(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """Mark all notifications as read for the current user"""
    count = notification_service.mark_all_as_read(db, current_user.id)
    return {"message": f"Marked {count} notifications as read"}

@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """Delete a notification"""
    success = notification_service.delete_notification(
        db=db,
        notification_id=notification_id,
        user_id=current_user.id
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    return {"message": "Notification deleted successfully"}


# ---------- Client notification settings (trainer only) ----------
@router.get("/settings", response_model=List[ClientNotificationSettingWithClient])
async def list_notification_settings(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """List notification settings for all clients of the current trainer."""
    if current_user.role not in (UserRole.TRAINER, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can view notification settings",
        )
    return client_notification_setting_service.list_by_trainer(db, current_user.id)


@router.get("/settings/{client_id}", response_model=ClientNotificationSettingWithClient)
async def get_notification_setting(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Get notification setting for one client. 404 if no row (frontend treats as default)."""
    if current_user.role not in (UserRole.TRAINER, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can view notification settings",
        )
    client = db.query(User).filter(User.id == client_id).first()
    if not client or client.trainer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    setting = client_notification_setting_service.get_setting(db, current_user.id, client_id)
    mode = setting.mode if setting else "WEEKLY_DIGEST"
    return ClientNotificationSettingWithClient(
        client_id=client_id,
        client_name=client.full_name or f"Client {client_id}",
        mode=mode,
    )


@router.put("/settings/{client_id}", response_model=ClientNotificationSettingResponse)
async def update_notification_setting(
    client_id: int,
    body: ClientNotificationSettingUpdate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Create or update notification setting for a client (trainer only)."""
    if current_user.role not in (UserRole.TRAINER, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers can update notification settings",
        )
    client = db.query(User).filter(User.id == client_id).first()
    if not client or client.trainer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client_notification_setting_service.upsert(db, current_user.id, client_id, body.mode)


@router.post("/system")
async def create_system_notification(
    title: str,
    message: str,
    notification_type: str = "info",
    recipient_ids: Optional[List[int]] = None,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """Create system notifications (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create system notifications"
        )
    
    notifications = notification_service.create_system_notification(
        db=db,
        title=title,
        message=message,
        notification_type=notification_type,
        recipient_ids=recipient_ids
    )
    
    return {
        "message": f"Created {len(notifications)} system notifications",
        "notifications": notifications
    }

# Manual trigger endpoints for testing (admin only)
@router.post("/trigger/weekly-checks")
async def trigger_weekly_checks(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """Manually trigger weekly notification checks (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can trigger weekly checks"
        )
    
    try:
        run_weekly_notification_checks(db)
        return {"message": "Weekly notification checks completed successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error running weekly checks: {str(e)}"
        )

@router.post("/trigger/goal-check/{client_id}")
async def trigger_goal_check(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """Manually trigger goal check for a specific client (admin/trainer only)"""
    if current_user.role not in ["ADMIN", "TRAINER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and trainers can trigger goal checks"
        )
    
    try:
        check_client_goals(db, client_id)
        return {"message": f"Goal check completed for client {client_id}"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error checking goals: {str(e)}"
        )

@router.post("/trigger/critical-error")
async def trigger_critical_error_notification(
    error_type: str = "Test Error",
    details: str = "This is a test critical error notification",
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """Trigger a critical error notification (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can trigger critical error notifications"
        )
    
    try:
        NotificationTriggers.notify_admin_on_critical_error(db, error_type, details)
        return {"message": "Critical error notification sent to all admins"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error sending critical error notification: {str(e)}"
        ) 