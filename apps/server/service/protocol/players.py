import time

from core_table.protocol import Message, MessageType
from utils.logger import setup_logger
from utils.roles import is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _PlayersMixin(_ProtocolBase):
    """Handler methods for players domain."""

    async def handle_player_list_request(self, msg: Message, client_id: str) -> Message:
        """Handle player list request"""
        logger.debug(f"Player list request received from {client_id}: {msg}")

        try:
            # Get session_code from message data
            session_code = msg.data.get('session_code') if msg.data else None

            # Get player list from session manager (this will be set by GameSessionProtocolService)
            if hasattr(self, 'session_manager') and self.session_manager:
                # GameSessionProtocolService.get_session_players() doesn't need session_code parameter
                # because it already knows which session it's managing
                players = self.session_manager.get_session_players()
                return Message(MessageType.PLAYER_LIST_RESPONSE, {
                    'players': players,
                    'count': len(players),
                    'session_code': session_code
                })
            else:
                # Fallback - return empty list if no session manager
                return Message(MessageType.PLAYER_LIST_RESPONSE, {
                    'players': [],
                    'count': 0,
                    'session_code': session_code,
                    'error': 'Session manager not available'
                })
        except Exception as e:
            logger.error(f"Error handling player list request: {e}")
            return Message(MessageType.ERROR, {'error': 'Failed to get player list'})

    async def handle_player_kick_request(self, msg: Message, client_id: str) -> Message:
        """Handle player kick request"""
        logger.debug(f"Player kick request received from {client_id}: {msg}")

        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided in kick request'})

            target_player_id = msg.data.get('player_id')
            target_username = msg.data.get('username')
            reason = msg.data.get('reason', 'No reason provided')
            session_code = msg.data.get('session_code')

            if not target_player_id and not target_username:
                return Message(MessageType.ERROR, {'error': 'Player ID or username is required'})

            # Check if requesting client has kick permissions
            requesting_client_info = self._get_client_info(client_id)
            if not self._has_kick_permission(requesting_client_info):
                return Message(MessageType.ERROR, {'error': 'Insufficient permissions to kick players'})

            # Perform kick through session manager
            if hasattr(self, 'session_manager') and self.session_manager:
                success = await self.session_manager.kick_player(
                    session_code, target_player_id, target_username, reason, client_id
                )

                if success:
                    return Message(MessageType.PLAYER_KICK_RESPONSE, {
                        'success': True,
                        'kicked_player': target_username or target_player_id,
                        'reason': reason,
                        'kicked_by': requesting_client_info.get('username', 'unknown')
                    })
                else:
                    return Message(MessageType.ERROR, {'error': 'Failed to kick player'})
            else:
                return Message(MessageType.ERROR, {'error': 'Session manager not available'})

        except Exception as e:
            logger.error(f"Error handling player kick request: {e}")
            return Message(MessageType.ERROR, {'error': 'Failed to kick player'})

    async def handle_player_ban_request(self, msg: Message, client_id: str) -> Message:
        """Handle player ban request"""
        logger.debug(f"Player ban request received from {client_id}: {msg}")

        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided in ban request'})

            target_player_id = msg.data.get('player_id')
            target_username = msg.data.get('username')
            reason = msg.data.get('reason', 'No reason provided')
            session_code = msg.data.get('session_code')
            duration = msg.data.get('duration', 'permanent')  # Duration in minutes or 'permanent'

            if not target_player_id and not target_username:
                return Message(MessageType.ERROR, {'error': 'Player ID or username is required'})

            # Check if requesting client has ban permissions
            requesting_client_info = self._get_client_info(client_id)
            if not self._has_ban_permission(requesting_client_info):
                return Message(MessageType.ERROR, {'error': 'Insufficient permissions to ban players'})

            # Perform ban through session manager
            if hasattr(self, 'session_manager') and self.session_manager:
                success = await self.session_manager.ban_player(
                    session_code, target_player_id, target_username, reason, duration, client_id
                )

                if success:
                    return Message(MessageType.PLAYER_BAN_RESPONSE, {
                        'success': True,
                        'banned_player': target_username or target_player_id,
                        'reason': reason,
                        'duration': duration,
                        'banned_by': requesting_client_info.get('username', 'unknown')
                    })
                else:
                    return Message(MessageType.ERROR, {'error': 'Failed to ban player'})
            else:
                return Message(MessageType.ERROR, {'error': 'Session manager not available'})

        except Exception as e:
            logger.error(f"Error handling player ban request: {e}")
            return Message(MessageType.ERROR, {'error': 'Failed to ban player'})

    async def handle_connection_status_request(self, msg: Message, client_id: str) -> Message:
        """Handle connection status request"""
        logger.debug(f"Connection status request received from {client_id}: {msg}")

        try:
            session_code = msg.data.get('session_code') if msg.data else None

            # Get connection status from session manager
            if hasattr(self, 'session_manager') and self.session_manager:
                status = self.session_manager.get_connection_status(session_code, client_id)
                return Message(MessageType.CONNECTION_STATUS_RESPONSE, {
                    'connected': True,
                    'session_code': session_code,
                    'client_id': client_id,
                    'status': status
                })
            else:
                return Message(MessageType.CONNECTION_STATUS_RESPONSE, {
                    'connected': False,
                    'session_code': session_code,
                    'client_id': client_id,
                    'error': 'Session manager not available'
                })

        except Exception as e:
            logger.error(f"Error handling connection status request: {e}")
            return Message(MessageType.ERROR, {'error': 'Failed to get connection status'})

    def _get_client_info(self, client_id: str) -> dict:
        """Get client info dict from session manager."""
        if self.session_manager and hasattr(self.session_manager, 'client_info'):
            return self.session_manager.client_info.get(client_id, {})
        return {}

    def _get_client_role(self, client_id: str) -> str:
        """Get the RBAC role for a connected client."""
        return self._get_client_info(client_id).get('role', 'player')

    def _has_kick_permission(self, client_info: dict) -> bool:
        return is_dm(client_info.get('role', 'player'))

    def _has_ban_permission(self, client_info: dict) -> bool:
        return is_dm(client_info.get('role', 'player'))

    async def handle_player_action(self, msg: Message, client_id: str) -> Message:
        """Handle generic player action"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})

            action_type = msg.data.get('action_type')
            action_data = msg.data.get('action_data', {})

            # Broadcast player action to other clients
            await self.broadcast_to_session(Message(MessageType.PLAYER_ACTION_UPDATE, {
                'client_id': client_id,
                'action_type': action_type,
                'action_data': action_data,
                'timestamp': time.time()
            }), client_id)

            return Message(MessageType.PLAYER_ACTION_RESPONSE, {
                'success': True,
                'action_type': action_type
            })

        except Exception as e:
            logger.error(f"Error handling player action: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_player_ready(self, msg: Message, client_id: str) -> Message:
        """Handle player ready status"""
        try:
            # Update player ready status
            if client_id not in self.clients:
                self.clients[client_id] = {}

            self.clients[client_id]['ready'] = True
            self.clients[client_id]['last_action'] = time.time()

            # Broadcast to other clients
            await self.broadcast_to_session(Message(MessageType.PLAYER_STATUS, {
                'client_id': client_id,
                'status': 'ready',
                'timestamp': time.time()
            }), client_id)

            return Message(MessageType.SUCCESS, {'message': 'Player marked as ready'})

        except Exception as e:
            logger.error(f"Error handling player ready: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_player_unready(self, msg: Message, client_id: str) -> Message:
        """Handle player unready status"""
        try:
            # Update player ready status
            if client_id not in self.clients:
                self.clients[client_id] = {}

            self.clients[client_id]['ready'] = False
            self.clients[client_id]['last_action'] = time.time()

            # Broadcast to other clients
            await self.broadcast_to_session(Message(MessageType.PLAYER_STATUS, {
                'client_id': client_id,
                'status': 'unready',
                'timestamp': time.time()
            }), client_id)

            return Message(MessageType.SUCCESS, {'message': 'Player marked as unready'})

        except Exception as e:
            logger.error(f"Error handling player unready: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_player_status(self, msg: Message, client_id: str) -> Message:
        """Handle player status request"""
        try:
            if not msg.data:
                target_client = client_id
            else:
                target_client = msg.data.get('client_id', client_id)

            if target_client in self.clients:
                status = self.clients[target_client]
                return Message(MessageType.PLAYER_STATUS, {
                    'client_id': target_client,
                    'status': status
                })
            else:
                return Message(MessageType.ERROR, {'error': 'Client not found'})

        except Exception as e:
            logger.error(f"Error handling player status: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_file_data(self, msg: Message, client_id: str) -> Message:
        """Handle file data transfer"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})

            file_id = msg.data.get('file_id')
            chunk_data = msg.data.get('chunk_data')
            chunk_index = msg.data.get('chunk_index', 0)
            total_chunks = msg.data.get('total_chunks', 1)

            if not file_id or not chunk_data:
                return Message(MessageType.ERROR, {'error': 'file_id and chunk_data are required'})

            # Chunked upload storage is not implemented — acknowledge receipt only
            logger.info(f"Received file chunk {chunk_index + 1}/{total_chunks} for file {file_id} (not stored)")
            return Message(MessageType.SUCCESS, {
                'message': f'File chunk {chunk_index + 1}/{total_chunks} received',
                'file_id': file_id
            })

        except Exception as e:
            logger.error(f"Error handling file data: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
