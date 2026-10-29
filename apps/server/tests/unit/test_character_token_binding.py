"""Source permission and canonical values are checked in the caller's transaction."""
import json
from copy import deepcopy

import pytest
from database.models import CharacterPermission, SessionCharacter
from service.character_token_binding import CharacterBindingError, prepare_character_bindings


@pytest.fixture
def binding(test_db, test_game_session):
    source = SessionCharacter(character_id="binding-source", session_id=test_game_session.id,
        owner_user_id=test_game_session.owner_id, character_name="Hero", version=3,
        character_data=json.dumps({"character_id": "binding-source", "name": "Hero",
            "data": {"stats": {"hp": 0, "maxHp": 20, "ac": None}}}))
    test_db.add(source)
    test_db.commit()
    change = {"kind": "sprite", "id": "token", "before": {"character_id": None},
              "after": {"character_id": source.character_id, "hp": 99, "max_hp": 99, "ac": 99}}
    return source, change, test_game_session


def test_binding_inherits_source_without_changing_its_version_or_stats(test_db, binding):
    source, change, game = binding
    result = prepare_character_bindings(test_db, [change], game.id, game.owner_id)
    assert result == {"token": {"hp": 0, "max_hp": 20, "ac": None}}
    assert change["after"] == {"character_id": source.character_id, **result["token"]}
    assert source.version == 3 and not test_db.dirty


@pytest.mark.parametrize("unavailable", ["wrong_session", "archived", "denied"])
def test_binding_cannot_use_an_inaccessible_source(test_db, binding, unavailable):
    source, change, game = binding
    if unavailable == "archived":
        from utils.time import utc_now
        source.archived_at = utc_now()
        test_db.commit()
    with pytest.raises(CharacterBindingError, match="not found or edit permission denied"):
        prepare_character_bindings(test_db, [change], -1 if unavailable == "wrong_session" else game.id,
                                   999 if unavailable == "denied" else game.owner_id)
    assert change["after"]["hp"] == 99


def test_shared_edit_permission_can_bind_but_view_permission_cannot(test_db, binding, player_user):
    source, change, game = binding
    permission = CharacterPermission(character_id=source.character_id, session_id=game.id, user_id=player_user.id,
        granted_by=game.owner_id, can_view=True, can_edit=False)
    test_db.add(permission)
    test_db.commit()
    with pytest.raises(CharacterBindingError):
        prepare_character_bindings(test_db, [change], game.id, player_user.id)
    permission.can_edit = True
    test_db.commit()
    assert prepare_character_bindings(test_db, [change], game.id, player_user.id)["token"]["hp"] == 0


def test_existing_link_rejects_stat_edits_but_can_detach_and_set_independent_stats(test_db, binding):
    source, change, game = binding
    change["before"] = {"character_id": source.character_id, "hp": 0, "max_hp": 20, "ac": None}
    with pytest.raises(CharacterBindingError, match="character_update"):
        prepare_character_bindings(test_db, [change], game.id, game.owner_id)
    change["after"]["character_id"] = None
    assert prepare_character_bindings(test_db, [change], game.id, game.owner_id) == {}
    assert change["after"]["hp"] == 99


def test_existing_link_can_move_without_granting_character_edit_permission(test_db, binding):
    source, change, game = binding
    change["before"] = {"character_id": source.character_id, "hp": 0, "max_hp": 20, "ac": None}
    change["after"] = {**deepcopy(change["before"]), "position": [200, 200]}
    assert prepare_character_bindings(test_db, [change], game.id, 999) == {}


@pytest.mark.parametrize("location", ["root", "data"])
def test_unmigrated_legacy_stats_cannot_be_silently_cleared_on_binding(test_db, binding, location):
    source, change, game = binding
    document = {"character_id": source.character_id, "name": "Hero", "data": {}}
    target = document if location == "root" else document["data"]
    target["hp"] = 20
    source.character_data = json.dumps(document)
    test_db.commit()
    with pytest.raises(CharacterBindingError, match="Migrate legacy character stats"):
        prepare_character_bindings(test_db, [change], game.id, game.owner_id)
    assert change["after"]["hp"] == 99 and source.version == 3
