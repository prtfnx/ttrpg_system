import os
import sys
import time
import xxhash  # Add xxhash import
from typing import Dict, Set, Optional, Tuple, Any, Callable
import logging


# Add parent directory to path to import protocol
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from net.protocol import Message, MessageType 
from core_table.actions_core import ActionsCore
from server_host.utils.logger import setup_logger
from server_host.service.asset_manager import get_server_asset_manager, AssetRequest
from server_host.database.models import Asset
from server_host.database.database import SessionLocal

logger = setup_logger(__name__)

class ServerProtocol:
    def __init__(self, table_manager):
        logger.info("Initializing ServerProtocol")
        self.table_manager = table_manager # for compatibility, tables manage actions protocol now
        self.clients: Dict[str, Any] = {}
        logger.debug(f"ServerProtocol initialized with table manager: {self.table_manager}")
        self.handlers: Dict[MessageType, Callable] = {}
        logger.debug("Registering built-in protocol handlers")
        self.init_handlers()
        self.actions = ActionsCore(self.table_manager)
        logger.debug("ActionsCore initialized")
        # Track sprite positions for conflict resolution
        #self.sprite_positions: Dict[str, Dict[str, Tuple[float, float]]] = {}

    def register_handler(self, msg_type: MessageType, handler: Callable):
        """Extension point for custom message handlers"""
        self.handlers[msg_type] = handler    

    def init_handlers(self):
        """Initialize built-in protocol handlers"""
        # Register built-in handlers
        self.register_handler(MessageType.PING, self.handle_ping)
        self.register_handler(MessageType.PONG, self.handle_pong)
        self.register_handler(MessageType.NEW_TABLE_REQUEST, self.handle_new_table_request)
        self.register_handler(MessageType.TABLE_REQUEST, self.handle_table_request)
        self.register_handler(MessageType.FILE_REQUEST, self.handle_file_request)
        self.register_handler(MessageType.TABLE_UPDATE, self.handle_table_update)
        self.register_handler(MessageType.SPRITE_UPDATE, self.handle_sprite_update)
        self.register_handler(MessageType.COMPENDIUM_SPRITE_ADD, self.handle_compendium_sprite_add)
        self.register_handler(MessageType.COMPENDIUM_SPRITE_UPDATE, self.handle_compendium_sprite_update)
        self.register_handler(MessageType.COMPENDIUM_SPRITE_REMOVE, self.handle_compendium_sprite_remove)
        self.register_handler(MessageType.ERROR, self.handle_error)
        self.register_handler(MessageType.SUCCESS, self.handle_success)
        
        # R2 Asset Management handlers
        self.register_handler(MessageType.ASSET_UPLOAD_REQUEST, self.handle_asset_upload_request)
        self.register_handler(MessageType.ASSET_DOWNLOAD_REQUEST, self.handle_asset_download_request)
        self.register_handler(MessageType.ASSET_LIST_REQUEST, self.handle_asset_list_request)
        self.register_handler(MessageType.ASSET_UPLOAD_CONFIRM, self.handle_asset_upload_confirm)
        self.register_handler(MessageType.ASSET_DELETE_REQUEST, self.handle_asset_delete_request)

    async def handle_client(self, msg: Message, client_id: str) -> bool:
        """Handle client message"""

        logger.debug(f"msg received: {msg}")        
        # Check custom handlers first
        logger.debug(f"Handling message type: {msg.type} for client {client_id}")
        if msg.type in self.handlers:
            response = await self.handlers[msg.type](msg, client_id)
            if response:
                logger.debug(f"Sending response to client {client_id}: {response}")
                await self.send_to_client(response, client_id)
            return True
        else:
            logger.warning(f"No handler registered for message type: {msg.type}")
            return False    
    async def handle_ping(self, msg: Message, client_id: str) -> Message:
        """Handle ping message"""
        logger.debug("Received ping message")
        response = Message(MessageType.PONG, {'timestamp': time.time(), 'client_id': client_id})
        return response
    
    async def handle_success(self, msg: Message, client_id: str) -> Message:
        """Handle success message"""
        logger.debug(f"Received success message from {client_id}: {msg}")
        return None
    
    async def handle_pong(self, msg: Message, client_id: str) -> Message:
        """Handle pong message"""
        logger.debug(f"Received pong message from {client_id}: {msg}")
        return None
        
    async def handle_error(self, msg: Message, client_id: str) -> Message:
        """Handle error message"""
        logger.warning(f"Error message received from {client_id}: {msg}")
        return None
    
    async def handle_new_table_request(self, msg: Message, client_id: str) -> Message:
        """Handle new table request"""
        logger.debug(f"New table request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in new table request'})
        table_name = msg.data.get('table_name', 'default')
        result = await self.actions.create_table(table_name, msg.data.get('width', 100), msg.data.get('height', 100))        
        
        if not result.success or not result.data or result.data.get('table') is None:
            return Message(MessageType.ERROR, {'error': 'Failed to create new table'})
        else:
            # Get table data and ensure assets are in R2
            table_data = result.data.get('table').to_dict()
            await self.ensure_assets_in_r2(table_data, msg.data.get('session_code', 'default'), msg.data.get('user_id', 0))
            logger.info(f"Processing table {table_name} with {len(table_data.get('layers', {}))} layers")
            
            # return message that need send to client
            return Message(MessageType.NEW_TABLE_RESPONSE, {'name': table_name, 'client_id': client_id,
                                                            'table_data': table_data})

   
    async def handle_table_request(self, msg: Message, client_id: str) -> Message:
        """Handle  table request"""
        logger.debug(f"Table request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in table request'})
        table_name = msg.data.get('table_name', 'default')
        table_id = msg.data.get('table_id', table_name)
        user_id = msg.data.get('user_id', 0)
        logger.info(f"Current tables: {self.table_manager.tables.items()}")
        result = await self.actions.get_table(table_id)
        
        if not result.success or not result.data or result.data.get('table') is None:
            return Message(MessageType.ERROR, {'error': 'Failed to get table'})
        else:
            # Get table data and add xxHash information
            table_data = result.data.get('table').to_dict()
            table_data_with_hashes = await self.add_asset_hashes_to_table(table_data, session_code=msg.data.get('session_code', 'default'), user_id=user_id)

            # return message that need send to client
            return Message(MessageType.TABLE_RESPONSE, {'name': table_name, 'client_id': client_id,
                                                            'table_data': table_data_with_hashes})

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
                
                response_error = None
                response = None
                if update_category == 'sprite':
                    update_type_enum = MessageType(update_type)
                    match update_type_enum:
                        #TODO different types of updates handle differently
                        case MessageType.SPRITE_MOVE | MessageType.SPRITE_SCALE | MessageType.SPRITE_ROTATE:
                            await self.actions.update_sprite(table_id, update_data.get('sprite_id'), data=update_data)
                            response= Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'sprite_id': update_data.get('sprite_id'),
                                'message': f'Sprite {update_type} successfully'
                            })
                        case MessageType.SPRITE_CREATE:
                            await self.actions.create_sprite_from_data(data=update_data,)
                            return Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'sprite_id': update_data.get('sprite_id'),
                                'message': 'Sprite added successfully'
                            })
                        case MessageType.SPRITE_REMOVE:
                            await self.actions.delete_sprite(table_id, update_data.get('sprite_id'))
                            response = Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'sprite_id': update_data.get('sprite_id'),
                                'message': 'Sprite removed successfully'
                            })
                        case _:
                            logger.error(f"Unknown sprite update type: {update_type} from {client_id}")
                            response_error= Message(MessageType.ERROR, {
                                'error': f"Unknown sprite update type: {update_type}"
                            })
                            
                elif update_category == 'table':
                    match update_type:
                        case  'table_move' | 'table_update':
                            await self.actions.update_table_from_data(update_data)
                            response = Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'message': f'Table {update_type} successfully'
                            })  
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
            await self._broadcast_error(client_id, f"Update failed: {e}")
            return Message(MessageType.ERROR, {'error': f"Update failed: {e}"})
    
    async def handle_sprite_update(self, msg: Message, client_id: str) -> Message:
        """Handle sprite update message"""
        logger.info(f"Handling sprite update from {client_id}: {msg}")
        type = msg.data.get('type')
        if not type:
            logger.error(f"Missing 'type' field in sprite update from {client_id}: {msg.data}")
            return Message(MessageType.ERROR, {'error': 'Missing required field: type'})
        update_data = msg.data.get('data', {})

        if not update_data or 'table_name' not in update_data or 'sprite_id' not in update_data:
            logger.error(f"Invalid sprite update data from {client_id}: {update_data}")
            return Message(MessageType.ERROR, {'error': 'Invalid sprite update data'})
        match type:
            case 'sprite_move':
                # Handle sprite movement
                
                if 'from' not in update_data or 'to' not in update_data:
                    logger.error(f"Missing 'from' or 'to' field in sprite move update from {client_id}: {update_data}")
                    return Message(MessageType.ERROR, {'error': 'Missing required fields: from, to'})
     
                await self.actions.move_sprite(table_name=update_data['table_name'],
                                               sprite_id=update_data['sprite_id'],
                                               old_position=update_data['from'],
                                               new_position=update_data['to'])

                # Here you can add logic to check for conflicts with other sprites
                # For now, we just assume the move is valid
            case 'sprite_scale':
                raise NotImplementedError(f"Sprite update type '{type}' not implemented")
            case 'sprite_rotate':
                raise NotImplementedError(f"Sprite update type '{type}' not implemented")
        table_id = update_data.get('table_id')
        await self.actions.update_sprite(table_id, update_data.get('sprite_id'), data=update_data)
        response = Message(MessageType.SUCCESS, {
            'table_id': table_id,
            'sprite_id': update_data.get('sprite_id'),
            'message': f'Sprite updated successfully'
        })
        return response

    async def handle_file_request(self, msg: Message, client_id: str) -> Message:
        return Message(MessageType.ERROR, {'error': 'File transfer not implemented yet'})  
    async def handle_compendium_sprite_add(self, msg: Message, client_id: str) -> Message:
        return Message(MessageType.ERROR, {'error': 'Compendium sprite add not implemented yet'})
    async def handle_compendium_sprite_update(self, msg: Message, client_id: str) -> Message:
        return Message(MessageType.ERROR, {'error': 'Compendium sprite update not implemented yet'})
    async def handle_compendium_sprite_remove(self, msg: Message, client_id: str) -> Message:
        return Message(MessageType.ERROR, {'error': 'Compendium sprite remove not implemented yet'})
  
    # R2 Asset Management Handlers
    
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
            user_id = msg.data.get('user_id', 0)
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
                content_type=content_type
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
            user_id = msg.data.get('user_id', 0)
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
        logger.debug(f"Handling asset list request from {client_id}: {msg}")
        """Handle asset list request - return list of assets in R2"""
        pass
    
    async def handle_asset_upload_confirm(self, msg: Message, client_id: str) -> Message:
        """Handle asset upload confirmation - verify xxHash and update database"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided in asset upload confirmation'})
            
            # Extract data
            asset_id = msg.data.get('asset_id')
            file_xxhash = msg.data.get('xxhash')
            session_code = msg.data.get('session_code', 'default')
            user_id = msg.data.get('user_id', 0)
            username = msg.data.get('username', 'unknown')
            
            if not asset_id or not file_xxhash:
                return Message(MessageType.ERROR, {'error': 'Asset ID and xxHash are required'})
            
            # Verify xxHash in database
            db_session = SessionLocal()
            try:
                asset = db_session.query(Asset).filter_by(r2_asset_id=asset_id).first()
                if not asset:
                    return Message(MessageType.ERROR, {'error': 'Asset not found'})
                
                if asset.xxhash != file_xxhash:
                    return Message(MessageType.ERROR, {'error': 'xxHash mismatch'})
                
                # Update asset metadata if needed
                asset.last_uploaded_by = username
                asset.last_uploaded_at = time.time()
                db_session.commit()
                
                return Message(MessageType.SUCCESS, {'message': 'Asset upload confirmed successfully'})
                
            finally:
                db_session.close()
                
        except Exception as e:
            logger.error(f"Error handling asset upload confirmation: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

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
                        entity_data['asset_id'] = f"asset_{asset_xxhash[:16]}"
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
                    if asset and asset.xxhash:
                        return asset.xxhash
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
        if os.path.exists(texture_path):
            file_path = texture_path
        #TODO: remove hardcoded path
        elif os.path.exists(''.join(['res/', texture_path.split('/')[-1]])):
            file_path = ''.join(['res/', texture_path.split('/')[-1]])
        
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
                    asset.xxhash = calculated_hash
                    logger.debug(f"Updated existing asset {asset_name} with xxHash: {calculated_hash}")
                else:
                    r2_asset_id = f"local_{calculated_hash[:16]}"
                    new_asset = Asset(
                        asset_name=asset_name,
                        r2_asset_id=r2_asset_id,                         
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
                if asset and asset.xxhash:
                    return asset.xxhash
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
            # Asset deletion not implemented yet - future feature
            return Message(MessageType.ERROR, {'error': 'Asset deletion not implemented yet'})
            
        except Exception as e:
            logger.error(f"Error handling asset delete request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def send_to_client(self, message: Message, client_id: str):
        """Send message to specific client"""
        # Overload this method in server implementation to use choosed transport
        raise NotImplementedError("Subclasses must implement send_to_client method")      
    
    async def broadcast_to_session(self, message: Message, client_id: str):
        """Send message to all clients in the session"""
        for client in self.clients:
            if client != client_id:
                await self.send_to_client(message, client)

    async def _broadcast_error(self, client_id: str, error_message: str):
        """Send error message to specific client"""
        if client_id in self.clients:
            error_msg = Message(MessageType.ERROR, {'error': error_message})
            await self.send_to_client(error_msg, self.clients[client_id])
    
    async def ensure_assets_in_r2(self, table_data: dict, session_code: str, user_id: int) -> dict:    
        """Ensure all entity assets are available in R2 and provide download URLs"""
        try:
            asset_manager = get_server_asset_manager()
            
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

if __name__ == "__main__":
    # Example usage
    class MockTableManager:
        pass  # Replace with actual table manager implementation

    protocol = ServerProtocol(MockTableManager())
    print("ServerProtocol initialized successfully")

