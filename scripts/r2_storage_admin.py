"""Operational controls for R2 asset storage.

Mutating reconciliation and restore operations are dry-run by default. Run this
from the repository root so application settings and the asset database resolve
the same way as the server.
"""

import argparse
import hashlib
import json
import os
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
    def __init__(self, client, bucket: str, backup_bucket: str | None = None):
        self.client = client
        self.bucket = bucket
        self.backup_bucket = backup_bucket

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

    def backup(self, database_binding: dict, snapshot: str | None = None) -> dict:
        backup_bucket = self._require_backup_bucket()
        snapshot = snapshot or database_binding["backup_set_id"]
        if snapshot != database_binding["backup_set_id"]:
            raise ValueError("R2 snapshot must equal the database backup-set ID")
        prefix = f"snapshots/{snapshot}/"
        objects = self.list_objects(self.bucket, "assets/")
        manifest = {
            "snapshot": snapshot,
            "source_bucket": self.bucket,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "database": database_binding,
            "objects": [],
        }

        for item in objects:
            source_key = item["Key"]
            backup_key = f"{prefix}{source_key}"
            self.client.copy_object(
                Bucket=backup_bucket,
                CopySource={"Bucket": self.bucket, "Key": source_key},
                Key=backup_key,
                MetadataDirective="COPY",
            )
            copied = self.client.head_object(Bucket=backup_bucket, Key=backup_key)
            if copied.get("ContentLength") != item.get("Size"):
                raise RuntimeError(f"R2 backup verification failed for {source_key}")
            manifest["objects"].append({
                "key": source_key,
                "backup_key": backup_key,
                "size": item.get("Size"),
                "etag": item.get("ETag"),
            })

        manifest_key = f"{prefix}manifest.json"
        self.client.put_object(
            Bucket=backup_bucket,
            Key=manifest_key,
            Body=json.dumps(manifest, indent=2).encode("utf-8"),
            ContentType="application/json",
        )
        return {"snapshot": snapshot, "objects": len(objects), "manifest_key": manifest_key}

    def restore(self, snapshot: str, database_binding: dict, apply: bool = False) -> dict:
        backup_bucket = self._require_backup_bucket()
        manifest_key = f"snapshots/{snapshot}/manifest.json"
        response = self.client.get_object(Bucket=backup_bucket, Key=manifest_key)
        body = response["Body"]
        try:
            manifest = json.loads(body.read())
        finally:
            body.close()
        if manifest.get("snapshot") != snapshot or manifest.get("database") != database_binding:
            raise ValueError("R2 snapshot is not bound to the selected database backup set")
        restore_pairs = sorted(
            (
                item["backup_key"],
                item["key"],
            )
            for item in manifest.get("objects", [])
        )
        for item in manifest.get("objects", []):
            head = self.client.head_object(Bucket=backup_bucket, Key=item["backup_key"])
            if head.get("ContentLength") != item.get("size"):
                raise RuntimeError(f"R2 restore verification failed for {item['key']}")
        if apply:
            for source_key, destination_key in restore_pairs:
                self.client.copy_object(
                    Bucket=self.bucket,
                    CopySource={"Bucket": backup_bucket, "Key": source_key},
                    Key=destination_key,
                    MetadataDirective="COPY",
                )
        return {
            "snapshot": snapshot,
            "objects": [destination for _, destination in restore_pairs],
            "dry_run": not apply,
        }

    def _require_backup_bucket(self) -> str:
        if not self.backup_bucket or self.backup_bucket == self.bucket:
            raise ValueError("R2_BACKUP_BUCKET_NAME must name a separate bucket")
        return self.backup_bucket


def _as_utc(value) -> datetime:
    if value is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _database_manifest_binding(path: Path) -> dict:
    raw = path.read_bytes()
    manifest = json.loads(raw)
    backup_set_id = manifest.get("backup_set_id")
    if manifest.get("schema_version") != 1 or not isinstance(backup_set_id, str):
        raise ValueError("Invalid database backup-set manifest")
    if manifest.get("r2_snapshot") != backup_set_id:
        raise ValueError("Database manifest must bind R2 to the same backup-set ID")
    database_sha256 = manifest.get("database", {}).get("sha256")
    if not isinstance(database_sha256, str) or len(database_sha256) != 64:
        raise ValueError("Database manifest is missing its checksum")
    return {
        "backup_set_id": backup_set_id,
        "manifest_sha256": hashlib.sha256(raw).hexdigest(),
        "database_sha256": database_sha256,
    }


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

    backup = subparsers.add_parser("backup", help="Copy durable assets to the backup bucket")
    backup.add_argument("--snapshot")
    backup.add_argument("--database-manifest", type=Path, required=True)

    restore = subparsers.add_parser("restore", help="Restore a snapshot; dry-run unless --apply")
    restore.add_argument("--snapshot", required=True)
    restore.add_argument("--database-manifest", type=Path, required=True)
    restore.add_argument("--apply", action="store_true")
    return parser


def main() -> int:
    args = _build_parser().parse_args()
    settings = Settings()
    manager = R2AssetManager()
    if not manager.is_r2_configured():
        raise SystemExit("R2 is not configured")
    admin = R2StorageAdmin(
        manager.s3_client,
        settings.r2_bucket_name,
        os.getenv("R2_BACKUP_BUCKET_NAME"),
    )

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
        elif args.command == "backup":
            binding = _database_manifest_binding(args.database_manifest)
            result = admin.backup(binding, args.snapshot)
        else:
            binding = _database_manifest_binding(args.database_manifest)
            result = admin.restore(args.snapshot, binding, apply=args.apply)
    except Exception:
        _record_admin_audit(args.command, "failure")
        raise

    _record_admin_audit(args.command, "success", result)

    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
