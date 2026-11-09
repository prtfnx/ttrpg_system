"""PostgreSQL-only schema, constraint, and locking contracts."""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from core_table.paint import PaintLimits
from database import models
from database.models import Base
from database.schema import repository_heads, schema_is_current
from database.url import normalize_database_url
from service import paint_object_service as paint_service_module
from service.paint_object_service import PaintObjectService, PaintSnapshot
from service.readiness import ReadinessChecker
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

SERVER_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI = SERVER_ROOT / "alembic.ini"
POSTGRESQL_URL = os.getenv("TEST_POSTGRESQL_DATABASE_URL")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not POSTGRESQL_URL,
        reason="TEST_POSTGRESQL_DATABASE_URL is not configured",
    ),
]


@pytest.fixture(scope="module")
def postgresql_engine():
    assert POSTGRESQL_URL is not None
    normalized_url = normalize_database_url(POSTGRESQL_URL)
    assert normalized_url.database is not None
    assert (
        "test" in normalized_url.database.lower()
        or os.getenv("ALLOW_POSTGRESQL_INTEGRATION_TARGET") == "1"
    ), (
        "Refusing PostgreSQL integration tests unless the database name contains "
        "'test' or ALLOW_POSTGRESQL_INTEGRATION_TARGET=1 is explicitly set"
    )
    engine = create_engine(normalized_url, pool_pre_ping=True)
    expected_tables = set(Base.metadata.tables) | {"alembic_version"}
    existing_tables = set(inspect(engine).get_table_names())
    unexpected_tables = existing_tables - expected_tables
    assert not unexpected_tables, (
        "TEST_POSTGRESQL_DATABASE_URL contains tables outside the application schema: "
        f"{sorted(unexpected_tables)}"
    )
    assert not existing_tables or "alembic_version" in existing_tables, (
        "Refusing to migrate a non-empty PostgreSQL database without alembic_version"
    )

    config = Config(ALEMBIC_INI)
    config.attributes["database_url"] = POSTGRESQL_URL
    command.upgrade(config, "head")
    with engine.connect() as connection:
        nonempty_tables = {
            table_name: connection.execute(
                text(f'SELECT COUNT(*) FROM "{table_name}"')
            ).scalar_one()
            for table_name in Base.metadata.tables
            if table_name not in {"asset_quota_state", "application_writer_state"}
        }
        quota_state_ids = connection.execute(
            text("SELECT id FROM asset_quota_state ORDER BY id")
        ).scalars().all()
    nonempty_tables = {
        table_name: count
        for table_name, count in nonempty_tables.items()
        if count
    }
    assert not nonempty_tables, (
        "Refusing PostgreSQL integration tests against nonempty application tables: "
        f"{sorted(nonempty_tables)}"
    )
    assert quota_state_ids == [1], (
        "Refusing PostgreSQL integration tests with unexpected asset quota state: "
        f"{quota_state_ids}"
    )

    try:
        yield engine
    finally:
        engine.dispose()


def _constraint_names(inspector, table_name: str) -> set[str]:
    names = {
        inspector.get_pk_constraint(table_name).get("name"),
        *(item.get("name") for item in inspector.get_foreign_keys(table_name)),
        *(item.get("name") for item in inspector.get_unique_constraints(table_name)),
        *(item.get("name") for item in inspector.get_indexes(table_name)),
    }
    return {name for name in names if name}


@pytest.fixture
def session_operations_postgresql(postgresql_engine):
    from service.xp_award_service import XPAwardIntent, XPAwardService

    factory = sessionmaker(bind=postgresql_engine, expire_on_commit=False)
    suffix, character_id = uuid.uuid4().hex[:12], str(uuid.uuid4())
    with factory() as db:
        owner = models.User(username=f'xp-{suffix}', hashed_password='unused')
        db.add(owner)
        db.flush()
        game = models.GameSession(name='XP receipts', session_code=suffix, owner_id=owner.id)
        db.add(game)
        db.flush()
        db.add(models.SessionCharacter(character_id=character_id, session_id=game.id,
            owner_user_id=owner.id, character_name='Hero', character_data=json.dumps({
                'character_id': character_id, 'name': 'Hero', 'data': {'experience': 0, 'level': 1}})))
        db.commit()
        actor_id, session_id = owner.id, game.id
    intent = XPAwardIntent.create(session_id, actor_id, 'xp-original', {'character_id': character_id, 'amount': 100})
    try:
        yield SimpleNamespace(factory=factory, service=XPAwardService(factory), intent=intent,
                              session_id=session_id, actor_id=actor_id, character_id=character_id)
    finally:
        with factory() as db:
            db.query(models.SessionOperationReceipt).filter_by(session_id=session_id).delete()
            for prompt in db.query(models.ChoiceEncounter).filter_by(session_id=session_id).all():
                db.query(models.ChoiceEncounterEvent).filter_by(encounter_id=prompt.encounter_id).delete()
                db.delete(prompt)
            for table in db.query(models.VirtualTable).filter_by(session_id=session_id).all():
                db.delete(table)
            db.flush()
            db.query(models.CharacterLog).filter_by(session_id=session_id).delete()
            db.query(models.GamePlayer).filter_by(session_id=session_id).delete()
            db.query(models.SessionCharacter).filter_by(character_id=character_id).delete()
            db.query(models.GameSession).filter_by(id=session_id).delete()
            db.query(models.User).filter_by(id=actor_id).delete()
            db.commit()


@pytest.fixture
def choice_operations_postgresql(session_operations_postgresql):
    from service.choice_encounter_persistence_service import ChoiceEncounterPersistenceService
    from service.choice_operation_service import ChoiceIntent, ChoiceOperationService

    scope = session_operations_postgresql
    scope.choice_store = ChoiceEncounterPersistenceService(scope.factory)
    scope.choice_service = ChoiceOperationService(scope.choice_store)
    with scope.factory() as db:
        game = db.get(models.GameSession, scope.session_id)
        assert game is not None
        scope.session_code = game.session_code

    def intent(kind='encounter_start', request='choice-original', **payload):
        if kind == 'encounter_start':
            payload = {'choices': [{'choice_id': 'go', 'text': 'Go', 'requires_roll': True, 'roll_dc': 10}], **payload}
        return ChoiceIntent.create(scope.session_id, scope.actor_id, request, kind, payload)

    def prepare(kind):
        if kind == 'encounter_start':
            return intent()
        started = scope.choice_service.execute(intent(request='prepare-start'))
        assert started.receipt is not None
        target = started.receipt['encounter_id']
        scope.choice_service.execute(intent('encounter_choice', 'prepare-choice', encounter_id=target, choice_id='go'))
        return intent('encounter_roll', encounter_id=target, choice_id='go')

    scope.choice_intent, scope.prepare_choice = intent, prepare
    return scope


@pytest.fixture
def sprite_settlement_postgresql(session_operations_postgresql):
    import copy

    from core_table.protocol import Message, MessageType
    from core_table.table import VirtualTable
    from database import crud
    from service.sprite_editor_commands import SpriteCommandScope
    from service.sprite_write_recovery import PendingSpriteWrite

    scope = session_operations_postgresql
    table = VirtualTable('Sprite settlement', 1000, 1000)
    token_id = str(uuid.uuid4())
    table.add_entity({'sprite_id': token_id, 'x': 10, 'y': 20})
    with scope.factory() as db:
        assert crud.save_table_to_db(db, table, scope.session_id)
    identity = SpriteCommandScope.from_message(Message(MessageType.SPRITE_ROTATE, {
        'table_id': str(table.table_id), 'sprite_id': token_id, 'rotation': 30}), scope.session_id, scope.actor_id)
    staged = copy.deepcopy(table)
    entity, original = staged.find_entity_by_sprite_id(token_id), table.find_entity_by_sprite_id(token_id)
    assert entity is not None and original is not None
    entity.rotation = 30
    scope.sprite_command = dict(scope=identity, before_snapshot={'table_id': str(table.table_id),
        '_sprite_targets': [token_id], 'sprites': {token_id: original.to_dict()}}, staged=staged)
    scope.sprite_attempt = PendingSpriteWrite.create([scope.sprite_command], scope.factory)
    scope.sprite_id = token_id
    return scope


@pytest.mark.parametrize('fail_after_flush', [False, True])
def test_sprite_rows_and_existing_journal_share_acceptance(sprite_settlement_postgresql, monkeypatch, fail_after_flush):
    from service import sprite_editor_commands
    from service.sprite_editor_commands import SpriteEditorCommandService
    from service.sprite_write_recovery import resolve_sprite_write

    scope = sprite_settlement_postgresql
    stage = sprite_editor_commands.stage_sprite_delta
    if fail_after_flush:
        def failed(*args, **kwargs):
            stage(*args, **kwargs)
            raise RuntimeError('After sprite flush')
        monkeypatch.setattr(sprite_editor_commands, 'stage_sprite_delta', failed)
    if fail_after_flush:
        with pytest.raises(RuntimeError, match='After sprite flush'):
            SpriteEditorCommandService(scope.factory).persist(**scope.sprite_command)
    else:
        SpriteEditorCommandService(scope.factory).persist(**scope.sprite_command)
    outcome = resolve_sprite_write(scope.sprite_attempt)
    assert outcome.committed is not fail_after_flush
    entity = outcome.sprites[scope.sprite_command['scope'].table_id][scope.sprite_id]
    assert entity is not None and entity.rotation == (0 if fail_after_flush else 30)


@pytest.fixture
def wall_settlement_postgresql(sprite_settlement_postgresql):
    from service.wall_command_service import WallCommandIntent, WallCommandService

    scope = sprite_settlement_postgresql
    scope.wall_service = WallCommandService(scope.factory)
    table_id = scope.sprite_command['scope'].table_id
    scope.wall_intent = lambda request='wall-original', kind='wall_create', **data: WallCommandIntent.create(
        scope.session_id, scope.actor_id, request, kind, {'table_id': table_id, **(
            {'wall_data': {'x1': 0, 'y1': 0, 'x2': 50, 'y2': 60, 'is_door': True}}
            if kind == 'wall_create' else {}), **data})
    return scope


@pytest.mark.parametrize('fail_after_flush', [False, True])
def test_wall_and_original_receipt_accept_atomically(wall_settlement_postgresql, monkeypatch, fail_after_flush):
    from service import wall_command_service
    from service.wall_command_service import PendingWallCommand

    scope = wall_settlement_postgresql
    intent = scope.wall_intent()
    stage = wall_command_service.stage_receipt
    if fail_after_flush:
        def failed(*args):
            stage(*args)
            raise RuntimeError('After wall and receipt flush')
        monkeypatch.setattr(wall_command_service, 'stage_receipt', failed)
        with pytest.raises(RuntimeError, match='After wall'):
            scope.wall_service.execute(intent)
    else:
        scope.wall_service.execute(intent)
    outcome = scope.wall_service.resolve(PendingWallCommand(intent))
    assert outcome.committed is not fail_after_flush
    assert (outcome.wall is not None) is not fail_after_flush


@pytest.mark.parametrize('kind', ['wall_create', 'door_toggle'])
@pytest.mark.parametrize('commit', [False, True])
def test_wall_settlement_observes_original_session_row_wait(wall_settlement_postgresql, postgresql_engine, kind, commit):
    from service.wall_command_service import PendingWallCommand, WallCommandService
    from sqlalchemy import event

    scope = wall_settlement_postgresql
    intent = scope.wall_intent()
    if kind == 'door_toggle':
        wall_id = scope.wall_service.execute(scope.wall_intent('seed-door')).receipt['wall_id']
        intent = scope.wall_intent(kind=kind, wall_id=wall_id)
    prepared, release, reader_started = threading.Event(), threading.Event(), threading.Event()
    pids, outcomes, errors = {}, [], []
    def writer_factory():
        db = scope.factory()
        def pause(session):
            pids['writer'] = session.execute(text('SELECT pg_backend_pid()')).scalar_one()
            prepared.set()
            if not release.wait(5):
                raise RuntimeError('Wall writer release timed out')
            if not commit:
                raise RuntimeError('Deliberate wall rollback')
        event.listen(db, 'before_commit', pause)
        return db
    def reader_factory():
        db = scope.factory()
        def started(_session, _transaction, connection):
            pids['reader'] = connection.execute(text('SELECT pg_backend_pid()')).scalar_one()
            reader_started.set()
        event.listen(db, 'after_begin', started)
        return db
    def write():
        try:
            WallCommandService(writer_factory).execute(intent)
        except Exception as exc:
            if commit or 'Deliberate wall rollback' not in str(exc):
                errors.append(exc)
    def read():
        try:
            outcomes.append(WallCommandService(reader_factory).resolve(PendingWallCommand(intent)))
        except Exception as exc:
            errors.append(exc)
    writer, reader = threading.Thread(target=write), threading.Thread(target=read)
    try:
        writer.start()
        assert prepared.wait(3)
        reader.start()
        assert reader_started.wait(3)
        observed = False
        deadline = time.monotonic() + 3
        with postgresql_engine.connect().execution_options(isolation_level='AUTOCOMMIT') as observer:
            while time.monotonic() < deadline:
                if pids['writer'] in observer.execute(text('SELECT pg_blocking_pids(:pid)'), {'pid': pids['reader']}).scalar_one():
                    observed = True
                    break
                time.sleep(0.01)
        assert observed and not outcomes
        release.set()
        writer.join(5)
        reader.join(5)
        assert not errors and len(outcomes) == 1 and outcomes[0].committed is commit
        if kind == 'door_toggle':
            assert outcomes[0].wall['door_state'] == ('open' if commit else 'closed')
        else:
            assert (outcomes[0].wall is not None) is commit
    finally:
        release.set()
        if writer.ident is not None:
            writer.join(6)
        if reader.ident is not None:
            reader.join(6)


