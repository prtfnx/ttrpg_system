from typing import Optional

from core_table.protocol import Message, MessageType
from database.database import SessionLocal
from database.models import Asset, GamePlayer, GameSession, SessionAsset
from service.asset_manager import AssetRequest, get_server_asset_manager
from utils.audit import audit_event
from utils.logger import setup_logger

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _AssetsMixin(_ProtocolBase):
    """Handler methods for assets domain."""

    async def handle_file_request(self, msg: Message, client_id: str) -> Message:
        logger.info(f"handle_file_request called by {client_id} — direct file transfer not supported, use asset upload API")
        return Message(MessageType.ERROR, {'error': 'Direct file transfer not supported. Use the asset upload endpoint.'})

    async def handle_asset_upload_request(self, msg: Message, client_id: str) -> Message:
        """Handle asset upload request - generate presigned PUT URL with xxHash support"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided in asset upload request'})

            # Get asset manager and client info
            asset_manager = get_server_asset_manager()

            # Extract request data - including xxHash
            filename = msg.data.get('filename')
            file_size = msg.data.get('file_size')
            content_type = msg.data.get('content_type')
            session_code = msg.data.get('session_code', 'default')
            user_id = self._get_user_id(msg, client_id) or 0
            username = msg.data.get('username', 'unknown')
            asset_id = msg.data.get('asset_id')  # Client-generated based on xxHash
            file_xxhash = msg.data.get('xxhash')  # xxHash from client

            if not filename or not file_xxhash:
                return Message(MessageType.ERROR, {'error': 'Filename and xxHash are required'})

            # Create asset request with xxHash
            request = AssetRequest(
                user_id=user_id,
                username=username,
                session_code=session_code,
                asset_id=asset_id,
                filename=filename,
                file_size=file_size,
                content_type=content_type,
                file_xxhash=file_xxhash
            )

            # Generate presigned URL with xxHash
            response = await asset_manager.request_upload_url_with_hash(request, file_xxhash)

            if response.success:
                return Message(MessageType.ASSET_UPLOAD_RESPONSE, {
                    'success': True,
                    'upload_url': response.url,
                    'presigned_url': response.url,
                    'asset_id': response.asset_id,
                    'expires_in': response.expires_in,
                    'instructions': response.instructions,
                    'required_xxhash': response.required_xxhash
                })
            else:
                return Message(MessageType.ASSET_UPLOAD_RESPONSE, {
                    'success': False,
                    'error': response.error,
                    'asset_id': response.asset_id,
                    'instructions': response.instructions
                })

        except Exception as e:
            logger.error(f"Error handling asset upload request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_asset_download_request(self, msg: Message, client_id: str) -> Message:
        """Handle asset download request - generate presigned GET URL with xxHash info"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided in asset download request'})

            # Get asset manager
            asset_manager = get_server_asset_manager()

            # Extract request data
            asset_id = msg.data.get('asset_id')
            session_code = msg.data.get('session_code', 'default')
            user_id = self._get_user_id(msg, client_id) or 0
            username = msg.data.get('username', 'unknown')

            if not asset_id:
                return Message(MessageType.ERROR, {'error': 'Asset ID is required'})

            # Create asset request
            request = AssetRequest(
                user_id=user_id,
                username=username,
                session_code=session_code,
                asset_id=asset_id
            )

            # Generate presigned URL
            response = await asset_manager.request_download_url(request)

            if response.success:
                # Get asset xxHash from database
                asset_xxhash = await self._get_asset_xxhash(asset_id, session_code, user_id)

                return Message(MessageType.ASSET_DOWNLOAD_RESPONSE, {
                    'success': True,
                    'download_url': response.url,
                    'asset_id': response.asset_id,
                    'expires_in': response.expires_in,
                    'xxhash': asset_xxhash,  # Include xxHash for verification
                    'instructions': response.instructions
                })
            else:
                return Message(MessageType.ASSET_DOWNLOAD_RESPONSE, {
                    'success': False,
                    'instructions': "Please upload the asset first"
                })

        except Exception as e:
            logger.error(f"Error handling asset download request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_asset_list_request(self, msg: Message, client_id: str) -> Message:
        """Handle asset list request - return session-visible asset metadata."""
        logger.debug(f"Handling asset list request from {client_id}: {msg}")
        try:
            session_code = (msg.data or {}).get('session_code') or self._get_session_code(msg)
            if not session_code:
                return Message(MessageType.ERROR, {'error': 'Session code is required'})

            user_id = self._get_user_id(msg, client_id)
            if user_id is None:
                return Message(MessageType.ERROR, {'error': 'Authentication required'})

            assets = get_server_asset_manager().get_session_assets(session_code, user_id)
            return Message(MessageType.ASSET_LIST_RESPONSE, {
                'success': True,
                'assets': assets,
                'count': len(assets)
            })
        except Exception as e:
            logger.error(f"Error handling asset list request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_asset_upload_confirm(self, msg: Message, client_id: str) -> Message:
        """Handle asset upload confirmation - verify and update database"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided in asset upload confirmation'})

            # Extract data
            asset_id = msg.data.get('asset_id')
            upload_success = msg.data.get('success', True)
            error_message = msg.data.get('error')
            user_id = self._get_user_id(msg, client_id) or 0
            msg.data.get('username', 'unknown')

            if not asset_id:
                return Message(MessageType.ERROR, {'error': 'Asset ID is required'})

            logger.info(f"Processing upload confirmation for asset {asset_id}: {'success' if upload_success else 'failed'}")

            # Get asset manager and confirm upload
            asset_manager = get_server_asset_manager()

            confirmed = await asset_manager.confirm_upload(
                asset_id=asset_id,
                user_id=user_id,
                upload_success=upload_success,
                error_message=error_message
            )

            if confirmed:
                status_msg = "Upload confirmed successfully" if upload_success else f"Upload failure recorded: {error_message}"
                logger.info(f"Asset {asset_id} confirmation completed: {status_msg}")
                return Message(MessageType.SUCCESS, {
                    'message': status_msg,
                    'asset_id': asset_id,
                    'status': 'uploaded' if upload_success else 'failed'
                })
            else:
                error_msg = f"Failed to confirm upload for asset {asset_id}"
                logger.error(error_msg)
                return Message(MessageType.ERROR, {'error': error_msg})

        except Exception as e:
            error_msg = f"Error processing upload confirmation: {e}"
            logger.error(error_msg)
            return Message(MessageType.ERROR, {'error': error_msg})

    async def add_asset_hashes_to_table(self, table_data: dict, session_code: str, user_id: int) -> dict:
        """Add identifiers for assets visible through this session."""
        try:
            by_id, by_name = self._session_asset_indexes(session_code, user_id)
            for layer_entities in table_data.get('layers', {}).values():
                if not isinstance(layer_entities, dict):
                    continue
                for entity_data in layer_entities.values():
                    if not isinstance(entity_data, dict):
                        continue
                    asset = self._resolve_entity_asset(entity_data, by_id, by_name)
                    if asset:
                        entity_data['asset_id'] = asset['asset_id']
                        entity_data['asset_xxhash'] = asset.get('xxhash')

            return table_data
        except Exception as e:
            logger.error(f"Error adding asset hashes to table: {e}")
            return table_data

    def _session_asset_indexes(self, session_code: str, user_id: int) -> tuple[dict, dict]:
        records = get_server_asset_manager().get_session_assets(session_code, user_id)
        by_id = {record['asset_id']: record for record in records}
        by_name: dict[str, Optional[dict]] = {}
        for record in records:
            name = record['filename']
            by_name[name] = record if name not in by_name else None
        return by_id, by_name

    @staticmethod
    def _resolve_entity_asset(entity_data: dict, by_id: dict, by_name: dict) -> Optional[dict]:
        asset_id = entity_data.get('asset_id')
        if asset_id:
            return by_id.get(asset_id)
        texture_path = entity_data.get('texture_path')
        if not isinstance(texture_path, str) or not texture_path:
            return None
        display_name = texture_path.replace('\\', '/').rsplit('/', 1)[-1]
        return by_name.get(display_name)

    async def _get_asset_xxhash(
        self,
        asset_id: str,
        session_code: str,
        user_id: int,
    ) -> Optional[str]:
        by_id, _ = self._session_asset_indexes(session_code, user_id)
        asset = by_id.get(asset_id)
        value = asset.get('xxhash') if asset else None
        return value if isinstance(value, str) and value else None

    async def handle_asset_delete_request(self, msg: Message, client_id: str) -> Message:
        """Handle asset deletion request. DM or asset owner can delete."""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})
            asset_id = msg.data.get('asset_id')
            if not asset_id:
                return Message(MessageType.ERROR, {'error': 'asset_id is required'})

            user_id = self._get_user_id(msg, client_id)
            session_code = msg.data.get('session_code') or self._get_session_code(msg)
            if not session_code:
                return Message(MessageType.ERROR, {'error': 'Session code is required'})
            should_delete_object = False

            db = SessionLocal()
            try:
                asset = db.query(Asset).filter_by(r2_asset_id=asset_id).first()
                if not asset:
                    return Message(MessageType.ERROR, {'error': 'Asset not found'})

                session = db.query(GameSession).filter(GameSession.session_code == session_code).first()
                if not session:
                    return Message(MessageType.ERROR, {'error': 'Session not found'})
                player = db.query(GamePlayer).filter(
                    GamePlayer.session_id == session.id,
                    GamePlayer.user_id == user_id
                ).first()
                is_session_member = session.owner_id == user_id or player is not None
                if not is_session_member:
                    db.add(audit_event(
                        "asset.delete",
                        outcome="denied",
                        session_code=session_code,
                        user_id=user_id,
                        target_type="asset",
                        target_id=asset_id,
                        details={"reason": "not_session_member"},
                    ))
                    db.commit()
                    return Message(MessageType.ERROR, {'error': 'Session access denied'})

                link = db.query(SessionAsset).filter(
                    SessionAsset.session_id == session.id,
                    SessionAsset.asset_id == asset.id
                ).first()
                if not link:
                    db.add(audit_event(
                        "asset.delete",
                        outcome="denied",
                        session_code=session_code,
                        user_id=user_id,
                        target_type="asset",
                        target_id=asset_id,
                        details={"reason": "not_linked_to_session"},
                    ))
                    db.commit()
                    return Message(MessageType.ERROR, {'error': 'Asset not available in this session'})

                can_moderate = session.owner_id == user_id or (
                    player is not None and player.role in {"owner", "co_dm"}
                )
                if not can_moderate and asset.uploaded_by != user_id:
                    db.add(audit_event(
                        "asset.delete",
                        outcome="denied",
                        session_code=session_code,
                        user_id=user_id,
                        target_type="asset",
                        target_id=asset_id,
                        details={"reason": "insufficient_permission"},
                    ))
                    db.commit()
                    return Message(MessageType.ERROR, {'error': 'Permission denied'})

                r2_key = asset.r2_key
                if link:
                    db.delete(link)
                    db.flush()
                    remaining_links = db.query(SessionAsset).filter(SessionAsset.asset_id == asset.id).count()
                    should_delete_object = remaining_links == 0

                if should_delete_object:
                    asset_manager = get_server_asset_manager()
                    if not asset_manager.r2_manager.delete_file(r2_key):
                        db.rollback()
                        db.add(audit_event(
                            "asset.delete",
                            outcome="failure",
                            session_code=session_code,
                            user_id=user_id,
                            target_type="asset",
                            target_id=asset_id,
                            details={"reason": "storage_delete_failed"},
                        ))
                        db.commit()
                        return Message(MessageType.ERROR, {'error': 'Failed to delete asset from storage'})
                    db.delete(asset)
                db.add(audit_event(
                    "asset.delete",
                    session_code=session_code,
                    user_id=user_id,
                    target_type="asset",
                    target_id=asset_id,
                    details={"object_deleted": should_delete_object},
                ))
                db.commit()
            finally:
                db.close()

            logger.info(f"Asset {asset_id} deleted by {client_id}")
            return Message(MessageType.SUCCESS, {
                'asset_id': asset_id,
                'deleted': True,
                'object_deleted': should_delete_object
            })
        except Exception as e:
            logger.error(f"Error handling asset delete request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def ensure_assets_in_r2(self, table_data: dict, session_code: str, user_id: int) -> dict:
        """Attach download URLs for assets visible through this session."""
        try:
            asset_manager = get_server_asset_manager()
            by_id, by_name = self._session_asset_indexes(session_code, user_id)
            urls: dict[str, str] = {}
            for layer_entities in table_data.get('layers', {}).values():
                if not isinstance(layer_entities, dict):
                    continue
                for entity_data in layer_entities.values():
                    if not isinstance(entity_data, dict):
                        continue
                    asset = self._resolve_entity_asset(entity_data, by_id, by_name)
                    if not asset:
                        continue
                    asset_id = asset['asset_id']
                    if asset_id not in urls:
                        response = await asset_manager.request_download_url(AssetRequest(
                            user_id=user_id,
                            username="server",
                            session_code=session_code,
                            asset_id=asset_id,
                        ))
                        if not response.success or not response.url:
                            continue
                        urls[asset_id] = response.url
                    entity_data['asset_id'] = asset_id
                    entity_data['asset_xxhash'] = asset.get('xxhash')
                    entity_data['r2_asset_url'] = urls[asset_id]

            return table_data
        except Exception as e:
            logger.error(f"Error ensuring assets in R2: {e}")
            return table_data

    async def handle_asset_hash_check(self, msg: Message, client_id: str) -> Message:
        """Handle asset hash verification request"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})

            asset_id = msg.data.get('asset_id')
            client_hash = msg.data.get('hash')

            if not asset_id or not client_hash:
                return Message(MessageType.ERROR, {'error': 'asset_id and hash are required'})

            # Get server hash for asset
            session_code = (msg.data or {}).get('session_code') or self._get_session_code(msg)
            user_id = self._get_user_id(msg, client_id)
            if not session_code or user_id is None:
                return Message(MessageType.ERROR, {'error': 'Session and authentication are required'})
            server_hash = await self._get_asset_xxhash(asset_id, session_code, user_id)

            if server_hash:
                hash_match = server_hash == client_hash
                return Message(MessageType.ASSET_HASH_CHECK, {
                    'asset_id': asset_id,
                    'hash_match': hash_match,
                    'server_hash': server_hash,
                    'client_hash': client_hash
                })
            else:
                return Message(MessageType.ERROR, {'error': 'Asset not found or hash unavailable'})

        except Exception as e:
            logger.error(f"Error handling asset hash check: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
