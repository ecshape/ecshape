import logging
from typing import Dict, List
import os

from sqlalchemy import text, inspect

from app.database import engine

logger = logging.getLogger(__name__)

# Detect database type
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "")
IS_POSTGRESQL = SQLALCHEMY_DATABASE_URL.startswith("postgresql") if SQLALCHEMY_DATABASE_URL else False


def _table_exists(table_name: str) -> bool:
    """Check if a table exists in the database - database-agnostic."""
    if IS_POSTGRESQL:
        query = text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = :table_name
        """)
        with engine.connect() as connection:
            result = connection.execute(query, {"table_name": table_name})
            return result.fetchone() is not None
    else:
        # SQLite
        query = text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=:table_name"
        )
        with engine.connect() as connection:
            result = connection.execute(query, {"table_name": table_name})
            return result.fetchone() is not None


def run_progress_photos_migration() -> None:
    """
    Create progress_photos table for storing multiple photos per progress entry.
    This migration runs on EVERY startup to ensure schema matches models.
    """
    logger.info("=" * 60)
    logger.info("RUNNING PROGRESS PHOTOS MIGRATION")
    logger.info("=" * 60)
    
    try:
        if not _table_exists("progress_photos"):
            logger.info("Creating 'progress_photos' table...")
            
            if IS_POSTGRESQL:
                # PostgreSQL
                create_table_query = text("""
                    CREATE TABLE IF NOT EXISTS progress_photos (
                        id SERIAL PRIMARY KEY,
                        progress_entry_id INTEGER NOT NULL,
                        photo_path VARCHAR NOT NULL,
                        photo_type VARCHAR NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT fk_progress_entry 
                            FOREIGN KEY (progress_entry_id) 
                            REFERENCES progress_entries(id) 
                            ON DELETE CASCADE
                    )
                """)
            else:
                # SQLite
                create_table_query = text("""
                    CREATE TABLE IF NOT EXISTS progress_photos (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        progress_entry_id INTEGER NOT NULL,
                        photo_path TEXT NOT NULL,
                        photo_type TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (progress_entry_id) 
                            REFERENCES progress_entries(id) 
                            ON DELETE CASCADE
                    )
                """)
            
            with engine.begin() as connection:
                connection.execute(create_table_query)
            
            logger.info("✅ Created 'progress_photos' table")
        else:
            logger.info("✅ Table 'progress_photos' already exists")
        
        logger.info("=" * 60)
        logger.info("✅ PROGRESS PHOTOS MIGRATION COMPLETED")
        logger.info("=" * 60)
        
    except Exception as exc:
        logger.error("=" * 60)
        logger.error("❌ FAILED TO RUN PROGRESS PHOTOS MIGRATION")
        logger.error("=" * 60)
        logger.error(f"Error: {exc}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        # Don't raise - allow application to start even if migrations fail
        logger.warning("⚠️ Continuing startup despite migration errors...")
