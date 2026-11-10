import math
from typing import Any

from core_table.async_actions_protocol import Position
from core_table.protocol import Message, MessageType
from service.canvas_persistence_service import (
    load_table_hydration,
    load_table_preview_metadata,
)
from utils.blocking import run_blocking
from utils.logger import setup_logger
from utils.roles import get_visible_layers, is_dm

from .table_edits import _TableEditsMixin

logger = setup_logger(__name__)

_MIN_TABLE_DIMENSION = 500
_MAX_TABLE_DIMENSION = 10_000
_MAX_TABLE_NAME_LENGTH = 50


def _validated_table_dimension(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not float(value).is_integer():
        return None
    dimension = int(value)
    return dimension if _MIN_TABLE_DIMENSION <= dimension <= _MAX_TABLE_DIMENSION else None


class _TablesMixin(_TableEditsMixin):
    """Handler methods for tables domain."""

    async def handle_table_list_request(self, msg: Message, client_id: str) -> Message:
        """Handle table list request"""
        logger.debug("Table list requested", extra={"event_name": "table.list.requested"})

        try:
            result = await self.actions.get_all_tables()
            if result.success:
                tables = result.data.get('tables', []) if result.data else []
                if is_dm(self._get_client_role(client_id)):
                    session_code = self._get_session_code()
                    if session_code:
                        try:
                            metadata = await run_blocking(
                                load_table_preview_metadata,
                                session_code,
                            )
                            table_values = tables.values() if isinstance(tables, dict) else tables
                            for table in table_values:
                                if not isinstance(table, dict):
                                    continue
                                table_id = str(table.get('table_id') or table.get('id') or '')
                                table.update(metadata.get(table_id, {
                                    'has_preview': False,
                                    'preview_etag': None,
                                    'preview_updated_at': None,
                                }))
                        except Exception:
                            logger.exception("Table preview metadata load failed")
                return Message(MessageType.TABLE_LIST_RESPONSE, {
                    'tables': tables,
                    'count': len(tables)
                })
            else:
                error_msg = getattr(result, 'message', 'Unknown error')
                return Message(MessageType.ERROR, {'error': f'Failed to get table list: {error_msg}'})
        except Exception:
            logger.exception("Table list request failed")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_table_request(self, msg: Message, client_id: str) -> Message:
        """Handle table request"""
        logger.debug("Table load requested", extra={"event_name": "table.load.requested"})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in table request'})
        table_name = msg.data.get('table_name', 'default')
        table_id = msg.data.get('table_id', table_name)
        user_id = self._get_user_id(msg, client_id)
        session_code = self._get_session_code()
        if user_id is None or not session_code:
            return Message(MessageType.ERROR, {'error': 'Authentication and session context required'})
        result = await self.actions.get_table(table_id)

        if not result.success or not result.data or result.data.get('table') is None:
            return Message(MessageType.ERROR, {'error': 'Failed to get table'})
        else:
            # Get table data and add xxHash information
            table_obj = (result.data or {}).get('table')
            to_dict_fn = getattr(table_obj, 'to_dict', None)
            table_data: dict = {}
            if callable(to_dict_fn):
                try:
                    result_data = to_dict_fn()
                    table_data = result_data if isinstance(result_data, dict) else {}
                except Exception:
                    pass
            elif isinstance(table_obj, dict):
                table_data = table_obj
            table_data_with_hashes = await self.add_asset_hashes_to_table(
                table_data, session_code=session_code, user_id=user_id
            )

            role = self._get_client_role(client_id)
            if not is_dm(role):
                allowed_layers = set(get_visible_layers(role))
                layers = table_data_with_hashes.get('layers', {})
                table_data_with_hashes['layers'] = {k: v for k, v in layers.items() if k in allowed_layers}

            # Include walls for join-time sync
            table_obj2 = (result.data or {}).get('table')
            walls_list = []
            if table_obj2 and hasattr(table_obj2, 'walls'):
                walls_list = [w.to_dict() for w in table_obj2.walls.values()]

            layer_settings_data = {}
            if table_id:
                try:
                    hydration = await run_blocking(load_table_hydration, str(table_id))
                    if not walls_list:
                        walls_list = hydration.walls
                    layer_settings_data = hydration.layer_settings
                    table_data_with_hashes["settings_revision"] = getattr(hydration, 'settings_revision', 0)
                except Exception as _e:
                    logger.warning(f"Could not hydrate table {table_id} from DB: {_e}")

            return Message(MessageType.TABLE_RESPONSE, {'name': table_name, 'client_id': client_id,
                                                            'table_data': table_data_with_hashes,
                                                            'walls': walls_list,
                                                            'layer_settings': layer_settings_data})

    async def handle_table_update(self, msg: Message, client_id: str) -> Message:
        """Handle and broadcast table update with sprite movement support"""
        if self._durable_table_edits():
            return await self._execute_table_edit(msg, client_id)
        logger.debug("Table update requested", extra={"event_name": "table.update.requested"})
        try:
            if not msg.data:
                logger.error(f"No data provided in table update from {client_id}")
                return Message(MessageType.ERROR, {'error': 'No data provided in table update'})
            else:
                update_category = msg.data.get('category', 'table')
                update_type = msg.data.get('type')
                update_data = msg.data.get('data', {})
                table_id = update_data.get('table_id')

                # Validate required fields
                if update_type is None:
                    logger.info(
                        "Table update rejected",
                        extra={"event_name": "table.update.rejected", "reason": "missing_type"},
                    )
                    return Message(MessageType.ERROR, {'error': 'Missing required field: type'})
                if not isinstance(table_id, str) or not table_id.strip():
                    return Message(MessageType.ERROR, {'error': 'Missing required field: table_id'})
                table_id = table_id.strip()
                if update_category == 'sprite':
                    return Message(MessageType.ERROR, {
                        'error': 'Sprite-category table updates are no longer supported; use dedicated sprite messages',
                    })

                role = self._get_client_role(client_id)

                response_error = None
                response = None
                if update_category == 'table':
                    if not is_dm(role):
                        return Message(MessageType.ERROR, {'error': 'Only DMs can modify table settings'})
                    match update_type:
                        case 'table_update':
                            allowed_fields = {
                                'table_id', 'table_name', 'width', 'height',
                                'grid_size', 'grid_enabled',
                            }
                            unknown_fields = set(update_data) - allowed_fields
                            if unknown_fields:
                                return Message(MessageType.ERROR, {
                                    'error': f'Unsupported table fields: {", ".join(sorted(unknown_fields))}'
                                })
                            domain_update: dict[str, Any] = {'table_id': table_id}
                            if 'table_name' in update_data:
                                name = update_data['table_name']
                                if not isinstance(name, str) or not name.strip() or len(name.strip()) > _MAX_TABLE_NAME_LENGTH:
                                    return Message(MessageType.ERROR, {'error': 'table_name must be non-empty text up to 50 characters'})
                                domain_update['display_name'] = name.strip()
                            for dimension_name in ('width', 'height'):
                                if dimension_name in update_data:
                                    dimension = _validated_table_dimension(update_data[dimension_name])
                                    if dimension is None:
                                        return Message(MessageType.ERROR, {
                                            'error': f'{dimension_name} must be a whole number between 500 and 10000'
                                        })
                                    domain_update[dimension_name] = dimension
                            if 'grid_size' in update_data:
                                grid_size = update_data['grid_size']
                                if isinstance(grid_size, bool) or not isinstance(grid_size, (int, float)) or not 10 <= grid_size <= 500:
                                    return Message(MessageType.ERROR, {'error': 'grid_size must be a number between 10 and 500'})
                                domain_update['grid_cell_px'] = float(grid_size)
                            if 'grid_enabled' in update_data:
                                if not isinstance(update_data['grid_enabled'], bool):
                                    return Message(MessageType.ERROR, {'error': 'grid_enabled must be a boolean'})
                                domain_update['grid_enabled'] = update_data['grid_enabled']

                            result = await self.actions.update_table_from_data(
                                domain_update,
                                session_id=self._get_session_id(msg),
                            )
                            if result.success:
                                response = Message(MessageType.SUCCESS, {
                                    'table_id': table_id,
                                    'message': 'Table updated successfully'
                                })
                            else:
                                response_error = Message(MessageType.ERROR, {
                                    'error': result.message or 'Failed to update table'
                                })
                        case 'fog_update':
                            session_id = self._get_session_id(msg)
                            hide_rectangles = update_data.get('hide_rectangles', [])
                            reveal_rectangles = update_data.get('reveal_rectangles', [])

                            result = await self.actions.update_fog_rectangles(table_id, hide_rectangles, reveal_rectangles, session_id)

                            if result.success:
                                fog_data = result.data.get('fog_rectangles') if result.data else {}
                                response = Message(MessageType.SUCCESS, {
                                    'table_id': table_id,
                                    'message': 'Fog updated successfully',
                                    'fog_rectangles': fog_data
                                })
                            else:
                                response_error = Message(MessageType.ERROR, {'error': result.message})
                        case _:
                            logger.error(f"Unknown table update type: {update_type} from {client_id}")
                            response_error = Message(MessageType.ERROR, {
                                'error': f"Unknown table update type: {update_type}"
                            })

                if response_error:
                    return response_error
                elif response:
                    # Requests are commands and are not registered as inbound
                    # events by clients. Broadcast the applied update using the
                    # canonical event type while preserving the operation shape.
                    await self.broadcast_to_session(
                        message=Message(MessageType.TABLE_UPDATE, msg.data),
                        client_id=client_id,
                    )
                    return response
                else:
                    raise ValueError("No response generated for table update")

        except Exception:
            logger.exception("Table update request failed")
            return Message(MessageType.ERROR, {'error': "Update failed"})

    async def handle_table_scale(self, msg: Message, client_id: str) -> Message:
        """Handle table scale change"""
        if self._durable_table_edits():
            return await self._execute_table_edit(msg, client_id)
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can scale tables'})
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})

            table_id = msg.data.get('table_id')
            scale = msg.data.get('scale')
            self._get_session_id(msg)

            if not table_id or scale is None:
                return Message(MessageType.ERROR, {'error': 'table_id and scale are required'})

            if isinstance(scale, bool) or not isinstance(scale, (int, float)) or not math.isfinite(scale) or scale <= 0:
                return Message(MessageType.ERROR, {'error': 'Scale must be a finite positive number'})
            scale_val = float(scale)
            result = await self.actions.scale_table(
                table_id, scale_val, scale_val, session_id=self._get_session_id(msg),
            )
            if not result.success:
                return Message(MessageType.ERROR, {'error': result.message})

            await self.broadcast_to_session(Message(MessageType.TABLE_UPDATE, {
                'table_id': table_id,
                'scale': scale,
                'type': 'scale_update'
            }), client_id)

            return Message(MessageType.SUCCESS, {'message': 'Table scale updated'})

        except Exception:
            logger.exception("Table scale request failed")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_table_move(self, msg: Message, client_id: str) -> Message:
        """Handle table position change"""
        if self._durable_table_edits():
            return await self._execute_table_edit(msg, client_id)
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can move tables'})
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})

            table_id = msg.data.get('table_id')
            x_moved = msg.data.get('x_moved')
            y_moved = msg.data.get('y_moved')
            self._get_session_id(msg)

            if not table_id or x_moved is None or y_moved is None:
                return Message(MessageType.ERROR, {'error': 'table_id, x_moved, and y_moved are required'})

            if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
                   for value in (x_moved, y_moved)):
                return Message(MessageType.ERROR, {'error': 'Position must contain finite numbers'})
            result = await self.actions.move_table(
                table_id, Position(float(x_moved), float(y_moved)), session_id=self._get_session_id(msg),
            )
            if not result.success:
                return Message(MessageType.ERROR, {'error': result.message})

            await self.broadcast_to_session(Message(MessageType.TABLE_UPDATE, {
                'table_id': table_id,
                'x_moved': x_moved,
                'y_moved': y_moved,
                'type': 'position_update'
            }), client_id)

            return Message(MessageType.SUCCESS, {'message': 'Table position updated'})

        except Exception:
            logger.exception("Table move request failed")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_table_active_request(self, msg: Message, client_id: str) -> Message:
        """Handle request for user's active table"""
        try:
            user_id = self._get_user_id(msg, client_id)
            session_code = self._get_session_code(msg)

            logger.info(f"Active table request from user {user_id} in session {session_code}")

            if not user_id or not session_code:
                logger.warning("Missing user_id or session_code for table active request")
                return Message(MessageType.TABLE_ACTIVE_RESPONSE, {
                    'table_id': None,
                    'success': False,
                    'error': 'Missing user_id or session_code'
                })

            # Get the user's active table from database
            active_table_id = await self._get_player_active_table(user_id, session_code)

            logger.info(f"Retrieved active table for user {user_id}: {active_table_id}")

            return Message(MessageType.TABLE_ACTIVE_RESPONSE, {
                'table_id': active_table_id,
                'success': active_table_id is not None
            })

        except Exception:
            logger.exception("Active-table request failed")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_table_active_set(self, msg: Message, client_id: str) -> Message:
        """Handle setting user's active table"""
        try:
            user_id = self._get_user_id(msg, client_id)
            session_code = self._get_session_code(msg)
            table_id = msg.data.get('table_id') if msg.data else None

            logger.info(f"Active table set request from user {user_id} in session {session_code} to table {table_id}")

            if not user_id or not session_code:
                logger.warning("Missing user_id or session_code for table active set")
                return Message(MessageType.ERROR, {'error': 'Missing user_id or session_code'})

            # Update the user's active table in database
            success = await self._set_player_active_table(user_id, session_code, table_id)

            if success:
                logger.info(f"Successfully updated active table for user {user_id} to {table_id}")
                return Message(MessageType.SUCCESS, {'message': 'Active table updated'})
            else:
                logger.error(f"Failed to update active table for user {user_id} to {table_id}")
                return Message(MessageType.ERROR, {'error': 'Failed to update active table'})

        except Exception:
            logger.exception("Active-table update failed")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_table_active_set_all(self, msg: Message, client_id: str) -> Message:
        """DM-only: switch every connected player to a specific table."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can set the active table for all players'})
        table_id = msg.data.get('table_id') if msg.data else None
        if not table_id:
            return Message(MessageType.ERROR, {'error': 'table_id required'})

        # Validate table exists
        known = getattr(self.table_manager, 'tables_id', {})
        if known and str(table_id) not in known:
            return Message(MessageType.ERROR, {'error': f'Table {table_id} not found'})

        session_code = self._get_session_code(msg)

        table_obj = known.get(str(table_id))
        table_name = getattr(table_obj, 'display_name', str(table_id))

        # Broadcast before DB writes so clients switch immediately
        await self.broadcast_to_session(
            Message(MessageType.TABLE_ACTIVE_SET_ALL_RESPONSE, {'table_id': table_id, 'table_name': table_name}),
            client_id
        )

        # Persist active table for every connected non-DM player
        if session_code and self.session_manager and hasattr(self.session_manager, 'client_info'):
            for cid, info in self.session_manager.client_info.items():
                if is_dm(info.get('role', 'player')):
                    continue
                uid = info.get('user_id')
                if uid:
                    await self._set_player_active_table(int(uid), session_code, str(table_id))

        logger.info(f"DM {client_id} switched all players to table {table_id}")
        return Message(MessageType.SUCCESS, {'message': f'All players switched to table {table_id}'})
