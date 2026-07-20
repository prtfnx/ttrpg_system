"""Tests for the explicit legacy SQLite to PostgreSQL data bridge."""

from __future__ import annotations

import json
import sqlite3

import pytest
from scripts.import_sqlite_to_postgresql import (
    ImportValidationError,
    prepare_import,
)


def _legacy_database(path) -> None:
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            PRAGMA foreign_keys = OFF;
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL,
                email TEXT,
                full_name TEXT,
                hashed_password TEXT NOT NULL,
                disabled BOOLEAN NOT NULL,
                is_verified BOOLEAN NOT NULL,
                google_id TEXT,
                created_at DATETIME,
                password_set_at DATETIME,
                session_version INTEGER NOT NULL,
                role TEXT,
                tier TEXT
            );
            CREATE TABLE game_sessions (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                session_code TEXT NOT NULL,
                owner_id INTEGER NOT NULL REFERENCES users(id),
                is_active BOOLEAN NOT NULL,
                is_demo BOOLEAN NOT NULL,
                created_at DATETIME,
                game_data TEXT,
                ban_list TEXT,
                session_rules_json TEXT,
                game_mode TEXT
            );
            CREATE TABLE game_players (
                id INTEGER PRIMARY KEY,
                session_id INTEGER NOT NULL REFERENCES game_sessions(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                character_name TEXT,
                role TEXT,
                joined_at DATETIME,
                is_connected BOOLEAN NOT NULL,
                active_table_id TEXT,
                role_updated_at DATETIME,
                role_updated_by INTEGER
            );
            CREATE TABLE assets (
                id INTEGER PRIMARY KEY,
                asset_name TEXT NOT NULL,
                r2_asset_id TEXT NOT NULL,
                content_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                xxhash TEXT,
                uploaded_by INTEGER NOT NULL REFERENCES users(id),
                created_at DATETIME,
                updated_at DATETIME,
                last_accessed DATETIME,
                r2_key TEXT NOT NULL,
                r2_bucket TEXT NOT NULL,
                session_id INTEGER
            );
            CREATE TABLE session_assets (
                id INTEGER PRIMARY KEY,
                session_id INTEGER NOT NULL,
                asset_id INTEGER NOT NULL,
                display_name TEXT NOT NULL,
                added_by INTEGER NOT NULL,
                created_at DATETIME,
                last_accessed DATETIME
            );
            CREATE TABLE virtual_tables (
                id INTEGER PRIMARY KEY,
                table_id TEXT NOT NULL,
                name TEXT NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                session_id INTEGER NOT NULL,
                position_x FLOAT NOT NULL,
                position_y FLOAT NOT NULL,
                scale_x FLOAT NOT NULL,
                scale_y FLOAT NOT NULL,
                layer_visibility TEXT,
                layer_settings TEXT,
                dynamic_lighting_enabled BOOLEAN NOT NULL,
                fog_exploration_mode TEXT,
                ambient_light_level FLOAT NOT NULL,
                grid_cell_px FLOAT NOT NULL,
                cell_distance FLOAT NOT NULL,
                distance_unit TEXT,
                grid_enabled BOOLEAN NOT NULL,
                snap_to_grid BOOLEAN NOT NULL,
                grid_color_hex TEXT,
                background_color_hex TEXT,
                created_at DATETIME,
                updated_at DATETIME
            );
            CREATE TABLE combat_encounters (
                id INTEGER PRIMARY KEY,
                encounter_id TEXT NOT NULL,
                session_id INTEGER NOT NULL,
                table_id TEXT NOT NULL,
                phase TEXT,
                round_number INTEGER NOT NULL,
                current_turn_index INTEGER NOT NULL,
                combatants_json TEXT,
                settings_json TEXT,
                action_log_json TEXT,
                started_at DATETIME,
                ended_at DATETIME,
                created_at DATETIME
            );
            CREATE TABLE chat_messages (
                id INTEGER PRIMARY KEY,
                message_id TEXT NOT NULL,
                session_id INTEGER NOT NULL,
                user_id INTEGER,
                username TEXT,
                channel TEXT NOT NULL,
                recipient_user_id INTEGER,
                table_id TEXT,
                text TEXT NOT NULL,
                message_json TEXT NOT NULL,
                attachments_json TEXT,
                client_timestamp FLOAT,
                created_at DATETIME
            );
            CREATE TABLE session_characters (
                id INTEGER PRIMARY KEY,
                character_id TEXT NOT NULL,
                session_id INTEGER NOT NULL,
                character_name TEXT NOT NULL,
                character_data TEXT NOT NULL,
                owner_user_id INTEGER NOT NULL,
                created_at DATETIME,
                updated_at DATETIME,
                version INTEGER NOT NULL,
                last_modified_by INTEGER,
                token_asset_id TEXT
            );
            CREATE TABLE audit_logs (
                id INTEGER PRIMARY KEY,
                event_type TEXT NOT NULL,
                session_code TEXT,
                user_id INTEGER,
                ip_address TEXT,
                user_agent TEXT,
                details TEXT,
                timestamp DATETIME
            );
            CREATE TABLE audit_log (
                id INTEGER PRIMARY KEY,
                event_type TEXT NOT NULL,
                session_code TEXT,
                user_id INTEGER,
                target_user_id INTEGER,
                details TEXT,
                ip_address TEXT,
                created_at DATETIME
            );
            CREATE TABLE schema_migrations (
                id INTEGER PRIMARY KEY,
                migration_name TEXT NOT NULL,
                applied_at DATETIME
            );
            """
        )
        connection.execute(
            "INSERT INTO users VALUES "
            "(1, 'owner', NULL, NULL, 'hash', 0, 1, NULL, "
            "'2026-01-01 00:00:00', NULL, 0, 'owner', 'free')"
        )
        connection.execute(
            "INSERT INTO game_sessions VALUES "
            "(1, 'Game', 'ABC', 1, 1, 0, '2026-01-01 00:00:00', "
            "NULL, '[]', '{}', 'free_roam')"
        )
        connection.execute(
            "INSERT INTO game_players VALUES "
            "(1, 1, 1, NULL, 'owner', '2026-01-01 00:00:00', 0, "
            "NULL, NULL, NULL)"
        )
        assets = [
            (
                1,
                "valid.png",
                "valid",
                "image/png",
                10,
                None,
                1,
                "2026-01-01 00:00:00",
                "2026-01-01 00:00:00",
                "2026-01-01 00:00:00",
                "valid",
                "bucket",
                1,
            ),
            (
                2,
                "orphan.png",
                "orphan",
                "image/png",
                10,
                None,
                0,
                "2026-01-01 00:00:00",
                "2026-01-01 00:00:00",
                "2026-01-01 00:00:00",
                "orphan",
                "bucket",
                None,
            ),
        ]
        connection.executemany(
            "INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            assets,
        )
        connection.execute(
            "INSERT INTO virtual_tables VALUES "
            "(1, 'table-1', 'Table', 100, 100, 1, 0, 0, 1, 1, '{}', "
            "NULL, 0, 'current_only', 1, 50, 5, 'ft', 1, 1, '#fff', "
            "'#000', NULL, NULL)"
        )
        connection.execute(
            "INSERT INTO combat_encounters VALUES "
            "(1, 'combat-1', 1, 'table-1', 'active', 1, 0, '[]', '{}', "
            "'[]', NULL, NULL, NULL)"
        )
        connection.execute(
            "INSERT INTO chat_messages VALUES "
            "(1, 'message-1', 1, 1, 'owner', 'public', NULL, NULL, "
            "'hello', '{}', NULL, NULL, NULL)"
        )
        character_data = json.dumps({"name": "Hero", "controlledBy": [1]})
        connection.execute(
            "INSERT INTO session_characters VALUES "
            "(1, 'character-1', 1, 'Hero', ?, 1, NULL, NULL, 1, 1, NULL)",
            (character_data,),
        )
        connection.execute(
            "INSERT INTO audit_logs VALUES "
            "(1, 'login', 'ABC', 1, NULL, NULL, '{}', '2026-01-01 00:00:00')"
        )
        connection.execute(
            "INSERT INTO audit_log VALUES "
            "(1, 'invite', 'ABC', 1, 1, '{}', NULL, '2026-01-02 00:00:00')"
        )
        connection.execute(
            "INSERT INTO schema_migrations VALUES (1, '001_example', NULL)"
        )


@pytest.mark.unit
def test_prepare_import_rejects_orphan_assets_by_default(tmp_path):
    source = tmp_path / "legacy.db"
    _legacy_database(source)

    with pytest.raises(ImportValidationError, match="missing users"):
        prepare_import(source)


@pytest.mark.unit
def test_prepare_import_transforms_legacy_schema_without_writing_source(tmp_path):
    source = tmp_path / "legacy.db"
    _legacy_database(source)
    original_bytes = source.read_bytes()

    prepared = prepare_import(source, skip_invalid_assets=True)

    assert [row["id"] for row in prepared.rows_by_table["assets"]] == [1]
    assert prepared.rows_by_table["chat_messages"][0]["client_operation_id"] == "message-1"
    assert prepared.rows_by_table["combat_encounters"][0]["state_version"] == 0
    assert prepared.rows_by_table["virtual_tables"][0]["difficult_terrain_json"] == "[]"
    assert prepared.rows_by_table["virtual_tables"][0]["cover_zones_json"] == "[]"
    assert len(prepared.rows_by_table["audit_logs"]) == 2
    assert prepared.rows_by_table["audit_logs"][1]["target_type"] == "user"
    assert prepared.rows_by_table["audit_logs"][1]["target_id"] == "1"
    assert prepared.rows_by_table["session_assets"][0]["asset_id"] == 1
    assert prepared.skipped_counts["assets_missing_uploader"] == 1
    assert prepared.transformed_counts["legacy_audit_rows_merged"] == 1
    assert prepared.transformed_counts["session_asset_links_backfilled"] == 1
    assert source.read_bytes() == original_bytes
