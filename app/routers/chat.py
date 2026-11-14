import os
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.utils import get_current_user
from app.schemas.auth import UserResponse, UserRole
from app.schemas.chat import (
    MAX_MESSAGE_LENGTH,
    ChatMessageCreate,
    ChatMessageResponse,
    ChatProgressEntry,
    ChatProgressPhoto,
    ChatUpdatesResponse,
    ConversationResponse,
)
from app.models.chat import ChatMessage
from app.models.user import User
from app.models.progress import ProgressEntry
from app.services.websocket_service import websocket_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v2/chat", tags=["chat"])

DEFAULT_PAGE_SIZE = 60
MAX_PAGE_SIZE = 200


# ---------------------------------------------------------------- helpers

def _basename(path: Optional[str]) -> Optional[str]:
    if not path:
        return None
    return os.path.basename(path.replace("\\", "/"))


def _entry_summary(entry: Optional[ProgressEntry]) -> Optional[ChatProgressEntry]:
    if entry is None:
        return None
    photos: List[ChatProgressPhoto] = []
    seen = set()
    for photo in getattr(entry, "photos", None) or []:
        name = _basename(photo.photo_path)
        if name and name not in seen:
            seen.add(name)
            ptype = photo.photo_type.value if hasattr(photo.photo_type, "value") else (str(photo.photo_type) if photo.photo_type else None)
            photos.append(ChatProgressPhoto(filename=name, photo_type=ptype))
    legacy = _basename(entry.photo_path)
    if legacy and legacy not in seen:
        photos.insert(0, ChatProgressPhoto(filename=legacy))
    return ChatProgressEntry(
        id=entry.id,
        date=entry.date.isoformat() if entry.date else "",
        weight=entry.weight,
        notes=entry.notes,
        photos=photos,
    )


def _serialize(messages: List[ChatMessage], db: Session) -> List[ChatMessageResponse]:
    """Serialize messages, embedding a summary of any linked progress entry (one query)."""
    entry_ids = {m.progress_entry_id for m in messages if m.progress_entry_id}
    entries: Dict[int, ProgressEntry] = {}
    if entry_ids:
        for e in db.query(ProgressEntry).filter(ProgressEntry.id.in_(entry_ids)).all():
            entries[e.id] = e
    out = []
    for m in messages:
        item = ChatMessageResponse.model_validate(m)
        if m.progress_entry_id and m.progress_entry_id in entries:
            item.linked_entry = _entry_summary(entries[m.progress_entry_id])
        out.append(item)
    return out


def _resolve_pair(current_user: UserResponse, db: Session, client_id: Optional[int]) -> Tuple[int, int]:
    """Return (trainer_id, client_id) for the conversation the caller may access."""
    if current_user.role == UserRole.TRAINER:
        if not client_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="client_id is required for trainers")
        client = db.query(User).filter(
            User.id == client_id,
            User.trainer_id == current_user.id,
            User.role == UserRole.CLIENT,
        ).first()
        if not client:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found or not assigned to you")
        return current_user.id, client_id
    if current_user.role == UserRole.CLIENT:
        if not current_user.trainer_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No trainer assigned. Please contact support.")
        trainer = db.query(User).filter(User.id == current_user.trainer_id).first()
        if not trainer:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Trainer not found. Please contact support.")
        return trainer.id, current_user.id
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only trainers and clients can use the chat")


def _pair_filter(trainer_id: int, client_id: int):
    return (ChatMessage.trainer_id == trainer_id) & (ChatMessage.client_id == client_id)


def _iso(dt: datetime) -> str:
    return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()


# ---------------------------------------------------------------- routes

