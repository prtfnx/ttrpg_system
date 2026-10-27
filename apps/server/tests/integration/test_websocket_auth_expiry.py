"""A signed account credential limits idle and active ASGI WebSocket lifetimes."""
import asyncio
import math
import time
from unittest.mock import AsyncMock

import jwt
import pytest
from api import game_ws
from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient
from service.authentication import ALGORITHM, SECRET_KEY
from sqlalchemy.orm import sessionmaker
from starlette.websockets import WebSocketDisconnect


@pytest.mark.parametrize("active", [False, True])
def test_signed_account_socket_closes_at_token_expiry(test_db_engine, test_user, test_game_session, monkeypatch, active):
    factory = sessionmaker(bind=test_db_engine)
    monkeypatch.setattr(game_ws, "SessionLocal", factory)
    monkeypatch.setattr(game_ws, "_origin_is_allowed", lambda _: True)
    manager = AsyncMock()

    async def connect(socket, *_args, **_kwargs):
        await socket.accept()
        return "account-client"

    async def handle(socket, _message):
        await socket.send_json({"type": "pong"})

    manager.connect.side_effect = connect
    manager.handle_message.side_effect = handle
    app = FastAPI()

    @app.websocket("/ws/game/{session_code}")
    async def socket_endpoint(socket: WebSocket, session_code: str):
        # Bound a missing-expiry regression so the receive test cannot hang.
        try:
            await asyncio.wait_for(game_ws.websocket_game_endpoint(socket, session_code, manager), 6)
        except TimeoutError:
            await socket.close(code=1011, reason="Test endpoint deadline exceeded")

    expiration = math.ceil(time.time()) + 2
    token = jwt.encode({"sub": test_user.username, "sv": test_user.session_version or 0, "exp": expiration},
                       SECRET_KEY, algorithm=ALGORITHM)
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws/game/{test_game_session.session_code}",
                                      headers={"Cookie": f"token={token}"}) as socket:
            with pytest.raises(WebSocketDisconnect) as closed:
                if active:
                    while True:
                        socket.send_json({"type": "ping"})
                        socket.receive_json()
                        time.sleep(.5)
                else:
                    socket.receive_json()
            assert closed.value.code == 1008
            assert closed.value.reason == "Authentication expired"
    assert time.time() >= expiration
    assert manager.handle_message.await_count > 0 if active else manager.handle_message.await_count == 0
    manager.disconnect.assert_awaited_once()
