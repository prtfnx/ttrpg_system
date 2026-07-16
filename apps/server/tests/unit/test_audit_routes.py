from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from database import models
from routers.audit import read_session_audit_logs


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
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["action"] == "login"
    assert "event_type" not in body["items"][0]
    read_event = test_db.query(models.AuditLog).filter_by(action="audit.read").one()
    assert read_event.user_id == test_game_session.owner_id
    assert read_event.details_json is not None


def test_player_cannot_read_session_audit(auth_client, test_db, test_game_session, player_user):
    test_db.add(models.GamePlayer(
        user_id=player_user.id, session_id=test_game_session.id, role="player"
    ))
    test_db.commit()

    with pytest.raises(HTTPException) as error:
        read_session_audit_logs(
            test_game_session.session_code,
            Mock(headers={}, client=None),
            player_user,
            test_db,
            None,
            None,
            50,
            0,
        )

    assert error.value.status_code == 403
    denied = test_db.query(models.AuditLog).filter_by(action="audit.read", outcome="denied").one()
    assert denied.user_id == player_user.id
