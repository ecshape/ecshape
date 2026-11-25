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

_PUBLIC_IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".gif")


def _public_image_path(file_service, folder: str, filename: str):
    """Public images are served only from their folder and only with an image extension, so an uploaded
    polyglot named x.html can never come back as text/html (audit 2026-11, F-09)."""
    if os.path.basename(filename) != filename or not filename.lower().endswith(_PUBLIC_IMAGE_EXT):
        return None
    base = os.path.abspath(os.path.join(file_service.base_upload_path, folder))
    path = os.path.abspath(os.path.join(base, filename))
    return path if os.path.dirname(path) == base and os.path.isfile(path) else None


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
    path = _public_image_path(file_service, "exercise_images", filename)
    if not path:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)

FOOD_PHOTO_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}


def _food_photo_dir(file_service: FileService) -> str:
    return os.path.join(file_service.base_upload_path, "food_photos")


@router.post("/food-photo", status_code=status.HTTP_201_CREATED)
async def upload_food_photo(
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user),
    file_service: FileService = Depends(get_file_service),
):
    """Upload a photo for a food-bank item (trainers and admins). Returns a public URL path to store in image_url."""
    if current_user.role not in (UserRole.TRAINER, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only trainers can upload food photos")
    is_valid, error_message = await file_service.validate_file(file, "image")
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_message)
    content = await file.read()
    import magic  # same detector FileService uses
    import uuid
    ext = FOOD_PHOTO_EXT.get(magic.from_buffer(content, mime=True))
    if not ext:
        raise HTTPException(status_code=400, detail="Unsupported image type")
    directory = _food_photo_dir(file_service)
    os.makedirs(directory, exist_ok=True)
    filename = f"food_{current_user.id}_{uuid.uuid4().hex}{ext}"
    with open(os.path.join(directory, filename), "wb") as fh:
        fh.write(content)
    return {"filename": filename, "url": f"/files/media/food_photos/{filename}"}


@router.get("/media/food_photos/{filename}")
async def serve_food_photo(filename: str, file_service: FileService = Depends(get_file_service)):
    """Serve food-bank photos publicly (like exercise images) so <img> tags work without auth headers."""
    safe = os.path.basename(filename)
    path = os.path.join(_food_photo_dir(file_service), safe)
    if safe != filename or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


# ---- private media (audit 2026-11, F-08): owner parsed exactly from the file name, then checked against the tenant.
# Was: every trainer could read every tenant's progress / meal / profile photos, the client check was a substring
# test (client 3 could open any name containing a "3"), DELETE had no check at all, and 404s leaked server paths.
import re as _re
from app.auth.access import can_access_client, is_admin, is_client

_MEDIA_TYPES = ("meal_photos", "profile_photos", "progress_photos", "documents", "thumbnails")
_MEDIA_NAME_RE = _re.compile(r"^(meal_photo|profile_photo|progress_photo|document|exercise_image)_(\d+)_[0-9a-fA-F-]{32,36}(?:_(?:compressed|thumb|medium|large))?\.(?:jpe?g|png|webp|gif|pdf|docx?)$")


def _media_path(file_service: FileService, file_type: str, filename: str) -> Optional[str]:
    if os.path.basename(filename) != filename or filename.startswith("."):
        return None
    base = os.path.abspath(os.path.join(file_service.base_upload_path, file_type))
    path = os.path.abspath(os.path.join(base, filename))
    if os.path.dirname(path) != base or not os.path.isfile(path):
        return None
    return path


def _media_owner_user_id(db: Session, category: str, entity_id: int) -> Optional[int]:
    """The client (or user, for profile photos) a media file belongs to."""
    if category == "meal_photo":  # legacy: entity = nutrition meal completion
        from app.models.nutrition import MealCompletion
        mc = db.query(MealCompletion).filter(MealCompletion.id == entity_id).first()
        return mc.client_id if mc else None
    return entity_id


def _can_use_media(db: Session, user: UserResponse, file_type: str, filename: str, write: bool = False) -> bool:
    m = _MEDIA_NAME_RE.match(filename)
    if not m:
        return False
    category, entity_id = m.group(1), int(m.group(2))
    expected_dir = {"meal_photo": "meal_photos", "profile_photo": "profile_photos", "progress_photo": "progress_photos",
                    "document": "documents"}.get(category)
    if file_type != "thumbnails" and expected_dir != file_type:
        return False
    if is_admin(user):
        return True
    owner = _media_owner_user_id(db, category, entity_id)
    if owner is None:
        return False
    if category == "profile_photo":
        if owner == user.id:
            return True
        if write:
            return False
        from app.models.user import User as _U
        target = db.query(_U).filter(_U.id == owner).first()
        # own trainer's photo, or a trainer looking at their client
        return bool(target and (target.id == getattr(user, "trainer_id", None) or target.trainer_id == user.id))
    return can_access_client(db, user, owner)