@pytest.fixture
def table_edits_postgresql(sprite_settlement_postgresql):
    from service.table_edit_service import TableEditIntent, TableEditService

    scope = sprite_settlement_postgresql
    scope.table_edit_service = TableEditService(scope.factory)
    table_id = scope.sprite_command['scope'].table_id
    def intent(kind='table_move'):
        data = ({'table_id': table_id, 'x_moved': 15, 'y_moved': 30} if kind == 'table_move' else
            {'category': 'table', 'type': 'table_update', 'data': {
                'table_id': table_id, 'table_name': 'Revised', 'width': 1500, 'grid_size': 70}})
        return TableEditIntent.create(scope.session_id, scope.actor_id, 'table-original', kind, data)
    scope.table_edit_intent = intent
    return scope


@pytest.mark.parametrize('fail_after_flush', [False, True])
def test_table_fields_and_receipt_accept_atomically(table_edits_postgresql, monkeypatch, fail_after_flush):
    from service import table_edit_service
    from service.table_edit_service import PendingTableEdit

    scope = table_edits_postgresql
    intent = scope.table_edit_intent('table_update_request')
    stage = table_edit_service.stage_receipt
    if fail_after_flush:
        def failed(*args):
            stage(*args)
            raise RuntimeError('After table fields and receipt flush')
        monkeypatch.setattr(table_edit_service, 'stage_receipt', failed)
        with pytest.raises(RuntimeError, match='After table fields'):
            scope.table_edit_service.execute(intent)
    else:
        scope.table_edit_service.execute(intent)
    outcome = scope.table_edit_service.resolve(PendingTableEdit(intent))
    assert outcome.committed is not fail_after_flush
    assert outcome.current['width'] == (1000 if fail_after_flush else 1500)
    assert outcome.current['grid_cell_px'] == (50 if fail_after_flush else 70)
    assert outcome.current['settings_revision'] == (0 if fail_after_flush else 1)


@pytest.mark.parametrize('kind', ['table_move', 'table_update_request'])
@pytest.mark.parametrize('commit', [False, True])
def test_table_edit_settlement_observes_original_session_wait(table_edits_postgresql, postgresql_engine, kind, commit):
    from service.table_edit_service import PendingTableEdit, TableEditService
    from sqlalchemy import event

    scope = table_edits_postgresql
    intent = scope.table_edit_intent(kind)
    prepared, release, reader_started = threading.Event(), threading.Event(), threading.Event()
    pids, outcomes, errors = {}, [], []
    def writer_factory():
        db = scope.factory()
        def pause(session):
            pids['writer'] = session.execute(text('SELECT pg_backend_pid()')).scalar_one()
            prepared.set()
            if not release.wait(5):
                raise RuntimeError('Table writer release timed out')
            if not commit:
                raise RuntimeError('Deliberate table edit rollback')
        event.listen(db, 'before_commit', pause)
        return db
    def reader_factory():
        db = scope.factory()
        def started(_session, _transaction, connection):
            pids['reader'] = connection.execute(text('SELECT pg_backend_pid()')).scalar_one()
            reader_started.set()
        event.listen(db, 'after_begin', started)
        return db
    def write():
        try:
            TableEditService(writer_factory).execute(intent)
        except Exception as exc:
            if commit or 'Deliberate table edit rollback' not in str(exc):
                errors.append(exc)
    def read():
        try:
            outcomes.append(TableEditService(reader_factory).resolve(PendingTableEdit(intent)))
        except Exception as exc:
            errors.append(exc)
    writer, reader = threading.Thread(target=write), threading.Thread(target=read)
    try:
        writer.start()
        assert prepared.wait(3)
        reader.start()
        assert reader_started.wait(3)
        observed = False
        deadline = time.monotonic() + 3
        with postgresql_engine.connect().execution_options(isolation_level='AUTOCOMMIT') as observer:
            while time.monotonic() < deadline:
                if pids['writer'] in observer.execute(text('SELECT pg_blocking_pids(:pid)'), {'pid': pids['reader']}).scalar_one():
                    observed = True
                    break
                time.sleep(0.01)
        assert observed and not outcomes
        release.set()
        writer.join(5)
        reader.join(5)
        assert not errors and len(outcomes) == 1 and outcomes[0].committed is commit
        field, before, after = ('position_x', 0, 15) if kind == 'table_move' else ('width', 1000, 1500)
        assert outcomes[0].current[field] == (after if commit else before)
    finally:
        release.set()
        if writer.ident is not None:
            writer.join(6)
        if reader.ident is not None:
            reader.join(6)


@pytest.fixture
def canvas_settlement_postgresql(sprite_settlement_postgresql):
    import copy
    from datetime import UTC, datetime

    from service.canvas_command_service import CanvasCommandService, sprite_transform
    from service.canvas_write_recovery import CanvasWriteIntent, PendingCanvasWrite

    scope = sprite_settlement_postgresql
    table = copy.deepcopy(scope.sprite_command['staged'])
    token = table.find_entity_by_sprite_id(scope.sprite_id)
    assert token is not None
    token.rotation = 0
    paint_id = str(uuid.uuid4())
    with scope.factory.begin() as db:
        result = PaintObjectService(scope.factory, writes_enabled=True).apply_in_transaction(db, 'create',
            session_id=scope.session_id, actor_id=scope.actor_id, table_id=str(table.table_id),
            operation_id=str(uuid.uuid4()), editable={'id': paint_id, 'kind': 'rectangle',
                'geometry': {'kind': 'rectangle', 'width': 20, 'height': 10},
                'transform': {'x': 50, 'y': 60, 'scale_x': 1, 'scale_y': 1},
                'style': {'stroke_rgba': [1, 0, 0, 1], 'width': 2, 'fill_rgba': None}})
        assert result.error is None
    service = CanvasCommandService(scope.factory, writes_enabled=True)
    command = {'operation_id': str(uuid.uuid4()), 'table_id': str(table.table_id), 'mode': 'transform',
        'issued_at': datetime.now(UTC).timestamp() * 1000, 'members': [
            {'kind': 'sprite', 'id': scope.sprite_id, 'expected': sprite_transform(token)},
            {'kind': 'paint', 'id': paint_id, 'version': 1}],
        'transform': {'dx': 10, 'dy': 20, 'scale': 1, 'rotation': 0, 'pivot_x': 0, 'pivot_y': 0}}
    def prepare(mode='transform'):
        nonlocal table
        current = dict(command)
        if mode == 'undo':
            accepted = service.execute(session_id=scope.session_id, actor_id=scope.actor_id,
                command=command, table_source=table)
            table = accepted.table
            current = {**current, 'mode': 'undo', 'operation_id': str(uuid.uuid4())}
            del current['members']
            del current['transform']
        attempt = PendingCanvasWrite(CanvasWriteIntent.create(scope.session_id, scope.actor_id, current, service),
            str(uuid.uuid4()), scope.factory)
        return attempt, dict(session_id=scope.session_id, actor_id=scope.actor_id, command=current,
                             table_source=table, attempt=attempt)
    scope.canvas_prepare, scope.canvas_service, scope.canvas_paint_id = prepare, service, paint_id
    return scope


@pytest.mark.parametrize('fail_after_flush', [False, True])
def test_mixed_canvas_rows_and_receipt_accept_atomically(canvas_settlement_postgresql, monkeypatch, fail_after_flush):
    from service.canvas_write_recovery import resolve_canvas_write

    scope = canvas_settlement_postgresql
    attempt, context = scope.canvas_prepare()
    execute = scope.canvas_service._execute_in_transaction
    if fail_after_flush:
        def failed(*args, **kwargs):
            execute(*args, **kwargs)
            raise RuntimeError('After mixed canvas flush')
        monkeypatch.setattr(scope.canvas_service, '_execute_in_transaction', failed)
        with pytest.raises(RuntimeError, match='After mixed canvas flush'):
            scope.canvas_service.execute(**context)
    else:
        scope.canvas_service.execute(**context)
    outcome = resolve_canvas_write(attempt)
    assert outcome.committed is not fail_after_flush
    with scope.factory() as db:
        assert db.query(models.CanvasCommandJournal).filter_by(table_id=attempt.intent.table_id).count() == int(not fail_after_flush)
        assert db.query(models.Entity).filter_by(sprite_id=scope.sprite_id).one().position_x == (10 if fail_after_flush else 20)
        paint = db.get(models.PaintObject, scope.canvas_paint_id)
        assert paint is not None and paint.version == (1 if fail_after_flush else 2)


@pytest.mark.parametrize('mode', ['transform', 'undo'])
@pytest.mark.parametrize('commit', [False, True])
def test_canvas_settlement_waits_on_real_original_barrier(canvas_settlement_postgresql, postgresql_engine, mode, commit):
    from service.canvas_command_service import CanvasCommandService
    from service.canvas_write_recovery import resolve_canvas_write
    from sqlalchemy import event

    scope = canvas_settlement_postgresql
    attempt, context = scope.canvas_prepare(mode)
    prepared, release, reader_started = threading.Event(), threading.Event(), threading.Event()
    pids, outcomes, errors = {}, [], []
    def writer_factory():
        db = scope.factory()
        def pause(session):
            pids['writer'] = session.execute(text('SELECT pg_backend_pid()')).scalar_one()
            prepared.set()
            if not release.wait(5):
                raise RuntimeError('Writer release timed out')
            if not commit:
                raise RuntimeError('Deliberate canvas rollback')
        event.listen(db, 'before_commit', pause)
        return db
    def reader_factory():
        db = scope.factory()
        def started(_session, _transaction, connection):
            pids['reader'] = connection.execute(text('SELECT pg_backend_pid()')).scalar_one()
            reader_started.set()
        event.listen(db, 'after_begin', started)
        return db
    def write():
        try:
            CanvasCommandService(writer_factory, writes_enabled=True).execute(**context)
        except Exception as exc:
            if commit or 'Deliberate canvas rollback' not in str(exc):
                errors.append(exc)
    def read():
        try:
            outcomes.append(resolve_canvas_write(attempt))
        except Exception as exc:
            errors.append(exc)
    attempt.factory = reader_factory
    writer, reader = threading.Thread(target=write), threading.Thread(target=read)
    try:
        writer.start()
        assert prepared.wait(3)
        reader.start()
        assert reader_started.wait(3)
        observed = False
        deadline = time.monotonic() + 3
        with postgresql_engine.connect().execution_options(isolation_level='AUTOCOMMIT') as observer:
            while time.monotonic() < deadline:
                if pids['writer'] in observer.execute(text('SELECT pg_blocking_pids(:pid)'), {'pid': pids['reader']}).scalar_one():
                    observed = True
                    break
                time.sleep(0.01)
        assert observed and not outcomes
        release.set()
        writer.join(5)
        reader.join(5)
        assert not errors and len(outcomes) == 1 and outcomes[0].committed is commit
        token = outcomes[0].sprites[attempt.intent.table_id][scope.sprite_id]
        assert token is not None
        assert token.position[0] == (10 if mode == 'undo' and commit or mode == 'transform' and not commit else 20)
    finally:
        release.set()
        if writer.ident is not None:
            writer.join(6)
        if reader.ident is not None:
            reader.join(6)


