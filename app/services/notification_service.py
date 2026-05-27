from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional
from datetime import datetime, timedelta
from app.models.user import User
from app.models.notification import Notification
from app.schemas.notification import NotificationCreate, NotificationResponse, NotificationUpdate

class NotificationService:
    @staticmethod
    def create_notification(
        db: Session,
        notification_data: NotificationCreate,
        sender_id: Optional[int] = None,
    ) -> Notification:
        """Create a new notification"""
        db_notification = Notification(
            title=notification_data.title,
            message=notification_data.message,
            type=notification_data.type,
            recipient_id=notification_data.recipient_id,
            sender_id=sender_id,
            client_id=notification_data.client_id,
            event_type=notification_data.event_type,
            is_read=False,
            created_at=datetime.utcnow(),
        )
        db.add(db_notification)
        db.commit()
        db.refresh(db_notification)
        return db_notification

    @staticmethod
    def get_user_notifications(
        db: Session,
        user_id: int,
        limit: int = 50,
        offset: int = 0,
        unread_only: bool = False,
        client_id: Optional[int] = None,
    ) -> List[Notification]:
        """Get notifications for a specific user, optionally filtered by client_id."""
        query = db.query(Notification).filter(Notification.recipient_id == user_id)
        if unread_only:
            query = query.filter(Notification.is_read == False)
        if client_id is not None:
            query = query.filter(Notification.client_id == client_id)
        return query.order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()

    @staticmethod
    def mark_as_read(
        db: Session,
        notification_id: int,
        user_id: int
    ) -> Optional[Notification]:
        """Mark a notification as read"""
        notification = db.query(Notification).filter(
            and_(
                Notification.id == notification_id,
                Notification.recipient_id == user_id
            )
        ).first()
        
        if notification:
            notification.is_read = True
            notification.read_at = datetime.utcnow()
            db.commit()
            db.refresh(notification)
        
        return notification

    @staticmethod
    def mark_all_as_read(
        db: Session,
        user_id: int
    ) -> int:
        """Mark all notifications as read for a user"""
        result = db.query(Notification).filter(
            and_(
                Notification.recipient_id == user_id,
                Notification.is_read == False
            )
        ).update({
            "is_read": True,
            "read_at": datetime.utcnow()
        })
        db.commit()
        return result

    @staticmethod
    def delete_notification(
        db: Session,
        notification_id: int,
        user_id: int
    ) -> bool:
        """Delete a notification"""
        notification = db.query(Notification).filter(
            and_(
                Notification.id == notification_id,
                Notification.recipient_id == user_id
            )
        ).first()
        
        if notification:
            db.delete(notification)
            db.commit()
            return True
        return False

    @staticmethod
    def get_unread_count(db: Session, user_id: int) -> int:
        """Get count of unread notifications for a user"""
        return db.query(Notification).filter(
            and_(
                Notification.recipient_id == user_id,
                Notification.is_read == False
            )
        ).count()

    @staticmethod
    def create_system_notification(
        db: Session,
        title: str,
        message: str,
        notification_type: str = "info",
        recipient_ids: Optional[List[int]] = None
    ) -> List[Notification]:
        """Create system notifications for multiple users"""
        notifications = []
        
        if recipient_ids is None:
            # Send to all users
            users = db.query(User).all()
            recipient_ids = [user.id for user in users]
        
        for recipient_id in recipient_ids:
            notification = Notification(
                title=title,
                message=message,
                type=notification_type,
                recipient_id=recipient_id,
                sender_id=None,
                client_id=None,
                event_type="system",
                is_read=False,
                created_at=datetime.utcnow(),
            )
            db.add(notification)
            notifications.append(notification)
        
        db.commit()
        for notification in notifications:
            db.refresh(notification)
        
        return notifications

    @staticmethod
    def cleanup_old_notifications(db: Session, days: int = 30) -> int:
        """Clean up notifications older than specified days"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        result = db.query(Notification).filter(
            Notification.created_at < cutoff_date
        ).delete()
        db.commit()
        return result

notification_service = NotificationService() 