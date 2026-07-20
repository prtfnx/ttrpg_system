"""Import a legacy SQLite application database into an empty PostgreSQL schema.

Alembic remains the schema authority. This script is a one-time data bridge
from the retired SQLite layout to the current SQLAlchemy model layout.
"""

# ruff: noqa: E402

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from config import Settings
from database.models import Base
from database.schema import schema_is_current_for_connection
from database.url import normalize_database_url
from service.character_schema import validate_character_document
from sqlalchemy import Boolean, DateTime, String, create_engine, inspect, select, text
from sqlalchemy.engine import Connection

IMPORT_ADVISORY_LOCK_ID = 0x545452504749
IGNORED_LEGACY_TABLES = {"game_players_new", "schema_migrations", "session_permissions"}
MERGED_LEGACY_TABLES = {"audit_log"}


class ImportValidationError(RuntimeError):
    """Raised when importing would be ambiguous or unsafe."""


@dataclass
class PreparedImport:
    """Validated rows and a bounded migration report."""

    rows_by_table: dict[str, list[dict[str, Any]]]
    source_counts: dict[str, int]
    skipped_counts: dict[str, int] = field(default_factory=dict)
    transformed_counts: dict[str, int] = field(default_factory=dict)

    @property
    def imported_row_count(self) -> int:
        return sum(len(rows) for rows in self.rows_by_table.values())


def _quote_sqlite_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _source_fingerprint(source_path: Path) -> str:
    digest = hashlib.sha256()
    with source_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sqlite_tables(connection: sqlite3.Connection) -> set[str]:
    return {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        )
    }


def _sqlite_columns(connection: sqlite3.Connection, table_name: str) -> set[str]:
    quoted = _quote_sqlite_identifier(table_name)
    return {row[1] for row in connection.execute(f"PRAGMA table_info({quoted})")}


def _sqlite_row_count(connection: sqlite3.Connection, table_name: str) -> int:
    quoted = _quote_sqlite_identifier(table_name)
    return int(connection.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0])


def _read_rows(
    connection: sqlite3.Connection,
    table_name: str,
    columns: list[str],
) -> list[dict[str, Any]]:
    if not columns:
        return []
    quoted_table = _quote_sqlite_identifier(table_name)
    quoted_columns = ", ".join(_quote_sqlite_identifier(column) for column in columns)
    cursor = connection.execute(f"SELECT {quoted_columns} FROM {quoted_table} ORDER BY rowid")
    return [dict(row) for row in cursor]


def _coerce_value(column, value: Any) -> Any:
    if value is None:
        return None
    if isinstance(column.type, Boolean):
        return bool(value)
    if isinstance(column.type, DateTime) and isinstance(value, str):
        normalized = value.strip().replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    return value


def _coerce_row(table, row: dict[str, Any]) -> dict[str, Any]:
    return {
        name: _coerce_value(table.c[name], value)
        for name, value in row.items()
    }


def _normalized_audit_row(
    row: dict[str, Any],
    *,
    event_id: str,
    target_user_id: Any = None,
    timestamp_key: str = "timestamp",
) -> dict[str, Any]:
    event_type = str(row["event_type"])
    return {
        "event_id": event_id,
        "event_type": event_type,
        "action": event_type.lower(),
        "outcome": "success",
        "target_type": "user" if target_user_id is not None else None,
        "target_id": str(target_user_id) if target_user_id is not None else None,
        "session_code": row.get("session_code"),
        "user_id": row.get("user_id"),
        "ip_address": row.get("ip_address"),
        "user_agent": row.get("user_agent"),
        "details": row.get("details"),
        "details_json": row.get("details"),
        "request_id": None,
        "trace_id": None,
        "source_service": "ttrpg-server",
        "service_version": "legacy-sqlite-import",
        "schema_version": 1,
        "timestamp": row.get(timestamp_key),
    }


def _validate_character_row(row: dict[str, Any]) -> None:
    try:
        document = json.loads(row["character_data"])
    except (TypeError, json.JSONDecodeError) as exc:
        raise ImportValidationError(
            f"Character {row.get('character_id')} contains invalid JSON"
        ) from exc
    if not isinstance(document, dict):
        raise ImportValidationError(
            f"Character {row.get('character_id')} must contain a JSON object"
        )
    document.setdefault("character_id", row["character_id"])
    document.setdefault("name", row.get("character_name") or "Unnamed Character")
    row["character_data"] = json.dumps(
        validate_character_document(document),
        separators=(",", ":"),
    )


