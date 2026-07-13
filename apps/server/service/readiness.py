"""Release readiness checks for durable application dependencies."""

from pathlib import Path

from sqlalchemy import inspect, text


REQUIRED_TABLES = {"assets", "session_assets", "asset_upload_intents"}
REQUIRED_R2_METHODS = {"GET", "HEAD", "PUT"}
REQUIRED_R2_HEADERS = {"content-type", "x-amz-meta-xxhash", "x-amz-meta-upload-timestamp"}


class ReadinessChecker:
    def __init__(self, settings, engine, r2_manager, static_ui_path: Path):
        self.settings = settings
        self.engine = engine
        self.r2_manager = r2_manager
        self.static_ui_path = static_ui_path

    def run(self) -> dict:
        checks = {
            "database": self._check_database(),
            "static_ui": self._check_static_ui(),
            "r2": self._check_r2(),
        }
        return {
            "status": "ready" if all(check["ok"] for check in checks.values()) else "not_ready",
            "checks": checks,
        }

    def _check_database(self) -> dict:
        try:
            with self.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            tables = set(inspect(self.engine).get_table_names())
            missing = sorted(REQUIRED_TABLES - tables)
            if missing:
                return {"ok": False, "error": f"Missing required tables: {', '.join(missing)}"}
            return {"ok": True}
        except Exception as exc:
            return {"ok": False, "error": f"Database check failed: {exc}"}

    def _check_static_ui(self) -> dict:
        if not self.settings.is_production:
            return {"ok": True, "skipped": True}
        if not self.static_ui_path.is_file():
            return {"ok": False, "error": f"Static UI artifact missing: {self.static_ui_path}"}
        return {"ok": True}

    def _check_r2(self) -> dict:
        if not self.r2_manager.is_r2_configured():
            if self.settings.is_production:
                return {"ok": False, "error": "R2 asset storage is not configured"}
            return {"ok": True, "skipped": True}

        try:
            client = self.r2_manager.s3_client
            bucket = self.settings.r2_bucket_name
            client.head_bucket(Bucket=bucket)
            cors_rules = client.get_bucket_cors(Bucket=bucket).get("CORSRules", [])
            lifecycle_rules = client.get_bucket_lifecycle_configuration(Bucket=bucket).get("Rules", [])
        except Exception as exc:
            return {"ok": False, "error": f"R2 access check failed: {exc}"}

        cors_error = self._validate_cors(cors_rules)
        if cors_error:
            return {"ok": False, "error": cors_error}
        lifecycle_ok = any(
            rule.get("Status") == "Enabled"
            and (rule.get("Filter") or {}).get("Prefix") == "pending/"
            for rule in lifecycle_rules
        )
        if not lifecycle_ok:
            return {"ok": False, "error": "R2 pending/ lifecycle rule is missing or disabled"}
        return {"ok": True}

    def _validate_cors(self, rules: list[dict]) -> str | None:
        required_origins = set(self.settings.cors_origin_list)
        for rule in rules:
            origins = set(rule.get("AllowedOrigins", []))
            methods = {method.upper() for method in rule.get("AllowedMethods", [])}
            headers = {header.lower() for header in rule.get("AllowedHeaders", [])}
            if (
                required_origins <= origins
                and REQUIRED_R2_METHODS <= methods
                and REQUIRED_R2_HEADERS <= headers
            ):
                return None
        return "R2 CORS does not allow the configured origins, methods, and upload headers"
