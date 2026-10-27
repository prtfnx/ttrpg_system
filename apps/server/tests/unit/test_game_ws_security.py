import asyncio
import threading
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest
from api import game_ws
from routers.users import create_access_token


def test_development_wildcard_allows_browser_origin(monkeypatch):
    monkeypatch.setattr(
        game_ws,
        "settings",
        SimpleNamespace(cors_origin_list=["*"], is_production=False),
    )

    assert game_ws._origin_is_allowed("http://localhost:5173")
    assert game_ws._origin_is_allowed(None)


def test_explicit_origin_allowlist_fails_closed(monkeypatch):
    monkeypatch.setattr(
        game_ws,
        "settings",
        SimpleNamespace(
            cors_origin_list=["https://game.example.com"],
            is_production=True,
        ),
    )

    assert game_ws._origin_is_allowed("https://game.example.com")
    assert not game_ws._origin_is_allowed("https://attacker.example")
    assert not game_ws._origin_is_allowed(None)


def test_websocket_auth_accepts_current_active_user(test_db, test_user):
    token = create_access_token(
        data={
            "sub": test_user.username,
            "sv": test_user.session_version or 0,
        },
    )

    user = game_ws.get_user_from_token(token, test_db)

    assert user is not None
    assert user.id == test_user.id


def test_websocket_auth_rejects_revoked_token(test_db, test_user):
    token = create_access_token(
        data={
            "sub": test_user.username,
            "sv": test_user.session_version or 0,
        },
    )
    test_user.session_version = (test_user.session_version or 0) + 1
    test_db.commit()

    assert game_ws.get_user_from_token(token, test_db) is None


def test_websocket_auth_rejects_disabled_user(test_db, test_user):
    test_user.disabled = True
    test_db.commit()
    token = create_access_token(
        data={
            "sub": test_user.username,
            "sv": test_user.session_version or 0,
        },
    )

    assert game_ws.get_user_from_token(token, test_db) is None


@pytest.mark.asyncio
async def test_websocket_auth_rejection_closes_handshake_session(monkeypatch):
    websocket = MagicMock()
    websocket.headers = {"origin": "https://game.example.com"}
    websocket.cookies = {"token": "invalid"}
    websocket.close = AsyncMock()
    db = MagicMock()
    session_threads = []
    session_factory = MagicMock(side_effect=lambda: (
        session_threads.append(threading.get_ident()) or db
    ))
    event_loop_thread = threading.get_ident()
    monkeypatch.setattr(game_ws, "SessionLocal", session_factory)
    monkeypatch.setattr(game_ws, "_origin_is_allowed", lambda _origin: True)
    monkeypatch.setattr(game_ws, "get_user_from_token", lambda _token, _db: None)

    await game_ws.websocket_game_endpoint(websocket, "TST", MagicMock())

    session_factory.assert_called_once_with()
    assert session_threads and session_threads[0] != event_loop_thread
    db.close.assert_called_once_with()
    websocket.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_websocket_origin_rejection_does_not_open_database_session(monkeypatch):
    websocket = MagicMock()
    websocket.headers = {"origin": "https://attacker.example"}
    websocket.close = AsyncMock()
    session_factory = MagicMock()
    monkeypatch.setattr(game_ws, "SessionLocal", session_factory)
    monkeypatch.setattr(game_ws, "_origin_is_allowed", lambda _origin: False)

    await game_ws.websocket_game_endpoint(websocket, "TST", MagicMock())

    session_factory.assert_not_called()
    websocket.close.assert_awaited_once()


@pytest.mark.parametrize("expiration", [None, float("nan"), float("inf"), "9999999999", True, 10 ** 400])
def test_account_token_requires_a_finite_numeric_expiration(test_db, test_user, expiration):
    from service.authentication import ALGORITHM, SECRET_KEY, AccessTokenRejected, resolve_active_account_from_token

    payload = {"sub": test_user.username, "sv": test_user.session_version or 0}
    if expiration is not None:
        payload["exp"] = expiration
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    with pytest.raises(AccessTokenRejected):
        resolve_active_account_from_token(token, test_db)


async def test_account_message_received_after_expiration_is_not_dispatched(monkeypatch):
    websocket = MagicMock()
    websocket.headers = {}
    websocket.cookies = {"token": "account"}
    websocket.query_params = {}
    websocket.close = AsyncMock()
    now = time.time()
    clock = {"now": now}

    async def late_message():
        clock["now"] = now + 2
        await asyncio.sleep(0)
        return '{"type":"ping"}'

    websocket.receive_text = AsyncMock(side_effect=late_message)
    manager = MagicMock()
    manager.connect = AsyncMock(return_value="account-client")
    manager.disconnect = AsyncMock()
    manager.handle_message = AsyncMock()
    monkeypatch.setattr(game_ws, "_origin_is_allowed", lambda _: True)
    monkeypatch.setattr(game_ws, "_load_websocket_session_context", lambda *_: (
        game_ws.WebSocketSessionContext(1, "account", "owner", token_expires_at=now + 1), None))
    monkeypatch.setattr(game_ws.time, "time", lambda: clock["now"])

    await asyncio.wait_for(game_ws.websocket_game_endpoint(websocket, "TEST", manager), 2)

    websocket.close.assert_awaited_once_with(code=1008, reason="Authentication expired")
    manager.handle_message.assert_not_awaited()
    manager.disconnect.assert_awaited_once()


async def test_expiry_prevents_queued_work_but_settles_started_work(monkeypatch):
    websocket = MagicMock()
    websocket.headers = {}
    websocket.cookies = {"token": "account"}
    websocket.query_params = {}
    websocket.close = AsyncMock()
    now = time.time()
    clock = {"now": now}
    started, release = asyncio.Event(), asyncio.Event()
    receives = 0

    async def receive():
        nonlocal receives
        receives += 1
        if receives == 2:
            await started.wait()
        elif receives == 3:
            # Release the first operation while a second frame is queued and
            # the receive coroutine has not yet performed its expiry check.
            clock["now"] = now + 2
            release.set()
            await asyncio.sleep(0)
        return '{"type":"table_list_request"}'

    async def handle(*_args):
        started.set()
        await release.wait()

    websocket.receive_text = AsyncMock(side_effect=receive)
    manager = MagicMock()
    manager.connect = AsyncMock(return_value="account-client")
    manager.disconnect = AsyncMock()
    manager.handle_message = AsyncMock(side_effect=handle)
    monkeypatch.setattr(game_ws, "_origin_is_allowed", lambda _: True)
    monkeypatch.setattr(game_ws, "_load_websocket_session_context", lambda *_: (
        game_ws.WebSocketSessionContext(1, "account", "owner", token_expires_at=now + 1), None))
    monkeypatch.setattr(game_ws.time, "time", lambda: clock["now"])

    await asyncio.wait_for(game_ws.websocket_game_endpoint(websocket, "TEST", manager), 2)

    websocket.close.assert_awaited_once_with(code=1008, reason="Authentication expired")
    manager.handle_message.assert_awaited_once()
    manager.disconnect.assert_awaited_once()
