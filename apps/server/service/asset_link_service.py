"""Generate authorized browser asset links for the configured delivery mode."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
import uuid
from collections.abc import Callable
from typing import Any, Optional
from urllib.parse import quote, urlencode

from config import Settings

logger = logging.getLogger(__name__)


class AssetLinkService:
    """Select direct R2 presigning or application-signed Worker capabilities."""

    def __init__(
        self,
        settings: Settings,
        *,
        clock: Callable[[], float] = time.time,
        nonce_factory: Callable[[], str] = lambda: uuid.uuid4().hex,
    ) -> None:
        self.settings = settings
        self._clock = clock
        self._nonce_factory = nonce_factory

    def generate_download_url(
        self,
        r2_manager: Any,
        *,
        asset_id: str,
        r2_key: str,
        user_id: int,
        session_code: str,
        expiration: int,
    ) -> Optional[str]:
        if self.settings.ASSET_LINK_MODE == "presigned":
            return r2_manager.generate_presigned_url(
                r2_key,
                method="GET",
                expiration=expiration,
            )
        return self._worker_url(
            asset_id,
            {
                "asset": asset_id,
                "key": r2_key,
                "op": "get",
                "sid": session_code,
                "uid": user_id,
            },
            expiration,
        )

    def generate_upload_url(
        self,
        r2_manager: Any,
        *,
        asset_id: str,
        r2_key: str,
        user_id: int,
        session_code: str,
        file_size: int,
        content_type: str,
        xxhash: str,
        expiration: int,
    ) -> Optional[str]:
        if self.settings.ASSET_LINK_MODE == "presigned":
            return r2_manager.generate_presigned_upload_url(
                r2_key,
                xxhash,
                content_type=content_type,
                expiration=expiration,
            )
        return self._worker_url(
            asset_id,
            {
                "asset": asset_id,
                "hash": xxhash,
                "key": r2_key,
                "nonce": self._nonce_factory(),
                "op": "put",
                "sid": session_code,
                "size": file_size,
                "type": content_type,
                "uid": user_id,
            },
            expiration,
        )

    def _worker_url(self, asset_id: str, claims: dict[str, object], expiration: int) -> str:
        issued_at = int(self._clock())
        payload = {
            "exp": issued_at + expiration,
            "iat": issued_at,
            "v": 1,
            **claims,
        }
        encoded_payload = self._base64url(
            json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        signature = hmac.new(
            self.settings.ASSET_WORKER_HMAC_SECRET.encode("utf-8"),
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).digest()
        capability = f"{encoded_payload}.{self._base64url(signature)}"
        base_url = self.settings.ASSET_WORKER_BASE_URL.rstrip("/")
        path_asset_id = quote(asset_id, safe="")
        return f"{base_url}/v1/assets/{path_asset_id}?{urlencode({'cap': capability})}"

    @staticmethod
    def _base64url(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")
