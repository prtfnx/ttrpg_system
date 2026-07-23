import importlib.util
import io
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from database import models
from sqlalchemy.orm import sessionmaker

SCRIPT_PATH = Path(__file__).resolve().parents[4] / "scripts" / "r2_storage_admin.py"
spec = importlib.util.spec_from_file_location("r2_storage_admin", SCRIPT_PATH)
assert spec and spec.loader
storage_admin = importlib.util.module_from_spec(spec)
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
        if (Bucket, Key) in self.payloads:
            size = len(self.payloads[(Bucket, Key)])
        else:
            size = next(item["Size"] for item in self.objects[Bucket] if item["Key"] == Key)
        return {"ContentLength": size}

    def get_object(self, Bucket, Key):
        return {"Body": FakeBody(self.payloads[(Bucket, Key)])}

    def delete_object(self, Bucket, Key):
        self.deleted.append((Bucket, Key))

    def copy_object(self, **kwargs):
        self.copies.append(kwargs)
        source = kwargs["CopySource"]
        source_item = next(
            item for item in self.objects[source["Bucket"]]
            if item["Key"] == source["Key"]
        )
        self.objects.setdefault(kwargs["Bucket"], []).append({
            "Key": kwargs["Key"],
            "Size": source_item["Size"],
            "ETag": source_item.get("ETag"),
        })


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


def test_smoke_test_reports_cleanup_failure_without_object_key():
    client = FakeClient()
    client.delete_object = MagicMock(side_effect=PermissionError("denied"))
    admin = storage_admin.R2StorageAdmin(client, "assets")

    with pytest.raises(storage_admin.StorageAdminError) as error:
        admin.smoke_test()

    assert error.value.code == "r2_delete_failed"
    assert error.value.cleanup_required is True
    assert "smoke-" not in str(error.value)


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


def test_database_inventory_reports_assets_with_missing_uploaders(
    monkeypatch, test_db, test_user
):
    valid_asset = models.Asset(
        asset_name="valid.png",
        r2_asset_id="valid",
        content_type="image/png",
        file_size=1,
        uploaded_by=test_user.id,
        r2_key="assets/valid.png",
        r2_bucket="assets",
    )
    orphaned_asset = models.Asset(
        asset_name="orphaned.png",
        r2_asset_id="orphaned",
        content_type="image/png",
        file_size=1,
        uploaded_by=99999,
        r2_key="assets/orphaned.png",
        r2_bucket="assets",
    )
    test_db.add_all([valid_asset, orphaned_asset])
    test_db.commit()
    testing_session = sessionmaker(bind=test_db.get_bind())
    monkeypatch.setattr(storage_admin, "SessionLocal", testing_session)

    inventory = storage_admin._database_asset_inventory()

    assert inventory["asset_rows"] == 2
    assert inventory["keys"] == ["assets/valid.png", "assets/orphaned.png"]
    assert inventory["orphaned_uploader_count"] == 1
    assert inventory["orphaned_uploaders"] == [{
        "asset_id": "orphaned",
        "r2_key": "assets/orphaned.png",
        "uploaded_by": 99999,
        "session_links": 0,
    }]


def test_privileged_storage_audit_excludes_object_keys(monkeypatch):
    db = MagicMock()
    monkeypatch.setattr(storage_admin, "SessionLocal", lambda: db)

    storage_admin._record_admin_audit(
        "audit",
        "success",
        {
            "dry_run": True,
            "missing_objects": ["assets/private-one.png"],
            "orphan_objects": ["assets/private-two.png"],
        },
    )

    row = db.add.call_args.args[0]
    assert row.action == "r2.audit"
    assert "private-one" not in row.details_json
    assert "private-two" not in row.details_json
    assert '"missing_count":1' in row.details_json
    assert '"orphan_count":1' in row.details_json
