import table
import asyncio
#import CharacterManager
import server


INITIALIZE_TABLE = "INITIALIZE_TABLE"
class Game:
    def __init__(self):
        self.tables = {}  # key: table name, value: Table instance
        #self.character_manager = CharacterManager()
        self.characters = []  # list of character objects
        self.spells = {}      # key: spell name, value: spell data
        self.items = {}       # key: item name, value: item data
        self.other_info = {}  # for any additional tabletop data
        self.queue_to_read = asyncio.Queue()
        self.queue_to_write = asyncio.Queue()

    def add_table(self, table):
        self.tables[table.name] = table

    def add_character(self, character):
        self.characters.append(character)
        self.character_manager.add_character(character)

    def add_spell(self, name, spell_data):
        self.spells[name] = spell_data

    def add_item(self, name, item_data):
        self.items[name] = item_data

    def get_table(self, name):
        return self.tables.get(name)

    def get_character(self, name):
        return self.character_manager.get_character(name)

    def get_spell(self, name):
        return self.spells.get(name)

    def get_item(self, name):
        return self.items.get(name)
    
if __name__ == "__main__":
    # Create test game instance
    test_game = Game()
    # Create test table and add to game
    test_table = table.VirtualTable('test_table', 10, 10)

    test_game.add_table(test_table)
    test_table.add_entity("Hero", (2, 3), layer='tokens', path_to_texture='resources/hero.png')
    test_table.add_entity("Goblin", (5, 6), layer='dungeon_master', path_to_texture='resources/goblin.png')
    

    # Start server in background
    async def main():
        # Start the server in the background
        server_task = asyncio.create_task(server.run_server(test_game.queue_to_read, test_game.queue_to_write))

        stage = 1
        print('here')
        while True:
            await asyncio.sleep(0.1)  # Prevent busy loop

            if stage == 2:
                await test_game.queue_to_write.put(test_table.to_json())
            if not test_game.queue_to_read.empty():
                await test_game.queue_to_write.put(INITIALIZE_TABLE)
                await test_game.queue_to_read.get()
                stage = 2

        # Optionally, await server_task if you want to keep it running
        # await server_task

    asyncio.run(main())

    #logging.info(f"Received table data: {table_data}")