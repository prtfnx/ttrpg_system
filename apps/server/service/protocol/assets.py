from typing import Optional

from core_table.protocol import Message, MessageType
from service.asset_deletion_service import queue_asset_unlink
from service.asset_manager import AssetRequest, get_server_asset_manager
from utils.blocking import run_blocking
from utils.logger import setup_logger

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _AssetsMixin(_ProtocolBase):
    """Handler methods for assets domain."""

    def _asset_request_context(
        self, msg: Message, client_id: str
    ) -> Optional[tuple[int, str, str]]:
        """Resolve asset identity exclusively from authenticated connection state."""
        user_id = self._get_user_id(msg, client_id)
        session_code = self._get_session_code()
        username = self._get_client_info(client_id).get('username')
        if (
            user_id is None
            or not session_code
            or not isinstance(username, str)
            or not username
        ):
            return None
        return user_id, username, session_code

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
            context = self._asset_request_context(msg, client_id)
            if context is None:
                return Message(MessageType.ERROR, {'error': 'Authentication and session context required'})
            user_id, username, session_code = context
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

        except Exception:
            logger.exception("Asset upload request failed")
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
            context = self._asset_request_context(msg, client_id)
            if context is None:
                return Message(MessageType.ERROR, {'error': 'Authentication and session context required'})
            user_id, username, session_code = context

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

        except Exception:
            logger.exception("Asset download request failed")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_asset_list_request(self, msg: Message, client_id: str) -> Message:
        """Handle asset list request - return session-visible asset metadata."""
        logger.debug("Asset list requested", extra={"event_name": "asset.list.requested"})
        try:
            context = self._asset_request_context(msg, client_id)
            if context is None:
                return Message(MessageType.ERROR, {'error': 'Authentication and session context required'})
            user_id, _username, session_code = context

            assets = await get_server_asset_manager().request_session_assets(
                session_code, user_id
            )
            return Message(MessageType.ASSET_LIST_RESPONSE, {
                'success': True,
                'assets': assets,
                'count': len(assets)
            })
        except Exception:
            logger.exception("Asset list request failed")
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
            context = self._asset_request_context(msg, client_id)
            if context is None:
                return Message(MessageType.ERROR, {'error': 'Authentication and session context required'})
            user_id, _username, _session_code = context

            if not asset_id:
                return Message(MessageType.ERROR, {'error': 'Asset ID is required'})

            logger.info(
                "Asset upload confirmation received",
                extra={
                    "event_name": "asset.upload_confirmation.received",
                    "outcome": "success" if upload_success else "failure",
                },
            )

            # Get asset manager and confirm upload
            asset_manager = get_server_asset_manager()

            confirmed = await asset_manager.confirm_upload(
                asset_id=asset_id,
                user_id=user_id,
                upload_success=upload_success,
                error_message=error_message
            )

            if confirmed:
                status_msg = "Upload confirmed successfully" if upload_success else "Upload failure recorded"
                logger.info(
                    "Asset upload confirmation completed",
                    extra={
                        "event_name": "asset.upload_confirmation.completed",
                        "outcome": "success" if upload_success else "failure",
                    },
                )
                return Message(MessageType.SUCCESS, {
                    'message': status_msg,
                    'asset_id': asset_id,
                    'status': 'uploaded' if upload_success else 'failed'
                })
            else:
                logger.error("Asset upload confirmation failed")
                return Message(MessageType.ERROR, {'error': 'Failed to confirm upload'})

        except Exception:
            logger.exception("Asset upload confirmation failed")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def add_asset_hashes_to_table(self, table_data: dict, session_code: str, user_id: int) -> dict:
        """Add identifiers for assets visible through this session."""
        try:
            by_id, by_name = await self._session_asset_indexes(session_code, user_id)
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
        except Exception:
            logger.exception("Table asset enrichment failed")
            return table_data

    async def _session_asset_indexes(
        self, session_code: str, user_id: int
    ) -> tuple[dict, dict]:
        records = await get_server_asset_manager().request_session_assets(
            session_code, user_id
        )
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
        by_id, _ = await self._session_asset_indexes(session_code, user_id)
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

            context = self._asset_request_context(msg, client_id)
            if context is None:
                return Message(MessageType.ERROR, {'error': 'Authentication and session context required'})
            user_id, _username, session_code = context
            result = await run_blocking(
                queue_asset_unlink,
                session_code=session_code,
                user_id=user_id,
                r2_asset_id=asset_id,
            )
            if not result.success:
                return Message(
                    MessageType.ERROR,
                    {'error': result.error or 'Asset could not be unlinked'},
                )

            logger.info(
                "Asset unlinked",
                extra={"event_name": "asset.delete.completed", "outcome": "success"},
            )
            return Message(MessageType.SUCCESS, {
                'asset_id': asset_id,
                'deleted': True,
                'object_deleted': False,
                'deletion_queued': result.deletion_job_id is not None,
            })
        except Exception:
            logger.exception("Asset delete request failed")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def ensure_assets_in_r2(self, table_data: dict, session_code: str, user_id: int) -> dict:
        """Attach download URLs for assets visible through this session."""
        try:
            asset_manager = get_server_asset_manager()
            by_id, by_name = await self._session_asset_indexes(session_code, user_id)
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
        except Exception:
            logger.exception("Asset URL enrichment failed")
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
            context = self._asset_request_context(msg, client_id)
            if context is None:
                return Message(MessageType.ERROR, {'error': 'Authentication and session context required'})
            user_id, _username, session_code = context
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

        except Exception:
            logger.exception("Asset hash-check request failed")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
