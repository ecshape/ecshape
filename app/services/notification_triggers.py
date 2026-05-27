from sqlalchemy.orm import Session
from sqlalchemy import and_, func, extract
from datetime import datetime, timedelta, time
from typing import List, Optional
from app.models.user import User
from app.models.progress import ProgressEntry
from app.models.workout import WorkoutExercise, ExerciseCompletion
from app.models.nutrition import MealPlan, MealUpload
from app.models.user import ClientProfile
from app.models.client_notification_setting import ClientNotificationSetting
from app.models.workout_system import WorkoutSessionV2 as NewWorkoutSession, WorkoutDay, WorkoutPlanV2 as NewWorkoutPlan
from app.models.meal_system import MealCompletionStatus, MealPlanV2 as NewMealPlan, MealSlot
from sqlalchemy import distinct
from app.services.notification_service import notification_service
from app.services.client_notification_setting_service import client_notification_setting_service
from app.schemas.notification import NotificationCreate

class NotificationTriggers:
    @staticmethod
    def send_critical_server_notification(
        db: Session,
        title: str,
        message: str,
        notification_type: str = "error"
    ):
        """Send critical notifications to all admins"""
        admins = db.query(User).filter(User.role == "ADMIN").all()
        
        for admin in admins:
            notification_data = NotificationCreate(
                title=title,
                message=message,
                type=notification_type,
                recipient_id=admin.id
            )
            notification_service.create_notification(
                db=db,
                notification_data=notification_data,
                sender_id=None  # System notification
            )

    @staticmethod
    def check_goal_achievements(db: Session, client_id: int):
        """Check if client has reached their goals and notify trainer."""
        client = db.query(User).filter(User.id == client_id).first()
        if not client or not client.trainer_id:
            return
        latest_progress = (
            db.query(ProgressEntry)
            .filter(ProgressEntry.client_id == client_id)
            .order_by(ProgressEntry.created_at.desc())
            .first()
        )
        if not latest_progress:
            return
        profile = db.query(ClientProfile).filter(ClientProfile.user_id == client_id).first()
        target_kg = None
        if profile and profile.target_weight is not None:
            target_kg = profile.target_weight / 1000.0
        current_kg = latest_progress.weight
        if target_kg is not None and current_kg is not None and current_kg <= target_kg:
            notification_data = NotificationCreate(
                title="Goal Achievement!",
                message=f"Client {client.full_name or client.username} has reached their target weight goal!",
                type="success",
                recipient_id=client.trainer_id,
                client_id=client_id,
                event_type="goal_achievement",
            )
            notification_service.create_notification(
                db=db,
                notification_data=notification_data,
                sender_id=None,
            )

    @staticmethod
    def check_missed_exercises_weekly(db: Session):
        """Check for missed exercises at the end of the week (Sunday 12 PM)"""
        now = datetime.now()
        
        # Only run on Sunday at 12 PM
        if now.weekday() != 6 or now.hour != 12:  # Sunday = 6
            return
        
        # Get the start of the week (Monday)
        week_start = now - timedelta(days=now.weekday() + 1)
        week_end = week_start + timedelta(days=7)
        
        # Get all clients with their trainers
        clients = db.query(User).filter(User.role == "CLIENT").all()
        
        for client in clients:
            if not client.trainer_id:
                continue
            
            # Count missed exercises for this client this week
            missed_exercises = db.query(WorkoutExercise).join(
                ExerciseCompletion, 
                and_(
                    WorkoutExercise.id == ExerciseCompletion.workout_exercise_id,
                    ExerciseCompletion.client_id == client.id,
                    ExerciseCompletion.completed_at >= week_start,
                    ExerciseCompletion.completed_at < week_end
                ),
                isouter=True
            ).filter(
                and_(
                    WorkoutExercise.workout_session.has(trainer_id=client.trainer_id),
                    ExerciseCompletion.id.is_(None)
                )
            ).count()
            
            # If missed 2 or more exercises, notify trainer
            if missed_exercises >= 2:
                notification_data = NotificationCreate(
                    title="Missed Exercises Alert ⚠️",
                    message=f"Client {client.full_name} missed {missed_exercises} exercises this week. Consider reaching out to provide support.",
                    type="warning",
                    recipient_id=client.trainer_id
                )
                notification_service.create_notification(
                    db=db,
                    notification_data=notification_data,
                    sender_id=None
                )

    @staticmethod
    def check_missed_meals_weekly(db: Session):
        """Check for missed meals at the end of the week (Sunday 12 PM)"""
        now = datetime.now()
        
        # Only run on Sunday at 12 PM
        if now.weekday() != 6 or now.hour != 12:  # Sunday = 6
            return
        
        # Get the start of the week (Monday)
        week_start = now - timedelta(days=now.weekday() + 1)
        week_end = week_start + timedelta(days=7)
        
        # Get all clients with their trainers
        clients = db.query(User).filter(User.role == "CLIENT").all()
        
        for client in clients:
            if not client.trainer_id:
                continue
            
            # Count missed meals for this client this week
            total_meals = db.query(MealPlan).filter(
                and_(
                    MealPlan.client_id == client.id,
                    MealPlan.date >= week_start.date(),
                    MealPlan.date < week_end.date()
                )
            ).count()
            
            completed_meals = db.query(MealUpload).join(
                MealPlan, MealUpload.meal_entry_id == MealPlan.id
            ).filter(
                and_(
                    MealPlan.client_id == client.id,
                    MealPlan.date >= week_start.date(),
                    MealPlan.date < week_end.date(),
                    MealUpload.marked_ok == True
                )
            ).count()
            
            missed_meals = total_meals - completed_meals
            
            # If missed 4 or more meals, notify trainer
            if missed_meals >= 4:
                notification_data = NotificationCreate(
                    title="Missed Meals Alert 🍽️",
                    message=f"Client {client.full_name} missed {missed_meals} meals this week. They may need nutritional guidance or support.",
                    type="warning",
                    recipient_id=client.trainer_id
                )
                notification_service.create_notification(
                    db=db,
                    notification_data=notification_data,
                    sender_id=None
                )

    @staticmethod
    def notify_trainer_on_client_registration(db: Session, client_id: int, trainer_id: int):
        """Notify trainer when a new client is assigned"""
        client = db.query(User).filter(User.id == client_id).first()
        if client:
            notification_data = NotificationCreate(
                title="New Client Assigned 👤",
                message=f"New client {client.full_name} has been assigned to you. Welcome them and start their fitness journey!",
                type="info",
                recipient_id=trainer_id
            )
            notification_service.create_notification(
                db=db,
                notification_data=notification_data,
                sender_id=None
            )

    @staticmethod
    def notify_admin_on_critical_error(db: Session, error_type: str, details: str):
        """Notify admins about critical system errors"""
        NotificationTriggers.send_critical_server_notification(
            db=db,
            title=f"Critical System Error: {error_type}",
            message=f"System encountered a critical error: {details}. Immediate attention required.",
            notification_type="error"
        )

    @staticmethod
    def notify_admin_on_system_warning(db: Session, warning_type: str, details: str):
        """Notify admins about system warnings"""
        NotificationTriggers.send_critical_server_notification(
            db=db,
            title=f"System Warning: {warning_type}",
            message=f"System warning detected: {details}. Monitor closely.",
            notification_type="warning"
        )

    @staticmethod
    def notify_admin_on_user_activity(db: Session, activity_type: str, user_id: int, details: str):
        """Notify admins about important user activities"""
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            NotificationTriggers.send_critical_server_notification(
                db=db,
                title=f"User Activity: {activity_type}",
                message=f"User {user.full_name} ({user.role}) performed: {details}",
                notification_type="info"
            )

