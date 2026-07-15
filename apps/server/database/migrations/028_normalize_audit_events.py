"""Add a versioned, correlated security audit-event envelope."""

import sqlite3


def _columns(cursor: sqlite3.Cursor) -> set[str]:
    return {row[1] for row in cursor.execute("PRAGMA table_info('audit_logs')")}


def upgrade(db_path: str) -> None:
    additions = {
        "event_id": "VARCHAR(36)",
        "action": "VARCHAR(80)",
        "outcome": "VARCHAR(20) DEFAULT 'success'",
        "target_type": "VARCHAR(50)",
        "target_id": "VARCHAR(100)",
        "details_json": "TEXT",
        "request_id": "VARCHAR(128)",
        "trace_id": "VARCHAR(32)",
        "source_service": "VARCHAR(100) DEFAULT 'ttrpg-server'",
        "service_version": "VARCHAR(100) DEFAULT 'legacy'",
        "schema_version": "INTEGER DEFAULT 1",
    }
    with sqlite3.connect(db_path) as connection:
        cursor = connection.cursor()
        existing = _columns(cursor)
        for name, definition in additions.items():
            if name not in existing:
                cursor.execute(f"ALTER TABLE audit_logs ADD COLUMN {name} {definition}")
        cursor.execute(
            "UPDATE audit_logs SET event_id = lower(hex(randomblob(16))) "
            "WHERE event_id IS NULL OR event_id = ''"
        )
        cursor.execute(
            "UPDATE audit_logs SET action = lower(event_type) "
            "WHERE action IS NULL OR action = ''"
        )
        cursor.execute("UPDATE audit_logs SET details_json = details WHERE details_json IS NULL")
        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_audit_logs_event_id ON audit_logs(event_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_audit_logs_action_outcome "
            "ON audit_logs(action, outcome)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_audit_logs_request_id ON audit_logs(request_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_audit_logs_trace_id ON audit_logs(trace_id)"
        )


def downgrade(db_path: str) -> None:
    # SQLite column removal would require a table rebuild; retain compatible data.
    pass
