# pyright: reportAttributeAccessIssue=false

import asyncio
import base64
import threading
import time
from datetime import timedelta
from types import SimpleNamespace

import pytest
import xxhash
from core_table.protocol import Message, MessageType
from database import crud, models, schemas
from service import asset_deletion_service as deletion_module
from service import asset_manager as asset_manager_module
from service import asset_upload_cleanup_service as upload_cleanup_module
from service.asset_deletion_service import process_asset_deletion_job
from service.asset_manager import AssetRequest, ServerAssetManager
from service.asset_rate_limiter import AssetRateLimitDecision
from service.asset_upload_cleanup_service import process_pending_upload_cleanups
from service.protocol import assets as asset_protocol_module
from service.protocol.assets import _AssetsMixin
from sqlalchemy.orm import sessionmaker

VALID_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)
VALID_XXHASH = xxhash.xxh64(VALID_PNG).hexdigest()


class FakeR2Manager:
    def __init__(
        self,
        object_exists=True,
        *,
        object_data=VALID_PNG,
        size=None,
        content_type="image/png",
        xxhash=VALID_XXHASH,
        delete_success=True,
        promote_success=True,
        upload_link_success=True,
    ):
        self._object_exists = object_exists
        self.object_data = object_data
        self.size = len(object_data) if size is None else size
        self.content_type = content_type
        self.xxhash = xxhash
        self.delete_success = delete_success
        self.promote_success = promote_success
        self.upload_link_success = upload_link_success
        self.deleted_keys = []
        self.promotions = []
        self.upload_expirations = []
        self.download_expirations = []

    def is_r2_configured(self):
        return True

    def generate_presigned_upload_url(self, file_key, xxhash, content_type=None, expiration=3600):
        self.upload_expirations.append(expiration)
        if not self.upload_link_success:
            return None
        return f"https://r2.example/{file_key}?xxhash={xxhash}&content_type={content_type}"

    def generate_presigned_url(self, file_key, method="GET", expiration=3600):
        self.download_expirations.append(expiration)
        return f"https://r2.example/{method.lower()}/{file_key}"

    def object_exists(self, file_key):
        return self._object_exists

    def get_object_info(self, file_key):
        if not self._object_exists:
            return None
        return {
            "key": file_key,
            "size": self.size,
            "content_type": self.content_type,
            "metadata": {"xxhash": self.xxhash},
        }

    def get_object_bytes(self, file_key, max_bytes):
        if len(self.object_data) > max_bytes:
            raise ValueError("object too large")
        return self.object_data

    def delete_file(self, file_key):
        self.deleted_keys.append(file_key)
        return self.delete_success

    def promote_file(self, source_key, destination_key):
        self.promotions.append((source_key, destination_key))
        return self.promote_success


class AssetProtocolStub(_AssetsMixin):
    def __init__(self, user_id, session_code, username="asset-user"):
        self.user_id = user_id
        self.session_code = session_code
        self.username = username

    def _get_user_id(self, msg, client_id=None):
        return self.user_id

    def _get_session_code(self, msg=None):
        return self.session_code

    def _get_client_info(self, client_id):
        return {"user_id": self.user_id, "username": self.username}


def _manager(monkeypatch, test_db, object_exists=True, **r2_kwargs):
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=test_db.get_bind())
    monkeypatch.setattr(asset_manager_module, "SessionLocal", testing_session)
    monkeypatch.setattr(upload_cleanup_module, "SessionLocal", testing_session)
    manager = ServerAssetManager()
    manager.r2_manager = FakeR2Manager(object_exists=object_exists, **r2_kwargs)
    return manager


async def _request_upload(
    manager, test_user, test_game_session, xxhash=VALID_XXHASH, file_size=len(VALID_PNG)
):
    return await manager.request_upload_url_with_hash(
        AssetRequest(
            user_id=test_user.id,
            username=test_user.username,
            session_code=test_game_session.session_code,
            asset_id=xxhash[:16],
            filename="map.png",
            file_size=file_size,
            content_type="image/png",
            file_xxhash=xxhash,
        ),
        xxhash,
    )


