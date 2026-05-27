from pydantic import BaseModel, validator
from typing import Optional
from datetime import datetime, timezone

class ChatMessageBase(BaseModel):
    message: str
    progress_entry_id: Optional[int] = None

class ChatMessageCreate(ChatMessageBase):
    client_id: int

class ChatMessageResponse(ChatMessageBase):
    id: int
    trainer_id: int
    client_id: int
    sender_id: int
    created_at: datetime
    read_at: Optional[datetime] = None

    @validator('created_at', 'read_at', pre=True)
    def normalize_datetime(cls, v):
        """Ensure datetime is timezone-aware UTC"""
        if v is None:
            return None
        if isinstance(v, datetime):
            # If datetime is naive, assume it's UTC
            if v.tzinfo is None:
                return v.replace(tzinfo=timezone.utc)
            # If datetime has timezone, convert to UTC
            elif v.tzinfo != timezone.utc:
                return v.astimezone(timezone.utc)
        return v

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v.tzinfo else v.replace(tzinfo=timezone.utc).isoformat()
        }

class ConversationResponse(BaseModel):
    client_id: int
    client_name: str
    last_message: Optional[ChatMessageResponse] = None
    unread_count: int = 0

