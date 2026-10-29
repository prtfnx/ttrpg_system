import json
import time
from typing import cast
from unittest.mock import AsyncMock

import pytest
from core_table.actions_core import ActionsCore
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from core_table.session_rules import SessionRules
from fastapi import WebSocket
from service.character_protocol_persistence_service import TokenStatUpdate
from service.game_session_protocol import GameSessionProtocolService
from service.protocol.base import ServerProtocol
from service.protocol.sprites import _SpritesMixin
from utils.roles import get_visible_layers, is_dm


class SpriteProtocol(_SpritesMixin):
    def __init__(self):
        self._rules_cache = {"VISIBILITY": (SessionRules.defaults("VISIBILITY"), "free_roam")}

    def _get_session_id(self, msg):
        return None

    def _get_client_role(self, client_id):
        return "owner"

    def _get_user_id(self, msg, client_id=None):
        return 1

    def _get_session_code(self, msg=None):
        return "VISIBILITY"


@pytest.mark.parametrize("extra", [{"expires_at": 0}, {"expires_at": float("nan")},
    {"sequence": True}, {"sequence": -1}, {"expires_at": time.time() * 1000 + 60_000}])
async def test_stale_or_invalid_preview_metadata_is_not_relayed(extra):
    proto = SpriteProtocol()
    proto.broadcast_filtered = AsyncMock()
    await proto.handle_sprite_drag_preview(Message(MessageType.SPRITE_DRAG_PREVIEW,
        {"id": "token", "table_id": "table", "x": 1, "y": 2, **extra}), "sender")
    proto.broadcast_filtered.assert_not_awaited()


async def test_preview_source_identity_is_server_owned_and_sequence_survives_relay():
    manager = TableManager()
    table = manager.create_table("Preview", 100, 100)
    table.add_entity({"sprite_id": "token", "layer": "tokens", "x": 10, "y": 10})
    proto = SpriteProtocol()
    proto.table_manager = manager
    proto.broadcast_filtered = AsyncMock()
    await proto.handle_sprite_drag_preview(Message(MessageType.SPRITE_DRAG_PREVIEW,
        {"id": "token", "table_id": str(table.table_id), "x": 1, "y": 2,
         "expires_at": time.time() * 1000 + 1500, "sequence": 2, "source_client_id": "forged"}), "sender")
    payload = proto.broadcast_filtered.call_args.args[0].data
    assert payload["source_client_id"] == "sender" and payload["sequence"] == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("layer", ["tokens", "dungeon_master"])
@pytest.mark.parametrize("operation, payload", [
    ("move_sprite", {"from": {"x": 10, "y": 10}, "to": {"x": 20, "y": 20}, "table_edit_override": True}),
    ("scale_sprite", {"width": 30, "height": 40}),
    ("rotate_sprite", {"rotation": 45}),
    ("delete_sprite", {}),
    ("sprite_update", {"hp": 7}),
    ("sprite_drag_preview", {"x": 20, "y": 20}),
    ("sprite_resize_preview", {"width": 30, "height": 40}),
    ("sprite_rotate_preview", {"rotation": 45}),
    ("compendium_sprite_remove", {}),
    ("compendium_sprite_update", {"sprite_data": {"sprite_id": "token", "hp": 7}}),
    ("compendium_sprite_add", {"sprite_data": {"sprite_id": "new-token", "x": 10, "y": 10}}),
])
async def test_every_sprite_event_uses_authoritative_layer(monkeypatch, layer, operation, payload):
    manager = TableManager()
    table = manager.create_table("Visibility", 100, 100)
    table.add_entity({"sprite_id": "token", "layer": layer, "x": 10, "y": 10})
    service = GameSessionProtocolService.__new__(GameSessionProtocolService)
    sockets = {role: AsyncMock() for role in ("owner", "co_dm", "player", "spectator")}
    monkeypatch.setattr(service, "clients", sockets, raising=False)
    service.client_info = {role: {"role": role} for role in service.clients}
    proto = SpriteProtocol()
    proto.table_manager = manager
    proto.actions = ActionsCore(manager)
    proto.broadcast_filtered = AsyncMock(wraps=service.broadcast_filtered)
    proto.broadcast_to_session = AsyncMock()
    data = {"table_id": str(table.table_id), "sprite_id": "token", **payload}
    if operation == "compendium_sprite_add":
        data["sprite_data"] = {**data["sprite_data"], "layer": layer}
    await getattr(proto, f"handle_{operation}")(Message(MessageType.SPRITE_UPDATE, data), "sender")
    await service.drain_outbound()

    proto.broadcast_to_session.assert_not_awaited()
    for role, socket in sockets.items():
        if layer == "tokens" or role in ("owner", "co_dm"):
            socket.send_text.assert_awaited_once()
            assert json.loads(socket.send_text.call_args.args[0])["data"]
        else:
            socket.send_text.assert_not_awaited()


@pytest.mark.asyncio
async def test_preview_for_unknown_entity_is_not_broadcast():
    proto = SpriteProtocol()
    proto.table_manager = TableManager()
    proto.broadcast_filtered = AsyncMock()
    await proto.handle_sprite_drag_preview(
        Message(MessageType.SPRITE_DRAG_PREVIEW, {"id": "missing", "x": 1, "y": 2}), "sender",
    )
    proto.broadcast_filtered.assert_not_awaited()


@pytest.mark.parametrize("loaded", [False, True])
@pytest.mark.parametrize("layer", ["map", "tokens", "dungeon_master", "light", "height", "obstacles", "fog_of_war"])
async def test_character_stat_sync_respects_recipient_visibility(monkeypatch, loaded, layer):
    manager = TableManager()
    table = manager.create_table("Linked character", 100, 100)
    table_id = str(table.table_id)
    table.add_entity({"sprite_id": "linked-token", "layer": layer, "x": 10, "y": 10})
    if not loaded:
        manager.tables.clear()
        manager.tables_id.clear()

    service = GameSessionProtocolService.__new__(GameSessionProtocolService)
    sockets = {role: AsyncMock(spec=WebSocket) for role in ("owner", "co_dm", "trusted_player", "player", "spectator")}
    service.clients = {role: cast(WebSocket, socket) for role, socket in sockets.items()}
    service.client_info = {role: {"role": role} for role in sockets}
    proto = ServerProtocol(manager, session_manager=service)
    proto.broadcast_to_session = AsyncMock()
    # A loaded token's current layer wins over an older persisted projection.
    persisted_layer = "tokens" if loaded else layer
    monkeypatch.setattr("service.protocol.characters.persist_character_token_stats",
                        lambda *_args: [TokenStatUpdate("linked-token", table_id, persisted_layer)])

    await proto._sync_character_stats_to_tokens(1, "linked-character", {"hp": 7, "max_hp": 12, "ac": 15})
    await service.drain_outbound()

    proto.broadcast_to_session.assert_not_awaited()
    for role, socket in sockets.items():
        if is_dm(role) or layer in get_visible_layers(role):
            socket.send_text.assert_awaited_once()
            message = json.loads(socket.send_text.call_args.args[0])
            assert message["type"] == MessageType.SPRITE_UPDATE.value
            assert message["data"] == {
                "sprite_id": "linked-token", "table_id": table_id,
                "updates": {"hp": 7, "max_hp": 12, "ac": 15},
                "operation": "update", "source": "character_sync",
            }
        else:
            socket.send_text.assert_not_awaited()
    if loaded:
        entity = table.find_entity_by_sprite_id("linked-token")
        assert entity is not None
        assert (entity.hp, entity.max_hp, entity.ac) == (7, 12, 15)
