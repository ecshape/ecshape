from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import os
import time
from datetime import datetime
from typing import List, Dict, Any

from app.database import get_db
from app.auth.utils import get_current_user
from app.schemas.auth import UserResponse, UserRole
from app.services.system_service import system_service
from app.services.user_service import get_users

router = APIRouter()

@router.get("/status")
async def get_system_status(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get system status and health metrics."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get real system stats
    resources = system_service.get_system_resources()
    db_stats = system_service.get_database_stats(db)
    docker_stats = system_service.get_docker_stats()
    app_info = system_service.get_application_info()
    
    # Get user counts
    all_users = get_users(db)
    active_users = len([u for u in all_users if u.is_active])
    
    # Determine system health based on metrics
    system_health = "healthy"
    if resources['cpu_usage'] > 80 or resources['memory_usage'] > 80:
        system_health = "warning"
    if resources['cpu_usage'] > 95 or resources['memory_usage'] > 95:
        system_health = "critical"
    
    return {
        "uptime": system_service.get_system_uptime(),
        "database_connections": db_stats['active_connections'],
        "memory_usage": resources['memory_usage'],
        "cpu_usage": resources['cpu_usage'],
        "active_users": active_users,
        "total_users": len(all_users),
        "system_health": system_health,
        "last_backup": db_stats['last_backup'],
        "version": app_info['version'],
        "docker_stats": docker_stats,
        "resources": resources,
        "database": db_stats,
        "application": app_info,
        "process_stats": system_service.get_process_stats() if not docker_stats.get('docker_available', False) else []
    }

@router.get("/logs")
async def get_system_logs(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get recent system logs."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return system_service.get_recent_logs(limit=50)

@router.get("/features")
async def get_system_features():
    """
    Public feature flags for the frontend.

    Notes:
    - This endpoint is intentionally unauthenticated so the UI can decide routes
      before a user session is established.
    - Controlled by environment variable `MEALS_V3_ENABLED`.
    """
    raw = (os.getenv("MEALS_V3_ENABLED") or "false").strip().lower()
    meals_v3_enabled = raw in {"1", "true", "yes", "on"}
    return {"meals_v3_enabled": meals_v3_enabled}

@router.post("/maintenance")
async def toggle_maintenance_mode(
    enabled: bool,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle maintenance mode."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Mock implementation
    return {"message": f"Maintenance mode {'enabled' if enabled else 'disabled'}"}

@router.post("/restart")
async def restart_services(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Restart system services."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Mock implementation
    return {"message": "Services restart initiated"}

@router.post("/backup")
async def create_backup(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create database backup."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    success = system_service.create_backup(db)
    if success:
        return {"message": "Database backup created successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to create backup")

@router.post("/optimize-db")
async def optimize_database(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Optimize database."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    success = system_service.optimize_database(db)
    if success:
        return {"message": "Database optimization completed"}
    else:
        raise HTTPException(status_code=500, detail="Failed to optimize database") 