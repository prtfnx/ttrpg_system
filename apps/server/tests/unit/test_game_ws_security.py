from types import SimpleNamespace

from api import game_ws


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
