from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class NotificationBase(BaseModel):
    title: str
    message: str
    type: str = "info"

class NotificationCreate(NotificationBase):
    recipient_id: int
    client_id: Optional[int] = None
    event_type: Optional[str] = None

class NotificationUpdate(BaseModel):
    is_read: Optional[bool] = None

class NotificationResponse(NotificationBase):
    id: int
    recipient_id: int
    sender_id: Optional[int] = None
    client_id: Optional[int] = None
    event_type: Optional[str] = None
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class NotificationCount(BaseModel):
    unread_count: int
    total_count: int 