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
from service.combat_persistence_service import CombatJournalEntry, PersistedCombatCommand
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
# handle_combat_start
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCombatStart:
    async def test_player_cannot_start_combat(self):
        proto = _ProtoStub(role="player")
        msg = Message(MessageType.COMBAT_START, {"table_id": "t1"})
        resp = await proto.handle_combat_start(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "dm" in resp.data["error"].lower()

    async def test_missing_table_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.COMBAT_START, {})
        resp = await proto.handle_combat_start(msg, "c1")
        assert resp.type == MessageType.ERROR
        assert "table_id" in resp.data["error"]

    @patch("service.combat_engine.CombatEngine")
    async def test_successful_start_returns_combat_state(self, mock_engine):
        mock_engine.start_combat.return_value = _combat_state()
        proto = _ProtoStub(role="owner")
        msg = Message(MessageType.COMBAT_START, {"table_id": "t1"})
        resp = await proto.handle_combat_start(msg, "c1")
        assert resp.type == MessageType.COMBAT_STATE
        assert resp.data["combat"] == {"active": True, "combatants": []}

    @patch("service.combat_engine.CombatEngine")
    async def test_start_resolves_combatants_from_server_token(self, mock_engine):
        mock_engine.start_combat.return_value = _combat_state()
        token = SimpleNamespace(
            sprite_id="sprite-1",
            entity_id=1,
            name="Server Token",
            character_id="char-1",
            controlled_by=[7],
            hp=11,
            max_hp=13,
            ac=16,
        )
        proto = _ProtoStub(role="owner")
        proto.table_manager.tables_id = {
            "t1": SimpleNamespace(
                entities={1: token},
                find_entity_by_sprite_id=lambda sprite_id: token if sprite_id == "sprite-1" else None,
            )
        }
        msg = Message(MessageType.COMBAT_START, {
            "table_id": "t1",
            "entity_ids": ["sprite-1"],
            "combatants": [{
                "entity_id": "sprite-1",
                "name": "Spoofed",
                "hp": 999,
                "max_hp": 999,
                "armor_class": 99,
                "controlled_by": ["999"],
            }],
        })

        resp = await proto.handle_combat_start(msg, "c1")

        resolved = mock_engine.start_combat.call_args.kwargs["combatants"][0]
        assert resp.type == MessageType.COMBAT_STATE
        assert resolved["name"] == "Server Token"
        assert resolved["hp"] == 11
        assert resolved["max_hp"] == 13
        assert resolved["armor_class"] == 16
        assert resolved["controlled_by"] == ["7"]


