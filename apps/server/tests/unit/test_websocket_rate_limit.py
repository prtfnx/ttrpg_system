import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from api import game_ws
from fastapi import WebSocketDisconnect
from utils.websocket_rate_limit import WebSocketMessageLimiter, WebSocketRateExceeded

PREVIEW = {"type": "sprite_drag_preview", "data": {"sprite_id": "token"}}
PAINT_PREVIEW = {"type": "paint_preview", "data": {"temporary_id": "draft"}}
PAINT_PREVIEW_CANCEL = {
    "type": "paint_preview_cancel",
    "data": {"temporary_id": "draft"},
}
COMMAND = {"type": "sprite_move", "data": {"sprite_id": "token"}}


def test_normal_drag_and_final_move_fit_default_budgets():
    limiter = WebSocketMessageLimiter(120, 1800)
    for tick in range(1200):
        now = tick / 20
        assert limiter.allow_frame(now)
        assert limiter.filter_message(PREVIEW, now) is PREVIEW
    assert limiter.filter_message(COMMAND, 59.99) is COMMAND


def test_batch_counts_each_command_and_cannot_hide_inside_previews():
    limiter = WebSocketMessageLimiter(2, 10)
    batch = {"type": "batch_request", "data": {"messages": [PREVIEW, COMMAND, COMMAND]}}
    assert limiter.filter_message(batch, 0) is batch
    with pytest.raises(WebSocketRateExceeded):
        limiter.filter_message(COMMAND, 1)
    assert limiter.filter_message(COMMAND, 60) is COMMAND


def test_excess_previews_drop_without_losing_batched_final_move():
    limiter = WebSocketMessageLimiter(2, 1)
    assert limiter.filter_message(PREVIEW, 0) is PREVIEW
    assert limiter.filter_message(PREVIEW, 1) is None
    batch = {"type": "batch_request", "data": {"seq": 7, "messages": [PREVIEW, COMMAND]}}
    assert limiter.filter_message(batch, 2) == {
        "type": "batch_request", "data": {"seq": 7, "messages": [COMMAND]},
    }


@pytest.mark.parametrize("preview", [PAINT_PREVIEW, PAINT_PREVIEW_CANCEL])
def test_paint_preview_messages_use_disposable_budget(preview):
    limiter = WebSocketMessageLimiter(1, 1)

    assert limiter.filter_message(preview, 0) is preview
    assert limiter.filter_message(preview, 1) is None
    assert limiter.filter_message(COMMAND, 1) is COMMAND


def test_frame_budget_also_bounds_malformed_traffic():
    limiter = WebSocketMessageLimiter(2, 1)
    assert all(limiter.allow_frame(0) for _ in range(183))
    assert not limiter.allow_frame(0)
    assert limiter.allow_frame(60)


