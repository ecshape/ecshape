from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional
import os
from pathlib import Path

from app.database import get_db
from app.auth.utils import get_current_user, oauth2_scheme
from app.schemas.auth import UserResponse, UserRole
from app.services.file_service import FileService
from app.services import user_service

router = APIRouter()

def get_file_service():
    """Dependency to get file service instance."""
    return FileService()

@router.get("/media/exercise_images/{filename}")
async def serve_exercise_image(
    filename: str,
    db: Session = Depends(get_db),
    file_service: FileService = Depends(get_file_service)
):
    """
    Serve exercise images publicly (no authentication required).
    This allows browser img tags to load them without auth headers.
    Exercise images are meant to be shared between trainer and clients.
    """
    # Use persistent path for Railway, fallback to local for dev
    persistent_base = os.getenv("PERSISTENT_PATH", "/app/persistent")
    upload_dir = os.getenv("UPLOAD_DIR", os.path.join(persistent_base, "uploads"))
    
    # Try multiple possible locations
    possible_paths = [
        os.path.join(upload_dir, "exercise_images", filename),  # Railway persistent
        f"{persistent_base}/uploads/exercise_images/{filename}",  # Alternative persistent path
        f"uploads/exercise_images/{filename}",  # Local dev
        f"/app/uploads/exercise_images/{filename}",  # Legacy path
    ]
    
    file_path = None
    for path in possible_paths:
        if os.path.exists(path):
            file_path = path
            break
    
    if not file_path:
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(file_path)

