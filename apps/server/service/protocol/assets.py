import os
from typing import Optional

import xxhash
from core_table.protocol import Message, MessageType
from database.database import SessionLocal
from database.models import Asset
from service.asset_manager import AssetRequest, get_server_asset_manager
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
                asset_xxhash = await self._get_asset_xxhash(asset_id)

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
        """Handle asset list request - return list of assets in R2"""
        logger.debug(f"Handling asset list request from {client_id}: {msg}")
        try:
            # For now, return empty list - this can be implemented later
            return Message(MessageType.ASSET_LIST_RESPONSE, {
                'assets': [],
                'count': 0,
                'message': 'Asset listing not fully implemented yet'
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
        """Add xxHash information to all entity assets in table data"""
        try:
            # Get all layers data
            layers = table_data.get('layers', {})

            # Process each layer
            for layer_name, layer_entities in layers.items():
                if not isinstance(layer_entities, dict):
                    continue

                # Process each entity in the layer
                for entity_id, entity_data in layer_entities.items():
                    if not isinstance(entity_data, dict):
                        continue

                    texture_path = entity_data.get('texture_path')
                    if not texture_path:
                        continue

                    logger.debug(f"Processing asset for entity {entity_id}: {texture_path}")
                    # Calculate or get xxHash for the asset
                    asset_xxhash = await self._get_asset_xxhash_by_path(texture_path)
                    logger.debug(f"xxHash for {texture_path}: {asset_xxhash}")
                    if asset_xxhash:
                        entity_data['asset_xxhash'] = asset_xxhash
                        # Generate asset_id from xxHash (same as client logic)
                        entity_data['asset_id'] = asset_xxhash[:16]
                        logger.debug(f"Added xxHash {asset_xxhash} to entity {entity_id}")
                    else:
                        logger.warning(f"Could not get xxHash for asset: {texture_path}")

            return table_data
        except Exception as e:
            logger.error(f"Error adding asset hashes to table: {e}")
            return table_data

    async def _get_asset_xxhash(self, asset_id: str) -> Optional[str]:
            """Get xxHash for asset by asset_id"""
            try:
                db_session = SessionLocal()
                try:
                    asset = db_session.query(Asset).filter_by(r2_asset_id=asset_id).first()
                    val = getattr(asset, 'xxhash', None) if asset is not None else None
                    if isinstance(val, str) and val:
                        return val
                    return None
                finally:
                    db_session.close()
            except Exception as e:
                logger.error(f"Error getting asset xxHash for {asset_id}: {e}")
                return None

    async def _get_asset_xxhash_by_path(self, texture_path: str) -> Optional[str]:
        """Get xxHash for asset by texture path"""

        # If it's a local file, calculate xxHash
        logger.debug(f"Getting xxHash for texture path: {texture_path}")
        file_path = None
        calculated_hash = None

        if os.path.exists(texture_path):
            file_path = texture_path
        else:
            # Fall back to looking for the file by name inside static/assets/
            _server_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            fallback = os.path.join(_server_dir, 'static', 'assets', os.path.basename(texture_path))
            if os.path.exists(fallback):
                file_path = fallback

        if file_path:
            calculated_hash = self._calculate_file_xxhash(file_path)
            logger.debug(f"Calculated xxHash for {file_path}: {calculated_hash}")

        # Update db or try to find in database
        asset_name = os.path.basename(texture_path)
        asset_type = os.path.splitext(asset_name)[1].lower()  # Get file extension
        db_session = SessionLocal()
        try:
            if file_path and calculated_hash:
                # Check if asset already exists in database
                asset = db_session.query(Asset).filter_by(asset_name=asset_name).first()
                if asset:
                    try:
                        setattr(asset, 'xxhash', calculated_hash)
                    except Exception:
                        # Best effort: some SQLAlchemy models may use Column descriptors; ignore failures
                        pass
                    logger.debug(f"Updated existing asset {asset_name} with xxHash: {calculated_hash}")
                else:
                    # Use content-based asset_id (first 16 chars of xxhash)
                    asset_id = calculated_hash[:16]
                    new_asset = Asset(
                        asset_name=asset_name,
                        r2_asset_id=asset_id,  # Content-based, consistent with client
                        content_type=asset_type,
                        file_size=os.path.getsize(file_path),
                        xxhash=calculated_hash,
                        uploaded_by=1,
                        r2_key=f"local/{asset_name}",
                        r2_bucket="local"
                    )
                    db_session.add(new_asset)
                    logger.debug(f"Created new asset entry for {asset_name} with xxHash: {calculated_hash}")
                db_session.commit()
                return calculated_hash
            else:
                asset = db_session.query(Asset).filter_by(asset_name=asset_name).first()
                val = getattr(asset, 'xxhash', None) if asset is not None else None
                if isinstance(val, str) and val:
                    return val
                return None
        except Exception as e:
            logger.error(f"Error calculating xxHash for {texture_path}: {e}")
            db_session.rollback()
            return calculated_hash
        finally:
            db_session.close()

    def _calculate_file_xxhash(self, file_path: str) -> str:
        """Calculate xxHash for a file"""
        try:
            hasher = xxhash.xxh64()
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception as e:
            logger.error(f"Error calculating xxHash for {file_path}: {e}")
            return ""

    async def handle_asset_delete_request(self, msg: Message, client_id: str) -> Message:
        """Handle asset deletion request"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})
            asset_id = msg.data.get('asset_id')
            if not asset_id:
                return Message(MessageType.ERROR, {'error': 'asset_id is required'})
            logger.info(f"Asset deletion requested for {asset_id} by {client_id} — not yet implemented")
            return Message(MessageType.ERROR, {'error': 'Asset deletion not yet supported'})
        except Exception as e:
            logger.error(f"Error handling asset delete request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def ensure_assets_in_r2(self, table_data: dict, session_code: str, user_id: int) -> dict:
        """Ensure all entity assets are available in R2 and provide download URLs"""
        try:
            get_server_asset_manager()

            # Get all layers data
            layers = table_data.get('layers', {})

            # Process each layer
            for layer_name, layer_entities in layers.items():
                if not isinstance(layer_entities, dict):
                    continue

                # Process each entity in the layer
                for entity_id, entity_data in layer_entities.items():
                    if not isinstance(entity_data, dict):
                        continue

                    if hasattr(entity_data, 'r2_asset_url'):
                        continue
                    texture_path = entity_data.get('texture_path')

                    # Convert local path to asset name
                    if not texture_path:
                        logger.warning(f"No texture_path for entity {entity_id}, skipping asset processing.")
                        continue
                    asset_name = os.path.basename(texture_path)
                    logger.debug(f"Processing asset for entity {entity_id}: {asset_name}")

                    # Check if asset exists in database
                    r2_url = await self._get_or_upload_asset(asset_name, texture_path, session_code, user_id)

                    if r2_url:

                        entity_data['r2_asset_url'] = r2_url
                        logger.info(f"Updated entity {entity_id} with R2 URL: {r2_url}")
                    else:
                        logger.warning(f"Failed to get R2 URL for asset: {asset_name}")

            return table_data
        except Exception as e:
            logger.error(f"Error ensuring assets in R2: {e}")
            return table_data  # Return original data if asset processing fails

    async def _get_or_upload_asset(self, asset_name: str, local_path: str, session_code: str, user_id: int) -> Optional[str]:
        """Get existing R2 URL or upload asset and return R2 URL"""
        try:
            # Check if asset already exists in database
            db_session = SessionLocal()
            try:
                existing_asset = db_session.query(Asset).filter_by(asset_name=asset_name).first()

                if existing_asset:
                    # Asset exists, generate download URL
                    logger.debug(f"Asset {asset_name} exists in database with R2 ID: {existing_asset.r2_asset_id}")

                    asset_manager = get_server_asset_manager()
                    request = AssetRequest(
                        user_id=user_id,
                        username="server",
                        session_code=session_code,
                        asset_id=str(existing_asset.r2_asset_id)
                    )

                    response = await asset_manager.request_download_url(request)
                    if response.success:
                        logger.info(f"Generated download URL for existing asset: {asset_name}")
                        return response.url
                    else:
                        logger.error(f"Failed to generate download URL for existing asset {asset_name}: {response.error}")
                        return None
                  # Asset doesn't exist - let the normal asset upload flow handle this
                logger.info(f"Asset {asset_name} not found in database, will be uploaded via normal client flow")
                # Return None so the client knows to upload this asset through the normal flow
                return None

            finally:
                db_session.close()
        except Exception as e:
            logger.error(f"Error getting or uploading asset {asset_name}: {e}")
            return None

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
            server_hash = await self._get_asset_xxhash(asset_id)

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