def _validate_required_values(rows_by_table: dict[str, list[dict[str, Any]]]) -> None:
    for table_name, rows in rows_by_table.items():
        table = Base.metadata.tables[table_name]
        for row_number, row in enumerate(rows, start=1):
            for column in table.columns:
                if column.name in row:
                    value = row[column.name]
                    if value is None and not column.nullable:
                        raise ImportValidationError(
                            f"{table_name} row {row_number} has NULL in required "
                            f"column {column.name}"
                        )
                    if (
                        value is not None
                        and isinstance(column.type, String)
                        and column.type.length is not None
                        and len(str(value)) > column.type.length
                    ):
                        raise ImportValidationError(
                            f"{table_name} row {row_number} exceeds the length of "
                            f"column {column.name}"
                        )
                    continue
                if (
                    not column.nullable
                    and not column.primary_key
                    and column.default is None
                    and column.server_default is None
                ):
                    raise ImportValidationError(
                        f"{table_name} row {row_number} lacks required column "
                        f"{column.name}"
                    )


def _validate_sqlite_integrity(
    connection: sqlite3.Connection,
    *,
    skip_invalid_assets: bool,
) -> set[int]:
    integrity = connection.execute("PRAGMA integrity_check").fetchone()
    if not integrity or integrity[0] != "ok":
        raise ImportValidationError("SQLite integrity_check failed")

    user_ids = {row[0] for row in connection.execute("SELECT id FROM users")}
    skipped_asset_ids: set[int] = set()
    unexpected: list[tuple[Any, ...]] = []
    for table_name, rowid, parent_name, _foreign_key_id in connection.execute(
        "PRAGMA foreign_key_check"
    ):
        if table_name == "assets" and parent_name == "users":
            asset = connection.execute(
                "SELECT id, uploaded_by FROM assets WHERE rowid = ?",
                (rowid,),
            ).fetchone()
            if asset and asset["uploaded_by"] not in user_ids:
                skipped_asset_ids.add(int(asset["id"]))
                continue
        unexpected.append((table_name, rowid, parent_name))

    if unexpected:
        raise ImportValidationError(
            f"SQLite contains {len(unexpected)} unsupported foreign-key violations"
        )
    if skipped_asset_ids and not skip_invalid_assets:
        raise ImportValidationError(
            f"SQLite contains {len(skipped_asset_ids)} assets owned by missing users; "
            "review them and rerun with --skip-invalid-assets"
        )
    return skipped_asset_ids


def _merge_legacy_audit_rows(
    connection: sqlite3.Connection,
    rows: list[dict[str, Any]],
    fingerprint: str,
) -> int:
    if "audit_log" not in _sqlite_tables(connection):
        return 0
    columns = [
        "id",
        "event_type",
        "session_code",
        "user_id",
        "target_user_id",
        "details",
        "ip_address",
        "created_at",
    ]
    legacy_rows = _read_rows(connection, "audit_log", columns)
    next_id = max((int(row["id"]) for row in rows), default=0) + 1
    for offset, legacy_row in enumerate(legacy_rows):
        event_id = str(
            uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"ttrpg-sqlite-audit:{fingerprint}:audit_log:{legacy_row['id']}",
            )
        )
        normalized = _normalized_audit_row(
            legacy_row,
            event_id=event_id,
            target_user_id=legacy_row.get("target_user_id"),
            timestamp_key="created_at",
        )
        normalized["id"] = next_id + offset
        rows.append(normalized)
    return len(legacy_rows)


