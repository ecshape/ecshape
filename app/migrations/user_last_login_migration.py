import logging
from sqlalchemy import text
from app.database import engine
import os

logger = logging.getLogger(__name__)

# Detect database type
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "")
IS_POSTGRESQL = SQLALCHEMY_DATABASE_URL.startswith("postgresql") if SQLALCHEMY_DATABASE_URL else False


def _column_exists(table_name: str, column_name: str) -> bool:
    """Check if column exists - database-agnostic."""
    if IS_POSTGRESQL:
        query = text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = :table_name AND column_name = :column_name
        """)
        with engine.connect() as connection:
            result = connection.execute(query, {"table_name": table_name, "column_name": column_name})
            return result.fetchone() is not None
    else:
        # SQLite
        query = text(f"PRAGMA table_info('{table_name}')")
        with engine.connect() as connection:
            result = connection.execute(query)
            columns = [dict(row._mapping) for row in result]
            return any(column["name"] == column_name for column in columns)


def run_user_last_login_migration():
    """Add last_login column to users table if it doesn't exist."""
    try:
        logger.info("Running user last_login migration...")
        
        column_exists = _column_exists("users", "last_login")
        logger.info(f"Column 'last_login' exists check: {column_exists}")
        
        if not column_exists:
            logger.info("Adding last_login column to users table...")
            try:
                with engine.begin() as connection:
                    if IS_POSTGRESQL:
                        connection.execute(
                            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP")
                        )
                        logger.info("✅ Executed ALTER TABLE for PostgreSQL")
                    else:
                        # SQLite doesn't support IF NOT EXISTS, but we already checked
                        connection.execute(
                            text("ALTER TABLE users ADD COLUMN last_login DATETIME")
                        )
                        logger.info("✅ Executed ALTER TABLE for SQLite")
                
                # Verify the column was added
                if _column_exists("users", "last_login"):
                    logger.info("✅ Successfully added last_login column to users table")
                else:
                    logger.warning("⚠️ Column was not found after adding - may need manual intervention")
            except Exception as alter_error:
                # Check if error is because column already exists (PostgreSQL might throw this)
                if "already exists" in str(alter_error).lower() or "duplicate column" in str(alter_error).lower():
                    logger.info("✅ Column already exists (caught in ALTER TABLE)")
                else:
                    raise
        else:
            logger.info("✅ last_login column already exists in users table")
            
    except Exception as e:
        logger.error(f"❌ Failed to run user last_login migration: {e}")
        import traceback
        logger.error(f"Migration error traceback: {traceback.format_exc()}")
        # Don't raise - allow application to continue, but log the error
        logger.warning("⚠️ Continuing despite migration error - column may need to be added manually")

