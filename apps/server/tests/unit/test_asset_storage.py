import base64

import xxhash
from sqlalchemy.orm import sessionmaker

from core_table.protocol import Message, MessageType
from database import crud, models, schemas
from service import asset_manager as asset_manager_module
from service.protocol import assets as asset_protocol_module
from service.asset_manager import AssetRequest, ServerAssetManager
from service.protocol.assets import _AssetsMixin


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
    ):
        self._object_exists = object_exists
        self.object_data = object_data
        self.size = len(object_data) if size is None else size
        self.content_type = content_type
        self.xxhash = xxhash
        self.delete_success = delete_success
        self.promote_success = promote_success
        self.deleted_keys = []
        self.promotions = []

    def is_r2_configured(self):
        return True

    def generate_presigned_upload_url(self, file_key, xxhash, content_type=None, expiration=3600):
        return f"https://r2.example/{file_key}?xxhash={xxhash}&content_type={content_type}"

    def generate_presigned_url(self, file_key, method="GET", expiration=3600):
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
    def __init__(self, user_id, session_code):
        self.user_id = user_id
        self.session_code = session_code

    def _get_user_id(self, msg, client_id=None):
        return self.user_id

    def _get_session_code(self, msg=None):
        return self.session_code


def _manager(monkeypatch, test_db, object_exists=True, **r2_kwargs):
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=test_db.get_bind())
    monkeypatch.setattr(asset_manager_module, "SessionLocal", testing_session)
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
    intent = test_db.query(models.AssetUploadIntent).one()
    assert intent.status == "awaiting_upload"

    confirmed = await manager.confirm_upload(response.asset_id, test_user.id, upload_success=True)

    assert confirmed is True
    asset = test_db.query(models.Asset).one()
    assert asset.r2_asset_id == response.asset_id
    assert asset.xxhash == VALID_XXHASH
    assert asset.session_id is None
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


async def test_upload_confirmation_rejects_object_metadata_mismatch(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db, content_type="text/plain")
    response = await _request_upload(manager, test_user, test_game_session)

    confirmed = await manager.confirm_upload(response.asset_id, test_user.id, upload_success=True)

    assert confirmed is False
    assert test_db.query(models.Asset).count() == 0
    intent = test_db.query(models.AssetUploadIntent).one()
    assert intent.status == "verification_failed"
    assert "content type" in intent.error_message
    assert manager.r2_manager.deleted_keys == [intent.r2_key]


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
    assert intent.status == "verification_failed"
    assert "image bytes failed validation" in intent.error_message
    assert manager.r2_manager.deleted_keys == [intent.r2_key]
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
    assert intent.status == "promotion_failed"
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
    assert "Only raster images" in response.error


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


async def test_delete_keeps_metadata_when_storage_delete_fails(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db, delete_success=False)
    response = await _request_upload(manager, test_user, test_game_session)
    assert await manager.confirm_upload(response.asset_id, test_user.id, upload_success=True)

    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=test_db.get_bind())
    monkeypatch.setattr(asset_protocol_module, "SessionLocal", testing_session)
    monkeypatch.setattr(asset_protocol_module, "get_server_asset_manager", lambda: manager)
    protocol = AssetProtocolStub(test_user.id, test_game_session.session_code)

    result = await protocol.handle_asset_delete_request(
        Message(
            MessageType.ASSET_DELETE_REQUEST,
            {"asset_id": response.asset_id, "session_code": test_game_session.session_code},
        ),
        "client-1",
    )

    assert result.type == MessageType.ERROR
    assert result.data["error"] == "Failed to delete asset from storage"
    assert test_db.query(models.Asset).count() == 1
    assert test_db.query(models.SessionAsset).count() == 1


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


async def test_legacy_session_id_does_not_bypass_session_link(
    monkeypatch, test_db, test_user, test_game_session
):
    manager = _manager(monkeypatch, test_db)
    legacy_asset = models.Asset(
        asset_name="legacy.png",
        r2_asset_id="legacy-asset",
        content_type="image/png",
        file_size=1234,
        xxhash="legacy-hash",
        uploaded_by=test_user.id,
        session_id=test_game_session.id,
        r2_key="sessions/legacy/assets/legacy.png",
        r2_bucket="assets",
    )
    test_db.add(legacy_asset)
    test_db.commit()

    assert manager.get_session_assets(test_game_session.session_code, test_user.id) == []
    denied = await manager.request_download_url(
        AssetRequest(
            user_id=test_user.id,
            username=test_user.username,
            session_code=test_game_session.session_code,
            asset_id=legacy_asset.r2_asset_id,
        )
    )
    assert denied.success is False
    assert denied.error == "Asset not found"
