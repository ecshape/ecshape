import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.notification_triggers import run_weekly_notification_checks

logger = logging.getLogger(__name__)

class NotificationScheduler:
    def __init__(self):
        self.is_running = False
        self.task = None

    async def start(self):
        """Start the notification scheduler"""
        if self.is_running:
            logger.info("Notification scheduler is already running")
            return
        
        self.is_running = True
        logger.info("Starting notification scheduler")
        
        # Start the background task
        self.task = asyncio.create_task(self._run_scheduler())
        
    async def stop(self):
        """Stop the notification scheduler"""
        if not self.is_running:
            return
        
        self.is_running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("Notification scheduler stopped")

    async def _run_scheduler(self):
        """Main scheduler loop"""
        while self.is_running:
            try:
                now = datetime.now()
                
                # Check if it's Sunday at 12 PM (weekly notification checks)
                if now.weekday() == 6 and now.hour == 12 and now.minute < 5:
                    logger.info("Running weekly notification checks")
                    await self._run_weekly_checks()
                
                # Sleep for 1 minute before next check
                await asyncio.sleep(60)
                
            except Exception as e:
                logger.error(f"Error in notification scheduler: {e}")
                await asyncio.sleep(60)  # Wait before retrying

    async def _run_weekly_checks(self):
        """Run weekly notification checks"""
        try:
            # Get database session
            db = next(get_db())
            try:
                run_weekly_notification_checks(db)
                logger.info("Weekly notification checks completed successfully")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error running weekly notification checks: {e}")

# Global scheduler instance
notification_scheduler = NotificationScheduler()

async def start_notification_scheduler():
    """Start the notification scheduler"""
    await notification_scheduler.start()

async def stop_notification_scheduler():
    """Stop the notification scheduler"""
    await notification_scheduler.stop() 