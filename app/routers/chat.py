from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from app.database import get_db
from app.auth.utils import get_current_user
from app.schemas.auth import UserResponse, UserRole
from app.schemas.chat import ChatMessageCreate, ChatMessageResponse, ConversationResponse
from app.models.chat import ChatMessage
from app.models.user import User
from app.models.progress import ProgressEntry
from app.services.websocket_service import websocket_service

router = APIRouter(prefix="/v2/chat", tags=["chat"])

@router.get("/conversations", response_model=List[ConversationResponse])
async def get_conversations(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all conversations for trainer (all clients), or own conversation for client.
    """
    if current_user.role == UserRole.TRAINER:
        # Trainer sees all their clients, even if no conversation started
        clients = db.query(User).filter(
            User.trainer_id == current_user.id,
            User.role == UserRole.CLIENT
        ).all()
        
        conversations = []
        for client in clients:
            # Get last message
            last_message = db.query(ChatMessage).filter(
                ((ChatMessage.trainer_id == current_user.id) & (ChatMessage.client_id == client.id)) |
                ((ChatMessage.client_id == current_user.id) & (ChatMessage.trainer_id == client.id))
            ).order_by(ChatMessage.created_at.desc()).first()
            
            # Count unread messages (messages sent by client that trainer hasn't read)
            unread_count = db.query(ChatMessage).filter(
                ChatMessage.trainer_id == current_user.id,
                ChatMessage.client_id == client.id,
                ChatMessage.sender_id == client.id,
                ChatMessage.read_at.is_(None)
            ).count()
            
            conversations.append(ConversationResponse(
                client_id=client.id,
                client_name=client.full_name or client.username,
                last_message=ChatMessageResponse.model_validate(last_message) if last_message else None,
                unread_count=unread_count
            ))
        
        return conversations
    
    elif current_user.role == UserRole.CLIENT:
        # Client sees their trainer conversation
        if not current_user.trainer_id:
            # Log for debugging
            print(f"CLIENT CHAT ERROR: Client {current_user.id} ({current_user.username}) has no trainer_id assigned")
            return []
        
        trainer = db.query(User).filter(User.id == current_user.trainer_id).first()
        if not trainer:
            # Log for debugging
            print(f"CLIENT CHAT ERROR: Client {current_user.id} has trainer_id={current_user.trainer_id} but trainer not found in database")
            return []
        
        # Get last message
        last_message = db.query(ChatMessage).filter(
            ((ChatMessage.trainer_id == trainer.id) & (ChatMessage.client_id == current_user.id)) |
            ((ChatMessage.client_id == trainer.id) & (ChatMessage.trainer_id == current_user.id))
        ).order_by(ChatMessage.created_at.desc()).first()
        
        # Count unread messages (messages sent by trainer that client hasn't read)
        unread_count = db.query(ChatMessage).filter(
            ChatMessage.trainer_id == trainer.id,
            ChatMessage.client_id == current_user.id,
            ChatMessage.sender_id == trainer.id,
            ChatMessage.read_at.is_(None)
        ).count()
        
        # For clients, return trainer's info in the conversation response
        return [ConversationResponse(
            client_id=trainer.id,  # Trainer's ID (used as identifier for the conversation)
            client_name=trainer.full_name or trainer.username,  # Trainer's name
            last_message=ChatMessageResponse.model_validate(last_message) if last_message else None,
            unread_count=unread_count
        )]
    
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers and clients can access conversations"
        )

@router.get("/messages", response_model=List[ChatMessageResponse])
async def get_messages(
    client_id: Optional[int] = Query(None, description="Client ID (required for trainers)"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get messages for a conversation.
    For trainers: client_id is required.
    For clients: client_id is ignored, uses their trainer.
    """
    if current_user.role == UserRole.TRAINER:
        if not client_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="client_id is required for trainers"
            )
        
        # Verify client belongs to trainer
        client = db.query(User).filter(
            User.id == client_id,
            User.trainer_id == current_user.id,
            User.role == UserRole.CLIENT
        ).first()
        
        if not client:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Client not found or not assigned to you"
            )
        
        # Get messages between trainer and client
        messages = db.query(ChatMessage).filter(
            ((ChatMessage.trainer_id == current_user.id) & (ChatMessage.client_id == client_id)) |
            ((ChatMessage.client_id == current_user.id) & (ChatMessage.trainer_id == client_id))
        ).order_by(ChatMessage.created_at.asc()).all()
        
        return [ChatMessageResponse.model_validate(msg) for msg in messages]
    
    elif current_user.role == UserRole.CLIENT:
        # Client gets messages with their trainer
        if not current_user.trainer_id:
            print(f"CLIENT MESSAGES ERROR: Client {current_user.id} has no trainer_id")
            return []
        
        trainer = db.query(User).filter(User.id == current_user.trainer_id).first()
        if not trainer:
            print(f"CLIENT MESSAGES ERROR: Trainer {current_user.trainer_id} not found for client {current_user.id}")
            return []
        
        messages = db.query(ChatMessage).filter(
            ((ChatMessage.trainer_id == trainer.id) & (ChatMessage.client_id == current_user.id)) |
            ((ChatMessage.client_id == trainer.id) & (ChatMessage.trainer_id == current_user.id))
        ).order_by(ChatMessage.created_at.asc()).all()
        
        return [ChatMessageResponse.model_validate(msg) for msg in messages]
    
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers and clients can access messages"
        )