def run_weekly_digest_for_trainers(db: Session) -> None:
    """
    For each client with WEEKLY_DIGEST, build one notification per trainer-client:
    e.g. "David missed 4 training sessions this week. David didn't log meals on 3 days."
    """
    from datetime import date as date_type
    now = datetime.now()
    week_start = now - timedelta(days=now.weekday())
    week_end = week_start + timedelta(days=7)
    week_start_dt = datetime.combine(week_start.date(), datetime.min.time())
    week_end_dt = datetime.combine(week_end.date(), datetime.min.time())

    digest_settings = (
        db.query(ClientNotificationSetting)
        .filter(ClientNotificationSetting.mode == "WEEKLY_DIGEST")
        .all()
    )
    for row in digest_settings:
        client_id = row.client_id
        trainer_id = row.trainer_id
        client = db.query(User).filter(User.id == client_id).first()
        if not client or client.trainer_id != trainer_id:
            continue
        client_name = client.full_name or client.username or f"Client {client_id}"

        # Expected training sessions from active plan
        plan = (
            db.query(NewWorkoutPlan)
            .filter(
                NewWorkoutPlan.client_id == client_id,
                NewWorkoutPlan.is_active == True,
            )
            .first()
        )
        expected_sessions = plan.days_per_week if plan and plan.days_per_week else 0
        completed_sessions = (
            db.query(NewWorkoutSession)
            .filter(
                NewWorkoutSession.client_id == client_id,
                NewWorkoutSession.started_at >= week_start_dt,
                NewWorkoutSession.started_at < week_end_dt,
                NewWorkoutSession.is_completed == True,
            )
            .count()
        )
        missed_sessions = max(0, expected_sessions - completed_sessions)

        # Days with at least one meal completion this week
        days_with_meals = (
            db.query(func.count(distinct(MealCompletionStatus.date)))
            .filter(
                MealCompletionStatus.client_id == client_id,
                MealCompletionStatus.date >= week_start_dt,
                MealCompletionStatus.date < week_end_dt,
                MealCompletionStatus.is_completed == True,
            )
            .scalar()
        ) or 0
        days_without_meals = max(0, 7 - days_with_meals)

        parts = []
        if missed_sessions > 0:
            parts.append(f"{client_name} missed {missed_sessions} training session(s) this week.")
        if days_without_meals > 0:
            parts.append(f"{client_name} didn't log meals on {days_without_meals} day(s) this week.")
        if not parts:
            continue
        message = " ".join(parts)
        notification_data = NotificationCreate(
            title="Weekly digest",
            message=message,
            type="info",
            recipient_id=trainer_id,
            client_id=client_id,
            event_type="weekly_digest",
        )
        notification_service.create_notification(
            db=db,
            notification_data=notification_data,
            sender_id=None,
        )


# Create a scheduler function that can be called periodically
def run_weekly_notification_checks(db: Session):
    """Run all weekly notification checks (legacy + new weekly digest)."""
    try:
        run_weekly_digest_for_trainers(db)
    except Exception as e:
        print(f"Error in weekly digest: {e}")

# Create a function to check goal achievements for a specific client
def check_client_goals(db: Session, client_id: int):
    """Check goals for a specific client"""
    try:
        NotificationTriggers.check_goal_achievements(db, client_id)
    except Exception as e:
        print(f"Error checking goals for client {client_id}: {e}") 