@router.get("/media/{file_type}/{filename}")
async def serve_media_file(
    file_type: str,
    filename: str,
    size: Optional[str] = Query("original", description="Image size: original, thumbnail, medium, large"),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
    file_service: FileService = Depends(get_file_service)
):
    """Serve a private media file to its owner, the owner's trainer, or an admin."""
    if file_type not in _MEDIA_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type")
    if not _can_use_media(db, current_user, file_type, filename):
        raise HTTPException(status_code=404, detail="File not found")
    path = _media_path(file_service, file_type, filename)
    if not path:
        if file_type in ("progress_photos", "meal_photos"):
            # the database still references a lost file: a neutral placeholder instead of a broken image
            from fastapi.responses import Response
            placeholder_svg = (
                '<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="300" fill="#f3f4f6"/>'
                '<text x="50%" y="50%" font-family="Arial, sans-serif" font-size="16" fill="#9ca3af" text-anchor="middle" '
                'dominant-baseline="middle">Photo not available</text></svg>'
            )
            return Response(content=placeholder_svg, media_type="image/svg+xml")
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=3600"})


@router.delete("/media/{file_type}/{filename}")
async def delete_media_file(
    file_type: str,
    filename: str,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
    file_service: FileService = Depends(get_file_service)
):
    """Delete a media file: its owner, the owner's trainer, or an admin. Exercise images: their creator or an admin."""
    allowed_types = ["meal_photos", "profile_photos", "progress_photos", "documents", "exercise_images"]
    if file_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type")
    if file_type == "exercise_images":
        from app.models.workout import Exercise
        ex = db.query(Exercise).filter(Exercise.image_path.like(f"%{filename}")).first() if _re.match(r"^[\w.-]+$", filename) else None
        ok = is_admin(current_user) or (ex is not None and ex.created_by == current_user.id)
    else:
        ok = _can_use_media(db, current_user, file_type, filename, write=True)
    if not ok:
        raise HTTPException(status_code=404, detail="File not found")
    path = _media_path(file_service, file_type, filename)
    if not path:
        raise HTTPException(status_code=404, detail="File not found")
    if not await file_service.delete_file(path):
        raise HTTPException(status_code=500, detail="Failed to delete file")
    return {"message": "File deleted successfully"}

@router.get("/debug/paths")
async def debug_file_paths(
    current_user: UserResponse = Depends(get_current_user),
    file_service: FileService = Depends(get_file_service)
):
    """Debug endpoint to check file paths and locations - Admin only in production"""
    # Only allow in development or for admins
    if current_user.role != UserRole.ADMIN:  # audit 2026-11 (L-01): server paths and file names are admin-only
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
    
    if current_user.role != UserRole.ADMIN:  # storage of every tenant (audit 2026-11, L-01)
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


# ---------------------------------------------------------------- profile photos (avatars)
# Every user can set their own photo. Files get an unguessable name and are served without auth so that
# <img> tags (portal, chat, public-site bubble) can show them; nothing else about the user is exposed.
AVATAR_MAX_BYTES = 8 * 1024 * 1024
AVATAR_SIZE = 512
AVATAR_NAME_RE = r"^[0-9]+_[0-9a-f]{32}\.webp$"


def _avatar_dir() -> str:
    path = os.path.join(FileService().base_upload_path, "avatars")
    os.makedirs(path, exist_ok=True)
    return path


def _remove_avatar_file(path: Optional[str]) -> None:
    """Delete a previous avatar file, only if it really lives in the avatars folder."""
    if not path:
        return
    folder = os.path.abspath(_avatar_dir())
    target = os.path.abspath(path)
    if os.path.dirname(target) == folder and os.path.exists(target):
        try:
            os.remove(target)
        except OSError:
            pass


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set the signed-in user's profile photo. The image is squared, resized to 512 px and stored as WebP."""
    import io
    import uuid
    from PIL import Image, ImageOps
    from app.models.user import User

    raw = await file.read(AVATAR_MAX_BYTES + 1)
    if len(raw) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (8 MB max)")
    try:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Not a valid image")
    img = ImageOps.fit(img, (AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS)

    name = f"{current_user.id}_{uuid.uuid4().hex}.webp"
    path = os.path.join(_avatar_dir(), name)
    img.save(path, "WEBP", quality=82, method=4)

    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    old = user.avatar_path
    user.avatar_path = path
    user.avatar_url = f"/api/files/avatars/{name}"
    db.commit()
    _remove_avatar_file(old)
    return {"avatar_url": user.avatar_url}


@router.delete("/avatar")
async def delete_avatar(current_user: UserResponse = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models.user import User
    user = db.query(User).filter(User.id == current_user.id).first()
    if user:
        _remove_avatar_file(user.avatar_path)
        user.avatar_path = None
        user.avatar_url = None
        db.commit()
    return {"avatar_url": None}


@router.get("/avatars/{filename}")
async def serve_avatar(filename: str):
    import re
    if not re.match(AVATAR_NAME_RE, filename):
        raise HTTPException(status_code=404, detail="Not found")
    path = os.path.join(_avatar_dir(), filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Not found")
    # The name changes on every upload, so a given file never changes
    return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "public, max-age=31536000, immutable"}) 