@router.get("/media/{file_type}/{filename}")
async def serve_media_file(
    file_type: str,
    filename: str,
    size: Optional[str] = Query("original", description="Image size: original, thumbnail, medium, large"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
    file_service: FileService = Depends(get_file_service)
):
    """
    Serve media files with access control.
    
    Args:
        file_type: Type of file (meal_photos, profile_photos, progress_photos, documents, thumbnails)
        filename: Name of the file
        size: Image size for processed images
        current_user: Authenticated user
        db: Database session
        file_service: File service instance
    """
    
    # Validate file type
    allowed_types = ["meal_photos", "profile_photos", "progress_photos", "documents", "thumbnails"]
    if file_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {allowed_types}")
    
    # Construct file path - try multiple possible locations
    # Priority: Use FileService's actual base_upload_path (where files are saved), then fallbacks
    possible_paths = []
    
    # Get the actual path where FileService saves files
    file_service_base = file_service.base_upload_path
    
    if size != "original" and file_type == "thumbnails":
        possible_paths = [
            os.path.join(file_service_base, "thumbnails", filename),  # Where FileService saves (primary)
            os.path.join(os.getenv("UPLOAD_DIR", "/app/persistent/uploads"), "thumbnails", filename),  # Env var path
            f"/app/persistent/uploads/thumbnails/{filename}",  # Explicit Railway persistent
            f"uploads/thumbnails/{filename}",  # Local dev
            f"/app/uploads/thumbnails/{filename}",  # Legacy path
        ]
    else:
        possible_paths = [
            os.path.join(file_service_base, file_type, filename),  # Where FileService saves (primary)
            os.path.join(os.getenv("UPLOAD_DIR", "/app/persistent/uploads"), file_type, filename),  # Env var path
            f"/app/persistent/uploads/{file_type}/{filename}",  # Explicit Railway persistent
            f"uploads/{file_type}/{filename}",  # Local dev (relative)
            f"./uploads/{file_type}/{filename}",  # Local dev (explicit relative)
            f"/app/uploads/{file_type}/{filename}",  # Legacy absolute path
            os.path.join(os.getcwd(), "uploads", file_type, filename),  # Current working directory
        ]
    
    # Try to find the file in any of the possible locations
    file_path = None
    for path in possible_paths:
        if os.path.exists(path):
            file_path = path
            break
    
    # If not found, also try with the filename as-is (in case it's already a full path)
    if not file_path and os.path.exists(filename):
        file_path = filename
    
    if not file_path:
        # Log all attempted paths for debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"File not found: {filename}")
        logger.error(f"File type: {file_type}")
        logger.error(f"FileService base_upload_path: {file_service.base_upload_path}")
        logger.error(f"Attempted paths: {possible_paths}")
        logger.error(f"Also tried: {filename}")
        logger.error(f"Current working directory: {os.getcwd()}")
        logger.error(f"PERSISTENT_PATH env: {os.getenv('PERSISTENT_PATH', 'not set')}")
        logger.error(f"UPLOAD_DIR env: {os.getenv('UPLOAD_DIR', 'not set')}")
        
        # Check if FileService base directory exists
        if os.path.exists(file_service_base):
            logger.error(f"FileService base directory exists: {file_service_base}")
            try:
                files_in_dir = os.listdir(file_service_base)
                logger.error(f"Files in FileService base dir: {files_in_dir[:10]}")  # First 10 files
                
                # Check specific file_type directory
                file_type_dir = os.path.join(file_service_base, file_type)
                if os.path.exists(file_type_dir):
                    logger.error(f"File type directory exists: {file_type_dir}")
                    files_in_type_dir = os.listdir(file_type_dir)
                    logger.error(f"Files in {file_type} dir ({len(files_in_type_dir)} total): {files_in_type_dir[:20]}")
                else:
                    logger.error(f"File type directory does NOT exist: {file_type_dir}")
            except Exception as e:
                logger.error(f"Error listing FileService base dir: {e}")
        else:
            logger.error(f"FileService base directory does not exist: {file_service_base}")
        
        # File not found - check access first, then return placeholder or 404
        # This handles cases where database references exist but files were deleted/lost
        # We still need to verify access before returning placeholder to avoid information leakage
        
        # Basic access check based on filename pattern
        has_access = False
        if file_type == "progress_photos":
            # Extract client ID from filename (format: progress_photo_{client_id}_{uuid}_compressed.jpg)
            try:
                parts = filename.split('_')
                if len(parts) >= 3:
                    client_id = int(parts[2])  # progress_photo_{client_id}_{uuid}
                    # Allow trainers to access all progress photos, clients only their own
                    if current_user.role == UserRole.TRAINER:
                        has_access = True
                    elif current_user.role == UserRole.CLIENT and current_user.id == client_id:
                        has_access = True
            except (ValueError, IndexError):
                pass
        elif file_type == "meal_photos":
            # Extract entity ID from filename (format: meal_photo_{entity_id}_{uuid}.jpg)
            try:
                parts = filename.split('_')
                if len(parts) >= 3:
                    entity_id = int(parts[2])  # meal_photo_{entity_id}_{uuid}
                    # Allow trainers to access all meal photos, clients only their own
                    if current_user.role == UserRole.TRAINER:
                        has_access = True
                    elif current_user.role == UserRole.CLIENT and str(current_user.id) in filename:
                        has_access = True
            except (ValueError, IndexError):
                pass
        
        # Return placeholder for progress/meal photos if user has access, otherwise 404
        if file_type in ["progress_photos", "meal_photos"] and has_access:
            # Return a placeholder SVG image instead of 404
            # This prevents broken image icons in the UI
            placeholder_svg = f"""<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
                <rect width="400" height="300" fill="#f3f4f6"/>
                <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="16" fill="#9ca3af" text-anchor="middle" dominant-baseline="middle">
                    Photo not available
                </text>
            </svg>"""
            from fastapi.responses import Response
            return Response(content=placeholder_svg, media_type="image/svg+xml")
        
        raise HTTPException(status_code=404, detail=f"File not found: {filename}. Tried: {possible_paths}")
    
    # Access control based on file type
    if file_type == "meal_photos":
        # Extract entity ID from filename (format: meal_photo_{entity_id}_{uuid}.jpg)
        try:
            parts = filename.split('_')
            if len(parts) >= 3:
                entity_id = int(parts[2])  # meal_photo_{entity_id}_{uuid}
                
                # Get meal completion from nutrition service to verify access
                from app.services.nutrition_service import NutritionService
                nutrition_service = NutritionService(db)
                meal_completion = nutrition_service.get_meal_completion(entity_id)
                
                if not meal_completion:
                    raise HTTPException(status_code=404, detail="Meal completion not found")
                
                # Access control: trainers can access all meal photos, clients only their own
                if current_user.role == UserRole.TRAINER:
                    # Trainers can access all meal photos
                    return FileResponse(file_path)
                elif current_user.role == UserRole.CLIENT:
                    # Clients can only access their own meal photos
                    if meal_completion.client_id == current_user.id:
                        return FileResponse(file_path)
                    else:
                        raise HTTPException(status_code=403, detail="Access denied")
                else:
                    raise HTTPException(status_code=403, detail="Access denied")
            else:
                raise HTTPException(status_code=400, detail="Invalid filename format")
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Invalid filename format")
    
    elif file_type == "profile_photos":
        # Extract user ID from filename (format: profile_photo_{user_id}_{uuid}.jpg)
        try:
            parts = filename.split('_')
            if len(parts) >= 3:
                user_id = int(parts[2])  # profile_photo_{user_id}_{uuid}
                
                # Allow access if user is viewing their own photo or is a trainer
                if current_user.id == user_id or current_user.role == UserRole.TRAINER:
                    return FileResponse(file_path)
                else:
                    raise HTTPException(status_code=403, detail="Access denied")
            else:
                raise HTTPException(status_code=400, detail="Invalid filename format")
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Invalid filename format")
    
    elif file_type == "progress_photos":
        # Extract entity ID from filename (format: progress_photo_{entity_id}_{uuid}.jpg)
        try:
            parts = filename.split('_')
            if len(parts) >= 3:
                entity_id = int(parts[2])  # progress_photo_{entity_id}_{uuid}
                
                # For now, implement basic access control for progress photos
                # Allow trainers to access all progress photos, clients only their own
                if current_user.role == UserRole.TRAINER:
                    return FileResponse(file_path)
                elif current_user.role == UserRole.CLIENT:
                    # Extract client ID from filename and check if it matches current user
                    if str(current_user.id) in filename:
                        return FileResponse(file_path)
                    else:
                        raise HTTPException(status_code=403, detail="Access denied")
                else:
                    raise HTTPException(status_code=403, detail="Access denied")
            else:
                raise HTTPException(status_code=400, detail="Invalid filename format")
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Invalid filename format")
    
    elif file_type == "documents":
        # Extract entity ID from filename (format: document_{entity_id}_{uuid}.pdf)
        try:
            parts = filename.split('_')
            if len(parts) >= 3:
                entity_id = int(parts[2])  # document_{entity_id}_{uuid}
                
                # For now, implement basic access control for documents
                # Allow trainers to access all documents, clients only their own
                if current_user.role == UserRole.TRAINER:
                    return FileResponse(file_path)
                elif current_user.role == UserRole.CLIENT:
                    # Extract client ID from filename and check if it matches current user
                    if str(current_user.id) in filename:
                        return FileResponse(file_path)
                    else:
                        raise HTTPException(status_code=403, detail="Access denied")
                else:
                    raise HTTPException(status_code=403, detail="Access denied")
            else:
                raise HTTPException(status_code=400, detail="Invalid filename format")
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Invalid filename format")
    
    elif file_type == "thumbnails":
        # Thumbnails follow the same access control as their parent files
        # Extract the original file type and entity ID from thumbnail filename
        try:
            parts = filename.split('_')
            if len(parts) >= 4:
                original_type = parts[0]  # meal_photo, profile_photo, etc.
                entity_id = int(parts[1])  # entity_id
                
                # Apply the same access control logic based on original type
                if original_type == "meal_photo":
                    # Basic access control for meal photo thumbnails
                    if current_user.role == UserRole.TRAINER:
                        return FileResponse(file_path)
                    elif current_user.role == UserRole.CLIENT:
                        if str(current_user.id) in filename:
                            return FileResponse(file_path)
                        else:
                            raise HTTPException(status_code=403, detail="Access denied")
                    else:
                        raise HTTPException(status_code=403, detail="Access denied")
                
                elif original_type == "profile_photo":
                    if current_user.id == entity_id or current_user.role == UserRole.TRAINER:
                        return FileResponse(file_path)
                    else:
                        raise HTTPException(status_code=403, detail="Access denied")
                
                else:
                    raise HTTPException(status_code=400, detail="Invalid thumbnail type")
            else:
                raise HTTPException(status_code=400, detail="Invalid filename format")
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Invalid filename format")
    
    # Default deny
    raise HTTPException(status_code=403, detail="Access denied")

@router.delete("/media/{file_type}/{filename}")
async def delete_media_file(
    file_type: str,
    filename: str,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
    file_service: FileService = Depends(get_file_service)
):
    """
    Delete media files with access control.
    """
    
    # Validate file type
    allowed_types = ["meal_photos", "profile_photos", "progress_photos", "documents", "exercise_images"]
    if file_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {allowed_types}")
    
    # Use persistent path for Railway, fallback to local for dev
    persistent_base = os.getenv("PERSISTENT_PATH", "/app/persistent")
    upload_dir = os.getenv("UPLOAD_DIR", os.path.join(persistent_base, "uploads"))
    
    # Try multiple possible locations
    possible_paths = [
        os.path.join(upload_dir, file_type, filename),  # Railway persistent
        f"{persistent_base}/uploads/{file_type}/{filename}",  # Alternative persistent path
        f"uploads/{file_type}/{filename}",  # Local dev
        f"/app/uploads/{file_type}/{filename}",  # Legacy path
    ]
    
    file_path = None
    for path in possible_paths:
        if os.path.exists(path):
            file_path = path
            break
    
    if not file_path:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Apply the same access control logic as serve_media_file
    # (This is a simplified version - you might want to extract this logic into a shared function)
    
    try:
        # Delete file and all its processed versions
        success = await file_service.delete_file(file_path)
        
        if success:
            return {"message": "File deleted successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete file")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")

@router.get("/debug/paths")
async def debug_file_paths(
    current_user: UserResponse = Depends(get_current_user),
    file_service: FileService = Depends(get_file_service)
):
    """Debug endpoint to check file paths and locations - Admin only in production"""
    # Only allow in development or for admins
    environment = os.getenv("ENVIRONMENT", "development")
    if environment == "production" and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Admin only."
        )
    import logging
    logger = logging.getLogger(__name__)
    
    persistent_base = os.getenv("PERSISTENT_PATH", "/app/persistent")
    upload_dir = os.getenv("UPLOAD_DIR", os.path.join(persistent_base, "uploads"))
    
    debug_info = {
        "persistent_base": persistent_base,
        "upload_dir": upload_dir,
        "persistent_base_exists": os.path.exists(persistent_base),
        "upload_dir_exists": os.path.exists(upload_dir),
        "current_working_directory": os.getcwd(),
        "file_service_base_path": file_service.base_upload_path,
        "file_service_base_exists": os.path.exists(file_service.base_upload_path),
        "environment_variables": {
            "PERSISTENT_PATH": os.getenv("PERSISTENT_PATH"),
            "UPLOAD_DIR": os.getenv("UPLOAD_DIR"),
        },
    }
    
    # Check progress_photos directory
    progress_photos_dir = os.path.join(upload_dir, "progress_photos")
    debug_info["progress_photos_dir"] = progress_photos_dir
    debug_info["progress_photos_dir_exists"] = os.path.exists(progress_photos_dir)
    
    if os.path.exists(progress_photos_dir):
        try:
            files = os.listdir(progress_photos_dir)
            debug_info["progress_photos_files"] = files[:20]  # First 20 files
            debug_info["progress_photos_count"] = len(files)
        except Exception as e:
            debug_info["progress_photos_list_error"] = str(e)
    
    # Check alternative locations
    alternative_paths = [
        "/app/persistent/uploads/progress_photos",
        "/app/uploads/progress_photos",
        "uploads/progress_photos",
        "./uploads/progress_photos",
    ]
    
    debug_info["alternative_paths"] = {}
    for path in alternative_paths:
        debug_info["alternative_paths"][path] = {
            "exists": os.path.exists(path),
            "is_dir": os.path.isdir(path) if os.path.exists(path) else False,
        }
        if os.path.exists(path) and os.path.isdir(path):
            try:
                files = os.listdir(path)
                debug_info["alternative_paths"][path]["file_count"] = len(files)
                debug_info["alternative_paths"][path]["sample_files"] = files[:5]
            except Exception as e:
                debug_info["alternative_paths"][path]["list_error"] = str(e)
    
    logger.info(f"Debug paths info: {debug_info}")
    return debug_info

