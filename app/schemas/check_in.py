from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class DailyCheckInBase(BaseModel):
    date: datetime
    weight: Optional[float] = None
    steps: Optional[int] = None
    walked_10000_steps: Optional[bool] = None
    sun_exposure_10min: Optional[bool] = None
    hunger_level: Optional[int] = None  # 1-10
    sleep_hours: Optional[int] = None  # 1-10

class DailyCheckInCreate(DailyCheckInBase):
    pass

class DailyCheckInUpdate(BaseModel):
    weight: Optional[float] = None
    steps: Optional[int] = None
    walked_10000_steps: Optional[bool] = None
    sun_exposure_10min: Optional[bool] = None
    hunger_level: Optional[int] = None
    sleep_hours: Optional[int] = None

class DailyCheckInResponse(DailyCheckInBase):
    id: int
    client_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class CheckInSummary(BaseModel):
    today_status: str  # 'completed' | 'pending' | 'none'
    current_streak: int
    last_7_days_completion: int  # מספר ימים מתוך 7
    completion_rate: float  # אחוז
    avg_weight: Optional[float] = None
    avg_steps: Optional[float] = None
    avg_sleep_hours: Optional[float] = None
    avg_hunger_level: Optional[float] = None
    total_check_ins: int
    first_check_in: Optional[datetime] = None
    last_check_in: Optional[datetime] = None

