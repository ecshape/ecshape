"""Tenant access checks shared by every router (security audit 2026-11).

The tenant boundary of ECShape is the trainer: a trainer may act on their own clients only, a client on themself
only, an admin on everyone. Routers used to check the role alone ("is a trainer") and then load any id, which let
one trainer read or change another trainer's clients. Every id-taking endpoint now goes through these helpers.

Refusals are 404 (not 403) wherever the caller has no right to know the object exists.
"""
from typing import Iterable, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.auth import UserRole


def _role(user) -> str:
    r = getattr(user, "role", None)
    return r.value if hasattr(r, "value") else str(r or "")


def is_admin(user) -> bool:
    return _role(user) == UserRole.ADMIN.value


def is_trainer(user) -> bool:
    return _role(user) == UserRole.TRAINER.value


def is_client(user) -> bool:
    return _role(user) == UserRole.CLIENT.value


def not_found(detail: str = "Not found") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def forbidden(detail: str = "Not authorized") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def require_staff(user) -> None:
    """Trainer or admin."""
    if not (is_trainer(user) or is_admin(user)):
        raise forbidden("Trainer access only")


def require_admin(user) -> None:
    if not is_admin(user):
        raise forbidden("Admin access only")


def trainer_client_ids(db: Session, trainer_id: int) -> List[int]:
    return [row.id for row in db.query(User.id).filter(User.trainer_id == trainer_id).all()]


def can_access_client(db: Session, user, client_id: Optional[int]) -> bool:
    """May `user` read / act on data that belongs to client `client_id`?"""
    if client_id is None:
        return False
    if is_admin(user):
        return True
    if is_client(user):
        return int(client_id) == int(user.id)
    if is_trainer(user):
        return db.query(User.id).filter(User.id == client_id, User.trainer_id == user.id).first() is not None
    return False


def require_client_access(db: Session, user, client_id: Optional[int], detail: str = "Client not found") -> int:
    if not can_access_client(db, user, client_id):
        raise not_found(detail)
    return int(client_id)


def require_trainer_of(db: Session, user, client_id: Optional[int], detail: str = "Client not found") -> int:
    """Staff acting on one of their own clients (admins: any client)."""
    require_staff(user)
    if client_id is None:
        raise not_found(detail)
    target = db.query(User).filter(User.id == client_id).first()
    if not target or _role(target) != UserRole.CLIENT.value:
        raise not_found(detail)
    if is_trainer(user) and target.trainer_id != user.id:
        raise not_found(detail)
    return int(client_id)


def resolve_client_id(db: Session, user, client_id: Optional[int]) -> int:
    """For "my data or my client's data" endpoints: a client always gets themself; staff must name a client
    they may access. Returns the client id to use."""
    if is_client(user):
        if client_id is not None and int(client_id) != int(user.id):
            raise not_found("Client not found")
        return int(user.id)
    if client_id is None:
        if is_admin(user):
            raise HTTPException(status_code=400, detail="client_id is required")
        raise HTTPException(status_code=400, detail="client_id is required")
    return require_client_access(db, user, client_id)


def require_owner(user, owner_id: Optional[int], detail: str = "Not found") -> None:
    """Rows owned by a trainer (created_by / trainer_id): owner or admin."""
    if is_admin(user):
        return
    if owner_id is None or int(owner_id) != int(user.id):
        raise not_found(detail)


def require_plan_access(db: Session, user, trainer_id: Optional[int], client_id: Optional[int], write: bool = False,
                        detail: str = "Not found") -> None:
    """A plan (meal / workout / nutrition) belongs to one trainer and one client.
    Read: the plan's trainer, the plan's client, or an admin. Write: the plan's trainer (who must still coach the
    client) or an admin."""
    if is_admin(user):
        return
    if is_trainer(user):
        if trainer_id is not None and int(trainer_id) == int(user.id) and (client_id is None or can_access_client(db, user, client_id)):
            return
        raise not_found(detail)
    if is_client(user) and not write and client_id is not None and int(client_id) == int(user.id):
        return
    raise not_found(detail)


def visible_client_ids(db: Session, user) -> Optional[Iterable[int]]:
    """None = no restriction (admin)."""
    if is_admin(user):
        return None
    if is_client(user):
        return [int(user.id)]
    if is_trainer(user):
        return trainer_client_ids(db, user.id) or [-1]
    return [-1]