# ---------------------------------------------------------------------------
# handle_combat_end
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCombatEnd:
    async def test_player_cannot_end_combat(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_combat_end(Message(MessageType.COMBAT_END, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_no_active_combat_returns_error(self, mock_engine):
        mock_engine.end_combat.return_value = None
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_combat_end(Message(MessageType.COMBAT_END, {}), "c1")
        assert resp.type == MessageType.ERROR
        assert "no active combat" in resp.data["error"].lower()

    @patch("service.combat_engine.CombatEngine")
    async def test_successful_end_returns_combat_state(self, mock_engine):
        mock_engine.end_combat.return_value = _combat_state()
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_combat_end(Message(MessageType.COMBAT_END, {}), "c1")
        assert resp.type == MessageType.COMBAT_STATE
        assert resp.data["ended"] is True


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


# ---------------------------------------------------------------------------
# handle_initiative_add
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestInitiativeAdd:
    async def test_player_cannot_add(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_initiative_add(
            Message(MessageType.INITIATIVE_ADD, {"entity_id": "e1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_missing_entity_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_initiative_add(Message(MessageType.INITIATIVE_ADD, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_no_combat_returns_error(self, mock_engine):
        mock_engine.add_combatant.return_value = None
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_initiative_add(
            Message(MessageType.INITIATIVE_ADD, {"entity_id": "e1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_add_resolves_combatant_from_server_token(self, mock_engine):
        token = SimpleNamespace(
            sprite_id="sprite-1",
            entity_id=1,
            name="Server Token",
            character_id=None,
            controlled_by=[7],
            hp=10,
            max_hp=12,
            ac=15,
        )
        combatant = MagicMock()
        combatant.to_dict.return_value = {"combatant_id": "cmb-1"}
        state = _combat_state()
        state.table_id = "t1"
        mock_engine.get_state.return_value = state
        mock_engine.add_combatant.return_value = combatant
        proto = _ProtoStub(role="owner")
        proto.table_manager.tables_id = {
            "t1": SimpleNamespace(
                entities={1: token},
                find_entity_by_sprite_id=lambda sprite_id: token if sprite_id == "sprite-1" else None,
            )
        }

        resp = await proto.handle_initiative_add(
            Message(MessageType.INITIATIVE_ADD, {
                "entity_id": "sprite-1",
                "name": "Spoofed",
                "hp": 999,
                "max_hp": 999,
                "armor_class": 99,
            }),
            "c1",
        )

        resolved = mock_engine.add_combatant.call_args.kwargs
        assert resp.type == MessageType.INITIATIVE_ORDER
        assert resolved["name"] == "Server Token"
        assert resolved["hp"] == 10
        assert resolved["max_hp"] == 12
        assert resolved["armor_class"] == 15
        assert resolved["controlled_by"] == ["7"]

    async def test_success_persists_added_combatant_and_versions_live_state(self):
        CombatEngine._active.pop("TST", None)
        CombatEngine.start_combat(
            "TST",
            "t1",
            [],
            combatants=[{
                "entity_id": "sprite-a",
                "name": "Ada",
                "hp": 20,
                "max_hp": 20,
            }],
        )
        persistence = _mock_persistence(version=13)
        proto = _ProtoStub(role="owner")
        proto.combat_persistence_service = persistence

        resp = await proto.handle_initiative_add(
            Message(MessageType.INITIATIVE_ADD, {
                "entity_id": "sprite-b",
                "name": "Borin",
                "hp": 12,
                "max_hp": 12,
                "sequence_id": 50,
            }),
            "c1",
        )

        persisted = persistence.persist_accepted.call_args.kwargs
        assert resp.type == MessageType.INITIATIVE_ORDER
        assert resp.data["combat"]["state_version"] == 13
        assert len(CombatEngine.get_state("TST").combatants) == 2
        assert persisted["command_type"] == "initiative_add"
        assert len(persisted["state_before"]["combatants"]) == 1
        assert len(persisted["state_after"]["combatants"]) == 2


# ---------------------------------------------------------------------------
# DM-only revert / resource handlers
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestDmRevertAction:
    async def test_player_blocked(self):
        proto = _ProtoStub(role="player")
        resp = await proto.handle_dm_revert_action(
            Message(MessageType.DM_REVERT_ACTION, {}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_nothing_to_revert_returns_error(self):
        CombatEngine._active.pop("TST", None)
        CombatEngine.start_combat(
            "TST",
            "t1",
            [],
            combatants=[{
                "entity_id": "sprite-a",
                "name": "Ada",
                "hp": 20,
                "max_hp": 20,
            }],
        )
        persistence = MagicMock()
        persistence.last_action.return_value = None
        proto = _ProtoStub(role="owner")
        proto.combat_persistence_service = persistence
        resp = await proto.handle_dm_revert_action(
            Message(MessageType.DM_REVERT_ACTION, {}), "c1"
        )
        assert resp.type == MessageType.ERROR

    async def test_success_reverts_from_persisted_journal_and_versions_live_state(self):
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
            }],
        )
        state_before_damage = state.to_dict()
        state.combatants[0].hp = 7
        state.state_version = 16
        persistence = _mock_persistence(version=17)
        persistence.last_action.return_value = CombatJournalEntry(
            command_type="dm_apply_damage",
            state_before=state_before_damage,
            state_version=16,
        )
        proto = _ProtoStub(role="owner")
        proto.combat_persistence_service = persistence

        resp = await proto.handle_dm_revert_action(
            Message(MessageType.DM_REVERT_ACTION, {"sequence_id": 55}),
            "c1",
        )

        live_state = CombatEngine.get_state("TST")
        persisted = persistence.persist_accepted.call_args.kwargs
        assert resp.type == MessageType.COMBAT_STATE
        assert resp.data["reverted"] is True
        assert resp.data["combat"]["state_version"] == 17
        assert live_state.combatants[0].hp == 20
        assert live_state.state_version == 17
        assert persisted["command_type"] == "dm_revert_action"
        assert persisted["state_before"]["combatants"][0]["hp"] == 7
        assert persisted["state_after"]["combatants"][0]["hp"] == 20


# ---------------------------------------------------------------------------
# handle_death_save_roll
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestDeathSaveRoll:
    async def test_missing_combatant_id_returns_error(self):
        proto = _ProtoStub(role="owner")
        resp = await proto.handle_death_save_roll(Message(MessageType.DEATH_SAVE_ROLL, {}), "c1")
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_no_combat_returns_error(self, mock_engine):
        mock_engine.get_state.return_value = None
        proto = _ProtoStub(role="player")
        resp = await proto.handle_death_save_roll(
            Message(MessageType.DEATH_SAVE_ROLL, {"combatant_id": "c1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_player_cannot_roll_other_combatant(self, mock_engine):
        state = _combat_state()
        combatant = MagicMock()
        combatant.combatant_id = "c1"
        combatant.controlled_by = ["99"]  # different user
        state.combatants = [combatant]
        mock_engine.get_state.return_value = state
        proto = _ProtoStub(role="player")  # user_id=1 by default
        resp = await proto.handle_death_save_roll(
            Message(MessageType.DEATH_SAVE_ROLL, {"combatant_id": "c1"}), "c1"
        )
        assert resp.type == MessageType.ERROR

    @patch("service.combat_engine.CombatEngine")
    async def test_successful_roll_returns_death_save_result(self, mock_engine):
        state = _combat_state()
        combatant = MagicMock()
        combatant.combatant_id = "c1"
        combatant.controlled_by = ["1"]
        state.combatants = [combatant]
        mock_engine.get_state.return_value = state
        mock_engine.roll_death_save.return_value = {"success": True, "total": 15}
        proto = _ProtoStub(role="player")
        resp = await proto.handle_death_save_roll(
            Message(MessageType.DEATH_SAVE_ROLL, {"combatant_id": "c1"}), "c1"
        )
        assert resp.type == MessageType.DEATH_SAVE_RESULT

    async def test_successful_roll_persists_snapshot_and_versions_live_state(self):
        CombatEngine._active.pop("TST", None)
        state = CombatEngine.start_combat(
            "TST",
            "t1",
            [],
            combatants=[{
                "entity_id": "sprite-a",
                "name": "Ada",
                "hp": 0,
                "max_hp": 20,
                "controlled_by": ["1"],
            }],
        )
        actor = state.combatants[0]
        actor.hp = 0
        persistence = _mock_persistence(version=11)
        proto = _ProtoStub(role="player")
        proto.combat_persistence_service = persistence

        with patch("service.combat_engine.DiceEngine.roll", return_value=SimpleNamespace(total=15)):
            resp = await proto.handle_death_save_roll(
                Message(MessageType.DEATH_SAVE_ROLL, {
                    "combatant_id": actor.combatant_id,
                    "sequence_id": 48,
                }),
                "c1",
            )

        persisted = persistence.persist_accepted.call_args.kwargs
        assert resp.type == MessageType.DEATH_SAVE_RESULT
        assert resp.data["combat"]["state_version"] == 11
        assert CombatEngine.get_state("TST").combatants[0].death_save_successes == 1
        assert persisted["command_type"] == "death_save_roll"
        assert persisted["state_before"]["combatants"][0]["death_save_successes"] == 0
        assert persisted["state_after"]["combatants"][0]["death_save_successes"] == 1


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


@pytest.mark.unit
class TestOaResolve:
    async def test_success_persists_reaction_damage_and_versions_live_state(self):
        CombatEngine._active.pop("TST", None)
        state = CombatEngine.start_combat(
            "TST",
            "t1",
            [],
            combatants=[
                {"entity_id": "sprite-a", "name": "Ada", "hp": 20, "max_hp": 20},
                {"entity_id": "sprite-b", "name": "Borin", "hp": 20, "max_hp": 20},
            ],
        )
        attacker = state.combatants[0]
        target = state.combatants[1]
        persistence = _mock_persistence(version=16)
        proto = _ProtoStub(role="owner")
        proto.combat_persistence_service = persistence

        with patch("service.attack_resolver.AttackResolver") as resolver:
            resolver.return_value.resolve_attack.return_value = AttackResult(
                hit=True,
                damage_dealt=5,
                reason="Hit",
            )
            resp = await proto.handle_oa_resolve(
                Message(MessageType.OPPORTUNITY_ATTACK_RESOLVE, {
                    "attacker_combatant_id": attacker.combatant_id,
                    "target_combatant_id": target.combatant_id,
                    "use_reaction": True,
                    "sequence_id": 53,
                }),
                "c1",
            )

        live_state = CombatEngine.get_state("TST")
        persisted = persistence.persist_accepted.call_args.kwargs
        assert resp.type == MessageType.OPPORTUNITY_ATTACK_RESOLVE
        assert resp.data["combat"]["state_version"] == 16
        assert resp.data["hit"] is True
        assert live_state.combatants[0].has_reaction is False
        assert live_state.combatants[1].hp == 15
        assert persisted["command_type"] == "opportunity_attack_resolve"
        assert persisted["actor_id"] == attacker.combatant_id
        assert persisted["state_before"]["combatants"][0]["has_reaction"] is True
        assert persisted["state_after"]["combatants"][0]["has_reaction"] is False
        assert persisted["state_before"]["combatants"][1]["hp"] == 20
        assert persisted["state_after"]["combatants"][1]["hp"] == 15
        assert persisted["result_payload"]["applied"][0]["result"]["damage_result"]["new_hp"] == 15

    async def test_persistence_failure_rolls_back_reaction_and_damage(self):
        CombatEngine._active.pop("TST", None)
        state = CombatEngine.start_combat(
            "TST",
            "t1",
            [],
            combatants=[
                {"entity_id": "sprite-a", "name": "Ada", "hp": 20, "max_hp": 20},
                {"entity_id": "sprite-b", "name": "Borin", "hp": 20, "max_hp": 20},
            ],
        )
        attacker = state.combatants[0]
        target = state.combatants[1]
        persistence = MagicMock()
        persistence.requester_key.return_value = "user:1"
        persistence.persist_accepted.side_effect = RuntimeError("database unavailable")
        proto = _ProtoStub(role="owner")
        proto.combat_persistence_service = persistence

        with patch("service.attack_resolver.AttackResolver") as resolver:
            resolver.return_value.resolve_attack.return_value = AttackResult(
                hit=True,
                damage_dealt=5,
                reason="Hit",
            )
            resp = await proto.handle_oa_resolve(
                Message(MessageType.OPPORTUNITY_ATTACK_RESOLVE, {
                    "attacker_combatant_id": attacker.combatant_id,
                    "target_combatant_id": target.combatant_id,
                    "use_reaction": True,
                    "sequence_id": 54,
                }),
                "c1",
            )

        live_state = CombatEngine.get_state("TST")
        assert resp.type == MessageType.ERROR
        assert live_state.combatants[0].has_reaction is True
        assert live_state.combatants[1].hp == 20
