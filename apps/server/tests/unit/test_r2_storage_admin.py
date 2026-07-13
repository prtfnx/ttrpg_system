import importlib.util
import io
from datetime import datetime, timedelta, timezone
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[4] / "scripts" / "r2_storage_admin.py"
spec = importlib.util.spec_from_file_location("r2_storage_admin", SCRIPT_PATH)
storage_admin = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(storage_admin)


class FakePaginator:
    def __init__(self, client):
        self.client = client

    def paginate(self, Bucket, Prefix):
        yield {
            "Contents": [
                item for item in self.client.objects.get(Bucket, [])
                if item["Key"].startswith(Prefix)
            ]
        }


class FakeBody(io.BytesIO):
    pass


class FakeClient:
    def __init__(self):
        self.objects = {}
        self.payloads = {}
        self.cors = None
        self.lifecycle = None
        self.deleted = []
        self.copies = []

    def get_paginator(self, name):
        assert name == "list_objects_v2"
        return FakePaginator(self)

    def put_bucket_cors(self, **kwargs):
        self.cors = kwargs

    def put_bucket_lifecycle_configuration(self, **kwargs):
        self.lifecycle = kwargs

    def put_object(self, Bucket, Key, Body, **kwargs):
        payload = Body if isinstance(Body, bytes) else Body.read()
        self.payloads[(Bucket, Key)] = payload

    def head_object(self, Bucket, Key):
        return {"ContentLength": len(self.payloads[(Bucket, Key)])}

    def get_object(self, Bucket, Key):
        return {"Body": FakeBody(self.payloads[(Bucket, Key)])}

    def delete_object(self, Bucket, Key):
        self.deleted.append((Bucket, Key))

    def copy_object(self, **kwargs):
        self.copies.append(kwargs)


def test_apply_configuration_uses_only_production_origin(tmp_path):
    cors_path = tmp_path / "cors.json"
    lifecycle_path = tmp_path / "lifecycle.json"
    cors_path.write_text('[{"AllowedOrigins":["http://localhost"],"AllowedMethods":["PUT"]}]')
    lifecycle_path.write_text('{"Rules":[{"ID":"pending","Status":"Enabled"}]}')
    client = FakeClient()
    admin = storage_admin.R2StorageAdmin(client, "assets")

    result = admin.apply_bucket_configuration(
        ["https://table.example.com/", "https://admin.example.com"],
        cors_path,
        lifecycle_path,
    )

    rules = client.cors["CORSConfiguration"]["CORSRules"]
    assert rules[0]["AllowedOrigins"] == [
        "https://admin.example.com",
        "https://table.example.com",
    ]
    assert client.lifecycle["LifecycleConfiguration"]["Rules"][0]["ID"] == "pending"
    assert result["origins"] == rules[0]["AllowedOrigins"]


def test_smoke_test_round_trips_and_deletes_object():
    client = FakeClient()
    admin = storage_admin.R2StorageAdmin(client, "assets")

    result = admin.smoke_test()

    assert result["success"] is True
    assert client.deleted == [("assets", result["key"])]


def test_orphan_audit_is_dry_run_and_age_gated():
    client = FakeClient()
    old = datetime.now(timezone.utc) - timedelta(days=2)
    recent = datetime.now(timezone.utc) - timedelta(hours=1)
    client.objects["assets"] = [
        {"Key": "assets/known.png", "LastModified": old},
        {"Key": "assets/orphan-old.png", "LastModified": old},
        {"Key": "assets/orphan-new.png", "LastModified": recent},
    ]
    admin = storage_admin.R2StorageAdmin(client, "assets")

    report = admin.audit_orphans(["assets/known.png", "assets/missing.png"])

    assert report["missing_objects"] == ["assets/missing.png"]
    assert report["aged_orphans"] == ["assets/orphan-old.png"]
    assert report["deleted_orphans"] == []
    assert client.deleted == []


def test_backup_writes_manifest_and_restore_is_explicit():
    client = FakeClient()
    client.objects["assets"] = [
        {"Key": "assets/map.png", "Size": 12, "ETag": "etag"},
    ]
    admin = storage_admin.R2StorageAdmin(client, "assets", "assets-backup")

    backup = admin.backup("snapshot-1")

    assert backup["manifest_key"] == "snapshots/snapshot-1/manifest.json"
    assert client.copies[0]["Bucket"] == "assets-backup"
    assert ("assets-backup", backup["manifest_key"]) in client.payloads

    client.objects["assets-backup"] = [
        {"Key": "snapshots/snapshot-1/assets/map.png"},
    ]
    dry_run = admin.restore("snapshot-1")
    assert dry_run == {"snapshot": "snapshot-1", "objects": ["assets/map.png"], "dry_run": True}
    assert len(client.copies) == 1

    applied = admin.restore("snapshot-1", apply=True)
    assert applied["dry_run"] is False
    assert client.copies[-1]["Bucket"] == "assets"
    assert client.copies[-1]["Key"] == "assets/map.png"
