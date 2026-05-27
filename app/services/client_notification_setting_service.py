from sqlalchemy.orm import Session
from typing import List, Optional

from app.models.client_notification_setting import ClientNotificationSetting
from app.models.user import User

DEFAULT_MODE = "WEEKLY_DIGEST"


class ClientNotificationSettingService:
    @staticmethod
    def get_or_default(db: Session, trainer_id: int, client_id: int) -> str:
        row = (
            db.query(ClientNotificationSetting)
            .filter(
                ClientNotificationSetting.trainer_id == trainer_id,
                ClientNotificationSetting.client_id == client_id,
            )
            .first()
        )
        return row.mode if row else DEFAULT_MODE

    @staticmethod
    def get_setting(db: Session, trainer_id: int, client_id: int) -> Optional[ClientNotificationSetting]:
        return (
            db.query(ClientNotificationSetting)
            .filter(
                ClientNotificationSetting.trainer_id == trainer_id,
                ClientNotificationSetting.client_id == client_id,
            )
            .first()
        )

    @staticmethod
    def list_by_trainer(db: Session, trainer_id: int) -> List[dict]:
        settings = (
            db.query(ClientNotificationSetting, User.full_name)
            .join(User, User.id == ClientNotificationSetting.client_id)
            .filter(ClientNotificationSetting.trainer_id == trainer_id)
            .all()
        )
        return [
            {
                "client_id": s.client_id,
                "client_name": name or f"Client {s.client_id}",
                "mode": s.mode,
            }
            for s, name in settings
        ]

    @staticmethod
    def upsert(db: Session, trainer_id: int, client_id: int, mode: str) -> ClientNotificationSetting:
        row = ClientNotificationSettingService.get_setting(db, trainer_id, client_id)
        if row:
            row.mode = mode
            db.commit()
            db.refresh(row)
            return row
        row = ClientNotificationSetting(
            trainer_id=trainer_id,
            client_id=client_id,
            mode=mode,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row


client_notification_setting_service = ClientNotificationSettingService()
