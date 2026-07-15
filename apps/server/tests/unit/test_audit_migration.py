import importlib
import sqlite3


migration = importlib.import_module("database.migrations.028_normalize_audit_events")


def test_audit_migration_backfills_versioned_envelope(tmp_path):
    db_path = tmp_path / "audit.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            "CREATE TABLE audit_logs ("
            "id INTEGER PRIMARY KEY, event_type VARCHAR(50) NOT NULL, details TEXT)"
        )
        connection.execute(
            "INSERT INTO audit_logs (event_type, details) VALUES ('PLAYER_KICKED', '{}')"
        )

    migration.upgrade(str(db_path))
    migration.upgrade(str(db_path))

    with sqlite3.connect(db_path) as connection:
        row = connection.execute(
            "SELECT event_id, action, outcome, schema_version, details_json FROM audit_logs"
        ).fetchone()
        assert row[0]
        assert row[1:] == ("player_kicked", "success", 1, "{}")
