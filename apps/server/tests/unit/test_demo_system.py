import asyncio
import json
import time
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from api import game_ws
from database import crud, models
from fastapi import WebSocketDisconnect
from routers.users import create_access_token
from service import demo_guests
from service.authentication import AccessTokenRejected, resolve_active_user_from_token
from sqlalchemy.orm import sessionmaker
from utils.time import utc_now


@pytest.fixture
def client(client):
    client.headers["Accept"] = "application/json"
    return client


def test_demo_preserves_login_and_bootstraps_real_spectator(client, test_db, test_user, auth_token):
    client.cookies.set("token", auth_token)
    response = client.get("/demo", follow_redirects=False)
    assert response.status_code == 302
    assert "token" not in response.cookies
    assert client.cookies.get("token") == auth_token
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "Max-Age=1800" in cookie and "SameSite=lax" in cookie
    guest = demo_guests.resolve_demo_guest(response.cookies["demo_token"], test_db)
    assert guest.id != test_user.id
    assert guest.guest_expires_at is not None
    assert utc_now() < guest.guest_expires_at <= utc_now() + timedelta(minutes=30)
    membership = test_db.query(models.GamePlayer).filter_by(user_id=guest.id).one()
    assert membership.role == "spectator"
    assert membership.active_table_id
    host = membership.session.owner
    assert host.disabled
    assert not crud.authenticate_user(test_db, host.username, "demo_password_not_used")
    page = client.get(response.headers["location"])
    assert page.status_code == 200
    assert '"isDemo": true' in page.text
    assert guest.username in page.text
    assert client.get("/demo/me").json()["id"] == guest.id
    assert client.get("/users/me", headers={"Accept": "application/json"}).json()["id"] == test_user.id
    assert client.get("/demo/membership").json()["role"] == "spectator"
    assert client.get("/demo/players").status_code == 200
    leave = client.get("/demo/logout", follow_redirects=False)
    assert "token" not in leave.cookies
    assert client.cookies.get("token") == auth_token
    assert client.get("/demo/me").status_code == 401


def test_guests_are_unique_and_rate_limited(client, test_db):
    ids = []
    for _ in range(3):
        response = client.get("/demo", follow_redirects=False)
        assert response.status_code == 302
        ids.append(demo_guests.resolve_demo_guest(response.cookies["demo_token"], test_db).id)
    assert len(set(ids)) == 3
    assert client.get("/demo", follow_redirects=False).status_code == 429
    assert test_db.query(models.GameSession).filter_by(is_demo=True).count() == 1


@pytest.mark.parametrize("path", [
    "/users/me", "/users/dashboard", "/game/session/TEST01?demo=1",
    "/game/api/sessions/TEST01/me?demo=1",
    "/game/session/DEMO2026/settings?demo=1",
])
def test_guest_cannot_use_account_or_other_session_routes(client, path):
    client.get("/demo", follow_redirects=False)
    assert client.get(path, follow_redirects=False).status_code in (401, 403)


def test_guest_token_cannot_be_repurposed_as_account_token(client, test_db):
    response = client.get("/demo", follow_redirects=False)
    token = response.cookies["demo_token"]
    guest = demo_guests.resolve_demo_guest(token, test_db)
    with pytest.raises(AccessTokenRejected):
        resolve_active_user_from_token(token, test_db)
    with pytest.raises(AccessTokenRejected, match="guest_scope"):
        resolve_active_user_from_token(create_access_token({"sub": guest.username}), test_db)
    client.cookies.set("token", token)
    assert client.post("/game/create", data={"name": "Unauthorized"}).status_code == 401


@pytest.mark.parametrize("change", ["expired", "disabled", "revoked", "membership", "inactive_session"])
def test_guest_authority_is_checked_again_on_entry(client, test_db, change):
    response = client.get("/demo", follow_redirects=False)
    token = response.cookies["demo_token"]
    guest = demo_guests.resolve_demo_guest(token, test_db)
    player = test_db.query(models.GamePlayer).filter_by(user_id=guest.id).one()
    if change == "expired":
        guest.guest_expires_at = utc_now() - timedelta(seconds=1)
    elif change == "disabled":
        guest.disabled = True
    elif change == "revoked":
        guest.session_version += 1
    elif change == "membership":
        player.role = "owner"
    else:
        player.session.is_active = False
    test_db.commit()
    assert client.get("/demo/me").status_code == 401
    assert client.get(response.headers["location"]).status_code == 401


