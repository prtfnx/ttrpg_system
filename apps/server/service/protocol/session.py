from typing import TYPE_CHECKING, Optional

from core_table.protocol import Message, MessageType
from database.database import SessionLocal
from database.models import GamePlayer, GameSession
from utils.logger import setup_logger
from utils.roles import is_dm

if TYPE_CHECKING:
    pass

logger = setup_logger(__name__)


class _SessionMixin:
    """Handler methods for session domain."""

    async def handle_layer_settings_update(self, msg: Message, client_id: str) -> Message:
        """DM updates per-layer settings (opacity, tint_color, inactive_opacity, visible).
        Saves to DB and broadcasts to all clients in the session."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can change layer settings'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id = msg.data.get('table_id')
        layer    = msg.data.get('layer')
        settings = msg.data.get('settings', {})
        if not table_id or not layer:
            return Message(MessageType.ERROR, {'error': 'table_id and layer are required'})

        session_id = self._get_session_id(msg)
        if session_id:
            try:
                import json as _json

                from database import crud, schemas
                from database.database import SessionLocal
                db = SessionLocal()
                try:
                    db_table = crud.get_virtual_table_by_id(db, table_id)
                    if db_table:
                        existing = _json.loads(db_table.layer_settings or '{}')
                        existing[layer] = settings
                        update = schemas.VirtualTableUpdate(layer_settings=existing)
                        crud.update_virtual_table(db, table_id, update)
                finally:
                    db.close()
            except Exception as e:
                logger.error(f"handle_layer_settings_update DB error: {e}")

        broadcast_payload = {'table_id': table_id, 'layer': layer, 'settings': settings}
        await self.broadcast_to_session(
            Message(MessageType.LAYER_SETTINGS_UPDATE, broadcast_payload),
            client_id,
        )
        return Message(MessageType.LAYER_SETTINGS_UPDATE, broadcast_payload)

    async def handle_game_mode_change(self, msg: Message, client_id: str) -> Message:
        """DM changes game mode.  Validates the value, persists, broadcasts."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can change game mode'})

        target_mode = (msg.data or {}).get('game_mode')
        if not target_mode:
            return Message(MessageType.ERROR, {'error': 'game_mode is required'})

        try:
            from core_table.game_mode import GameMode
            # We don't keep FSM state in memory yet — just validate the value and persist
            GameMode(target_mode)  # raises ValueError if invalid
        except ValueError:
            return Message(MessageType.ERROR, {'error': f'Invalid game mode: {target_mode}'})

        session_code = self._get_session_code()
        if session_code:
            try:
                from database.crud import update_game_mode
                from database.database import SessionLocal
                db = SessionLocal()
                try:
                    update_game_mode(db, session_code, target_mode)
                finally:
                    db.close()
            except Exception as e:
                logger.error(f"Failed to persist game mode: {e}")

        response = Message(MessageType.GAME_MODE_STATE, {'game_mode': target_mode})
        await self.broadcast_to_session(response, client_id)
        return response

    async def handle_session_rules_update(self, msg: Message, client_id: str) -> Message:
        """DM updates session rules.  Validates, persists, broadcasts."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can update session rules'})

        rules_data = (msg.data or {}).get('rules', {})
        if not rules_data:
            return Message(MessageType.ERROR, {'error': 'rules payload is required'})

        try:
            import json

            from core_table.session_rules import SessionRules
            session_code = self._get_session_code() or "unknown"
            rules_data['session_id'] = session_code
            rules = SessionRules.from_dict(rules_data)
            errors = rules.validate()
            if errors:
                return Message(MessageType.ERROR, {'error': '; '.join(errors)})

            rules_json = json.dumps(rules.to_dict())
            from database.crud import update_session_rules_json
            from database.database import SessionLocal
            db = SessionLocal()
            try:
                update_session_rules_json(db, session_code, rules_json)
            finally:
                db.close()

            # Invalidate per-session rules cache
            self._rules_cache.pop(session_code, None)

            response = Message(MessageType.SESSION_RULES_CHANGED, {'rules': rules.to_dict()})
            await self.broadcast_to_session(response, client_id)
            return response
        except Exception as e:
            logger.error(f"handle_session_rules_update error: {e}")
            return Message(MessageType.ERROR, {'error': str(e)})

    async def handle_session_rules_request(self, msg: Message, client_id: str) -> Message:
        """Client requests current session rules.  Sends directly back."""
        session_code = self._get_session_code()
        rules_json = '{}'
        game_mode = 'free_roam'
        if session_code:
            try:
                import json

                from database.crud import get_game_mode, get_session_rules_json
                from database.database import SessionLocal
                db = SessionLocal()
                try:
                    rules_json = get_session_rules_json(db, session_code)
                    game_mode = get_game_mode(db, session_code)
                finally:
                    db.close()
            except Exception as e:
                logger.error(f"Failed to load session rules: {e}")
                game_mode = 'free_roam'

        import json
        try:
            rules_dict = json.loads(rules_json)
        except Exception:
            rules_dict = {}

        response = Message(MessageType.SESSION_RULES_CHANGED, {
            'rules': rules_dict,
            'mode': game_mode,
        })
        # Send only to requesting client (exclude no one, but broadcast just to sender)
        await self.send_to_client(response, client_id)
        return response

    async def _get_player_active_table(self, user_id: int, session_code: str) -> Optional[str]:
        """Get player's active table ID from database"""
        try:
            logger.debug(f"Looking up active table for user {user_id} in session {session_code}")
            db_session = SessionLocal()
            try:
                # Find the GamePlayer for this user in this session
                player = db_session.query(GamePlayer).join(GameSession).filter(
                    GamePlayer.user_id == user_id,
                    GameSession.session_code == session_code
                ).first()

                if player:
                    logger.debug(f"Found GamePlayer {player.id} with active_table_id: {player.active_table_id}")
                else:
                    logger.debug(f"No GamePlayer found for user {user_id} in session {session_code}")

                return player.active_table_id if player else None

            finally:
                db_session.close()

        except Exception as e:
            logger.error(f"Error getting player active table for user {user_id} in session {session_code}: {e}")
            return None

    async def _set_player_active_table(self, user_id: int, session_code: str, table_id: Optional[str]) -> bool:
        """Set player's active table ID in database"""
        try:
            logger.debug(f"Setting active table for user {user_id} in session {session_code} to {table_id}")
            db_session = SessionLocal()
            try:
                # Find the GamePlayer for this user in this session
                player = db_session.query(GamePlayer).join(GameSession).filter(
                    GamePlayer.user_id == user_id,
                    GameSession.session_code == session_code
                ).first()

                if player:
                    old_table_id = player.active_table_id
                    player.active_table_id = table_id
                    db_session.commit()
                    logger.info(f"Updated active table for user {user_id} in session {session_code}: {old_table_id} -> {table_id}")
                    return True
                else:
                    logger.warning(f"No GamePlayer found for user {user_id} in session {session_code}")
                    return False

            finally:
                db_session.close()

        except Exception as e:
            logger.error(f"Error setting player active table for user {user_id} in session {session_code}: {e}")
            return False
