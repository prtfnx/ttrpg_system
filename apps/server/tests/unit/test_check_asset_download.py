import argparse
import json
import logging
from unittest.mock import MagicMock

import httpx
import pytest
from botocore.exceptions import ClientError
from config import Settings
from scripts.check_asset_download import _origin, check_download, main
from storage.r2_manager import R2AssetManager


def _manager():
    manager = R2AssetManager(Settings(_env_file=None, r2_bucket_name="test-assets"))
    manager._s3_client = MagicMock()
    manager._s3_client.generate_presigned_url.return_value = (
        "https://r2.example/test-assets/private-key?X-Amz-Signature=private-signature"
    )
    return manager


@pytest.mark.parametrize("status,body,allow_origin,expected", [
    (403, "<Error><Code>AccessDenied</Code><Message>private-details</Message></Error>", None, "storage_access_denied"),
    (403, "<Error><Code>ExpiredRequest</Code></Error>", None, "signed_url_expired"),
    (403, "<Error><Code>SignatureDoesNotMatch</Code></Error>", None, "signature_mismatch"),
    (403, "not XML", None, "storage_access_denied"),
    (404, "<Error><Code>NoSuchKey</Code></Error>", None, "storage_object_missing"),
    (200, "image-bytes", None, "cors_origin_denied"),
    (200, "image-bytes", "https://other.example", "cors_origin_denied"),
])
def test_diagnosis_distinguishes_storage_rejection_from_cors(status, body, allow_origin, expected):
    manager = _manager()
    if status != 200:
        manager._s3_client.head_object.side_effect = ClientError(
            {"Error": {"Code": str(status), "Message": "private-details"},
             "ResponseMetadata": {"HTTPStatusCode": status}},
            "HeadObject",
        )

    def handle(request):
        assert request.method == "GET"
        assert request.headers["origin"] == "http://localhost:12345"
        headers = {"access-control-allow-origin": allow_origin} if allow_origin else {}
        return httpx.Response(status, text=body, headers=headers)

    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        result = check_download(manager, "private-key", "http://localhost:12345", client)

    assert result["ok"] is False
    assert result["checks"]["browser_get"]["code"] == expected
    assert result["hints"]
    serialized = json.dumps(result)
    assert "private" not in serialized
    assert "X-Amz" not in serialized
    assert "r2.example" not in serialized
    manager._s3_client.head_object.assert_called_once_with(Bucket="test-assets", Key="private-key")


@pytest.mark.parametrize("allow_origin", ["http://localhost:12345", "*"])
def test_success_does_not_download_or_buffer_the_image(allow_origin):
    class UnreadBody(httpx.SyncByteStream):
        def __iter__(self):
            raise AssertionError("Successful image bytes must not be read")

    manager = _manager()
    transport = httpx.MockTransport(lambda _request: httpx.Response(
        200, headers={"access-control-allow-origin": allow_origin}, stream=UnreadBody(),
    ))
    with httpx.Client(transport=transport) as client:
        result = check_download(manager, "private-key", "http://localhost:12345", client)

    assert result == {
        "ok": True,
        "checks": {"sdk_read": {"ok": True}, "browser_get": {"ok": True, "http_status": 200}},
        "hints": [],
    }


def test_transport_errors_do_not_expose_credentials_or_bearer_urls():
    manager = _manager()
    manager._s3_client.head_object.side_effect = RuntimeError("private-access-key")

    def handle(request):
        raise httpx.ConnectError(f"Connection failed: {request.url}", request=request)

    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        result = check_download(manager, "private-key", "http://localhost:12345", client)

    assert result["ok"] is False
    assert result["checks"]["sdk_read"]["code"] == "storage_unreachable"
    assert result["checks"]["browser_get"]["code"] == "storage_unreachable"
    assert "private" not in json.dumps(result)
    assert "X-Amz" not in json.dumps(result)


@pytest.mark.parametrize("origin", [
    "https://user:password@example.com", "https://example.com/path",
    "https://example.com?secret=value", "https://example.com#fragment",
    "https://example.com:99999", "https://example.com\n", "file:///tmp/image.png", "https://[invalid",
])
def test_diagnostic_rejects_invalid_browser_origins(origin):
    with pytest.raises(argparse.ArgumentTypeError):
        _origin(origin)


def test_diagnostic_normalizes_trailing_slash():
    assert _origin("http://localhost:12345/") == "http://localhost:12345"


def test_cli_suppresses_provider_logs_and_restores_logging(monkeypatch, capsys, test_db):
    import scripts.check_asset_download as diagnostic
    from database import database, models

    test_db.add(models.User(id=1, username="diagnostic", hashed_password="unused"))
    test_db.flush()
    test_db.add(models.Asset(
        asset_name="image.png", r2_asset_id="diagnostic-asset", content_type="image/png",
        file_size=1, xxhash="0123456789abcdef", uploaded_by=1,
        r2_key="private-key", r2_bucket="test-assets",
    ))
    test_db.commit()
    monkeypatch.setattr(database, "SessionLocal", lambda: test_db)
    monkeypatch.setattr(diagnostic, "Settings", lambda: Settings(
        _env_file=None, r2_enabled=True, r2_account_id="test-account",
        r2_access_key="private-key", r2_secret_key="private-secret", r2_bucket_name="test-assets",
        ASSET_LINK_MODE="presigned",
    ))
    monkeypatch.setattr("sys.argv", ["check_asset_download", "--asset-id", "diagnostic-asset",
                                    "--origin", "http://localhost:12345"])

    def probe(*_args):
        assert logging.root.manager.disable == logging.CRITICAL
        logging.getLogger("botocore.auth").critical("private-secret")
        logging.getLogger("httpx").critical("private-signed-url")
        return {"ok": True, "checks": {}, "hints": []}

    monkeypatch.setattr(diagnostic, "check_download", probe)
    previous_threshold = logging.root.manager.disable
    assert main() == 0
    assert logging.root.manager.disable == previous_threshold
    output = capsys.readouterr()
    assert json.loads(output.out) == {"ok": True, "checks": {}, "hints": []}
    assert "private" not in output.out + output.err
