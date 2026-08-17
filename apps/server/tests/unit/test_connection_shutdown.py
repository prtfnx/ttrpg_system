from unittest.mock import AsyncMock, MagicMock

import pytest
from service import game_session
from service.game_session import ConnectionManager
from service.game_session_protocol import GameSessionProtocolService


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
    assert manager.user_connections[5] == {websocket}
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


def test_role_update_refreshes_every_live_authorization_cache(monkeypatch):
    manager = ConnectionManager()
    first = MagicMock()
    second = MagicMock()
    unrelated = MagicMock()
    manager.connection_info = {
        first: {
            "session_code": "ROOM",
            "user_id": 7,
            "username": "member",
            "role": "co_dm",
        },
        second: {
            "session_code": "ROOM",
            "user_id": 7,
            "username": "member",
            "role": "co_dm",
        },
        unrelated: {
            "session_code": "ROOM",
            "user_id": 8,
            "username": "other",
            "role": "spectator",
        },
    }
    protocol_service = MagicMock()
    manager.sessions_protocols["ROOM"] = protocol_service
    asset_manager = MagicMock()
    monkeypatch.setattr(game_session, "get_server_asset_manager", lambda: asset_manager)

    updated = manager.update_user_role("ROOM", 7, "player")

    assert updated == 2
    assert manager.connection_info[first]["role"] == "player"
    assert manager.connection_info[second]["role"] == "player"
    assert manager.connection_info[unrelated]["role"] == "spectator"
    protocol_service.update_user_role.assert_called_once_with(7, "player")
    asset_manager.setup_session_permissions.assert_called_once_with(
        "ROOM", 7, "member", "player"
    )


def test_protocol_role_update_refreshes_all_tabs_only():
    protocol_service = GameSessionProtocolService.__new__(GameSessionProtocolService)
    protocol_service.client_info = {
        "first": {"user_id": 7, "role": "co_dm"},
        "second": {"user_id": 7, "role": "co_dm"},
        "other": {"user_id": 8, "role": "spectator"},
    }

    assert protocol_service.update_user_role(7, "player") == 2
    assert protocol_service.client_info["first"]["role"] == "player"
    assert protocol_service.client_info["second"]["role"] == "player"
    assert protocol_service.client_info["other"]["role"] == "spectator"


@pytest.mark.asyncio
async def test_disconnect_user_revokes_all_tabs_and_is_idempotent(monkeypatch):
    manager = ConnectionManager()
    first = AsyncMock()
    second = AsyncMock()
    unrelated = AsyncMock()
    protocol_service = MagicMock()
    protocol_service.remove_client = AsyncMock()
    manager.sessions_protocols["ROOM"] = protocol_service
    manager.active_connections["ROOM"] = [first, second, unrelated]
    manager.connection_info = {
        first: {"session_code": "ROOM", "user_id": 7, "username": "member"},
        second: {"session_code": "ROOM", "user_id": 7, "username": "member"},
        unrelated: {"session_code": "ROOM", "user_id": 8, "username": "other"},
    }
    manager.user_connections = {7: {first, second}, 8: {unrelated}}
    manager.broadcast_to_session = AsyncMock()

    disconnected = await manager.disconnect_user(
        "ROOM", 7, reason="Kicked from session"
    )
    repeated = await manager.disconnect_user(
        "ROOM", 7, reason="Kicked from session"
    )

    assert disconnected == 2
    assert repeated == 0
    assert first not in manager.connection_info
    assert second not in manager.connection_info
    assert manager.connection_info[unrelated]["user_id"] == 8
    assert 7 not in manager.user_connections
    assert manager.user_connections[8] == {unrelated}
    assert manager.active_connections["ROOM"] == [unrelated]
    assert protocol_service.remove_client.await_count == 2
    first.send_json.assert_awaited_once_with({
        "type": "error",
        "data": {"error": "Kicked from session", "retryable": False},
    })
    first.close.assert_awaited_once_with(code=1008, reason="Kicked from session")
    second.close.assert_awaited_once_with(code=1008, reason="Kicked from session")
    unrelated.close.assert_not_awaited()


@pytest.mark.asyncio
async def test_disconnect_user_persists_and_cleans_last_session_once(monkeypatch):
    manager = ConnectionManager()
    first = AsyncMock()
    second = AsyncMock()
    protocol_service = MagicMock()
    protocol_service.remove_client = AsyncMock()
    manager.sessions_protocols["ROOM"] = protocol_service
    manager.active_connections["ROOM"] = [first, second]
    manager.connection_info = {
        first: {"session_code": "ROOM", "user_id": 7, "username": "member"},
        second: {"session_code": "ROOM", "user_id": 7, "username": "member"},
    }
    manager.user_connections = {7: {first, second}}
    asset_manager = MagicMock()
    monkeypatch.setattr(game_session, "get_server_asset_manager", lambda: asset_manager)

    assert await manager.disconnect_user("ROOM", 7, reason="Membership removed") == 2

    protocol_service.save_to_database.assert_called_once_with()
    protocol_service.cleanup.assert_called_once_with()
    asset_manager.cleanup_session.assert_called_once_with("ROOM")


@pytest.mark.asyncio
async def test_disconnect_account_revokes_every_session_but_not_other_users():
    manager = ConnectionManager()
    first = AsyncMock()
    second = AsyncMock()
    unrelated = AsyncMock()
    manager.connection_info = {
        first: {"session_code": "ONE", "user_id": 7, "username": "member"},
        second: {"session_code": "TWO", "user_id": 7, "username": "member"},
        unrelated: {"session_code": "ONE", "user_id": 8, "username": "other"},
    }
    manager.user_connections = {7: {first, second}, 8: {unrelated}}
    manager.active_connections = {
        "ONE": [first, unrelated],
        "TWO": [second],
    }
    first_protocol = MagicMock()
    first_protocol.remove_client = AsyncMock()
    second_protocol = MagicMock()
    second_protocol.remove_client = AsyncMock()
    manager.sessions_protocols = {"ONE": first_protocol, "TWO": second_protocol}
    manager.broadcast_to_session = AsyncMock()

    assert await manager.disconnect_account(7, reason="Account session revoked") == 2

    assert 7 not in manager.user_connections
    assert manager.user_connections[8] == {unrelated}
    assert list(manager.connection_info) == [unrelated]
    first.close.assert_awaited_once_with(code=1008, reason="Account session revoked")
    second.close.assert_awaited_once_with(code=1008, reason="Account session revoked")
    unrelated.close.assert_not_awaited()