def _backfill_session_assets(
    connection: sqlite3.Connection,
    rows_by_table: dict[str, list[dict[str, Any]]],
    skipped_asset_ids: set[int],
) -> int:
    if "assets" not in _sqlite_tables(connection):
        return 0
    asset_columns = _sqlite_columns(connection, "assets")
    if "session_id" not in asset_columns:
        return 0

    links = rows_by_table["session_assets"]
    existing_pairs = {(row["session_id"], row["asset_id"]) for row in links}
    retained_asset_ids = {row["id"] for row in rows_by_table["assets"]}
    session_ids = {row["id"] for row in rows_by_table["game_sessions"]}
    user_ids = {row["id"] for row in rows_by_table["users"]}
    next_id = max((int(row["id"]) for row in links), default=0) + 1
    created = 0
    columns = [
        "id",
        "session_id",
        "asset_name",
        "uploaded_by",
        "created_at",
        "last_accessed",
    ]
    for asset in _read_rows(connection, "assets", columns):
        pair = (asset["session_id"], asset["id"])
        if (
            asset["id"] in skipped_asset_ids
            or asset["id"] not in retained_asset_ids
            or asset["session_id"] is None
            or asset["session_id"] not in session_ids
            or asset["uploaded_by"] not in user_ids
            or pair in existing_pairs
        ):
            continue
        links.append(
            {
                "id": next_id + created,
                "session_id": asset["session_id"],
                "asset_id": asset["id"],
                "display_name": asset["asset_name"],
                "added_by": asset["uploaded_by"],
                "created_at": _coerce_value(
                    Base.metadata.tables["session_assets"].c.created_at,
                    asset["created_at"],
                ),
                "last_accessed": _coerce_value(
                    Base.metadata.tables["session_assets"].c.last_accessed,
                    asset["last_accessed"] or asset["created_at"],
                ),
            }
        )
        existing_pairs.add(pair)
        created += 1
    return created


def _backfill_character_permissions(
    rows_by_table: dict[str, list[dict[str, Any]]],
) -> int:
    permissions = rows_by_table["character_permissions"]
    existing_pairs = {
        (row["character_id"], row["user_id"])
        for row in permissions
    }
    memberships = {
        (row["session_id"], row["user_id"])
        for row in rows_by_table["game_players"]
    }
    next_id = max((int(row["id"]) for row in permissions), default=0) + 1
    created = 0
    for character in rows_by_table["session_characters"]:
        document = json.loads(character["character_data"])
        controlled_by = document.get("controlledBy", [])
        if not isinstance(controlled_by, list):
            continue
        for raw_user_id in controlled_by:
            try:
                user_id = int(raw_user_id)
            except (TypeError, ValueError):
                continue
            pair = (character["character_id"], user_id)
            if (
                user_id == character["owner_user_id"]
                or pair in existing_pairs
                or (character["session_id"], user_id) not in memberships
            ):
                continue
            permissions.append(
                {
                    "id": next_id + created,
                    "character_id": character["character_id"],
                    "session_id": character["session_id"],
                    "user_id": user_id,
                    "can_view": True,
                    "can_edit": True,
                    "can_control": True,
                    "granted_by": character["owner_user_id"],
                    "created_at": None,
                }
            )
            existing_pairs.add(pair)
            created += 1
    return created


def _repair_entity_character_links(
    rows_by_table: dict[str, list[dict[str, Any]]],
) -> int:
    character_ids = {
        row["character_id"] for row in rows_by_table["session_characters"]
    }
    repaired = 0
    for entity in rows_by_table["entities"]:
        character_id = entity.get("character_id")
        if character_id is not None and character_id not in character_ids:
            entity["character_id"] = None
            repaired += 1
    return repaired


