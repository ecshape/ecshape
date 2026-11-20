"""Per-user limits for endpoints that spend money (AI calls) — audit 2026-11, F-15 (OWASP API4).

In-memory, per process (the app runs one worker). Each (bucket, user) keeps a minute window and a day window.
"""
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from fastapi import HTTPException

LIMITS: Dict[str, Tuple[int, int]] = {
    # bucket: (per minute, per day)
    "ai": (20, 400),          # photo recognition, agent, article writer, variants, key test
    "translate": (60, 3000),  # library text translation (cached; the portal sends batches)
}
_hits: Dict[Tuple[str, int], Deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def check(bucket: str, user_id: int) -> None:
    per_min, per_day = LIMITS[bucket]
    now = time.time()
    with _lock:
        q = _hits[(bucket, int(user_id))]
        while q and now - q[0] > 86400:
            q.popleft()
        recent = sum(1 for t in q if now - t < 60)
        if recent >= per_min or len(q) >= per_day:
            raise HTTPException(status_code=429, detail="Too many AI requests, please wait a moment",
                                headers={"Retry-After": "60"})
        q.append(now)


def reset() -> None:
    with _lock:
        _hits.clear()
