from pydantic import BaseModel, validator
from typing import List, Optional
from datetime import datetime, timezone

MAX_MESSAGE_LENGTH = 4000


class ChatMessageBase(BaseModel):
    message: str
    progress_entry_id: Optional[int] = None


class ChatMessageCreate(ChatMessageBase):
    client_id: int


class ChatProgressPhoto(BaseModel):
    filename: str
    photo_type: Optional[str] = None


class ChatProgressEntry(BaseModel):
    """Compact summary of a progress entry linked to a chat message."""
    id: int
    date: str
    weight: Optional[float] = None
    notes: Optional[str] = None
    photos: List[ChatProgressPhoto] = []


def _as_utc(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        if v.tzinfo != timezone.utc:
            return v.astimezone(timezone.utc)
    return v


class ChatMessageResponse(ChatMessageBase):
    id: int
    trainer_id: int
    client_id: int
    sender_id: int
    created_at: datetime
    read_at: Optional[datetime] = None
    linked_entry: Optional[ChatProgressEntry] = None

    @validator('created_at', 'read_at', pre=True)
    def normalize_datetime(cls, v):
        """Ensure datetime is timezone-aware UTC"""
        return _as_utc(v)

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v.tzinfo else v.replace(tzinfo=timezone.utc).isoformat()
        }


class ConversationResponse(BaseModel):
    client_id: int
    client_name: str
    # Profile photo of the other side of the conversation (None = initials)
    client_avatar: Optional[str] = None
    last_message: Optional[ChatMessageResponse] = None
    unread_count: int = 0


class ChatUpdatesResponse(BaseModel):
    """Cheap polling payload: new messages since `after_id` plus read receipts."""
    messages: List[ChatMessageResponse] = []
    # Highest id among the caller's own messages that the other side has read
    read_through_id: Optional[int] = None
