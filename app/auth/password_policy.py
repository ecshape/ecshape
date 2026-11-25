"""Password rules for every place a password is set (signup, client creation, change, reset).

NIST 800-63B style: length, no composition rules, block common / context-specific passwords, allow any characters
(spaces and emoji included) up to 128. Existing passwords keep working: the rules apply only when a password is set.
PASSWORD_MIN_LENGTH (default 8, matching the portal's forms) can be raised to 12 for full ASVS 2.1.1.
"""
import os
from typing import Optional

from fastapi import HTTPException, status

MAX_LENGTH = 128  # ASVS 2.1.2 (>= 64 allowed); also keeps bcrypt / passlib away from huge inputs
BCRYPT_MAX_BYTES = 72  # bcrypt ignores bytes past 72: reject instead of silently truncating


def min_length() -> int:
    try:
        return max(8, int(os.getenv("PASSWORD_MIN_LENGTH", "8")))
    except ValueError:
        return 8


# Most common passwords of 8+ characters in public breach corpora (top of the HIBP / SecLists lists). Checked
# case-insensitively, also with a trailing run of digits / ! stripped.
_COMMON = {
    "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword",
    "12345678", "123456789", "1234567890", "12341234", "11111111", "00000000", "88888888", "87654321", "11223344",
    "qwertyui", "qwertyuiop", "qwerty123", "qwerty12", "1q2w3e4r", "1q2w3e4r5t", "1qaz2wsx", "zaq12wsx", "asdfghjk",
    "asdfasdf", "abcd1234", "abc12345", "abcdefgh", "iloveyou", "sunshine", "princess", "football", "baseball",
    "welcome1", "welcome123", "superman", "starwars", "whatever", "trustno1", "letmein1", "dragon12", "michael1",
    "computer", "internet", "shadow12", "master12", "jennifer", "jordan23", "michelle", "1234qwer", "q1w2e3r4",
    "aa123456", "a1234567", "qazwsxedc", "changeme", "admin123", "administrator", "secret12", "fitness1",
    "trainer1", "trainer123", "client123", "ecshape1", "ecshape123", "elior123", "letmein123", "monkey12",
    "default1", "login123", "test1234", "testtest", "summer2024", "summer2025", "summer2026", "winter2025",
    "123123123", "12121212", "123qweasd", "qweasdzxc", "987654321", "999999999", "77777777", "66666666",
}


def _normalized(pw: str) -> str:
    return pw.lower().rstrip("0123456789!.")


def check(password: Optional[str], *, username: Optional[str] = None, email: Optional[str] = None) -> Optional[str]:
    """Return a human-readable reason the password is refused, or None when it is acceptable."""
    if password is None:
        return "Password is required"
    n = min_length()
    if len(password) < n:
        return f"Password must be at least {n} characters"
    if len(password) > MAX_LENGTH or len(password.encode("utf-8")) > BCRYPT_MAX_BYTES:
        return f"Password is too long (at most {BCRYPT_MAX_BYTES} bytes)"
    low = password.lower()
    if low in _COMMON or _normalized(password) in _COMMON or len(set(password)) <= 2:
        return "This password is too common. Choose a less predictable one"
    for ctx in (username, (email or "").split("@")[0]):
        ctx = (ctx or "").lower()
        if len(ctx) >= 4 and ctx in low:
            return "Password must not contain the username or email"
    return None


def enforce(password: Optional[str], *, username: Optional[str] = None, email: Optional[str] = None) -> None:
    reason = check(password, username=username, email=email)
    if reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=reason)
