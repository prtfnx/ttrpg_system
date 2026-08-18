import asyncio
import inspect
import threading
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import main
import pytest
from database.database import get_db
from routers import demo, game, invitations, telemetry, users

SYNC_DATABASE_HANDLERS = (
    users.get_current_user,
    users.get_current_user_optional,
    users.get_current_active_user,
    users.users_me,
    users.login_for_access_token,
    users.read_own_items,
    users.login,
    users.verify_email,
    users.dashboard,
    users.forgot_password_submit,
    users.reset_password_submit,
    users.settings_page,
    users.settings_profile,
    users.settings_password,
    users.settings_email,
    users.settings_delete,
    game.game_lobby,
    game.create_game_session,
    game.join_game_session,
    game.game_session_page,
    game.session_settings,
    game.update_session_settings,
    game.delete_session,
    game.game_session_admin,
    game.get_session_players,
    game.get_session_membership,
    game.change_player_role,
    game.kick_player,
    game.get_user_sessions,
    invitations.create_invitation,
    invitations.list_session_invitations,
    invitations.revoke_invitation,
    invitations.get_invitation,
    invitations.accept_invitation,
    demo.start_demo,
    telemetry.browser_error,
)


@pytest.mark.unit
@pytest.mark.parametrize(
    "handler",
    SYNC_DATABASE_HANDLERS,
    ids=lambda handler: f"{handler.__module__}.{handler.__name__}",
)
def test_blocking_http_handlers_use_fastapi_threadpool(handler):
    assert not inspect.iscoroutinefunction(handler)


@pytest.mark.unit
async def test_slow_http_database_call_does_not_block_event_loop(monkeypatch):
    started = threading.Event()
    release = threading.Event()

    def slow_session_lookup(*_args):
        started.set()
        assert release.wait(timeout=2)
        return []

    monkeypatch.setattr(game.crud, "get_user_game_sessions", slow_session_lookup)
    main.app.dependency_overrides[users.get_current_user] = lambda: SimpleNamespace(
        id=7,
        username="thread-test",
        disabled=False,
    )
    main.app.dependency_overrides[get_db] = lambda: MagicMock()
    safety_release = threading.Timer(1, release.set)
    safety_release.start()

    try:
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            request = asyncio.create_task(client.get("/game/api/sessions"))
            deadline = asyncio.get_running_loop().time() + 0.5
            while not started.is_set() and asyncio.get_running_loop().time() < deadline:
                await asyncio.sleep(0.005)

            assert started.is_set()
            assert not release.is_set(), "database call ran on the event-loop thread"

            heartbeat = asyncio.Event()
            asyncio.get_running_loop().call_soon(heartbeat.set)
            await asyncio.wait_for(heartbeat.wait(), timeout=0.1)

            release.set()
            response = await request
    finally:
        release.set()
        safety_release.cancel()
        main.app.dependency_overrides.pop(users.get_current_user, None)
        main.app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 200
    assert response.json() == []