def prepare_import(
    source_path: Path,
    *,
    skip_invalid_assets: bool = False,
) -> PreparedImport:
    """Read and validate the legacy source without modifying it."""
    source_path = source_path.resolve()
    if not source_path.is_file():
        raise ImportValidationError("SQLite source file does not exist")

    uri = f"file:{source_path.as_posix()}?mode=ro"
    with sqlite3.connect(uri, uri=True) as connection:
        connection.row_factory = sqlite3.Row
        source_tables = _sqlite_tables(connection)
        if "users" not in source_tables:
            raise ImportValidationError("SQLite source has no application schema")

        source_counts = {
            table_name: _sqlite_row_count(connection, table_name)
            for table_name in sorted(source_tables)
        }
        model_tables = set(Base.metadata.tables)
        unknown_nonempty = {
            table_name: source_counts[table_name]
            for table_name in source_tables
            if table_name not in model_tables | IGNORED_LEGACY_TABLES | MERGED_LEGACY_TABLES
            and source_counts[table_name]
        }
        if unknown_nonempty:
            raise ImportValidationError(
                f"SQLite contains unsupported nonempty tables: {sorted(unknown_nonempty)}"
            )
        nonempty_ignored = {
            table_name: source_counts[table_name]
            for table_name in IGNORED_LEGACY_TABLES
            if source_counts.get(table_name, 0)
            and table_name != "schema_migrations"
        }
        if nonempty_ignored:
            raise ImportValidationError(
                f"SQLite contains data in retired tables: {sorted(nonempty_ignored)}"
            )

        skipped_asset_ids = _validate_sqlite_integrity(
            connection,
            skip_invalid_assets=skip_invalid_assets,
        )
        fingerprint = _source_fingerprint(source_path)
        rows_by_table: dict[str, list[dict[str, Any]]] = {
            table_name: [] for table_name in Base.metadata.tables
        }

        for table_name, table in Base.metadata.tables.items():
            if table_name not in source_tables:
                continue
            source_columns = _sqlite_columns(connection, table_name)
            selected_columns = [
                column.name for column in table.columns if column.name in source_columns
            ]
            source_rows = _read_rows(connection, table_name, selected_columns)
            for source_row in source_rows:
                if table_name == "assets" and source_row["id"] in skipped_asset_ids:
                    continue
                row = _coerce_row(table, source_row)
                if table_name == "virtual_tables":
                    row.setdefault("difficult_terrain_json", "[]")
                    row.setdefault("cover_zones_json", "[]")
                elif table_name == "combat_encounters":
                    row.setdefault("state_version", 0)
                elif table_name == "chat_messages":
                    row.setdefault("client_operation_id", row["message_id"])
                elif table_name == "session_characters":
                    row.setdefault("archived_at", None)
                    row.setdefault("archived_by", None)
                    _validate_character_row(row)
                elif table_name == "audit_logs":
                    source_id = row["id"]
                    event_id = str(
                        uuid.uuid5(
                            uuid.NAMESPACE_URL,
                            f"ttrpg-sqlite-audit:{fingerprint}:audit_logs:{source_id}",
                        )
                    )
                    normalized = _normalized_audit_row(row, event_id=event_id)
                    normalized["id"] = source_id
                    row = _coerce_row(table, normalized)
                rows_by_table[table_name].append(row)

        merged_audit_count = _merge_legacy_audit_rows(
            connection,
            rows_by_table["audit_logs"],
            fingerprint,
        )
        rows_by_table["audit_logs"] = [
            _coerce_row(Base.metadata.tables["audit_logs"], row)
            for row in rows_by_table["audit_logs"]
        ]
        session_asset_count = _backfill_session_assets(
            connection,
            rows_by_table,
            skipped_asset_ids,
        )
        permission_count = _backfill_character_permissions(rows_by_table)
        entity_link_count = _repair_entity_character_links(rows_by_table)

    _validate_required_values(rows_by_table)
    return PreparedImport(
        rows_by_table=rows_by_table,
        source_counts=source_counts,
        skipped_counts={
            "assets_missing_uploader": len(skipped_asset_ids),
            "schema_migrations": source_counts.get("schema_migrations", 0),
        },
        transformed_counts={
            "legacy_audit_rows_merged": merged_audit_count,
            "session_asset_links_backfilled": session_asset_count,
            "character_permissions_backfilled": permission_count,
            "entity_character_links_cleared": entity_link_count,
        },
    )


def _validate_empty_postgresql_target(connection: Connection) -> None:
    if connection.dialect.name != "postgresql":
        raise ImportValidationError("Destination DATABASE_URL must use PostgreSQL")
    expected_tables = set(Base.metadata.tables) | {"alembic_version"}
    actual_tables = set(inspect(connection).get_table_names())
    if actual_tables != expected_tables:
        raise ImportValidationError(
            "Destination schema does not match the current application tables"
        )
    if not schema_is_current_for_connection(connection):
        raise ImportValidationError("Destination database is not at the Alembic head")

    nonempty = {
        table_name: int(
            connection.execute(
                select(text("count(*)")).select_from(Base.metadata.tables[table_name])
            ).scalar_one()
        )
        for table_name in Base.metadata.tables
    }
    nonempty = {table_name: count for table_name, count in nonempty.items() if count}
    if nonempty:
        raise ImportValidationError(
            f"Destination application tables are not empty: {sorted(nonempty)}"
        )


