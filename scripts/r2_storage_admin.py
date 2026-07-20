"""Operational controls for R2 asset storage.

Mutating reconciliation operations are dry-run by default. Run this
from the repository root so application settings and the asset database resolve
the same way as the server.
"""

import argparse
import json
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[1]
SERVER_ROOT = REPO_ROOT / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from config import Settings  # noqa: E402
from database.database import SessionLocal  # noqa: E402
from database.models import Asset, SessionAsset, User  # noqa: E402
from storage.r2_manager import R2AssetManager  # noqa: E402
from sqlalchemy import func  # noqa: E402
from utils.audit import audit_event  # noqa: E402


class R2StorageAdmin:
    def __init__(self, client, bucket: str):
        self.client = client
        self.bucket = bucket

    def list_objects(self, bucket: str, prefix: str = "") -> list[dict]:
        paginator = self.client.get_paginator("list_objects_v2")
        objects: list[dict] = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            objects.extend(page.get("Contents", []))
        return objects

    def apply_bucket_configuration(
        self,
        origins: list[str],
        cors_path: Path,
        lifecycle_path: Path,
    ) -> dict:
        normalized_origins = sorted({origin.rstrip("/") for origin in origins})
        if not normalized_origins or any(not origin.startswith("https://") for origin in normalized_origins):
            raise ValueError("Every production R2 CORS origin must use https://")

        cors_rules = json.loads(cors_path.read_text(encoding="utf-8"))
        for rule in cors_rules:
            rule["AllowedOrigins"] = normalized_origins
        lifecycle = json.loads(lifecycle_path.read_text(encoding="utf-8"))

        self.client.put_bucket_cors(
            Bucket=self.bucket,
            CORSConfiguration={"CORSRules": cors_rules},
        )
        self.client.put_bucket_lifecycle_configuration(
            Bucket=self.bucket,
            LifecycleConfiguration=lifecycle,
        )
        return {
            "origins": normalized_origins,
            "cors_rules": len(cors_rules),
            "lifecycle_rules": len(lifecycle["Rules"]),
        }

    def smoke_test(self) -> dict:
        key = f"pending/operations/smoke-{uuid.uuid4().hex}.txt"
        payload = b"r2-storage-smoke-test"
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=payload,
                ContentType="text/plain",
            )
            head = self.client.head_object(Bucket=self.bucket, Key=key)
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            body = response["Body"]
            try:
                downloaded = body.read()
            finally:
                body.close()
            if head.get("ContentLength") != len(payload) or downloaded != payload:
                raise RuntimeError("R2 smoke object did not round-trip exactly")
            return {"success": True, "key": key, "bytes": len(payload)}
        finally:
            self.client.delete_object(Bucket=self.bucket, Key=key)

    def audit_orphans(
        self,
        database_keys: Iterable[str],
        min_age_hours: int = 24,
        delete: bool = False,
    ) -> dict:
        known_keys = set(database_keys)
        objects = self.list_objects(self.bucket, "assets/")
        object_keys = {item["Key"] for item in objects}
        missing = sorted(known_keys - object_keys)
        orphan_objects = [item for item in objects if item["Key"] not in known_keys]

        cutoff = datetime.now(timezone.utc) - timedelta(hours=min_age_hours)
        aged_orphans = sorted(
            item["Key"]
            for item in orphan_objects
            if _as_utc(item.get("LastModified")) <= cutoff
        )
        if delete:
            for key in aged_orphans:
                self.client.delete_object(Bucket=self.bucket, Key=key)

        return {
            "database_objects": len(known_keys),
            "r2_objects": len(object_keys),
            "missing_objects": missing,
            "orphan_objects": sorted(item["Key"] for item in orphan_objects),
            "aged_orphans": aged_orphans,
            "deleted_orphans": aged_orphans if delete else [],
            "dry_run": not delete,
        }

def _as_utc(value) -> datetime:
    if value is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _database_asset_inventory() -> dict:
    db = SessionLocal()
    try:
        link_counts = dict(
            db.query(SessionAsset.asset_id, func.count(SessionAsset.id))
            .group_by(SessionAsset.asset_id)
            .all()
        )
        rows = (
            db.query(Asset, User.id)
            .outerjoin(User, User.id == Asset.uploaded_by)
            .order_by(Asset.id)
            .all()
        )
        orphaned_uploaders = [
            {
                "asset_id": asset.r2_asset_id,
                "r2_key": asset.r2_key,
                "uploaded_by": asset.uploaded_by,
                "session_links": link_counts.get(asset.id, 0),
            }
            for asset, uploader_id in rows
            if uploader_id is None
        ]
        return {
            "keys": [asset.r2_key for asset, _ in rows],
            "asset_rows": len(rows),
            "orphaned_uploader_count": len(orphaned_uploaders),
            "orphaned_uploaders": orphaned_uploaders,
        }
    finally:
        db.close()


def _record_admin_audit(command: str, outcome: str, result: dict | None = None) -> None:
    """Record privileged storage administration without object keys or bucket names."""
    db = SessionLocal()
    try:
        payload = result or {}
        db.add(audit_event(
            f"r2.{command.replace('-', '_')}",
            outcome=outcome,
            target_type="object_storage",
            details={
                "dry_run": payload.get("dry_run"),
                "objects": payload.get("objects") if isinstance(payload.get("objects"), int) else None,
                "missing_count": len(payload.get("missing_objects", [])),
                "orphan_count": len(payload.get("orphan_objects", [])),
            },
        ))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="R2 asset storage operations")
    subparsers = parser.add_subparsers(dest="command", required=True)

    configure = subparsers.add_parser("apply-config", help="Apply production CORS and lifecycle policy")
    configure.add_argument("--origin", action="append", required=True)
    configure.add_argument("--cors-file", type=Path, default=REPO_ROOT / "r2-cors-config.json")
    configure.add_argument("--lifecycle-file", type=Path, default=REPO_ROOT / "r2-lifecycle-config.json")

    subparsers.add_parser("smoke", help="Put, HEAD, GET, and delete a temporary object")

    audit = subparsers.add_parser("audit", help="Compare durable DB keys with R2 assets")
    audit.add_argument("--min-age-hours", type=int, default=24)
    audit.add_argument("--delete-orphans", action="store_true")

    return parser


def main() -> int:
    args = _build_parser().parse_args()
    settings = Settings()
    manager = R2AssetManager()
    if not manager.is_r2_configured():
        raise SystemExit("R2 is not configured")
    admin = R2StorageAdmin(manager.s3_client, settings.r2_bucket_name)

    try:
        if args.command == "apply-config":
            result = admin.apply_bucket_configuration(args.origin, args.cors_file, args.lifecycle_file)
        elif args.command == "smoke":
            result = admin.smoke_test()
        elif args.command == "audit":
            inventory = _database_asset_inventory()
            result = admin.audit_orphans(
                inventory.pop("keys"),
                min_age_hours=args.min_age_hours,
                delete=args.delete_orphans,
            )
            result["database_integrity"] = inventory
    except Exception:
        _record_admin_audit(args.command, "failure")
        raise

    _record_admin_audit(args.command, "success", result)

    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
