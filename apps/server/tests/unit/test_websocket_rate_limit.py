import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from api import game_ws
from fastapi import WebSocketDisconnect
from utils.websocket_rate_limit import WebSocketMessageLimiter, WebSocketRateExceeded

PREVIEW = {"type": "sprite_drag_preview", "data": {"sprite_id": "token"}}
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


def test_frame_budget_also_bounds_malformed_traffic():
    limiter = WebSocketMessageLimiter(2, 1)
    assert all(limiter.allow_frame(0) for _ in range(3))
    assert not limiter.allow_frame(0)
    assert limiter.allow_frame(60)


@pytest.mark.parametrize("items", [[], [COMMAND] * 101, [{"type": "batch_request"}], ["invalid"]])
def test_malformed_batches_are_rejected(items):
    with pytest.raises(ValueError):
        WebSocketMessageLimiter(120, 1800).filter_message(
            {"type": "batch_request", "data": {"messages": items}}, 0,
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("payload, count, close_code", [(PREVIEW, 1200, None), (COMMAND, 121, 1013)])
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
    assert manager.handle_message.await_count == (count if close_code is None else 120)
    if close_code is None:
        websocket.close.assert_not_awaited()
    else:
        assert websocket.close.call_args.kwargs["code"] == close_code
    manager.disconnect.assert_awaited_once()
