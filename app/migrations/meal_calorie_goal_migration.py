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


def run_meal_calorie_goal_migration():
    """Add calorie_goal and track_cross_macros columns to macro_categories_v2 table if they don't exist."""
    try:
        logger.info("Running meal calorie goal migration...")
        
        columns_to_add = {
            "calorie_goal": "INTEGER",
            "track_cross_macros": "BOOLEAN"
        }
        
        with engine.begin() as connection:
            for column_name, column_type in columns_to_add.items():
                if not _column_exists("macro_categories_v2", column_name):
                    logger.info(f"Adding {column_name} column to macro_categories_v2 table...")
                    if IS_POSTGRESQL:
                        if column_type == "BOOLEAN":
                            connection.execute(
                                text(f"ALTER TABLE macro_categories_v2 ADD COLUMN {column_name} BOOLEAN DEFAULT FALSE")
                            )
                        else:
                            connection.execute(
                                text(f"ALTER TABLE macro_categories_v2 ADD COLUMN {column_name} {column_type}")
                            )
                    else:
                        # SQLite uses INTEGER for boolean (0/1)
                        if column_type == "BOOLEAN":
                            connection.execute(
                                text(f"ALTER TABLE macro_categories_v2 ADD COLUMN {column_name} INTEGER DEFAULT 0")
                            )
                        else:
                            connection.execute(
                                text(f"ALTER TABLE macro_categories_v2 ADD COLUMN {column_name} {column_type}")
                            )
                    logger.info(f"✅ Successfully added {column_name} column to macro_categories_v2 table")
                else:
                    logger.info(f"✅ {column_name} column already exists in macro_categories_v2 table")
            
    except Exception as e:
        logger.error(f"❌ Failed to run meal calorie goal migration: {e}")
        import traceback
        logger.error(f"Migration error traceback: {traceback.format_exc()}")
        raise

