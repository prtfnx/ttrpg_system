from typing import TYPE_CHECKING

from core_table.protocol import Message, MessageType
from utils.logger import setup_logger
from utils.roles import get_visible_layers, is_dm

if TYPE_CHECKING:
    pass

logger = setup_logger(__name__)


class _TablesMixin:
    """Handler methods for tables domain."""

    async def handle_delete_table(self, msg: Message, client_id: str) -> Message:
        """Handle delete table request"""
        logger.debug(f"Delete table request received: {msg}")
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
        logger.debug(f"Table list request received: {msg}")

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
        except Exception as e:
            logger.error(f"Error handling table list request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_new_table_request(self, msg: Message, client_id: str) -> Message:
        """Handle new table request"""
        logger.debug(f"New table request received: {msg}")
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can create tables'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in new table request'})
        table_name = msg.data.get('table_name', 'default')
        local_table_id = msg.data.get('local_table_id')  # BEST PRACTICE: Preserve local ID for sync mapping
        logger.info(f"DEBUG: Extracted local_table_id = '{local_table_id}' (type: {type(local_table_id).__name__})")

        # BEST PRACTICE: Get session_id for database persistence
        session_id = self._get_session_id(msg)
        if session_id:
            logger.info(f"Creating table with session_id: {session_id}")
        else:
            logger.warning("No session_id available - table will not be persisted to database")

        result = await self.actions.create_table(table_name, msg.data.get('width', 100), msg.data.get('height', 100), session_id=session_id)

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
            await self.ensure_assets_in_r2(table_data, msg.data.get('session_code', 'default'), self._get_user_id(msg, client_id) or 0)
            logger.info(f"Processing table {table_name} with {len(table_data.get('layers', {}))} layers")

            if local_table_id:
                logger.info(f"Sync completed: local table '{local_table_id}' → server table '{table_data.get('table_id')}'")

            # Broadcast new table creation to all clients in the session
            update_message = Message(MessageType.TABLE_UPDATE, {
                'operation': 'create',
                'table_id': table_data.get('id'),
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
                logger.info(f"DEBUG: Added local_table_id to response: {local_table_id}")
            else:
                logger.warning("DEBUG: local_table_id is falsy, not adding to response")

            logger.info(f"DEBUG: Final response_data keys: {list(response_data.keys())}")
            return Message(MessageType.NEW_TABLE_RESPONSE, response_data)

    async def handle_table_request(self, msg: Message, client_id: str) -> Message:
        """Handle table request"""
        logger.debug(f"Table request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in table request'})
        table_name = msg.data.get('table_name', 'default')
        table_id = msg.data.get('table_id', table_name)
        user_id = self._get_user_id(msg, client_id) or 0
        logger.info(f"Current tables: {self.table_manager.tables.items()}")
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
            table_data_with_hashes = await self.add_asset_hashes_to_table(table_data, session_code=msg.data.get('session_code', 'default'), user_id=user_id)

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

            # Fall back to DB if in-memory walls are empty (e.g. after server restart)
            if not walls_list and table_id:
                try:
                    from database.database import SessionLocal
                    from database.models import Wall as WallModel
                    _db = SessionLocal()
                    try:
                        db_walls = _db.query(WallModel).filter(WallModel.table_id == str(table_id)).all()
                        walls_list = [w.to_dict() for w in db_walls if hasattr(w, 'to_dict')]
                    finally:
                        _db.close()
                except Exception as _e:
                    logger.warning(f"Could not load walls from DB for table {table_id}: {_e}")

            # Include persisted layer settings for join-time sync
            layer_settings_data = {}
            if table_id:
                try:
                    import json as _json

                    from database import crud as _crud
                    from database.database import SessionLocal
                    _db = SessionLocal()
                    try:
                        _db_table = _crud.get_virtual_table_by_id(_db, str(table_id))
                        if _db_table and _db_table.layer_settings:
                            layer_settings_data = _json.loads(_db_table.layer_settings)
                    finally:
                        _db.close()
                except Exception as _e:
                    logger.warning(f"Could not load layer_settings from DB: {_e}")

            # return message that need send to client
            return Message(MessageType.TABLE_RESPONSE, {'name': table_name, 'client_id': client_id,
                                                            'table_data': table_data_with_hashes,
                                                            'walls': walls_list,
                                                            'layer_settings': layer_settings_data})

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
            # Strict bool parsing - JSON booleans from client are already bool,
            # but guard against truthy strings like 'false'/'0'
            if isinstance(dynamic_lighting, bool):
                table.dynamic_lighting_enabled = dynamic_lighting
            else:
                table.dynamic_lighting_enabled = bool(dynamic_lighting)
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
            table.grid_enabled = bool(grid_enabled)
        if snap_to_grid is not None:
            table.snap_to_grid = bool(snap_to_grid)
        if grid_color_hex is not None:
            table.grid_color_hex = grid_color_hex
        if background_color_hex is not None:
            table.background_color_hex = background_color_hex

        # Persist to DB
        session_id = self._get_session_id(msg)
        if session_id:
            try:
                from database import crud, schemas
                from database.database import SessionLocal
                db = SessionLocal()
                try:
                    update = schemas.VirtualTableUpdate(
                        dynamic_lighting_enabled=table.dynamic_lighting_enabled,
                        fog_exploration_mode=table.fog_exploration_mode,
                        ambient_light_level=table.ambient_light_level,
                        grid_cell_px=table.grid_cell_px,
                        cell_distance=table.cell_distance,
                        distance_unit=table.distance_unit,
                        grid_enabled=table.grid_enabled,
                        snap_to_grid=table.snap_to_grid,
                        grid_color_hex=table.grid_color_hex,
                        background_color_hex=table.background_color_hex,
                    )
                    crud.update_virtual_table(db, str(table.table_id), update)
                finally:
                    db.close()
            except Exception as e:
                logger.error(f"Failed to persist table lighting settings: {e}")

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
        logger.debug(f"Handling table update from {client_id}: {msg}")
        try:
            if not msg.data:
                logger.error(f"No data provided in table update from {client_id}")
                return Message(MessageType.ERROR, {'error': 'No data provided in table update'})
            else:
                update_category = msg.data.get('category', 'table')
                update_type = msg.data.get('type')
                update_data = msg.data.get('data', {})
                table_id = update_data.get('table_id', 'default')

                # Validate required fields
                if update_type is None:
                    logger.error(f"Missing 'type' field in table update from {client_id}: {msg.data}")
                    return Message(MessageType.ERROR, {'error': 'Missing required field: type'})

                role = self._get_client_role(client_id)
                user_id = self._get_user_id(msg, client_id)

                response_error = None
                response = None
                if update_category == 'sprite':
                    update_type_enum = MessageType(update_type)
                    match update_type_enum:
                        case MessageType.SPRITE_MOVE | MessageType.SPRITE_SCALE | MessageType.SPRITE_ROTATE:
                            sprite_id = update_data.get('sprite_id')
                            if not is_dm(role) and not await self._can_control_sprite(sprite_id, user_id):
                                return Message(MessageType.ERROR, {'error': 'Permission denied'})
                            await self.actions.update_sprite(table_id, sprite_id, data=update_data)
                            response= Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'sprite_id': sprite_id,
                                'message': f'Sprite {update_type} successfully'
                            })
                        case MessageType.SPRITE_CREATE:
                            if not is_dm(role):
                                return Message(MessageType.ERROR, {'error': 'Only DMs can create sprites'})
                            await self.actions.create_sprite_from_data(data=update_data,)
                            return Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'sprite_id': update_data.get('sprite_id'),
                                'message': 'Sprite added successfully'
                            })
                        case MessageType.SPRITE_REMOVE:
                            if not is_dm(role):
                                return Message(MessageType.ERROR, {'error': 'Only DMs can delete sprites'})
                            await self.actions.delete_sprite(table_id, update_data.get('sprite_id'))
                            response = Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'sprite_id': update_data.get('sprite_id'),
                                'message': 'Sprite removed successfully'
                            })
                        case _:
                            logger.error(f"Unknown sprite update type: {update_type} from {client_id}")
                            response_error= Message(MessageType.ERROR, {
                                'error': "Unknown sprite update type"
                            })

                elif update_category == 'table':
                    if not is_dm(role):
                        return Message(MessageType.ERROR, {'error': 'Only DMs can modify table settings'})
                    match update_type:
                        case  'table_move' | 'table_update':
                            await self.actions.update_table_from_data(update_data)
                            response = Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'message': f'Table {update_type} successfully'
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
                    await self.send_to_client(response_error, client_id)
                    return response_error
                elif response:
                    await self.send_to_client(response, client_id)
                    await self.broadcast_to_session(message=msg, client_id=client_id)
                    return response
                else:
                    raise ValueError("No response generated for table update")

        except Exception as e:
            logger.error(f"Error handling table update from {client_id}: {e}")
            await self._broadcast_error(client_id, "Update failed")
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

            # For now, just broadcast the update since ActionsCore doesn't have update_table_scale
            # table scale is broadcast-only until ActionsCore exposes update_table_scale
            await self.broadcast_to_session(Message(MessageType.TABLE_UPDATE, {
                'table_id': table_id,
                'scale': scale,
                'type': 'scale_update'
            }), client_id)

            return Message(MessageType.SUCCESS, {'message': 'Table scale updated'})

        except Exception as e:
            logger.error(f"Error handling table scale: {e}")
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

            # table position is broadcast-only until ActionsCore exposes update_table_position
            await self.broadcast_to_session(Message(MessageType.TABLE_UPDATE, {
                'table_id': table_id,
                'x_moved': x_moved,
                'y_moved': y_moved,
                'type': 'position_update'
            }), client_id)

            return Message(MessageType.SUCCESS, {'message': 'Table position updated'})

        except Exception as e:
            logger.error(f"Error handling table move: {e}")
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

        except Exception as e:
            logger.error(f"Error handling table active request: {e}")
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

        except Exception as e:
            logger.error(f"Error handling table active set: {e}")
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
