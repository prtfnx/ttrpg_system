"""Recipient privacy, committed projection and server-owned deadline expiry."""
from service.combat_engine import CombatEngine
from tests.unit.test_combat_reactions import game as game
from tests.unit.test_combat_reactions import move_payload, reply


async def test_protocol_publishes_only_authorized_prompts_and_committed_movement(game, monkeypatch):
    from unittest.mock import AsyncMock

    from core_table.protocol import Message, MessageType
    from core_table.server import TableManager
    from core_table.session_rules import SessionRules
    from tests.unit.test_combat_protocol import _ProtoStub

    proto = _ProtoStub(
        client_info={
            "dm": {"user_id": 2, "role": "owner"},
            "pc": {"user_id": 1, "role": "player"},
            "peer": {"user_id": 3, "role": "player"},
            "spectator": {"user_id": 4, "role": "spectator"},
        }
    )
    proto._get_session_code = lambda _msg=None: "reactions"
    proto._current_combat_member_role = lambda _session, uid: "owner" if uid == 2 else "player"
    proto.table_manager = TableManager()
    proto.table_manager.tables_id[str(game[0].table_id)] = game[0]
    proto._rules_cache = {"reactions": (SessionRules(session_id="reactions", movement_mode="free"), "fight")}
    proto.broadcast_filtered = AsyncMock()
    response = await proto.handle_combat_command(
        Message(MessageType.COMBAT_COMMAND, {"sequence_id": 11, "commands": [move_payload(game)]}), "dm"
    )
    assert response.type == MessageType.ACTION_RESULT
    assert game[0].find_entity_by_sprite_id("mover").position == (50, 25)
    peers = {client: message.data["combat"] for message, client in proto.sent}
    assert peers["pc"]["reaction_prompts"][0]["trigger_id"]
    assert "reaction_prompts" not in peers["peer"] and "reaction_prompts" not in peers["spectator"]
    proto.broadcast_filtered.assert_not_awaited()
    command = reply(game, False)
    response = await proto.handle_combat_command(
        Message(MessageType.COMBAT_COMMAND, {"sequence_id": 12, "commands": [command]}), "pc"
    )
    assert response.type == MessageType.ACTION_RESULT
    assert game[0].find_entity_by_sprite_id("mover").position == (175, 25)
    proto.broadcast_filtered.assert_awaited_once()
    published = proto.broadcast_filtered.await_args.args[0]
    assert published.data["position"] == {"x": 175, "y": 25}
    assert published.type == MessageType.SPRITE_MOVE


async def test_server_deadline_expires_without_a_browser_poll(game):
    import asyncio
    import time

    from core_table.protocol import Message, MessageType
    from core_table.server import TableManager
    from core_table.session_rules import SessionRules
    from tests.unit.test_combat_protocol import _ProtoStub

    proto = _ProtoStub(client_info={"dm": {"user_id": 2, "role": "owner"}})
    proto._get_session_code = lambda _msg=None: "reactions"
    proto._current_combat_member_role = lambda _session, uid: "owner"
    proto.table_manager = TableManager()
    proto.table_manager.tables_id[str(game[0].table_id)] = game[0]
    proto._rules_cache = {"reactions": (SessionRules(session_id="reactions", movement_mode="free"), "fight")}
    await proto.handle_combat_command(
        Message(MessageType.COMBAT_COMMAND, {"sequence_id": 111, "commands": [move_payload(game)]}), "dm"
    )
    game[1].pending_movement["expires_at"] = time.time() - 1
    proto._mutation_lock = asyncio.Lock()
    proto._invoke_handler = lambda message, _client: proto.handle_combat_state_request(message, "dm")
    proto._schedule_reaction_expiry()
    try:
        await asyncio.wait_for(asyncio.shield(proto._reaction_timer), timeout=3)
        assert CombatEngine.get_state("reactions").pending_movement is None
        assert game[0].find_entity_by_sprite_id("mover").position == (175, 25)
        assert game[3].has_reaction
    finally:
        proto.stop_reaction_timer()
        await asyncio.gather(proto._reaction_timer, return_exceptions=True)
