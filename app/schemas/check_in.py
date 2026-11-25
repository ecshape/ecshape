from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime, timedelta

class DailyCheckInBase(BaseModel):
    date: datetime
    weight: Optional[float] = None
    steps: Optional[int] = None
    walked_10000_steps: Optional[bool] = None
    sun_exposure_10min: Optional[bool] = None
    hunger_level: Optional[int] = None  # 1-10
    sleep_hours: Optional[int] = None  # hours

class DailyCheckInCreate(DailyCheckInBase):
    # Same bounds as the app (weigh-in 20-400 kg); out-of-range input is rejected with 422 (A2A trainee F3).
    # Only on input: responses must still serve rows saved before the bounds existed.
    weight: Optional[float] = Field(None, ge=20, le=400)
    steps: Optional[int] = Field(None, ge=0, le=100000)
    hunger_level: Optional[int] = Field(None, ge=1, le=10)
    sleep_hours: Optional[int] = Field(None, ge=0, le=24)

    @field_validator("date")
    @classmethod
    def _recent_date(cls, v: datetime) -> datetime:
        # a check-in is for today or a recent day, never years back or in the future (r2 N3)
        naive = v.replace(tzinfo=None) if v.tzinfo else v
        now = datetime.utcnow()
        if naive > now + timedelta(days=2) or naive < now - timedelta(days=366):
            raise ValueError("check-in date out of range")
        return v

class DailyCheckInUpdate(BaseModel):
    weight: Optional[float] = Field(None, ge=20, le=400)
    steps: Optional[int] = Field(None, ge=0, le=100000)
    walked_10000_steps: Optional[bool] = None
    sun_exposure_10min: Optional[bool] = None
    hunger_level: Optional[int] = Field(None, ge=1, le=10)
    sleep_hours: Optional[int] = Field(None, ge=0, le=24)

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

