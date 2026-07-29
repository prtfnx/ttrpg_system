from types import SimpleNamespace

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

    assert game_ws.get_user_from_token(token, test_db).id == test_user.id


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
