import asyncio
from logger import setup_logger
import json
import uuid
import os
import sys
from typing import Dict, Set

# Add parent directory to path to import protocol
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core_table.server_protocol import ServerProtocol
from core_table.table import VirtualTable
from net.protocol import Message, MessageType

logger = setup_logger(__name__)

HOST = '127.0.0.1'
PORT = 12345

class TableManager:
    """Manages virtual tables for the server with database persistence"""
    def __init__(self, db_session=None):
        self.tables: Dict[str, VirtualTable] = {}
        self.db_session = db_session  # SQLAlchemy session for database operations
        self.default_table = self._create_default_table()
        
    def set_db_session(self, db_session):
        """Set database session for persistence operations"""
        self.db_session = db_session
        
    def _create_default_table(self) -> VirtualTable:
        """Create a default table"""
        table = VirtualTable("default", 100, 100)
        self.tables["default"] = table
        return table
    
    def get_table(self, name: str = None) -> VirtualTable:
        """Get table by name or return default"""
        if name and name in self.tables:
            return self.tables[name]
        return self.default_table
    def create_table(self, name: str, width: int, height: int) -> VirtualTable:        
        """Create a new table"""
        table = VirtualTable(name, width, height)
        self.tables[name] = table
        logger.info(f"Created table '{name}' ({width}x{height})")
        return table
    
    def add_table(self, table: VirtualTable):
        """Add existing table to manager"""
        self.tables[table.name] = table
        logger.info(f"Added table '{table.name}' to manager")
    
    def remove_table(self, table_name: str):
        """Remove table from manager"""
        if table_name in self.tables and table_name != "default":
            del self.tables[table_name]
            logger.info(f"Removed table '{table_name}' from manager")
            return True
        return False
    
    def apply_update(self, data: Dict):
        """Apply general table updates"""
        table_name = data.get('table_name', 'default')
        table = self.get_table(table_name)
        
        update_type = data.get('type')
        if update_type == 'scale':
            # Handle table scaling
            pass
        elif update_type == 'grid':
            # Handle grid changes
            pass
        # Add more general update types as needed
        
    def clear_tables(self):
        """Clear all tables"""
        self.tables.clear()
        self.default_table = self._create_default_table()
        logger.info("Cleared all tables, reset to default")
    
    def save_to_database(self, session_id: int) -> bool:
        """Save all tables to database"""
        if not self.db_session:
            logger.warning("No database session available for saving tables")
            return False
        
        try:
            from server_host.database import crud
            
            for table_name, table in self.tables.items():
                if table_name != "default":  # Skip default table for now
                    crud.save_table_to_db(self.db_session, table, session_id)
                    logger.info(f"Saved table '{table_name}' to database")
            
            return True
        except Exception as e:
            logger.error(f"Error saving tables to database: {e}")
            return False
    
    def load_from_database(self, session_id: int) -> bool:
        """Load tables from database for a session"""
        if not self.db_session:
            logger.warning("No database session available for loading tables")
            return False
        
        try:
            from server_host.database import crud
            
            # Get all tables for this session
            db_tables = crud.get_session_tables(self.db_session, session_id)
            
            for db_table in db_tables:
                virtual_table, success = crud.load_table_from_db(self.db_session, db_table.table_id)
                if success and virtual_table:
                    self.tables[virtual_table.name] = virtual_table
                    logger.info(f"Loaded table '{virtual_table.name}' from database")
                else:
                    logger.error(f"Failed to load table with ID {db_table.table_id}")
            
            return True
        except Exception as e:
            logger.error(f"Error loading tables from database: {e}")
            return False
    
    def save_table(self, table_name: str, session_id: int) -> bool:
        """Save a specific table to database"""
        if not self.db_session or table_name not in self.tables:
            return False
        
        try:
            from server_host.database import crud
            table = self.tables[table_name]
            crud.save_table_to_db(self.db_session, table, session_id)
            logger.info(f"Saved table '{table_name}' to database")
            return True
        except Exception as e:
            logger.error(f"Error saving table '{table_name}' to database: {e}")
            return False
    
    def load_table(self, table_id: str) -> bool:
        """Load a specific table from database"""
        if not self.db_session:
            return False
        
        try:
            from server_host.database import crud
            virtual_table, success = crud.load_table_from_db(self.db_session, table_id)
            if success and virtual_table:
                self.tables[virtual_table.name] = virtual_table
                logger.info(f"Loaded table '{virtual_table.name}' from database")
                return True
            return False
        except Exception as e:
            logger.error(f"Error loading table with ID '{table_id}' from database: {e}")
            return False

