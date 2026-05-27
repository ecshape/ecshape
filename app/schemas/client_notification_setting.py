from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ClientNotificationSettingResponse(BaseModel):
    id: int
    trainer_id: int
    client_id: int
    mode: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class ClientNotificationSettingUpdate(BaseModel):
    mode: Literal["EVERYTHING", "WEEKLY_DIGEST"]


class ClientNotificationSettingWithClient(BaseModel):
    client_id: int
    client_name: str
    mode: str
