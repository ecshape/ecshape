import os
import uuid
import hashlib
from typing import Optional, List, Tuple
from datetime import datetime
from fastapi import UploadFile, HTTPException
# Lazy load heavy libraries to reduce startup memory
# from PIL import Image  # Lazy loaded when needed
import magic
import aiofiles
from pathlib import Path

class FileService:
    """Comprehensive file management service for Sprint 5."""
    
    # File type configurations
    ALLOWED_IMAGE_TYPES = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif'
    }
    
    ALLOWED_DOCUMENT_TYPES = {
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
    }
    
    # File size limits (in bytes)
    MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
    MAX_DOCUMENT_SIZE = 25 * 1024 * 1024  # 25MB
    MAX_PROFILE_PHOTO_SIZE = 5 * 1024 * 1024  # 5MB
    
    # Image processing configurations
    THUMBNAIL_SIZE = (150, 150)
    MEDIUM_SIZE = (800, 800)
    LARGE_SIZE = (1920, 1920)
    
    # Aggressive compression for progress photos (space-saving)
    PROGRESS_PHOTO_MAX_SIZE = (1200, 1200)  # Max dimensions
    PROGRESS_PHOTO_QUALITY = 65  # JPEG quality (60-75 range for good compression/quality balance)
    PROGRESS_PHOTO_WEBP_QUALITY = 70  # WebP quality
    
    def __init__(self, base_upload_path: str = None):
        # Use environment variable or default to uploads in persistent path
        # For Railway: use /app/persistent/uploads to save files in persistent volume
        # For local dev: use /app/uploads (or current directory/uploads)
        if base_upload_path is None:
            persistent_base = os.getenv("PERSISTENT_PATH", "/app/persistent")
            base_upload_path = os.getenv("UPLOAD_DIR", os.path.join(persistent_base, "uploads"))
        self.base_upload_path = base_upload_path
        self._ensure_directories()
    
    def _ensure_directories(self):
        """Ensure all required directories exist."""
        directories = [
            self.base_upload_path,
            f"{self.base_upload_path}/meal_photos",
            f"{self.base_upload_path}/profile_photos",
            f"{self.base_upload_path}/progress_photos",
            f"{self.base_upload_path}/documents",
            f"{self.base_upload_path}/exercise_images",
            f"{self.base_upload_path}/temp",
            f"{self.base_upload_path}/thumbnails"
        ]
        
        for directory in directories:
            Path(directory).mkdir(parents=True, exist_ok=True)
    
    async def validate_file(self, file: UploadFile, file_type: str = "image", max_size: Optional[int] = None) -> Tuple[bool, str]:
        """
        Validate file type, size, and content.
        
        Args:
            file: UploadFile object
            file_type: "image", "document", or "profile_photo"
            max_size: Custom max size in bytes
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            # Read file content for validation
            content = await file.read()
            file.file.seek(0)  # Reset file pointer
            
            # Check file size
            file_size = len(content)
            if max_size is None:
                if file_type == "image":
                    max_size = self.MAX_IMAGE_SIZE
                elif file_type == "document":
                    max_size = self.MAX_DOCUMENT_SIZE
                elif file_type == "profile_photo":
                    max_size = self.MAX_PROFILE_PHOTO_SIZE
                else:
                    max_size = self.MAX_IMAGE_SIZE
            
            if file_size > max_size:
                return False, f"File size ({file_size} bytes) exceeds maximum allowed size ({max_size} bytes)"
            
            # Check MIME type using python-magic
            mime_type = magic.from_buffer(content, mime=True)
            
            # Validate based on file type
            if file_type == "image":
                if mime_type not in self.ALLOWED_IMAGE_TYPES:
                    return False, f"Invalid image type: {mime_type}. Allowed: {list(self.ALLOWED_IMAGE_TYPES.keys())}"
                
                # Additional image validation using PIL (lazy loaded)
                try:
                    from io import BytesIO
                    from PIL import Image
                    image = Image.open(BytesIO(content))
                    image.verify()
                    file.file.seek(0)  # Reset after PIL check
                    del image  # Free memory
                except Exception as e:
                    return False, f"Invalid image file: {str(e)}"
                    
            elif file_type == "document":
                if mime_type not in self.ALLOWED_DOCUMENT_TYPES:
                    return False, f"Invalid document type: {mime_type}. Allowed: {list(self.ALLOWED_DOCUMENT_TYPES.keys())}"
            
            return True, "File validation successful"
            
        except Exception as e:
            return False, f"File validation error: {str(e)}"
    
    async def save_file(self, file: UploadFile, category: str, entity_id: int, 
                       process_image: bool = True) -> dict:
        """
        Save file with proper organization and optional image processing.
        
        Args:
            file: UploadFile object
            category: "meal_photo", "profile_photo", "progress_photo", "document"
            entity_id: ID of the related entity
            process_image: Whether to process images (resize, create thumbnails)
        
        Returns:
            Dictionary with file paths and metadata
        """
        # Validate file
        file_type = "image" if category in ["meal_photo", "profile_photo", "progress_photo", "exercise_image"] else "document"
        is_valid, error_message = await self.validate_file(file, file_type)
        
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_message)
        
        # Generate unique filename
        original_extension = Path(file.filename).suffix if file.filename else ".jpg"
        unique_id = str(uuid.uuid4())
        filename = f"{category}_{entity_id}_{unique_id}{original_extension}"
        
        # Determine directory
        if category == "meal_photo":
            directory = f"{self.base_upload_path}/meal_photos"
        elif category == "profile_photo":
            directory = f"{self.base_upload_path}/profile_photos"
        elif category == "progress_photo":
            directory = f"{self.base_upload_path}/progress_photos"
        elif category == "exercise_image":
            directory = f"{self.base_upload_path}/exercise_images"
        elif category == "document":
            directory = f"{self.base_upload_path}/documents"
        else:
            directory = f"{self.base_upload_path}/temp"
        
        # For progress photos, use aggressive compression
        if category == "progress_photo" and file_type == "image":
            # Read content and compress immediately
            content = await file.read()
            compressed_path, compressed_size = await self._compress_progress_photo(
                content, directory, filename, entity_id, unique_id
            )
            result = {
                "original_path": compressed_path,  # Store compressed as "original"
                "filename": os.path.basename(compressed_path),
                "file_size": compressed_size,
                "mime_type": "image/jpeg",  # Always JPEG for compressed
                "uploaded_at": datetime.utcnow().isoformat(),
                "compressed": True
            }
        else:
            # Save original file for other categories
            original_path = os.path.join(directory, filename)
            async with aiofiles.open(original_path, 'wb') as f:
                content = await file.read()
                await f.write(content)
            
            result = {
                "original_path": original_path,
                "filename": filename,
                "file_size": len(content),
                "mime_type": magic.from_buffer(content, mime=True),
                "uploaded_at": datetime.utcnow().isoformat()
            }
            
            # Process image if needed (thumbnails, etc.)
            if process_image and file_type == "image":
                processed_paths = await self._process_image(original_path, category, entity_id, unique_id)
                result.update(processed_paths)
        
        return result
    
    async def _compress_progress_photo(self, content: bytes, directory: str, filename: str, entity_id: int, unique_id: str) -> tuple:
        """
        Aggressively compress progress photos to save space while maintaining visibility.
        Uses JPEG with optimized quality settings and resizes if needed.
        """
        from io import BytesIO
        from PIL import Image, ImageOps  # Add ImageOps for EXIF orientation
        
        try:
            # Open image from bytes
            img = Image.open(BytesIO(content))
            
            # Fix EXIF orientation - this rotates the image based on EXIF data
            img = ImageOps.exif_transpose(img)
            
            # Convert to RGB if necessary (removes alpha channel)
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Resize if image is larger than max size (maintain aspect ratio)
            if img.size[0] > self.PROGRESS_PHOTO_MAX_SIZE[0] or img.size[1] > self.PROGRESS_PHOTO_MAX_SIZE[1]:
                img.thumbnail(self.PROGRESS_PHOTO_MAX_SIZE, Image.Resampling.LANCZOS)
            
            # Save as optimized JPEG with aggressive compression
            compressed_filename = f"progress_photo_{entity_id}_{unique_id}_compressed.jpg"
            compressed_path = os.path.join(directory, compressed_filename)
            
            # Save with optimization flags - memory efficient
            img.save(
                compressed_path,
                'JPEG',
                quality=self.PROGRESS_PHOTO_QUALITY,
                optimize=True,  # Enable Huffman table optimization
                progressive=True,  # Progressive JPEG for better compression
                subsampling='4:2:0'  # Chroma subsampling for smaller file size
            )
            
            # Free memory immediately
            del img
            
            # Get compressed file size
            compressed_size = os.path.getsize(compressed_path)
            
            return compressed_path, compressed_size
            
        except Exception as e:
            # If compression fails, save original but log error
            print(f"Error compressing progress photo: {e}")
            # Fallback: save original file
            original_path = os.path.join(directory, filename)
            with open(original_path, 'wb') as f:
                f.write(content)
            return original_path, len(content)
    
    async def _process_image(self, original_path: str, category: str, entity_id: int, unique_id: str) -> dict:
        """Process image to create thumbnails and resized versions - OPTIMIZED for minimal memory."""
        from PIL import Image, ImageOps  # Add ImageOps for EXIF orientation
        
        try:
            # Process images one at a time to minimize memory usage
            thumbnail_path = f"{self.base_upload_path}/thumbnails/{category}_{entity_id}_{unique_id}_thumb.jpg"
            medium_path = f"{self.base_upload_path}/thumbnails/{category}_{entity_id}_{unique_id}_medium.jpg"
            large_path = None
            original_dimensions = None
            
            # Open and process thumbnail (smallest first, then close)
            with Image.open(original_path) as img:
                # Fix EXIF orientation first
                img = ImageOps.exif_transpose(img)
                
                if img.mode in ('RGBA', 'LA', 'P'):
                    img = img.convert('RGB')
                elif img.mode != 'RGB':
                    img = img.convert('RGB')
                original_dimensions = img.size
                
                # Create thumbnail with lower quality for memory savings
                thumbnail = img.copy()
                thumbnail.thumbnail(self.THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
                thumbnail.save(thumbnail_path, 'JPEG', quality=75, optimize=True)  # Reduced from 85 to 75
                del thumbnail  # Free memory immediately
            
            # Process medium size (reopen to avoid keeping multiple images in memory)
            with Image.open(original_path) as img:
                # Fix EXIF orientation first
                img = ImageOps.exif_transpose(img)
                
                if img.mode in ('RGBA', 'LA', 'P'):
                    img = img.convert('RGB')
                elif img.mode != 'RGB':
                    img = img.convert('RGB')
                
                medium = img.copy()
                medium.thumbnail(self.MEDIUM_SIZE, Image.Resampling.LANCZOS)
                medium.save(medium_path, 'JPEG', quality=75, optimize=True)  # Reduced from 90 to 75
                del medium  # Free memory immediately
                
                # Create large size if original is larger (only if needed)
                if img.size[0] > self.LARGE_SIZE[0] or img.size[1] > self.LARGE_SIZE[1]:
                    large_path = f"{self.base_upload_path}/thumbnails/{category}_{entity_id}_{unique_id}_large.jpg"
                    large = img.copy()
                    large.thumbnail(self.LARGE_SIZE, Image.Resampling.LANCZOS)
                    large.save(large_path, 'JPEG', quality=80, optimize=True)  # Reduced from 95 to 80
                    del large  # Free memory immediately
            
            return {
                "thumbnail_path": thumbnail_path,
                "medium_path": medium_path,
                "large_path": large_path,
                "original_dimensions": original_dimensions
            }
                
        except Exception as e:
            # If image processing fails, return original only
            return {
                "thumbnail_path": None,
                "medium_path": None,
                "large_path": None,
                "processing_error": str(e)
            }
    
    async def delete_file(self, file_path: str) -> bool:
        """Delete file and all its processed versions."""
        try:
            # Delete original file
            if os.path.exists(file_path):
                os.remove(file_path)
            
            # Try to delete processed versions
            base_name = Path(file_path).stem
            thumbnail_patterns = [
                f"{self.base_upload_path}/thumbnails/{base_name}_thumb.jpg",
                f"{self.base_upload_path}/thumbnails/{base_name}_medium.jpg",
                f"{self.base_upload_path}/thumbnails/{base_name}_large.jpg"
            ]
            
            for pattern in thumbnail_patterns:
                if os.path.exists(pattern):
                    os.remove(pattern)
            
            return True
            
        except Exception as e:
            print(f"Error deleting file {file_path}: {e}")
            return False
    
    async def cleanup_orphaned_files(self, max_age_hours: int = 24) -> int:
        """Clean up orphaned files in temp directory."""
        temp_dir = f"{self.base_upload_path}/temp"
        if not os.path.exists(temp_dir):
            return 0
        
        deleted_count = 0
        current_time = datetime.utcnow()
        
        for filename in os.listdir(temp_dir):
            file_path = os.path.join(temp_dir, filename)
            if os.path.isfile(file_path):
                file_time = datetime.fromtimestamp(os.path.getctime(file_path))
                age_hours = (current_time - file_time).total_seconds() / 3600
                
                if age_hours > max_age_hours:
                    try:
                        os.remove(file_path)
                        deleted_count += 1
                    except Exception as e:
                        print(f"Error deleting orphaned file {file_path}: {e}")
        
        return deleted_count
    
    def get_file_url(self, file_path: str, size: str = "original") -> str:
        """Generate URL for file access."""
        if not file_path:
            return None
        
        # Map size to path
        if size == "thumbnail" and "_thumb.jpg" in file_path:
            return f"/uploads/thumbnails/{Path(file_path).name}"
        elif size == "medium" and "_medium.jpg" in file_path:
            return f"/uploads/thumbnails/{Path(file_path).name}"
        elif size == "large" and "_large.jpg" in file_path:
            return f"/uploads/thumbnails/{Path(file_path).name}"
        else:
            return f"/uploads/{Path(file_path).name}" 