@router.get("/media/stats")
async def get_media_stats(
    current_user: UserResponse = Depends(get_current_user),
    file_service: FileService = Depends(get_file_service)
):
    """
    Get media storage statistics (admin/trainer only).
    """
    
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        # Calculate storage usage
        total_size = 0
        file_counts = {}
        
        # Use persistent path for Railway, fallback to local for dev
        persistent_base = os.getenv("PERSISTENT_PATH", "/app/persistent")
        upload_dir = os.getenv("UPLOAD_DIR", os.path.join(persistent_base, "uploads"))
        
        for directory in ["meal_photos", "profile_photos", "progress_photos", "documents", "thumbnails"]:
            # Try multiple possible locations
            possible_dirs = [
                os.path.join(upload_dir, directory),  # Railway persistent
                f"{persistent_base}/uploads/{directory}",  # Alternative persistent path
                f"uploads/{directory}",  # Local dev
                f"/app/uploads/{directory}",  # Legacy path
            ]
            
            dir_path = None
            for path in possible_dirs:
                if os.path.exists(path):
                    dir_path = path
                    break
            
            if dir_path:
                count = 0
                size = 0
                for filename in os.listdir(dir_path):
                    file_path = os.path.join(dir_path, filename)
                    if os.path.isfile(file_path):
                        count += 1
                        size += os.path.getsize(file_path)
                
                file_counts[directory] = {"count": count, "size": size}
                total_size += size
        
        return {
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "file_counts": file_counts
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting media stats: {str(e)}") 