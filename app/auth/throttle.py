"""Brute-force and credential-stuffing throttle for sign-in and other credential checks (ASVS 2.2.1).

In memory: the API runs a single uvicorn worker (Dockerfile --workers 1). Two independent sliding windows:
- per account name (whatever was typed, existing or not, so the lockout itself can't enumerate accounts);
- per client IP (stuffing across many accounts).
A success clears the account window. Lockout is soft (429 + Retry-After) and expires on its own.
"""
import ipaddress
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import HTTPException, Request, status

WINDOW = 15 * 60
ACCOUNT_LIMIT = 10  # failures per account per 15 min
IP_LIMIT = 50  # failures per IP per 15 min

_lock = threading.Lock()
_fail: Dict[str, Deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    """Real client address. Behind Railway / Vercel the socket peer is the proxy, so use the first X-Forwarded-For
    hop when (and only when) the peer is a private / loopback address. A spoofed XFF only moves the attacker into
    another IP bucket; the per-account window still applies."""
    peer = request.client.host if request.client else ""
    try:
        private = ipaddress.ip_address(peer).is_private or ipaddress.ip_address(peer).is_loopback
    except ValueError:
        private = True
    if private:
        xff = request.headers.get("x-forwarded-for", "")
        first = xff.split(",")[0].strip()
        if first:
            return first[:64]
        real = request.headers.get("x-real-ip", "").strip()
        if real:
            return real[:64]
    return peer or "unknown"


def _prune(q: Deque[float], now: float) -> None:
    while q and now - q[0] > WINDOW:
        q.popleft()


def _retry_after(q: Deque[float], now: float) -> int:
    return max(1, int(WINDOW - (now - q[0])) + 1) if q else WINDOW


def check(scope: str, account: Optional[str], ip: str) -> None:
    """Raise 429 when this account or IP is over its failure budget."""
    now = time.time()
    keys = [(f"{scope}:ip:{ip}", IP_LIMIT)]
    if account:
        keys.append((f"{scope}:acct:{account.strip().lower()}", ACCOUNT_LIMIT))
    with _lock:
        for key, limit in keys:
            q = _fail[key]
            _prune(q, now)
            if len(q) >= limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many attempts. Please wait a few minutes and try again.",
                    headers={"Retry-After": str(_retry_after(q, now))},
                )


def failure(scope: str, account: Optional[str], ip: str) -> None:
    now = time.time()
    with _lock:
        _fail[f"{scope}:ip:{ip}"].append(now)
        if account:
            _fail[f"{scope}:acct:{account.strip().lower()}"].append(now)


def success(scope: str, account: Optional[str]) -> None:
    if account:
        with _lock:
            _fail.pop(f"{scope}:acct:{account.strip().lower()}", None)


def reset_all() -> None:
    """Tests only."""
    with _lock:
        _fail.clear()
