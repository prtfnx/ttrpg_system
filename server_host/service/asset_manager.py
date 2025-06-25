"""
Server-side R2 Asset Management Service for TTRPG System
Handles presigned URLs, asset validation, and client permissions
"""
import hashlib
import time
import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
import mimetypes
import os
import xxhash

from storage.r2_manager import R2AssetManager
from ..database.database import SessionLocal
from ..database.models import Asset, GameSession
import settings

logger = logging.getLogger(__name__)

@dataclass
class AssetPermission:
    """Permission levels for asset operations"""
    can_upload: bool = False
    can_download: bool = True
    can_share: bool = False
    can_moderate: bool = False

@dataclass
class AssetRequest:
    """Asset operation request"""
    user_id: int
    username: str
    session_code: str
    asset_id: Optional[str] = None
    filename: Optional[str] = None
    file_size: Optional[int] = None
    content_type: Optional[str] = None

@dataclass
class PresignedUrlResponse:
    """Response containing presigned URL and metadata"""
    success: bool
    url: Optional[str] = None
    asset_id: Optional[str] = None
    expires_in: int = 0
    error: Optional[str] = None
    instructions: Optional[str] = None
    required_xxhash: Optional[str] = None  # xxHash that client must provide

class ServerAssetManager:
    """Server-side asset management with R2 integration"""
    
    def __init__(self):
        self.r2_manager = R2AssetManager()
        self.asset_registry: Dict[str, dict] = {}  # asset_id -> metadata
        self.session_permissions: Dict[str, Dict[int, AssetPermission]] = {}  # session_code -> user_id -> permissions
        
        # Rate limiting
        self.upload_limits: Dict[int, List[float]] = {}  # user_id -> [timestamp, ...]
        self.download_limits: Dict[int, List[float]] = {}  # user_id -> [timestamp, ...]
        
        # Asset validation settings
        self.max_file_size = 50 * 1024 * 1024  # 50MB default
        self.allowed_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'}
        self.allowed_mime_types = {'image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml'}
        
        logger.info("ServerAssetManager initialized")
    
    def setup_session_permissions(self, session_code: str, user_id: int, username: str, role: str = "player"):
        """Setup permissions for a user in a session"""
        if session_code not in self.session_permissions:
            self.session_permissions[session_code] = {}
        
        # Define role-based permissions
        if role.lower() == "dm" or role.lower() == "dungeon_master":
            permissions = AssetPermission(
                can_upload=True,
                can_download=True,
                can_share=True,
                can_moderate=True
            )
        elif role.lower() == "player":
            permissions = AssetPermission(
                can_upload=True,  # Limited upload for character portraits
                can_download=True,
                can_share=False,
                can_moderate=False
            )
        else:  # observer
            permissions = AssetPermission(
                can_upload=False,
                can_download=True,
                can_share=False,
                can_moderate=False
            )
        
        self.session_permissions[session_code][user_id] = permissions
        logger.info(f"Set {role} permissions for user {username} ({user_id}) in session {session_code}")
    
    def _get_permissions(self, session_code: str, user_id: int) -> AssetPermission:
        """Get user permissions for a session"""
        return self.session_permissions.get(session_code, {}).get(
            user_id, 
            AssetPermission()  # Default read-only
        )
    
    def _check_rate_limit(self, user_id: int, operation: str, limit_per_hour: int = 100) -> bool:
        """Check if user has exceeded rate limits"""
        current_time = time.time()
        hour_ago = current_time - 3600
        
        if operation == "upload":
            user_uploads = self.upload_limits.get(user_id, [])
            # Remove old timestamps
            user_uploads = [t for t in user_uploads if t > hour_ago]
            self.upload_limits[user_id] = user_uploads
            
            if len(user_uploads) >= limit_per_hour:
                return False
            
            user_uploads.append(current_time)
            return True
        
        elif operation == "download":
            user_downloads = self.download_limits.get(user_id, [])
            user_downloads = [t for t in user_downloads if t > hour_ago]
            self.download_limits[user_id] = user_downloads
            
            if len(user_downloads) >= limit_per_hour * 10:  # More lenient for downloads
                return False
            
            user_downloads.append(current_time)
            return True
        
        return True
    
    def _validate_file_request(self, request: AssetRequest) -> Tuple[bool, Optional[str]]:
        """Validate file upload request"""
        if not request.filename:
            return False, "Filename is required"
        
        # Check file extension
        file_ext = os.path.splitext(request.filename.lower())[1]
        if file_ext not in self.allowed_extensions:
            return False, f"File type {file_ext} not allowed. Allowed: {', '.join(self.allowed_extensions)}"
        
        # Check MIME type if provided
        if request.content_type and request.content_type not in self.allowed_mime_types:
            return False, f"Content type {request.content_type} not allowed"
        
        # Check file size
        if request.file_size and request.file_size > self.max_file_size:
            return False, f"File size {request.file_size} exceeds limit of {self.max_file_size} bytes"
        
        return True, None
    
    def _generate_asset_id(self, filename: str, user_id: int) -> str:
        """Generate unique asset ID using xxHash"""
        timestamp = str(int(time.time()))
        content = f"{filename}_{user_id}_{timestamp}"        
        hasher = xxhash.xxh64()
        hasher.update(content.encode())
        return hasher.hexdigest()[:16]
    
    def _generate_r2_key(self, asset_id: str, filename: str, session_code: str) -> str:
        """Generate R2 object key with proper organization"""
        file_ext = os.path.splitext(filename)[1]
        return f"sessions/{session_code}/assets/{asset_id}{file_ext}"
    
    async def request_upload_url(self, request: AssetRequest) -> PresignedUrlResponse:
        """Generate presigned URL for file upload"""
        try:
            # Check if R2 is configured
            if not self.r2_manager.is_r2_configured():
                return PresignedUrlResponse(
                    success=False,
                    error="Cloud storage not configured"
                )
            
            # Check permissions
            permissions = self._get_permissions(request.session_code, request.user_id)
            if not permissions.can_upload:
                return PresignedUrlResponse(
                    success=False,
                    error="Upload permission denied"
                )
            
            # Check rate limits
            if not self._check_rate_limit(request.user_id, "upload", 50):  # 50 uploads per hour
                return PresignedUrlResponse(
                    success=False,
                    error="Upload rate limit exceeded. Please try again later."
                )
            
            # Validate file request
            valid, error_msg = self._validate_file_request(request)
            if not valid:
                return PresignedUrlResponse(
                    success=False,
                    error=error_msg
                )
            
            # Generate asset ID and R2 key
            asset_id = self._generate_asset_id(request.filename, request.user_id)
            r2_key = self._generate_r2_key(asset_id, request.filename, request.session_code)
            
            # Generate presigned URL (1 hour expiry)
            expiry_seconds = 3600
            presigned_url = self.r2_manager.generate_presigned_url(
                r2_key,
                method="PUT",
                expiration=expiry_seconds
            )
            
            if not presigned_url:
                return PresignedUrlResponse(
                    success=False,
                    error="Failed to generate upload URL"
                )
            
            # Store asset metadata
            self.asset_registry[asset_id] = {
                "asset_id": asset_id,
                "filename": request.filename,
                "r2_key": r2_key,
                "session_code": request.session_code,
                "uploaded_by": request.user_id,
                "username": request.username,
                "file_size": request.file_size,
                "content_type": request.content_type,
                "created_at": datetime.now().isoformat(),
                "status": "pending_upload"
            }
            
            # Save asset metadata to database
            self._save_asset_to_db(self.asset_registry[asset_id])
            
            logger.info(f"Generated upload URL for {request.username}: {request.filename} -> {asset_id}")
            
            return PresignedUrlResponse(
                success=True,
                url=presigned_url,
                asset_id=asset_id,
                expires_in=expiry_seconds,
                instructions="PUT the file directly to this URL with the original Content-Type header"
            )
            
        except Exception as e:
            logger.error(f"Error generating upload URL: {e}")
            return PresignedUrlResponse(
                success=False,
                error="Internal server error"
            )
    
    async def request_download_url(self, request: AssetRequest) -> PresignedUrlResponse:
        """Generate presigned URL for file download"""
        try:
            if not self.r2_manager.is_r2_configured():
                return PresignedUrlResponse(
                    success=False,
                    error="Cloud storage not configured"
                )
            
            # Check permissions
            permissions = self._get_permissions(request.session_code, request.user_id)
            if not permissions.can_download:
                return PresignedUrlResponse(
                    success=False,
                    error="Download permission denied"
                )
            
            # Check rate limits
            if not self._check_rate_limit(request.user_id, "download", 500):  # 500 downloads per hour
                return PresignedUrlResponse(
                    success=False,
                    error="Download rate limit exceeded"
                )
              # Get asset metadata from database first, then fallback to memory
            asset_metadata = None
            if request.asset_id:
                asset_metadata = self._get_asset_by_id_from_db(request.asset_id)
            
            # Fallback to memory registry if not found in database
            if not asset_metadata and request.asset_id in self.asset_registry:
                asset_metadata = self.asset_registry[request.asset_id]
            
            if not asset_metadata:
                return PresignedUrlResponse(
                    success=False,
                    error="Asset not found"
                )
            
            # Check if asset belongs to the session
            # if asset_metadata["session_code"] != request.session_code:
            #     return PresignedUrlResponse(
            #         success=False,
            #         error="Asset not available in this session"
            #     )
            
            # Generate presigned URL (24 hours for session assets)
            expiry_seconds = 86400
            presigned_url = self.r2_manager.generate_presigned_url(
                asset_metadata["r2_key"],
                method="GET",
                expiration=expiry_seconds
            )
            
            if not presigned_url:
                return PresignedUrlResponse(
                    success=False,
                    error="Failed to generate download URL"
                )
            
            logger.info(f"Generated download URL for {request.username}: {request.asset_id}")
            
            return PresignedUrlResponse(
                success=True,
                url=presigned_url,
                asset_id=request.asset_id,
                expires_in=expiry_seconds,
                instructions="GET request to download the file"
            )
            
        except Exception as e:
            logger.error(f"Error generating download URL: {e}")
            return PresignedUrlResponse(
                success=False,
                error="Internal server error"
            )
    
    async def request_download_url_by_filename(self, filename: str, session_code: str, user_id: int) -> PresignedUrlResponse:
        """Get download URL for an asset by filename (for existing assets)"""
        try:
            # Check permissions
            permissions = self._get_permissions(session_code, user_id)
            if not permissions.can_download:
                return PresignedUrlResponse(
                    success=False,
                    error="Download permission denied"
                )
            
            # Get asset from database by filename
            asset_metadata = self._get_asset_from_db(filename)
            if not asset_metadata:
                return PresignedUrlResponse(
                    success=False,
                    error="Asset not found",
                    instructions="You may need to upload this asset first"
                )
            
            # Generate presigned URL (24 hours for session assets)
            expiry_seconds = 86400
            presigned_url = self.r2_manager.generate_presigned_url(
                asset_metadata["r2_key"],
                method="GET",
                expiration=expiry_seconds
            )
            
            if not presigned_url:
                return PresignedUrlResponse(
                    success=False,
                    error="Failed to generate download URL"
                )
            
            logger.info(f"Generated download URL for existing asset: {filename}")
            
            return PresignedUrlResponse(
                success=True,
                url=presigned_url,
                asset_id=asset_metadata["asset_id"],
                expires_in=expiry_seconds
            )
            
        except Exception as e:
            logger.error(f"Error generating download URL for filename {filename}: {e}")
            return PresignedUrlResponse(
                success=False,
                error="Internal server error"
            )
    
    async def confirm_upload(self, asset_id: str, user_id: int) -> bool:
        """Confirm that an upload was completed successfully"""
        #TODO do we need this?
        try:
            if asset_id not in self.asset_registry:
                logger.warning(f"Upload confirmation for unknown asset: {asset_id}")
                return False
            
            asset_metadata = self.asset_registry[asset_id]
            
            # Verify ownership
            if asset_metadata["uploaded_by"] != user_id:
                logger.warning(f"Upload confirmation denied: user {user_id} doesn't own asset {asset_id}")
                return False
            
            # Check if file exists in R2
            exists = self.r2_manager.object_exists(asset_metadata["r2_key"])
            if exists:
                asset_metadata["status"] = "uploaded"
                asset_metadata["confirmed_at"] = datetime.now().isoformat()
                logger.info(f"Upload confirmed for asset {asset_id}")
                return True
            else:
                logger.warning(f"Upload confirmation failed: file not found in R2 for asset {asset_id}")
                return False
                
        except Exception as e:            
            logger.error(f"Error confirming upload: {e}")
            return False
    
    def get_session_assets(self, session_code: str) -> List[dict]:
        """Get list of assets available in a session"""
        #TODO: do we need this?
        try:
            db = SessionLocal()
            try:
                # Get session ID from session code
                session = db.query(GameSession).filter(GameSession.session_code == session_code).first()
                if not session:
                    logger.warning(f"Session {session_code} not found")
                    return []
                
                # Get all assets for this session
                assets = db.query(Asset).filter(Asset.session_id == session.id).all()
                
                result = []
                for asset in assets:
                    result.append({
                        "asset_id": asset.r2_asset_id,
                        "filename": asset.asset_name,
                        "uploaded_by": asset.uploaded_by,
                        "created_at": asset.created_at.isoformat(),
                        "file_size": asset.file_size,
                        "content_type": asset.content_type,
                        "last_accessed": asset.last_accessed.isoformat()
                    })
                
                logger.info(f"Found {len(result)} assets in session {session_code}")
                return result
                
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Error getting session assets: {e}")
            return []
        return assets
    
    def cleanup_session(self, session_code: str):
        """Clean up session-specific data"""
        # Remove session permissions
        if session_code in self.session_permissions:
            del self.session_permissions[session_code]
        
        # Note: We don't delete assets from R2 here as they might be needed later
        # Implement a separate cleanup job for old assets
        logger.info(f"Cleaned up session data for {session_code}")
    
    def get_stats(self) -> dict:
        """Get asset management statistics"""
        total_assets = len(self.asset_registry)
        uploaded_assets = len([a for a in self.asset_registry.values() if a["status"] == "uploaded"])
        
        return {
            "total_assets": total_assets,
            "uploaded_assets": uploaded_assets,
            "pending_uploads": total_assets - uploaded_assets,
            "r2_configured": self.r2_manager.is_r2_configured(),
            "active_sessions": len(self.session_permissions)
        }
    
    def calculate_file_xxhash(self, file_path: str) -> str:
        """Calculate xxHash for a file"""
        try:
            hasher = xxhash.xxh64()
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception as e:
            logger.error(f"Error calculating xxHash: {e}")
            return ""
    
    async def request_upload_url_with_hash(self, request: AssetRequest, file_xxhash: str) -> PresignedUrlResponse:
        """Generate presigned URL for file upload with pre-calculated hash"""
        try:
            # Check if R2 is configured
            if not self.r2_manager.is_r2_configured():
                return PresignedUrlResponse(
                    success=False,
                    error="Cloud storage not configured"
                )
            
            # Check permissions
            permissions = self._get_permissions(request.session_code, request.user_id)
            if not permissions.can_upload:
                return PresignedUrlResponse(
                    success=False,
                    error="Upload permission denied"
                )
            
            # Check rate limits
            if not self._check_rate_limit(request.user_id, "upload", 50):
                return PresignedUrlResponse(
                    success=False,
                    error="Upload rate limit exceeded. Please try again later."
                )
            
            # Validate file request
            valid, error_msg = self._validate_file_request(request)
            if not valid:
                return PresignedUrlResponse(
                    success=False,
                    error=error_msg
                )
            
            # Check for duplicate files by xxHash
            existing_asset = self._get_asset_by_xxhash_from_db(file_xxhash)
            if existing_asset:
                logger.info(f"Duplicate file detected by xxHash: {file_xxhash}, returning existing asset")
                return PresignedUrlResponse(
                    success=True,
                    asset_id=existing_asset["asset_id"],
                    error="File already exists",
                    instructions="This file has already been uploaded. Using existing asset."
                )
            
            # Generate asset ID and R2 key
            asset_id = self._generate_asset_id(request.filename, request.user_id)
            r2_key = self._generate_r2_key(asset_id, request.filename, request.session_code)
            
            # Generate presigned URL with xxHash metadata (1 hour expiry)
            expiry_seconds = 3600
            presigned_url = self.r2_manager.generate_presigned_upload_url(
                r2_key,
                file_xxhash,
                expiration=expiry_seconds
            )
            
            if not presigned_url:
                return PresignedUrlResponse(
                    success=False,
                    error="Failed to generate upload URL"
                )
            
            # Store asset metadata with xxHash
            self.asset_registry[asset_id] = {
                "asset_id": asset_id,
                "filename": request.filename,
                "r2_key": r2_key,
                "session_code": request.session_code,
                "uploaded_by": request.user_id,
                "username": request.username,
                "file_size": request.file_size,
                "content_type": request.content_type,
                "xxhash": file_xxhash,
                "created_at": datetime.now().isoformat(),
                "status": "pending_upload"
            }
            
            # Save asset metadata to database
            self._save_asset_to_db(self.asset_registry[asset_id])
            
            logger.info(f"Generated upload URL for {request.username}: {request.filename} -> {asset_id} (xxHash: {file_xxhash})")
            
            return PresignedUrlResponse(
                success=True,
                url=presigned_url,
                asset_id=asset_id,
                expires_in=expiry_seconds,
                required_xxhash=file_xxhash,
                instructions="PUT the file with x-amz-meta-xxhash header containing the xxHash"
            )
            
        except Exception as e:
            logger.error(f"Error generating upload URL with hash: {e}")
            return PresignedUrlResponse(
                success=False,
                error="Internal server error"
            )
    
    def _save_asset_to_db(self, asset_data: dict) -> bool:
        """Save asset metadata to database including xxHash"""
        try:
            db = SessionLocal()
            try:
                # Check if asset already exists by xxHash (duplicate detection)
                if asset_data.get("xxhash"):
                    existing_asset = db.query(Asset).filter(Asset.xxhash == asset_data["xxhash"]).first()
                    if existing_asset:
                        logger.warning(f"Asset with xxHash {asset_data['xxhash']} already exists")
                        return True
                
                # Check if asset already exists by name
                existing_asset = db.query(Asset).filter(Asset.asset_name == asset_data["filename"]).first()
                if existing_asset:
                    logger.warning(f"Asset {asset_data['filename']} already exists in database")
                    return True
                
                # Get session ID if session_code provided
                session_id = None
                if asset_data.get("session_code"):
                    session = db.query(GameSession).filter(GameSession.session_code == asset_data["session_code"]).first()
                    session_id = session.id if session else None
                
                # Create new asset record
                new_asset = Asset(
                    asset_name=asset_data["filename"],
                    r2_asset_id=asset_data["asset_id"],
                    content_type=asset_data["content_type"],
                    file_size=asset_data["file_size"] or 0,
                 
                    xxhash=asset_data.get("xxhash", ""),      
                    uploaded_by=asset_data["uploaded_by"],
                    session_id=session_id,
                    r2_key=asset_data["r2_key"],
                    r2_bucket=settings.R2_BUCKET_NAME or "default",
                    created_at=datetime.utcnow(),
                    last_accessed=datetime.utcnow()
                )
                
                db.add(new_asset)
                db.commit()
                logger.info(f"Saved asset {asset_data['filename']} to database with xxHash {asset_data.get('xxhash', 'N/A')}")
                return True
                
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Error saving asset to database: {e}")
            return False
    
    def _get_asset_from_db(self, asset_name: str) -> Optional[dict]:
        """Get asset metadata from database by name"""
        try:
            db = SessionLocal()
            try:
                asset = db.query(Asset).filter(Asset.asset_name == asset_name).first()
                if asset:
                    # Update last accessed time
                    asset.last_accessed = datetime.utcnow()
                    db.commit()
                    
                    return {
                        "asset_id": asset.r2_asset_id,
                        "filename": asset.asset_name,
                        "r2_key": asset.r2_key,
                        "content_type": asset.content_type,
                        "file_size": asset.file_size,
                        "uploaded_by": asset.uploaded_by,
                        "session_id": asset.session_id,
                        "created_at": asset.created_at.isoformat(),
                        "last_accessed": asset.last_accessed.isoformat()
                    }
                return None
                
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Error getting asset from database: {e}")
            return None

    def _get_asset_by_id_from_db(self, asset_id: str) -> Optional[dict]:
        """Get asset metadata from database by R2 asset ID"""
        try:
            db = SessionLocal()
            try:                
                asset = db.query(Asset).filter(Asset.r2_asset_id == asset_id).first()
                if asset:
                    # Update last accessed time
                    asset.last_accessed = datetime.utcnow()
                    db.commit()
                    
                    # Get session_code from session_id
                    session_code = None
                    if asset.session_id:
                        from ..database.models import GameSession
                        session = db.query(GameSession).filter(GameSession.id == asset.session_id).first()
                        session_code = session.session_code if session else None
                    
                    return {
                        "asset_id": asset.r2_asset_id,
                        "filename": asset.asset_name,
                        "r2_key": asset.r2_key,
                        "content_type": asset.content_type,
                        "file_size": asset.file_size,
                        "uploaded_by": asset.uploaded_by,
                        "session_id": asset.session_id,
                        "session_code": session_code,
                        "created_at": asset.created_at.isoformat(),
                        "last_accessed": asset.last_accessed.isoformat()
                    }
                return None
                
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Error getting asset by ID from database: {e}")
            return None

    def _get_asset_by_xxhash_from_db(self, xxhash: str) -> Optional[dict]:
        """Get asset metadata from database by xxHash (for duplicate detection)"""
        try:
            db = SessionLocal()
            try:
                asset = db.query(Asset).filter(Asset.xxhash == xxhash).first()
                if asset:
                    return {
                        "asset_id": asset.r2_asset_id,
                        "filename": asset.asset_name,
                        "r2_key": asset.r2_key,
                        "content_type": asset.content_type,
                        "file_size": asset.file_size,
                        "xxhash": asset.xxhash,
                        "uploaded_by": asset.uploaded_by,
                        "session_id": asset.session_id,
                        "created_at": asset.created_at.isoformat()
                    }
                return None
                
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Error getting asset by xxHash from database: {e}")
            return None

# Global instance
_server_asset_manager = None

def get_server_asset_manager() -> ServerAssetManager:
    """Get global server asset manager instance"""
    global _server_asset_manager
    if _server_asset_manager is None:
        _server_asset_manager = ServerAssetManager()
    return _server_asset_manager