class GameServer:
    """Main game server that uses ServerProtocol"""
    def __init__(self, table_manager: TableManager = None):
        self.table_manager = table_manager or TableManager()
        self.protocol = ServerProtocol(self.table_manager)
        self.clients: Dict[str, asyncio.StreamWriter] = {}
        self.client_addresses: Dict[str, str] = {}
        
    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        """Handle individual client connection with proper message parsing"""
        addr = writer.get_extra_info('peername')
        client_id = str(uuid.uuid4())
        
        logger.info(f"Client {client_id} connected from {addr}")
        
        self.clients[client_id] = writer
        self.client_addresses[client_id] = str(addr)
        
        # Message buffer for this client
        message_buffer = ""
        
        try:
            # Send welcome message
            welcome_msg = Message(MessageType.PING, {'message': 'Welcome to TTRPG Server'})
            await self._send_to_client(writer, welcome_msg)
            
            # Handle client messages
            while True:
                data = await reader.read(8192)  # Increased buffer size
                if not data:
                    break
                
                # Decode and add to buffer
                try:
                    chunk = data.decode('utf-8')
                    message_buffer += chunk
                    
                    # Process complete messages (separated by newlines)
                    while '\n' in message_buffer:
                        message_str, message_buffer = message_buffer.split('\n', 1)
                        message_str = message_str.strip()
                        
                        if not message_str:
                            continue
                        
                        # Handle simple ping/pong for backwards compatibility
                        if message_str == "__ping__":
                            writer.write(b"__pong__\n")
                            await writer.drain()
                            logger.debug(f"Received ping, sent pong to {addr}")
                            continue
                        
                        # Process through protocol handler
                        try:
                            await self.protocol.handle_client(client_id, writer, message_str)
                        except json.JSONDecodeError as e:
                            logger.error(f"Invalid JSON from {client_id}: {e}")
                            error_msg = Message(MessageType.ERROR, {'error': 'Invalid JSON format'})
                            await self._send_to_client(writer, error_msg)
                        except Exception as e:
                            logger.error(f"Error processing message from {client_id}: {e}")
                            error_msg = Message(MessageType.ERROR, {'error': str(e)})
                            await self._send_to_client(writer, error_msg)
                            
                except UnicodeDecodeError as e:
                    logger.error(f"Failed to decode data from {client_id}: {e}")
                    continue
                    
        except (asyncio.IncompleteReadError, ConnectionResetError) as e:
            logger.warning(f"Client {client_id} ({addr}) disconnected: {e}")
        except Exception as e:
            logger.error(f"Unexpected error with client {client_id}: {e}")
        finally:
            await self._cleanup_client(client_id, writer)
    
    async def _send_to_client(self, writer: asyncio.StreamWriter, message: Message):
        """Send message to a specific client with proper framing"""
        try:
            # Add newline delimiter for message framing
            data = message.to_json().encode() + b'\n'
            writer.write(data)
            await writer.drain()
        except Exception as e:
            logger.error(f"Failed to send message to client: {e}")
    
    async def _cleanup_client(self, client_id: str, writer: asyncio.StreamWriter):
        """Clean up client connection"""
        logger.info(f"Cleaning up client {client_id}")
        
        # Remove from protocol
        self.protocol.disconnect_client(client_id)
        
        # Remove from our tracking
        self.clients.pop(client_id, None)
        self.client_addresses.pop(client_id, None)
        
        # Close connection
        try:
            writer.close()
            await writer.wait_closed()
        except Exception as e:
            logger.error(f"Error closing connection for {client_id}: {e}")
    
    async def run_server(self):
        """Run the game server"""
        server = await asyncio.start_server(
            self.handle_client,
            HOST, PORT
        )
        
        logger.info(f"Game server listening on {HOST}:{PORT}")
        logger.info(f"Tables available: {list(self.table_manager.tables.keys())}")
        
        async with server:
            await server.serve_forever()

# Backwards compatibility functions
async def handle_client(reader, writer, queue_to_read=None, queue_to_write=None):
    """Legacy function - redirects to GameServer"""
    # Create a temporary server instance
    table_manager = TableManager()
    game_server = GameServer(table_manager)
    await game_server.handle_client(reader, writer)

async def run_server(queue_to_read=None, queue_to_write=None, table_manager=None):
    """Legacy function - creates and runs GameServer"""
    game_server = GameServer(table_manager)
    await game_server.run_server()

async def main(table_manager=None):
    """Main server entry point"""
    game_server = GameServer(table_manager)
    await game_server.run_server()

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s:%(name)s: %(message)s"
    )
    asyncio.run(main())
