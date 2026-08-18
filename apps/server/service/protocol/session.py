import json
from typing import Any, Optional

from core_table.game_mode import GameMode
from core_table.protocol import Message, MessageType
from database import crud, models, schemas
from database.database import SessionLocal
from database.models import GamePlayer, GameSession
from utils.blocking import run_blocking
from utils.logger import setup_logger
from utils.roles import is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


def _persist_layer_settings(
    *,
    table_id: str,
    session_id: int,
    layer: str,
    settings: dict[str, Any],
) -> str | None:
    db = None
    try:
        db = SessionLocal()
        table = db.query(models.VirtualTable).filter(
            models.VirtualTable.table_id == table_id,
            models.VirtualTable.session_id == session_id,
        ).first()
        if table is None:
            return "Table not found in this session"
        existing = json.loads(table.layer_settings or "{}")
        if not isinstance(existing, dict):
            return "Stored layer settings are invalid"
        existing[layer] = settings
        crud.update_virtual_table(
            db,
            table_id,
            schemas.VirtualTableUpdate(layer_settings=existing),
        )
        return None
    except Exception:
        logger.exception("Layer settings persistence failed")
        return "Layer settings could not be persisted"
    finally:
        if db is not None:
            db.close()


def _persist_game_mode(*, session_code: str, target_mode: str) -> str | None:
    db = None
    try:
        db = SessionLocal()
        if not crud.update_game_mode(db, session_code, target_mode):
            return "Session not found"
        return None
    except Exception:
        logger.exception("Game mode persistence failed")
        return "Game mode could not be persisted"
    finally:
        if db is not None:
            db.close()


def _persist_session_rules(*, session_code: str, rules_json: str) -> str | None:
    db = None
    try:
        db = SessionLocal()
        if not crud.update_session_rules_json(db, session_code, rules_json):
            return "Session not found"
        return None
    except Exception:
        logger.exception("Session rules persistence failed")
        return "Session rules update failed"
    finally:
        if db is not None:
            db.close()


def _load_session_rules(*, session_code: str) -> tuple[str, str]:
    db = None
    try:
        db = SessionLocal()
        return (
            crud.get_session_rules_json(db, session_code),
            crud.get_game_mode(db, session_code),
        )
    except Exception:
        logger.exception("Session rules load failed")
        return "{}", "free_roam"
    finally:
        if db is not None:
            db.close()


def _load_player_active_table(*, user_id: int, session_code: str) -> Optional[str]:
    db = None
    try:
        db = SessionLocal()
        player = db.query(GamePlayer).join(GameSession).filter(
            GamePlayer.user_id == user_id,
            GameSession.session_code == session_code,
        ).first()
        if player:
            logger.debug(
                "Found GamePlayer %s with active_table_id: %s",
                player.id,
                player.active_table_id,
            )
        else:
            logger.debug(
                "No GamePlayer found for user %s in session %s",
                user_id,
                session_code,
            )
        return player.active_table_id if player else None
    except Exception:
        logger.exception(
            "Error getting player active table for user %s in session %s",
            user_id,
            session_code,
        )
        return None
    finally:
        if db is not None:
            db.close()


def _persist_player_active_table(
    *,
    user_id: int,
    session_code: str,
    table_id: Optional[str],
) -> bool:
    db = None
    try:
        db = SessionLocal()
        player = db.query(GamePlayer).join(GameSession).filter(
            GamePlayer.user_id == user_id,
            GameSession.session_code == session_code,
        ).first()
        if player is None:
            logger.warning(
                "No GamePlayer found for user %s in session %s",
                user_id,
                session_code,
            )
            return False
        old_table_id = player.active_table_id
        player.active_table_id = table_id
        db.commit()
        logger.info(
            "Updated active table for user %s in session %s: %s -> %s",
            user_id,
            session_code,
            old_table_id,
            table_id,
        )
        return True
    except Exception:
        logger.exception(
            "Error setting player active table for user %s in session %s",
            user_id,
            session_code,
        )
        return False
    finally:
        if db is not None:
            db.close()


class _SessionMixin(_ProtocolBase):
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
        if not isinstance(table_id, str) or not table_id or len(table_id) > 36:
            return Message(MessageType.ERROR, {'error': 'table_id and layer are required'})
        if not isinstance(layer, str) or not layer or len(layer) > 64:
            return Message(MessageType.ERROR, {'error': 'table_id and layer are required'})
        if not isinstance(settings, dict):
            return Message(MessageType.ERROR, {'error': 'settings must be an object'})
        session_id = self._get_session_id(msg)
        if session_id is None:
            return Message(MessageType.ERROR, {'error': 'Authenticated session context is required'})
        error = await run_blocking(
            _persist_layer_settings,
            table_id=table_id,
            session_id=session_id,
            layer=layer,
            settings=settings,
        )
        if error:
            return Message(MessageType.ERROR, {'error': error})

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
            # raises ValueError if invalid
            GameMode(target_mode)
        except ValueError:
            return Message(MessageType.ERROR, {'error': f'Invalid game mode: {target_mode}'})

        session_code = self._get_session_code()
        if not session_code:
            return Message(MessageType.ERROR, {'error': 'Authenticated session context is required'})
        error = await run_blocking(
            _persist_game_mode,
            session_code=session_code,
            target_mode=target_mode,
        )
        if error:
            return Message(MessageType.ERROR, {'error': error})

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
            from core_table.session_rules import SessionRules
            session_code = self._get_session_code() or "unknown"
            authoritative_rules = {**rules_data, 'session_id': session_code}
            rules = SessionRules.from_dict(authoritative_rules)
            errors = rules.validate()
            if errors:
                return Message(MessageType.ERROR, {'error': '; '.join(errors)})

            rules_json = json.dumps(rules.to_dict())
            error = await run_blocking(
                _persist_session_rules,
                session_code=session_code,
                rules_json=rules_json,
            )
            if error:
                return Message(MessageType.ERROR, {'error': error})

            # Invalidate per-session rules cache
            self._rules_cache.pop(session_code, None)

            response = Message(MessageType.SESSION_RULES_CHANGED, {'rules': rules.to_dict()})
            await self.broadcast_to_session(response, client_id)
            return response
        except Exception:
            logger.exception("Session rules update failed")
            return Message(MessageType.ERROR, {"error": "Session rules update failed"})

    async def handle_session_rules_request(self, msg: Message, client_id: str) -> Message:
        """Client requests current session rules.  Sends directly back."""
        session_code = self._get_session_code()
        rules_json, game_mode = ('{}', 'free_roam')
        if session_code:
            rules_json, game_mode = await run_blocking(
                _load_session_rules,
                session_code=session_code,
            )
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
        logger.debug(
            "Looking up active table for user %s in session %s",
            user_id,
            session_code,
        )
        return await run_blocking(
            _load_player_active_table,
            user_id=user_id,
            session_code=session_code,
        )

    async def _set_player_active_table(self, user_id: int, session_code: str, table_id: Optional[str]) -> bool:
        """Set player's active table ID in database"""
        logger.debug(
            "Setting active table for user %s in session %s to %s",
            user_id,
            session_code,
            table_id,
        )
        return await run_blocking(
            _persist_player_active_table,
            user_id=user_id,
            session_code=session_code,
            table_id=table_id,
        )
