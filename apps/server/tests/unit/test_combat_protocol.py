"""Unit tests for _CombatMixin protocol handlers.

CombatEngine is patched for all tests — we verify permission gates,
validation, and correct MessageType in responses.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from core_table.protocol import Message, MessageType
from core_table.session_rules import SessionRules
from service.attack_resolver import AttackResult
from service.combat_engine import CombatEngine
from service.combat_persistence_service import PersistedCombatCommand
from service.protocol.combat import _CombatMixin

# ---------------------------------------------------------------------------
# Shared stub
# ---------------------------------------------------------------------------

class _ProtoStub(_CombatMixin):
    def __init__(self, role="owner", client_info=None):
        self._role = role
        self.client_info = client_info or {
            "c1": {"user_id": 1, "role": role},
        }
        self.session_manager = SimpleNamespace(client_info=self.client_info)
        self.table_manager = MagicMock()
        self.table_manager.tables_id = {}
        self.table_manager.tables = {}
        self._rules_cache = {"TST": (SessionRules.defaults("TST"), "free_roam")}
        self.combat_persistence_service = None
        self.broadcasts = []
        self.sent = []

    def _get_client_role(self, client_id):
        return self.client_info.get(client_id, {}).get("role", self._role)

    def _get_session_code(self, msg=None):
        return "TST"

    def _get_session_id(self, msg):
        return 1

    def _get_user_id(self, msg, client_id=None):
        return self.client_info.get(client_id or "c1", {}).get("user_id", 1)

    def _get_client_info(self, client_id):
        return self.client_info.get(client_id, {})

    async def broadcast_to_session(self, message, client_id):
        self.broadcasts.append((message, client_id))

    async def broadcast_filtered(self, message, layer, client_id):
        pass

    async def send_to_client(self, message, client_id):
        self.sent.append((message, client_id))

    async def _broadcast_error(self, client_id, error_message):
        pass


def _combat_state():
    state = MagicMock()
    state.to_dict.return_value = {"active": True, "combatants": []}
    state.to_dict_for_player.return_value = {"active": True, "combatants": []}
    state.combatants = []
    state.settings.show_npc_hp_to_players = False
    return state


def _mock_persistence(version=1):
    persistence = MagicMock()
    persistence.requester_key.return_value = "user:1"

    def persist_accepted(**kwargs):
        result = dict(kwargs["result_payload"])
        result["state_version"] = version
        if isinstance(result.get("combat"), dict):
            result["combat"]["state_version"] = version
        return PersistedCombatCommand(result=result, state_version=version)

    persistence.persist_accepted.side_effect = persist_accepted
    return persistence


@pytest.mark.unit
class TestCombatStateBroadcast:
    async def test_builds_a_role_filtered_state_for_each_recipient(self):
        state = MagicMock()
        state.settings.show_npc_hp_to_players = "descriptor"
        state.to_dict.return_value = {
            "active": True,
            "combatants": [
                {
                    "combatant_id": "hidden-npc",
                    "name": "Hidden Stalker",
                    "hp": 30,
                    "is_npc": True,
                    "is_hidden": True,
                    "ai_enabled": True,
                },
                {
                    "combatant_id": "visible-npc",
                    "name": "Guard",
                    "hp": 4,
                    "is_npc": True,
                    "ai_enabled": True,
                },
            ],
        }
        state.to_dict_for_player.return_value = {
            "active": True,
            "combatants": [
                {
                    "combatant_id": "hidden-npc",
                    "name": "Hidden Stalker",
                    "is_npc": True,
                    "is_hidden": True,
                },
                {
                    "combatant_id": "visible-npc",
                    "name": "Guard",
                    "is_npc": True,
                    "hp_descriptor": "bloodied",
                },
            ],
        }
        proto = _ProtoStub(client_info={
            "dm-client": {"user_id": 1, "role": "owner"},
            "player-client": {"user_id": 7, "role": "player"},
        })

        response = await proto._broadcast_combat_state(
            state,
            MessageType.COMBAT_STATE,
            "dm-client",
        )

        assert response.data["combat"]["combatants"][0]["hp"] == 30
        player_message, recipient_id = proto.sent[0]
        player_combatants = player_message.data["combat"]["combatants"]
        assert recipient_id == "player-client"
        assert [combatant["combatant_id"] for combatant in player_combatants] == ["visible-npc"]
        assert player_combatants[0]["hp_descriptor"] == "bloodied"
        assert "ai_enabled" not in player_combatants[0]

    async def test_initiative_broadcast_filters_embedded_combat_state(self):
        state = MagicMock()
        state.settings.show_npc_hp_to_players = "none"
        state.settings.show_npc_ac_to_players = False
        state.combatants = [
            SimpleNamespace(combatant_id="hidden-npc", name="Hidden", initiative=19),
            SimpleNamespace(combatant_id="pc-1", name="Ada", initiative=12),
        ]
        state.to_dict.return_value = {
            "combatants": [
                {
                    "combatant_id": "hidden-npc",
                    "name": "Hidden",
                    "hp": 20,
                    "is_npc": True,
                    "is_hidden": True,
                },
                {
                    "combatant_id": "pc-1",
                    "name": "Ada",
                    "hp": 20,
                    "is_npc": False,
                },
            ],
            "action_log": [],
        }
        state.to_dict_for_player.return_value = state.to_dict.return_value
        proto = _ProtoStub(client_info={
            "dm-client": {"user_id": 1, "role": "owner"},
            "player-client": {"user_id": 7, "role": "player"},
        })

        response = await proto._broadcast_combat_state(
            state,
            MessageType.ACTION_RESULT,
            "dm-client",
            {
                "accepted": True,
                "sequence_id": 19,
                "applied": [{
                    "actor_id": "pc-1",
                    "action_type": "roll_initiative",
                    "result": {
                        "combatant_id": "pc-1",
                        "value": 12,
                        "order": [
                            {"combatant_id": "hidden-npc", "name": "Hidden", "initiative": 19},
                            {"combatant_id": "pc-1", "name": "Ada", "initiative": 12},
                        ],
                    },
                }],
            },
        )

        assert response.data["applied"][0]["actor_id"] == "pc-1"
        player_message, recipient_id = proto.sent[0]
        assert recipient_id == "player-client"
        assert [
            item["combatant_id"]
            for item in player_message.data["applied"][0]["result"]["order"]
        ] == ["pc-1"]
        assert [
            item["combatant_id"] for item in player_message.data["combat"]["combatants"]
        ] == ["pc-1"]


# ---------------------------------------------------------------------------
# handle_combat_state_request
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCombatStateRequest:
    @patch("service.combat_engine.CombatEngine")
    async def test_no_combat_returns_null_combat(self, mock_engine):
        mock_engine.get_state.return_value = None
        mock_engine.restore.return_value = None
        proto = _ProtoStub(role="player")
        resp = await proto.handle_combat_state_request(Message(MessageType.COMBAT_STATE_REQUEST, {}), "c1")
        assert resp.type == MessageType.COMBAT_STATE
        assert resp.data["combat"] is None

    @patch("service.combat_engine.CombatEngine")
    async def test_dm_gets_full_state(self, mock_engine):
        mock_engine.get_state.return_value = _combat_state()
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_combat_state_request(Message(MessageType.COMBAT_STATE_REQUEST, {}), "c1")
        assert resp.type == MessageType.COMBAT_STATE

    @patch("service.combat_engine.CombatEngine")
    async def test_player_gets_player_state(self, mock_engine):
        mock_engine.get_state.return_value = _combat_state()
        proto = _ProtoStub(role="player")
        resp = await proto.handle_combat_state_request(Message(MessageType.COMBAT_STATE_REQUEST, {}), "c1")
        assert resp.type == MessageType.COMBAT_STATE


@pytest.mark.unit
class TestCombatCommand:
    async def test_invalid_payload_returns_rejected(self):
        proto = _ProtoStub(role="player")

        resp = await proto.handle_combat_command(
            Message(MessageType.COMBAT_COMMAND, {"sequence_id": 10, "commands": []}), "c1"
        )

        assert resp.type == MessageType.ACTION_REJECTED
        assert resp.data["accepted"] is False
        assert resp.data["sequence_id"] == 10

    async def test_attack_command_applies_and_broadcasts_result(self):
        CombatEngine._active.pop("TST", None)
        state = CombatEngine.start_combat(
            "TST",
            "t1",
            [],
            combatants=[
                {
                    "entity_id": "sprite-a",
                    "name": "Ada",
                    "hp": 20,
                    "max_hp": 20,
                    "armor_class": 12,
                    "movement_speed": 30,
                    "controlled_by": ["1"],
                },
                {
                    "entity_id": "sprite-b",
                    "name": "Borin",
                    "hp": 20,
                    "max_hp": 20,
                    "armor_class": 10,
                    "movement_speed": 30,
                    "controlled_by": ["2"],
                },
            ],
        )
        state.current_turn_index = 0
        attacker = state.combatants[0]
        target = state.combatants[1]
        proto = _ProtoStub(client_info={
            "c1": {"user_id": 1, "role": "player"},
            "c2": {"user_id": 2, "role": "player"},
        })

        with patch.object(CombatEngine, "apply_damage", return_value={"new_hp": 15}):
            with patch("service.attack_resolver.AttackResolver") as resolver:
                resolver.return_value.resolve_attack.return_value = AttackResult(hit=True, damage_dealt=5)
                resp = await proto.handle_combat_command(
                    Message(MessageType.COMBAT_COMMAND, {
                        "sequence_id": 11,
                        "commands": [{
                            "type": "attack",
                            "actor_id": attacker.combatant_id,
                            "target_id": target.combatant_id,
                            "damage_formula": "1d6",
                        }],
                    }),
                    "c1",
                )

        assert resp.type == MessageType.ACTION_RESULT
        assert resp.data["accepted"] is True
        assert resp.data["sequence_id"] == 11
        assert resp.data["applied"][0]["action_type"] == "attack"
        assert proto.sent[0][0].type == MessageType.ACTION_RESULT
        assert proto.sent[0][1] == "c2"
        assert CombatEngine.get_state("TST").combatants[0].has_action is False

    async def test_duplicate_command_returns_only_to_requesting_client(self):
        CombatEngine._active.pop("TST", None)
        state = CombatEngine.start_combat(
            "TST",
            "t1",
            [],
            combatants=[{
                "entity_id": "sprite-a",
                "name": "Ada",
                "hp": 20,
                "max_hp": 20,
                "controlled_by": ["1"],
            }],
        )
        actor = state.combatants[0]
        persistence = MagicMock()
        persistence.requester_key.return_value = "user:1"
        persistence.find_result.return_value = PersistedCombatCommand(
            result={
                "accepted": True,
                "sequence_id": 17,
                "applied": [{"action_type": "dash", "actor_id": actor.combatant_id}],
                "combat": state.to_dict(),
                "state_version": 4,
            },
            state_version=4,
            duplicate=True,
        )
        proto = _ProtoStub(client_info={
            "c1": {"user_id": 1, "role": "player"},
            "c2": {"user_id": 2, "role": "player"},
        })
        proto.combat_persistence_service = persistence

        response = await proto.handle_combat_command(
            Message(MessageType.COMBAT_COMMAND, {
                "sequence_id": 17,
                "commands": [{
                    "type": "dash",
                    "actor_id": actor.combatant_id,
                }],
            }),
            "c1",
        )

        assert response.type == MessageType.ACTION_RESULT
        assert response.data["duplicate"] is True
        assert response.data["state_version"] == 4
        assert proto.sent == []
        assert actor.has_action is True

    async def test_move_command_spends_movement_and_uses_actions_core(self):
        CombatEngine._active.pop("TST", None)
        state = CombatEngine.start_combat(
            "TST",
            "t1",
            [],
            combatants=[{
                "entity_id": "sprite-a",
                "name": "Ada",
                "hp": 20,
                "max_hp": 20,
                "armor_class": 12,
                "movement_speed": 30,
                "controlled_by": ["1"],
            }],
        )
        state.current_turn_index = 0
        actor = state.combatants[0]
        proto = _ProtoStub(role="player")
        proto.actions = MagicMock()
        proto.actions.move_sprite = AsyncMock(return_value=MagicMock(success=True, message="ok"))
        table = MagicMock()
        table.width = 10
        table.height = 10
        table.grid_cell_px = 64
        table.walls = {}
        table.entities = {}
        table.difficult_terrain_cells = set()
        proto.table_manager.tables_id = {"t1": table}

        resp = await proto.handle_combat_command(
            Message(MessageType.COMBAT_COMMAND, {
                "sequence_id": 13,
                "commands": [{
                    "type": "move",
                    "actor_id": actor.combatant_id,
                    "table_id": "t1",
                    "from_x": 32,
                    "from_y": 32,
                    "target_x": 96,
                    "target_y": 32,
                    "cost_ft": 30,
                }],
            }),
            "c1",
        )

        assert resp.type == MessageType.ACTION_RESULT
        assert CombatEngine.get_state("TST").combatants[0].movement_remaining == 25
        assert resp.data["applied"][0]["result"]["cost_ft"] == 5
        assert resp.data["applied"][0]["result"]["declared_cost_ft"] == 30
        proto.actions.move_sprite.assert_awaited_once()

# ---------------------------------------------------------------------------
# handle_ai_action
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestAiAction:
    @patch("service.npc_ai.NPCAIEngine")
    @patch("service.combat_engine.CombatEngine")
    async def test_ai_suggestion_is_returned_only_to_requesting_dm(
        self,
        mock_engine,
        mock_ai_engine,
    ):
        combatant = SimpleNamespace(
            combatant_id="npc-1",
            ai_behavior="tactical",
        )
        state = _combat_state()
        state.combatants = [combatant]
        mock_engine.get_state.return_value = state
        mock_ai_engine.decide_action.return_value = SimpleNamespace(
            action_type="attack",
            target_id="pc-1",
            move_to=None,
            reasoning="Lowest armor class",
        )
        proto = _ProtoStub(client_info={
            "dm-client": {"user_id": 1, "role": "owner"},
            "player-client": {"user_id": 7, "role": "player"},
        })

        response = await proto.handle_ai_action(
            Message(MessageType.AI_ACTION, {"combatant_id": "npc-1"}),
            "dm-client",
        )

        assert response.type == MessageType.AI_SUGGESTION
        assert response.data["decision"]["reasoning"] == "Lowest armor class"
        assert proto.sent == []
        assert proto.broadcasts == []


# ---------------------------------------------------------------------------
# handle_dm_set_terrain
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestDmSetTerrain:
    async def test_player_blocked(self):
        proto = _ProtoStub(role="player")
        proto.table_manager = MagicMock()
        resp = await proto.handle_dm_set_terrain(
            Message(MessageType.DM_SET_TERRAIN, {"table_id": "t1", "cells": [[1, 1]]}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_table_not_found_returns_error(self):
        proto = _ProtoStub(role="owner")
        proto.table_manager = MagicMock()
        proto.table_manager.tables_id = {}
        proto.table_manager.tables = {}
        resp = await proto.handle_dm_set_terrain(
            Message(
                MessageType.DM_SET_TERRAIN,
                {"table_id": "missing", "cells": [[1, 1]]},
            ),
            "c1",
        )
        assert resp.type == MessageType.ERROR

    async def test_add_mode_populates_terrain(self):
        proto = _ProtoStub(role="owner")
        table = MagicMock()
        table.difficult_terrain_cells = set()
        proto.table_manager = MagicMock()
        proto.table_manager.tables_id = {"t1": table}
        proto.table_manager.save_table.return_value = True
        resp = await proto.handle_dm_set_terrain(
            Message(
                MessageType.DM_SET_TERRAIN,
                {"table_id": "t1", "cells": [[2, 3]], "mode": "add"},
            ),
            "c1",
        )
        assert resp.type == MessageType.DM_SET_TERRAIN
        assert (2, 3) in table.difficult_terrain_cells
        proto.table_manager.save_table.assert_called_once_with("t1", session_id=1)

    async def test_clear_mode_empties_terrain(self):
        proto = _ProtoStub(role="owner")
        table = MagicMock()
        table.difficult_terrain_cells = {(1, 1), (2, 2)}
        proto.table_manager = MagicMock()
        proto.table_manager.tables_id = {"t1": table}
        resp = await proto.handle_dm_set_terrain(
            Message(
                MessageType.DM_SET_TERRAIN,
                {"table_id": "t1", "cells": [], "mode": "clear"},
            ),
            "c1",
        )
        assert resp.type == MessageType.DM_SET_TERRAIN
        assert len(table.difficult_terrain_cells) == 0

    async def test_persistence_failure_rolls_back_terrain(self):
        proto = _ProtoStub(role="owner")
        table = MagicMock()
        table.difficult_terrain_cells = {(1, 1)}
        proto.table_manager = MagicMock()
        proto.table_manager.tables_id = {"t1": table}
        proto.table_manager.save_table.return_value = False
        resp = await proto.handle_dm_set_terrain(
            Message(
                MessageType.DM_SET_TERRAIN,
                {"table_id": "t1", "cells": [[2, 3]], "mode": "add"},
            ),
            "c1",
        )
        assert resp.type == MessageType.ERROR
        assert table.difficult_terrain_cells == {(1, 1)}


# ---------------------------------------------------------------------------
# handle_cover_zone_add / remove / sync
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCoverZoneHandlers:
    async def test_add_player_blocked(self):
        proto = _ProtoStub(role="player")
        proto.table_manager = MagicMock()
        resp = await proto.handle_cover_zone_add(
            Message(MessageType.COVER_ZONE_ADD, {"table_id": "t1", "zone": {}}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_add_table_not_found_returns_error(self):
        proto = _ProtoStub(role="owner")
        proto.table_manager = MagicMock()
        proto.table_manager.tables_id = {}
        proto.table_manager.tables = {}
        resp = await proto.handle_cover_zone_add(
            Message(MessageType.COVER_ZONE_ADD, {"table_id": "t1", "zone": {"zone_id": "z1"}}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_remove_player_blocked(self):
        proto = _ProtoStub(role="player")
        proto.table_manager = MagicMock()
        resp = await proto.handle_cover_zone_remove(
            Message(MessageType.COVER_ZONE_REMOVE, {"table_id": "t1", "zone_id": "z1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_add_persists_table_state(self):
        proto = _ProtoStub(role="owner")
        table = MagicMock()
        table.cover_zones = []
        proto.table_manager = MagicMock()
        proto.table_manager.tables_id = {"t1": table}
        proto.table_manager.save_table.return_value = True
        resp = await proto.handle_cover_zone_add(
            Message(MessageType.COVER_ZONE_ADD, {
                "table_id": "t1",
                "zone": {
                    "zone_id": "z1",
                    "shape_type": "rect",
                    "coords": [0, 0, 4, 4],
                    "cover_tier": "half",
                },
            }),
            "c1",
        )
        assert resp.type == MessageType.COVER_ZONE_ADD
        assert table.cover_zones[0].zone_id == "z1"
        proto.table_manager.save_table.assert_called_once_with("t1", session_id=1)

    async def test_add_persistence_failure_rolls_back_zone(self):
        proto = _ProtoStub(role="owner")
        existing = MagicMock()
        existing.zone_id = "existing"
        table = MagicMock()
        table.cover_zones = [existing]
        proto.table_manager = MagicMock()
        proto.table_manager.tables_id = {"t1": table}
        proto.table_manager.save_table.return_value = False
        resp = await proto.handle_cover_zone_add(
            Message(MessageType.COVER_ZONE_ADD, {
                "table_id": "t1",
                "zone": {
                    "zone_id": "z1",
                    "shape_type": "rect",
                    "coords": [0, 0, 4, 4],
                },
            }),
            "c1",
        )
        assert resp.type == MessageType.ERROR
        assert table.cover_zones == [existing]

    async def test_remove_persists_table_state(self):
        proto = _ProtoStub(role="owner")
        zone = MagicMock()
        zone.zone_id = "z1"
        table = MagicMock()
        table.cover_zones = [zone]
        proto.table_manager = MagicMock()
        proto.table_manager.tables_id = {"t1": table}
        proto.table_manager.save_table.return_value = True
        resp = await proto.handle_cover_zone_remove(
            Message(MessageType.COVER_ZONE_REMOVE, {"table_id": "t1", "zone_id": "z1"}), "c1"
        )
        assert resp.type == MessageType.COVER_ZONE_REMOVE
        assert table.cover_zones == []
        proto.table_manager.save_table.assert_called_once_with("t1", session_id=1)

    async def test_sync_returns_zones(self):
        proto = _ProtoStub(role="player")
        table = MagicMock()
        zone = MagicMock()
        zone.to_dict.return_value = {"zone_id": "z1"}
        table.cover_zones = [zone]
        proto.table_manager = MagicMock()
        proto.table_manager.tables_id = {"t1": table}
        resp = await proto.handle_cover_zones_sync(
            Message(MessageType.COVER_ZONES_SYNC, {"table_id": "t1"}), "c1"
        )
        assert resp.type == MessageType.COVER_ZONES_SYNC
        assert len(resp.data["zones"]) == 1

    async def test_sync_no_table_returns_empty_list(self):
        proto = _ProtoStub(role="player")
        proto.table_manager = MagicMock()
        proto.table_manager.tables_id = {}
        proto.table_manager.tables = {}
        resp = await proto.handle_cover_zones_sync(
            Message(MessageType.COVER_ZONES_SYNC, {"table_id": "missing"}), "c1"
        )
        assert resp.type == MessageType.COVER_ZONES_SYNC
        assert resp.data["zones"] == []


