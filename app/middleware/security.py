"""
Security middleware for API endpoint isolation and rate limiting.
"""
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import time
import os
from collections import defaultdict
from typing import Dict, Tuple
from datetime import datetime, timedelta

# Rate limiting storage (in-memory, consider Redis for production)
rate_limit_store: Dict[str, list] = defaultdict(list)

# Blocked user agents (external tools)
BLOCKED_USER_AGENTS = [
    'postman',
    'insomnia',
    'curl',
    'wget',
    'httpie',
    'restclient',
    'apifox',
    'thunder client'
]

# Allowed origins (from environment)
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "").split(",") if os.getenv("CORS_ORIGINS") else []
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

class SecurityMiddleware(BaseHTTPMiddleware):
    """
    Security middleware that:
    1. Blocks direct API access from external tools (Postman, curl, etc.)
    2. Validates request origin/referer
    3. Implements rate limiting
    """
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.rate_limit_window = 60  # 1 minute window
        self.max_requests_per_window = 100  # Max requests per window per IP
        
    async def dispatch(self, request: Request, call_next):
        # Skip security checks for health check and static files
        # Allow static file extensions (images, fonts, etc.)
        static_extensions = ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.css', '.js', '.json', '.xml', '.txt']
        is_static_file = (
            request.url.path in ["/health", "/test", "/api/test"] or 
            request.url.path.startswith("/static/") or
            request.url.path.startswith("/assets/") or
            any(request.url.path.lower().endswith(ext) for ext in static_extensions)
        )
        
        if is_static_file:
            return await call_next(request)
        
        # Skip for login/register endpoints (but still apply rate limiting)
        is_auth_endpoint = request.url.path in ["/api/auth/login", "/api/auth/register"]
        
        # 1. Block external tools in production
        if ENVIRONMENT == "production" and not is_auth_endpoint:
            user_agent = request.headers.get("user-agent", "").lower()
            if any(blocked in user_agent for blocked in BLOCKED_USER_AGENTS):
                # Check if request has proper authentication
                auth_header = request.headers.get("authorization", "")
                if not auth_header.startswith("Bearer "):
                    return JSONResponse(
                        status_code=status.HTTP_403_FORBIDDEN,
                        content={"detail": "Direct API access is not allowed. Please use the web application."}
                    )
        
        # 2. Validate origin/referer for API endpoints in production
        if ENVIRONMENT == "production" and request.url.path.startswith("/api/") and not is_auth_endpoint:
            origin = request.headers.get("origin", "")
            referer = request.headers.get("referer", "")
            
            # Allow if origin/referer matches allowed origins
            is_allowed = False
            if origin or referer:
                check_url = origin or referer
                for allowed_origin in ALLOWED_ORIGINS:
                    if allowed_origin.strip() and check_url.startswith(allowed_origin.strip()):
                        is_allowed = True
                        break
            
            # If no origin/referer and no auth, block (but allow authenticated requests)
            if not is_allowed and not request.headers.get("authorization"):
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "Invalid request origin"}
                )
        
        # 3. Rate limiting
        client_ip = request.client.host if request.client else "unknown"
        rate_limit_key = f"{client_ip}:{request.url.path}"
        
        now = time.time()
        # Clean old entries
        rate_limit_store[rate_limit_key] = [
            timestamp for timestamp in rate_limit_store[rate_limit_key]
            if now - timestamp < self.rate_limit_window
        ]
        
        # Check rate limit
        if len(rate_limit_store[rate_limit_key]) >= self.max_requests_per_window:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Rate limit exceeded. Please try again later."},
                headers={"Retry-After": str(self.rate_limit_window)}
            )
        
        # Record request
        rate_limit_store[rate_limit_key].append(now)
        
        # Continue with request
        response = await call_next(request)
        
        # Add security headers (but skip for static files to avoid blocking)
        if not is_static_file:
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            
            if ENVIRONMENT == "production":
                response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return response

