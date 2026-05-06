from core_table.protocol import Message, MessageType
from utils.logger import setup_logger
from utils.roles import can_interact, is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _WallsMixin(_ProtocolBase):
    """Handler methods for walls domain."""

    async def handle_wall_create(self, msg: Message, client_id: str) -> Message:
        """DM creates a single wall segment and persists it to the database."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can create walls'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id = msg.data.get('table_id')
        wall_data = msg.data.get('wall_data', {})
        if not table_id or not wall_data:
            return Message(MessageType.ERROR, {'error': 'table_id and wall_data are required'})

        user_id = self._get_user_id(msg, client_id)
        wall_data['table_id'] = table_id
        wall_data['created_by'] = user_id

        try:
            wall_dict = await self.actions.create_wall(table_id=table_id, wall_data=wall_data,
                                                       session_id=self._get_session_id(msg))
        except Exception as e:
            logger.error(f"handle_wall_create error: {e}")
            return Message(MessageType.ERROR, {'error': str(e)})

        await self.broadcast_to_session(
            Message(MessageType.WALL_DATA, {'operation': 'create', 'wall': wall_dict, 'table_id': table_id}),
            client_id,
        )
        return Message(MessageType.WALL_DATA, {'operation': 'create', 'wall': wall_dict, 'table_id': table_id})

    async def handle_wall_update(self, msg: Message, client_id: str) -> Message:
        """DM modifies wall properties (type, blocking flags, door state, etc.)."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can update walls'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id = msg.data.get('table_id')
        wall_id  = msg.data.get('wall_id')
        updates  = msg.data.get('updates', {})
        if not table_id or not wall_id:
            return Message(MessageType.ERROR, {'error': 'table_id and wall_id are required'})

        try:
            wall_dict = await self.actions.update_wall(table_id=table_id, wall_id=wall_id, updates=updates,
                                                       session_id=self._get_session_id(msg))
        except Exception as e:
            logger.error(f"handle_wall_update error: {e}")
            return Message(MessageType.ERROR, {'error': str(e)})

        await self.broadcast_to_session(
            Message(MessageType.WALL_DATA, {'operation': 'update', 'wall': wall_dict, 'table_id': table_id}),
            client_id,
        )
        return Message(MessageType.WALL_DATA, {'operation': 'update', 'wall': wall_dict, 'table_id': table_id})

    async def handle_wall_remove(self, msg: Message, client_id: str) -> Message:
        """DM removes a wall segment permanently."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can remove walls'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id = msg.data.get('table_id')
        wall_id  = msg.data.get('wall_id')
        if not table_id or not wall_id:
            return Message(MessageType.ERROR, {'error': 'table_id and wall_id are required'})

        try:
            await self.actions.delete_wall(table_id=table_id, wall_id=wall_id,
                                           session_id=self._get_session_id(msg))
        except Exception as e:
            logger.error(f"handle_wall_remove error: {e}")
            return Message(MessageType.ERROR, {'error': str(e)})

        await self.broadcast_to_session(
            Message(MessageType.WALL_DATA, {'operation': 'remove', 'wall_id': wall_id, 'table_id': table_id}),
            client_id,
        )
        return Message(MessageType.WALL_DATA, {'operation': 'remove', 'wall_id': wall_id, 'table_id': table_id})

    async def handle_wall_batch_create(self, msg: Message, client_id: str) -> Message:
        """DM imports many walls at once (e.g. after map import)."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can batch-create walls'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id   = msg.data.get('table_id')
        walls_data = msg.data.get('walls', [])
        if not table_id or not isinstance(walls_data, list):
            return Message(MessageType.ERROR, {'error': 'table_id and walls list are required'})

        user_id    = self._get_user_id(msg, client_id)
        session_id = self._get_session_id(msg)
        created    = []
        for wd in walls_data:
            try:
                wd['table_id']    = table_id
                wd['created_by']  = user_id
                wall_dict = await self.actions.create_wall(table_id=table_id, wall_data=wd, session_id=session_id)
                created.append(wall_dict)
            except Exception as e:
                logger.warning(f"Skipping wall in batch due to error: {e}")

        await self.broadcast_to_session(
            Message(MessageType.WALL_DATA, {'operation': 'batch_create', 'walls': created, 'table_id': table_id}),
            client_id,
        )
        return Message(MessageType.WALL_DATA, {'operation': 'batch_create', 'walls': created, 'table_id': table_id})

    async def handle_door_toggle(self, msg: Message, client_id: str) -> Message:
        """Toggle a door between open/closed.  Players can interact; locked doors require DM."""
        role = self._get_client_role(client_id)
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Spectators cannot interact with doors'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id = msg.data.get('table_id')
        wall_id  = msg.data.get('wall_id')
        if not table_id or not wall_id:
            return Message(MessageType.ERROR, {'error': 'table_id and wall_id are required'})

        # Validate this is actually a door — load from in-memory table walls
        table = self.table_manager.tables_id.get(table_id) or self.table_manager.tables.get(table_id)
        if table is None:
            return Message(MessageType.ERROR, {'error': 'Table not found'})

        wall = table.get_wall(wall_id) if hasattr(table, 'get_wall') else None
        if wall is None:
            return Message(MessageType.ERROR, {'error': 'Wall not found'})
        if not wall.is_door:
            return Message(MessageType.ERROR, {'error': 'This wall is not a door'})
        if wall.door_state == 'locked' and not is_dm(role):
            return Message(MessageType.ERROR, {'error': 'Door is locked — only the DM can open it'})

        new_state = 'closed' if wall.door_state == 'open' else 'open'
        try:
            wall_dict = await self.actions.update_wall(
                table_id=table_id, wall_id=wall_id,
                updates={'door_state': new_state},
                session_id=self._get_session_id(msg),
            )
        except Exception as e:
            logger.error(f"handle_door_toggle error: {e}")
            return Message(MessageType.ERROR, {'error': str(e)})

        await self.broadcast_to_session(
            Message(MessageType.WALL_DATA, {'operation': 'update', 'wall': wall_dict, 'table_id': table_id}),
            client_id,
        )
        return Message(MessageType.WALL_DATA, {'operation': 'update', 'wall': wall_dict, 'table_id': table_id})
