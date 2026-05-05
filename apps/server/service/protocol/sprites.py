import json
from typing import TYPE_CHECKING

from core_table.protocol import Message, MessageType
from database.database import SessionLocal
from service.movement_validator import MovementValidator
from utils.logger import setup_logger
from utils.roles import can_interact, get_sprite_limit, is_dm

if TYPE_CHECKING:
    pass

logger = setup_logger(__name__)


class _SpritesMixin:
    """Handler methods for sprites domain."""

    async def handle_create_sprite(self, msg: Message, client_id: str) -> Message:
        """Handle create sprite request"""
        logger.debug(f"Create sprite request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in create sprite request'})
        sprite_data = msg.data.get('sprite_data')
        if not sprite_data:
            return Message(MessageType.ERROR, {'error': 'No sprite data provided'})
        # Normalize sprite_data to a dict to satisfy static checks and ensure .get works
        if not isinstance(sprite_data, dict):
            try:
                if hasattr(sprite_data, 'to_dict'):
                    sprite_data = sprite_data.to_dict() or {}
                else:
                    sprite_data = dict(sprite_data)
            except Exception:
                sprite_data = {}
        table_id = msg.data.get('table_id', 'default')

        # Get session_id for database persistence
        session_id = self._get_session_id(msg)

        # Extract canonical character link and normalize controlled_by
        try:
            if isinstance(sprite_data, dict):
                # Enforce canonical `character_id` key (do not accept legacy `id`)
                char_id = msg.data.get('character_id') or sprite_data.get('character_id')
                if char_id:
                    sprite_data['character_id'] = str(char_id)

                # Normalize controlled_by if provided as list -> store as JSON string for DB
                cb = sprite_data.get('controlled_by')
                if isinstance(cb, (list, tuple)):
                    sprite_data['controlled_by'] = json.dumps(cb)
        except Exception:
            # ignore normalization errors but do not silently remap legacy keys
            pass

        # Role-based layer access check
        _dm_layers = {'dungeon_master', 'fog_of_war', 'light', 'height', 'obstacles', 'dm_notes'}
        role = self._get_client_role(client_id)
        layer = sprite_data.get('layer', 'tokens') if isinstance(sprite_data, dict) else 'tokens'
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Insufficient permissions to create sprites'})
        if layer in _dm_layers and not is_dm(role):
            return Message(MessageType.ERROR, {'error': 'Only DMs can create sprites on this layer'})

        # Get user identity for ownership and limit enforcement
        user_id = self._get_user_id(msg, client_id)

        # Enforce per-role sprite creation limit for non-DM players
        if not is_dm(role):
            limit = get_sprite_limit(role)
            if user_id is not None and hasattr(self.table_manager, 'db_session') and self.table_manager.db_session:
                from database.models import Entity
                # Pre-filter with SQL LIKE, then exact-check with json.loads
                # (substring match alone could miscount: user_id 1 matches [10])
                uid = str(user_id)
                candidates = self.table_manager.db_session.query(Entity.controlled_by).filter(
                    Entity.controlled_by.isnot(None),
                    Entity.controlled_by.contains(uid),
                ).all()
                owned_count = sum(
                    1 for (cb_raw,) in candidates
                    if user_id in json.loads(cb_raw or '[]')
                )
                if owned_count >= limit:
                    return Message(MessageType.ERROR, {'error': f'Sprite limit of {limit} reached for your role'})

        # Set controlled_by based on who is creating the sprite
        if isinstance(sprite_data, dict):
            if is_dm(role):
                # DM sprites are DM-owned; players cannot control them
                sprite_data['controlled_by'] = json.dumps([])
            elif user_id is not None:
                # Player-placed sprite: creator is the only non-DM controller
                sprite_data['controlled_by'] = json.dumps([user_id])

        result = await self.actions.create_sprite(table_id=table_id, sprite_data=sprite_data, session_id=session_id)
        logger.debug(f"Create sprite result: {result}")
        # Safely extract result data
        result_data = result.data or {}
        if not result.success or not result_data or result_data.get('sprite_data') is None:
            return Message(MessageType.ERROR, {'error': 'Failed to create sprite'})
        else:
            # Include both sprite_id and the full sprite_data for client WASM engine
            sprite_data = result_data.get('sprite_data') or {}
            if not isinstance(sprite_data, dict) and hasattr(sprite_data, 'to_dict'):
                try:
                    sprite_data = sprite_data.to_dict() or {}
                except Exception:
                    sprite_data = {}
            logger.debug(f"Sprite creation result - sprite_data: {sprite_data}")
            # Ensure table_id is embedded in sprite_data so the client can assign it
            # to WASM sprites (without it the sprite gets table_id='default_table' and is never rendered)
            if isinstance(sprite_data, dict):
                sprite_data['table_id'] = table_id
            response_data = {
                'sprite_id': sprite_data.get('sprite_id') if isinstance(sprite_data, dict) else None,
                'sprite_data': sprite_data
            }
            logger.debug(f"Sending sprite response: {response_data}")

            # Broadcast sprite creation only to clients who can see this layer
            update_message = Message(MessageType.SPRITE_UPDATE, {
                'sprite_id': sprite_data.get('sprite_id'),
                'operation': 'create',
                'sprite_data': sprite_data,
                'table_id': table_id
            })
            await self.broadcast_filtered(update_message, layer, client_id)

            return Message(MessageType.SPRITE_RESPONSE, response_data)

    async def handle_delete_sprite(self, msg: Message, client_id: str) -> Message:
        """Handle delete sprite request"""
        logger.debug(f"Delete sprite request received: {msg}")
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can delete sprites'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in delete sprite request'})

        table_id = msg.data.get('table_id', 'default')
        sprite_id = msg.data.get('sprite_id')

        if not sprite_id:
            return Message(MessageType.ERROR, {'error': 'Sprite ID is required'})

        # Get session_id for database persistence
        session_id = self._get_session_id(msg)

        result = await self.actions.delete_sprite(table_id=table_id, sprite_id=sprite_id, session_id=session_id)
        if result.success:
            # Broadcast sprite deletion to all other clients in the session
            remove_message = Message(MessageType.SPRITE_REMOVE, {
                'sprite_id': sprite_id,
                'operation': 'remove',
                'table_id': table_id
            })
            await self.broadcast_to_session(remove_message, client_id)

            return Message(MessageType.SPRITE_RESPONSE, {
                'sprite_id': sprite_id,
                'operation': 'remove',
                'success': True
            })
        else:
            return Message(MessageType.ERROR, {'error': f'Failed to delete sprite: {result.message}'})

    async def handle_move_sprite(self, msg: Message, client_id: str) -> Message:
        """Handle move sprite request"""
        logger.debug(f"Move sprite request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in move sprite request'})

        table_id = msg.data.get('table_id', 'default')
        sprite_id = msg.data.get('sprite_id')
        from_pos = msg.data.get('from')
        to_pos = msg.data.get('to')
        action_id = msg.data.get('action_id')  # For confirmation tracking

        if not sprite_id or not from_pos or not to_pos:
            return Message(MessageType.ERROR, {'error': 'Sprite ID, from position, and to position are required'})

        # Role and ownership check
        role = self._get_client_role(client_id)
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Spectators cannot move sprites'})
        if not is_dm(role):
            user_id_check = self._get_user_id(msg, client_id)
            if not await self._can_control_sprite(sprite_id, user_id_check):
                return Message(MessageType.ERROR, {'error': 'You do not control this sprite'})

        # Movement validation (server-authoritative)
        table = self.table_manager.tables_id.get(table_id) or self.table_manager.tables.get(table_id)
        if table is not None:
            try:
                from core_table.session_rules import SessionRules
                from database.crud import get_game_mode, get_session_rules_json
                session_code = self._get_session_code()
                rules = None
                game_mode = 'free_roam'
                if session_code:
                    cached = self._rules_cache.get(session_code)
                    if cached:
                        rules, game_mode = cached
                    else:
                        db = SessionLocal()
                        try:
                            rules_json = get_session_rules_json(db, session_code)
                            game_mode = get_game_mode(db, session_code)
                            if rules_json and rules_json != '{}':
                                rules_data = json.loads(rules_json)
                                rules_data.setdefault('session_id', session_code)
                                rules = SessionRules.from_dict(rules_data)
                        finally:
                            db.close()
                        if rules is not None:
                            self._rules_cache[session_code] = (rules, game_mode)

                if rules is None:
                    rules = SessionRules.defaults(session_code or 'default')

                # Normalise positions to pixel tuples
                def to_tuple(pos):
                    if isinstance(pos, dict):
                        return (float(pos.get('x', 0)), float(pos.get('y', 0)))
                    return (float(pos[0]), float(pos[1]))

                validator = MovementValidator(rules)
                combatant = None
                tier = getattr(rules, 'server_validation_tier', 'lightweight')

                if tier == 'trust_client':
                    mv_result = None  # skip collision, bounds already checked above
                elif tier == 'lightweight':
                    mv_result = validator.validate_lightweight(
                        entity_id=sprite_id,
                        from_pos=to_tuple(from_pos),
                        to_pos=to_tuple(to_pos),
                        table=table,
                        combatant=combatant,
                        client_path=msg.data.get('path'),
                    )
                else:
                    mv_result = validator.validate(
                        entity_id=sprite_id,
                        from_pos=to_tuple(from_pos),
                        to_pos=to_tuple(to_pos),
                        table=table,
                        combatant=combatant,
                        client_path=msg.data.get('path'),
                    )

                if mv_result is not None and not mv_result.valid:
                    reject = {'reason': mv_result.reason, 'sprite_id': sprite_id}
                    if action_id:
                        reject['action_id'] = action_id
                    return Message(MessageType.ACTION_REJECTED, reject)

                # Opportunity attack detection (fight mode only)
                if mv_result is not None and mv_result.valid and game_mode == 'fight':
                    from service.combat_engine import CombatEngine
                    combat_state = CombatEngine.get_state(self._get_session_code())
                    oa_triggers = validator.check_opportunity_attacks(
                        sprite_id, to_tuple(from_pos), table, combat_state,
                        to_pos=to_tuple(to_pos),
                    )
                    if oa_triggers:
                        key = f'{self._get_session_code()}:{sprite_id}'
                        self.__class__._pending_moves[key] = {
                            'from_pos': from_pos, 'to_pos': to_pos,
                            'path': msg.data.get('path', []),
                            'action_id': action_id,
                        }
                        warn = Message(MessageType.OPPORTUNITY_ATTACK_WARNING, {
                            'entity_id': sprite_id,
                            'triggers': oa_triggers,
                        })
                        await self.send_to_client(warn, client_id)
                        return warn
            except Exception as e:
                logger.warning(f"Movement validation error (non-fatal): {e}")

        # Get session_id for database persistence
        session_id = self._get_session_id(msg)

        # Use the existing move_sprite method from actions
        result = await self.actions.move_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            old_position=from_pos,
            new_position=to_pos,
            session_id=session_id
        )

        if result.success:
            response_data = {
                'sprite_id': sprite_id,
                'operation': 'move',
                'to': to_pos,
                'success': True
            }
            # Include action_id for confirmation if provided
            if action_id:
                response_data['action_id'] = action_id

            # Broadcast sprite move to all other clients in the session
            move_message = Message(MessageType.SPRITE_MOVE, {
                'sprite_id': sprite_id,
                'x': to_pos.get('x') if isinstance(to_pos, dict) else to_pos[0],
                'y': to_pos.get('y') if isinstance(to_pos, dict) else to_pos[1],
                'table_id': table_id
            })
            await self.broadcast_to_session(move_message, client_id)

            return Message(MessageType.SPRITE_RESPONSE, response_data)
        else:
            error_data = {'error': f'Failed to move sprite: {result.message}'}
            if action_id:
                error_data['action_id'] = action_id
            return Message(MessageType.ERROR, error_data)

    async def handle_scale_sprite(self, msg: Message, client_id: str) -> Message:
        """Handle scale sprite request"""
        logger.debug(f"Scale sprite request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in scale sprite request'})

        table_id = msg.data.get('table_id', 'default')
        sprite_id = msg.data.get('sprite_id')
        width = msg.data.get('width')
        height = msg.data.get('height')
        action_id = msg.data.get('action_id')

        if not sprite_id or width is None or height is None:
            return Message(MessageType.ERROR, {'error': 'Sprite ID, width, and height are required'})
        role = self._get_client_role(client_id)
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Spectators cannot modify sprites'})
        if not is_dm(role):
            if not await self._can_control_sprite(sprite_id, self._get_user_id(msg, client_id)):
                return Message(MessageType.ERROR, {'error': 'You do not control this sprite'})
        session_id = self._get_session_id(msg)
        result = await self.actions.update_sprite(table_id, sprite_id, session_id=session_id, width=width, height=height)

        if result.success:
            response_data = {
                'sprite_id': sprite_id,
                'operation': 'resize',
                'width': width,
                'height': height,
                'success': True
            }
            if action_id:
                response_data['action_id'] = action_id

            await self.broadcast_to_session(
                Message(MessageType.SPRITE_SCALE, {'sprite_id': sprite_id, 'width': width, 'height': height, 'table_id': table_id}),
                client_id
            )
            return Message(MessageType.SPRITE_RESPONSE, response_data)
        else:
            error_data = {'error': f'Failed to resize sprite: {result.message}'}
            if action_id:
                error_data['action_id'] = action_id
            return Message(MessageType.ERROR, error_data)

    async def handle_rotate_sprite(self, msg: Message, client_id: str) -> Message:
        """Handle rotate sprite request"""
        logger.debug(f"Rotate sprite request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in rotate sprite request'})

        table_id = msg.data.get('table_id', 'default')
        sprite_id = msg.data.get('sprite_id')
        rotation = msg.data.get('rotation')
        action_id = msg.data.get('action_id')  # For confirmation tracking

        if not sprite_id or rotation is None:
            return Message(MessageType.ERROR, {'error': 'Sprite ID and rotation are required'})
        role = self._get_client_role(client_id)
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Spectators cannot modify sprites'})
        if not is_dm(role):
            if not await self._can_control_sprite(sprite_id, self._get_user_id(msg, client_id)):
                return Message(MessageType.ERROR, {'error': 'You do not control this sprite'})
        session_id = self._get_session_id(msg)
        result = await self.actions.rotate_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            angle=rotation,
            session_id=session_id
        )
        if result.success:
            response_data = {
                'sprite_id': sprite_id,
                'operation': 'rotate',
                'rotation': rotation,
                'success': True
            }
            # Include action_id for confirmation if provided
            if action_id:
                response_data['action_id'] = action_id

            await self.broadcast_to_session(
                Message(MessageType.SPRITE_ROTATE, {
                    'sprite_id': sprite_id,
                    'rotation': rotation,
                    'table_id': table_id
                }),
                client_id
            )

            return Message(MessageType.SPRITE_RESPONSE, response_data)
        else:
            error_data = {'error': f'Failed to rotate sprite: {result.message}'}
            if action_id:
                error_data['action_id'] = action_id
            return Message(MessageType.ERROR, error_data)

    async def handle_sprite_drag_preview(self, msg: Message, client_id: str) -> None:
        """Broadcast live drag position — no DB write, no confirmation."""
        data = msg.data
        if not data:
            return
        sprite_id = data.get('id') or data.get('sprite_id')
        x, y = data.get('x'), data.get('y')
        if not sprite_id or x is None or y is None:
            return
        role = self._get_client_role(client_id)
        if not is_dm(role):
            user_id = self._get_user_id(msg, client_id)
            if not await self._can_control_sprite(sprite_id, user_id):
                return  # silently drop — player doesn't own this sprite
        await self.broadcast_to_session(
            Message(MessageType.SPRITE_DRAG_PREVIEW, {'id': sprite_id, 'x': x, 'y': y}),
            client_id
        )

    async def handle_sprite_resize_preview(self, msg: Message, client_id: str) -> None:
        """Broadcast live resize preview — no DB write, no confirmation."""
        data = msg.data
        if not data:
            return
        sprite_id = data.get('id') or data.get('sprite_id')
        width, height = data.get('width'), data.get('height')
        if not sprite_id or width is None or height is None:
            return
        role = self._get_client_role(client_id)
        if not is_dm(role):
            user_id = self._get_user_id(msg, client_id)
            if not await self._can_control_sprite(sprite_id, user_id):
                return
        await self.broadcast_to_session(
            Message(MessageType.SPRITE_RESIZE_PREVIEW, {'id': sprite_id, 'width': width, 'height': height}),
            client_id
        )

    async def handle_sprite_rotate_preview(self, msg: Message, client_id: str) -> None:
        """Broadcast live rotate preview — no DB write, no confirmation."""
        data = msg.data
        if not data:
            return
        sprite_id = data.get('id') or data.get('sprite_id')
        rotation = data.get('rotation')
        if not sprite_id or rotation is None:
            return
        role = self._get_client_role(client_id)
        if not is_dm(role):
            user_id = self._get_user_id(msg, client_id)
            if not await self._can_control_sprite(sprite_id, user_id):
                return
        await self.broadcast_to_session(
            Message(MessageType.SPRITE_ROTATE_PREVIEW, {'id': sprite_id, 'rotation': rotation}),
            client_id
        )

    async def handle_sprite_update(self, msg: Message, client_id: str) -> Message:
        """Handle sprite update message with character binding and token stats support"""
        logger.info(f"Handling sprite update from {client_id}: {msg}")
        if not msg.data:
            logger.error(f"No data provided in sprite update from {client_id}")
            return Message(MessageType.ERROR, {'error': 'No data provided in sprite update'})

        # Client sends flat structure: { sprite_id, table_id, character_id, hp, ... }
        # Legacy support for nested structure: { type: 'sprite_move', data: { ... } }
        type = msg.data.get('type')
        update_data = msg.data.get('data', {}) if type else msg.data

        # Extract sprite_id and table_id for permission checks
        sprite_id = update_data.get('sprite_id') or msg.data.get('sprite_id')
        table_id: str = update_data.get('table_id') or update_data.get('table_name') or 'default'

        if not sprite_id:
            return Message(MessageType.ERROR, {'error': 'Missing sprite_id'})

        # Permission validation — DMs can always update any sprite
        role = self._get_client_role(client_id)
        user_id = self._get_user_id(msg, client_id)
        if not is_dm(role) and not await self._can_control_sprite(sprite_id, user_id):
            logger.warning(f"User {user_id} attempted to update sprite {sprite_id} without permission")
            return Message(MessageType.ERROR, {'error': 'Permission denied: you cannot control this sprite'})

        # Handle legacy type-based updates
        if type:
            if not update_data or 'table_name' not in update_data or 'sprite_id' not in update_data:
                logger.error(f"Invalid sprite update data from {client_id}: {update_data}")
                return Message(MessageType.ERROR, {'error': 'Invalid sprite update data'})
            match type:
                case 'sprite_move':
                    if 'from' not in update_data or 'to' not in update_data:
                        logger.error(f"Missing 'from' or 'to' field in sprite move update from {client_id}: {update_data}")
                        return Message(MessageType.ERROR, {'error': 'Missing required fields: from, to'})

                    await self.actions.move_sprite(table_id=update_data['table_id'],
                                                   sprite_id=update_data['sprite_id'],
                                                   old_position=update_data['from'],
                                                   new_position=update_data['to'])
                case 'sprite_scale':
                    scale_x = float(update_data.get('scale_x', 1.0))
                    scale_y = float(update_data.get('scale_y', scale_x))
                    result = await self.actions.scale_sprite(
                        table_id=table_id, sprite_id=sprite_id,
                        scale_x=scale_x, scale_y=scale_y
                    )
                    if not result.success:
                        return Message(MessageType.ERROR, {'error': result.message})
                case 'sprite_rotate':
                    angle = float(update_data.get('angle', update_data.get('rotation', 0.0)))
                    result = await self.actions.rotate_sprite(
                        table_id=table_id, sprite_id=sprite_id, angle=angle
                    )
                    if not result.success:
                        return Message(MessageType.ERROR, {'error': result.message})

        # Extract character binding updates
        updates = {}
        if 'character_id' in update_data:
            updates['character_id'] = update_data['character_id']
        if 'controlled_by' in update_data:
            if not is_dm(role):
                logger.warning(f"Non-DM user {user_id} tried to change controlled_by — ignored")
            else:
                cb = update_data['controlled_by']
                # Normalize to list of ints for the in-memory entity
                if isinstance(cb, str):
                    try:
                        cb = json.loads(cb)
                    except Exception:
                        cb = []
                updates['controlled_by'] = [int(x) for x in cb if str(x).lstrip('-').isdigit()]

        # Extract token stat updates
        if 'hp' in update_data:
            updates['hp'] = update_data['hp']
        if 'max_hp' in update_data:
            updates['max_hp'] = update_data['max_hp']
        if 'ac' in update_data:
            updates['ac'] = update_data['ac']
        if 'aura_radius' in update_data:
            updates['aura_radius'] = update_data['aura_radius']
        if 'aura_color' in update_data:
            updates['aura_color'] = update_data['aura_color']
        if 'aura_radius_units' in update_data:
            updates['aura_radius_units'] = update_data['aura_radius_units']
        # Vision fields (DM-settable per token)
        if 'vision_radius' in update_data and is_dm(role):
            updates['vision_radius'] = update_data['vision_radius']
        if 'has_darkvision' in update_data and is_dm(role):
            val = update_data['has_darkvision']
            updates['has_darkvision'] = val if isinstance(val, bool) else bool(val)
        if 'darkvision_radius' in update_data and is_dm(role):
            updates['darkvision_radius'] = update_data['darkvision_radius']
        if 'vision_radius_units' in update_data and is_dm(role):
            updates['vision_radius_units'] = update_data['vision_radius_units']
        if 'darkvision_radius_units' in update_data and is_dm(role):
            updates['darkvision_radius_units'] = update_data['darkvision_radius_units']

        # Apply updates via actions
        if updates:
            session_id = self._get_session_id(msg)
            result = await self.actions.update_sprite(table_id, sprite_id, session_id=session_id, **updates)
            if not result.success:
                return Message(MessageType.ERROR, {'error': f'Failed to update sprite: {result.message}'})

            # Reverse sync: propagate token HP/AC changes back to the linked character
            char_stat_updates = {}
            if 'hp' in updates:
                char_stat_updates['hp'] = updates['hp']
            if 'max_hp' in updates:
                char_stat_updates['maxHp'] = updates['max_hp']
            if 'ac' in updates:
                char_stat_updates['ac'] = updates['ac']

            if char_stat_updates:
                character_id = update_data.get('character_id')
                if not character_id:
                    # Look it up from the DB entity
                    try:
                        from database.models import Entity as DBEntity
                        db = SessionLocal()
                        try:
                            entity_row = db.query(DBEntity).filter_by(id=sprite_id).first()
                            if entity_row:
                                character_id = entity_row.character_id
                        finally:
                            db.close()
                    except Exception as _e:
                        logger.debug(f"Could not look up character_id for sprite {sprite_id}: {_e}")

                if character_id and session_id:
                    # Only DMs bypass ownership; players must own the character
                    char_result = await self.actions.update_character(
                        session_id, character_id,
                        {'data': {'stats': char_stat_updates}},
                        user_id or 0,
                        expected_version=None,
                        bypass_owner_check=is_dm(role)
                    )
                    if char_result.success:
                        await self.broadcast_to_session(
                            Message(MessageType.CHARACTER_UPDATE_RESPONSE, {
                                'character_id': character_id,
                                'updates': {'data': {'stats': char_stat_updates}},
                                'source': 'token_sync'
                            }), client_id
                        )
                    else:
                        logger.warning(f"Token→character sync failed for {character_id}: {char_result.message}")

        # Only broadcast if there were actual field changes
        if updates:
            broadcast_msg = Message(MessageType.SPRITE_UPDATE, {
                'sprite_id': sprite_id,
                'table_id': table_id,
                'updates': updates,
                'operation': 'update'
            })
            await self.broadcast_to_session(broadcast_msg, client_id)

        response = Message(MessageType.SUCCESS, {
            'table_id': table_id,
            'sprite_id': sprite_id,
            'message': 'Sprite updated successfully'
        })
        return response

    async def handle_compendium_sprite_add(self, msg: Message, client_id: str) -> Message:
        """Create character + sprite from compendium monster data.

        Expected msg.data: {
            'table_id': str,
            'sprite_data': { x, y, layer, name, client_temp_id, ... },
            'monster_data': { name, type, challenge_rating, raw: {...} },  # optional
            'session_code': str (optional),
            'user_id': int (optional)
        }
        """
        logger.debug(f"Compendium sprite add received from {client_id}: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in compendium sprite add'})

        table_id = msg.data.get('table_id') or msg.data.get('table_name') or 'default'
        sprite_data = msg.data.get('sprite_data')
        monster_data = msg.data.get('monster_data')
        msg.data.get('session_code', msg.data.get('session', 'default'))
        user_id = self._get_user_id(msg, client_id) or 0

        role = self._get_client_role(client_id)
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Insufficient permissions'})

        if not sprite_data:
            return Message(MessageType.ERROR, {'error': 'No sprite_data provided for compendium add'})

        layer = sprite_data.get('layer', 'tokens') if isinstance(sprite_data, dict) else 'tokens'
        _dm_layers = {'dungeon_master', 'fog_of_war', 'light', 'height', 'obstacles', 'dm_notes'}
        if layer in _dm_layers and not is_dm(role):
            return Message(MessageType.ERROR, {'error': 'Only DMs can create sprites on this layer'})

        # --- Step 1: resolve monster token asset ---
        asset_id = sprite_data.get('asset_id') or ''
        if monster_data and not asset_id:
            try:
                from core_table.compendiums.token_resolution_service import get_token_service
                token_service = get_token_service()
                monster_name = monster_data.get('name', '')
                monster_type = monster_data.get('type') or monster_data.get('monsterType', '')
                token_info = token_service.get_token_info(monster_name, monster_type)
                if token_info.get('asset_id'):
                    asset_id = token_info['asset_id']
                    logger.info(f"Resolved token for '{monster_name}': {asset_id}")
            except Exception as e:
                logger.warning(f"Token resolution failed: {e}")

        # --- Step 2: create NPC character from monster data ---
        character_id = sprite_data.get('character_id') or ''
        if monster_data and not character_id:
            try:
                session_id = self._get_session_id(msg)
                if session_id:
                    raw = monster_data.get('raw') or {}
                    char_data = {
                        'name': monster_data.get('name', 'Unknown'),
                        'type': 'npc',
                        'monster_type': monster_data.get('type') or monster_data.get('monsterType', ''),
                        'challenge_rating': monster_data.get('challenge_rating', ''),
                        'npc': True,
                        **raw  # merge all raw monster stats into character data
                    }
                    char_result = await self.actions.save_character(session_id, char_data, user_id)
                    if char_result.success:
                        character_id = char_result.data.get('character_id', '')
                        logger.info(f"Created NPC character '{char_data['name']}': {character_id}")
                    else:
                        logger.warning(f"Character creation failed: {char_result.message}")
            except Exception as e:
                logger.warning(f"Character creation error: {e}")

        # --- Step 3: build sprite and create it ---
        sprite_data_with_table = dict(sprite_data)
        sprite_data_with_table['table_id'] = table_id
        if asset_id:
            sprite_data_with_table['asset_id'] = asset_id
        if character_id:
            sprite_data_with_table['character_id'] = str(character_id)

        if is_dm(role):
            sprite_data_with_table['controlled_by'] = json.dumps([])
        elif user_id:
            sprite_data_with_table['controlled_by'] = json.dumps([user_id])

        try:
            result = await self.actions.create_sprite_from_data(sprite_data_with_table)
            if not result.success:
                logger.error(f"Failed to create compendium sprite: {result.message}")
                return Message(MessageType.ERROR, {'error': f'Failed to create sprite: {result.message}'})

            created_sprite = (result.data or {}).get('sprite_data') or sprite_data_with_table

            # Broadcast to all other clients
            broadcast_data = {
                'sprite_id': created_sprite.get('sprite_id', created_sprite.get('entity_id')),
                'table_id': table_id,
                'sprite_data': created_sprite,
                'operation': 'create',
                'client_temp_id': sprite_data.get('client_temp_id')
            }
            await self.broadcast_to_session(Message(MessageType.SPRITE_UPDATE, broadcast_data), client_id)

            return Message(MessageType.SPRITE_RESPONSE, {
                'sprite_id': created_sprite.get('sprite_id', created_sprite.get('entity_id')),
                'table_id': table_id,
                'sprite_data': created_sprite,
                'character_id': character_id or None,
                'client_temp_id': sprite_data.get('client_temp_id'),
                'operation': 'create'
            })

        except Exception as e:
            logger.error(f"Error processing compendium sprite add: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_compendium_sprite_update(self, msg: Message, client_id: str) -> Message:
        # Minimal implementation: delegate to generic sprite update flow where possible
        logger.debug(f"Compendium sprite update received from {client_id}: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in compendium sprite update'})
        # For now, reuse existing update methods by wrapping into a table_update if appropriate
        try:
            # If caller provided full sprite data with table_id, use update_sprite
            sprite_data = msg.data.get('sprite_data')
            table_id = msg.data.get('table_id') or sprite_data.get('table_id') if sprite_data else 'default'
            sprite_id = (sprite_data or {}).get('sprite_id')
            if not sprite_id:
                return Message(MessageType.ERROR, {'error': 'sprite_id required for compendium sprite update'})
            result = await self.actions.update_sprite(table_id, sprite_id, data=sprite_data)
            if result.success:
                return Message(MessageType.SUCCESS, {'sprite_id': sprite_id})
            else:
                return Message(MessageType.ERROR, {'error': result.message})
        except Exception as e:
            logger.error(f"Error in compendium sprite update: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_compendium_sprite_remove(self, msg: Message, client_id: str) -> Message:
        logger.debug(f"Compendium sprite remove received from {client_id}: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in compendium sprite remove'})
        table_id = msg.data.get('table_id') or 'default'
        sprite_id = msg.data.get('sprite_id')
        if not sprite_id:
            return Message(MessageType.ERROR, {'error': 'sprite_id required to remove compendium sprite'})
        try:
            result = await self.actions.delete_sprite(table_id, sprite_id)
            if result.success:
                # Broadcast sprite deletion to all clients in session
                broadcast_data = {
                    'sprite_id': sprite_id,
                    'table_id': table_id,
                    'operation': 'delete'
                }
                await self.broadcast_to_session(Message(MessageType.SPRITE_UPDATE, broadcast_data), client_id)

                return Message(MessageType.SPRITE_RESPONSE, {'sprite_id': sprite_id, 'operation': 'delete', 'success': True})
            else:
                return Message(MessageType.ERROR, {'error': result.message})
        except Exception as e:
            logger.error(f"Error removing compendium sprite: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_sprite_request(self, msg: Message, client_id: str) -> Message:
        """Handle sprite data request"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})

            sprite_id = msg.data.get('sprite_id')
            table_id = msg.data.get('table_id')

            if not sprite_id or not table_id:
                return Message(MessageType.ERROR, {'error': 'sprite_id and table_id are required'})

            # Get sprite data from table manager
            table_data = self.table_manager.get_table(table_id)
            if not table_data:
                return Message(MessageType.ERROR, {'error': 'Table not found'})

            # Find sprite in table layers
            sprite_data = None
            for layer_sprites in table_data.layers.values():
                for sprite in layer_sprites:
                    if sprite.sprite_id == sprite_id:
                        sprite_data = sprite.to_dict()
                        break
                if sprite_data:
                    break

            if sprite_data:
                return Message(MessageType.SPRITE_DATA, {
                    'sprite_id': sprite_id,
                    'table_id': table_id,
                    'sprite_data': sprite_data
                })
            else:
                return Message(MessageType.ERROR, {'error': 'Sprite not found'})

        except Exception as e:
            logger.error(f"Error handling sprite request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
