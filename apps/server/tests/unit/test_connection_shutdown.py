from unittest.mock import AsyncMock

import pytest
from service.game_session import ConnectionManager


@pytest.mark.asyncio
async def test_shutdown_notifies_drains_and_closes_every_connection():
    manager = ConnectionManager()
    first = AsyncMock()
    second = AsyncMock()
    manager.connection_info = {
        first: {"session_code": "ONE"},
        second: {"session_code": "TWO"},
    }
    manager.disconnect = AsyncMock()

    drained = await manager.close_all("Maintenance deploy")

    assert drained == 2
    first.send_json.assert_awaited_once_with({
        "type": "error",
        "data": {
            "error": "Maintenance deploy",
            "retryable": True,
        },
    })
    second.send_json.assert_awaited_once()
    assert manager.disconnect.await_count == 2
    first.close.assert_awaited_once_with(code=1012)
    second.close.assert_awaited_once_with(code=1012)