@pytest.mark.parametrize('commit', [False, True])
def test_sprite_settlement_waits_for_original_session_barrier(sprite_settlement_postgresql, postgresql_engine, commit):
    from service.sprite_editor_commands import SpriteEditorCommandService
    from service.sprite_write_recovery import resolve_sprite_write
    from sqlalchemy import event

    scope = sprite_settlement_postgresql
    prepared, release, reader_started = threading.Event(), threading.Event(), threading.Event()
    results, errors, pids = [], [], {}

    def writer_factory():
        db = scope.factory()
        def pause(session):
            pids['writer'] = session.execute(text('SELECT pg_backend_pid()')).scalar_one()
            prepared.set()
            if not release.wait(5):
                raise RuntimeError('Writer release timed out')
            if not commit:
                raise RuntimeError('Deliberate sprite rollback')
        event.listen(db, 'before_commit', pause)
        return db

    def reader_factory():
        db = scope.factory()
        def started(_session, _transaction, connection):
            pids['reader'] = connection.execute(text('SELECT pg_backend_pid()')).scalar_one()
            reader_started.set()
        event.listen(db, 'after_begin', started)
        return db

    def write():
        try:
            SpriteEditorCommandService(writer_factory).persist(**scope.sprite_command)
        except Exception as exc:
            if commit or 'Deliberate sprite rollback' not in str(exc):
                errors.append(exc)

    def read():
        try:
            results.append(resolve_sprite_write(scope.sprite_attempt))
        except Exception as exc:
            errors.append(exc)

    scope.sprite_attempt.factory = reader_factory
    writer, reader = threading.Thread(target=write), threading.Thread(target=read)
    try:
        writer.start()
        assert prepared.wait(3)
        reader.start()
        assert reader_started.wait(3)
        observed = False
        deadline = time.monotonic() + 3
        with postgresql_engine.connect().execution_options(isolation_level='AUTOCOMMIT') as observer:
            while time.monotonic() < deadline:
                blockers = observer.execute(text('SELECT pg_blocking_pids(:pid)'), {'pid': pids['reader']}).scalar_one()
                if pids['writer'] in blockers:
                    observed = True
                    break
                time.sleep(0.01)
        assert observed, 'Settlement must wait behind the real original transaction'
        assert not results
        release.set()
        writer.join(5)
        reader.join(5)
        assert not errors and len(results) == 1
        assert results[0].committed is commit
        assert results[0].sprites[scope.sprite_command['scope'].table_id][scope.sprite_id].rotation == (30 if commit else 0)
    finally:
        release.set()
        if writer.ident is not None:
            writer.join(6)
        if reader.ident is not None:
            reader.join(6)


@pytest.mark.parametrize('kind', ['encounter_start', 'encounter_roll'])
@pytest.mark.parametrize('fail_after_flush', [False, True])
def test_choice_snapshot_event_receipt_atomicity(choice_operations_postgresql, monkeypatch, kind, fail_after_flush):
    from service import choice_operation_service
    from service.choice_operation_service import ChoiceOperationRejected, ChoiceOperationService

    scope = choice_operations_postgresql
    intent = scope.prepare_choice(kind)
    with scope.factory() as db:
        before = db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id).count()
    if fail_after_flush:
        stage = choice_operation_service.stage_receipt

        def fail(*args):
            stage(*args)
            raise RuntimeError('After source/event/receipt flush')

        monkeypatch.setattr(choice_operation_service, 'stage_receipt', fail)
        with pytest.raises(ChoiceOperationRejected) as error:
            scope.choice_service.execute(intent)
        assert error.value.not_accepted
    else:
        accepted = scope.choice_service.execute(intent)
        replay = ChoiceOperationService(scope.choice_store).execute(intent)
        assert replay.replayed and replay.receipt == accepted.receipt
    with scope.factory() as db:
        assert db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id).count() == before + int(not fail_after_flush)
        targets = db.query(models.ChoiceEncounter.encounter_id).filter_by(session_id=scope.session_id)
        assert db.query(models.ChoiceEncounterEvent).filter(models.ChoiceEncounterEvent.encounter_id.in_(targets)).count() == before + int(not fail_after_flush)


@pytest.mark.parametrize('kind', ['encounter_start', 'encounter_roll'])
def test_concurrent_choice_duplicates_across_services_accept_once(choice_operations_postgresql, kind):
    from concurrent.futures import ThreadPoolExecutor

    from service.choice_operation_service import ChoiceOperationService

    scope, barrier = choice_operations_postgresql, threading.Barrier(2)
    intent = scope.prepare_choice(kind)

    def execute():
        barrier.wait(timeout=5)
        return ChoiceOperationService(scope.choice_store).execute(intent)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(execute) for _ in range(2)]
        outcomes = [future.result(timeout=10) for future in futures]
    assert sorted(outcome.replayed for outcome in outcomes) == [False, True]
    assert outcomes[0].receipt == outcomes[1].receipt
    with scope.factory() as db:
        assert db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id,
            operation_id=intent.identity.operation_id).count() == 1


@pytest.mark.parametrize('commit', [False, True])
def test_choice_lookup_observes_original_session_lock(choice_operations_postgresql, postgresql_engine, commit):
    from service.choice_encounter_persistence_service import ChoiceEncounterPersistenceService
    from service.choice_operation_service import ChoiceOperationService
    from service.encounter_engine import EncounterEngine
    from service.session_operation_receipts import lock_operation_session, stage_receipt

    scope = choice_operations_postgresql
    intent, writer = scope.choice_intent(), scope.factory()
    ready, results, errors, pids = threading.Event(), [], [], []

    def reader_factory():
        db = scope.factory()
        pids.append(db.execute(text('SELECT pg_backend_pid()')).scalar_one())
        ready.set()
        return db

    def lookup():
        try:
            service = ChoiceOperationService(ChoiceEncounterPersistenceService(reader_factory))
            results.append(service.lookup(intent, internal=True))
        except BaseException as exc:
            errors.append(exc)

    reader = threading.Thread(target=lookup, daemon=True)
    try:
        lock_operation_session(writer, intent.identity, require_dm=False)
        prompt = EncounterEngine.detached().create(scope.session_code, 'Locked', '', [{'text': 'Go'}], [])
        receipt = {'operation_id': intent.identity.operation_id, 'encounter_id': prompt.encounter_id,
                   'kind': intent.kind, 'accepted': True, 'accepted_version': 0}
        scope.choice_store.stage_snapshot(writer, session_code=scope.session_code, encounter=prompt.to_dict(dm=True),
            event_type='EncounterStarted', actor_id=str(scope.actor_id), payload=receipt, created_by=scope.actor_id)
        stage_receipt(writer, intent.identity, receipt)
        writer_pid = writer.execute(text('SELECT pg_backend_pid()')).scalar_one()
        reader.start()
        assert ready.wait(3)
        deadline, blocked = time.monotonic() + 3, False
        with postgresql_engine.connect().execution_options(isolation_level='AUTOCOMMIT') as observer:
            while time.monotonic() < deadline:
                blockers = observer.execute(text('SELECT pg_blocking_pids(:pid)'), {'pid': pids[0]}).scalar_one()
                if writer_pid in blockers:
                    blocked = True
                    break
                time.sleep(.01)
        assert blocked and not results and not errors
        writer.commit() if commit else writer.rollback()
        reader.join(timeout=5)
        assert not reader.is_alive() and not errors and len(results) == 1
        assert (results[0].receipt is not None) is commit
        assert (results[0].current is not None) is commit
    finally:
        writer.rollback()
        writer.close()
        if reader.ident is not None:
            reader.join(timeout=6)


@pytest.fixture
def character_updates_postgresql(session_operations_postgresql, monkeypatch):
    from core_table.table import VirtualTable
    from database import crud
    from managers import character_manager
    from service.character_update_recovery import CharacterUpdateRecovery
    from service.character_update_service import CharacterUpdateIntent, CharacterUpdateService

    scope = session_operations_postgresql
    monkeypatch.setattr(character_manager, 'SessionLocal', scope.factory)
    with scope.factory() as db:
        source = db.query(models.SessionCharacter).filter_by(character_id=scope.character_id).one()
        source.character_data = json.dumps({'character_id': scope.character_id, 'name': 'Hero', 'schemaVersion': 1,
                                           'data': {'stats': {'hp': 20, 'maxHp': 20, 'ac': 12}}})
        db.commit()
        table = VirtualTable('Character receipt', 1000, 1000)
        table.add_entity({'sprite_id': 'character-receipt-token', 'character_id': scope.character_id,
                          'hp': 20, 'max_hp': 20, 'ac': 12})
        crud.save_table_to_db(db, table, scope.session_id)
    scope.character_intent = CharacterUpdateIntent.create(scope.session_id, scope.actor_id, 'character-original',
        scope.character_id, {'data': {'stats': {'hp': 5}}}, 1)

    def construct(factory=scope.factory):
        manager = character_manager.ServerCharacterManager()
        manager.update_recovery = CharacterUpdateRecovery(factory)
        return manager, CharacterUpdateService(factory, manager.stage_character_update, manager.update_recovery)

    scope.construct_character_service = construct
    return scope


@pytest.fixture
def multiclass_postgresql(character_updates_postgresql):
    from service.multiclass_service import MulticlassIntent, MulticlassService

    scope = character_updates_postgresql
    with scope.factory() as db:
        source = db.query(models.SessionCharacter).filter_by(character_id=scope.character_id).one()
        document = json.loads(source.character_data)
        document['data'].update({'class': 'fighter', 'classes': [{'name': 'fighter', 'level': 3}], 'level': 3,
                                'abilityScores': {'strength': 15, 'dexterity': 15}})
        source.character_data = json.dumps(document)
        db.commit()
    scope.multiclass_intent = MulticlassIntent.from_request(scope.session_id, scope.actor_id, 'multiclass-original',
        {'character_id': scope.character_id, 'new_class': 'rogue', 'version': 1})

    def construct(factory=scope.factory):
        manager, _ = scope.construct_character_service(factory)
        return manager, MulticlassService(factory, manager.stage_character_update,
                                          manager.update_recovery, manager.validate_multiclass)

    scope.construct_multiclass_service = construct
    return scope


@pytest.mark.parametrize('fail_after_flush', [False, True])
def test_multiclass_source_audit_and_receipt_share_acceptance(multiclass_postgresql, monkeypatch, fail_after_flush):
    from service import character_update_service

    scope = multiclass_postgresql
    _, service = scope.construct_multiclass_service()
    if fail_after_flush:
        stage = character_update_service.stage_receipt

        def fail(*args):
            stage(*args)
            raise RuntimeError('After advancement/audit/receipt flush')

        monkeypatch.setattr(character_update_service, 'stage_receipt', fail)
    result = service.execute(scope.multiclass_intent)
    assert result['success'] is not fail_after_flush
    if not fail_after_flush:
        _, restarted = scope.construct_multiclass_service()
        assert restarted.execute(scope.multiclass_intent)['replayed']
    with scope.factory() as db:
        source = db.query(models.SessionCharacter).filter_by(character_id=scope.character_id).one()
        assert source.version == (1 if fail_after_flush else 2)
        assert json.loads(source.character_data)['data']['level'] == (3 if fail_after_flush else 4)
        assert db.query(models.CharacterLog).filter_by(session_id=scope.session_id,
            action_type='multiclass').count() == int(not fail_after_flush)
        assert db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id).count() == int(not fail_after_flush)


def test_concurrent_multiclass_duplicates_across_independent_services_accept_once(multiclass_postgresql):
    from concurrent.futures import ThreadPoolExecutor

    scope, barrier = multiclass_postgresql, threading.Barrier(2)

    def execute():
        _, service = scope.construct_multiclass_service()
        barrier.wait(timeout=5)
        return service.execute(scope.multiclass_intent)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(execute) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]
    assert sorted(result['replayed'] for result in results) == [False, True]
    with scope.factory() as db:
        source = db.query(models.SessionCharacter).filter_by(character_id=scope.character_id).one()
        assert source.version == 2 and len(json.loads(source.character_data)['data']['classes']) == 2
        assert db.query(models.CharacterLog).filter_by(session_id=scope.session_id, action_type='multiclass').count() == 1


@pytest.mark.parametrize('commit', [False, True])
def test_multiclass_recovery_observes_original_session_lock(multiclass_postgresql, postgresql_engine, commit):
    from service.session_operation_receipts import lock_operation_session, stage_receipt

    scope = multiclass_postgresql
    intent, writer = scope.multiclass_intent, scope.factory()
    ready, results, errors, pids = threading.Event(), [], [], []

    def reader_factory():
        db = scope.factory()
        pids.append(db.execute(text('SELECT pg_backend_pid()')).scalar_one())
        ready.set()
        return db

    reader_manager, reader_service = scope.construct_multiclass_service(reader_factory)
    reader_service._remember(intent)

    def lookup():
        try:
            results.append(reader_manager.update_recovery.resolve(scope.session_id))
        except BaseException as exc:
            errors.append(exc)

    reader = threading.Thread(target=lookup, daemon=True)
    try:
        lock_operation_session(writer, intent.identity, require_dm=False)
        source = writer.query(models.SessionCharacter).filter_by(character_id=scope.character_id).with_for_update().one()
        _, service = scope.construct_multiclass_service()
        result = service._stage_intent(writer, source, intent, True)
        stage_receipt(writer, intent.identity, service._receipt(intent, result))
        writer_pid = writer.execute(text('SELECT pg_backend_pid()')).scalar_one()
        reader.start()
        assert ready.wait(3)
        deadline, blocked = time.monotonic() + 3, False
        with postgresql_engine.connect().execution_options(isolation_level='AUTOCOMMIT') as observer:
            while time.monotonic() < deadline:
                blockers = observer.execute(text('SELECT pg_blocking_pids(:pid)'), {'pid': pids[0]}).scalar_one()
                if writer_pid in blockers:
                    blocked = True
                    break
                time.sleep(.01)
        assert blocked and not results and not errors
        writer.commit() if commit else writer.rollback()
        reader.join(timeout=5)
        assert not reader.is_alive() and not errors and len(results) == 1
        settled = results[0]
        assert settled is not None and settled.committed is commit and settled.current_result is not None
        assert settled.current_result['version'] == (2 if commit else 1)
        assert settled.current_result['character_data']['data']['level'] == (4 if commit else 3)
    finally:
        writer.rollback()
        writer.close()
        if reader.ident is not None:
            reader.join(timeout=6)


