from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError
from storage.r2_manager import R2AssetManager


def _client_error(code: str, status: int) -> ClientError:
    return ClientError(
        {
            "Error": {"Code": code, "Message": code},
            "ResponseMetadata": {"HTTPStatusCode": status},
        },
        "HeadObject",
    )


@pytest.mark.parametrize("code", ["404", "NoSuchKey", "NotFound"])
def test_object_lookup_returns_missing_only_for_not_found(code):
    manager = R2AssetManager()
    manager._s3_client = MagicMock()
    manager._s3_client.head_object.side_effect = _client_error(code, 404)

    assert manager.object_exists("assets/missing.png") is False
    assert manager.get_object_info("assets/missing.png") is None


@pytest.mark.parametrize("method", ["object_exists", "get_object_info"])
def test_object_lookup_raises_transient_client_errors(method):
    manager = R2AssetManager()
    manager._s3_client = MagicMock()
    manager._s3_client.head_object.side_effect = _client_error("AccessDenied", 403)

    with pytest.raises(ClientError):
        getattr(manager, method)("assets/uncertain.png")