async def test_upload_confirmation_creates_asset_and_session_link(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)

    response = await _request_upload(manager, test_user, test_game_session)

    assert response.success is True
    assert response.url
    assert response.expires_in == 900
    assert manager.r2_manager.upload_expirations == [900]
    intent = test_db.query(models.AssetUploadIntent).one()
    assert intent.status == "awaiting_upload"
    assert (intent.expires_at - intent.created_at).total_seconds() == pytest.approx(
        1_800,
        abs=1,
    )

    confirmed = await manager.confirm_upload(response.asset_id, test_user.id, upload_success=True)

    assert confirmed is True
    asset = test_db.query(models.Asset).one()
    assert asset.r2_asset_id == response.asset_id
    assert asset.xxhash == VALID_XXHASH
    assert asset.r2_key == f"assets/{VALID_XXHASH[:16]}.png"
    assert manager.r2_manager.promotions == [
        (
            f"pending/{test_game_session.session_code}/{VALID_XXHASH[:16]}.png",
            f"assets/{VALID_XXHASH[:16]}.png",
        )
    ]
    link = test_db.query(models.SessionAsset).one()
    assert link.asset_id == asset.id
    assert link.session_id == test_game_session.id
    assert link.display_name == "map.png"

    assets = manager.get_session_assets(test_game_session.session_code, test_user.id)
    assert assets[0]["asset_id"] == response.asset_id
    assert assets[0]["filename"] == "map.png"

    download = await manager.request_download_url(AssetRequest(
        user_id=test_user.id,
        username=test_user.username,
        session_code=test_game_session.session_code,
        asset_id=response.asset_id,
    ))
    assert download.success is True
    assert download.expires_in == 300
    assert manager.r2_manager.download_expirations == [300]


async def test_upload_confirmation_fails_without_r2_object(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db, object_exists=False)
    response = await _request_upload(manager, test_user, test_game_session)

    confirmed = await manager.confirm_upload(response.asset_id, test_user.id, upload_success=True)

    assert confirmed is False
    assert test_db.query(models.Asset).count() == 0
    intent = test_db.query(models.AssetUploadIntent).one()
    assert intent.status == "missing_object"


async def test_upload_link_failure_releases_reserved_intent(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db, upload_link_success=False)

    response = await _request_upload(manager, test_user, test_game_session)

    assert response.success is False
    intent = test_db.query(models.AssetUploadIntent).one()
    assert intent.status == "link_failed"
    assert intent.error_message == "Asset upload link generation failed"


async def test_upload_link_exception_releases_reserved_intent(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)

    def raise_link_error(*args, **kwargs):
        raise RuntimeError("signer unavailable")

    monkeypatch.setattr(manager.asset_links, "generate_upload_url", raise_link_error)

    response = await _request_upload(manager, test_user, test_game_session)

    assert response.success is False
    assert response.error == "Internal server error"
    intent = test_db.query(models.AssetUploadIntent).one()
    assert intent.status == "link_failed"
    assert intent.error_message == "Asset upload link generation failed"


async def test_upload_confirmation_rejects_object_metadata_mismatch(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db, content_type="text/plain")
    response = await _request_upload(manager, test_user, test_game_session)

    confirmed = await manager.confirm_upload(response.asset_id, test_user.id, upload_success=True)

    assert confirmed is False
    assert test_db.query(models.Asset).count() == 0
    intent = test_db.query(models.AssetUploadIntent).one()
    assert intent.status == "cleanup_pending"
    assert "content type" in intent.error_message
    assert manager.r2_manager.deleted_keys == []


