import os
import asyncio
import logging
from typing import Dict, List, Optional

import core_table.table as table
from core_table.server import GameServer, TableManager
from core_table.entities import Spell

logger = logging.getLogger(__name__)

INITIALIZE_TABLE = "INITIALIZE_TABLE"

class Game:
    def __init__(self):
        self.table_manager = TableManager()
        self.game_server = GameServer(self.table_manager)
        self.characters = []  # list of character objects
        self.spells: Dict[str, Spell] = {}      # key: spell name, value: spell data
        self.items = {}       # key: item name, value: item data
        self.other_info = {}  # for any additional tabletop data
        
        # Legacy queue support (deprecated but kept for compatibility)
        self.queue_to_read = asyncio.Queue()
        self.queue_to_write = asyncio.Queue()

    def add_table(self, table: 'table.VirtualTable'):
        """Add table to the game"""
        self.table_manager.add_table(table)
        logger.info(f"Added table '{table.display_name}' to game")

    def create_table(self, name: str, width: int, height: int) -> 'table.VirtualTable':
        """Create a new table"""
        return self.table_manager.create_table(name, width, height)

    def add_character(self, character):
        """Add character to the game"""
        self.characters.append(character)
        logger.info(f"Added character to game")

    def add_spell(self, name: str, spell: Spell):
        """Add spell to the game"""
        self.spells[name] = spell
        logger.info(f"Added spell '{name}' to game")

    def add_item(self, name: str, item_data):
        """Add item to the game"""
        self.items[name] = item_data
        logger.info(f"Added item '{name}' to game")

    def get_table(self, table_id: Optional[str] = None) -> 'table.VirtualTable':
        """Get table by UUID"""
        return self.table_manager.get_table(table_id)

    def get_character(self, name: str):
        """Get character by name"""
        for character in self.characters:
            if hasattr(character, 'name') and character.name == name:
                return character
        return None

    def get_spell(self, name: str) -> Optional[Spell]:
        """Get spell by name"""
        return self.spells.get(name)

    def get_item(self, name: str):
        """Get item by name"""
        return self.items.get(name)
    
    def list_tables(self) -> List[str]:
        """Get list of table names"""
        return list(self.table_manager.tables.keys())
    
    def get_table_info(self, table_id: Optional[str] = None) -> Dict:
        """Get table information"""
        table = self.get_table(table_id)
        if table:
            return {
                'table_id': str(table.table_id),
                'table_name': table.display_name,
                'width': table.width,
                'height': table.height,
                'entity_count': len(table.entities),
                'layers': table.layers
            }
        return {}
    
    async def start_server(self):
        """Start the game server"""
        logger.info("Starting game server...")
        await self.game_server.run_server()
    
    async def stop_server(self):
        """Stop the game server"""
        logger.info("Stopping game server...")
        # Close all client connections
        for client_id in list(self.game_server.clients.keys()):
            writer = self.game_server.clients[client_id]
            await self.game_server._cleanup_client(client_id, writer)

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s:%(name)s: %(message)s"
    )
    game = Game()
    logger.info(f"Tables: {game.list_tables()}")