def test_expired_guest_cleanup_preserves_normal_users(client, test_db, test_db_engine, test_user, monkeypatch):
    response = client.get("/demo", follow_redirects=False)
    guest = demo_guests.resolve_demo_guest(response.cookies["demo_token"], test_db)
    guest_id = guest.id
    guest.guest_expires_at = utc_now() - timedelta(minutes=6)
    test_db.commit()
    monkeypatch.setattr(demo_guests, "SessionLocal", sessionmaker(bind=test_db_engine))
    assert demo_guests.cleanup_expired_guests() == 1
    test_db.expire_all()
    assert test_db.query(models.User).filter_by(id=guest_id).first() is None
    assert test_db.query(models.GamePlayer).filter_by(user_id=guest_id).count() == 0
    assert test_db.get(models.User, test_user.id) is not None
    assert demo_guests.cleanup_expired_guests() == 0


def test_websocket_resolves_guest_with_real_membership(client, test_db_engine, monkeypatch, auth_token):
    response = client.get("/demo", follow_redirects=False)
    token = response.cookies["demo_token"]
    monkeypatch.setattr(game_ws, "SessionLocal", sessionmaker(bind=test_db_engine))
    context, reason = game_ws._load_websocket_session_context(token, "DEMO2026", True)
    assert reason is None
    assert context is not None and context.guest_expires_at is not None
    assert context.role == "spectator"
    assert context.guest_expires_at > time.time()
    assert game_ws._load_websocket_session_context(token, "TEST01", True)[0] is None
    assert game_ws._load_websocket_session_context(token, "DEMO2026")[0] is None
    assert game_ws._load_websocket_session_context(auth_token, "DEMO2026", True)[0] is None


@pytest.mark.asyncio
async def test_guest_transport_rejects_writes_including_mixed_batches(monkeypatch):
    websocket = MagicMock()
    websocket.headers = {}
    websocket.query_params = {"demo": "1"}
    websocket.cookies = {"token": "normal", "demo_token": "guest"}
    read = {"type": "table_list_request"}
    write = {"type": "sprite_move", "data": {"sprite_id": "x"}}
    batch = {"type": "batch_request", "data": {"messages": [read, write]}}
    websocket.receive_text = AsyncMock(side_effect=[
        json.dumps(item) for item in [write, batch, {"type": "chat_message"}, read]
    ] + [WebSocketDisconnect()])
    websocket.close = AsyncMock()
    manager = MagicMock()
    manager.connect = AsyncMock(return_value="guest-client")
    manager.handle_message = AsyncMock()
    manager.send_personal_message = AsyncMock()
    manager.disconnect = AsyncMock()
    monkeypatch.setattr(game_ws, "_origin_is_allowed", lambda _: True)

    def resolve(token, code, demo):
        assert (token, code, demo) == ("guest", "DEMO2026", True)
        return game_ws.WebSocketSessionContext(2, "guest", "spectator", time.time() + 60), None

    monkeypatch.setattr(game_ws, "_load_websocket_session_context", resolve)
    await game_ws.websocket_game_endpoint(websocket, "DEMO2026", manager)
    assert manager.handle_message.await_count == 1
    assert manager.handle_message.call_args.args[1]["type"] == "table_list_request"
    assert manager.send_personal_message.await_count == 3
    manager.disconnect.assert_awaited_once()


@pytest.mark.asyncio
async def test_idle_guest_socket_closes_at_expiry(monkeypatch):
    websocket = MagicMock()
    websocket.headers = {}
    websocket.query_params = {"demo": "1"}
    websocket.cookies = {"demo_token": "guest"}
    websocket.receive_text = AsyncMock(side_effect=asyncio.Event().wait)
    websocket.close = AsyncMock()
    manager = MagicMock()
    manager.connect = AsyncMock(return_value="guest-client")
    manager.disconnect = AsyncMock()
    manager.handle_message = AsyncMock()
    monkeypatch.setattr(game_ws, "_origin_is_allowed", lambda _: True)
    monkeypatch.setattr(game_ws, "_load_websocket_session_context", lambda *_: (
        game_ws.WebSocketSessionContext(2, "guest", "spectator", time.time() + 0.03), None,
    ))
    await asyncio.wait_for(game_ws.websocket_game_endpoint(websocket, "DEMO2026", manager), 2)
    websocket.close.assert_awaited_once_with(code=1008, reason="Demo expired")
    manager.disconnect.assert_awaited_once()
    manager.handle_message.assert_not_awaited()