async def test_upload_confirmation_rejects_spoofed_image_bytes(
    monkeypatch, test_db, test_user, test_game_session
):
    spoofed = b"not really a png"
    spoofed_hash = xxhash.xxh64(spoofed).hexdigest()
    manager = _manager(
        monkeypatch,
        test_db,
        object_data=spoofed,
        xxhash=spoofed_hash,
    )
    response = await _request_upload(
        manager,
        test_user,
        test_game_session,
        xxhash=spoofed_hash,
        file_size=len(spoofed),
    )

    confirmed = await manager.confirm_upload(response.asset_id, test_user.id, upload_success=True)

    assert confirmed is False
    intent = test_db.query(models.AssetUploadIntent).one()
    assert intent.status == "cleanup_pending"
    assert "image bytes failed validation" in intent.error_message
    assert manager.r2_manager.deleted_keys == []
    assert intent.r2_key.startswith("pending/")


async def test_upload_confirmation_keeps_pending_state_when_promotion_fails(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db, promote_success=False)
    response = await _request_upload(manager, test_user, test_game_session)

    confirmed = await manager.confirm_upload(response.asset_id, test_user.id, upload_success=True)

    assert confirmed is False
    assert test_db.query(models.Asset).count() == 0
    intent = test_db.query(models.AssetUploadIntent).one()
    assert intent.status == "cleanup_pending"
    assert intent.r2_key.startswith("pending/")


