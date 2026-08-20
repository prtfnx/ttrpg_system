"""
Server-side R2 Asset Management Service for TTRPG System
Handles presigned URLs, asset validation, and client permissions
"""
import functools
import logging
import os
import warnings
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import timedelta
from io import BytesIO
from typing import Dict, List, Optional, ParamSpec, Tuple, TypeVar

import xxhash
from config import Settings
from database.database import SessionLocal
from database.models import (
    Asset,
    AssetDeletionJob,
    AssetQuotaState,
    AssetUploadIntent,
    GamePlayer,
    GameSession,
    SessionAsset,
    User,
)
from PIL import Image, UnidentifiedImageError
from service.asset_rate_limiter import (
    AssetRateLimitDecision,
    DurableAssetRateLimiter,
    TokenBucketLimit,
)
from sqlalchemy import func, or_
from storage.r2_manager import R2AssetManager
from utils.blocking import run_blocking
from utils.observability import track_asset_operation
from utils.time import utc_now

logger = logging.getLogger(__name__)

P = ParamSpec("P")
R = TypeVar("R")


def _offload_blocking_io(func: Callable[P, R]) -> Callable[P, Awaitable[R]]:
    """Expose a synchronous database/storage operation as an async boundary."""
    @functools.wraps(func)
    async def wrapped(*args: P.args, **kwargs: P.kwargs) -> R:
        return await run_blocking(func, *args, **kwargs)

    return wrapped

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


@dataclass(frozen=True)
class AssetSaveResult:
    success: bool
    error: Optional[str] = None
    created_asset: bool = False


class AssetLinkQuotaExceeded(RuntimeError):
    """Raised when a durable session link reservation is unavailable."""

