import base64
import hashlib
import hmac
import json
from urllib.parse import parse_qs, urlparse

from config import Settings
from service.asset_link_service import AssetLinkService


class FakeR2Links:
    def __init__(self):
        self.calls = []

    def generate_presigned_url(self, key, method="GET", expiration=3600):
        self.calls.append(("download", key, method, expiration))
        return "https://r2.example/download"

    def generate_presigned_upload_url(self, key, xxhash, content_type=None, expiration=3600):
        self.calls.append(("upload", key, xxhash, content_type, expiration))
        return "https://r2.example/upload"


def _decode_capability(url: str, secret: str):
    capability = parse_qs(urlparse(url).query)["cap"][0]
    encoded_payload, encoded_signature = capability.split(".")
    expected_signature = hmac.new(
        secret.encode(), encoded_payload.encode("ascii"), hashlib.sha256
    ).digest()
    actual_signature = base64.urlsafe_b64decode(
        encoded_signature + "=" * (-len(encoded_signature) % 4)
    )
    assert hmac.compare_digest(actual_signature, expected_signature)
    payload = base64.urlsafe_b64decode(
        encoded_payload + "=" * (-len(encoded_payload) % 4)
    )
    return json.loads(payload)


def test_presigned_mode_delegates_to_r2_manager():
    r2 = FakeR2Links()
    links = AssetLinkService(Settings(ASSET_LINK_MODE="presigned"))

    assert links.generate_download_url(
        r2,
        asset_id="asset-1",
        r2_key="assets/asset-1.png",
        user_id=7,
        session_code="ROOM",
        expiration=300,
    ) == "https://r2.example/download"
    assert links.generate_upload_url(
        r2,
        asset_id="asset-1",
        r2_key="pending/ROOM/asset-1.png",
        user_id=7,
        session_code="ROOM",
        file_size=123,
        content_type="image/png",
        xxhash="abcdef",
        expiration=900,
    ) == "https://r2.example/upload"
    assert r2.calls == [
        ("download", "assets/asset-1.png", "GET", 300),
        ("upload", "pending/ROOM/asset-1.png", "abcdef", "image/png", 900),
    ]


def test_worker_download_capability_binds_authorized_context():
    secret = "worker-secret-that-is-at-least-32-characters"
    links = AssetLinkService(
        Settings(
            ASSET_LINK_MODE="worker",
            ASSET_WORKER_BASE_URL="https://assets.example.com/",
            ASSET_WORKER_HMAC_SECRET=secret,
        ),
        clock=lambda: 1_700_000_000,
    )

    url = links.generate_download_url(
        FakeR2Links(),
        asset_id="asset/1",
        r2_key="assets/asset-1.png",
        user_id=7,
        session_code="ROOM",
        expiration=300,
    )

    assert url is not None
    assert urlparse(url).path == "/v1/assets/asset%2F1"
    assert _decode_capability(url, secret) == {
        "asset": "asset/1",
        "exp": 1_700_000_300,
        "iat": 1_700_000_000,
        "key": "assets/asset-1.png",
        "op": "get",
        "sid": "ROOM",
        "uid": 7,
        "v": 1,
    }


def test_worker_upload_capability_is_one_use_addressable_and_size_bound():
    secret = "worker-secret-that-is-at-least-32-characters"
    links = AssetLinkService(
        Settings(
            ASSET_LINK_MODE="worker",
            ASSET_WORKER_BASE_URL="https://assets.example.com",
            ASSET_WORKER_HMAC_SECRET=secret,
        ),
        clock=lambda: 1_700_000_000,
        nonce_factory=lambda: "fixed-nonce",
    )

    url = links.generate_upload_url(
        FakeR2Links(),
        asset_id="asset-1",
        r2_key="pending/ROOM/asset-1.png",
        user_id=7,
        session_code="ROOM",
        file_size=123,
        content_type="image/png",
        xxhash="abcdef",
        expiration=900,
    )

    assert url is not None
    assert _decode_capability(url, secret) == {
        "asset": "asset-1",
        "exp": 1_700_000_900,
        "hash": "abcdef",
        "iat": 1_700_000_000,
        "key": "pending/ROOM/asset-1.png",
        "nonce": "fixed-nonce",
        "op": "put",
        "sid": "ROOM",
        "size": 123,
        "type": "image/png",
        "uid": 7,
        "v": 1,
    }
