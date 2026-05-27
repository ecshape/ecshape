import json
import asyncio
from typing import Dict, Set, Optional, Any
from datetime import datetime, timezone
from fastapi import WebSocket, WebSocketDisconnect
from enum import Enum

class NotificationType(str, Enum):
    """Types of real-time notifications."""
    FILE_UPLOADED = "file_uploaded"
    FILE_DELETED = "file_deleted"
    MEAL_COMPLETED = "meal_completed"
    WORKOUT_COMPLETED = "workout_completed"
    PROGRESS_UPDATED = "progress_updated"
    PLAN_UPDATED = "plan_updated"
    MESSAGE = "message"
    SYSTEM = "system"

class WebSocketService:
    """WebSocket service for real-time notifications."""
    
    def __init__(self):
        # Store active connections by user ID
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        # Store user subscriptions by user ID
        self.user_subscriptions: Dict[int, Set[str]] = {}
        # Store trainer-client relationships for notifications
        self.trainer_clients: Dict[int, Set[int]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: int):
        """Connect a user to WebSocket service."""
        await websocket.accept()
        
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
            self.user_subscriptions[user_id] = set()
        
        self.active_connections[user_id].add(websocket)
        
        # Send connection confirmation
        await self.send_personal_message(
            user_id,
            {
                "type": "connection_established",
                "user_id": user_id,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    
    def disconnect(self, websocket: WebSocket, user_id: int):
        """Disconnect a user from WebSocket service."""
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            
            # Remove user if no more connections
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                if user_id in self.user_subscriptions:
                    del self.user_subscriptions[user_id]
    
    async def send_new_notification_hint(self, user_id: int) -> None:
        """Notify a user (e.g. trainer) that a new notification exists so the client can refetch."""
        await self.send_personal_message(user_id, {"type": "new_notification"})

    async def send_personal_message(self, user_id: int, message: dict):
        """Send message to a specific user."""
        if user_id in self.active_connections:
            disconnected_websockets = set()
            
            for websocket in self.active_connections[user_id]:
                try:
                    await websocket.send_text(json.dumps(message))
                except WebSocketDisconnect:
                    disconnected_websockets.add(websocket)
                except Exception as e:
                    print(f"Error sending message to user {user_id}: {e}")
                    disconnected_websockets.add(websocket)
            
            # Clean up disconnected websockets
            for websocket in disconnected_websockets:
                self.disconnect(websocket, user_id)
    
    async def broadcast_to_trainer_clients(self, trainer_id: int, message: dict, exclude_user: Optional[int] = None):
        """Broadcast message to all clients of a trainer."""
        if trainer_id in self.trainer_clients:
            for client_id in self.trainer_clients[trainer_id]:
                if client_id != exclude_user:
                    await self.send_personal_message(client_id, message)
    
    async def broadcast_to_trainers(self, client_id: int, message: dict, exclude_user: Optional[int] = None):
        """Broadcast message to all trainers of a client."""
        for trainer_id, clients in self.trainer_clients.items():
            if client_id in clients and trainer_id != exclude_user:
                await self.send_personal_message(trainer_id, message)
    
    def add_trainer_client_relationship(self, trainer_id: int, client_id: int):
        """Add trainer-client relationship for notifications."""
        if trainer_id not in self.trainer_clients:
            self.trainer_clients[trainer_id] = set()
        self.trainer_clients[trainer_id].add(client_id)
    
    def remove_trainer_client_relationship(self, trainer_id: int, client_id: int):
        """Remove trainer-client relationship."""
        if trainer_id in self.trainer_clients:
            self.trainer_clients[trainer_id].discard(client_id)
            if not self.trainer_clients[trainer_id]:
                del self.trainer_clients[trainer_id]
    
    async def notify_file_upload(self, user_id: int, file_data: dict, file_type: str):
        """Notify about file upload."""
        message = {
            "type": NotificationType.FILE_UPLOADED,
            "file_data": file_data,
            "file_type": file_type,
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        # Send to user who uploaded
        await self.send_personal_message(user_id, message)
        
        # If it's a meal photo, notify trainer
        if file_type == "meal_photo":
            # Find trainer for this client
            for trainer_id, clients in self.trainer_clients.items():
                if user_id in clients:
                    trainer_message = {
                        "type": NotificationType.FILE_UPLOADED,
                        "file_data": file_data,
                        "file_type": file_type,
                        "client_id": user_id,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                    await self.send_personal_message(trainer_id, trainer_message)
                    break
    
    async def notify_file_deletion(self, user_id: int, file_path: str, file_type: str):
        """Notify about file deletion."""
        message = {
            "type": NotificationType.FILE_DELETED,
            "file_path": file_path,
            "file_type": file_type,
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        await self.send_personal_message(user_id, message)
    
    async def notify_meal_completion(self, client_id: int, meal_data: dict):
        """Notify about meal completion."""
        message = {
            "type": NotificationType.MEAL_COMPLETED,
            "meal_data": meal_data,
            "client_id": client_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        # Send to client
        await self.send_personal_message(client_id, message)
        
        # Notify trainer
        await self.broadcast_to_trainers(client_id, {
            "type": NotificationType.MEAL_COMPLETED,
            "meal_data": meal_data,
            "client_id": client_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    async def notify_workout_completion(self, client_id: int, workout_data: dict):
        """Notify about workout completion."""
        message = {
            "type": NotificationType.WORKOUT_COMPLETED,
            "workout_data": workout_data,
            "client_id": client_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        # Send to client
        await self.send_personal_message(client_id, message)
        
        # Notify trainer
        await self.broadcast_to_trainers(client_id, {
            "type": NotificationType.WORKOUT_COMPLETED,
            "workout_data": workout_data,
            "client_id": client_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    async def notify_progress_update(self, client_id: int, progress_data: dict):
        """Notify about progress update."""
        message = {
            "type": NotificationType.PROGRESS_UPDATED,
            "progress_data": progress_data,
            "client_id": client_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        # Send to client
        await self.send_personal_message(client_id, message)
        
        # Notify trainer
        await self.broadcast_to_trainers(client_id, {
            "type": NotificationType.PROGRESS_UPDATED,
            "progress_data": progress_data,
            "client_id": client_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    async def notify_plan_update(self, trainer_id: int, plan_data: dict, client_id: int):
        """Notify about plan update."""
        message = {
            "type": NotificationType.PLAN_UPDATED,
            "plan_data": plan_data,
            "trainer_id": trainer_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        # Send to trainer
        await self.send_personal_message(trainer_id, message)
        
        # Send to client
        await self.send_personal_message(client_id, {
            "type": NotificationType.PLAN_UPDATED,
            "plan_data": plan_data,
            "trainer_id": trainer_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    async def send_message(self, from_user_id: int, to_user_id: int, message_text: str):
        """Send direct message between users."""
        message = {
            "type": NotificationType.MESSAGE,
            "from_user_id": from_user_id,
            "message": message_text,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        # Send to recipient
        await self.send_personal_message(to_user_id, message)
        
        # Send confirmation to sender
        await self.send_personal_message(from_user_id, {
            "type": "message_sent",
            "to_user_id": to_user_id,
            "message": message_text,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    async def send_system_notification(self, user_id: int, title: str, message: str, notification_type: str = "info"):
        """Send system notification to user."""
        system_message = {
            "type": NotificationType.SYSTEM,
            "title": title,
            "message": message,
            "notification_type": notification_type,  # info, warning, error, success
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        await self.send_personal_message(user_id, system_message)
    
    def get_connection_stats(self) -> dict:
        """Get WebSocket connection statistics."""
        total_connections = sum(len(connections) for connections in self.active_connections.values())
        total_users = len(self.active_connections)
        total_subscriptions = sum(len(subscriptions) for subscriptions in self.user_subscriptions.values())
        
        return {
            "total_connections": total_connections,
            "total_users": total_users,
            "total_subscriptions": total_subscriptions,
            "trainer_client_relationships": len(self.trainer_clients)
        }

# Global WebSocket service instance
websocket_service = WebSocketService() 