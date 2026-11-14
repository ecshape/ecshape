"""Silent live refresh for the trainer's screens when a client does something (r2 R5)."""
from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.models.user import User
from app.services.websocket_service import websocket_service


def queue_trainer_refresh(background_tasks: BackgroundTasks, db: Session, client_id: int, event: str) -> None:
    trainer_id = db.query(User.trainer_id).filter(User.id == client_id).scalar()
    if trainer_id:
        background_tasks.add_task(websocket_service.send_live_refresh, trainer_id, event)
