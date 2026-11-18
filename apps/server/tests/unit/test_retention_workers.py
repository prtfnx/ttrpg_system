import asyncio
import threading
from datetime import datetime, timedelta
from unittest.mock import MagicMock

import main
import pytest
from database import models
from service import retention
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.mark.parametrize('kind', ['audit', 'chat'])
def test_retention_commits_only_rows_older_than_the_cutoff(monkeypatch, kind):
    engine = create_engine('sqlite:///:memory:')
    models.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    now = datetime(2026, 11, 17)
    monkeypatch.setattr(retention, 'SessionLocal', factory)
    monkeypatch.setattr(retention, 'utc_now', lambda: now)
    with factory() as db:
        user = models.User(username='owner', email='owner@example.com', hashed_password='x')
        db.add(user)
        db.flush()
        game = models.GameSession(name='Retention', session_code='RETENTION', owner_id=user.id)
        db.add(game)
        db.flush()
        for days in (31, 30, 0):
            if kind == 'audit':
                row = models.AuditLog(event_type='test', timestamp=now - timedelta(days=days))
            else:
                row = models.ChatMessage(
                    message_id=f'message-{days}', client_operation_id=f'op-{days}',
                    session_id=game.id, user_id=user.id, text='hello', message_json='{}',
                    created_at=now - timedelta(days=days),
                )
            db.add(row)
        db.commit()
    try:
        cleanup = retention.cleanup_expired_audit_logs if kind == 'audit' else retention.cleanup_expired_chat_messages
        assert cleanup(30) == 1
        with factory() as db:
            model = models.AuditLog if kind == 'audit' else models.ChatMessage
            assert db.query(model).count() == 2
    finally:
        engine.dispose()


@pytest.mark.parametrize('kind', ['audit', 'chat'])
async def test_retention_keeps_session_lifecycle_off_the_event_loop(monkeypatch, kind):
    loop = asyncio.get_running_loop()
    event_loop_thread = threading.get_ident()
    started, closed = asyncio.Event(), asyncio.Event()
    release = threading.Event()
    threads = []
    db = MagicMock()
    db.query.return_value.filter.return_value.delete.side_effect = lambda **_kwargs: threads.append(threading.get_ident()) or 1

    def commit():
        threads.append(threading.get_ident())
        loop.call_soon_threadsafe(started.set)
        assert release.wait(5), 'test did not release the slow database worker'

    def close(*_args):
        threads.append(threading.get_ident())
        loop.call_soon_threadsafe(closed.set)

    def session():
        threads.append(threading.get_ident())
        db.__enter__.return_value = db
        db.__exit__.side_effect = close
        db.commit.side_effect = commit
        return db

    real_sleep = asyncio.sleep
    sleeps = 0

    async def one_tick(_seconds):
        nonlocal sleeps
        sleeps += 1
        if sleeps == 1:
            await real_sleep(0)
        else:
            await asyncio.Future()

    monkeypatch.setattr(retention, 'SessionLocal', session)
    monkeypatch.setattr(main.asyncio, 'sleep', one_tick)
    worker = asyncio.create_task(main.audit_retention_task() if kind == 'audit' else main.chat_retention_task())
    try:
        await asyncio.wait_for(started.wait(), 1)
        heartbeat = asyncio.Event()
        loop.call_soon(heartbeat.set)
        await asyncio.wait_for(heartbeat.wait(), 1)
        assert not release.is_set()
        assert not worker.done()
    finally:
        worker.cancel()
        release.set()
        await worker
        await asyncio.wait_for(closed.wait(), 1)
    assert len(threads) == 4
    assert all(thread_id != event_loop_thread for thread_id in threads)
