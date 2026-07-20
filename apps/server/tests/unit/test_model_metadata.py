from sqlalchemy import ForeignKeyConstraint, PrimaryKeyConstraint, UniqueConstraint

from database.models import Base, NAMING_CONVENTION


EXPECTED_TABLES = {
    "asset_upload_intents",
    "assets",
    "audit_logs",
    "character_drafts",
    "character_logs",
    "character_permissions",
    "chat_messages",
    "choice_encounter_events",
    "choice_encounters",
    "combat_actions",
    "combat_encounters",
    "email_verification_tokens",
    "entities",
    "game_players",
    "game_sessions",
    "paint_strokes",
    "password_reset_tokens",
    "pending_email_changes",
    "session_assets",
    "session_characters",
    "session_invitations",
    "users",
    "virtual_tables",
    "walls",
}


def test_metadata_contains_the_complete_current_schema():
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_metadata_uses_deterministic_constraint_names():
    assert Base.metadata.naming_convention == NAMING_CONVENTION

    for table in Base.metadata.sorted_tables:
        for constraint in table.constraints:
            if isinstance(
                constraint,
                (ForeignKeyConstraint, PrimaryKeyConstraint, UniqueConstraint),
            ):
                assert constraint.name, f"{table.name} has an unnamed {type(constraint).__name__}"


def test_all_foreign_key_targets_resolve():
    for table in Base.metadata.sorted_tables:
        for foreign_key in table.foreign_keys:
            assert foreign_key.column.table.name in EXPECTED_TABLES


def test_integer_primary_keys_autoincrement():
    for table in Base.metadata.sorted_tables:
        primary_key_columns = list(table.primary_key.columns)
        assert primary_key_columns, f"{table.name} has no primary key"
        if len(primary_key_columns) == 1 and primary_key_columns[0].type.python_type is int:
            assert primary_key_columns[0].autoincrement in {"auto", True}
