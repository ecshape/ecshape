"""Outbound URL guard (audit 2026-11, F-13: SSRF through a trainer's custom AI base URL).

A trainer may store an OpenAI-compatible "custom" endpoint. The server then POSTs to it, so without a check
a trainer could make the server call its own private network (Railway internal services, 127.0.0.1, cloud
metadata). Only https URLs whose host resolves to public addresses are accepted. Outside production, http and
local hosts stay allowed so a developer can use a local model server.
"""
import ipaddress
import os
import socket
from typing import Optional
from urllib.parse import urlparse


def _production() -> bool:
    return (os.getenv("ENVIRONMENT") or "").lower() == "production" or bool(os.getenv("RAILWAY_PUBLIC_DOMAIN"))


def unsafe_reason(url: Optional[str], allow_private: Optional[bool] = None) -> Optional[str]:
    """None when the URL is fine to call, else a short reason."""
    if allow_private is None:
        allow_private = not _production()
    try:
        p = urlparse((url or "").strip())
    except ValueError:
        return "invalid URL"
    if p.scheme not in ("https", "http") or not p.hostname:
        return "the address must start with https://"
    if p.username or p.password:
        return "credentials in the address are not allowed"
    if allow_private:
        return None
    if p.scheme != "https":
        return "the address must use https://"
    try:
        infos = socket.getaddrinfo(p.hostname, p.port or 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return "the address cannot be resolved"
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            return "the address points to a private network"
    return None


def assert_public_url(url: Optional[str]) -> None:
    reason = unsafe_reason(url)
    if reason:
        raise ValueError(f"API address refused: {reason}")