async def test_upload_rejects_svg_before_presigning(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    response = await manager.request_upload_url_with_hash(
        AssetRequest(
            user_id=test_user.id,
            username=test_user.username,
            session_code=test_game_session.session_code,
            asset_id=VALID_XXHASH[:16],
            filename="map.svg",
            file_size=100,
            content_type="image/svg+xml",
            file_xxhash=VALID_XXHASH,
        ),
        VALID_XXHASH,
    )

    assert response.success is False
    assert response.error is not None
    assert "Only raster images" in response.error


async def test_asset_upload_uses_authenticated_connection_context(monkeypatch):
    captured = {}

    class CapturingManager:
        async def request_upload_url_with_hash(self, request, file_xxhash):
            captured["request"] = request
            captured["xxhash"] = file_xxhash
            return SimpleNamespace(
                success=False,
                error="captured",
                asset_id=request.asset_id,
                instructions=None,
            )

    monkeypatch.setattr(
        asset_protocol_module, "get_server_asset_manager", lambda: CapturingManager()
    )
    protocol = AssetProtocolStub(42, "AUTH-SESSION", "authenticated-user")

    await protocol.handle_asset_upload_request(
        Message(MessageType.ASSET_UPLOAD_REQUEST, {
            "filename": "map.png",
            "file_size": len(VALID_PNG),
            "content_type": "image/png",
            "asset_id": VALID_XXHASH[:16],
            "xxhash": VALID_XXHASH,
            "session_code": "SPOOFED-SESSION",
            "user_id": 999,
            "username": "spoofed-user",
        }),
        "client-1",
    )

    request = captured["request"]
    assert request.session_code == "AUTH-SESSION"
    assert request.user_id == 42
    assert request.username == "authenticated-user"


async def test_asset_upload_fails_closed_without_connection_identity(monkeypatch):
    manager = SimpleNamespace(request_upload_url_with_hash=lambda *_args: None)
    monkeypatch.setattr(
        asset_protocol_module, "get_server_asset_manager", lambda: manager
    )
    protocol = AssetProtocolStub(None, "AUTH-SESSION")

    response = await protocol.handle_asset_upload_request(
        Message(MessageType.ASSET_UPLOAD_REQUEST, {
            "filename": "map.png",
            "xxhash": VALID_XXHASH,
            "user_id": 999,
        }),
        "client-1",
    )

    assert response.type == MessageType.ERROR
    assert response.data["error"] == "Authentication and session context required"


async def test_asset_storage_io_does_not_block_event_loop(monkeypatch, test_db):
    manager = _manager(monkeypatch, test_db)

    def slow_membership_check(*_args):
        time.sleep(0.05)
        return False

    monkeypatch.setattr(manager, "_user_can_upload_to_session", slow_membership_check)
    marker = asyncio.Event()
    asyncio.get_running_loop().call_later(0.01, marker.set)

    result = await manager.request_upload_url_with_hash(
        AssetRequest(
            user_id=1,
            username="user",
            session_code="AUTH",
            asset_id=VALID_XXHASH[:16],
            filename="map.png",
            file_size=len(VALID_PNG),
            content_type="image/png",
            file_xxhash=VALID_XXHASH,
        ),
        VALID_XXHASH,
    )

    assert result.success is False
    assert marker.is_set(), "synchronous asset storage work blocked the event loop"


def test_upload_rate_limit_is_per_authenticated_user(
    monkeypatch, test_db, test_user
):
    manager = _manager(monkeypatch, test_db)
    manager.settings.ASSET_UPLOADS_PER_MINUTE = 2
    manager.settings.ASSET_UPLOADS_PER_HOUR = 3
    other_user = crud.create_user(
        test_db,
        schemas.UserCreate(
            username="rate-limit-other",
            email="rate-limit-other@example.com",
            password="Pass1234",
        ),
    )

    assert manager._check_upload_rate_limit(test_user.id) == AssetRateLimitDecision.ALLOWED
    assert manager._check_upload_rate_limit(test_user.id) == AssetRateLimitDecision.ALLOWED
    assert manager._check_upload_rate_limit(test_user.id) == AssetRateLimitDecision.LIMITED
    assert manager._check_upload_rate_limit(other_user.id) == AssetRateLimitDecision.ALLOWED


async def test_upload_rejects_excess_pending_intents(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    manager.settings.ASSET_MAX_PENDING_UPLOADS_PER_USER = 1
    first = await _request_upload(manager, test_user, test_game_session)

    second = await _request_upload(
        manager, test_user, test_game_session, xxhash="0" * 16
    )

    assert first.success is True
    assert second.success is False
    assert second.error is not None
    assert "pending uploads" in second.error


async def test_upload_counts_pending_bytes_toward_user_storage_quota(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    manager.settings.ASSET_MAX_STORAGE_BYTES_PER_USER = len(VALID_PNG)
    first = await _request_upload(manager, test_user, test_game_session)

    second = await _request_upload(
        manager, test_user, test_game_session, xxhash="1" * 16
    )

    assert first.success is True
    assert second.success is False
    assert second.error is not None
    assert "storage quota" in second.error


async def test_expired_upload_bytes_remain_reserved_until_r2_cleanup_succeeds(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db, delete_success=False)
    manager.settings.ASSET_MAX_STORAGE_BYTES_PER_USER = len(VALID_PNG)
    first = await _request_upload(manager, test_user, test_game_session)
    intent = test_db.query(models.AssetUploadIntent).one()
    intent.expires_at = upload_cleanup_module.utc_now() - timedelta(hours=2)
    test_db.commit()

    before_cleanup = await _request_upload(
        manager, test_user, test_game_session, xxhash="1" * 16
    )
    assert first.success is True
    assert before_cleanup.success is False
    assert "storage quota" in (before_cleanup.error or "")

    assert process_pending_upload_cleanups(manager.r2_manager) == 0
    test_db.expire_all()
    intent = test_db.query(models.AssetUploadIntent).one()
    assert intent.status == "cleanup_retry"

    during_retry = await _request_upload(
        manager, test_user, test_game_session, xxhash="1" * 16
    )
    assert during_retry.success is False
    assert "storage quota" in (during_retry.error or "")

    manager.r2_manager.delete_success = True
    intent.cleanup_next_attempt_at = upload_cleanup_module.utc_now()
    test_db.commit()
    assert process_pending_upload_cleanups(manager.r2_manager) == 1
    test_db.expire_all()
    assert test_db.query(models.AssetUploadIntent).one().status == "cleaned"

    after_cleanup = await _request_upload(
        manager, test_user, test_game_session, xxhash="1" * 16
    )
    assert after_cleanup.success is True


async def test_upload_counts_all_users_toward_global_storage_quota(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    manager.settings.ASSET_MAX_TOTAL_STORAGE_BYTES = len(VALID_PNG)
    first = await _request_upload(manager, test_user, test_game_session)
    other_user = crud.create_user(
        test_db,
        schemas.UserCreate(
            username="global-quota-user",
            email="global-quota@example.com",
            password="Pass1234",
        ),
    )
    other_session = crud.create_game_session(
        test_db,
        schemas.GameSessionCreate(name="Global Quota Session"),
        other_user.id,
        "GLOBAL1",
    )

    second = await _request_upload(
        manager,
        other_user,
        other_session,
        xxhash="3" * 16,
    )

    assert first.success is True
    assert second.success is False
    assert second.error is not None
    assert "Global asset storage quota" in second.error


async def test_pending_upload_reserves_session_link_quota(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    manager.settings.ASSET_MAX_LINKS_PER_SESSION = 1
    manager.settings.ASSET_MAX_LINKS_PER_ACTOR_PER_SESSION = 1

    first = await _request_upload(manager, test_user, test_game_session)
    second = await _request_upload(
        manager,
        test_user,
        test_game_session,
        xxhash="4" * 16,
    )

    assert first.success is True
    assert second.success is False
    assert second.error == "Session asset link quota exceeded"


async def test_pending_upload_reserves_actor_link_quota(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    manager.settings.ASSET_MAX_LINKS_PER_SESSION = 2
    manager.settings.ASSET_MAX_LINKS_PER_ACTOR_PER_SESSION = 1

    first = await _request_upload(manager, test_user, test_game_session)
    second = await _request_upload(
        manager,
        test_user,
        test_game_session,
        xxhash="5" * 16,
    )

    assert first.success is True
    assert second.success is False
    assert second.error == "Actor session asset link quota exceeded"


async def test_upload_rejects_new_object_after_user_asset_count_quota(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    first = await _request_upload(manager, test_user, test_game_session)
    assert await manager.confirm_upload(first.asset_id, test_user.id, upload_success=True)
    manager.settings.ASSET_MAX_ASSETS_PER_USER = 1

    second = await _request_upload(
        manager, test_user, test_game_session, xxhash="2" * 16
    )

    assert second.success is False
    assert second.error is not None
    assert "count quota" in second.error


async def test_duplicate_link_is_idempotent_when_session_quota_is_full(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    manager.settings.ASSET_MAX_LINKS_PER_SESSION = 1
    manager.settings.ASSET_MAX_LINKS_PER_ACTOR_PER_SESSION = 1
    asset = models.Asset(
        asset_name="existing.png",
        r2_asset_id="existing-id",
        content_type="image/png",
        file_size=len(VALID_PNG),
        xxhash="existing-hash",
        uploaded_by=test_user.id,
        r2_key="assets/existing.png",
        r2_bucket="assets",
    )
    test_db.add(asset)
    test_db.commit()

    first = manager._link_existing_asset_to_session(
        asset.r2_asset_id,
        test_game_session.session_code,
        test_user.id,
        "existing.png",
    )
    repeated = manager._link_existing_asset_to_session(
        asset.r2_asset_id,
        test_game_session.session_code,
        test_user.id,
        "renamed.png",
    )

    assert first == (True, None)
    assert repeated == (True, None)
    assert test_db.query(models.SessionAsset).count() == 1


async def test_final_link_quota_failure_removes_new_r2_object(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    manager.settings.ASSET_MAX_LINKS_PER_SESSION = 1
    manager.settings.ASSET_MAX_LINKS_PER_ACTOR_PER_SESSION = 1
    response = await _request_upload(manager, test_user, test_game_session)
    assert response.success is True

    blocker = models.Asset(
        asset_name="blocker.png",
        r2_asset_id="blocker-id",
        content_type="image/png",
        file_size=1,
        xxhash="blocker-hash",
        uploaded_by=test_user.id,
        r2_key="assets/blocker.png",
        r2_bucket="assets",
    )
    test_db.add(blocker)
    test_db.flush()
    test_db.add(models.SessionAsset(
        session_id=test_game_session.id,
        asset_id=blocker.id,
        display_name="blocker.png",
        added_by=test_user.id,
    ))
    test_db.commit()

    confirmed = await manager.confirm_upload(
        response.asset_id,
        test_user.id,
        upload_success=True,
    )

    assert confirmed is False
    test_db.expire_all()
    intent = test_db.query(models.AssetUploadIntent).one()
    assert intent.status == "cleanup_pending"
    assert intent.error_message == "Session asset link quota exceeded"
    assert test_db.query(models.Asset).count() == 1
    assert manager.r2_manager.deleted_keys == []


async def test_upload_requires_durable_session_membership(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    outsider = crud.create_user(
        test_db,
        schemas.UserCreate(username="outsider", email="outsider@example.com", password="Pass1234"),
    )

    response = await _request_upload(manager, outsider, test_game_session)

    assert response.success is False
    assert response.error == "Upload permission denied"
    assert test_db.query(models.AssetUploadIntent).count() == 0


async def test_delete_unlinks_and_retries_when_storage_delete_fails(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db, delete_success=False)
    response = await _request_upload(manager, test_user, test_game_session)
    assert await manager.confirm_upload(response.asset_id, test_user.id, upload_success=True)

    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=test_db.get_bind())
    monkeypatch.setattr(deletion_module, "SessionLocal", testing_session)
    monkeypatch.setattr(asset_protocol_module, "get_server_asset_manager", lambda: manager)
    protocol = AssetProtocolStub(test_user.id, test_game_session.session_code)

    result = await protocol.handle_asset_delete_request(
        Message(
            MessageType.ASSET_DELETE_REQUEST,
            {"asset_id": response.asset_id, "session_code": test_game_session.session_code},
        ),
        "client-1",
    )

    assert result.type == MessageType.SUCCESS
    assert result.data["deletion_queued"] is True
    assert manager.r2_manager.deleted_keys == []
    assert test_db.query(models.Asset).count() == 1
    assert test_db.query(models.SessionAsset).count() == 0
    job = test_db.query(models.AssetDeletionJob).one()

    cleanup = process_asset_deletion_job(job.id, manager.r2_manager)

    assert cleanup.completed is False
    assert cleanup.retry_scheduled is True
    test_db.expire_all()
    job = test_db.query(models.AssetDeletionJob).one()
    assert job.status == "retry"
    assert job.attempts == 1
    assert test_db.query(models.Asset).count() == 1
    actions = {
        audit.action for audit in test_db.query(models.AuditLog).all()
    }
    assert {
        "asset.unlink",
        "asset.deletion.queued",
        "asset.deletion.retry",
    } <= actions

    manager.r2_manager.delete_success = True
    job.next_attempt_at = deletion_module.utc_now()
    test_db.commit()
    completed = process_asset_deletion_job(job.id, manager.r2_manager)
    repeated = process_asset_deletion_job(job.id, manager.r2_manager)

    assert completed.completed is True
    assert repeated.completed is True
    test_db.expire_all()
    assert test_db.query(models.AssetDeletionJob).count() == 0
    assert test_db.query(models.Asset).count() == 0
    assert len(manager.r2_manager.deleted_keys) == 2


async def test_delete_commit_failure_never_calls_storage(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    response = await _request_upload(manager, test_user, test_game_session)
    assert await manager.confirm_upload(response.asset_id, test_user.id, upload_success=True)
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=test_db.get_bind())

    def failing_session():
        db = testing_session()

        def fail_commit():
            raise RuntimeError("commit failed")

        db.commit = fail_commit
        return db

    monkeypatch.setattr(deletion_module, "SessionLocal", failing_session)
    protocol = AssetProtocolStub(test_user.id, test_game_session.session_code)

    result = await protocol.handle_asset_delete_request(
        Message(MessageType.ASSET_DELETE_REQUEST, {"asset_id": response.asset_id}),
        "client-1",
    )

    assert result.type == MessageType.ERROR
    assert manager.r2_manager.deleted_keys == []
    test_db.expire_all()
    assert test_db.query(models.Asset).count() == 1
    assert test_db.query(models.SessionAsset).count() == 1
    assert test_db.query(models.AssetDeletionJob).count() == 0


async def test_delete_preserves_object_with_another_session_link(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    response = await _request_upload(manager, test_user, test_game_session)
    assert await manager.confirm_upload(response.asset_id, test_user.id, upload_success=True)
    asset = test_db.query(models.Asset).one()
    other_session = crud.create_game_session(
        test_db,
        schemas.GameSessionCreate(name="Other"),
        test_user.id,
        "OTHER2",
    )
    test_db.add(models.SessionAsset(
        session_id=other_session.id,
        asset_id=asset.id,
        display_name="map.png",
        added_by=test_user.id,
    ))
    test_db.commit()
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=test_db.get_bind())
    monkeypatch.setattr(deletion_module, "SessionLocal", testing_session)
    protocol = AssetProtocolStub(test_user.id, test_game_session.session_code)

    result = await protocol.handle_asset_delete_request(
        Message(MessageType.ASSET_DELETE_REQUEST, {"asset_id": response.asset_id}),
        "client-1",
    )

    assert result.type == MessageType.SUCCESS
    assert result.data["deletion_queued"] is False
    test_db.expire_all()
    assert test_db.query(models.Asset).count() == 1
    assert test_db.query(models.SessionAsset).count() == 1
    assert test_db.query(models.AssetDeletionJob).count() == 0
    assert manager.r2_manager.deleted_keys == []


async def test_asset_unlink_does_not_block_event_loop(monkeypatch):
    started = threading.Event()
    release = threading.Event()

    def slow_unlink(**_kwargs):
        started.set()
        release.wait(timeout=2)
        return deletion_module.AssetUnlinkResult(True, deletion_job_id=1)

    monkeypatch.setattr(asset_protocol_module, "queue_asset_unlink", slow_unlink)
    protocol = AssetProtocolStub(1, "TEST01")
    task = asyncio.create_task(protocol.handle_asset_delete_request(
        Message(MessageType.ASSET_DELETE_REQUEST, {"asset_id": "asset-1"}),
        "client-1",
    ))
    try:
        for _ in range(100):
            if started.is_set():
                break
            await asyncio.sleep(0.001)
        assert started.is_set()
        await asyncio.sleep(0)
        assert not task.done()
    finally:
        release.set()

    result = await task
    assert result.type == MessageType.SUCCESS


async def test_download_url_requires_session_asset_link(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    response = await _request_upload(manager, test_user, test_game_session)
    assert await manager.confirm_upload(response.asset_id, test_user.id, upload_success=True)

    other_user = crud.create_user(
        test_db,
        schemas.UserCreate(username="other", email="other@example.com", password="Pass1234"),
    )
    other_session = crud.create_game_session(
        test_db,
        schemas.GameSessionCreate(name="Other Session"),
        other_user.id,
        "OTHER1",
    )

    denied = await manager.request_download_url(
        AssetRequest(
            user_id=other_user.id,
            username=other_user.username,
            session_code=other_session.session_code,
            asset_id=response.asset_id,
        )
    )

    assert denied.success is False
    assert denied.error == "Asset not found"


async def test_filename_download_is_scoped_to_session_link(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    first_asset = models.Asset(
        asset_name="map.png",
        r2_asset_id="first-asset",
        content_type="image/png",
        file_size=1234,
        xxhash="first-hash",
        uploaded_by=test_user.id,
        r2_key="assets/first.png",
        r2_bucket="assets",
    )
    test_db.add(first_asset)
    test_db.flush()
    test_db.add(models.SessionAsset(
        session_id=test_game_session.id,
        asset_id=first_asset.id,
        display_name="map.png",
        added_by=test_user.id,
    ))

    other_user = crud.create_user(
        test_db,
        schemas.UserCreate(username="filename-owner", email="filename@example.com", password="Pass1234"),
    )
    other_session = crud.create_game_session(
        test_db,
        schemas.GameSessionCreate(name="Filename Session"),
        other_user.id,
        "FILES1",
    )
    second_asset = models.Asset(
        asset_name="map.png",
        r2_asset_id="second-asset",
        content_type="image/png",
        file_size=5678,
        xxhash="second-hash",
        uploaded_by=other_user.id,
        r2_key="assets/second.png",
        r2_bucket="assets",
    )
    test_db.add(second_asset)
    test_db.flush()
    test_db.add(models.SessionAsset(
        session_id=other_session.id,
        asset_id=second_asset.id,
        display_name="map.png",
        added_by=other_user.id,
    ))
    test_db.commit()

    response = await manager.request_download_url_by_filename(
        "map.png",
        other_session.session_code,
        other_user.id,
    )

    assert response.success is True
    assert response.url == "https://r2.example/get/assets/second.png"
    assert response.asset_id == "second-asset"

    ambiguous_asset = models.Asset(
        asset_name="map.png",
        r2_asset_id="ambiguous-asset",
        content_type="image/png",
        file_size=99,
        xxhash="ambiguous-hash",
        uploaded_by=other_user.id,
        r2_key="assets/ambiguous.png",
        r2_bucket="assets",
    )
    test_db.add(ambiguous_asset)
    test_db.flush()
    test_db.add(models.SessionAsset(
        session_id=other_session.id,
        asset_id=ambiguous_asset.id,
        display_name="map.png",
        added_by=other_user.id,
    ))
    test_db.commit()

    ambiguous = await manager.request_download_url_by_filename(
        "map.png",
        other_session.session_code,
        other_user.id,
    )
    assert ambiguous.success is False
    assert ambiguous.error == "Asset not found"


async def test_filename_download_cannot_bypass_shared_limiter(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    monkeypatch.setattr(
        manager._asset_rate_limiter,
        "consume",
        lambda **_kwargs: AssetRateLimitDecision.LIMITED,
    )

    response = await manager.request_download_url_by_filename(
        "map.png",
        test_game_session.session_code,
        test_user.id,
    )

    assert response.success is False
    assert response.error == "Download rate limit exceeded"


async def test_table_asset_enrichment_uses_only_session_links(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    response = await _request_upload(manager, test_user, test_game_session)
    assert await manager.confirm_upload(response.asset_id, test_user.id, upload_success=True)
    monkeypatch.setattr(asset_protocol_module, "get_server_asset_manager", lambda: manager)
    protocol = AssetProtocolStub(test_user.id, test_game_session.session_code)
    table_data = {
        "layers": {
            "map": {
                "entity-1": {"texture_path": "local/maps/map.png"},
                "entity-2": {"texture_path": "local/maps/not-linked.png"},
            }
        }
    }

    enriched = await protocol.add_asset_hashes_to_table(
        table_data,
        test_game_session.session_code,
        test_user.id,
    )
    enriched = await protocol.ensure_assets_in_r2(
        enriched,
        test_game_session.session_code,
        test_user.id,
    )

    linked = enriched["layers"]["map"]["entity-1"]
    assert linked["asset_id"] == response.asset_id
    assert linked["asset_xxhash"] == VALID_XXHASH
    assert linked["r2_asset_url"] == f"https://r2.example/get/assets/{response.asset_id}.png"
    assert enriched["layers"]["map"]["entity-2"] == {
        "texture_path": "local/maps/not-linked.png"
    }
    assert test_db.query(models.Asset).count() == 1
