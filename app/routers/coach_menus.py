"""A coach's ready-made menus, built from his food bank (QA #120 / #121). Mounted at /api/v3/meals/menus."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.auth.utils import get_current_user
from app.database import get_db
from app.models.coach_menu import CoachMenu
from app.models.meal_system import MealBank
from app.schemas.auth import UserResponse, UserRole

router = APIRouter(tags=["Coach menus"])


class CatIn(BaseModel):
    macro: Literal['protein', 'carb', 'fat']
    qty: str = Field('', max_length=120)
    foods: List[int] = Field(default_factory=list, max_length=20)


class SlotIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    time: str = Field('', max_length=5)
    kcal: int = Field(0, ge=0, le=5000)
    cats: List[CatIn] = Field(default_factory=list, max_length=6)


class MenuIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    goal: Optional[str] = Field(None, max_length=1000)
    source: Optional[str] = Field(None, max_length=40)
    kcal: int = Field(0, ge=0, le=10000)
    p: int = Field(0, ge=0, le=1000)
    c: int = Field(0, ge=0, le=1500)
    f: int = Field(0, ge=0, le=600)
    slots: List[SlotIn] = Field(default_factory=list, max_length=10)

    @field_validator('slots')
    @classmethod
    def some_slot(cls, v: List[SlotIn]) -> List[SlotIn]:
        if not v:
            raise ValueError('a menu needs at least one meal')
        return v


def _coach(user: UserResponse = Depends(get_current_user)) -> UserResponse:
    if user.role not in (UserRole.TRAINER, UserRole.ADMIN):
        raise HTTPException(403, 'Trainers only')
    return user


def _check_foods(db: Session, user: UserResponse, body: MenuIn) -> None:
    """Every food in a menu is one of the coach's own bank items."""
    ids = {f for s in body.slots for c in s.cats for f in c.foods}
    if not ids:
        return
    own = {i for (i,) in db.query(MealBank.id).filter(MealBank.id.in_(ids), MealBank.created_by == user.id).all()}
    if ids - own:
        raise HTTPException(400, 'Menus can only use foods from your bank')


def _out(m: CoachMenu) -> Dict[str, Any]:
    d = m.data or {}
    return {'id': m.id, 'name': m.name, 'goal': m.goal or '', 'source': m.source,
            'kcal': d.get('kcal', 0), 'p': d.get('p', 0), 'c': d.get('c', 0), 'f': d.get('f', 0),
            'slots': d.get('slots', []),
            'updated_at': m.updated_at.isoformat() if m.updated_at else None}


def _data(body: MenuIn) -> Dict[str, Any]:
    return {'kcal': body.kcal, 'p': body.p, 'c': body.c, 'f': body.f, 'slots': [s.model_dump() for s in body.slots]}


def _own(db: Session, user: UserResponse, menu_id: int) -> CoachMenu:
    m = db.query(CoachMenu).filter(CoachMenu.id == menu_id, CoachMenu.trainer_id == user.id).first()
    if not m:
        raise HTTPException(404, 'Menu not found')
    return m


@router.get('/menus')
def list_menus(user: UserResponse = Depends(_coach), db: Session = Depends(get_db)):
    rows = db.query(CoachMenu).filter(CoachMenu.trainer_id == user.id).order_by(CoachMenu.updated_at.desc(), CoachMenu.id.desc()).all()
    return [_out(m) for m in rows]


@router.post('/menus', status_code=201)
def create_menu(body: MenuIn, user: UserResponse = Depends(_coach), db: Session = Depends(get_db)):
    _check_foods(db, user, body)
    m = CoachMenu(trainer_id=user.id, name=body.name.strip(), goal=(body.goal or '').strip() or None, source=body.source, data=_data(body))
    db.add(m)
    db.commit()
    db.refresh(m)
    return _out(m)


@router.put('/menus/{menu_id}')
def update_menu(menu_id: int, body: MenuIn, user: UserResponse = Depends(_coach), db: Session = Depends(get_db)):
    m = _own(db, user, menu_id)
    _check_foods(db, user, body)
    m.name = body.name.strip()
    m.goal = (body.goal or '').strip() or None
    m.data = _data(body)
    db.commit()
    db.refresh(m)
    return _out(m)


@router.delete('/menus/{menu_id}', status_code=204)
def delete_menu(menu_id: int, user: UserResponse = Depends(_coach), db: Session = Depends(get_db)):
    db.delete(_own(db, user, menu_id))
    db.commit()