def _reset_postgresql_sequences(connection: Connection) -> None:
    for table in Base.metadata.sorted_tables:
        integer_primary_keys = [
            column for column in table.primary_key.columns if column.autoincrement
        ]
        for column in integer_primary_keys:
            sequence_name = connection.execute(
                text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
                {"table_name": table.name, "column_name": column.name},
            ).scalar_one_or_none()
            if not sequence_name:
                continue
            maximum = connection.execute(
                select(table.c[column.name]).order_by(table.c[column.name].desc()).limit(1)
            ).scalar_one_or_none()
            connection.execute(
                text("SELECT setval(CAST(:sequence_name AS regclass), :value, :called)"),
                {
                    "sequence_name": sequence_name,
                    "value": maximum if maximum is not None else 1,
                    "called": maximum is not None,
                },
            )


def import_into_postgresql(
    prepared: PreparedImport,
    database_url: str,
    *,
    commit: bool,
) -> dict[str, int]:
    """Exercise the complete import and either commit or roll it back."""
    engine = create_engine(
        normalize_database_url(database_url),
        pool_pre_ping=True,
        connect_args={"connect_timeout": 10},
    )
    connection = engine.connect()
    transaction = connection.begin()
    try:
        connection.execute(
            text("SELECT pg_advisory_xact_lock(:lock_id)"),
            {"lock_id": IMPORT_ADVISORY_LOCK_ID},
        )
        _validate_empty_postgresql_target(connection)

        imported_counts: dict[str, int] = {}
        for table in Base.metadata.sorted_tables:
            rows = prepared.rows_by_table[table.name]
            if rows:
                connection.execute(table.insert(), rows)
            imported_counts[table.name] = len(rows)

        _reset_postgresql_sequences(connection)
        for table_name, expected_count in imported_counts.items():
            actual_count = int(
                connection.execute(
                    select(text("count(*)")).select_from(
                        Base.metadata.tables[table_name]
                    )
                ).scalar_one()
            )
            if actual_count != expected_count:
                raise ImportValidationError(
                    f"Destination count mismatch for {table_name}: "
                    f"expected {expected_count}, found {actual_count}"
                )

        if commit:
            transaction.commit()
        else:
            transaction.rollback()
        return imported_counts
    except Exception:
        if transaction.is_active:
            transaction.rollback()
        raise
    finally:
        connection.close()
        engine.dispose()


def _print_report(
    prepared: PreparedImport,
    imported_counts: dict[str, int],
    *,
    committed: bool,
) -> None:
    mode = "committed" if committed else "dry-run rolled back"
    print(f"SQLite to PostgreSQL import {mode}.")
    for table_name in Base.metadata.tables:
        count = imported_counts[table_name]
        if count:
            print(f"  {table_name}: {count}")
    print(f"  total application rows: {sum(imported_counts.values())}")
    for label, count in prepared.transformed_counts.items():
        if count:
            print(f"  {label}: {count}")
    for label, count in prepared.skipped_counts.items():
        if count:
            print(f"  skipped {label}: {count}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Import a legacy SQLite database into empty PostgreSQL tables"
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("ttrpg.db"),
        help="Legacy SQLite file (default: ./ttrpg.db)",
    )
    parser.add_argument(
        "--skip-invalid-assets",
        action="store_true",
        help="Skip assets whose uploaded_by user no longer exists",
    )
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Commit the import; without this flag the complete import is rolled back",
    )
    args = parser.parse_args()

    try:
        prepared = prepare_import(
            args.source,
            skip_invalid_assets=args.skip_invalid_assets,
        )
        settings = Settings()
        imported_counts = import_into_postgresql(
            prepared,
            settings.DATABASE_URL,
            commit=args.commit,
        )
        _print_report(prepared, imported_counts, committed=args.commit)
        return 0
    except ImportValidationError as exc:
        print(f"Import refused: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(
            f"Import failed ({type(exc).__name__}); no connection details were logged "
            "and the transaction was rolled back.",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