@pytest.mark.parametrize('fail_after_flush', [False, True])
def test_character_source_projection_audit_receipt_atomicity(character_updates_postgresql, monkeypatch, fail_after_flush):
    from service import character_update_service

    scope = character_updates_postgresql
    _, service = scope.construct_character_service()
    if fail_after_flush:
        stage = character_update_service.stage_receipt

        def fail(*args):
            stage(*args)
            raise RuntimeError('After source/projection/audit/receipt flush')

        monkeypatch.setattr(character_update_service, 'stage_receipt', fail)
    result = service.execute(scope.character_intent)
    assert result['success'] is not fail_after_flush
    if not fail_after_flush:
        _, restarted = scope.construct_character_service()
        assert restarted.execute(scope.character_intent)['replayed']
    with scope.factory() as db:
        assert db.query(models.SessionCharacter).filter_by(character_id=scope.character_id).one().version == (1 if fail_after_flush else 2)
        token = db.query(models.Entity).filter_by(character_id=scope.character_id).one()
        assert token.hp == (20 if fail_after_flush else 5)
        assert bool(db.query(models.CharacterLog).filter_by(session_id=scope.session_id).count()) is not fail_after_flush
        assert db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id).count() == int(not fail_after_flush)


def test_concurrent_character_duplicates_across_independent_services_accept_once(character_updates_postgresql):
    from concurrent.futures import ThreadPoolExecutor

    scope, barrier = character_updates_postgresql, threading.Barrier(2)

    def execute():
        _, service = scope.construct_character_service()
        barrier.wait(timeout=5)
        return service.execute(scope.character_intent)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(execute) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]
    assert sorted(result['replayed'] for result in results) == [False, True]
    with scope.factory() as db:
        assert db.query(models.SessionCharacter).filter_by(character_id=scope.character_id).one().version == 2
        assert db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id).count() == 1
        assert db.query(models.Entity).filter_by(character_id=scope.character_id).one().hp == 5


@pytest.mark.parametrize('commit', [False, True])
def test_character_receipt_recovery_observes_original_transaction_lock(character_updates_postgresql, postgresql_engine, commit):
    from service.session_operation_receipts import lock_operation_session, stage_receipt

    scope = character_updates_postgresql
    intent, writer = scope.character_intent, scope.factory()
    ready, results, errors, pids = threading.Event(), [], [], []

    def reader_factory():
        db = scope.factory()
        pids.append(db.execute(text('SELECT pg_backend_pid()')).scalar_one())
        ready.set()
        return db

    reader_manager, reader_service = scope.construct_character_service(reader_factory)
    reader_service._remember(intent)

    def lookup():
        try:
            results.append(reader_manager.update_recovery.resolve(scope.session_id))
        except BaseException as exc:
            errors.append(exc)

    reader = threading.Thread(target=lookup, daemon=True)
    try:
        lock_operation_session(writer, intent.identity, require_dm=False)
        manager, _ = scope.construct_character_service()
        staged = manager.stage_character_update(writer, scope.session_id, scope.character_id,
            intent.updates, scope.actor_id, expected_version=1, bypass_owner_check=True)
        stage_receipt(writer, intent.identity, {'success': True, 'character_id': scope.character_id,
            'operation_id': intent.identity.operation_id, 'accepted_version': staged['version'], 'reconciliation': False})
        writer_pid = writer.execute(text('SELECT pg_backend_pid()')).scalar_one()
        reader.start()
        assert ready.wait(3)
        deadline, blocked = time.monotonic() + 3, False
        with postgresql_engine.connect().execution_options(isolation_level='AUTOCOMMIT') as observer:
            while time.monotonic() < deadline:
                blockers = observer.execute(text('SELECT pg_blocking_pids(:pid)'), {'pid': pids[0]}).scalar_one()
                if writer_pid in blockers:
                    blocked = True
                    break
                time.sleep(.01)
        assert blocked and not results and not errors
        writer.commit() if commit else writer.rollback()
        reader.join(timeout=5)
        assert not reader.is_alive() and not errors and len(results) == 1
        resolved = results[0]
        assert resolved is not None and resolved.committed is commit
        assert resolved.current_result['version'] == (2 if commit else 1)
        assert resolved.current_result['token_updates'][0]['stats']['hp'] == (5 if commit else 20)
    finally:
        writer.rollback()
        writer.close()
        if reader.ident is not None:
            reader.join(timeout=6)


@pytest.mark.parametrize('fail_after_flush', [False, True])
def test_xp_source_audit_and_receipt_share_acceptance(session_operations_postgresql, monkeypatch, fail_after_flush):
    from service import xp_award_service
    from service.session_operation_receipts import OperationRejected

    scope = session_operations_postgresql
    if fail_after_flush:
        stage = xp_award_service.stage_receipt

        def fail(*args):
            stage(*args)
            raise RuntimeError('After source/audit/receipt flush')

        monkeypatch.setattr(xp_award_service, 'stage_receipt', fail)
        with pytest.raises(OperationRejected):
            scope.service.execute(scope.intent)
    else:
        assert scope.service.execute(scope.intent)['new_xp'] == 100
        assert scope.service.execute(scope.intent)['replayed']
    with scope.factory() as db:
        source = db.query(models.SessionCharacter).filter_by(character_id=scope.character_id).one()
        assert source.version == (1 if fail_after_flush else 2)
        assert db.query(models.CharacterLog).filter_by(session_id=scope.session_id).count() == int(not fail_after_flush)
        assert db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id).count() == int(not fail_after_flush)


def test_concurrent_xp_duplicates_on_independent_services_accept_once(session_operations_postgresql):
    from concurrent.futures import ThreadPoolExecutor

    from service.xp_award_service import XPAwardService

    scope, barrier = session_operations_postgresql, threading.Barrier(2)

    def execute():
        barrier.wait(timeout=5)
        return XPAwardService(scope.factory).execute(scope.intent)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(execute) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]
    assert sorted(result['replayed'] for result in results) == [False, True]
    with scope.factory() as db:
        assert db.query(models.CharacterLog).filter_by(session_id=scope.session_id).count() == 1
        assert db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id).count() == 1
        assert db.query(models.SessionCharacter).filter_by(character_id=scope.character_id).one().version == 2


@pytest.mark.parametrize('commit', [False, True])
def test_xp_outcome_lookup_waits_for_original_transaction(session_operations_postgresql, postgresql_engine, commit):
    from service.session_operation_receipts import stage_receipt
    from service.xp_award_service import XPAwardService

    scope, writer = session_operations_postgresql, session_operations_postgresql.factory()
    ready, results, errors, pids = threading.Event(), [], [], []

    def reader_factory():
        db = scope.factory()
        pids.append(db.execute(text('SELECT pg_backend_pid()')).scalar_one())
        ready.set()
        return db

    def lookup():
        try:
            results.append(XPAwardService(reader_factory).lookup(scope.intent))
        except BaseException as exc:
            errors.append(exc)

    reader = threading.Thread(target=lookup, daemon=True)
    try:
        scope.service._authorize_and_lock(writer, scope.intent.identity)
        stage_receipt(writer, scope.intent.identity, {'success': True, 'version': 2})
        writer_pid = writer.execute(text('SELECT pg_backend_pid()')).scalar_one()
        reader.start()
        assert ready.wait(3)
        deadline, blocked = time.monotonic() + 3, False
        with postgresql_engine.connect().execution_options(isolation_level='AUTOCOMMIT') as observer:
            while time.monotonic() < deadline:
                blockers = observer.execute(text('SELECT pg_blocking_pids(:pid)'), {'pid': pids[0]}).scalar_one()
                if writer_pid in blockers:
                    blocked = True
                    break
                time.sleep(.01)
        assert blocked and not results and not errors
        writer.commit() if commit else writer.rollback()
        reader.join(timeout=5)
        assert not reader.is_alive() and not errors and len(results) == 1
        assert (results[0] is not None) is commit
    finally:
        writer.rollback()
        writer.close()
        if reader.ident is not None:
            reader.join(timeout=6)


@pytest.mark.parametrize('fail_after_flush', [False, True])
def test_table_creation_and_receipt_share_acceptance(session_operations_postgresql, monkeypatch, fail_after_flush):
    from service import table_creation_service
    from service.session_operation_receipts import OperationRejected
    from service.table_creation_service import TableCreateIntent, TableCreationService

    scope = session_operations_postgresql
    service = TableCreationService(scope.factory)
    intent = TableCreateIntent.create(scope.session_id, scope.actor_id, 'table-original', {'table_name': 'Scene'})
    if fail_after_flush:
        stage = table_creation_service.stage_receipt

        def fail(*args):
            stage(*args)
            raise RuntimeError('After table/paint/receipt flush')

        monkeypatch.setattr(table_creation_service, 'stage_receipt', fail)
        with pytest.raises(OperationRejected):
            service.execute(intent)
    else:
        assert not service.execute(intent).replayed
        assert service.execute(intent).replayed
    with scope.factory() as db:
        assert db.query(models.VirtualTable).filter_by(session_id=scope.session_id).count() == int(not fail_after_flush)
        assert db.query(models.PaintState).filter_by(table_id=intent.table_id).count() == int(not fail_after_flush)
        assert db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id).count() == int(not fail_after_flush)


def test_concurrent_table_creates_with_one_identity_accept_once(session_operations_postgresql):
    from concurrent.futures import ThreadPoolExecutor

    from service.table_creation_service import TableCreateIntent, TableCreationService

    scope, barrier = session_operations_postgresql, threading.Barrier(2)
    intent = TableCreateIntent.create(scope.session_id, scope.actor_id, 'table-original', {'table_name': 'Scene'})

    def execute():
        barrier.wait(timeout=5)
        return TableCreationService(scope.factory).execute(intent)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(execute) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]
    assert sorted(result.replayed for result in results) == [False, True]
    with scope.factory() as db:
        assert db.query(models.VirtualTable).filter_by(session_id=scope.session_id).count() == 1
        assert db.query(models.PaintState).filter_by(table_id=intent.table_id).count() == 1
        assert db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id).count() == 1


@pytest.mark.parametrize('commit', [False, True])
def test_table_creation_lookup_waits_for_original_transaction(session_operations_postgresql, postgresql_engine, commit):
    from core_table.table import VirtualTable
    from database.crud import stage_new_table_snapshot
    from service.session_operation_receipts import lock_operation_session, stage_receipt
    from service.table_creation_service import TableCreateIntent, TableCreationService

    scope, ready = session_operations_postgresql, threading.Event()
    intent = TableCreateIntent.create(scope.session_id, scope.actor_id, 'table-original', {'table_name': 'Scene'})
    writer, results, errors, pids = scope.factory(), [], [], []

    def reader_factory():
        db = scope.factory()
        pids.append(db.execute(text('SELECT pg_backend_pid()')).scalar_one())
        ready.set()
        return db

    def lookup():
        try:
            results.append(TableCreationService(reader_factory).resolve(intent))
        except BaseException as exc:
            errors.append(exc)

    reader = threading.Thread(target=lookup, daemon=True)
    try:
        lock_operation_session(writer, intent.identity)
        stage_new_table_snapshot(writer, VirtualTable('Scene', 2000, 2000, table_id=intent.table_id), scope.session_id)
        stage_receipt(writer, intent.identity, {'success': True, 'table_id': intent.table_id})
        writer_pid = writer.execute(text('SELECT pg_backend_pid()')).scalar_one()
        reader.start()
        assert ready.wait(3)
        deadline, blocked = time.monotonic() + 3, False
        with postgresql_engine.connect().execution_options(isolation_level='AUTOCOMMIT') as observer:
            while time.monotonic() < deadline:
                blockers = observer.execute(text('SELECT pg_blocking_pids(:pid)'), {'pid': pids[0]}).scalar_one()
                if writer_pid in blockers:
                    blocked = True
                    break
                time.sleep(.01)
        assert blocked and not results and not errors
        writer.commit() if commit else writer.rollback()
        reader.join(timeout=5)
        assert not reader.is_alive() and not errors and len(results) == 1
        assert (results[0] is not None) is commit
    finally:
        writer.rollback()
        writer.close()
        if reader.ident is not None:
            reader.join(timeout=6)


