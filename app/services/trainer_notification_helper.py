"""
Notify trainer about a client action (weight, meal, training) only when client setting is EVERYTHING.
"""

from typing import Optional

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationCreate
from app.services.notification_service import notification_service
from app.services.client_notification_setting_service import client_notification_setting_service


def notify_trainer_immediate(
    db: Session,
    client_id: int,
    title: str,
    message: str,
    event_type: str,
    notification_type: str = "info",
) -> Optional[Notification]:
    """
    If the client's notification setting is EVERYTHING, create a notification for the trainer.
    Returns the created Notification if one was created, None otherwise.
    """
    client = db.query(User).filter(User.id == client_id).first()
    if not client or not client.trainer_id:
        return None
    mode = client_notification_setting_service.get_or_default(db, client.trainer_id, client_id)
    if mode != "EVERYTHING":
        return None
    return notification_service.create_notification(
        db=db,
        notification_data=NotificationCreate(
            title=title,
            message=message,
            type=notification_type,
            recipient_id=client.trainer_id,
            client_id=client_id,
            event_type=event_type,
        ),
        sender_id=None,
    )
