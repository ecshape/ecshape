#!/usr/bin/env python3
"""
Script to ensure admin user exists at startup
Directly uses database instead of API to avoid dependency on API being up
Handles fresh installs where database doesn't exist yet
"""
import sys
import os
from pathlib import Path

# Add app directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal, engine, Base, init_database
from app.models.user import User
from app.schemas.auth import UserRole
from app.auth.utils import get_password_hash

# Import all models to ensure Base.metadata knows about all tables
# This is necessary for table creation
try:
    from app.models import *  # Import all models
except ImportError:
    # If import fails, at least import the essential ones
    from app.models.user import User
    from app.models.workout import Workout
    from app.models.workout_system import NewWorkoutPlan, WorkoutDay, WorkoutExercise
    from app.models.meal_system import MealPlan, MealEntry, MealComponent
    from app.models.nutrition import NutritionEntry
    from app.models.progress import ProgressEntry
    from app.models.notification import Notification
    from app.models.chat import ChatMessage


def _resolve_admin_password() -> str:
    """Require ADMIN_PASSWORD on Railway/production; allow local default only off-platform."""
    password = os.getenv("ADMIN_PASSWORD")
    if password:
        return password

    on_railway = bool(os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_PROJECT_ID"))
    environment = (os.getenv("ENVIRONMENT") or "").lower()
    if on_railway or environment in {"production", "staging", "preview"}:
        raise SystemExit(
            "ADMIN_PASSWORD must be set via environment variables "
            "(default admin123 is disabled on deployed environments)."
        )

    print("WARNING: ADMIN_PASSWORD unset; using local-only default admin123")
    return "admin123"


ADMIN_USER = {
    "username": "admin",
    "email": "admin@elior.com",
    "full_name": "Admin User",
    "role": UserRole.ADMIN,
}

def ensure_admin_exists():
    """Create admin user directly in database if it doesn't exist"""
    admin_password = _resolve_admin_password()
    password_from_env = bool(os.getenv("ADMIN_PASSWORD"))

    # First, ensure database tables exist (handles fresh installs)
    print("Initializing database tables if needed...")
    if not init_database():
        print("Warning: Database initialization had issues, but continuing...")
    
    # Run migrations to ensure all tables are properly set up
    # This ensures schema matches models on every startup
    try:
        print("Running database migrations to ensure schema matches models...")
        from app.migrations.meal_system_migration import run_meal_system_migrations
        from app.migrations.workout_system_migration import run_workout_system_migrations
        from app.migrations.user_last_login_migration import run_user_last_login_migration
        from app.migrations.meal_calorie_goal_migration import run_meal_calorie_goal_migration
        
        print("Running meal system migrations...")
        run_meal_system_migrations()
        
        print("Running workout system migrations...")
        run_workout_system_migrations()
        
        print("Running user last_login migration...")
        run_user_last_login_migration()
        
        print("Running meal calorie goal migration...")
        run_meal_calorie_goal_migration()

        # users.avatar_url / avatar_path must exist before the admin query below (the User model selects them)
        print("Running user avatar migration...")
        from app.migrations.user_avatar_migration import run_user_avatar_migration
        run_user_avatar_migration()
        
    except Exception as migration_error:
        print(f"⚠️ Warning: Some migrations encountered errors: {migration_error}")
        import traceback
        print(f"Migration error details: {traceback.format_exc()}")
        # Continue anyway - tables might already exist and migrations are non-critical
        print("Continuing with admin setup...")
    
    # Small delay to ensure migrations are fully committed
    import time
    time.sleep(0.5)
    
    db = SessionLocal()
    try:
        # Check if admin already exists
        admin = db.query(User).filter(
            (User.username == ADMIN_USER["username"]) | 
            (User.email == ADMIN_USER["email"])
        ).first()
        
        if admin:
            if admin.role != UserRole.ADMIN:
                admin.role = UserRole.ADMIN
            # Only rotate password when ADMIN_PASSWORD is explicitly provided
            if password_from_env:
                admin.hashed_password = get_password_hash(admin_password)
                db.commit()
                print("Admin user verified; password updated from ADMIN_PASSWORD.")
            else:
                db.commit()
                print("Admin user verified (password unchanged).")
            return True
        
        # Create new admin user
        admin = User(
            username=ADMIN_USER["username"],
            email=ADMIN_USER["email"],
            hashed_password=get_password_hash(admin_password),
            full_name=ADMIN_USER["full_name"],
            role=UserRole.ADMIN,
            is_active=True
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        print(f"Admin user created: username={ADMIN_USER['username']}")
        return True
        
    except Exception as e:
        print(f"Error ensuring admin exists: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    print("=== ELIOR FITNESS ADMIN CHECK ===")
    
    if ensure_admin_exists():
        print("Admin setup completed successfully.")
        sys.exit(0)
    else:
        print("Failed to setup admin user.")
        sys.exit(1)