class ServerAssetManager:
    """Server-side asset management with R2 integration"""

    def __init__(self):
        self.r2_manager = R2AssetManager()
        self.session_permissions: Dict[str, Dict[int, AssetPermission]] = {}  # session_code -> user_id -> permissions
        self.settings = Settings()

        self._asset_rate_limiter = DurableAssetRateLimiter(lambda: SessionLocal())

        # Asset validation settings
        self.max_file_size = self.settings.ASSET_MAX_FILE_BYTES
        self.allowed_image_types = {
            '.png': ('image/png', 'PNG'),
            '.jpg': ('image/jpeg', 'JPEG'),
            '.jpeg': ('image/jpeg', 'JPEG'),
            '.gif': ('image/gif', 'GIF'),
            '.bmp': ('image/bmp', 'BMP'),
            '.webp': ('image/webp', 'WEBP'),
        }

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
        logger.info(
            "Asset permissions updated",
            extra={"event_name": "asset.permissions.updated", "role": role},
        )

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

    def _check_upload_rate_limit(self, user_id: int) -> AssetRateLimitDecision:
        """Apply shared per-user burst and sustained upload throttles."""
        return self._asset_rate_limiter.consume(
            user_id=user_id,
            operation="upload",
            limits=(
                TokenBucketLimit(
                    capacity=self.settings.ASSET_UPLOADS_PER_MINUTE,
                    window_seconds=60,
                ),
                TokenBucketLimit(
                    capacity=self.settings.ASSET_UPLOADS_PER_HOUR,
                    window_seconds=3600,
                ),
            ),
        )

    def _check_download_rate_limit(self, user_id: int) -> AssetRateLimitDecision:
        """Apply the shared per-user download throttle."""
        return self._asset_rate_limiter.consume(
            user_id=user_id,
            operation="download",
            limits=(
                TokenBucketLimit(
                    capacity=self.settings.ASSET_DOWNLOADS_PER_HOUR,
                    window_seconds=3600,
                ),
            ),
        )

    @staticmethod
    def _rate_limit_error(
        decision: AssetRateLimitDecision, operation: str
    ) -> Optional[str]:
        if decision == AssetRateLimitDecision.ALLOWED:
            return None
        if decision == AssetRateLimitDecision.UNAVAILABLE:
            return "Asset rate limiter temporarily unavailable. Please try again later."
        return f"{operation.capitalize()} rate limit exceeded"

    def _check_upload_quota(
        self, db, user_id: int, file_size: int
    ) -> Tuple[bool, Optional[str]]:
        """Enforce durable per-user pending, count, and storage quotas."""
        now = utc_now()
        pending_query = db.query(AssetUploadIntent).filter(
            AssetUploadIntent.uploaded_by == user_id,
            AssetUploadIntent.status == "awaiting_upload",
            or_(
                AssetUploadIntent.expires_at.is_(None),
                AssetUploadIntent.expires_at > now,
            ),
        )
        pending_count = pending_query.count()
        if pending_count >= self.settings.ASSET_MAX_PENDING_UPLOADS_PER_USER:
            return False, "Too many pending uploads. Confirm or wait for existing uploads to expire."

        asset_count, stored_bytes = db.query(
            func.count(Asset.id), func.coalesce(func.sum(Asset.file_size), 0)
        ).filter(Asset.uploaded_by == user_id).one()
        if asset_count >= self.settings.ASSET_MAX_ASSETS_PER_USER:
            return False, "Asset count quota exceeded. Delete unused assets before uploading."

        pending_bytes = pending_query.with_entities(
            func.coalesce(func.sum(AssetUploadIntent.file_size), 0)
        ).scalar()
        projected_bytes = int(stored_bytes or 0) + int(pending_bytes or 0) + file_size
        if projected_bytes > self.settings.ASSET_MAX_STORAGE_BYTES_PER_USER:
            return False, "Asset storage quota exceeded. Delete unused assets before uploading."

        total_stored_bytes = db.query(
            func.coalesce(func.sum(Asset.file_size), 0)
        ).scalar()
        total_pending_bytes = db.query(
            func.coalesce(func.sum(AssetUploadIntent.file_size), 0)
        ).filter(
            AssetUploadIntent.status == "awaiting_upload",
            or_(
                AssetUploadIntent.expires_at.is_(None),
                AssetUploadIntent.expires_at > now,
            ),
        ).scalar()
        projected_total = (
            int(total_stored_bytes or 0)
            + int(total_pending_bytes or 0)
            + file_size
        )
        if projected_total > self.settings.ASSET_MAX_TOTAL_STORAGE_BYTES:
            return False, "Global asset storage quota exceeded. Delete unused assets before uploading."
        return True, None

    def _validate_file_request(self, request: AssetRequest) -> Tuple[bool, Optional[str]]:
        """Validate file upload request"""
        if not request.filename:
            return False, "Filename is required"

        # Check file extension
        file_ext = os.path.splitext(request.filename.lower())[1]
        if file_ext not in self.allowed_image_types:
            return False, f"File type {file_ext} not allowed. Only raster images are supported"

        expected_content_type = self.allowed_image_types[file_ext][0]
        if request.content_type != expected_content_type:
            return False, f"Content type must be {expected_content_type} for {file_ext} files"

        # Check file size
        if request.file_size is None or request.file_size <= 0:
            return False, "File size must be a positive number"
        if request.file_size > self.max_file_size:
            return False, f"File size {request.file_size} exceeds limit of {self.max_file_size} bytes"

        return True, None

    def _generate_r2_key(self, asset_id: str, filename: str) -> str:
        """Generate the stable content-addressed R2 object key."""
        file_ext = os.path.splitext(filename)[1]
        return f"assets/{asset_id}{file_ext}"

    def _generate_pending_r2_key(self, asset_id: str, filename: str, session_code: str) -> str:
        """Generate a lifecycle-managed key for an unconfirmed upload."""
        file_ext = os.path.splitext(filename)[1]
        return f"pending/{session_code}/{asset_id}{file_ext}"

    def _get_session(self, db, session_code: str) -> Optional[GameSession]:
        return db.query(GameSession).filter(GameSession.session_code == session_code).first()

    def _user_can_access_session(self, db, session: Optional[GameSession], user_id: int) -> bool:
        if session is None:
            return False
        if session.owner_id == user_id:
            return True
        return db.query(GamePlayer).filter(
            GamePlayer.session_id == session.id,
            GamePlayer.user_id == user_id
        ).first() is not None

    def _user_can_upload_to_session(self, session_code: str, user_id: int) -> bool:
        """Authorize uploads from durable session membership and role data."""
        db = SessionLocal()
        try:
            session = self._get_session(db, session_code)
            if session is None:
                return False
            if session.owner_id == user_id:
                return True
            player = db.query(GamePlayer).filter(
                GamePlayer.session_id == session.id,
                GamePlayer.user_id == user_id
            ).first()
            return player is not None and player.role not in {"observer", "spectator"}
        finally:
            db.close()

    def _asset_has_session_access(self, db, asset: Asset, session: Optional[GameSession]) -> bool:
        if session is None:
            return True
        linked = db.query(SessionAsset).filter(
            SessionAsset.session_id == session.id,
            SessionAsset.asset_id == asset.id
        ).first()
        if linked:
            linked.last_accessed = utc_now()
            return True
        return False

    def _lock_quota_state(self, db) -> AssetQuotaState:
        state = (
            db.query(AssetQuotaState)
            .filter(AssetQuotaState.id == 1)
            .with_for_update()
            .one_or_none()
        )
        if state is None:
            state = AssetQuotaState(id=1, updated_at=utc_now())
            db.add(state)
            db.flush()
        state.updated_at = utc_now()
        return state

    def _check_session_link_quota(
        self,
        db,
        session: GameSession,
        user_id: int,
        *,
        include_pending: bool,
    ) -> None:
        total_links = db.query(SessionAsset).filter(
            SessionAsset.session_id == session.id
        ).count()
        actor_links = db.query(SessionAsset).filter(
            SessionAsset.session_id == session.id,
            SessionAsset.added_by == user_id,
        ).count()
        if include_pending:
            now = utc_now()
            pending = db.query(AssetUploadIntent).filter(
                AssetUploadIntent.session_id == session.id,
                AssetUploadIntent.status == "awaiting_upload",
                or_(
                    AssetUploadIntent.expires_at.is_(None),
                    AssetUploadIntent.expires_at > now,
                ),
            )
            total_links += pending.count()
            actor_links += pending.filter(
                AssetUploadIntent.uploaded_by == user_id
            ).count()

        if total_links >= self.settings.ASSET_MAX_LINKS_PER_SESSION:
            raise AssetLinkQuotaExceeded("Session asset link quota exceeded")
        if actor_links >= self.settings.ASSET_MAX_LINKS_PER_ACTOR_PER_SESSION:
            raise AssetLinkQuotaExceeded("Actor session asset link quota exceeded")

    def _link_asset_to_session(self, db, asset: Asset, session: Optional[GameSession],
                               user_id: int, display_name: str) -> None:
        if session is None:
            return
        locked_session = (
            db.query(GameSession)
            .filter(GameSession.id == session.id)
            .with_for_update()
            .one()
        )
        pending_delete = db.query(AssetDeletionJob.id).filter(
            AssetDeletionJob.asset_id == asset.id
        ).first()
        if pending_delete is not None:
            raise RuntimeError("Asset deletion is pending")
        link = db.query(SessionAsset).filter(
            SessionAsset.session_id == session.id,
            SessionAsset.asset_id == asset.id
        ).first()
        if link:
            link.last_accessed = utc_now()
            return
        self._check_session_link_quota(
            db, locked_session, user_id, include_pending=False
        )
        db.add(SessionAsset(
            session_id=session.id,
            asset_id=asset.id,
            display_name=display_name,
            added_by=user_id,
            created_at=utc_now(),
            last_accessed=utc_now()
        ))

    def _link_existing_asset_to_session(self, asset_id: str, session_code: str,
                                        user_id: int, display_name: str) -> Tuple[bool, Optional[str]]:
        db = SessionLocal()
        try:
            asset = (
                db.query(Asset)
                .filter(Asset.r2_asset_id == asset_id)
                .with_for_update()
                .first()
            )
            session = self._get_session(db, session_code)
            if asset is None or session is None:
                return False, "Asset or session not found"
            self._link_asset_to_session(db, asset, session, user_id, display_name)
            db.commit()
            return True, None
        except AssetLinkQuotaExceeded as exc:
            db.rollback()
            logger.warning(
                "Duplicate asset link rejected by quota",
                extra={"event_name": "asset.session_link.quota_rejected"},
            )
            return False, str(exc)
        except Exception:
            db.rollback()
            logger.exception("Duplicate asset session link failed")
            return False, "Unable to link existing asset"
        finally:
            db.close()

    def _make_unique_asset_name(self, db, filename: str, asset_id: str) -> str:
        existing = db.query(Asset).filter(Asset.asset_name == filename).first()
        if not existing:
            return filename
        stem, ext = os.path.splitext(filename)
        return f"{stem}-{asset_id[:8]}{ext}"

    def _record_upload_intent(
        self, metadata: dict, intent_ttl_seconds: int
    ) -> Tuple[bool, Optional[str]]:
        """Atomically reserve one user's durable upload quota."""
        db = SessionLocal()
        try:
            # Use one global lock before the per-user lock so reservations by
            # different users cannot exceed the plan-wide storage ceiling.
            self._lock_quota_state(db)
            user = db.query(User).filter(User.id == metadata["uploaded_by"]).with_for_update().one_or_none()
            if user is None:
                return False, "Upload permission denied"
            session = (
                db.query(GameSession)
                .filter(GameSession.session_code == metadata["session_code"])
                .with_for_update()
                .one_or_none()
            )
            if session is None:
                return False, "Upload permission denied"
            stale = db.query(AssetUploadIntent).filter(
                AssetUploadIntent.asset_id == metadata["asset_id"],
                AssetUploadIntent.session_code == metadata["session_code"],
                AssetUploadIntent.uploaded_by == metadata["uploaded_by"],
                AssetUploadIntent.status == "awaiting_upload"
            ).all()
            for intent in stale:
                intent.status = "superseded"
            db.flush()

            try:
                self._check_session_link_quota(
                    db,
                    session,
                    metadata["uploaded_by"],
                    include_pending=True,
                )
            except AssetLinkQuotaExceeded as exc:
                db.rollback()
                return False, str(exc)

            file_size = metadata.get("file_size")
            if not isinstance(file_size, int) or file_size <= 0:
                return False, "File size must be a positive number"
            within_quota, quota_error = self._check_upload_quota(
                db, metadata["uploaded_by"], file_size
            )
            if not within_quota:
                db.rollback()
                return False, quota_error

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
                created_at=utc_now(),
                expires_at=utc_now() + timedelta(seconds=intent_ttl_seconds),
            ))
            db.commit()
            return True, None
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @track_asset_operation("download_url")
    @_offload_blocking_io
    def request_download_url(self, request: AssetRequest) -> PresignedUrlResponse:
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
            limit_error = self._rate_limit_error(
                self._check_download_rate_limit(request.user_id), "download"
            )
            if limit_error:
                return PresignedUrlResponse(
                    success=False,
                    error=limit_error,
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

            # Keep bearer-style URLs short lived to limit replay exposure.
            expiry_seconds = self.settings.ASSET_DOWNLOAD_URL_TTL_SECONDS
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

            logger.info(
                "Asset download URL generated",
                extra={"event_name": "asset.download_url.generated", "outcome": "success"},
            )

            return PresignedUrlResponse(
                success=True,
                url=presigned_url,
                asset_id=request.asset_id,
                expires_in=expiry_seconds,
                instructions="GET request to download the file"
            )

        except Exception:
            logger.exception("Asset download URL generation failed")
            return PresignedUrlResponse(
                success=False,
                error="Internal server error"
            )

    @track_asset_operation("download_url_by_filename")
    @_offload_blocking_io
    def request_download_url_by_filename(self, filename: str, session_code: str, user_id: int) -> PresignedUrlResponse:
        """Get download URL for an asset by filename (for existing assets)"""
        try:
            # Check permissions
            permissions = self._get_permissions(session_code, user_id)
            if not permissions.can_download:
                return PresignedUrlResponse(
                    success=False,
                    error="Download permission denied"
                )

            limit_error = self._rate_limit_error(
                self._check_download_rate_limit(user_id), "download"
            )
            if limit_error:
                return PresignedUrlResponse(success=False, error=limit_error)

            # Resolve the session-visible display name, which may be shared by
            # assets in other sessions.
            asset_metadata = self._get_asset_from_db(filename, session_code, user_id)
            if not asset_metadata:
                return PresignedUrlResponse(
                    success=False,
                    error="Asset not found",
                    instructions="You may need to upload this asset first"
                )
            # Keep bearer-style URLs short lived to limit replay exposure.
            expiry_seconds = self.settings.ASSET_DOWNLOAD_URL_TTL_SECONDS
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

            logger.info(
                "Existing asset download URL generated",
                extra={"event_name": "asset.download_url.generated", "outcome": "success"},
            )

            return PresignedUrlResponse(
                success=True,
                url=presigned_url,
                asset_id=asset_metadata["asset_id"],
                expires_in=expiry_seconds
            )

        except Exception:
            logger.exception("Asset download URL generation failed")
            return PresignedUrlResponse(
                success=False,
                error="Internal server error"
            )

    @track_asset_operation("confirm_upload")
    @_offload_blocking_io
    def confirm_upload(self, asset_id: str, user_id: int, upload_success: bool = True,
                       error_message: Optional[str] = None) -> bool:
        """Confirm that an upload was completed successfully or failed - CREATES DB ENTRY"""
        try:
            db = SessionLocal()
            try:
                intent = db.query(AssetUploadIntent).filter(
                    AssetUploadIntent.asset_id == asset_id,
                    AssetUploadIntent.uploaded_by == user_id,
                    AssetUploadIntent.status == "awaiting_upload"
                ).order_by(
                    AssetUploadIntent.created_at.desc()
                ).with_for_update().first()

                if not intent:
                    logger.error(f"Asset {asset_id} has no durable pending upload intent")
                    return False

                if intent.expires_at and intent.expires_at < utc_now():
                    intent.status = "expired"
                    intent.error_message = "Upload confirmation arrived after presigned URL expiry"
                    db.commit()
                    logger.error(f"Asset {asset_id} upload intent expired before confirmation")
                    return False

                if not upload_success:
                    intent.status = "failed"
                    intent.error_message = error_message
                    intent.confirmed_at = utc_now()
                    db.commit()
                    logger.warning(
                        "Asset upload reported failed",
                        extra={"event_name": "asset.upload.failed", "outcome": "failure"},
                    )
                    return True

                verified, verification_error, object_found, reject_object = self._verify_uploaded_asset(intent)
                if not verified:
                    if not object_found:
                        intent.status = "missing_object"
                    elif reject_object:
                        intent.status = "verification_failed"
                    else:
                        intent.status = "inspection_failed"
                    intent.error_message = verification_error
                    intent.confirmed_at = utc_now()
                    db.commit()
                    if reject_object:
                        self._delete_rejected_upload(intent.r2_key)
                    logger.error(
                        f"Asset {asset_id} failed R2 verification; refusing DB asset commit: "
                        f"{verification_error}"
                    )
                    return False

                final_r2_key = self._generate_r2_key(intent.asset_id, intent.filename)
                if intent.r2_key != final_r2_key:
                    if not self.r2_manager.promote_file(intent.r2_key, final_r2_key):
                        intent.status = "promotion_failed"
                        intent.error_message = "Verified upload could not be promoted to durable storage"
                        intent.confirmed_at = utc_now()
                        db.commit()
                        return False
                    intent.r2_key = final_r2_key

                confirmed_metadata = {
                    "asset_id": intent.asset_id,
                    "filename": intent.filename,
                    "r2_key": final_r2_key,
                    "session_code": intent.session_code,
                    "uploaded_by": intent.uploaded_by,
                    "file_size": intent.file_size,
                    "content_type": intent.content_type,
                    "xxhash": intent.xxhash,
                    "status": "uploaded",
                    "uploaded_at": utc_now().isoformat()
                }

                save_result = self._save_asset_to_db(confirmed_metadata)
                if not save_result.success:
                    intent.status = (
                        "link_quota_exceeded"
                        if save_result.error and "link quota exceeded" in save_result.error
                        else "metadata_failed"
                    )
                    intent.error_message = save_result.error or "Failed to save asset metadata"
                    intent.confirmed_at = utc_now()
                    db.commit()
                    if save_result.created_asset:
                        self._delete_rejected_upload(final_r2_key)
                    return False

                intent.status = "uploaded"
                intent.confirmed_at = utc_now()
                db.commit()
                logger.info(f"Asset {asset_id} confirmed and saved to database")
                return True
            finally:
                db.close()

        except Exception:
            logger.exception("Asset upload confirmation failed")
            return False

    def get_session_assets(self, session_code: str, user_id: int) -> List[dict]:
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
                if not self._user_can_access_session(db, session, user_id):
                    logger.warning(f"User {user_id} cannot list assets for session {session_code}")
                    return []

                linked_assets = (
                    db.query(SessionAsset, Asset)
                    .join(Asset, SessionAsset.asset_id == Asset.id)
                    .filter(SessionAsset.session_id == session.id)
                    .order_by(SessionAsset.created_at.desc())
                    .all()
                )

                result = []
                for link, asset in linked_assets:
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

                logger.info(f"Found {len(result)} assets in session {session_code}")
                return result

            finally:
                db.close()

        except Exception:
            logger.exception("Session asset listing failed")
            return []
        return []

    @_offload_blocking_io
    def request_session_assets(self, session_code: str, user_id: int) -> List[dict]:
        """Return session assets without blocking an async protocol handler."""
        return self.get_session_assets(session_code, user_id)

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
                AssetUploadIntent.status.in_([
                    "failed", "missing_object", "verification_failed", "inspection_failed",
                    "promotion_failed", "metadata_failed", "expired"
                ])
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

    @track_asset_operation("upload_url")
    @_offload_blocking_io
    def request_upload_url_with_hash(self, request: AssetRequest, file_xxhash: str) -> PresignedUrlResponse:
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

            if not self._user_can_upload_to_session(request.session_code, request.user_id):
                return PresignedUrlResponse(
                    success=False,
                    error="Upload permission denied"
                )

            # Check permissions
            permissions = self._get_permissions(request.session_code, request.user_id)
            if not permissions.can_upload:
                return PresignedUrlResponse(
                    success=False,
                    error="Upload permission denied"
                )

            # Check rate limits
            limit_error = self._rate_limit_error(
                self._check_upload_rate_limit(request.user_id), "upload"
            )
            if limit_error:
                return PresignedUrlResponse(
                    success=False,
                    error=limit_error,
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
                logger.info(
                    "Duplicate asset content detected",
                    extra={"event_name": "asset.duplicate.detected"},
                )
                linked, link_error = self._link_existing_asset_to_session(
                    existing_asset["asset_id"],
                    request.session_code,
                    request.user_id,
                    request.filename
                )
                if not linked:
                    return PresignedUrlResponse(success=False, error=link_error)
                return PresignedUrlResponse(
                    success=True,
                    asset_id=existing_asset["asset_id"],
                    url=None,  # No upload needed
                    instructions="This file has already been uploaded. Using existing asset."
                )

            # Use the asset_id from the request (already validated above)
            asset_id = request.asset_id
            r2_key = self._generate_pending_r2_key(asset_id, request.filename, request.session_code)

            # Generate a short-lived presigned URL with xxHash metadata.
            expiry_seconds = self.settings.ASSET_UPLOAD_URL_TTL_SECONDS
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
                "created_at": utc_now().isoformat(),
                "presigned_url_generated_at": utc_now().isoformat(),
                "status": "awaiting_upload"
            }

            reserved, quota_error = self._record_upload_intent(
                pending_metadata,
                self.settings.ASSET_UPLOAD_INTENT_TTL_SECONDS,
            )
            if not reserved:
                return PresignedUrlResponse(success=False, error=quota_error)

            logger.info(
                "Asset upload URL generated",
                extra={"event_name": "asset.upload_url.generated", "outcome": "success"},
            )

            return PresignedUrlResponse(
                success=True,
                url=presigned_url,
                asset_id=asset_id,
                expires_in=expiry_seconds,
                required_xxhash=file_xxhash,
                instructions="PUT the file with x-amz-meta-xxhash header containing the xxHash"
            )

        except Exception:
            logger.exception("Asset upload URL generation failed")
            return PresignedUrlResponse(
                success=False,
                error="Internal server error"
            )

    def _save_asset_to_db(self, asset_data: dict) -> AssetSaveResult:
        """Save asset metadata to database including xxHash"""
        created_asset = False
        try:
            db = SessionLocal()
            try:
                session = None
                if asset_data.get("session_code"):
                    session = db.query(GameSession).filter(GameSession.session_code == asset_data["session_code"]).first()

                # Check if asset already exists by xxHash (duplicate detection)
                if asset_data.get("xxhash"):
                    existing_asset = (
                        db.query(Asset)
                        .filter(Asset.xxhash == asset_data["xxhash"])
                        .with_for_update()
                        .first()
                    )
                    if existing_asset:
                        self._link_asset_to_session(
                            db,
                            existing_asset,
                            session,
                            asset_data["uploaded_by"],
                            asset_data["filename"]
                        )
                        db.commit()
                        logger.info(
                            "Existing asset linked to session",
                            extra={"event_name": "asset.session_link.created", "outcome": "success"},
                        )
                        return AssetSaveResult(success=True)

                stored_name = self._make_unique_asset_name(db, asset_data["filename"], asset_data["asset_id"])

                # Create new asset record
                new_asset = Asset(
                    asset_name=stored_name,
                    r2_asset_id=asset_data["asset_id"],
                    content_type=asset_data.get("content_type") or "application/octet-stream",
                    file_size=asset_data["file_size"] or 0,

                    xxhash=asset_data.get("xxhash", ""),
                    uploaded_by=asset_data["uploaded_by"],
                    r2_key=asset_data["r2_key"],
                    r2_bucket=Settings().r2_bucket_name or "default",
                    created_at=utc_now(),
                    last_accessed=utc_now()
                )

                db.add(new_asset)
                db.flush()
                created_asset = True
                self._link_asset_to_session(db, new_asset, session, asset_data["uploaded_by"], asset_data["filename"])
                db.commit()
                logger.info(
                    "Asset metadata persisted",
                    extra={"event_name": "asset.metadata.persisted", "outcome": "success"},
                )
                return AssetSaveResult(success=True, created_asset=True)

            finally:
                db.close()

        except AssetLinkQuotaExceeded as exc:
            logger.warning(
                "Asset metadata rejected by link quota",
                extra={"event_name": "asset.session_link.quota_rejected"},
            )
            return AssetSaveResult(
                success=False,
                error=str(exc),
                created_asset=created_asset,
            )
        except Exception:
            logger.exception("Asset metadata persistence failed")
            return AssetSaveResult(
                success=False,
                error="Failed to save asset metadata",
                created_asset=created_asset,
            )

    def _get_asset_from_db(
        self,
        display_name: str,
        session_code: str,
        user_id: int,
    ) -> Optional[dict]:
        """Get asset metadata by its session-scoped display name."""
        try:
            db = SessionLocal()
            try:
                session = self._get_session(db, session_code)
                if session is None or not self._user_can_access_session(
                    db, session, user_id
                ):
                    return None
                matches = (
                    db.query(Asset)
                    .join(SessionAsset, SessionAsset.asset_id == Asset.id)
                    .filter(
                        SessionAsset.session_id == session.id,
                        SessionAsset.display_name == display_name,
                    )
                    .limit(2)
                    .all()
                )
                if len(matches) != 1:
                    return None
                asset = matches[0]
                if asset:
                    # Update last accessed time
                    db.query(Asset).filter(Asset.id == asset.id).update(
                        {Asset.last_accessed: utc_now()}
                    )
                    db.commit()

                    return {
                        "asset_id": asset.r2_asset_id,
                        "filename": asset.asset_name,
                        "r2_key": asset.r2_key,
                        "content_type": asset.content_type,
                        "file_size": asset.file_size,
                        "uploaded_by": asset.uploaded_by,
                        "session_id": session.id,
                        "session_code": session_code,
                        "created_at": (asset.created_at.isoformat() if asset.created_at else None),
                        "last_accessed": (asset.last_accessed.isoformat() if asset.last_accessed else None)
                    }
                return None

            finally:
                db.close()

        except Exception:
            logger.exception("Asset lookup failed")
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
                    session = self._get_session(db, session_code) if session_code else None
                    if user_id is not None and not self._user_can_access_session(db, session, user_id):
                        logger.warning(f"User {user_id} is not a member of session {session_code}")
                        return None
                    if session_code and not self._asset_has_session_access(db, asset, session):
                        logger.warning(f"Asset {asset_id} is not available in session {session_code}")
                        return None

                    # Update last accessed time
                    db.query(Asset).filter(Asset.r2_asset_id == asset_id).update(
                        {Asset.last_accessed: utc_now()}
                    )
                    db.commit()

                    return {
                        "asset_id": asset.r2_asset_id,
                        "filename": asset.asset_name,
                        "r2_key": asset.r2_key,
                        "content_type": asset.content_type,
                        "file_size": asset.file_size,
                        "uploaded_by": asset.uploaded_by,
                        "session_id": session.id if session else None,
                        "session_code": session_code,
                        "xxhash": asset.xxhash,
                        "created_at": (asset.created_at.isoformat() if asset.created_at else None),
                        "last_accessed": (asset.last_accessed.isoformat() if asset.last_accessed else None)
                    }
                return None

            finally:
                db.close()

        except Exception:
            logger.exception("Asset ID lookup failed")
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
                        "created_at": (asset.created_at.isoformat() if asset.created_at else None)
                    }
                return None

            finally:
                db.close()

        except Exception:
            logger.exception("Asset hash lookup failed")
            return None

    def _verify_asset_in_r2(self, r2_key: str) -> bool:
        """Verify if asset exists in R2 storage"""
        try:
            # Use R2Manager to check if object exists
            exists = self.r2_manager.object_exists(r2_key)
            return exists
        except Exception:
            logger.exception("R2 asset verification failed")
            return False

    def _verify_uploaded_asset(self, intent: AssetUploadIntent) -> Tuple[bool, str, bool, bool]:
        """Verify an uploaded object against its signed durable intent."""
        try:
            object_info = self.r2_manager.get_object_info(intent.r2_key)
        except Exception:
            logger.exception("R2 upload metadata read failed")
            return False, "Unable to read R2 object metadata", False, False

        if not object_info:
            return False, "R2 object did not exist at confirmation time", False, False

        actual_size = object_info.get("size")
        if intent.file_size is not None and actual_size != intent.file_size:
            return False, f"Uploaded size {actual_size} did not match expected size {intent.file_size}", True, True
        if actual_size is None or actual_size <= 0 or actual_size > self.max_file_size:
            return False, f"Uploaded size {actual_size} is outside the allowed range", True, True

        actual_content_type = (object_info.get("content_type") or "").split(";", 1)[0].strip().lower()
        expected_content_type = (intent.content_type or "").strip().lower()
        if not expected_content_type or actual_content_type != expected_content_type:
            return False, (
                f"Uploaded content type {actual_content_type or 'missing'} did not match "
                f"expected content type {expected_content_type or 'missing'}"
            ), True, True

        actual_xxhash = (object_info.get("metadata") or {}).get("xxhash")
        if not intent.xxhash or actual_xxhash != intent.xxhash:
            return False, "Uploaded xxHash metadata did not match the upload intent", True, True

        try:
            object_bytes = self.r2_manager.get_object_bytes(intent.r2_key, self.max_file_size)
        except Exception:
            logger.exception("R2 object inspection failed")
            return False, "Unable to inspect uploaded image bytes", True, False

        calculated_xxhash = xxhash.xxh64(object_bytes).hexdigest()
        if calculated_xxhash != intent.xxhash:
            return False, "Uploaded content hash did not match the upload intent", True, True

        file_ext = os.path.splitext(intent.filename.lower())[1]
        expected_format = self.allowed_image_types.get(file_ext, (None, None))[1]
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(object_bytes)) as image:
                    if image.format != expected_format:
                        return False, (
                            f"Decoded image format {image.format or 'unknown'} did not match "
                            f"expected format {expected_format or 'unknown'}"
                        ), True, True
                    image.verify()
                with Image.open(BytesIO(object_bytes)) as image:
                    image.load()
        except (
            UnidentifiedImageError,
            OSError,
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
        ):
            return False, "Uploaded image bytes failed validation", True, True

        return True, "", True, False

    def _delete_rejected_upload(self, r2_key: str) -> None:
        try:
            if not self.r2_manager.delete_file(r2_key):
                logger.error("Rejected R2 upload cleanup failed")
        except Exception:
            logger.exception("Rejected R2 upload cleanup failed")

# Global instance
_server_asset_manager = None

def get_server_asset_manager() -> ServerAssetManager:
    """Get global server asset manager instance"""
    global _server_asset_manager
    if _server_asset_manager is None:
        _server_asset_manager = ServerAssetManager()
    return _server_asset_manager
