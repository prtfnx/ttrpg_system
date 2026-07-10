"""
Server-side R2 Asset Management Service for TTRPG System
Handles presigned URLs, asset validation, and client permissions
"""
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import xxhash
from config import Settings
from database.database import SessionLocal
from database.models import Asset, AssetUploadIntent, GamePlayer, GameSession, SessionAsset
from storage.r2_manager import R2AssetManager

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
    file_xxhash: Optional[str] = None  # xxHash of the file content, if available

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
        # Check if permissions are explicitly set
        if session_code in self.session_permissions and user_id in self.session_permissions[session_code]:
            return self.session_permissions[session_code][user_id]

        # For test sessions or unknown sessions, auto-grant player permissions
        if session_code.startswith('test_') or not self.session_permissions.get(session_code):
            logger.info(f"Auto-granting player permissions for test session {session_code}, user {user_id}")
            return AssetPermission(
                can_upload=True,  # Allow upload for testing
                can_download=True,
                can_share=False,
                can_moderate=False
            )

        # Default read-only for established sessions
        return AssetPermission()

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

    def _generate_asset_id(self, filedata:bytes) -> str:
        """Generate unique asset ID based on file content"""
        hasher = xxhash.xxh64()
        hasher.update(filedata)
        return hasher.hexdigest()[:16]

    def _generate_r2_key(self, asset_id: str, filename: str, session_code: str) -> str:
        """Generate R2 object key with proper organization"""
        file_ext = os.path.splitext(filename)[1]
        return f"sessions/{session_code}/assets/{asset_id}{file_ext}"

    def _get_session(self, db, session_code: str) -> Optional[GameSession]:
        return db.query(GameSession).filter(GameSession.session_code == session_code).first()

    def _user_can_access_session(self, db, session: Optional[GameSession], user_id: int) -> bool:
        if session is None:
            return True
        if session.owner_id == user_id:
            return True
        return db.query(GamePlayer).filter(
            GamePlayer.session_id == session.id,
            GamePlayer.user_id == user_id
        ).first() is not None

    def _asset_has_session_access(self, db, asset: Asset, session: Optional[GameSession]) -> bool:
        if session is None:
            return True
        linked = db.query(SessionAsset).filter(
            SessionAsset.session_id == session.id,
            SessionAsset.asset_id == asset.id
        ).first()
        if linked:
            linked.last_accessed = datetime.utcnow()
            return True
        return asset.session_id == session.id

    def _link_asset_to_session(self, db, asset: Asset, session: Optional[GameSession],
                               user_id: int, display_name: str) -> None:
        if session is None:
            return
        link = db.query(SessionAsset).filter(
            SessionAsset.session_id == session.id,
            SessionAsset.asset_id == asset.id
        ).first()
        if link:
            link.last_accessed = datetime.utcnow()
            return
        db.add(SessionAsset(
            session_id=session.id,
            asset_id=asset.id,
            display_name=display_name,
            added_by=user_id,
            created_at=datetime.utcnow(),
            last_accessed=datetime.utcnow()
        ))

    def _link_existing_asset_to_session(self, asset_id: str, session_code: str,
                                        user_id: int, display_name: str) -> None:
        db = SessionLocal()
        try:
            asset = db.query(Asset).filter(Asset.r2_asset_id == asset_id).first()
            session = self._get_session(db, session_code)
            if asset:
                self._link_asset_to_session(db, asset, session, user_id, display_name)
                db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Error linking duplicate asset {asset_id} to session {session_code}: {e}")
        finally:
            db.close()

    def _make_unique_asset_name(self, db, filename: str, asset_id: str) -> str:
        existing = db.query(Asset).filter(Asset.asset_name == filename).first()
        if not existing:
            return filename
        stem, ext = os.path.splitext(filename)
        return f"{stem}-{asset_id[:8]}{ext}"

    def _record_upload_intent(self, metadata: dict, expires_in: int) -> None:
        db = SessionLocal()
        try:
            session = self._get_session(db, metadata["session_code"])
            stale = db.query(AssetUploadIntent).filter(
                AssetUploadIntent.asset_id == metadata["asset_id"],
                AssetUploadIntent.session_code == metadata["session_code"],
                AssetUploadIntent.uploaded_by == metadata["uploaded_by"],
                AssetUploadIntent.status == "awaiting_upload"
            ).all()
            for intent in stale:
                intent.status = "superseded"

            db.add(AssetUploadIntent(
                asset_id=metadata["asset_id"],
                filename=metadata["filename"],
                r2_key=metadata["r2_key"],
                session_id=session.id if session else None,
                session_code=metadata["session_code"],
                uploaded_by=metadata["uploaded_by"],
                content_type=metadata.get("content_type"),
                file_size=metadata.get("file_size"),
                xxhash=metadata.get("xxhash"),
                status="awaiting_upload",
                created_at=datetime.utcnow(),
                expires_at=datetime.utcnow() + timedelta(seconds=expires_in),
            ))
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

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

            # Validate required fields
            if not request.asset_id:
                return PresignedUrlResponse(
                    success=False,
                    error="asset_id is required"
                )

            if not request.filename:
                return PresignedUrlResponse(
                    success=False,
                    error="filename is required"
                )

            asset_id = request.asset_id  # Now we know it's not None
            # Check if asset already exists in the database
            existing_asset = self._get_asset_by_id_from_db(asset_id)
            if existing_asset:
                return PresignedUrlResponse(
                    success=True,
                    asset_id=asset_id,
                    url=None,  # No upload needed
                    instructions="Asset already exists"
                )
            # Generate asset ID and R2 key
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

            # Store durable upload intent metadata.
            pending_metadata = {
                "asset_id": asset_id,
                "filename": request.filename,
                "r2_key": r2_key,
                "session_code": request.session_code,
                "uploaded_by": request.user_id,
                "username": request.username,
                "file_size": request.file_size,
                "content_type": request.content_type,
                "created_at": datetime.now().isoformat(),
                "presigned_url_generated_at": datetime.now().isoformat(),
                "status": "awaiting_upload"
            }

            self._record_upload_intent(pending_metadata, expiry_seconds)

            logger.info(f"Generated upload URL for {request.username}: {request.filename} -> {asset_id} (pending confirmation)")

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
                asset_metadata = self._get_asset_by_id_from_db(
                    request.asset_id,
                    session_code=request.session_code,
                    user_id=request.user_id
                )

            if not asset_metadata:
                return PresignedUrlResponse(
                    success=False,
                    error="Asset not found"
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
            scoped_metadata = self._get_asset_by_id_from_db(
                asset_metadata["asset_id"],
                session_code=session_code,
                user_id=user_id
            )
            if not scoped_metadata:
                return PresignedUrlResponse(
                    success=False,
                    error="Asset not available in this session"
                )
            asset_metadata = scoped_metadata

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

    async def confirm_upload(self, asset_id: str, user_id: int, upload_success: bool = True,
                           error_message: Optional[str] = None) -> bool:
        """Confirm that an upload was completed successfully or failed - CREATES DB ENTRY"""
        try:
            db = SessionLocal()
            try:
                intent = db.query(AssetUploadIntent).filter(
                    AssetUploadIntent.asset_id == asset_id,
                    AssetUploadIntent.uploaded_by == user_id,
                    AssetUploadIntent.status == "awaiting_upload"
                ).order_by(AssetUploadIntent.created_at.desc()).first()

                if not intent:
                    logger.error(f"Asset {asset_id} has no durable pending upload intent")
                    return False

                if intent.expires_at and intent.expires_at < datetime.utcnow():
                    intent.status = "expired"
                    intent.error_message = "Upload confirmation arrived after presigned URL expiry"
                    db.commit()
                    logger.error(f"Asset {asset_id} upload intent expired before confirmation")
                    return False

                if not upload_success:
                    intent.status = "failed"
                    intent.error_message = error_message
                    intent.confirmed_at = datetime.utcnow()
                    db.commit()
                    logger.warning(f"Asset {asset_id} upload failed: {error_message}")
                    return True

                if not await self._verify_asset_in_r2(intent.r2_key):
                    intent.status = "missing_object"
                    intent.error_message = "R2 object did not exist at confirmation time"
                    intent.confirmed_at = datetime.utcnow()
                    db.commit()
                    logger.error(f"Asset {asset_id} not found in R2; refusing DB asset commit")
                    return False

                confirmed_metadata = {
                    "asset_id": intent.asset_id,
                    "filename": intent.filename,
                    "r2_key": intent.r2_key,
                    "session_code": intent.session_code,
                    "uploaded_by": intent.uploaded_by,
                    "file_size": intent.file_size,
                    "content_type": intent.content_type,
                    "xxhash": intent.xxhash,
                    "status": "uploaded",
                    "uploaded_at": datetime.utcnow().isoformat()
                }

                if not self._save_asset_to_db(confirmed_metadata):
                    intent.status = "metadata_failed"
                    intent.error_message = "Failed to save asset metadata"
                    intent.confirmed_at = datetime.utcnow()
                    db.commit()
                    return False

                intent.status = "uploaded"
                intent.confirmed_at = datetime.utcnow()
                db.commit()
                logger.info(f"Asset {asset_id} confirmed and saved to database")
                return True
            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error confirming upload for asset {asset_id}: {e}")
            return False

    def get_session_assets(self, session_code: str) -> List[dict]:
        """Get list of assets available in a session.

        This helper is used by the management UI to populate the asset
        browser. It queries the database for the given session code and
        returns a summary of stored assets.
        """
        try:
            db = SessionLocal()
            try:
                # Get session ID from session code
                session = db.query(GameSession).filter(GameSession.session_code == session_code).first()
                if not session:
                    logger.warning(f"Session {session_code} not found")
                    return []

                linked_assets = (
                    db.query(SessionAsset, Asset)
                    .join(Asset, SessionAsset.asset_id == Asset.id)
                    .filter(SessionAsset.session_id == session.id)
                    .order_by(SessionAsset.created_at.desc())
                    .all()
                )

                result = []
                seen_ids = set()
                for link, asset in linked_assets:
                    seen_ids.add(asset.r2_asset_id)
                    result.append({
                        "id": asset.r2_asset_id,
                        "asset_id": asset.r2_asset_id,
                        "name": link.display_name,
                        "filename": link.display_name,
                        "uploaded_by": asset.uploaded_by,
                        "created_at": (asset.created_at.isoformat() if asset.created_at else None),
                        "file_size": asset.file_size,
                        "size": asset.file_size,
                        "content_type": asset.content_type,
                        "type": asset.content_type,
                        "xxhash": asset.xxhash,
                        "last_accessed": (asset.last_accessed.isoformat() if asset.last_accessed else None)
                    })

                legacy_assets = db.query(Asset).filter(Asset.session_id == session.id).all()
                for asset in legacy_assets:
                    if asset.r2_asset_id in seen_ids:
                        continue
                    result.append({
                        "id": asset.r2_asset_id,
                        "asset_id": asset.r2_asset_id,
                        "name": asset.asset_name,
                        "filename": asset.asset_name,
                        "uploaded_by": asset.uploaded_by,
                        "created_at": (asset.created_at.isoformat() if asset.created_at else None),
                        "file_size": asset.file_size,
                        "size": asset.file_size,
                        "content_type": asset.content_type,
                        "type": asset.content_type,
                        "xxhash": asset.xxhash,
                        "last_accessed": (asset.last_accessed.isoformat() if asset.last_accessed else None)
                    })

                logger.info(f"Found {len(result)} assets in session {session_code}")
                return result

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error getting session assets: {e}")
            return []
        return []

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
        db = SessionLocal()
        try:
            total_assets = db.query(Asset).count()
            pending_uploads = db.query(AssetUploadIntent).filter(
                AssetUploadIntent.status == "awaiting_upload"
            ).count()
            failed_uploads = db.query(AssetUploadIntent).filter(
                AssetUploadIntent.status.in_(["failed", "missing_object", "metadata_failed", "expired"])
            ).count()
        finally:
            db.close()

        return {
            "total_confirmed_assets": total_assets,
            "uploaded_assets": total_assets,
            "pending_uploads": pending_uploads,
            "failed_uploads": failed_uploads,
            "r2_configured": self.r2_manager.is_r2_configured(),
            "active_sessions": len(self.session_permissions),
            "note": "Confirmed assets and pending upload intents are durable"
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
            # Validate that asset_id matches file_xxhash
            if not request.asset_id:
                return PresignedUrlResponse(
                    success=False,
                    error="asset_id is required"
                )

            if request.asset_id != file_xxhash[:16]:
                return PresignedUrlResponse(
                    success=False,
                    error="asset_id must match first 16 characters of file xxhash"
                )

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

            # Additional validation for required fields
            if not request.filename:
                return PresignedUrlResponse(
                    success=False,
                    error="filename is required"
                )

            # Check for duplicate files by xxHash
            existing_asset = self._get_asset_by_xxhash_from_db(file_xxhash)
            if existing_asset:
                logger.info(f"Duplicate file detected by xxHash: {file_xxhash}, returning existing asset")
                self._link_existing_asset_to_session(
                    existing_asset["asset_id"],
                    request.session_code,
                    request.user_id,
                    request.filename
                )
                return PresignedUrlResponse(
                    success=True,
                    asset_id=existing_asset["asset_id"],
                    url=None,  # No upload needed
                    instructions="This file has already been uploaded. Using existing asset."
                )

            # Use the asset_id from the request (already validated above)
            asset_id = request.asset_id
            r2_key = self._generate_r2_key(asset_id, request.filename, request.session_code)

            # Generate presigned URL with xxHash metadata (1 hour expiry)
            expiry_seconds = 3600
            presigned_url = self.r2_manager.generate_presigned_upload_url(
                r2_key,
                file_xxhash,
                content_type=request.content_type,
                expiration=expiry_seconds
            )

            if not presigned_url:
                return PresignedUrlResponse(
                    success=False,
                    error="Failed to generate upload URL"
                )

            # Store durable upload intent metadata.
            pending_metadata = {
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
                "presigned_url_generated_at": datetime.now().isoformat(),
                "status": "awaiting_upload"
            }

            self._record_upload_intent(pending_metadata, expiry_seconds)

            logger.info(f"Generated upload URL for {request.username}: {request.filename} -> {asset_id} (pending confirmation)")

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
                session = None
                if asset_data.get("session_code"):
                    session = db.query(GameSession).filter(GameSession.session_code == asset_data["session_code"]).first()

                # Check if asset already exists by xxHash (duplicate detection)
                if asset_data.get("xxhash"):
                    existing_asset = db.query(Asset).filter(Asset.xxhash == asset_data["xxhash"]).first()
                    if existing_asset:
                        self._link_asset_to_session(
                            db,
                            existing_asset,
                            session,
                            asset_data["uploaded_by"],
                            asset_data["filename"]
                        )
                        db.commit()
                        logger.info(f"Linked existing asset with xxHash {asset_data['xxhash']} to session")
                        return True

                session_id = session.id if session else None
                stored_name = self._make_unique_asset_name(db, asset_data["filename"], asset_data["asset_id"])

                # Create new asset record
                new_asset = Asset(
                    asset_name=stored_name,
                    r2_asset_id=asset_data["asset_id"],
                    content_type=asset_data.get("content_type") or "application/octet-stream",
                    file_size=asset_data["file_size"] or 0,

                    xxhash=asset_data.get("xxhash", ""),
                    uploaded_by=asset_data["uploaded_by"],
                    session_id=session_id,
                    r2_key=asset_data["r2_key"],
                    r2_bucket=Settings().r2_bucket_name or "default",
                    created_at=datetime.utcnow(),
                    last_accessed=datetime.utcnow()
                )

                db.add(new_asset)
                db.flush()
                self._link_asset_to_session(db, new_asset, session, asset_data["uploaded_by"], asset_data["filename"])
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
                    db.query(Asset).filter(Asset.asset_name == asset_name).update(
                        {Asset.last_accessed: datetime.utcnow()}
                    )
                    db.commit()

                    return {
                        "asset_id": asset.r2_asset_id,
                        "filename": asset.asset_name,
                        "r2_key": asset.r2_key,
                        "content_type": asset.content_type,
                        "file_size": asset.file_size,
                        "uploaded_by": asset.uploaded_by,
                        "session_id": asset.session_id,
                        "created_at": (asset.created_at.isoformat() if asset.created_at else None),
                        "last_accessed": (asset.last_accessed.isoformat() if asset.last_accessed else None)
                    }
                return None

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error getting asset from database: {e}")
            return None

    def _get_asset_by_id_from_db(
        self,
        asset_id: str,
        session_code: Optional[str] = None,
        user_id: Optional[int] = None
    ) -> Optional[dict]:
        """Get asset metadata from database by R2 asset ID"""
        try:
            db = SessionLocal()
            try:
                asset = db.query(Asset).filter(Asset.r2_asset_id == asset_id).first()
                if asset:
                    requested_session_code = session_code
                    session = self._get_session(db, session_code) if session_code else None
                    if user_id is not None and not self._user_can_access_session(db, session, user_id):
                        logger.warning(f"User {user_id} is not a member of session {session_code}")
                        return None
                    if session_code and not self._asset_has_session_access(db, asset, session):
                        logger.warning(f"Asset {asset_id} is not available in session {session_code}")
                        return None

                    # Update last accessed time
                    db.query(Asset).filter(Asset.r2_asset_id == asset_id).update(
                        {Asset.last_accessed: datetime.utcnow()}
                    )
                    db.commit()

                    # Get session_code from session_id
                    legacy_session_code = requested_session_code
                    if asset.session_id is not None:
                        session = db.query(GameSession).filter(GameSession.id == asset.session_id).first()
                        legacy_session_code = session.session_code if session else requested_session_code

                    return {
                        "asset_id": asset.r2_asset_id,
                        "filename": asset.asset_name,
                        "r2_key": asset.r2_key,
                        "content_type": asset.content_type,
                        "file_size": asset.file_size,
                        "uploaded_by": asset.uploaded_by,
                        "session_id": asset.session_id,
                        "session_code": legacy_session_code,
                        "xxhash": asset.xxhash,
                        "created_at": (asset.created_at.isoformat() if asset.created_at else None),
                        "last_accessed": (asset.last_accessed.isoformat() if asset.last_accessed else None)
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
                        "created_at": (asset.created_at.isoformat() if asset.created_at else None)
                    }
                return None

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error getting asset by xxHash from database: {e}")
            return None

    async def _verify_asset_in_r2(self, r2_key: str) -> bool:
        """Verify if asset exists in R2 storage"""
        try:
            # Use R2Manager to check if object exists
            exists = self.r2_manager.object_exists(r2_key)
            return exists
        except Exception as e:
            logger.error(f"Error verifying asset in R2: {e}")
            return False

    def _update_asset_status_in_db(self, asset_id: str, status: str, error_message: Optional[str] = None):
        """Update asset status in database"""
        try:
            db = SessionLocal()
            try:
                asset = db.query(Asset).filter_by(r2_asset_id=asset_id).first()
                if asset:
                    asset.status = status
                    if error_message:
                        asset.error_message = error_message
                    if status == "uploaded":
                        asset.uploaded_at = datetime.now()
                    elif status == "failed":
                        asset.failed_at = datetime.now()

                    db.commit()
                    logger.debug(f"Updated asset {asset_id} status to {status}")
                else:
                    logger.warning(f"Asset {asset_id} not found in database for status update")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error updating asset status in database: {e}")

    async def cleanup_phantom_assets(self, session_code: Optional[str] = None,
                                   max_age_hours: int = 24) -> dict:
        """
        Clean up database entries for assets that don't exist in R2.
        Note: With the new approach, this should rarely find anything since
        DB entries are only created after upload confirmation.
        """
        try:
            db = SessionLocal()
            cleanup_stats = {
                "assets_checked": 0,
                "phantom_assets_found": 0,
                "assets_cleaned": 0,
                "errors": 0,
                "note": "With new upload flow, phantom assets should be rare"
            }

            try:
                # Query for assets to check
                query = db.query(Asset)
                if session_code:
                    # Filter by session if provided
                    session = db.query(GameSession).filter(GameSession.session_code == session_code).first()
                    if session:
                        linked_asset_ids = db.query(SessionAsset.asset_id).filter(SessionAsset.session_id == session.id)
                        query = query.filter(
                            (Asset.session_id == session.id) | (Asset.id.in_(linked_asset_ids))
                        )

                # Only check assets older than max_age_hours
                cutoff_time = datetime.now() - timedelta(hours=max_age_hours)
                query = query.filter(Asset.created_at < cutoff_time)

                assets = query.all()
                cleanup_stats["assets_checked"] = len(assets)

                for asset in assets:
                    try:
                        exists_in_r2 = await self._verify_asset_in_r2(asset.r2_key)

                        if not exists_in_r2:
                            cleanup_stats["phantom_assets_found"] += 1
                            logger.warning(f"Legacy phantom asset found: {asset.r2_asset_id} ({asset.asset_name}) - not in R2")

                            # Remove from database
                            db.delete(asset)
                            cleanup_stats["assets_cleaned"] += 1

                    except Exception as e:
                        logger.error(f"Error checking asset {asset.r2_asset_id}: {e}")
                        cleanup_stats["errors"] += 1

                # Commit all deletions
                db.commit()

                logger.info(f"Legacy phantom cleanup completed: {cleanup_stats}")
                return cleanup_stats

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error during phantom asset cleanup: {e}")
            return {"error": str(e)}

    async def verify_all_session_assets(self, session_code: str) -> dict:
        """
        Verify all assets for a session exist in R2.
        Returns verification report.
        """
        try:
            db = SessionLocal()
            verification_report = {
                "session_code": session_code,
                "total_assets": 0,
                "verified_assets": 0,
                "missing_assets": [],
                "errors": []
            }

            try:
                # Get session
                session = db.query(GameSession).filter(GameSession.session_code == session_code).first()
                if not session:
                    verification_report["errors"].append(f"Session {session_code} not found")
                    return verification_report

                linked_asset_ids = db.query(SessionAsset.asset_id).filter(SessionAsset.session_id == session.id)
                assets = db.query(Asset).filter(
                    (Asset.session_id == session.id) | (Asset.id.in_(linked_asset_ids))
                ).all()
                verification_report["total_assets"] = len(assets)

                for asset in assets:
                    try:
                        exists_in_r2 = await self._verify_asset_in_r2(asset.r2_key)

                        if exists_in_r2:
                            verification_report["verified_assets"] += 1
                        else:
                            verification_report["missing_assets"].append({
                                "asset_id": asset.r2_asset_id,
                                "filename": asset.asset_name,
                                "r2_key": asset.r2_key,
                                "created_at": (asset.created_at.isoformat() if asset.created_at else None) if hasattr(asset.created_at, 'isoformat') and asset.created_at is not None else str(asset.created_at)
                            })
                    except Exception as e:
                        verification_report["errors"].append(f"Error verifying {asset.r2_asset_id}: {str(e)}")

                return verification_report

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error during asset verification: {e}")
            return {"error": str(e)}

    def cleanup_stale_pending_uploads(self, max_age_hours: int = 2) -> dict:
        """
        Clean up pending uploads that are older than max_age_hours.
        These represent presigned URLs that were generated but never used.
        """
        try:
            cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)
            cleanup_stats = {
                "total_pending": 0,
                "stale_uploads": 0,
                "cleaned_uploads": 0
            }

            db = SessionLocal()
            try:
                pending = db.query(AssetUploadIntent).filter(AssetUploadIntent.status == "awaiting_upload")
                cleanup_stats["total_pending"] = pending.count()
                stale_uploads = pending.filter(AssetUploadIntent.created_at < cutoff_time).all()
                cleanup_stats["stale_uploads"] = len(stale_uploads)
                for intent in stale_uploads:
                    intent.status = "expired"
                    intent.error_message = f"No upload confirmation within {max_age_hours} hours"
                    cleanup_stats["cleaned_uploads"] += 1
                db.commit()
            finally:
                db.close()

            logger.info(f"Cleaned {cleanup_stats['cleaned_uploads']} stale pending uploads (older than {max_age_hours}h)")
            return cleanup_stats

        except Exception as e:
            logger.error(f"Error during stale upload cleanup: {e}")
            return {"error": str(e)}

    def get_pending_uploads_stats(self) -> dict:
        """Get statistics about pending uploads"""
        try:
            current_time = datetime.now()
            stats = {
                "total_pending": 0,
                "by_age": {"under_1h": 0, "1h_to_2h": 0, "over_2h": 0},
                "by_session": {},
                "oldest_pending": None
            }

            oldest_time = None
            db = SessionLocal()
            try:
                pending = db.query(AssetUploadIntent).filter(
                    AssetUploadIntent.status == "awaiting_upload"
                ).all()
                stats["total_pending"] = len(pending)
            finally:
                db.close()

            for intent in pending:
                try:
                    # Age analysis
                    if intent.created_at:
                        created_at = intent.created_at
                        age_hours = (current_time - created_at).total_seconds() / 3600

                        if age_hours < 1:
                            stats["by_age"]["under_1h"] += 1
                        elif age_hours < 2:
                            stats["by_age"]["1h_to_2h"] += 1
                        else:
                            stats["by_age"]["over_2h"] += 1

                        if oldest_time is None or created_at < oldest_time:
                            oldest_time = created_at
                            stats["oldest_pending"] = {
                                "asset_id": intent.asset_id,
                                "filename": intent.filename,
                                "age_hours": age_hours,
                                "created_at": created_at.isoformat()
                            }

                    # Session analysis
                    session_code = intent.session_code or "unknown"
                    stats["by_session"][session_code] = stats["by_session"].get(session_code, 0) + 1

                except Exception as e:
                    logger.error(f"Error analyzing pending upload {intent.asset_id}: {e}")

            return stats

        except Exception as e:
            logger.error(f"Error getting pending upload stats: {e}")
            return {"error": str(e)}

# Global instance
_server_asset_manager = None

def get_server_asset_manager() -> ServerAssetManager:
    """Get global server asset manager instance"""
    global _server_asset_manager
    if _server_asset_manager is None:
        _server_asset_manager = ServerAssetManager()
    return _server_asset_manager
