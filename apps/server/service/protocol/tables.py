import json

from core_table.async_actions_protocol import Position
from core_table.protocol import Message, MessageType
from service.canvas_persistence_service import load_table_hydration, persist_table_settings
from utils.blocking import run_blocking
from utils.logger import setup_logger
from utils.roles import get_visible_layers, is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)

_DEFAULT_TABLE_DIMENSION = 2000
_MIN_TABLE_DIMENSION = 500
_MAX_TABLE_DIMENSION = 10_000
_MAX_TABLE_NAME_LENGTH = 50
_MAX_IMPORTED_ENTITIES = 5_000
_MAX_IMPORTED_TABLE_BYTES = 5 * 1024 * 1024


def _validated_table_dimension(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not float(value).is_integer():
        return None
    dimension = int(value)
    return dimension if _MIN_TABLE_DIMENSION <= dimension <= _MAX_TABLE_DIMENSION else None


class _TablesMixin(_ProtocolBase):
    """Handler methods for tables domain."""

    async def handle_delete_table(self, msg: Message, client_id: str) -> Message:
        """Handle delete table request"""
        logger.debug("Table delete requested", extra={"event_name": "table.delete.requested"})
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can delete tables'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in delete table request'})

        table_id = msg.data.get('table_id')
        if not table_id:
            return Message(MessageType.ERROR, {'error': 'Table ID is required'})

        # Get session_id for database persistence
        session_id = self._get_session_id(msg)

        result = await self.actions.delete_table(table_id, session_id)
        if result.success:
            # Broadcast table deletion to all clients in the session
            update_message = Message(MessageType.TABLE_UPDATE, {
                'operation': 'delete',
                'table_id': table_id
            })
            await self.broadcast_to_session(update_message, client_id)

            return Message(MessageType.SUCCESS, {
                'table_id': table_id,
                'message': 'Table deleted successfully'
            })
        else:
            return Message(MessageType.ERROR, {'error': f'Failed to delete table: {result.message}'})

    async def handle_table_list_request(self, msg: Message, client_id: str) -> Message:
        """Handle table list request"""
        logger.debug("Table list requested", extra={"event_name": "table.list.requested"})

        try:
            result = await self.actions.get_all_tables()
            if result.success:
                tables = result.data.get('tables', []) if result.data else []
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

    async def handle_new_table_request(self, msg: Message, client_id: str) -> Message:
        """Handle new table request"""
        logger.debug("Table creation requested", extra={"event_name": "table.create.requested"})
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can create tables'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in new table request'})
        raw_table_name = msg.data.get('table_name', 'default')
        if not isinstance(raw_table_name, str):
            return Message(MessageType.ERROR, {'error': 'Table name must be text'})
        table_name = raw_table_name.strip()
        if not table_name:
            return Message(MessageType.ERROR, {'error': 'Table name is required'})
        if len(table_name) > _MAX_TABLE_NAME_LENGTH:
            return Message(MessageType.ERROR, {'error': 'Table name must be 50 characters or fewer'})

        width = _validated_table_dimension(msg.data.get('width', _DEFAULT_TABLE_DIMENSION))
        height = _validated_table_dimension(msg.data.get('height', _DEFAULT_TABLE_DIMENSION))
        if width is None or height is None:
            return Message(MessageType.ERROR, {
                'error': 'Table width and height must be whole numbers between 500 and 10000'
            })
        local_table_id = msg.data.get('local_table_id')  # BEST PRACTICE: Preserve local ID for sync mapping

        source_table_id = msg.data.get('source_table_id')
        initial_table_data = msg.data.get('table_data')
        if source_table_id is not None and initial_table_data is not None:
            return Message(MessageType.ERROR, {'error': 'Choose either source_table_id or table_data'})
        if source_table_id is not None:
            if not isinstance(source_table_id, str) or not source_table_id.strip():
                return Message(MessageType.ERROR, {'error': 'source_table_id must be non-empty text'})
            source_table = (
                self.table_manager.tables_id.get(source_table_id.strip())
                or self.table_manager.tables.get(source_table_id.strip())
            )
            if source_table is None:
                return Message(MessageType.ERROR, {'error': 'Source table not found'})
            initial_table_data = source_table.to_dict()
        if initial_table_data is not None:
            if not isinstance(initial_table_data, dict):
                return Message(MessageType.ERROR, {'error': 'table_data must be an object'})
            layers = initial_table_data.get('layers', {})
            if not isinstance(layers, dict):
                return Message(MessageType.ERROR, {'error': 'table_data.layers must be an object'})
            entity_count = sum(
                len(entities)
                for entities in layers.values()
                if isinstance(entities, (dict, list))
            )
            if entity_count > _MAX_IMPORTED_ENTITIES:
                return Message(MessageType.ERROR, {'error': f'Table imports are limited to {_MAX_IMPORTED_ENTITIES} entities'})
            try:
                encoded_size = len(json.dumps(initial_table_data).encode('utf-8'))
            except (TypeError, ValueError):
                return Message(MessageType.ERROR, {'error': 'table_data must contain JSON-compatible values'})
            if encoded_size > _MAX_IMPORTED_TABLE_BYTES:
                return Message(MessageType.ERROR, {'error': 'Table import exceeds the 5 MB metadata limit'})

        # Table creation must be durable. Validate all authenticated session
        # context before adding anything to the in-memory table manager.
        session_id = self._get_session_id(msg)
        session_code = self._get_session_code()
        user_id = self._get_user_id(msg, client_id)
        if not session_id or not session_code or user_id is None:
            return Message(MessageType.ERROR, {'error': 'Authentication and session context required'})
        logger.debug("Persistent table creation requested", extra={"event_name": "table.create.persistent"})

        if initial_table_data is not None:
            result = await self.actions.create_table(
                table_name,
                width,
                height,
                session_id=session_id,
                initial_data=initial_table_data,
            )
        else:
            result = await self.actions.create_table(
                table_name,
                width,
                height,
                session_id=session_id,
            )

        if not result.success or not result.data or result.data.get('table') is None:
            return Message(MessageType.ERROR, {'error': 'Failed to create new table'})
        else:
            # Get table data and ensure assets are in R2
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
            await self.ensure_assets_in_r2(table_data, session_code, user_id)
            logger.debug(
                "Table creation processed",
                extra={"event_name": "table.create.processed", "layer_count": len(table_data.get('layers', {}))},
            )

            if local_table_id:
                logger.debug("Table identity synchronized", extra={"event_name": "table.identity.synchronized"})

            # Broadcast new table creation to all clients in the session
            update_message = Message(MessageType.TABLE_UPDATE, {
                'operation': 'create',
                'table_id': table_data.get('table_id'),
                'table_name': table_name,
                'table_data': table_data
            })
            await self.broadcast_to_session(update_message, client_id)

            # BEST PRACTICE: Include local_table_id in response for client-side ID mapping
            response_data = {
                'name': table_name,
                'client_id': client_id,
                'table_data': table_data
            }
            if local_table_id:
                response_data['local_table_id'] = local_table_id
            return Message(MessageType.NEW_TABLE_RESPONSE, response_data)

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
            paint_strokes_list: list = []
            if table_id:
                try:
                    hydration = await run_blocking(load_table_hydration, str(table_id))
                    if not walls_list:
                        walls_list = hydration.walls
                    layer_settings_data = hydration.layer_settings
                    paint_strokes_list = hydration.paint_strokes
                except Exception as _e:
                    logger.warning(f"Could not hydrate table {table_id} from DB: {_e}")

            return Message(MessageType.TABLE_RESPONSE, {'name': table_name, 'client_id': client_id,
                                                            'table_data': table_data_with_hashes,
                                                            'walls': walls_list,
                                                            'layer_settings': layer_settings_data,
                                                            'paint_strokes': paint_strokes_list})

    async def handle_table_settings_update(self, msg: Message, client_id: str) -> Message:
        """Handle DM request to change dynamic lighting / fog exploration settings for a table."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can change table lighting settings'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id = msg.data.get('table_id')
        if not table_id:
            return Message(MessageType.ERROR, {'error': 'table_id is required'})

        VALID_FOG_MODES = {'current_only', 'persist_dimmed'}
        dynamic_lighting = msg.data.get('dynamic_lighting_enabled')
        fog_mode = msg.data.get('fog_exploration_mode')
        ambient = msg.data.get('ambient_light_level')
        grid_cell_px = msg.data.get('grid_cell_px')
        cell_distance = msg.data.get('cell_distance')
        distance_unit = msg.data.get('distance_unit')
        grid_enabled = msg.data.get('grid_enabled')
        snap_to_grid = msg.data.get('snap_to_grid')
        grid_color_hex = msg.data.get('grid_color_hex')
        background_color_hex = msg.data.get('background_color_hex')

        boolean_fields = (
            'dynamic_lighting_enabled',
            'grid_enabled',
            'snap_to_grid',
        )
        for field_name in boolean_fields:
            if field_name in msg.data and not isinstance(msg.data[field_name], bool):
                return Message(MessageType.ERROR, {'error': f'{field_name} must be a boolean'})

        if fog_mode is not None and fog_mode not in VALID_FOG_MODES:
            return Message(MessageType.ERROR, {'error': f'fog_exploration_mode must be one of {VALID_FOG_MODES}'})
        if ambient is not None:
            try:
                ambient = float(ambient)
            except (ValueError, TypeError):
                return Message(MessageType.ERROR, {'error': 'ambient_light_level must be a number between 0.0 and 1.0'})
            if not (0.0 <= ambient <= 1.0):
                return Message(MessageType.ERROR, {'error': 'ambient_light_level must be between 0.0 and 1.0'})
        if grid_cell_px is not None:
            try:
                grid_cell_px = float(grid_cell_px)
            except (ValueError, TypeError):
                return Message(MessageType.ERROR, {'error': 'grid_cell_px must be a number between 10 and 500'})
            if not (10.0 <= grid_cell_px <= 500.0):
                return Message(MessageType.ERROR, {'error': 'grid_cell_px must be between 10 and 500'})
        if cell_distance is not None:
            try:
                cell_distance = float(cell_distance)
            except (ValueError, TypeError):
                return Message(MessageType.ERROR, {'error': 'cell_distance must be a positive number'})
            if cell_distance <= 0:
                return Message(MessageType.ERROR, {'error': 'cell_distance must be positive'})
        if distance_unit is not None and distance_unit not in ('ft', 'm'):
            return Message(MessageType.ERROR, {'error': 'distance_unit must be ft or m'})

        HEX_PATTERN = r'^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$'
        import re as _re
        if grid_color_hex is not None:
            if not isinstance(grid_color_hex, str) or not _re.match(HEX_PATTERN, grid_color_hex):
                return Message(MessageType.ERROR, {'error': 'grid_color_hex must be a valid hex color'})
        if background_color_hex is not None:
            if not isinstance(background_color_hex, str) or not _re.match(HEX_PATTERN, background_color_hex):
                return Message(MessageType.ERROR, {'error': 'background_color_hex must be a valid hex color'})

        # Apply to in-memory table
        table = self.table_manager.tables_id.get(table_id)
        if table is None:
            table = self.table_manager.tables.get(table_id)
        if table is None:
            return Message(MessageType.ERROR, {'error': 'Table not found'})

        if dynamic_lighting is not None:
            table.dynamic_lighting_enabled = dynamic_lighting
        if fog_mode is not None:
            table.fog_exploration_mode = fog_mode
        if ambient is not None:
            table.ambient_light_level = float(ambient)
        if grid_cell_px is not None:
            table.grid_cell_px = float(grid_cell_px)
        if cell_distance is not None:
            table.cell_distance = float(cell_distance)
        if distance_unit is not None:
            table.distance_unit = distance_unit
        if grid_enabled is not None:
            table.grid_enabled = grid_enabled
        if snap_to_grid is not None:
            table.snap_to_grid = snap_to_grid
        if grid_color_hex is not None:
            table.grid_color_hex = grid_color_hex
        if background_color_hex is not None:
            table.background_color_hex = background_color_hex

        # Persist to DB
        session_id = self._get_session_id(msg)
        if session_id:
            try:
                await run_blocking(
                    persist_table_settings,
                    str(table.table_id),
                    {
                        'dynamic_lighting_enabled': table.dynamic_lighting_enabled,
                        'fog_exploration_mode': table.fog_exploration_mode,
                        'ambient_light_level': table.ambient_light_level,
                        'grid_cell_px': table.grid_cell_px,
                        'cell_distance': table.cell_distance,
                        'distance_unit': table.distance_unit,
                        'grid_enabled': table.grid_enabled,
                        'snap_to_grid': table.snap_to_grid,
                        'grid_color_hex': table.grid_color_hex,
                        'background_color_hex': table.background_color_hex,
                    },
                )
            except Exception:
                logger.exception("Table lighting persistence failed")

        # Broadcast to all clients in session
        broadcast_data = {
            'table_id': table_id,
            'dynamic_lighting_enabled': table.dynamic_lighting_enabled,
            'fog_exploration_mode': table.fog_exploration_mode,
            'ambient_light_level': table.ambient_light_level,
            'grid_cell_px': table.grid_cell_px,
            'cell_distance': table.cell_distance,
            'distance_unit': table.distance_unit,
            'grid_enabled': table.grid_enabled,
            'snap_to_grid': table.snap_to_grid,
            'grid_color_hex': table.grid_color_hex,
            'background_color_hex': table.background_color_hex,
        }
        await self.broadcast_to_session(
            Message(MessageType.TABLE_SETTINGS_CHANGED, broadcast_data), client_id
        )
        return Message(MessageType.TABLE_SETTINGS_CHANGED, broadcast_data)

    async def handle_table_update(self, msg: Message, client_id: str) -> Message:
        """Handle and broadcast table update with sprite movement support"""
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
                            domain_update = update_data.copy()
                            domain_update['table_id'] = table_id
                            if 'table_name' in domain_update:
                                domain_update['display_name'] = domain_update.pop('table_name')
                            if 'grid_size' in domain_update:
                                domain_update['grid_cell_px'] = domain_update.pop('grid_size')

                            result = await self.actions.update_table_from_data(domain_update)
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
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})

            table_id = msg.data.get('table_id')
            scale = msg.data.get('scale')
            self._get_session_id(msg)

            if not table_id or scale is None:
                return Message(MessageType.ERROR, {'error': 'table_id and scale are required'})

            scale_val = float(scale)
            result = await self.actions.scale_table(table_id, scale_val, scale_val)
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
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})

            table_id = msg.data.get('table_id')
            x_moved = msg.data.get('x_moved')
            y_moved = msg.data.get('y_moved')
            self._get_session_id(msg)

            if not table_id or x_moved is None or y_moved is None:
                return Message(MessageType.ERROR, {'error': 'table_id, x_moved, and y_moved are required'})

            result = await self.actions.move_table(table_id, Position(float(x_moved), float(y_moved)))
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
