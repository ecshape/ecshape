"""Coach automations + task inbox API (/api/studio/automations, /api/studio/tasks)."""
from datetime import datetime, timedelta
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.automation import Automation, AutomationFire, CoachTask
from app.models.user import User
from app.routers.studio import require_studio
from app.schemas.auth import UserResponse
from app.services import automation_engine as eng
from app.services import coach_channels as channels

router = APIRouter()


# ---------------------------------------------------------------- automations
class ActionIn(BaseModel):
    type: Literal['task', 'notify_coach', 'notify_client', 'chat', 'email', 'whatsapp', 'webhook']
    title: Optional[str] = Field(None, max_length=200)
    text: Optional[str] = Field(None, max_length=2000)
    body: Optional[str] = Field(None, max_length=2000)
    priority: Optional[Literal['low', 'normal', 'high', 'urgent']] = None
    url: Optional[str] = Field(None, max_length=500)


class AutomationIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    trigger: str
    config: Dict[str, Any] = {}
    actions: List[ActionIn] = []
    enabled: bool = False
    template: Optional[str] = None

    @field_validator('trigger')
    @classmethod
    def known_trigger(cls, v: str) -> str:
        if v not in eng.TRIGGERS:
            raise ValueError('unknown trigger')
        return v

    @field_validator('actions')
    @classmethod
    def few_actions(cls, v: List[ActionIn]) -> List[ActionIn]:
        if len(v) > 12:
            raise ValueError('too many actions')
        return v


class AutomationPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    config: Optional[Dict[str, Any]] = None
    actions: Optional[List[ActionIn]] = None
    enabled: Optional[bool] = None


def _out(a: Automation) -> Dict[str, Any]:
    return {'id': a.id, 'name': a.name, 'template': a.template, 'trigger': a.trigger, 'config': a.config or {},
            'actions': a.actions or [], 'enabled': bool(a.enabled), 'runs': a.runs or 0,
            'last_run_at': a.last_run_at.isoformat() if a.last_run_at else None}


def _own(db: Session, user: UserResponse, auto_id: int) -> Automation:
    a = db.query(Automation).filter(Automation.id == auto_id, Automation.trainer_id == user.id).first()
    if not a:
        raise HTTPException(404, 'Automation not found')
    return a


@router.get('/automations/meta')
def automations_meta(user: UserResponse = Depends(require_studio)):
    return {'triggers': list(eng.TRIGGERS), 'actions': list(eng.ACTION_TYPES), 'templates': eng.TEMPLATES}


