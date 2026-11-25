from sqlalchemy import Column, Integer, Float, Boolean, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base

class DailyCheckIn(Base):
    __tablename__ = "daily_check_ins"
    
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date = Column(DateTime, nullable=False, index=True)  # מנורמל לתחילת היום
    
    # כל השדות אופציונליים
    weight = Column(Float, nullable=True)
    steps = Column(Integer, nullable=True)
    walked_10000_steps = Column(Boolean, nullable=True)  # True/False/None
    sun_exposure_10min = Column(Boolean, nullable=True)  # True/False/None
    hunger_level = Column(Integer, nullable=True)  # 1-10
    sleep_hours = Column(Integer, nullable=True)  # 1-10
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    
    # אילוץ ייחודי: בדיקה אחת ללקוח ליום
    __table_args__ = (
        UniqueConstraint('client_id', 'date', name='unique_daily_checkin'),
    )



class WaterLog(Base):
    """QA #135: water the trainee drank on a day (their own local calendar day), in millilitres."""
    __tablename__ = "water_logs"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    day = Column(Date, nullable=False)
    ml = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("client_id", "day", name="unique_water_day"),)
