"""Read-only diagnosis of direct R2 sprite downloads, without printing signed URLs.

Run from apps/server with the server's Python environment:
    python -m scripts.check_asset_download --asset-id <id> --origin http://localhost:12345

A browser CORS error accompanied by 403 can hide an R2 access denial or expired
signature. This checks SDK access and a fresh signed GET with the browser Origin
separately. It never changes bucket policy, objects, or application metadata.
Use an active bucket-scoped Object Read & Write key for the application. CORS
policy management uses separate administrative credentials; application keys
do not need bucket administration permissions.

References:
    https://developers.cloudflare.com/r2/platform/troubleshooting/
    https://developers.cloudflare.com/r2/buckets/cors/
    https://developers.cloudflare.com/r2/get-started/s3/
"""

import argparse
import json
import logging
from urllib.parse import urlsplit
from xml.etree import ElementTree

import httpx
from botocore.exceptions import ClientError
from config import Settings
from storage.r2_manager import R2AssetManager

_ERROR_CODES = {
    "AccessDenied": "storage_access_denied",
    "InvalidAccessKeyId": "storage_access_denied",
    "ExpiredRequest": "signed_url_expired",
    "RequestTimeTooSkewed": "server_clock_skew",
    "SignatureDoesNotMatch": "signature_mismatch",
    "NoSuchKey": "storage_object_missing",
    "NoSuchBucket": "storage_bucket_missing",
}
_HINTS = {
    "storage_access_denied": "Check that the R2 S3 key is active and permits object reads in the configured account and bucket.",
    "signed_url_expired": "Check the server clock and request a fresh download link.",
    "server_clock_skew": "Synchronize the server clock with UTC.",
    "signature_mismatch": "Check the R2 S3 access key/secret pair and endpoint; preserve signed URLs unchanged.",
    "cors_origin_denied": "Allow this exact origin and GET in the R2 bucket CORS policy using bucket administration credentials.",
    "storage_object_missing": "Check the asset's stored R2 object key and restore the missing object.",
    "storage_bucket_missing": "Check the configured R2 account, endpoint, and bucket.",
    "storage_unreachable": "Check connectivity to the configured R2 endpoint.",
}


def _origin(value: str) -> str:
    try:
        parsed = urlsplit(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("Origin must be a valid HTTP(S) origin") from error
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
        or any(char.isspace() or ord(char) < 32 for char in value)
    ):
        raise argparse.ArgumentTypeError("Origin must be scheme://host[:port] without credentials or a path")
    try:
        parsed.port
    except ValueError as error:
        raise argparse.ArgumentTypeError("Origin has an invalid port") from error
    return value.rstrip("/")


def _error_code(code: str, status: int) -> str:
    if code in _ERROR_CODES:
        return _ERROR_CODES[code]
    if status in {401, 403}:
        return "storage_access_denied"
    if status == 404:
        return "storage_object_missing"
    return "storage_request_failed"


def check_download(manager: R2AssetManager, key: str, origin: str, client: httpx.Client) -> dict:
    """Probe object access and CORS, returning only bounded, credential-safe fields."""
    bucket = manager.settings.r2_bucket_name
    checks = {}
    try:
        manager.s3_client.head_object(Bucket=bucket, Key=key)
        checks["sdk_read"] = {"ok": True}
    except ClientError as error:
        status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 0)
        checks["sdk_read"] = {
            "ok": False,
            "code": _error_code(str(error.response.get("Error", {}).get("Code", "")), status),
        }
    except Exception:
        checks["sdk_read"] = {"ok": False, "code": "storage_unreachable"}

    try:
        # Signing is local and can succeed even when R2 rejects these credentials.
        url = manager.s3_client.generate_presigned_url(
            "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=300,
        )
        with client.stream("GET", url, headers={"Origin": origin}) as response:
            if response.status_code == 200:
                allowed = response.headers.get("access-control-allow-origin") in {origin, "*"}
                checks["browser_get"] = {"ok": allowed, "http_status": 200}
                if not allowed:
                    checks["browser_get"]["code"] = "cors_origin_denied"
            else:
                body = bytearray()
                for chunk in response.iter_bytes(chunk_size=4096):
                    body.extend(chunk)
                    if len(body) > 16_384:
                        break
                try:
                    code = ElementTree.fromstring(body).findtext("Code", "")
                except ElementTree.ParseError:
                    code = ""
                checks["browser_get"] = {
                    "ok": False,
                    "http_status": response.status_code,
                    "code": _error_code(code, response.status_code),
                }
    except Exception:
        # Transport exceptions contain bearer URLs; never include their text.
        checks["browser_get"] = {"ok": False, "code": "storage_unreachable"}

    result = {"ok": all(check["ok"] for check in checks.values()), "checks": checks}
    result["hints"] = sorted({_HINTS[check["code"]] for check in checks.values()
                              if not check["ok"] and check["code"] in _HINTS})
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--origin", type=_origin, required=True)
    args = parser.parse_args()
    # The server's development logging enables SDK wire/signature logs. Keep
    # this standalone command's output restricted to the safe JSON result.
    previous_logging_threshold = logging.root.manager.disable
    logging.disable(logging.CRITICAL)
    try:
        settings = Settings()
        manager = R2AssetManager(settings)
        if not manager.is_r2_configured():
            result = {"ok": False, "code": "storage_not_configured"}
        elif settings.ASSET_LINK_MODE != "presigned":
            result = {"ok": False, "code": "direct_r2_mode_required"}
        else:
            from database.database import SessionLocal
            from database.models import Asset

            with SessionLocal() as db:
                asset = db.query(Asset).filter(Asset.r2_asset_id == args.asset_id).first()
                key = asset.r2_key if asset else None
            if key is None:
                result = {"ok": False, "code": "asset_not_found"}
            else:
                with httpx.Client(timeout=15, follow_redirects=False) as client:
                    result = check_download(manager, key, args.origin, client)
    except Exception:
        result = {"ok": False, "code": "diagnostic_failed"}
    finally:
        logging.disable(previous_logging_threshold)
    print(json.dumps(result, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
