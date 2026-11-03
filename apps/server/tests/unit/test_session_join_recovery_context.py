from datetime import timedelta

from database.models import GameSession
from service import session_join_hydration
from sqlalchemy.orm import sessionmaker


def test_recovery_scope_is_stable_for_one_retained_session_and_changes_for_replacement(
    test_db, test_db_engine, test_game_session, monkeypatch,
):
    monkeypatch.setattr(session_join_hydration, 'SessionLocal', sessionmaker(bind=test_db_engine))
    args = (test_game_session.id, test_game_session.session_code, '1', 'owner')
    first = session_join_hydration.load_join_metadata(*args)[2]
    assert first is not None and first['contract'] == 'session-operations-v1'
    assert first['domains'] == ['table_create', 'table_delete', 'table_settings', 'xp_award']
    assert session_join_hydration.load_join_metadata(*args)[2] == first
    game = test_db.get(GameSession, test_game_session.id)
    assert game is not None and game.created_at is not None
    game.created_at += timedelta(seconds=1)
    test_db.commit()
    assert session_join_hydration.load_join_metadata(*args)[2] != first


def test_legacy_session_without_creation_identity_does_not_advertise_replay(
    test_db, test_db_engine, test_game_session, monkeypatch,
):
    monkeypatch.setattr(session_join_hydration, 'SessionLocal', sessionmaker(bind=test_db_engine))
    test_game_session.created_at = None
    test_db.commit()
    assert session_join_hydration.load_join_metadata(test_game_session.id, test_game_session.session_code, '1', 'owner')[2] is None
