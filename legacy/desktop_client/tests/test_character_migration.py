"""
Tests for character-sprite linking database migration
"""
import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from server_host.database.models import Base


def test_models_have_character_linking_columns():
    """Ensure SQLAlchemy models define the new migration columns.

    This test builds the models into an in-memory SQLite database and
    inspects the created table schemas for the expected columns.
    """
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    inspector = inspect(engine)

    entities_cols = {c['name'] for c in inspector.get_columns('entities')}
    session_chars_cols = {c['name'] for c in inspector.get_columns('session_characters')}

    assert 'character_id' in entities_cols, "entities.character_id column missing"
    assert 'controlled_by' in entities_cols, "entities.controlled_by column missing"
    assert 'version' in session_chars_cols, "session_characters.version column missing"
    assert 'last_modified_by' in session_chars_cols, "session_characters.last_modified_by column missing"
