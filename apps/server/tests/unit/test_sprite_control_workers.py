import asyncio
import threading
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from core_table.server import TableManager
from core_table.table import VirtualTable
from database import crud, models
from service import sprite_control
from service.server_protocol import ServerProtocol
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

pytestmark = pytest.mark.asyncio


@pytest.fixture
def control(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'control.db'}", connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add_all([models.User(id=1, username='owner', email='control@example.com', hashed_password='unused'),
            models.User(id=7, username='player', email='player@example.com', hashed_password='unused')])
        db.flush()
        db.add_all([models.GameSession(id=i, name='Control', session_code=f'CTRL{i}', owner_id=1)
                    for i in (1, 2)])
        db.flush()
        table = VirtualTable('Unloaded', 1000, 1000)
        table.add_entity({'sprite_id': 'token', 'controlled_by': [7]})
        crud.save_table_to_db(db, table, 1)
    loop_thread = threading.get_ident()
    closed = []

    @contextmanager
    def worker_factory():
        assert threading.get_ident() != loop_thread
        try:
            with factory() as db:
                yield db
        finally:
            closed.append(threading.get_ident())

    monkeypatch.setattr(sprite_control, 'SessionLocal', worker_factory)
    manager = TableManager()
    proto = ServerProtocol(manager, session_manager=SimpleNamespace(game_session_db_id=1))
    manager.db_session = True
    yield SimpleNamespace(proto=proto, factory=factory, closed=closed, table=table)
    engine.dispose()


@pytest.mark.parametrize(('raw', 'allowed'), [('[7]', True), ('["7"]', True), ('[8]', False),
    ('[]', False), ('{"7": true}', False), ('[true]', False), ('broken', False), ('null', False)])
async def test_unloaded_permissions_are_detached_scoped_and_fail_closed(control, raw, allowed):
    with control.factory() as db:
        db.query(models.Entity).one().controlled_by = raw
        db.commit()
    assert await control.proto._can_control_sprite('token', 7) is allowed
    assert len(control.closed) == 1
    control.proto.session_manager.game_session_db_id = 2
    assert not await control.proto._can_control_sprite('token', 7)
    assert len(control.closed) == 2


@pytest.mark.parametrize(('source_session', 'archived', 'allowed'), [(1, False, True), (1, True, False), (2, False, False)])
async def test_linked_ownership_cannot_cross_sessions_or_archive(control, source_session, archived, allowed):
    from utils.time import utc_now
    with control.factory() as db:
        db.add(models.SessionCharacter(character_id='source', session_id=source_session,
            owner_user_id=1, character_name='Source', character_data='{}',
            archived_at=utc_now() if archived else None))
        db.flush()
        db.add(models.CharacterPermission(character_id='source', session_id=source_session,
            user_id=7, can_control=True, granted_by=1))
        entity = db.query(models.Entity).one()
        entity.character_id, entity.controlled_by = 'source', '[8]'
        db.commit()
    assert await control.proto._can_control_sprite('token', 7) is allowed
    assert await control.proto._can_control_sprite('token', 1) is allowed


async def test_live_permission_checks_do_not_submit_database_work(control, monkeypatch):
    def unexpected(*args):
        raise AssertionError('Live permission must not query storage')
    monkeypatch.setattr(sprite_control, 'SessionLocal', unexpected)
    control.proto.table_manager.tables = {'live': control.table}
    assert await control.proto._can_control_sprite('token', 7)
    assert not await control.proto._can_control_sprite('token', 8)
    assert not control.closed


async def test_edit_only_and_revoked_character_grants_do_not_allow_control(control):
    with control.factory() as db:
        db.add(models.SessionCharacter(character_id='source', session_id=1, owner_user_id=1,
            character_name='Source', character_data='{}'))
        db.flush()
        db.add(models.CharacterPermission(character_id='source', session_id=1, user_id=7,
            can_view=True, can_edit=True, can_control=False, granted_by=1))
        entity = db.query(models.Entity).one()
        entity.character_id, entity.controlled_by = 'source', '[8]'
        db.commit()
    assert not await control.proto._can_control_sprite('token', 7)
    with control.factory() as db:
        db.query(models.CharacterPermission).one().can_control = True
        db.commit()
    assert await control.proto._can_control_sprite('token', 7)
    with control.factory() as db:
        db.query(models.CharacterPermission).delete()
        db.commit()
    assert not await control.proto._can_control_sprite('token', 7)


async def test_cancelled_permission_read_keeps_loop_responsive_and_closes_session(control, monkeypatch):
    entered, release, closed = threading.Event(), threading.Event(), threading.Event()
    factory = sprite_control.SessionLocal

    @contextmanager
    def slow():
        try:
            with factory() as db:
                entered.set()
                assert release.wait(5)
                yield db
        finally:
            closed.set()

    monkeypatch.setattr(sprite_control, 'SessionLocal', slow)
    task = asyncio.create_task(control.proto._can_control_sprite('token', 7))
    try:
        assert await asyncio.to_thread(entered.wait, 2)
        await asyncio.wait_for(asyncio.sleep(0), 1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert not closed.is_set()
    finally:
        release.set()
    assert await asyncio.to_thread(closed.wait, 2)
    assert control.closed


async def test_storage_failure_denies_and_missing_session_never_queries(control, monkeypatch):
    def failed():
        raise RuntimeError('Storage unavailable')
    monkeypatch.setattr(sprite_control, 'SessionLocal', failed)
    assert not await control.proto._can_control_sprite('token', 7)
    control.proto.session_manager.game_session_db_id = None
    assert not await control.proto._can_control_sprite('token', 7)
