import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

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