@pytest.fixture
def table_settings_postgresql(session_operations_postgresql):
    from core_table.table import VirtualTable
    from database import crud
    from service.table_settings_service import TableSettingsIntent, TableSettingsService

    scope = session_operations_postgresql
    table = VirtualTable('Settings contract', 1000, 1000)
    with scope.factory() as db:
        crud.save_table_to_db(db, table, scope.session_id)
    intent = TableSettingsIntent.create(scope.session_id, scope.actor_id, 'settings-original',
                                        {'table_id': str(table.table_id), 'grid_cell_px': 75})
    return SimpleNamespace(**vars(scope) | {'table_id': str(table.table_id), 'intent': intent,
                                           'service': TableSettingsService(scope.factory)})


@pytest.mark.parametrize('fail_after_flush', [False, True])
def test_settings_patch_revision_and_receipt_share_acceptance(table_settings_postgresql, monkeypatch, fail_after_flush):
    from service import table_settings_service
    from service.session_operation_receipts import OperationRejected

    scope = table_settings_postgresql
    if fail_after_flush:
        stage = table_settings_service.stage_receipt

        def fail(*args):
            stage(*args)
            raise RuntimeError('After settings/revision/receipt flush')

        monkeypatch.setattr(table_settings_service, 'stage_receipt', fail)
        with pytest.raises(OperationRejected):
            scope.service.execute(scope.intent)
    else:
        assert not scope.service.execute(scope.intent).replayed
        assert scope.service.execute(scope.intent).replayed
    with scope.factory() as db:
        table = db.query(models.VirtualTable).filter_by(table_id=scope.table_id).one()
        assert (table.grid_cell_px, table.settings_revision) == ((50, 0) if fail_after_flush else (75, 1))
        assert db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id).count() == int(not fail_after_flush)


def test_concurrent_same_intent_settings_accept_once(table_settings_postgresql):
    from concurrent.futures import ThreadPoolExecutor

    from service.table_settings_service import TableSettingsService

    scope, barrier = table_settings_postgresql, threading.Barrier(2)

    def execute():
        barrier.wait(timeout=5)
        return TableSettingsService(scope.factory).execute(scope.intent)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = [future.result(timeout=10) for future in [executor.submit(execute) for _ in range(2)]]
    assert sorted(result.replayed for result in results) == [False, True]
    with scope.factory() as db:
        assert db.query(models.VirtualTable).filter_by(table_id=scope.table_id).one().settings_revision == 1
        assert db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id).count() == 1


@pytest.mark.parametrize('commit', [False, True])
def test_settings_lookup_waits_for_original_transaction(table_settings_postgresql, postgresql_engine, commit):
    from database import crud, schemas
    from service.session_operation_receipts import lock_operation_session, stage_receipt
    from service.table_settings_service import TableSettingsService

    scope, ready = table_settings_postgresql, threading.Event()
    writer, results, errors, pids = scope.factory(), [], [], []

    def reader_factory():
        db = scope.factory()
        pids.append(db.execute(text('SELECT pg_backend_pid()')).scalar_one())
        ready.set()
        return db

    def lookup():
        try:
            results.append(TableSettingsService(reader_factory).resolve(scope.intent))
        except BaseException as exc:
            errors.append(exc)

    reader = threading.Thread(target=lookup, daemon=True)
    try:
        lock_operation_session(writer, scope.intent.identity)
        crud.update_virtual_table(writer, scope.table_id, schemas.VirtualTableUpdate(grid_cell_px=75), commit=False)
        stage_receipt(writer, scope.intent.identity, {'success': True, 'table_id': scope.table_id})
        writer_pid = writer.execute(text('SELECT pg_backend_pid()')).scalar_one()
        reader.start()
        assert ready.wait(3)
        deadline, blocked = time.monotonic() + 3, False
        with postgresql_engine.connect().execution_options(isolation_level='AUTOCOMMIT') as observer:
            while time.monotonic() < deadline:
                blockers = observer.execute(text('SELECT pg_blocking_pids(:pid)'), {'pid': pids[0]}).scalar_one()
                if writer_pid in blockers:
                    blocked = True
                    break
                time.sleep(.01)
        assert blocked and not results and not errors
        writer.commit() if commit else writer.rollback()
        reader.join(timeout=5)
        assert not reader.is_alive() and not errors and len(results) == 1
        assert (results[0] is not None) is commit
        if commit:
            assert results[0].settings['settings_revision'] == 1
    finally:
        writer.rollback()
        writer.close()
        if reader.ident is not None:
            reader.join(timeout=6)


@pytest.fixture
def table_deletion_postgresql(session_operations_postgresql):
    from core_table.table import VirtualTable
    from database import crud
    from service.table_deletion_service import TableDeleteIntent, TableDeletionService

    scope = session_operations_postgresql
    table = VirtualTable('Delete contract', 1000, 1000)
    table.add_entity({'sprite_id': str(uuid.uuid4()), 'character_id': scope.character_id})
    table_id = str(table.table_id)
    with scope.factory() as db:
        crud.save_table_to_db(db, table, scope.session_id)
        db.add_all([
            models.GamePlayer(session_id=scope.session_id, user_id=scope.actor_id, role='owner', active_table_id=table_id),
            models.Wall(wall_id=str(uuid.uuid4()), table_id=table_id, x1=0, y1=0, x2=1, y2=1),
            models.PaintObject(id=str(uuid.uuid4()), table_id=table_id, kind='line', geometry={},
                               transform={}, style={}, created_by=scope.actor_id, z_order=1),
            models.CanvasCommandJournal(table_id=table_id, actor_id=scope.actor_id, operation_id=str(uuid.uuid4()),
                                        kind='paint', state='accepted', request_hash='a' * 64, result_json={}),
        ])
        db.commit()
    intent = TableDeleteIntent.create(scope.session_id, scope.actor_id, 'delete-original', {'table_id': table_id})
    return SimpleNamespace(**vars(scope) | {'table': table, 'table_id': table_id, 'intent': intent,
                                           'service': TableDeletionService(scope.factory)})


@pytest.mark.parametrize('fail_after_flush', [False, True])
def test_table_deletion_resources_pointers_retirement_and_receipt_share_acceptance(table_deletion_postgresql, monkeypatch, fail_after_flush):
    from database import crud
    from service import table_deletion_service
    from service.session_operation_receipts import OperationRejected

    scope = table_deletion_postgresql
    if fail_after_flush:
        stage = table_deletion_service.stage_receipt

        def fail(*args):
            stage(*args)
            raise RuntimeError('After table deletion/tombstone/receipt flush')

        monkeypatch.setattr(table_deletion_service, 'stage_receipt', fail)
        with pytest.raises(OperationRejected):
            scope.service.execute(scope.intent)
    else:
        assert not scope.service.execute(scope.intent).replayed
        assert scope.service.execute(scope.intent).replayed
        with scope.factory() as db, pytest.raises(ValueError, match='deleted'):
            crud.save_table_to_db(db, scope.table, scope.session_id)
    with scope.factory() as db:
        for model in (models.VirtualTable, models.Wall, models.PaintState, models.PaintObject, models.CanvasCommandJournal):
            assert db.query(model).filter_by(table_id=scope.table_id).count() == int(fail_after_flush)
        assert db.query(models.TableDeletionTombstone).filter_by(table_id=scope.table_id).count() == int(not fail_after_flush)
        assert db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id).count() == int(not fail_after_flush)
        member = db.query(models.GamePlayer).filter_by(session_id=scope.session_id).one()
        assert member.active_table_id == (scope.table_id if fail_after_flush else None)
        assert db.query(models.SessionCharacter).filter_by(character_id=scope.character_id).one().version == 1


def test_concurrent_table_deletions_with_one_identity_accept_once(table_deletion_postgresql):
    from concurrent.futures import ThreadPoolExecutor

    from service.table_deletion_service import TableDeletionService

    scope, barrier = table_deletion_postgresql, threading.Barrier(2)

    def execute():
        barrier.wait(timeout=5)
        return TableDeletionService(scope.factory).execute(scope.intent)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(execute) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]
    assert sorted(result.replayed for result in results) == [False, True]
    with scope.factory() as db:
        assert db.query(models.SessionOperationReceipt).filter_by(session_id=scope.session_id).count() == 1
        assert db.query(models.TableDeletionTombstone).filter_by(table_id=scope.table_id).count() == 1
        assert db.query(models.VirtualTable).filter_by(table_id=scope.table_id).count() == 0


@pytest.mark.parametrize('commit', [False, True])
def test_table_deletion_lookup_waits_for_original_transaction(table_deletion_postgresql, postgresql_engine, commit):
    from database.crud import stage_table_deletion
    from service.session_operation_receipts import lock_operation_session, stage_receipt
    from service.table_deletion_service import TableDeletionService

    scope, ready = table_deletion_postgresql, threading.Event()
    writer, results, errors, pids = scope.factory(), [], [], []

    def reader_factory():
        db = scope.factory()
        pids.append(db.execute(text('SELECT pg_backend_pid()')).scalar_one())
        ready.set()
        return db

    def lookup():
        try:
            results.append(TableDeletionService(reader_factory).resolve(scope.intent))
        except BaseException as exc:
            errors.append(exc)

    reader = threading.Thread(target=lookup, daemon=True)
    try:
        lock_operation_session(writer, scope.intent.identity)
        table = writer.query(models.VirtualTable).filter_by(table_id=scope.table_id).one()
        stage_table_deletion(writer, table, scope.actor_id)
        stage_receipt(writer, scope.intent.identity, scope.service._result(scope.intent))
        writer_pid = writer.execute(text('SELECT pg_backend_pid()')).scalar_one()
        reader.start()
        assert ready.wait(3)
        deadline, blocked = time.monotonic() + 3, False
        with postgresql_engine.connect().execution_options(isolation_level='AUTOCOMMIT') as observer:
            while time.monotonic() < deadline:
                blockers = observer.execute(text('SELECT pg_blocking_pids(:pid)'), {'pid': pids[0]}).scalar_one()
                if writer_pid in blockers:
                    blocked = True
                    break
                time.sleep(.01)
        assert blocked and not results and not errors
        writer.commit() if commit else writer.rollback()
        reader.join(timeout=5)
        assert not reader.is_alive() and not errors and len(results) == 1
        assert (results[0] is not None) is commit
    finally:
        writer.rollback()
        writer.close()
        if reader.ident is not None:
            reader.join(timeout=6)


