import json
from unittest.mock import AsyncMock

import pytest
from core_table.actions_core import ActionsCore
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from service.game_session_protocol import GameSessionProtocolService
from service.protocol.sprites import _SpritesMixin


class SpriteProtocol(_SpritesMixin):
    def _get_session_id(self, msg):
        return None

    def _get_client_role(self, client_id):
        return "owner"

    def _get_user_id(self, msg, client_id=None):
        return 1

    def _get_session_code(self, msg=None):
        return "VISIBILITY"


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
    service.clients = {role: AsyncMock() for role in ("owner", "co_dm", "player", "spectator")}
    service.client_info = {role: {"role": role} for role in service.clients}
    proto = SpriteProtocol()
    proto.table_manager = manager
    proto.actions = ActionsCore(manager)
    proto.broadcast_filtered = service.broadcast_filtered
    proto.broadcast_to_session = AsyncMock()
    monkeypatch.setattr("service.protocol.sprites.load_entity_character_id", lambda _id: None)
    data = {"table_id": str(table.table_id), "sprite_id": "token", **payload}
    if operation == "compendium_sprite_add":
        data["sprite_data"] = {**data["sprite_data"], "layer": layer}
    await getattr(proto, f"handle_{operation}")(Message(MessageType.SPRITE_UPDATE, data), "sender")

    proto.broadcast_to_session.assert_not_awaited()
    for role, socket in service.clients.items():
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