@router.get("/conversations", response_model=List[ConversationResponse])
async def get_conversations(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Trainer: every assigned client (even without messages), most recent first.
    Client: the single conversation with their trainer (empty list if none).
    """
    if current_user.role == UserRole.TRAINER:
        clients = db.query(User).filter(
            User.trainer_id == current_user.id,
            User.role == UserRole.CLIENT
        ).all()
        if not clients:
            return []
        client_ids = [c.id for c in clients]

        # Last message per client in one query
        last_ids = dict(
            db.query(ChatMessage.client_id, func.max(ChatMessage.id))
            .filter(ChatMessage.trainer_id == current_user.id, ChatMessage.client_id.in_(client_ids))
            .group_by(ChatMessage.client_id)
            .all()
        )
        last_msgs = {}
        if last_ids:
            for m in db.query(ChatMessage).filter(ChatMessage.id.in_(list(last_ids.values()))).all():
                last_msgs[m.client_id] = m
        unread = dict(
            db.query(ChatMessage.client_id, func.count(ChatMessage.id))
            .filter(
                ChatMessage.trainer_id == current_user.id,
                ChatMessage.client_id.in_(client_ids),
                ChatMessage.sender_id == ChatMessage.client_id,
                ChatMessage.read_at.is_(None),
            )
            .group_by(ChatMessage.client_id)
            .all()
        )

        conversations = []
        for client in clients:
            last = last_msgs.get(client.id)
            conversations.append(ConversationResponse(
                client_id=client.id,
                client_name=client.full_name or client.username,
                last_message=ChatMessageResponse.model_validate(last) if last else None,
                unread_count=unread.get(client.id, 0),
            ))

        def sort_key(c: ConversationResponse):
            ts = c.last_message.created_at.timestamp() if c.last_message else 0
            return (-ts, (c.client_name or "").lower())

        conversations.sort(key=sort_key)
        return conversations

    if current_user.role == UserRole.CLIENT:
        if not current_user.trainer_id:
            return []
        trainer = db.query(User).filter(User.id == current_user.trainer_id).first()
        if not trainer:
            return []
        last_message = db.query(ChatMessage).filter(
            _pair_filter(trainer.id, current_user.id)
        ).order_by(ChatMessage.id.desc()).first()
        unread_count = db.query(ChatMessage).filter(
            _pair_filter(trainer.id, current_user.id),
            ChatMessage.sender_id == trainer.id,
            ChatMessage.read_at.is_(None)
        ).count()
        # For clients the "client_id" field carries the trainer's id (conversation identifier)
        return [ConversationResponse(
            client_id=trainer.id,
            client_name=trainer.full_name or trainer.username,
            last_message=ChatMessageResponse.model_validate(last_message) if last_message else None,
            unread_count=unread_count
        )]

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only trainers and clients can access conversations")


@router.get("/messages", response_model=List[ChatMessageResponse])
async def get_messages(
    client_id: Optional[int] = Query(None, description="Client ID (required for trainers)"),
    after_id: Optional[int] = Query(None, description="Only messages with id greater than this (polling)"),
    before_id: Optional[int] = Query(None, description="Only messages with id lower than this (history)"),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Messages of a conversation, oldest first.
    - default / before_id: the latest `limit` messages (older than before_id)
    - after_id: the messages newer than after_id (up to `limit`)
    For clients, client_id is ignored (their trainer conversation is used).
    """
    trainer_id, cid = _resolve_pair(current_user, db, client_id)
    q = db.query(ChatMessage).filter(_pair_filter(trainer_id, cid))
    if after_id is not None:
        rows = q.filter(ChatMessage.id > after_id).order_by(ChatMessage.id.asc()).limit(limit).all()
    else:
        if before_id is not None:
            q = q.filter(ChatMessage.id < before_id)
        rows = list(reversed(q.order_by(ChatMessage.id.desc()).limit(limit).all()))
    return _serialize(rows, db)


@router.get("/updates", response_model=ChatUpdatesResponse)
async def get_updates(
    client_id: Optional[int] = Query(None, description="Client ID (required for trainers)"),
    after_id: int = Query(0, ge=0),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Polling fallback when the WebSocket is unavailable: new messages + read receipts."""
    trainer_id, cid = _resolve_pair(current_user, db, client_id)
    rows = db.query(ChatMessage).filter(
        _pair_filter(trainer_id, cid), ChatMessage.id > after_id
    ).order_by(ChatMessage.id.asc()).limit(MAX_PAGE_SIZE).all()
    read_through = db.query(func.max(ChatMessage.id)).filter(
        _pair_filter(trainer_id, cid),
        ChatMessage.sender_id == current_user.id,
        ChatMessage.read_at.isnot(None),
    ).scalar()
    return ChatUpdatesResponse(messages=_serialize(rows, db), read_through_id=read_through)


@router.post("/messages", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    message_data: ChatMessageCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a message. Can optionally link to a progress entry."""
    if current_user.role == UserRole.CLIENT and message_data.client_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only send messages as yourself")
    trainer_id, client_id = _resolve_pair(current_user, db, message_data.client_id)

    text = (message_data.message or "").strip()
    if len(text) > MAX_MESSAGE_LENGTH:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Message is too long (max {MAX_MESSAGE_LENGTH} characters)")

    progress_entry_id = message_data.progress_entry_id
    if progress_entry_id:
        progress_entry = db.query(ProgressEntry).filter(
            ProgressEntry.id == progress_entry_id,
            ProgressEntry.client_id == client_id
        ).first()
        if not progress_entry:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Progress entry not found or doesn't belong to this client")
    if not text and not progress_entry_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message is empty")

    chat_message = ChatMessage(
        trainer_id=trainer_id,
        client_id=client_id,
        sender_id=current_user.id,
        message=text,
        progress_entry_id=progress_entry_id,
        created_at=datetime.now(timezone.utc)
    )
    db.add(chat_message)
    db.commit()
    db.refresh(chat_message)

    payload = _serialize([chat_message], db)[0]

    recipient_id = client_id if current_user.role == UserRole.TRAINER else trainer_id
    try:
        await websocket_service.send_personal_message(
            recipient_id,
            {
                "type": "chat_message",
                "message_id": chat_message.id,
                "trainer_id": trainer_id,
                "client_id": client_id,
                "sender_id": current_user.id,
                "sender_name": current_user.full_name or current_user.username,
                "message": text,
                "progress_entry_id": progress_entry_id,
                "timestamp": _iso(chat_message.created_at),
                "data": payload.model_dump(mode="json"),
            }
        )
    except Exception as e:  # never fail the send because of the socket
        logger.warning(f"Failed to send chat WebSocket notification: {e}")

    return payload


@router.post("/read", status_code=status.HTTP_200_OK)
async def mark_conversation_read(
    client_id: Optional[int] = Query(None, description="Client ID (required for trainers)"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark every incoming message of a conversation as read (one call instead of one per message)."""
    trainer_id, cid = _resolve_pair(current_user, db, client_id)
    now = datetime.now(timezone.utc)
    rows = db.query(ChatMessage).filter(
        _pair_filter(trainer_id, cid),
        ChatMessage.sender_id != current_user.id,
        ChatMessage.read_at.is_(None),
    ).all()
    if not rows:
        return {"marked": 0, "read_through_id": None}
    last_id = max(m.id for m in rows)
    for m in rows:
        m.read_at = now
    db.commit()

    other_id = cid if current_user.role == UserRole.TRAINER else trainer_id
    try:
        await websocket_service.send_personal_message(other_id, {
            "type": "chat_read",
            "trainer_id": trainer_id,
            "client_id": cid,
            "reader_id": current_user.id,
            "read_through_id": last_id,
            "timestamp": _iso(now),
        })
    except Exception as e:
        logger.warning(f"Failed to send chat_read notification: {e}")
    return {"marked": len(rows), "read_through_id": last_id}


@router.put("/messages/{message_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_message_read(
    message_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark a single message as read (kept for compatibility)."""
    message = db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    if current_user.role == UserRole.CLIENT:
        if message.client_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only mark your own messages as read")
    elif current_user.role == UserRole.TRAINER:
        if message.trainer_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only mark messages in your conversations as read")
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only trainers and clients can mark messages as read")
    if message.sender_id != current_user.id and not message.read_at:
        message.read_at = datetime.now(timezone.utc)
        db.commit()
    return None