@router.get('/automations')
def list_automations(user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    rows = db.query(Automation).filter(Automation.trainer_id == user.id).order_by(Automation.id).all()
    if not rows:  # first visit: the ready-made set, all off, so the coach just switches on what fits
        for t in eng.TEMPLATES:
            db.add(Automation(trainer_id=user.id, name=t['id'], template=t['id'], trigger=t['trigger'],
                              config=t['config'], actions=t['actions'], enabled=False))
        db.commit()
        rows = db.query(Automation).filter(Automation.trainer_id == user.id).order_by(Automation.id).all()
    return [_out(a) for a in rows]


@router.post('/automations', status_code=201)
def create_automation(body: AutomationIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    a = Automation(trainer_id=user.id, name=body.name, template=body.template, trigger=body.trigger, config=body.config,
                   actions=[x.model_dump(exclude_none=True) for x in body.actions], enabled=body.enabled)
    db.add(a)
    db.commit()
    db.refresh(a)
    return _out(a)


@router.patch('/automations/{auto_id}')
def update_automation(auto_id: int, body: AutomationPatch, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    a = _own(db, user, auto_id)
    if body.name is not None:
        a.name = body.name
    if body.config is not None:
        a.config = body.config
    if body.actions is not None:
        a.actions = [x.model_dump(exclude_none=True) for x in body.actions]
    if body.enabled is not None:
        a.enabled = body.enabled
    db.commit()
    db.refresh(a)
    return _out(a)


@router.delete('/automations/{auto_id}', status_code=204)
def delete_automation(auto_id: int, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    db.delete(_own(db, user, auto_id))
    db.commit()


@router.post('/automations/{auto_id}/test')
def test_automation(auto_id: int, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    """Dry run: who matches right now, and the first message as it would be sent. Nothing is sent."""
    a = _own(db, user, auto_id)
    hits = eng.evaluate(db, a)
    coach = db.query(User).get(user.id)
    preview = []
    for h in hits[:20]:
        preview.append({'client_id': h.client.id, 'name': h.client.full_name or h.client.username, 'vars': h.vars,
                        'actions': [{'type': x.get('type'), 'text': eng._fill(x.get('text') or x.get('title') or '', h.client, coach, h.vars)}
                                    for x in (a.actions or [])]})
    return {'matches': len(hits), 'preview': preview}


@router.post('/automations/{auto_id}/run')
def run_now(auto_id: int, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    a = _own(db, user, auto_id)
    return {'fired': eng.run_automation(db, a)}


# ---------------------------------------------------------------- activity + stats (QA #123)
@router.get('/automations/activity')
def automation_activity(limit: int = 40, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    """The latest firings of the coach's automations: who, which rule, what each action did."""
    rows = (db.query(AutomationFire, Automation)
            .join(Automation, Automation.id == AutomationFire.automation_id)
            .filter(Automation.trainer_id == user.id)
            .order_by(AutomationFire.fired_at.desc()).limit(max(1, min(limit, 100))).all())
    ids = {f.client_id for f, _ in rows}
    names = {u.id: (u.full_name or u.username) for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}
    return [{'id': f.id, 'automation_id': a.id, 'automation': a.name, 'template': a.template, 'trigger': a.trigger,
             'client_id': f.client_id, 'client_name': names.get(f.client_id), 'result': f.result or [],
             'fired_at': f.fired_at.isoformat() if f.fired_at else None} for f, a in rows]


@router.get('/automations/stats')
def automation_stats(user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    autos = db.query(Automation).filter(Automation.trainer_id == user.id).all()
    ids = [a.id for a in autos]
    since = now - timedelta(days=14)
    fires = (db.query(AutomationFire.fired_at, AutomationFire.result)
             .filter(AutomationFire.automation_id.in_(ids), AutomationFire.fired_at >= since).all()) if ids else []
    days = [0] * 14
    messages = 0
    for at, result in fires:
        if at:
            i = 13 - min(13, max(0, (now.date() - at.date()).days))
            days[i] += 1
        messages += sum(1 for r in (result or []) if r.get('ok') and r.get('type') in ('chat', 'email', 'whatsapp', 'notify_client'))
    week = sum(days[7:])
    open_tasks = db.query(CoachTask.id).filter(CoachTask.trainer_id == user.id, CoachTask.status == 'open').count()
    return {'active': sum(1 for a in autos if a.enabled), 'total': len(autos), 'fired_week': week,
            'fired_14d': days, 'messages_14d': messages, 'open_tasks': open_tasks}


# ---------------------------------------------------------------- integrations (QA #123)
class WhatsAppIn(BaseModel):
    phone_number_id: str = Field(..., min_length=5, max_length=40)
    token: Optional[str] = Field(None, max_length=600)
    template: Optional[str] = Field(None, max_length=120)
    lang: Optional[str] = Field(None, max_length=12)
    country_code: Optional[str] = Field(None, pattern=r'^\d{1,4}$')


class EmailIn(BaseModel):
    sender_name: Optional[str] = Field(None, max_length=120)
    reply_to: Optional[str] = Field(None, max_length=200)
    host: Optional[str] = Field(None, max_length=200)
    port: Optional[int] = Field(None, ge=1, le=65535)
    username: Optional[str] = Field(None, max_length=200)
    password: Optional[str] = Field(None, max_length=300)
    from_email: Optional[str] = Field(None, max_length=200)


def _integrations(db: Session, user: UserResponse) -> Dict[str, Any]:
    wa = channels.get(db, user.id, 'whatsapp')
    em = channels.get(db, user.id, 'email')
    wcfg = (wa.config if wa else None) or {}
    ecfg = (em.config if em else None) or {}
    webhooks = sum(1 for a in db.query(Automation).filter(Automation.trainer_id == user.id).all()
                   for x in (a.actions or []) if x.get('type') == 'webhook')
    return {
        'whatsapp': {'connected': bool(channels.wa_connected(db, user.id)), 'phone_number_id': wcfg.get('phone_number_id', ''),
                     'display_phone': wcfg.get('display_phone', ''), 'verified_name': wcfg.get('verified_name', ''),
                     'template': wcfg.get('template', ''), 'lang': wcfg.get('lang', ''), 'country_code': wcfg.get('country_code', '972'),
                     'last4': wa.secret_last4 if wa else None},
        'email': {'mode': channels.email_ready(db, user.id), 'sender_name': ecfg.get('sender_name', ''), 'reply_to': ecfg.get('reply_to', ''),
                  'host': ecfg.get('host', ''), 'port': ecfg.get('port') or 587, 'username': ecfg.get('username', ''),
                  'from_email': ecfg.get('from_email', ''), 'has_password': bool(em and em.secret_enc)},
        'webhook': {'count': webhooks},
    }


@router.get('/automations/integrations')
def get_integrations(user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    return _integrations(db, user)


@router.put('/automations/integrations/whatsapp')
def connect_whatsapp(body: WhatsAppIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    row = channels.get(db, user.id, 'whatsapp')
    token = (body.token or '').strip() or channels.secret(row)
    if not token:
        raise HTTPException(400, 'Access token is required')
    try:
        info = channels.wa_check(body.phone_number_id.strip(), token)
    except channels.ChannelError as e:
        raise HTTPException(400, str(e))
    channels.save(db, user.id, 'whatsapp', {
        'phone_number_id': body.phone_number_id.strip(), 'template': (body.template or '').strip(), 'lang': (body.lang or 'he').strip(),
        'country_code': body.country_code or '972', 'display_phone': info.get('display_phone_number', ''), 'verified_name': info.get('verified_name', ''),
    }, (body.token or '').strip() or None)
    return _integrations(db, user)


@router.put('/automations/integrations/email')
def save_email(body: EmailIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    row = channels.get(db, user.id, 'email')
    cfg = {'sender_name': (body.sender_name or '').strip(), 'reply_to': (body.reply_to or '').strip(),
           'host': (body.host or '').strip(), 'port': body.port or 587, 'username': (body.username or '').strip(),
           'from_email': (body.from_email or '').strip() or (body.username or '').strip()}
    password = (body.password or '').strip() or channels.secret(row)
    if cfg['host']:
        if not (cfg['username'] and password):
            raise HTTPException(400, 'Username and password are required for your own email server')
        try:
            channels.check_smtp(cfg['host'], int(cfg['port']), cfg['username'], password)
        except channels.ChannelError as e:
            raise HTTPException(400, str(e))
    channels.save(db, user.id, 'email', cfg, (body.password or '').strip() or None)
    return _integrations(db, user)


@router.delete('/automations/integrations/{kind}', status_code=204)
def disconnect(kind: Literal['whatsapp', 'email'], user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    row = channels.get(db, user.id, kind)
    if row:
        db.delete(row)
        db.commit()


# ---------------------------------------------------------------- tasks
class TaskIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: Optional[str] = Field(None, max_length=4000)
    client_id: Optional[int] = None
    priority: Literal['low', 'normal', 'high', 'urgent'] = 'normal'
    due_at: Optional[datetime] = None


class TaskPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    body: Optional[str] = Field(None, max_length=4000)
    priority: Optional[Literal['low', 'normal', 'high', 'urgent']] = None
    status: Optional[Literal['open', 'done', 'dismissed']] = None
    due_at: Optional[datetime] = None


def _task(t: CoachTask, names: Dict[int, User]) -> Dict[str, Any]:
    c = names.get(t.client_id) if t.client_id else None
    return {'id': t.id, 'title': t.title, 'body': t.body, 'kind': t.kind, 'priority': t.priority, 'status': t.status,
            'client_id': t.client_id, 'client_name': (c.full_name or c.username) if c else None,
            'client_avatar': c.avatar_url if c else None, 'automation_id': t.automation_id,
            'due_at': t.due_at.isoformat() if t.due_at else None,
            'created_at': t.created_at.isoformat() if t.created_at else None,
            'done_at': t.done_at.isoformat() if t.done_at else None}


def _names(db: Session, tasks: List[CoachTask]) -> Dict[int, User]:
    ids = {t.client_id for t in tasks if t.client_id}
    return {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}


@router.get('/tasks')
def list_tasks(status: Optional[str] = 'open', user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    q = db.query(CoachTask).filter(CoachTask.trainer_id == user.id)
    if status and status != 'all':
        q = q.filter(CoachTask.status == status)
    rows = q.order_by(CoachTask.created_at.desc()).limit(500).all()
    names = _names(db, rows)
    return [_task(t, names) for t in rows]


@router.post('/tasks', status_code=201)
def create_task(body: TaskIn, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    if body.client_id:
        ok = db.query(User.id).filter(User.id == body.client_id, User.trainer_id == user.id).first()
        if not ok:
            raise HTTPException(404, 'Trainee not found')
    t = CoachTask(trainer_id=user.id, client_id=body.client_id, title=body.title, body=body.body,
                  priority=body.priority, due_at=body.due_at, kind='manual')
    db.add(t)
    db.commit()
    db.refresh(t)
    return _task(t, _names(db, [t]))


@router.patch('/tasks/{task_id}')
def update_task(task_id: int, body: TaskPatch, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    t = db.query(CoachTask).filter(CoachTask.id == task_id, CoachTask.trainer_id == user.id).first()
    if not t:
        raise HTTPException(404, 'Task not found')
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(t, k, v)
    if 'status' in data:
        t.done_at = datetime.utcnow() if data['status'] != 'open' else None
    db.commit()
    db.refresh(t)
    return _task(t, _names(db, [t]))


@router.delete('/tasks/{task_id}', status_code=204)
def delete_task(task_id: int, user: UserResponse = Depends(require_studio), db: Session = Depends(get_db)):
    t = db.query(CoachTask).filter(CoachTask.id == task_id, CoachTask.trainer_id == user.id).first()
    if not t:
        raise HTTPException(404, 'Task not found')
    db.delete(t)
    db.commit()
