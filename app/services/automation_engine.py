"""Coach automations engine: evaluates triggers over a coach's trainees and runs the actions once per occurrence.

Triggers read data the app already has (workout sessions, daily check-ins, logins, chat, weights), so automations
work from day one without new tracking. Every firing is recorded in AutomationFire with an "occurrence" key, so a
trainee who has not trained for 5 days gets one message — not one every 15 minutes — and gets one again only after
training and stopping again.
"""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import os
import socket
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse

import httpx
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.automation import Automation, AutomationFire, CoachTask
from app.models.chat import ChatMessage
from app.models.check_in import DailyCheckIn
from app.models.notification import Notification
from app.models.user import ClientProfile, User
from app.models.workout_system import WorkoutSessionV2
from app.schemas.auth import UserRole
from app.services import coach_channels as channels

logger = logging.getLogger(__name__)


@dataclass
class Hit:
    client: User
    occurrence: str
    vars: Dict[str, Any]


def _days(since: Optional[datetime], now: datetime) -> Optional[int]:
    if not since:
        return None
    if since.tzinfo is not None:
        since = since.replace(tzinfo=None)
    return max(0, (now - since).days)


def _first(name: str) -> str:
    return (name or '').strip().split(' ')[0]


# ---------------------------------------------------------------- triggers
def _no_workout(db: Session, clients: List[User], cfg: Dict[str, Any], now: datetime) -> List[Hit]:
    n = int(cfg.get('days') or 4)
    ids = [c.id for c in clients]
    last = dict(db.query(WorkoutSessionV2.client_id, func.max(WorkoutSessionV2.completed_at))
                .filter(WorkoutSessionV2.client_id.in_(ids), WorkoutSessionV2.is_completed.is_(True))
                .group_by(WorkoutSessionV2.client_id).all()) if ids else {}
    out = []
    for c in clients:
        ref = last.get(c.id) or c.created_at
        d = _days(ref, now)
        if d is not None and d >= n:
            out.append(Hit(c, f"nw:{last[c.id].date() if last.get(c.id) else 'never'}", {'days': d}))
    return out


def _no_app(db: Session, clients: List[User], cfg: Dict[str, Any], now: datetime) -> List[Hit]:
    n = int(cfg.get('days') or 5)
    out = []
    for c in clients:
        ref = c.last_login or c.created_at
        d = _days(ref, now)
        if d is not None and d >= n:
            out.append(Hit(c, f"na:{ref.date() if ref else 'never'}", {'days': d}))
    return out


def _no_checkin(db: Session, clients: List[User], cfg: Dict[str, Any], now: datetime) -> List[Hit]:
    n = int(cfg.get('days') or 3)
    ids = [c.id for c in clients]
    last = dict(db.query(DailyCheckIn.client_id, func.max(DailyCheckIn.date))
                .filter(DailyCheckIn.client_id.in_(ids)).group_by(DailyCheckIn.client_id).all()) if ids else {}
    out = []
    for c in clients:
        ref = last.get(c.id) or c.created_at
        d = _days(ref, now)
        if d is not None and d >= n:
            out.append(Hit(c, f"nc:{last[c.id].date() if last.get(c.id) else 'never'}", {'days': d}))
    return out


def _new_client(db: Session, clients: List[User], cfg: Dict[str, Any], now: datetime) -> List[Hit]:
    hours = int(cfg.get('hours') or 48)
    return [Hit(c, 'new', {'days': 0}) for c in clients
            if c.created_at and (now - c.created_at.replace(tzinfo=None)) <= timedelta(hours=hours)]


def _weight_change(db: Session, clients: List[User], cfg: Dict[str, Any], now: datetime) -> List[Hit]:
    kg = float(cfg.get('kg') or 1.5)
    window = int(cfg.get('days') or 7)
    direction = cfg.get('direction') or 'any'  # any | up | down
    out = []
    for c in clients:
        rows = (db.query(DailyCheckIn.date, DailyCheckIn.weight)
                .filter(DailyCheckIn.client_id == c.id, DailyCheckIn.weight.isnot(None),
                        DailyCheckIn.date >= now - timedelta(days=window + 1))
                .order_by(DailyCheckIn.date).all())
        if len(rows) < 2:
            continue
        delta = rows[-1][1] - rows[0][1]
        ok = abs(delta) >= kg and (direction == 'any' or (direction == 'up' and delta > 0) or (direction == 'down' and delta < 0))
        if ok:
            out.append(Hit(c, f"wc:{rows[-1][0].date()}", {'kg': round(delta, 1), 'days': window}))
    return out


