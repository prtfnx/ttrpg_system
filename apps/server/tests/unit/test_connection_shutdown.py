from unittest.mock import AsyncMock, MagicMock

import pytest
from service import game_session
from service.game_session import ConnectionManager


@pytest.mark.asyncio
async def test_connect_retains_registry_and_releases_initialization_session(monkeypatch):
    manager = ConnectionManager()
    websocket = AsyncMock()
    session = MagicMock()
    registry = MagicMock(return_value=session)
    protocol_service = MagicMock()
    protocol_service.game_session_db_id = 17
    protocol_service.add_client = AsyncMock()
    asset_manager = MagicMock()
    loader = MagicMock(return_value=(protocol_service, None))
    monkeypatch.setattr(game_session, "create_task_scoped_session", lambda: registry)
    monkeypatch.setattr(game_session, "load_game_session_protocol_from_db", loader)
    monkeypatch.setattr(game_session, "get_server_asset_manager", lambda: asset_manager)

    await manager.connect(
        websocket,
        "ROOM",
        user_id=5,
        username="player",
    )

    loader.assert_called_once_with(
        session,
        "ROOM",
        persistence_session=registry,
    )
    registry.remove.assert_called_once_with()
    assert manager.sessions_protocols["ROOM"] is protocol_service
    websocket.accept.assert_awaited_once_with()


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
