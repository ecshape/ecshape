from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query
import logging
from typing import Optional
import json
from datetime import datetime

from app.auth.utils import get_current_user_websocket
from app.services.websocket_service import websocket_service, NotificationType
from app.schemas.auth import UserRole, UserResponse
from app.auth.utils import get_current_user

router = APIRouter()

@router.websocket("/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: int,
):
    """
    WebSocket endpoint for real-time notifications.
    
    Args:
        websocket: WebSocket connection
        user_id: User ID for the connection
        token: JWT token for authentication
    """
    
    # The token travels as a WebSocket subprotocol ("ecshape.bearer", <jwt>) so it never lands in URLs, proxy
    # and access logs (auth audit M8). The ?token= query form is no longer accepted.
    offered = [p.strip() for p in (websocket.headers.get("sec-websocket-protocol") or "").split(",") if p.strip()]
    token = offered[1] if len(offered) >= 2 and offered[0] == "ecshape.bearer" else None
    try:
        # Authenticate user
        if not token:
            await websocket.close(code=4001, reason="Authentication required")
            return
        
        # Verify token and get user
        try:
            user = await get_current_user_websocket(token)
            if user.id != user_id:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"WebSocket: User ID mismatch - token user {user.id} != requested {user_id}")
                await websocket.close(code=4003, reason="User ID mismatch")
                return
        except HTTPException as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"WebSocket: HTTPException during auth: {e.detail}")
            await websocket.close(code=4002, reason="Authentication failed")
            return
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"WebSocket: Exception during auth: {e}")
            import traceback
            logger.error(f"WebSocket: Traceback: {traceback.format_exc()}")
            await websocket.close(code=4002, reason="Invalid token")
            return
        
        # Connect to WebSocket service
        await websocket_service.connect(websocket, user_id, subprotocol="ecshape.bearer")
        
        # Send welcome message
        welcome_message = {
            "type": "welcome",
            "user_id": user_id,
            "user_role": user.role,
            "message": "Connected to Elior Fitness real-time notifications",
            "timestamp": datetime.utcnow().isoformat()
        }
        await websocket.send_text(json.dumps(welcome_message))
        
        # Handle incoming messages
        try:
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                
                # Handle different message types
                await handle_websocket_message(user_id, message, websocket, user)
                
        except WebSocketDisconnect:
            websocket_service.disconnect(websocket, user_id)
        except Exception as e:
            print(f"WebSocket error for user {user_id}: {e}")
            websocket_service.disconnect(websocket, user_id)
            
    except Exception as e:
        print(f"WebSocket connection error: {e}")
        try:
            await websocket.close(code=4000, reason="Connection error")
        except:
            pass

def _may_message(sender, to_user_id) -> bool:
    """Direct socket messages stay inside a tenant: a client and their trainer (audit 2026-11, F-12)."""
    from app.database import SessionLocal
    from app.models.user import User
    from app.auth.access import is_admin
    if is_admin(sender):
        return True
    db = SessionLocal()
    try:
        target = db.query(User).filter(User.id == int(to_user_id)).first()
        if not target:
            return False
        return target.id == getattr(sender, "trainer_id", None) or target.trainer_id == sender.id
    except (TypeError, ValueError):
        return False
    finally:
        db.close()


async def handle_websocket_message(user_id: int, message: dict, websocket: WebSocket, user=None):
    """Handle incoming WebSocket messages."""
    
    message_type = message.get("type")
    
    if message_type == "ping":
        # Respond to ping
        pong_message = {
            "type": "pong",
            "timestamp": datetime.utcnow().isoformat()
        }
        await websocket.send_text(json.dumps(pong_message))
    
    elif message_type == "subscribe":
        # Subscribe to specific notification types
        subscription_types = message.get("subscription_types", [])
        if user_id not in websocket_service.user_subscriptions:
            websocket_service.user_subscriptions[user_id] = set()
        
        for sub_type in subscription_types:
            websocket_service.user_subscriptions[user_id].add(sub_type)
        
        # Send subscription confirmation
        confirmation = {
            "type": "subscription_confirmed",
            "subscription_types": subscription_types,
            "timestamp": datetime.utcnow().isoformat()
        }
        await websocket.send_text(json.dumps(confirmation))
    
    elif message_type == "unsubscribe":
        # Unsubscribe from specific notification types
        subscription_types = message.get("subscription_types", [])
        if user_id in websocket_service.user_subscriptions:
            for sub_type in subscription_types:
                websocket_service.user_subscriptions[user_id].discard(sub_type)
        
        # Send unsubscription confirmation
        confirmation = {
            "type": "unsubscription_confirmed",
            "subscription_types": subscription_types,
            "timestamp": datetime.utcnow().isoformat()
        }
        await websocket.send_text(json.dumps(confirmation))
    
    elif message_type == "send_message":
        # Send direct message to another user
        to_user_id = message.get("to_user_id")
        message_text = message.get("message")
        
        if not to_user_id or not message_text:
            error_message = {
                "type": "error",
                "message": "Missing required fields: to_user_id and message",
                "timestamp": datetime.utcnow().isoformat()
            }
            await websocket.send_text(json.dumps(error_message))
            return
        
        if user is None or not _may_message(user, to_user_id):
            await websocket.send_text(json.dumps({"type": "error", "message": "Recipient not allowed",
                                                  "timestamp": datetime.utcnow().isoformat()}))
            return
        await websocket_service.send_message(user_id, to_user_id, str(message_text)[:2000])
    
    elif message_type == "get_stats":
        # Connection statistics: admins only (audit 2026-11)
        if user is None or getattr(user, "role", None) != UserRole.ADMIN:
            return
        stats = websocket_service.get_connection_stats()
        stats_message = {
            "type": "connection_stats",
            "stats": stats,
            "timestamp": datetime.utcnow().isoformat()
        }
        await websocket.send_text(json.dumps(stats_message))
    
    else:
        # Unknown message type
        error_message = {
            "type": "error",
            "message": f"Unknown message type: {message_type}",
            "timestamp": datetime.utcnow().isoformat()
        }
        await websocket.send_text(json.dumps(error_message))

@router.get("/ws/stats")
async def get_websocket_stats(current_user: UserResponse = Depends(get_current_user)):
    """WebSocket connection statistics (admins; was public, audit 2026-11)."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access only")
    return websocket_service.get_connection_stats()

@router.post("/ws/test-notification/{user_id}")
async def send_test_notification(
    user_id: int,
    notification_type: str = "system",
    title: str = "Test Notification",
    message: str = "This is a test notification",
    current_user: UserResponse = Depends(get_current_user),
):
    """Send a test notification. Was unauthenticated: anyone could push a fake "system" message to any user
    (audit 2026-11, F-12). Now admins only, and never in production."""
    import os as _os
    if current_user.role != UserRole.ADMIN or _os.getenv("ENVIRONMENT", "development") == "production":
        raise HTTPException(status_code=404, detail="Not Found")
    
    if notification_type == "system":
        await websocket_service.send_system_notification(user_id, title, message)
    elif notification_type == "file_uploaded":
        await websocket_service.notify_file_upload(user_id, {
            "filename": "test_file.jpg",
            "file_size": 1024,
            "file_type": "image/jpeg"
        }, "meal_photo")
    elif notification_type == "meal_completed":
        await websocket_service.notify_meal_completion(user_id, {
            "meal_id": 1,
            "meal_type": "breakfast",
            "status": "completed"
        })
    
    return {"message": f"Test notification sent to user {user_id}"} 