MILESTONES = (10, 25, 50, 100, 150, 200, 300, 500)


def _milestone(db: Session, clients: List[User], cfg: Dict[str, Any], now: datetime) -> List[Hit]:
    ids = [c.id for c in clients]
    counts = dict(db.query(WorkoutSessionV2.client_id, func.count(WorkoutSessionV2.id))
                  .filter(WorkoutSessionV2.client_id.in_(ids), WorkoutSessionV2.is_completed.is_(True))
                  .group_by(WorkoutSessionV2.client_id).all()) if ids else {}
    out = []
    for c in clients:
        n = counts.get(c.id, 0)
        reached = [m for m in MILESTONES if n >= m]
        if reached:
            out.append(Hit(c, f"ms:{reached[-1]}", {'count': reached[-1]}))
    return out


def _unanswered(db: Session, clients: List[User], cfg: Dict[str, Any], now: datetime) -> List[Hit]:
    hours = int(cfg.get('hours') or 12)
    out = []
    for c in clients:
        msg = (db.query(ChatMessage).filter(ChatMessage.client_id == c.id)
               .order_by(ChatMessage.created_at.desc()).first())
        if not msg or msg.sender_id != c.id:
            continue
        at = msg.created_at.replace(tzinfo=None) if msg.created_at else None
        if at and now - at >= timedelta(hours=hours):
            out.append(Hit(c, f"uc:{msg.id}", {'hours': int((now - at).total_seconds() // 3600)}))
    return out


TRIGGERS: Dict[str, Callable[..., List[Hit]]] = {
    'no_workout': _no_workout,
    'no_app': _no_app,
    'no_checkin': _no_checkin,
    'new_client': _new_client,
    'weight_change': _weight_change,
    'milestone': _milestone,
    'unanswered_chat': _unanswered,
}

# Ready-made automations (names are i18n keys on the client; defaults here are Hebrew-first like the product).
TEMPLATES: List[Dict[str, Any]] = [
    {'id': 'no_workout_4', 'trigger': 'no_workout', 'config': {'days': 4},
     'actions': [{'type': 'chat', 'text': 'היי {first_name}, שמתי לב שלא התאמנת {days} ימים. הכל בסדר? בוא נחזור לקצב היום.'},
                 {'type': 'task', 'title': 'לא התאמן/ה {days} ימים', 'priority': 'high'}]},
    {'id': 'no_app_5', 'trigger': 'no_app', 'config': {'days': 5},
     'actions': [{'type': 'notify_client', 'title': 'מתגעגעים אליך', 'text': '{first_name}, התוכנית שלך מחכה לך באפליקציה.'},
                 {'type': 'task', 'title': 'לא נכנס/ה לאפליקציה {days} ימים', 'priority': 'normal'}]},
    {'id': 'no_checkin_3', 'trigger': 'no_checkin', 'config': {'days': 3},
     'actions': [{'type': 'notify_client', 'title': 'צ׳ק-אין יומי', 'text': 'דקה אחת: משקל, צעדים ושינה — כדי שאוכל לכוון אותך.'}]},
    {'id': 'new_client', 'trigger': 'new_client', 'config': {'hours': 48},
     'actions': [{'type': 'chat', 'text': 'ברוך הבא {first_name}! התוכנית שלך מוכנה באפליקציה. כל שאלה — אני כאן.'},
                 {'type': 'task', 'title': 'שיחת היכרות עם {name}', 'priority': 'high'}]},
    {'id': 'weight_drop', 'trigger': 'weight_change', 'config': {'kg': 2, 'days': 7, 'direction': 'down'},
     'actions': [{'type': 'task', 'title': 'ירידה חדה במשקל ({kg} ק״ג ב-{days} ימים) — לבדוק', 'priority': 'urgent'}]},
    {'id': 'milestone', 'trigger': 'milestone', 'config': {},
     'actions': [{'type': 'chat', 'text': '{count} אימונים! {first_name}, זה בדיוק מה שבונה תוצאות. גאה בך.'}]},
    {'id': 'unanswered', 'trigger': 'unanswered_chat', 'config': {'hours': 12},
     'actions': [{'type': 'task', 'title': 'הודעה של {name} מחכה {hours} שעות', 'priority': 'high'}]},
]

ACTION_TYPES = ('task', 'notify_coach', 'notify_client', 'chat', 'email', 'whatsapp', 'webhook')


def _fill(text: str, client: User, coach: Optional[User], v: Dict[str, Any]) -> str:
    data = {'name': client.full_name or client.username, 'first_name': _first(client.full_name or client.username),
            'coach': (coach.full_name if coach else '') or '', **{k: v[k] for k in v}}
    out = text or ''
    for k, val in data.items():
        out = out.replace('{' + k + '}', str(val))
    return out


def _safe_webhook(url: str) -> bool:
    """Public http(s) only — never internal addresses (SSRF)."""
    try:
        u = urlparse(url)
        if u.scheme not in ('http', 'https') or not u.hostname:
            return False
        for info in socket.getaddrinfo(u.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if not ip.is_global or ip.is_multicast:  # also CGNAT / benchmark / reserved ranges (audit 2026-11)
                return False
        return True
    except Exception:
        return False


def clients_of(db: Session, trainer_id: int) -> List[User]:
    return (db.query(User).filter(User.role == UserRole.CLIENT, User.trainer_id == trainer_id,
                                  User.is_active.is_(True)).all())


def evaluate(db: Session, auto: Automation, now: Optional[datetime] = None) -> List[Hit]:
    fn = TRIGGERS.get(auto.trigger)
    if not fn:
        return []
    clients = clients_of(db, auto.trainer_id)
    # QA #123: an automation can target only some trainees (config.client_ids); empty / missing = everyone.
    only = {int(x) for x in ((auto.config or {}).get('client_ids') or []) if str(x).isdigit()}
    if only:
        clients = [c for c in clients if c.id in only]
    return fn(db, clients, auto.config or {}, now or datetime.utcnow())


def _phone(db: Session, client: User) -> Optional[str]:
    row = db.query(ClientProfile.phone).filter(ClientProfile.user_id == client.id).first()
    return row[0] if row else None


def run_actions(db: Session, auto: Automation, hit: Hit) -> List[Dict[str, Any]]:
    coach = db.query(User).get(auto.trainer_id)
    results = []
    for a in auto.actions or []:
        t = a.get('type')
        try:
            if t == 'task':
                db.add(CoachTask(trainer_id=auto.trainer_id, client_id=hit.client.id, automation_id=auto.id,
                                 kind=auto.trigger, title=_fill(a.get('title') or auto.name, hit.client, coach, hit.vars)[:200],
                                 body=_fill(a.get('body') or '', hit.client, coach, hit.vars) or None,
                                 priority=a.get('priority') if a.get('priority') in ('low', 'normal', 'high', 'urgent') else 'normal'))
            elif t in ('notify_coach', 'notify_client'):
                to = auto.trainer_id if t == 'notify_coach' else hit.client.id
                db.add(Notification(title=_fill(a.get('title') or auto.name, hit.client, coach, hit.vars)[:255],
                                    message=_fill(a.get('text') or '', hit.client, coach, hit.vars) or auto.name,
                                    type='info', recipient_id=to, sender_id=auto.trainer_id, client_id=hit.client.id,
                                    event_type='automation'))
            elif t == 'chat':
                text = _fill(a.get('text') or '', hit.client, coach, hit.vars).strip()
                if text:
                    db.add(ChatMessage(trainer_id=auto.trainer_id, client_id=hit.client.id, sender_id=auto.trainer_id, message=text))
            elif t == 'email':
                subject = _fill(a.get('title') or auto.name, hit.client, coach, hit.vars)[:200]
                text = _fill(a.get('text') or '', hit.client, coach, hit.vars).strip()
                if not text:
                    raise ValueError('empty email')
                mode = channels.send_email(db, auto.trainer_id, coach.full_name if coach else '', coach.email if coach else '',
                                           hit.client.email or '', subject, text)
                results.append({'type': t, 'ok': True, 'mode': mode})
                continue
            elif t == 'whatsapp':
                text = _fill(a.get('text') or '', hit.client, coach, hit.vars).strip()
                if not text:
                    raise ValueError('empty message')
                row = channels.wa_connected(db, auto.trainer_id)
                if row:
                    channels.send_whatsapp(row, _phone(db, hit.client), text)
                    results.append({'type': t, 'ok': True, 'mode': 'api'})
                else:
                    # Not connected: a task with a link that opens WhatsApp with the message ready (one tap to send).
                    name = hit.client.full_name or hit.client.username
                    db.add(CoachTask(trainer_id=auto.trainer_id, client_id=hit.client.id, automation_id=auto.id,
                                     kind='whatsapp', title=f'WhatsApp: {name}'[:200],
                                     body=f'{text}\n\n{channels.wa_link(_phone(db, hit.client), text)}',
                                     priority=a.get('priority') if a.get('priority') in ('low', 'normal', 'high', 'urgent') else 'normal'))
                    results.append({'type': t, 'ok': True, 'mode': 'manual'})
                continue
            elif t == 'webhook':
                url = a.get('url') or ''
                if _safe_webhook(url):
                    httpx.post(url, timeout=5, json={
                        'automation': auto.name, 'trigger': auto.trigger, 'occurrence': hit.occurrence,
                        'client': {'id': hit.client.id, 'name': hit.client.full_name, 'email': hit.client.email},
                        'data': hit.vars,
                    })
                else:
                    raise ValueError('webhook url refused')
            results.append({'type': t, 'ok': True})
        except Exception as e:  # one failing action never blocks the others
            logger.warning('automation %s action %s failed: %s', auto.id, t, e)
            results.append({'type': t, 'ok': False, 'error': str(e)[:200]})
    return results


def run_automation(db: Session, auto: Automation, now: Optional[datetime] = None) -> int:
    """Fire every new occurrence once. Returns how many trainees it fired for."""
    fired = 0
    for hit in evaluate(db, auto, now):
        exists = db.query(AutomationFire.id).filter_by(automation_id=auto.id, client_id=hit.client.id,
                                                       occurrence=hit.occurrence).first()
        if exists:
            continue
        fire = AutomationFire(automation_id=auto.id, client_id=hit.client.id, occurrence=hit.occurrence)
        db.add(fire)
        try:
            db.flush()  # claims the occurrence (unique) before acting — two workers can't both fire it
        except IntegrityError:
            db.rollback()
            continue
        fire.result = run_actions(db, auto, hit)
        fired += 1
    if fired:
        auto.runs = (auto.runs or 0) + fired
        auto.last_run_at = datetime.utcnow()
    db.commit()
    return fired


def run_all(db: Session) -> int:
    total = 0
    for auto in db.query(Automation).filter(Automation.enabled.is_(True)).all():
        try:
            total += run_automation(db, auto)
        except Exception as e:
            db.rollback()
            logger.error('automation %s failed: %s', auto.id, e)
    return total


async def automation_loop(interval: int = 900):
    """Background loop (every 15 min). AUTOMATIONS_ENABLED=0 turns it off."""
    if os.getenv('AUTOMATIONS_ENABLED', '1') == '0':
        return
    from app.database import SessionLocal
    await asyncio.sleep(30)
    while True:
        try:
            def _tick():
                db = SessionLocal()
                try:
                    return run_all(db)
                finally:
                    db.close()
            n = await asyncio.to_thread(_tick)
            if n:
                logger.info('automations fired for %s trainee(s)', n)
        except Exception as e:
            logger.error('automation loop error: %s', e)
        await asyncio.sleep(interval)
