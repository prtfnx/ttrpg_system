import pytest
from database import models


@pytest.fixture
def preference_member(test_db, test_game_session, test_user):
    return test_db.query(models.GamePlayer).filter_by(session_id=test_game_session.id, user_id=test_user.id).one()


def test_selection_preference_round_trip(auth_client, test_db, test_game_session, preference_member):
    url = f"/game/api/sessions/{test_game_session.session_code}/selection-preference"
    assert auth_client.get(url).json() == {"selection_mode": "separate"}
    response = auth_client.put(url, json={"selection_mode": "combined"})
    assert response.status_code == 200
    test_db.expire_all()
    assert auth_client.get(url).json() == {"selection_mode": "combined"}
    assert test_db.get(models.GamePlayer, preference_member.id).selection_mode == "combined"


@pytest.mark.parametrize("body", [{"selection_mode": "all"}, {"selection_mode": True},
                                   {"selection_mode": "combined", "user_id": 99}])
def test_selection_preference_rejects_invalid_input(auth_client, test_game_session, preference_member, body):
    url = f"/game/api/sessions/{test_game_session.session_code}/selection-preference"
    assert auth_client.put(url, json=body).status_code == 422
    assert auth_client.get(url).json() == {"selection_mode": "separate"}


def test_selection_preference_is_scoped_to_membership(auth_client, test_db, test_user, preference_member):
    other = models.GameSession(name="Other", session_code="PREFOTHER", owner_id=test_user.id)
    test_db.add(other)
    test_db.commit()
    url = "/game/api/sessions/PREFOTHER/selection-preference"
    assert auth_client.get(url, headers={"Accept": "application/json"}).status_code == 403
    assert auth_client.put(url, json={"selection_mode": "combined"}, headers={"Accept": "application/json"}).status_code == 403


def test_other_session_retains_its_default(auth_client, test_db, test_game_session, test_user, preference_member):
    first = f"/game/api/sessions/{test_game_session.session_code}/selection-preference"
    other = models.GameSession(name="Other", session_code="PREFOTHER", owner_id=test_user.id)
    test_db.add(other)
    test_db.flush()
    test_db.add(models.GamePlayer(session_id=other.id, user_id=test_user.id, role="owner"))
    test_db.commit()
    assert auth_client.put(first, json={"selection_mode": "combined"}).status_code == 200
    assert auth_client.get("/game/api/sessions/PREFOTHER/selection-preference").json() == {"selection_mode": "separate"}
