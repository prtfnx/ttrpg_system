"""Exercise real session dispatch and SQLite persistence with recorded transports.

Authentication/HTTP, image storage and GPU rendering belong to other suites.
Only asset listing and attack dice are substituted; game mutations and journal
writes run through the production handlers and worker-owned database sessions.
"""
import json
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.dice import DiceEngine, DiceRollResult
from core_table.protocol import Message, MessageType
from database import database, models
from service import canvas_persistence_service, game_session_protocol
from service.choice_encounter_persistence_service import ChoiceEncounterPersistenceService
from service.combat_engine import CombatEngine
from service.combat_persistence_service import CombatPersistenceService
from service.protocol import assets, combat, session
from sqlalchemy.orm import sessionmaker


class RecordedSocket:
    def __init__(self):
        self.messages = []

    async def send_text(self, payload):
        self.messages.append(Message.from_json(payload))


async def request(service, socket, message_type, data, expected):
    message = Message(message_type, data)
    offset = len(socket.messages)
    await service.handle_protocol_message(socket, message.to_json())
    responses = [item for item in socket.messages[offset:] if item.causation_id == message.message_id]
    assert len(responses) == 1, socket.messages[offset:]
    response = responses[0]
    assert response.type == expected, response.data.get("reason") or response.data.get("error") or response.data
    return response.data


