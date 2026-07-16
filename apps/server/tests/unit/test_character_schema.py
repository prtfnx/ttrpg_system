import importlib
import json
import sqlite3

import pytest

from service.character_schema import validate_character_document


def test_legacy_character_is_migrated_without_losing_unknown_fields():
    original = {
        "character_id": "hero-1",
        "name": "Aria",
        "data": {
            "abilityScores": {"str": 16, "dex": 12},
            "stats": {"hp": 10, "maxHp": 15, "custom": "preserved"},
            "futureFeature": {"enabled": True},
        },
        "extension": [1, 2, 3],
    }

    migrated = validate_character_document(original)

    assert migrated["schemaVersion"] == 1
    assert migrated["extension"] == [1, 2, 3]
    assert migrated["data"]["stats"]["custom"] == "preserved"
    assert "schemaVersion" not in original


@pytest.mark.parametrize(
    ("document", "message"),
    [
        ({"schemaVersion": 2, "character_id": "c", "name": "C"}, "Unsupported"),
        ({"character_id": "c", "name": "C", "data": {"stats": {"hp": -1}}}, "greater than"),
        ({"character_id": "c", "name": "C", "data": {"abilityScores": {"luck": 20}}}, "Unsupported ability"),
        ({"character_id": "c", "name": "C", "controlledBy": [2, 2]}, "duplicate"),
    ],
)
def test_invalid_character_fields_fail_closed(document, message):
    with pytest.raises(ValueError, match=message):
        validate_character_document(document)


def test_database_migration_backfills_identity_and_version(tmp_path):
    version_character_documents = importlib.import_module(
        "database.migrations.030_version_character_documents"
    )

    database = tmp_path / "characters.sqlite3"
    with sqlite3.connect(database) as connection:
        connection.execute(
            "CREATE TABLE session_characters ("
            "character_id TEXT PRIMARY KEY, character_name TEXT, character_data TEXT)"
        )
        connection.execute(
            "INSERT INTO session_characters VALUES (?, ?, ?)",
            ("legacy-1", "Legacy", json.dumps({"data": {"stats": {"hp": 5}}})),
        )

    version_character_documents.upgrade(str(database))

    with sqlite3.connect(database) as connection:
        document = json.loads(
            connection.execute("SELECT character_data FROM session_characters").fetchone()[0]
        )
    assert document["schemaVersion"] == 1
    assert document["character_id"] == "legacy-1"
    assert document["name"] == "Legacy"
