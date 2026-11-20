"""Shared field types (audit 2026-11): URLs that end up in an href / src must be http(s)."""
from typing import Annotated, Optional

from pydantic import AfterValidator


def _http_url(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if not v.lower().startswith(("https://", "http://")) or len(v) > 1000:
        raise ValueError("must be an http(s) link")
    return v


SafeHttpUrl = Annotated[Optional[str], AfterValidator(_http_url)]


def _http_url_or_none(v: Optional[str]) -> Optional[str]:
    """Output side: an old stored value that is not http(s) is dropped instead of failing the response."""
    try:
        return _http_url(v)
    except ValueError:
        return None


SafeHttpUrlOut = Annotated[Optional[str], AfterValidator(_http_url_or_none)]