@pytest.mark.parametrize("items", [[], [COMMAND] * 101, [{"type": "batch_request"}], ["invalid"]])
def test_malformed_batches_are_rejected(items):
    with pytest.raises(ValueError):
        WebSocketMessageLimiter(120, 1800).filter_message(
            {"type": "batch_request", "data": {"messages": items}}, 0,
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("payload, count, close_code", [(PREVIEW, 1200, None), (COMMAND, 61, 1013)])
async def test_endpoint_separates_drag_traffic_from_command_abuse(monkeypatch, payload, count, close_code):
    websocket = MagicMock()
    websocket.headers = {"origin": "https://game.example.com"}
    websocket.cookies = {"token": "valid"}
    websocket.receive_text = AsyncMock(side_effect=[json.dumps(payload)] * count + [WebSocketDisconnect()])
    websocket.close = AsyncMock()
    manager = MagicMock()
    manager.connect = AsyncMock(return_value="client")
    manager.handle_message = AsyncMock()
    manager.disconnect = AsyncMock()
    monkeypatch.setattr(game_ws, "_origin_is_allowed", lambda _origin: True)
    monkeypatch.setattr(game_ws, "_load_websocket_session_context", lambda *_: (
        game_ws.WebSocketSessionContext(1, "player", "player"), None,
    ))
    await game_ws.websocket_game_endpoint(websocket, "TEST", manager)
    assert manager.handle_message.await_count == (count if close_code is None else 60)
    if close_code is None:
        websocket.close.assert_not_awaited()
    else:
        assert websocket.close.call_args.kwargs["code"] == close_code
    manager.disconnect.assert_awaited_once()


def test_sustained_editor_work_does_not_spend_query_or_heartbeat_capacity():
    limiter = WebSocketMessageLimiter(600, 1800)
    for index in range(200):
        assert limiter.filter_message(COMMAND, index * 0.2) is COMMAND
    for index in range(30):
        assert limiter.filter_message({"type": "table_request", "data": {}}, 40)
    with pytest.raises(WebSocketRateExceeded):
        limiter.filter_message({"type": "table_request", "data": {}}, 40)
    assert limiter.filter_message({"type": "ping", "data": {}}, 40)
    assert limiter.filter_message(COMMAND, 40)


def test_mixed_batch_admission_is_atomic_and_cannot_hide_a_command_flood():
    limiter = WebSocketMessageLimiter(2, 1800)
    request = {"type": "batch_request", "data": {"messages": [COMMAND] * 3 + [{"type": "ping", "data": {}}]}}
    with pytest.raises(WebSocketRateExceeded):
        limiter.filter_message(request, 0)
    assert limiter.filter_message(COMMAND, 0)
    assert limiter.filter_message(COMMAND, 0)
    with pytest.raises(WebSocketRateExceeded):
        limiter.filter_message(COMMAND, 0)


@pytest.mark.asyncio
async def test_endpoint_reads_heartbeat_while_a_durable_command_is_blocked(monkeypatch):
    release = asyncio.Event()
    websocket = MagicMock()
    websocket.headers, websocket.cookies = {}, {"token": "valid"}
    websocket.receive_text = AsyncMock(side_effect=[json.dumps(COMMAND), '{"type":"ping","data":{}}', WebSocketDisconnect()])
    websocket.close = AsyncMock()
    manager = MagicMock()
    manager.connect, manager.disconnect = AsyncMock(return_value="client"), AsyncMock()

    async def dispatch(_socket, message):
        if message["type"] == "ping":
            release.set()
        else:
            await release.wait()

    manager.handle_message = AsyncMock(side_effect=dispatch)
    monkeypatch.setattr(game_ws, "_origin_is_allowed", lambda _: True)
    monkeypatch.setattr(game_ws, "_load_websocket_session_context", lambda *_: (game_ws.WebSocketSessionContext(1, "player", "player"), None))
    await asyncio.wait_for(game_ws.websocket_game_endpoint(websocket, "TEST", manager), 1)
    assert manager.handle_message.await_count == 2


@pytest.mark.asyncio
async def test_endpoint_batch_preflight_releases_identified_members(monkeypatch):
    websocket = MagicMock()
    websocket.headers, websocket.cookies = {}, {"token": "valid"}
    request = {"type": "batch_request", "message_id": "outer", "data": {"messages": [
        {"type": "sprite_rotate", "message_id": "member", "data": {"table_id": "table", "action_id": "action"}}, "invalid"]}}
    websocket.receive_text = AsyncMock(side_effect=[json.dumps(request), WebSocketDisconnect()])
    websocket.close = AsyncMock()
    manager = MagicMock()
    manager.connect, manager.disconnect = AsyncMock(return_value="client"), AsyncMock()
    manager.handle_message, manager.send_personal_message = AsyncMock(), AsyncMock()
    monkeypatch.setattr(game_ws, "_origin_is_allowed", lambda _: True)
    monkeypatch.setattr(game_ws, "_load_websocket_session_context", lambda *_: (game_ws.WebSocketSessionContext(1, "player", "player"), None))
    await game_ws.websocket_game_endpoint(websocket, "TEST", manager)
    responses = [call.args[0] for call in manager.send_personal_message.call_args_list]
    assert [item["causation_id"] for item in responses] == ["member", "outer"]
    assert responses[0]["data"]["action_id"] == "action"
    manager.handle_message.assert_not_awaited()


@pytest.mark.parametrize("code", ["invalid_payload", "outcome_unknown"])
def test_malformed_operation_identity_has_a_schema_valid_correlated_denial(code):
    from core_table.protocol import Message
    from service.protocol_rejection import rejection_messages

    responses = rejection_messages({"type": "canvas_command", "message_id": "request",
        "data": {"operation_id": "malformed-id", "table_id": "table", "sprite_id": "sprite"}},
        "Invalid message format", code=code)
    response = Message.from_dict(next(iter(responses)).to_dict())
    assert response.causation_id == "request"
    assert response.data["operation_id"] == "malformed-id"
    assert response.data["table_id"] == "table" and response.data["sprite_id"] == "sprite"
    assert response.data.get("resync_required", False) == (code == "outcome_unknown")