@pytest.mark.asyncio
async def test_dm_player_play_reconnect_and_reconstruct_saved_session(
    test_db, test_db_engine, game_session_with_players, test_user, player_user, monkeypatch,
):
    factory = sessionmaker(bind=test_db_engine, expire_on_commit=False)
    for module in (database, canvas_persistence_service, combat, session):
        monkeypatch.setattr(module, "SessionLocal", factory)
    asset_provider = SimpleNamespace(request_session_assets=AsyncMock(return_value=[]))
    monkeypatch.setattr(game_session_protocol, "get_server_asset_manager", lambda: asset_provider)
    monkeypatch.setattr(assets, "get_server_asset_manager", lambda: asset_provider)
    monkeypatch.setattr(DiceEngine, "roll", staticmethod(lambda formula: DiceRollResult(
        total=30 if "d20" in formula else 3, rolls=[10] if "d20" in formula else [3],
        modifier=20 if "d20" in formula else 0, formula=formula,
    )))
    code, session_id = game_session_with_players.session_code, game_session_with_players.id
    character_id = str(uuid.uuid4())
    test_db.add(models.SessionCharacter(
        character_id=character_id, session_id=session_id, owner_user_id=player_user.id,
        character_name="Hero", character_data=json.dumps({"stats": {"hp": 20, "maxHp": 20, "ac": 12}}),
    ))
    test_db.commit()
    CombatEngine._active.pop(code, None)
    services = []

    def new_service():
        test_db.expire_all()
        service = game_session_protocol.GameSessionProtocolService(code, test_db, session_id)
        service.server_protocol.combat_persistence_service = CombatPersistenceService(factory)
        service.server_protocol._encounter_store = lambda: ChoiceEncounterPersistenceService(factory)
        services.append(service)
        return service

    dm_info = {"user_id": test_user.id, "username": test_user.username, "role": "owner"}
    player_info = {"user_id": player_user.id, "username": player_user.username, "role": "player"}
    service = new_service()
    dm, player = RecordedSocket(), RecordedSocket()
    try:
        await service.add_client(dm, "dm", dm_info)
        await service.add_client(player, "player", player_info)
        assert dm.messages[-1].type == player.messages[-1].type == MessageType.WELCOME
        table_ids = []
        for name in ("Battlefield", "Second scene"):
            created = await request(service, dm, MessageType.NEW_TABLE_REQUEST,
                                    {"table_name": name, "width": 1000, "height": 1000}, MessageType.NEW_TABLE_RESPONSE)
            table_ids.append(created["table_data"]["table_id"])
            announcement = player.messages[-1]
            assert announcement.type == MessageType.TABLE_UPDATE
            assert set(announcement.data["table_data"]) == {"table_id", "table_name", "width", "height"}
        table_id = table_ids[0]
        for target in (table_ids[1], table_id):
            await request(service, player, MessageType.TABLE_ACTIVE_SET, {"table_id": target}, MessageType.SUCCESS)
            loaded = await request(service, player, MessageType.TABLE_REQUEST, {"table_id": target}, MessageType.TABLE_RESPONSE)
            assert loaded["table_data"]["table_id"] == target
        hero = await request(service, player, MessageType.SPRITE_CREATE, {
            "table_id": table_id, "sprite_data": {"name": "Hero", "x": 100, "y": 100, "layer": "tokens",
                "hp": 20, "max_hp": 20, "ac": 12, "character_id": character_id},
        }, MessageType.SPRITE_RESPONSE)
        hero_id = hero["sprite_id"]
        enemy = await request(service, dm, MessageType.SPRITE_CREATE, {
            "table_id": table_id, "sprite_data": {"name": "Enemy", "x": 250, "y": 100, "layer": "tokens",
                "hp": 20, "max_hp": 20, "ac": 10},
        }, MessageType.SPRITE_RESPONSE)
        enemy_id = enemy["sprite_id"]
        await request(service, dm, MessageType.SPRITE_CREATE, {
            "table_id": table_id, "sprite_data": {"name": "Private note", "layer": "dungeon_master", "x": 0, "y": 0},
        }, MessageType.SPRITE_RESPONSE)
        loaded = await request(service, player, MessageType.TABLE_REQUEST, {"table_id": table_id}, MessageType.TABLE_RESPONSE)
        assert "dungeon_master" not in loaded["table_data"]["layers"]
        await request(service, player, MessageType.SPRITE_MOVE, {
            "table_id": table_id, "sprite_id": hero_id, "from": {"x": 100, "y": 100}, "to": {"x": 150, "y": 100},
        }, MessageType.SPRITE_RESPONSE)
        wall = await request(service, dm, MessageType.WALL_CREATE, {
            "table_id": table_id, "wall_data": {"x1": 800, "y1": 800, "x2": 900, "y2": 800},
        }, MessageType.WALL_DATA)
        await request(service, dm, MessageType.TABLE_SETTINGS_UPDATE, {
            "table_id": table_id, "dynamic_lighting_enabled": True, "grid_enabled": False,
            "grid_cell_px": 50, "cell_distance": 5, "ambient_light_level": 0.4,
        }, MessageType.TABLE_SETTINGS_CHANGED)

        async def command(socket, sequence, commands, expected=MessageType.ACTION_RESULT):
            return await request(service, socket, MessageType.COMBAT_COMMAND,
                                 {"sequence_id": sequence, "commands": commands}, expected)

        await command(dm, 1, [{"type": "set_terrain", "actor_id": "__dm__", "table_id": table_id, "cells": [[10, 10]]}])
        await command(dm, 2, [{"type": "start_combat", "actor_id": "__dm__", "table_id": table_id,
                              "entity_ids": [hero_id, enemy_id], "settings": {"auto_roll_npc_initiative": False}}])
        for sequence, actor, value in ((3, hero_id, 20), (4, enemy_id, 10)):
            await command(dm, sequence, [{"type": "set_initiative", "actor_id": actor, "initiative": value}])
        state = CombatEngine.get_state(code)
        actor = next(item for item in state.combatants if item.entity_id == hero_id)
        assert (actor.hp, actor.max_hp, actor.armor_class) == (20, 20, 12)
        assert state.get_current_combatant().entity_id == hero_id
        planned = [
            {"type": "move", "actor_id": hero_id, "table_id": table_id, "from_x": 150, "from_y": 100,
             "target_x": 200, "target_y": 100, "cost_ft": 5},
            {"type": "attack", "actor_id": hero_id, "target_id": enemy_id, "table_id": table_id,
             "attack_bonus": 20, "damage_formula": "1d4", "range_ft": 5},
        ]
        rejected = await command(player, 50, [planned[0], {
            **planned[1], "target_id": str(uuid.uuid4()),
        }], MessageType.ACTION_REJECTED)
        assert rejected["failed_index"] == 1
        assert service.table_manager.get_table(table_id).find_entity_by_sprite_id(hero_id).position == (150, 100)
        with factory() as db:
            assert db.query(models.Entity).filter_by(sprite_id=hero_id).one().position_x == 150
        result = await command(player, 5, planned)
        assert len(result["applied"]) == 2
        assert result["applied"][1]["result"]["damage_dealt"] == 3
        replay = await command(player, 5, planned)
        assert replay["duplicate"] is True
        assert replay["state_version"] == result["state_version"]
        await command(player, 6, [{"type": "end_turn", "actor_id": hero_id}])
        state_before_reload = CombatEngine.get_state(code).to_dict()
        await service.remove_client(player)
        player = RecordedSocket()
        await service.add_client(player, "reconnected", player_info)
        reconnected = await request(service, player, MessageType.COMBAT_STATE_REQUEST, {}, MessageType.COMBAT_STATE)
        assert reconnected["combat"]["state_version"] == state_before_reload["state_version"]
        await service.wait_for_mutations()
        assert await service.save_to_database_async()
        await service.stop_persistence()
        await service.remove_client(player)
        await service.remove_client(dm)
        CombatEngine._active.pop(code)

        service = new_service()
        dm, player = RecordedSocket(), RecordedSocket()
        await service.add_client(dm, "restored-dm", dm_info)
        await service.add_client(player, "restored-player", player_info)
        active = await request(service, player, MessageType.TABLE_ACTIVE_REQUEST, {}, MessageType.TABLE_ACTIVE_RESPONSE)
        assert active["table_id"] == table_id
        loaded = await request(service, player, MessageType.TABLE_REQUEST, {"table_id": table_id}, MessageType.TABLE_RESPONSE)
        snapshot = loaded["table_data"]
        assert snapshot["dynamic_lighting_enabled"] is True and snapshot["grid_enabled"] is False
        assert snapshot["ambient_light_level"] == 0.4
        assert loaded["walls"][0]["wall_id"] == wall["wall"]["wall_id"]
        assert "dungeon_master" not in snapshot["layers"]
        restored_table = service.table_manager.get_table(table_id)
        restored_hero = restored_table.find_entity_by_sprite_id(hero_id)
        assert restored_hero.position == (200, 100)
        assert (restored_hero.hp, restored_hero.max_hp, restored_hero.ac, restored_hero.character_id) == (20, 20, 12, character_id)
        assert restored_table.difficult_terrain_cells == {(10, 10)}
        restored = await request(service, dm, MessageType.COMBAT_STATE_REQUEST, {}, MessageType.COMBAT_STATE)
        assert restored["combat"]["state_version"] == state_before_reload["state_version"]
        assert restored["combat"]["current_turn_index"] == state_before_reload["current_turn_index"]
        restored_enemy = next(item for item in restored["combat"]["combatants"] if item["entity_id"] == enemy_id)
        assert restored_enemy["hp"] == 17
        await command(dm, 7, [{"type": "end_combat", "actor_id": "__dm__"}])
        assert CombatEngine.get_state(code) is None
    finally:
        for owner in services:
            await owner.stop_persistence()
        CombatEngine._active.pop(code, None)