@router.post("/messages", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    message_data: ChatMessageCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Send a message. Can optionally link to a progress entry.
    """
    if current_user.role == UserRole.TRAINER:
        # Trainer sends to a client
        if not message_data.client_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="client_id is required for trainers"
            )
        
        # Verify client belongs to trainer
        client = db.query(User).filter(
            User.id == message_data.client_id,
            User.trainer_id == current_user.id,
            User.role == UserRole.CLIENT
        ).first()
        
        if not client:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Client not found or not assigned to you"
            )
        
        trainer_id = current_user.id
        client_id = message_data.client_id
        
    elif current_user.role == UserRole.CLIENT:
        # Client sends to their trainer
        if not current_user.trainer_id:
            print(f"CLIENT SEND ERROR: Client {current_user.id} has no trainer_id")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No trainer assigned. Please contact support."
            )
        
        trainer = db.query(User).filter(User.id == current_user.trainer_id).first()
        if not trainer:
            print(f"CLIENT SEND ERROR: Trainer {current_user.trainer_id} not found for client {current_user.id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Trainer not found. Please contact support."
            )
        
        trainer_id = trainer.id
        client_id = current_user.id
        
        # Override client_id from request if provided (should match current user)
        if message_data.client_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only send messages as yourself"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers and clients can send messages"
        )
    
    # Verify progress entry if provided
    progress_entry_id = message_data.progress_entry_id
    if progress_entry_id:
        progress_entry = db.query(ProgressEntry).filter(
            ProgressEntry.id == progress_entry_id,
            ProgressEntry.client_id == client_id
        ).first()
        
        if not progress_entry:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Progress entry not found or doesn't belong to this client"
            )
    
    # Create message with explicit UTC timestamp
    chat_message = ChatMessage(
        trainer_id=trainer_id,
        client_id=client_id,
        sender_id=current_user.id,
        message=message_data.message,
        progress_entry_id=progress_entry_id,
        created_at=datetime.now(timezone.utc)
    )
    
    db.add(chat_message)
    db.commit()
    db.refresh(chat_message)
    
    # Send WebSocket notification to recipient
    recipient_id = client_id if current_user.role == UserRole.TRAINER else trainer_id
    try:
        await websocket_service.send_personal_message(
            recipient_id,
            {
                "type": "chat_message",
                "message_id": chat_message.id,
                "sender_id": current_user.id,
                "sender_name": current_user.full_name or current_user.username,
                "message": message_data.message,
                "progress_entry_id": progress_entry_id,
                "timestamp": (chat_message.created_at.replace(tzinfo=timezone.utc) if chat_message.created_at.tzinfo is None else chat_message.created_at).isoformat()
            }
        )
    except Exception as e:
        # Log but don't fail if WebSocket fails
        print(f"Failed to send WebSocket notification: {e}")
    
    return ChatMessageResponse.model_validate(chat_message)

@router.put("/messages/{message_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_message_read(
    message_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a message as read.
    """
    message = db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
    
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found"
        )
    
    # Verify user has access to this message
    if current_user.role == UserRole.CLIENT:
        if message.client_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only mark your own messages as read"
            )
    elif current_user.role == UserRole.TRAINER:
        if message.trainer_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only mark messages in your conversations as read"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only trainers and clients can mark messages as read"
        )
    
    # Only mark as read if it wasn't sent by the current user
    if message.sender_id != current_user.id and not message.read_at:
        message.read_at = datetime.now(timezone.utc)
        db.commit()
    
    return None

