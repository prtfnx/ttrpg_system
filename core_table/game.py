import os
import sys
import asyncio
from logger import setup_logger
from typing import Dict, List

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import core_table.table as table
from core_table.server import GameServer, TableManager
from core_table.entities import Spell

logger = setup_logger(__name__)

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
        logger.info(f"Added table '{table.name}' to game")

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

    def get_table(self, name: str) -> 'table.VirtualTable':
        """Get table by name"""
        return self.table_manager.get_table(name)

    def get_character(self, name: str):
        """Get character by name"""
        for character in self.characters:
            if hasattr(character, 'name') and character.name == name:
                return character
        return None

    def get_spell(self, name: str) -> Spell:
        """Get spell by name"""
        return self.spells.get(name)

    def get_item(self, name: str):
        """Get item by name"""
        return self.items.get(name)
    
    def list_tables(self) -> List[str]:
        """Get list of table names"""
        return list(self.table_manager.tables.keys())
    
    def get_table_info(self, name: str = None) -> Dict:
        """Get table information"""
        table = self.get_table(name)
        if table:
            return {
                'name': table.name,
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

def create_test_game() -> Game:
    """Create a test game with sample data"""
    test_game = Game()
    
    # Create test table
    test_table = table.VirtualTable('test_table', 20, 20)
    test_game.add_table(test_table)
    
    # Add some test entities with sprite IDs
    hero = test_table.add_entity("Hero", (2, 3), layer='tokens', path_to_texture='resources/hero.png')
    goblin = test_table.add_entity("Goblin", (5, 6), layer='tokens', path_to_texture='resources/goblin.png')
    treasure = test_table.add_entity("Treasure", (8, 9), layer='tokens', path_to_texture='resources/treasure.png')
    
    logger.info(f"Created test entities:")
    logger.info(f"  Hero (ID: {hero.entity_id}, Sprite: {hero.sprite_id}) at {hero.position}")
    logger.info(f"  Goblin (ID: {goblin.entity_id}, Sprite: {goblin.sprite_id}) at {goblin.position}")
    logger.info(f"  Treasure (ID: {treasure.entity_id}, Sprite: {treasure.sprite_id}) at {treasure.position}")
    
    # Add some test spells
    fireball = Spell("Fireball", "A ball of fire", 3,'resources/fireball_explosion.png', 'INT', 15, 1)
    heal = Spell("Heal", "Restore health", 1, None, 'WIS', 10, 1)
    test_game.add_spell("fireball", fireball)
    test_game.add_spell("heal", heal)
    
    # Create a larger table for testing
    large_table = table.VirtualTable('large_table', 1080, 1920)
    test_game.add_table(large_table)
    
    # Add entities across different layers
    large_table.add_entity("Map Background", (0, 0), layer='map', path_to_texture='resources/map.jpg')
    large_table.add_entity("Player 1", (10, 10), layer='tokens', path_to_texture='resources/player1.png')
    large_table.add_entity("Player 2", (12, 10), layer='tokens', path_to_texture='resources/player2.png')
    large_table.add_entity("DM Note", (25, 25), layer='dungeon_master', path_to_texture='resources/note.png')
    large_table.add_entity("Light Source", (15, 15), layer='light', path_to_texture='resources/torch.png')
    
    return test_game

async def run_test_server():
    """Run a test server with sample game data"""
    test_game = create_test_game()
    
    logger.info("=== Test Game Server ===")
    logger.info(f"Tables: {test_game.list_tables()}")
    
    for table_name in test_game.list_tables():
        info = test_game.get_table_info(table_name)
        logger.info(f"Table '{table_name}': {info['width']}x{info['height']}, {info['entity_count']} entities")
    
    # Start the server
    try:
        await test_game.start_server()
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
    finally:
        await test_game.stop_server()

# Legacy main function for backwards compatibility
async def legacy_main():
    """Legacy main function that mimics old behavior"""
    test_game = Game()
    
    # Create test table and add to game
    test_table = table.VirtualTable('test_table', 10, 10)
    test_game.add_table(test_table)
    test_table.add_entity("Hero", (2, 3), layer='tokens', path_to_texture='resources/hero.png')
    test_table.add_entity("Goblin", (5, 6), layer='dungeon_master', path_to_texture='resources/goblin.png')
    
    logger.info("Legacy server starting...")
    
    # Start server
    await test_game.start_server()

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s:%(name)s: %(message)s"
    )
    
    # Choose which version to run
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--legacy":
        asyncio.run(legacy_main())
    else:
        asyncio.run(run_test_server())