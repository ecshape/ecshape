"""Public Meta/Instagram webhook. No JWT auth: secured by verify token + HMAC signature."""
import hashlib
import hmac
import json
import logging
import os

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from app.services import instagram_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/webhook", response_class=PlainTextResponse)
def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    expected = os.getenv("INSTAGRAM_VERIFY_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="Webhook not configured")
    if hub_mode == "subscribe" and hub_verify_token and hmac.compare_digest(hub_verify_token, expected):
        return PlainTextResponse(hub_challenge or "")
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    secret = os.getenv("INSTAGRAM_APP_SECRET")
    if not secret:
        raise HTTPException(status_code=503, detail="Webhook not configured")
    body = await request.body()
    signature = request.headers.get("x-hub-signature-256", "")
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        payload = json.loads(body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "comments":
                continue
            v = change.get("value", {})
            background_tasks.add_task(
                instagram_service.handle_comment,
                v.get("id"), v.get("text", ""),
                (v.get("from") or {}).get("id"),
                (v.get("media") or {}).get("id"),
            )
    return {"status": "ok"}
