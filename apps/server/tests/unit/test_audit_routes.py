from database import models
from main import app
from routers.audit import get_current_active_user


def test_owner_can_read_paginated_session_audit_and_read_is_audited(
    auth_client, test_db, test_game_session, audit_log_factory
):
    audit_log_factory(action="login", event_type="LOGIN", outcome="success")
    audit_log_factory(action="role_changed", event_type="ROLE_CHANGED", outcome="success")

    response = auth_client.get(
        f"/api/sessions/{test_game_session.session_code}/audit-logs?limit=1&action=login"
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["action"] == "login"
    assert body["has_more"] is False
    assert body["next_cursor"] is None
    assert "event_type" not in body["items"][0]
    read_event = test_db.query(models.AuditLog).filter_by(action="audit.read").one()
    assert read_event.user_id == test_game_session.owner_id
    assert read_event.details_json is not None


def test_player_cannot_read_session_audit(client, test_db, test_game_session, player_user):
    test_db.add(models.GamePlayer(
        user_id=player_user.id, session_id=test_game_session.id, role="player"
    ))
    test_db.commit()

    async def override_current_user():
        return player_user

    app.dependency_overrides[get_current_active_user] = override_current_user
    try:
        response = client.get(
            f"/api/sessions/{test_game_session.session_code}/audit-logs",
            headers={"accept": "application/json"},
        )
    finally:
        app.dependency_overrides.pop(get_current_active_user, None)

    assert response.status_code == 403
    denied = test_db.query(models.AuditLog).filter_by(action="audit.read", outcome="denied").one()
    assert denied.user_id == player_user.id


def test_cursor_pagination_is_stable(auth_client, test_game_session, audit_log_factory):
    first = audit_log_factory(action="one", event_type="ONE")
    second = audit_log_factory(action="two", event_type="TWO")

    page = auth_client.get(
        f"/api/sessions/{test_game_session.session_code}/audit-logs?limit=1"
    ).json()

    assert page["items"][0]["event_id"] == second.event_id
    assert page["has_more"] is True
    next_page = auth_client.get(
        f"/api/sessions/{test_game_session.session_code}/audit-logs"
        f"?limit=1&cursor={page['next_cursor']}"
    ).json()
    assert next_page["items"][0]["event_id"] == first.event_id
