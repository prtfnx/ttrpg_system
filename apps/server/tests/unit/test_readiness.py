from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine, text

from service.readiness import ReadinessChecker


class FakeR2Manager:
    def __init__(self, configured=True, client=None):
        self.configured = configured
        self.s3_client = client

    def is_r2_configured(self):
        return self.configured


class FakeR2Client:
    def __init__(self, origins=None, lifecycle=True):
        self.origins = origins or ["https://app.example.com"]
        self.lifecycle = lifecycle

    def head_bucket(self, Bucket):
        return {"Bucket": Bucket}

    def get_bucket_cors(self, Bucket):
        return {
            "CORSRules": [{
                "AllowedOrigins": self.origins,
                "AllowedMethods": ["GET", "HEAD", "PUT"],
                "AllowedHeaders": [
                    "Content-Type",
                    "x-amz-meta-xxhash",
                    "x-amz-meta-upload-timestamp",
                ],
            }]
        }

    def get_bucket_lifecycle_configuration(self, Bucket):
        rules = [{"Status": "Enabled", "Filter": {"Prefix": "pending/"}}] if self.lifecycle else []
        return {"Rules": rules}


def _engine_with_asset_tables():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE assets (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE session_assets (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE asset_upload_intents (id INTEGER PRIMARY KEY)"))
    return engine


def _settings(production=True):
    return SimpleNamespace(
        is_production=production,
        r2_bucket_name="assets",
        cors_origin_list=["https://app.example.com"],
    )


def test_production_readiness_passes_with_all_dependencies(tmp_path):
    static_ui = tmp_path / "index.html"
    static_ui.write_text("ready", encoding="utf-8")
    checker = ReadinessChecker(
        _settings(),
        _engine_with_asset_tables(),
        FakeR2Manager(client=FakeR2Client()),
        static_ui,
    )

    result = checker.run()

    assert result["status"] == "ready"
    assert all(check["ok"] for check in result["checks"].values())


def test_production_readiness_reports_missing_r2_configuration(tmp_path):
    static_ui = tmp_path / "index.html"
    static_ui.write_text("ready", encoding="utf-8")
    checker = ReadinessChecker(
        _settings(),
        _engine_with_asset_tables(),
        FakeR2Manager(configured=False),
        static_ui,
    )

    result = checker.run()

    assert result["status"] == "not_ready"
    assert "not configured" in result["checks"]["r2"]["error"]


def test_readiness_rejects_incomplete_bucket_policy(tmp_path):
    static_ui = tmp_path / "index.html"
    static_ui.write_text("ready", encoding="utf-8")
    checker = ReadinessChecker(
        _settings(),
        _engine_with_asset_tables(),
        FakeR2Manager(client=FakeR2Client(origins=["https://wrong.example.com"], lifecycle=False)),
        static_ui,
    )

    result = checker.run()

    assert result["status"] == "not_ready"
    assert "CORS" in result["checks"]["r2"]["error"]


def test_development_skips_optional_ui_and_r2_checks():
    checker = ReadinessChecker(
        _settings(production=False),
        _engine_with_asset_tables(),
        FakeR2Manager(configured=False),
        Path("missing.html"),
    )

    result = checker.run()

    assert result["status"] == "ready"
    assert result["checks"]["static_ui"]["skipped"] is True
    assert result["checks"]["r2"]["skipped"] is True
