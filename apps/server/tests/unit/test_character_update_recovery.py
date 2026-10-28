"""An unavailable or superseded source is not evidence that a commit failed."""
from copy import deepcopy

import pytest
from database.models import SessionCharacter
from service.character_update_recovery import (
    CharacterUpdateOutcomeUnknown,
    CharacterUpdateRecovery,
    PendingCharacterUpdate,
)
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def recovery(test_db, test_game_session):
    before = '{"name":"Hero","hp":20}'
    after = '{"name":"Hero","hp":5}'
    source = SessionCharacter(character_id="recover-character", session_id=test_game_session.id,
        owner_user_id=test_game_session.owner_id, character_name="Hero", character_data=before, version=1)
    test_db.add(source)
    test_db.commit()
    service = CharacterUpdateRecovery(sessionmaker(bind=test_db.get_bind(), expire_on_commit=False))
    attempt = PendingCharacterUpdate(test_game_session.id, source.character_id, test_game_session.owner_id,
                                    "original-message", 1, before, after, {"version": 2}, {"hp": 5})
    service.remember(attempt)
    return service, attempt, source


@pytest.mark.parametrize("committed", [False, True])
def test_lookup_requires_the_exact_before_or_accepted_source(recovery, test_db, committed):
    service, attempt, source = recovery
    if committed:
        source.version = 2
        source.character_data = attempt.after_document
        source.last_modified_by = attempt.user_id
        test_db.commit()
    resolved = service.resolve(attempt.session_id)
    assert resolved is not None and resolved.committed is committed
    assert service.has_pending(attempt.session_id), "Lookup cannot release a still-uninstalled cache"
    service.complete(resolved)
    assert not service.has_pending(attempt.session_id)


@pytest.mark.parametrize("change", ["newer", "different_document", "different_actor", "missing", "archived"])
def test_ambiguous_source_never_becomes_a_false_rejection(recovery, test_db, change):
    service, attempt, source = recovery
    source.version = 2
    source.character_data = attempt.after_document
    source.last_modified_by = attempt.user_id
    if change == "newer":
        source.version = 3
    elif change == "different_document":
        source.character_data = '{"name":"Different"}'
    elif change == "different_actor":
        source.last_modified_by = None
    elif change == "missing":
        test_db.delete(source)
    else:
        from utils.time import utc_now
        source.archived_at = utc_now()
    test_db.commit()
    with pytest.raises(CharacterUpdateOutcomeUnknown):
        service.resolve(attempt.session_id)
    assert service.has_pending(attempt.session_id)


def test_lookup_failure_preserves_quarantine_and_rejects_new_attempt(recovery, monkeypatch):
    service, attempt, _ = recovery

    def offline(_attempt):
        raise OSError("Database is unavailable")

    monkeypatch.setattr(service, "_lookup", offline)
    with pytest.raises(CharacterUpdateOutcomeUnknown, match="unavailable"):
        service.resolve(attempt.session_id)
    with pytest.raises(CharacterUpdateOutcomeUnknown):
        service.remember(deepcopy(attempt))
    assert service.has_pending(attempt.session_id)
