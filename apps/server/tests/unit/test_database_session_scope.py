import asyncio

import pytest
from database.database import create_task_scoped_session


@pytest.mark.asyncio
async def test_task_scoped_sessions_are_isolated_and_removed():
    registry = create_task_scoped_session()
    both_created = asyncio.Event()
    sessions = []

    async def use_session():
        session = registry()
        sessions.append(session)
        if len(sessions) == 2:
            both_created.set()
        await both_created.wait()
        assert registry() is session
        registry.remove()

    await asyncio.gather(use_session(), use_session())

    assert sessions[0] is not sessions[1]


@pytest.mark.asyncio
async def test_remove_ends_current_task_session_scope():
    registry = create_task_scoped_session()
    first = registry()

    registry.remove()
    second = registry()
    registry.remove()

    assert second is not first