@pytest.mark.parametrize("fail_after_movement_flush", [False, True])
def test_combat_movement_and_acceptance_share_transaction(postgresql_engine, monkeypatch, fail_after_movement_flush):
    from service import combat_persistence_service as persistence_module
    from service.combat_movement import CombatSpriteMovement
    from service.combat_persistence_service import CombatPersistenceService

    suffix = uuid.uuid4().hex[:12]
    table_id, sprite_id, encounter_id = (str(uuid.uuid4()) for _ in range(3))
    with postgresql_engine.connect() as connection:
        outer = connection.begin()
        factory = sessionmaker(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint")
        try:
            with factory() as db:
                owner = models.User(username=f"combat-{suffix}", hashed_password="not-a-real-hash")
                db.add(owner)
                db.flush()
                game = models.GameSession(name="Combat transaction", session_code=suffix, owner_id=owner.id)
                db.add(game)
                db.flush()
                table = models.VirtualTable(table_id=table_id, name="Combat table", width=1000, height=1000,
                                            session_id=game.id)
                db.add(table)
                db.flush()
                db.add(models.Entity(table_id=table.id, entity_id=1, sprite_id=sprite_id, name="Hero",
                                     position_x=100, position_y=100, layer="tokens", hp=17))
                db.commit()
                owner_id = owner.id
            service = CombatPersistenceService(factory)
            snapshot = {"combat_id": encounter_id, "table_id": table_id, "phase": "active", "state_version": 0}
            arguments: dict[str, Any] = dict(session_code=suffix, requester_key=f"user:{owner_id}", sequence_id=1,
                             actor_id="hero", command_type="start_combat", command_payload={},
                             result_payload={"accepted": True}, state_before={}, state_after=snapshot,
                             created_by=owner_id)
            service.persist_accepted(**arguments)
            stage = persistence_module.stage_combat_movements

            def stage_and_maybe_fail(db, session_id, movements):
                stage(db, session_id, movements)
                if fail_after_movement_flush:
                    raise RuntimeError("Injected failure after movement flush")

            monkeypatch.setattr(persistence_module, "stage_combat_movements", stage_and_maybe_fail)
            arguments.update(sequence_id=2, command_type="move", state_before={**snapshot, "state_version": 1},
                             movements=(CombatSpriteMovement(table_id, sprite_id, 1, (100, 100), (150, 100), None, None),))
            if fail_after_movement_flush:
                with pytest.raises(RuntimeError, match="after movement flush"):
                    service.persist_accepted(**arguments)
            else:
                accepted = service.persist_accepted(**arguments)
                replay = service.persist_accepted(**arguments)
                assert accepted.state_version == 2 and replay.duplicate
                assert accepted.result == replay.result
            with factory() as db:
                entity = db.query(models.Entity).filter_by(sprite_id=sprite_id).one()
                encounter = db.query(models.CombatEncounter).filter_by(encounter_id=encounter_id).one()
                expected = 1 if fail_after_movement_flush else 2
                assert (entity.position_x, entity.hp) == (100 if fail_after_movement_flush else 150, 17)
                assert encounter.state_version == expected
                assert db.query(models.CombatActionJournal).filter_by(encounter_id=encounter_id).count() == expected
        finally:
            outer.rollback()


@pytest.mark.parametrize("commit", [False, True])
def test_combat_outcome_lookup_waits_for_the_original_transaction(postgresql_engine, commit):
    from service.combat_persistence_service import CombatPersistenceService, PendingCombatCommit

    suffix = uuid.uuid4().hex[:12]
    factory = sessionmaker(bind=postgresql_engine, expire_on_commit=False)
    with factory() as db:
        owner = models.User(username=f"outcome-{suffix}", hashed_password="not-a-real-hash")
        db.add(owner)
        db.flush()
        game = models.GameSession(name="Outcome barrier", session_code=suffix, owner_id=owner.id)
        db.add(game)
        db.commit()
        owner_id, session_id = owner.id, game.id
    writer = factory()
    reader_ready = threading.Event()
    reader_pids, results, errors = [], [], []
    encounter_id = str(uuid.uuid4())
    snapshot = {"combat_id": encounter_id, "table_id": str(uuid.uuid4()), "phase": "active"}
    attempt = PendingCombatCommit(encounter_id, f"user:{owner_id}", 1, {}, snapshot, ())

    def read_session():
        db = factory()
        reader_pids.append(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
        reader_ready.set()
        return db

    def resolve():
        try:
            results.append(CombatPersistenceService(read_session)._resolve_commit(suffix, attempt))
        except BaseException as exc:
            errors.append(exc)

    reader = threading.Thread(target=resolve, daemon=True)
    try:
        CombatPersistenceService(factory).stage_accepted(
            writer, session_code=suffix, requester_key=attempt.requester_key, sequence_id=1,
            actor_id=None, command_type="start_combat", command_payload={},
            result_payload={"accepted": True}, state_before={}, state_after=snapshot, created_by=owner_id,
        )
        writer_pid = writer.execute(text("SELECT pg_backend_pid()")).scalar_one()
        reader.start()
        assert reader_ready.wait(3)
        deadline = time.monotonic() + 3
        blocked = False
        with postgresql_engine.connect().execution_options(isolation_level="AUTOCOMMIT") as observer:
            while time.monotonic() < deadline:
                blockers = observer.execute(text("SELECT pg_blocking_pids(:pid)"), {"pid": reader_pids[0]}).scalar_one()
                if writer_pid in blockers:
                    blocked = True
                    break
                time.sleep(.01)
        assert blocked, "Outcome lookup did not wait on the acceptance session-row lock"
        assert not results and not errors
        if commit:
            writer.commit()
        else:
            writer.rollback()
        reader.join(timeout=5)
        assert not reader.is_alive() and not errors
        assert len(results) == 1
        if commit:
            assert results[0] is not None and results[0].state_version == 1
        else:
            assert results[0] is None
    finally:
        writer.rollback()
        writer.close()
        if reader.ident is not None:
            reader.join(timeout=6)
        with postgresql_engine.begin() as connection:
            connection.execute(text("DELETE FROM combat_actions WHERE encounter_id = :id"), {"id": encounter_id})
            connection.execute(text("DELETE FROM combat_encounters WHERE encounter_id = :id"), {"id": encounter_id})
            connection.execute(text("DELETE FROM game_sessions WHERE id = :id"), {"id": session_id})
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": owner_id})


def test_combat_outcome_lookup_rejects_repeatable_read_snapshots(postgresql_engine):
    from service.combat_persistence_service import CombatPersistenceService, PendingCombatCommit

    engine = postgresql_engine.execution_options(isolation_level="REPEATABLE READ")
    service = CombatPersistenceService(sessionmaker(bind=engine))
    with pytest.raises(RuntimeError, match="READ COMMITTED"):
        service._resolve_commit("unused", PendingCombatCommit("unused", "user:1", 1, {}, {}, ()))


@pytest.mark.parametrize("fail_after_token_flush", [False, True])
@pytest.mark.parametrize("reconcile_stats", [False, True])
def test_character_source_and_linked_stats_share_transaction(postgresql_engine, monkeypatch, fail_after_token_flush, reconcile_stats):
    from managers import character_manager

    suffix = uuid.uuid4().hex[:12]
    character_id, table_id, sprite_id = (str(uuid.uuid4()) for _ in range(3))
    with postgresql_engine.connect() as connection:
        outer = connection.begin()
        factory = sessionmaker(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint")
        try:
            with factory() as db:
                owner = models.User(username=f"character-{suffix}", hashed_password="not-a-real-hash")
                db.add(owner)
                db.flush()
                game = models.GameSession(name="Character transaction", session_code=suffix, owner_id=owner.id)
                db.add(game)
                db.flush()
                table = models.VirtualTable(table_id=table_id, name="Linked table", width=1000, height=1000,
                                            session_id=game.id)
                db.add(table)
                db.flush()
                db.add_all([
                    models.SessionCharacter(character_id=character_id, session_id=game.id, owner_user_id=owner.id,
                        character_name="Hero", version=1, character_data=json.dumps({
                            "character_id": character_id, "name": "Hero", "schemaVersion": 1,
                            "data": {"stats": {"hp": 20, "maxHp": 20, "ac": 12}},
                        })),
                    models.Entity(table_id=table.id, entity_id=1, sprite_id=sprite_id, name="Hero",
                        position_x=100, position_y=100, layer="tokens", character_id=character_id,
                        hp=20, max_hp=20, ac=12),
                ])
                db.commit()
                owner_id, session_id = owner.id, game.id
            monkeypatch.setattr(character_manager, "SessionLocal", factory)
            stage = character_manager.stage_character_token_stats

            def stage_and_maybe_fail(db, session_id, character_id, stats):
                result = stage(db, session_id, character_id, stats)
                assert len(result) == 1
                assert db.query(models.Entity.hp).scalar() == 0
                if fail_after_token_flush:
                    raise RuntimeError("Injected failure after linked token flush")
                return result

            monkeypatch.setattr(character_manager, "stage_character_token_stats", stage_and_maybe_fail)
            manager = character_manager.ServerCharacterManager()
            target_stats = {"hp": 0, "maxHp": 30, "ac": 15}
            if reconcile_stats:
                with factory() as db:
                    source = db.query(models.SessionCharacter).filter_by(character_id=character_id).one()
                    document = json.loads(source.character_data)
                    document['data']['stats'] = target_stats
                    source.character_data = json.dumps(document)
                    db.commit()
                plan = manager.preview_stat_reconciliation(session_id, character_id, owner_id)
                result = manager.update_character(session_id, character_id, {}, owner_id,
                    stat_reconciliation_digest=plan['expected_digest'])
            else:
                result = manager.update_character(session_id, character_id,
                    {"data": {"stats": target_stats}}, owner_id, expected_version=1)
            assert result["success"] is not fail_after_token_flush
            with factory() as db:
                source = db.query(models.SessionCharacter).filter_by(character_id=character_id).one()
                token = db.query(models.Entity).filter_by(sprite_id=sprite_id).one()
                expected = {"hp": 20, "maxHp": 20, "ac": 12} if fail_after_token_flush else {
                    "hp": 0, "maxHp": 30, "ac": 15,
                }
                assert json.loads(source.character_data)["data"]["stats"] == (target_stats if reconcile_stats else expected)
                assert (token.hp, token.max_hp, token.ac) == (expected["hp"], expected["maxHp"], expected["ac"])
                assert source.version == (1 if fail_after_token_flush else 2)
                has_logs = db.query(models.CharacterLog).filter_by(character_id=character_id).count() > 0
                assert has_logs is not fail_after_token_flush
        finally:
            outer.rollback()


@pytest.mark.parametrize("commit", [False, True])
def test_character_outcome_lookup_waits_for_the_original_transaction(postgresql_engine, commit):
    from service.character_update_recovery import CharacterUpdateRecovery, PendingCharacterUpdate

    suffix = uuid.uuid4().hex[:12]
    character_id = str(uuid.uuid4())
    before, after = '{"name":"Hero","hp":20}', '{"name":"Hero","hp":5}'
    factory = sessionmaker(bind=postgresql_engine, expire_on_commit=False)
    with factory() as db:
        owner = models.User(username=f"char-outcome-{suffix}", hashed_password="not-a-real-hash")
        db.add(owner)
        db.flush()
        game = models.GameSession(name="Character outcome barrier", session_code=suffix, owner_id=owner.id)
        db.add(game)
        db.flush()
        db.add(models.SessionCharacter(character_id=character_id, session_id=game.id, owner_user_id=owner.id,
            character_name="Hero", version=1, character_data=before))
        db.commit()
        owner_id, session_id = owner.id, game.id
    writer = factory()
    reader_ready = threading.Event()
    reader_pids, results, errors = [], [], []

    def read_session():
        db = factory()
        reader_pids.append(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
        reader_ready.set()
        return db

    service = CharacterUpdateRecovery(read_session)
    attempt = PendingCharacterUpdate(session_id, character_id, owner_id, "original-character-request",
                                    1, before, after, {"version": 2}, {"hp": 5})
    service.remember(attempt)

    def resolve():
        try:
            results.append(service.resolve(session_id))
        except BaseException as exc:
            errors.append(exc)

    reader = threading.Thread(target=resolve, daemon=True)
    try:
        writer.query(models.GameSession).filter_by(id=session_id).with_for_update().one()
        source = writer.query(models.SessionCharacter).filter_by(character_id=character_id).with_for_update().one()
        source.version, source.character_data, source.last_modified_by = 2, after, owner_id
        writer.flush()
        writer_pid = writer.execute(text("SELECT pg_backend_pid()")).scalar_one()
        reader.start()
        assert reader_ready.wait(3)
        deadline = time.monotonic() + 3
        blocked = False
        with postgresql_engine.connect().execution_options(isolation_level="AUTOCOMMIT") as observer:
            while time.monotonic() < deadline:
                blockers = observer.execute(text("SELECT pg_blocking_pids(:pid)"), {"pid": reader_pids[0]}).scalar_one()
                if writer_pid in blockers:
                    blocked = True
                    break
                time.sleep(.01)
        assert blocked, "Character recovery did not wait on the original session-row lock"
        assert not results and not errors
        if commit:
            writer.commit()
        else:
            writer.rollback()
        reader.join(timeout=5)
        assert not reader.is_alive() and not errors
        assert len(results) == 1 and results[0] is not None
        assert results[0].committed is commit
        assert service.has_pending(session_id), "Verified state still needs live installation"
        service.complete(results[0])
        assert not service.has_pending(session_id)
    finally:
        writer.rollback()
        writer.close()
        if reader.ident is not None:
            reader.join(timeout=6)
        with postgresql_engine.begin() as connection:
            connection.execute(text("DELETE FROM session_characters WHERE character_id = :id"), {"id": character_id})
            connection.execute(text("DELETE FROM game_sessions WHERE id = :id"), {"id": session_id})
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": owner_id})


def test_character_outcome_lookup_rejects_repeatable_read_snapshots(postgresql_engine):
    from service.character_update_recovery import (
        CharacterUpdateOutcomeUnknown,
        CharacterUpdateRecovery,
        PendingCharacterUpdate,
    )

    engine = postgresql_engine.execution_options(isolation_level="REPEATABLE READ")
    service = CharacterUpdateRecovery(sessionmaker(bind=engine))
    service.remember(PendingCharacterUpdate(1, "unused", 1, "unused", 1, "{}", "{}", {"version": 2}, {}))
    with pytest.raises(CharacterUpdateOutcomeUnknown, match="READ COMMITTED"):
        service.resolve(1)
    assert service.has_pending(1)


@pytest.mark.parametrize("fail_after_flush", [False, True])
@pytest.mark.parametrize("create_source", [False, True])
def test_character_binding_and_sprite_receipt_share_acceptance(postgresql_engine, monkeypatch, fail_after_flush, create_source):
    from core_table.protocol import Message, MessageType
    from core_table.table import VirtualTable
    from service import sprite_editor_commands
    from service.sprite_editor_commands import SpriteCommandScope, SpriteEditorCommandService

    suffix = uuid.uuid4().hex[:12]
    table = VirtualTable("Binding transaction", 1000, 1000)
    with postgresql_engine.connect() as connection:
        outer = connection.begin()
        factory = sessionmaker(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint")
        try:
            with factory() as db:
                owner = models.User(username=f"binding-{suffix}", hashed_password="not-a-real-hash")
                db.add(owner)
                db.flush()
                game = models.GameSession(name="Binding transaction", session_code=suffix, owner_id=owner.id)
                db.add(game)
                db.flush()
                db.add(models.VirtualTable(table_id=str(table.table_id), name=table.display_name, width=1000, height=1000,
                                          session_id=game.id))
                npc_document = {"character_id": f"source-{suffix}", "name": "Hero", "schemaVersion": 1,
                                "data": {"stats": {"hp": 0, "maxHp": 30, "ac": None}}}
                if not create_source:
                    db.add(models.SessionCharacter(character_id=f"source-{suffix}", session_id=game.id,
                        owner_user_id=owner.id, character_name="Hero", version=3, character_data=json.dumps(npc_document)))
                db.commit()
                session_id, actor_id = game.id, owner.id
            before = table.to_dict()
            table.add_entity({"sprite_id": "bound", "x": 100, "y": 100, "hp": 99,
                              "character_id": f"source-{suffix}"})
            request = Message(MessageType.SPRITE_CREATE, {"table_id": str(table.table_id), "sprite_data": {
                "sprite_id": "bound", "x": 100, "y": 100, "character_id": f"source-{suffix}"}})
            scope = SpriteCommandScope.from_message(request, session_id, actor_id)
            assert scope is not None
            if create_source:
                scope.new_character.update(npc_document)
            stage = sprite_editor_commands.stage_sprite_delta

            def stage_and_maybe_fail(*args, **kwargs):
                stage(*args, **kwargs)
                if fail_after_flush:
                    raise RuntimeError("Injected failure after binding flush")

            monkeypatch.setattr(sprite_editor_commands, "stage_sprite_delta", stage_and_maybe_fail)
            service = SpriteEditorCommandService(factory)
            if fail_after_flush:
                with pytest.raises(RuntimeError, match="after binding flush"):
                    service.persist(scope=scope, before_snapshot=before, staged=table)
            else:
                assert service.persist(scope=scope, before_snapshot=before, staged=table)["success"]
                replay = service.replay(scope)
                assert replay is not None and replay["resync_required"]
            with factory() as db:
                entity = db.query(models.Entity).filter_by(sprite_id="bound").one_or_none()
                if fail_after_flush:
                    assert entity is None
                else:
                    assert entity is not None and (entity.hp, entity.max_hp, entity.ac) == (0, 30, None)
                assert db.query(models.CanvasCommandJournal).count() == (0 if fail_after_flush else 1)
                source = db.query(models.SessionCharacter).one_or_none()
                if create_source and fail_after_flush:
                    assert source is None
                else:
                    assert source is not None and source.version == (1 if create_source else 3)
                assert not db.query(models.CharacterLog).count()
        finally:
            outer.rollback()


def test_postgresql_schema_is_at_head_with_bounded_identifiers(postgresql_engine):
    inspector = inspect(postgresql_engine)

    assert postgresql_engine.dialect.name == "postgresql"
    assert schema_is_current(postgresql_engine)
    assert len(repository_heads()) == 1
    assert set(inspector.get_table_names()) == set(Base.metadata.tables) | {
        "alembic_version"
    }

    for table_name in Base.metadata.tables:
        for constraint_name in _constraint_names(inspector, table_name):
            assert len(constraint_name.encode("utf-8")) <= 63


def test_postgresql_foreign_key_actions_match_character_contract(postgresql_engine):
    inspector = inspect(postgresql_engine)
    permission_keys = {
        tuple(item["constrained_columns"]): item
        for item in inspector.get_foreign_keys("character_permissions")
    }
    draft_keys = {
        tuple(item["constrained_columns"]): item
        for item in inspector.get_foreign_keys("character_drafts")
    }

    assert permission_keys[("character_id",)]["options"]["ondelete"] == "CASCADE"
    assert permission_keys[("session_id",)]["options"]["ondelete"] == "CASCADE"
    assert permission_keys[("user_id",)]["options"]["ondelete"] == "CASCADE"
    assert draft_keys[("converted_character_id",)]["options"]["ondelete"] == "SET NULL"
    assert draft_keys[("last_modified_by",)]["options"]["ondelete"] == "SET NULL"


def test_postgresql_enforces_named_membership_uniqueness(postgresql_engine):
    suffix = uuid.uuid4().hex[:12]
    with postgresql_engine.connect() as connection:
        transaction = connection.begin()
        try:
            user_id = connection.execute(
                text(
                    "INSERT INTO users "
                    "(username, hashed_password, disabled, is_verified, session_version) "
                    "VALUES (:username, :password, false, false, 0) RETURNING id"
                ),
                {"username": f"member-{suffix}", "password": "not-a-real-hash"},
            ).scalar_one()
            session_id = connection.execute(
                text(
                    "INSERT INTO game_sessions "
                    "(name, session_code, owner_id, is_active, is_demo) "
                    "VALUES (:name, :code, :owner_id, true, false) RETURNING id"
                ),
                {
                    "name": "PostgreSQL contract",
                    "code": suffix.upper(),
                    "owner_id": user_id,
                },
            ).scalar_one()
            membership = {"session_id": session_id, "user_id": user_id}
            connection.execute(
                text(
                    "INSERT INTO game_players "
                    "(session_id, user_id, is_connected) "
                    "VALUES (:session_id, :user_id, false)"
                ),
                membership,
            )

            with pytest.raises(IntegrityError) as error:
                with connection.begin_nested():
                    connection.execute(
                        text(
                            "INSERT INTO game_players "
                            "(session_id, user_id, is_connected) "
                            "VALUES (:session_id, :user_id, false)"
                        ),
                        membership,
                    )

            diagnostic = getattr(error.value.orig, "diag", None)
            assert diagnostic is not None
            assert diagnostic.constraint_name == "uq_gameplayer_session_user"
        finally:
            transaction.rollback()


def test_postgresql_rejects_invalid_foreign_keys(postgresql_engine):
    suffix = uuid.uuid4().hex[:12]
    with postgresql_engine.connect() as connection:
        transaction = connection.begin()
        try:
            with pytest.raises(IntegrityError) as error:
                with connection.begin_nested():
                    connection.execute(
                        text(
                            "INSERT INTO game_sessions "
                            "(name, session_code, owner_id, is_active, is_demo) "
                            "VALUES (:name, :code, :owner_id, true, false)"
                        ),
                        {
                            "name": "Invalid owner",
                            "code": suffix.upper(),
                            "owner_id": 2_147_483_647,
                        },
                    )

            diagnostic = getattr(error.value.orig, "diag", None)
            assert diagnostic is not None
            assert diagnostic.constraint_name == "fk_game_sessions_owner_id_users"
        finally:
            transaction.rollback()


def _run_competing_inserts(
    engine,
    statement: str,
    parameters: list[dict],
) -> list[str]:
    barrier = threading.Barrier(len(parameters))
    outcomes: list[str] = []
    failures: list[BaseException] = []
    outcome_lock = threading.Lock()

    def insert(parameters_for_writer: dict) -> None:
        try:
            with engine.connect() as connection:
                transaction = connection.begin()
                try:
                    barrier.wait(timeout=5)
                    connection.execute(text(statement), parameters_for_writer)
                    transaction.commit()
                    outcome = "committed"
                except IntegrityError as exc:
                    transaction.rollback()
                    constraint_name = getattr(
                        getattr(exc.orig, "diag", None),
                        "constraint_name",
                        None,
                    )
                    assert isinstance(constraint_name, str)
                    outcome = constraint_name
                with outcome_lock:
                    outcomes.append(outcome)
        except BaseException as exc:
            with outcome_lock:
                failures.append(exc)

    threads = [
        threading.Thread(target=insert, args=(item,), daemon=True)
        for item in parameters
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    assert all(not thread.is_alive() for thread in threads)
    assert not failures
    return outcomes


def test_postgresql_serializes_chat_and_combat_idempotency(postgresql_engine):
    suffix = uuid.uuid4().hex[:12]
    with postgresql_engine.begin() as connection:
        user_id = connection.execute(
            text(
                "INSERT INTO users "
                "(username, hashed_password, disabled, is_verified, session_version) "
                "VALUES (:username, :password, false, false, 0) RETURNING id"
            ),
            {"username": f"idempotency-{suffix}", "password": "not-a-real-hash"},
        ).scalar_one()
        session_id = connection.execute(
            text(
                "INSERT INTO game_sessions "
                "(name, session_code, owner_id, is_active, is_demo) "
                "VALUES (:name, :code, :owner_id, true, false) RETURNING id"
            ),
            {
                "name": "Idempotency contract",
                "code": suffix.upper(),
                "owner_id": user_id,
            },
        ).scalar_one()
        encounter_id = str(uuid.uuid4())
        connection.execute(
            text(
                "INSERT INTO combat_encounters "
                "(encounter_id, session_id, table_id, round_number, "
                "current_turn_index, state_version) "
                "VALUES (:encounter_id, :session_id, :table_id, 0, 0, 0)"
            ),
            {
                "encounter_id": encounter_id,
                "session_id": session_id,
                "table_id": str(uuid.uuid4()),
            },
        )

    try:
        operation_id = f"chat-{suffix}"
        chat_outcomes = _run_competing_inserts(
            postgresql_engine,
            "INSERT INTO chat_messages "
            "(message_id, client_operation_id, session_id, user_id, channel, "
            "text, message_json) "
            "VALUES (:message_id, :operation_id, :session_id, :user_id, "
            "'public', 'hello', '{}')",
            [
                {
                    "message_id": str(uuid.uuid4()),
                    "operation_id": operation_id,
                    "session_id": session_id,
                    "user_id": user_id,
                }
                for _ in range(2)
            ],
        )
        assert sorted(chat_outcomes) == [
            "committed",
            "uq_chat_sender_operation",
        ]

        action_parameters = {
            "encounter_id": encounter_id,
            "requester_key": f"user:{user_id}",
            "sequence_id": 1,
            "created_by": user_id,
        }
        combat_outcomes = _run_competing_inserts(
            postgresql_engine,
            "INSERT INTO combat_actions "
            "(encounter_id, requester_key, sequence_id, command_type, "
            "command_payload_json, result_payload_json, state_before_json, "
            "state_after_hash, state_version, created_by) "
            "VALUES (:encounter_id, :requester_key, :sequence_id, 'test', "
            "'{}', '{}', '{}', :state_hash, 1, :created_by)",
            [
                {**action_parameters, "state_hash": character}
                for character in ("a" * 64, "b" * 64)
            ],
        )
        assert sorted(combat_outcomes) == [
            "committed",
            "uq_combat_action_request",
        ]
    finally:
        with postgresql_engine.begin() as connection:
            connection.execute(
                text("DELETE FROM combat_actions WHERE encounter_id = :encounter_id"),
                {"encounter_id": encounter_id},
            )
            connection.execute(
                text("DELETE FROM chat_messages WHERE session_id = :session_id"),
                {"session_id": session_id},
            )
            connection.execute(
                text(
                    "DELETE FROM combat_encounters "
                    "WHERE encounter_id = :encounter_id"
                ),
                {"encounter_id": encounter_id},
            )
            connection.execute(
                text("DELETE FROM game_sessions WHERE id = :session_id"),
                {"session_id": session_id},
            )
            connection.execute(
                text("DELETE FROM users WHERE id = :user_id"),
                {"user_id": user_id},
            )


def test_postgresql_for_update_serializes_competing_writers(postgresql_engine):
    suffix = uuid.uuid4().hex[:12]
    with postgresql_engine.begin() as connection:
        user_id = connection.execute(
            text(
                "INSERT INTO users "
                "(username, hashed_password, disabled, is_verified, session_version) "
                "VALUES (:username, :password, false, false, 0) RETURNING id"
            ),
            {"username": f"locker-{suffix}", "password": "not-a-real-hash"},
        ).scalar_one()

    attempted = threading.Event()
    acquired = threading.Event()
    failures: list[BaseException] = []

    def competing_writer() -> None:
        try:
            with postgresql_engine.connect() as connection:
                transaction = connection.begin()
                try:
                    connection.execute(text("SET LOCAL lock_timeout = '5s'"))
                    attempted.set()
                    connection.execute(
                        text("SELECT id FROM users WHERE id = :id FOR UPDATE"),
                        {"id": user_id},
                    ).scalar_one()
                    acquired.set()
                finally:
                    transaction.rollback()
        except BaseException as exc:  # surfaced in the main pytest thread
            failures.append(exc)

    first_connection = postgresql_engine.connect()
    first_transaction = first_connection.begin()
    contender = threading.Thread(target=competing_writer, daemon=True)
    try:
        first_connection.execute(
            text("SELECT id FROM users WHERE id = :id FOR UPDATE"),
            {"id": user_id},
        ).scalar_one()
        contender.start()
        assert attempted.wait(timeout=2)
        time.sleep(0.2)
        assert not acquired.is_set()

        first_transaction.commit()

        assert acquired.wait(timeout=5)
        contender.join(timeout=2)
        assert not failures
    finally:
        if first_transaction.is_active:
            first_transaction.rollback()
        first_connection.close()
        contender.join(timeout=2)
        with postgresql_engine.begin() as connection:
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})


def test_postgresql_paint_writers_receive_gap_free_revisions(postgresql_engine, monkeypatch):
    suffix = uuid.uuid4().hex[:12]
    table_id = str(uuid.uuid4())
    with postgresql_engine.begin() as connection:
        user_id = connection.execute(
            text(
                "INSERT INTO users "
                "(username, hashed_password, disabled, is_verified, session_version) "
                "VALUES (:username, :password, false, false, 0) RETURNING id"
            ),
            {
                "username": f"paint-writer-{suffix}",
                "password": "not-a-real-hash",
            },
        ).scalar_one()
        session_id = connection.execute(
            text(
                "INSERT INTO game_sessions "
                "(name, session_code, owner_id, is_active, is_demo) "
                "VALUES (:name, :code, :owner_id, true, false) RETURNING id"
            ),
            {
                "name": "Paint writer contract",
                "code": suffix.upper(),
                "owner_id": user_id,
            },
        ).scalar_one()
        with Session(bind=connection) as db:
            db.add(models.VirtualTable(
                table_id=table_id, name="Paint table", width=1000, height=1000,
                session_id=session_id,
            ))
            db.flush()
            db.add(models.PaintState(table_id=table_id, revision=0, next_z_order=1))
            db.flush()

    factory = sessionmaker(bind=postgresql_engine)
    barrier = threading.Barrier(2)
    issued_at = time.time() * 1000
    results = []
    failures: list[BaseException] = []
    result_lock = threading.Lock()

    def create_object(index: int, operation_id: str | None = None, object_id: str | None = None) -> None:
        try:
            object_id = object_id or str(uuid.uuid4())
            barrier.wait(timeout=5)
            result = PaintObjectService(factory).create(
                issued_at=issued_at,
                session_id=session_id,
                actor_id=user_id,
                table_id=table_id,
                operation_id=operation_id or str(uuid.uuid4()),
                editable={
                    "id": object_id,
                    "kind": "line",
                    "geometry": {
                        "kind": "line",
                        "start": {"x": index, "y": 0, "pressure": 1},
                        "end": {"x": index + 1, "y": 1, "pressure": 1},
                    },
                    "transform": {
                        "x": 0,
                        "y": 0,
                        "scale_x": 1,
                        "scale_y": 1,
                    },
                    "style": {
                        "stroke_rgba": [0.1, 0.2, 0.3, 1],
                        "width": 2,
                        "fill_rgba": None,
                    },
                },
            )
            with result_lock:
                results.append(result)
        except BaseException as exc:
            with result_lock:
                failures.append(exc)

    writers = [
        threading.Thread(target=create_object, args=(index,), daemon=True)
        for index in range(2)
    ]
    try:
        for writer in writers:
            writer.start()
        for writer in writers:
            writer.join(timeout=10)

        assert all(not writer.is_alive() for writer in writers)
        assert not failures
        assert all(result.error is None for result in results)
        assert sorted(result.event["revision"] for result in results) == [1, 2]
        assert sorted(result.event["object"]["z_order"] for result in results) == [1, 2]

        # Two simultaneous retries of one lost-ack command must commit once
        # and return the identical canonical result without a second broadcast.
        results.clear()
        retry_id, object_id = str(uuid.uuid4()), str(uuid.uuid4())
        writers = [threading.Thread(target=create_object, args=(2, retry_id, object_id), daemon=True) for _ in range(2)]
        for writer in writers:
            writer.start()
        for writer in writers:
            writer.join(timeout=10)
        assert all(not writer.is_alive() for writer in writers) and not failures
        assert len(results) == 2 and all(result.error is None for result in results)
        assert results[0].event == results[1].event
        assert results[0].event["revision"] == 3
        assert sorted(result.broadcast for result in results) == [False, True]

        snapshot = PaintObjectService(factory).snapshot(
            session_id=session_id,
            actor_id=user_id,
            table_id=table_id,
        )
        assert isinstance(snapshot, PaintSnapshot)
        assert snapshot.revision == 3
        assert [item["z_order"] for item in snapshot.objects] == [1, 2, 3]
        # Exercise JSONB freehand lengths and line points in the actual budget
        # query, including an excluded, point-growing replacement.
        monkeypatch.setattr(paint_service_module, "paint_limits", lambda: PaintLimits(61_440, 2_000, 8))
        service = PaintObjectService(factory)
        path = {key: snapshot.objects[0][key] for key in ("id", "kind", "geometry", "transform", "style")}
        path.update(id=str(uuid.uuid4()), kind="freehand",
                    geometry={"kind": "freehand", "points": [{"x": 0, "y": 0, "pressure": 1},
                                                             {"x": 1, "y": 1, "pressure": 1}]})
        context = {"session_id": session_id, "actor_id": user_id, "table_id": table_id}
        write_context = {**context, "issued_at": issued_at}
        assert service.create(**write_context, operation_id=str(uuid.uuid4()), editable=path).error is None
        extra = {**path, "id": str(uuid.uuid4())}
        rejected = service.create(**write_context, operation_id=str(uuid.uuid4()), editable=extra)
        assert rejected.error is not None and rejected.error.code == "limit_exceeded"
        path["geometry"]["points"].append({"x": 2, "y": 2, "pressure": 1})
        rejected = service.update(**write_context, operation_id=str(uuid.uuid4()), object_id=path["id"],
                                  expected_version=1, editable=path)
        assert rejected.error is not None and rejected.error.code == "limit_exceeded"
        confirmed = service.snapshot(**context)
        assert isinstance(confirmed, PaintSnapshot) and confirmed.revision == 4
    finally:
        for writer in writers:
            writer.join(timeout=2)
        with postgresql_engine.begin() as connection:
            connection.execute(
                text("DELETE FROM paint_operation_results WHERE table_id = :table_id"),
                {"table_id": table_id},
            )
            connection.execute(
                text("DELETE FROM paint_objects WHERE table_id = :table_id"),
                {"table_id": table_id},
            )
            connection.execute(
                text("DELETE FROM paint_state WHERE table_id = :table_id"),
                {"table_id": table_id},
            )
            connection.execute(
                text("DELETE FROM virtual_tables WHERE table_id = :table_id"),
                {"table_id": table_id},
            )
            connection.execute(
                text("DELETE FROM game_sessions WHERE id = :session_id"),
                {"session_id": session_id},
            )
            connection.execute(
                text("DELETE FROM users WHERE id = :user_id"),
                {"user_id": user_id},
            )


def test_postgresql_readiness_detects_revision_mismatch(postgresql_engine):
    current_revision = repository_heads()[0]
    checker = ReadinessChecker(
        SimpleNamespace(is_production=False),
        postgresql_engine,
        r2_manager=None,
        static_ui_path=Path("unused"),
        compendium_artifact=None,
    )
    assert checker._check_database() == {
        "ok": True,
        "revision": current_revision,
    }

    with postgresql_engine.begin() as connection:
        connection.execute(text("DELETE FROM alembic_version"))
    try:
        result = checker._check_database()
        assert result["ok"] is False
        assert result["code"] == "schema_revision_mismatch"
        assert result["applied_revision"] is None
    finally:
        with postgresql_engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO alembic_version (version_num) "
                    "VALUES (:revision)"
                ),
                {"revision": current_revision},
            )


def test_postgresql_pre_ping_recycles_terminated_connection(postgresql_engine):
    engine = create_engine(
        postgresql_engine.url,
        pool_pre_ping=True,
        pool_size=1,
        max_overflow=0,
    )
    terminator = create_engine(
        postgresql_engine.url,
        poolclass=NullPool,
    )
    try:
        with engine.connect() as connection:
            stale_backend_pid = connection.execute(
                text("SELECT pg_backend_pid()")
            ).scalar_one()

        with terminator.begin() as connection:
            assert connection.execute(
                text("SELECT pg_terminate_backend(:pid)"),
                {"pid": stale_backend_pid},
            ).scalar_one()

        with engine.connect() as connection:
            replacement_backend_pid = connection.execute(
                text("SELECT pg_backend_pid()")
            ).scalar_one()
            assert connection.execute(text("SELECT 1")).scalar_one() == 1
        assert replacement_backend_pid != stale_backend_pid
    finally:
        engine.dispose()
        terminator.dispose()


def test_postgresql_orm_round_trip_covers_core_persistence_families(
    postgresql_engine,
):
    suffix = uuid.uuid4().hex[:12]
    connection = postgresql_engine.connect()
    transaction = connection.begin()
    db = Session(bind=connection)
    try:
        owner = models.User(
            username=f"orm-{suffix}",
            email=f"orm-{suffix}@example.test",
            hashed_password="not-a-real-hash",
        )
        db.add(owner)
        db.flush()

        game = models.GameSession(
            name="PostgreSQL ORM smoke",
            session_code=suffix.upper(),
            owner_id=owner.id,
        )
        db.add(game)
        db.flush()

        membership = models.GamePlayer(session_id=game.id, user_id=owner.id)
        table = models.VirtualTable(
            table_id=str(uuid.uuid4()),
            name="ORM table",
            width=20,
            height=20,
            session_id=game.id,
        )
        db.add_all([membership, table])
        db.flush()

        character = models.SessionCharacter(
            character_id=str(uuid.uuid4()),
            session_id=game.id,
            character_name="ORM hero",
            character_data='{"name":"ORM hero"}',
            owner_user_id=owner.id,
        )
        entity = models.Entity(
            entity_id=1,
            sprite_id=str(uuid.uuid4()),
            table_id=table.id,
            name="ORM token",
            position_x=1,
            position_y=2,
            layer="tokens",
            character_id=character.character_id,
        )
        wall = models.Wall(
            wall_id=str(uuid.uuid4()),
            table_id=table.table_id,
            x1=0,
            y1=0,
            x2=5,
            y2=5,
        )
        stroke = models.PaintStroke(
            stroke_id=str(uuid.uuid4()),
            table_id=table.table_id,
            created_by=owner.id,
            stroke_data='{"points":[[0,0],[1,1]]}',
        )
        db.add_all([character, entity, wall, stroke])
        db.flush()

        permission = models.CharacterPermission(
            character_id=character.character_id,
            session_id=game.id,
            user_id=owner.id,
            granted_by=owner.id,
        )
        chat = models.ChatMessage(
            message_id=str(uuid.uuid4()),
            client_operation_id=f"chat-{suffix}",
            session_id=game.id,
            user_id=owner.id,
            username=owner.username,
            text="PostgreSQL ORM smoke",
            message_json='{"text":"PostgreSQL ORM smoke"}',
        )
        combat = models.CombatEncounter(
            encounter_id=str(uuid.uuid4()),
            session_id=game.id,
            table_id=table.table_id,
        )
        choice = models.ChoiceEncounter(
            encounter_id=str(uuid.uuid4()),
            session_id=game.id,
            session_code=game.session_code,
            table_id=table.table_id,
            title="ORM choice",
            description="Choose",
            phase="active",
            state_json="{}",
            participants_json="[]",
            choices_json="[]",
            dm_notes="",
            created_by=owner.id,
        )
        db.add_all([permission, chat, combat, choice])
        db.flush()

        combat_action = models.CombatActionJournal(
            encounter_id=combat.encounter_id,
            requester_key=f"user:{owner.id}",
            sequence_id=1,
            actor_id=character.character_id,
            command_type="orm_smoke",
            command_payload_json="{}",
            result_payload_json="{}",
            state_before_json="{}",
            state_after_hash="0" * 64,
            state_version=1,
            created_by=owner.id,
        )
        choice_event = models.ChoiceEncounterEvent(
            encounter_id=choice.encounter_id,
            sequence=1,
            event_type="created",
            actor_id=str(owner.id),
            payload_json="{}",
        )
        asset = models.Asset(
            asset_name="orm-smoke.png",
            r2_asset_id=f"orm-{suffix}",
            content_type="image/png",
            file_size=1,
            uploaded_by=owner.id,
            r2_key=f"assets/orm-{suffix}.png",
            r2_bucket="test-assets",
        )
        db.add_all([combat_action, choice_event, asset])
        db.flush()

        asset_link = models.SessionAsset(
            session_id=game.id,
            asset_id=asset.id,
            display_name="ORM smoke",
            added_by=owner.id,
        )
        db.add(asset_link)
        db.flush()

        stored_owner = db.get(models.User, owner.id)
        stored_table = db.get(models.VirtualTable, table.id)
        stored_entity = db.get(models.Entity, entity.id)
        stored_chat = db.get(models.ChatMessage, chat.id)
        stored_action = db.get(models.CombatActionJournal, combat_action.id)
        stored_choice = db.get(models.ChoiceEncounterEvent, choice_event.id)
        stored_asset_link = db.get(models.SessionAsset, asset_link.id)
        assert stored_owner is not None
        assert stored_table is not None
        assert stored_entity is not None
        assert stored_chat is not None
        assert stored_action is not None
        assert stored_choice is not None
        assert stored_asset_link is not None
        assert stored_owner.username == owner.username
        assert stored_table.table_id == table.table_id
        assert stored_entity.character_id == character.character_id
        assert stored_chat.client_operation_id == f"chat-{suffix}"
        assert stored_action.state_version == 1
        assert stored_choice.sequence == 1
        assert stored_asset_link.asset_id == asset.id
    finally:
        db.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()
