from unittest.mock import AsyncMock, MagicMock

import pytest
from core_table.protocol import MessageType
from service.game_session import ConnectionManager


def _connected_manager(protocol_service=None):
    manager = ConnectionManager()
    websocket = MagicMock()
    manager.connection_info[websocket] = {
        "session_code": "TST",
        "username": "Alice",
    }
    if protocol_service is not None:
        manager.sessions_protocols["TST"] = protocol_service
    send_personal_message = AsyncMock()
    broadcast_to_session = AsyncMock()
    manager.send_personal_message = send_personal_message
    manager.broadcast_to_session = broadcast_to_session
    return manager, websocket, send_personal_message, broadcast_to_session


@pytest.mark.unit
@pytest.mark.asyncio
async def test_protocol_handler_failure_sends_one_terminal_generic_error():
    protocol_service = MagicMock()
    protocol_service.handle_protocol_message = AsyncMock(
        side_effect=RuntimeError("database connection details"),
    )
    manager, websocket, send_personal_message, broadcast_to_session = (
        _connected_manager(protocol_service)
    )

    await manager.handle_message(
        websocket,
        {"type": MessageType.PING.value, "data": {}},
    )

    send_personal_message.assert_awaited_once_with(
        {
            "type": MessageType.ERROR.value,
            "data": {"error": "Error processing message"},
        },
        websocket,
    )
    broadcast_to_session.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_missing_protocol_service_sends_one_terminal_generic_error():
    manager, websocket, send_personal_message, _ = _connected_manager()

    await manager.handle_message(
        websocket,
        {"type": MessageType.PING.value, "data": {}},
    )

    send_personal_message.assert_awaited_once_with(
        {
            "type": MessageType.ERROR.value,
            "data": {"error": "Error processing message"},
        },
        websocket,
    )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_unknown_message_type_still_uses_legacy_error():
    manager, websocket, send_personal_message, _ = _connected_manager()

    await manager.handle_message(
        websocket,
        {"type": "not_registered", "data": {}},
    )

    send_personal_message.assert_awaited_once_with(
        {
            "type": "error",
            "data": {"message": "Unknown message type: not_registered"},
        },
        websocket,
    )
