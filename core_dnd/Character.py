class Character:
    def __init__(self, name, race, char_class, level=1, hp=10, stats=None):
        self.name = name
        self.race = race
        self.char_class = char_class
        self.level = level
        self.hp = hp
        self.stats = stats if stats else {
            'STR': 10, 'DEX': 10, 'CON': 10, 'INT': 10, 'WIS': 10, 'CHA': 10
        }

    def take_damage(self, amount):
        self.hp = max(0, self.hp - amount)

    def heal(self, amount):
        self.hp += amount

    def is_alive(self):
        return self.hp > 0

class Player(Character):
    def __init__(self, name, race, char_class, level=1, hp=10, stats=None, player_name=None):
        super().__init__(name, race, char_class, level, hp, stats)
        self.player_name = player_name
        self.inventory = []

    def add_item(self, item):
        self.inventory.append(item)

class NPC(Character):
    def __init__(self, name, race, char_class, level=1, hp=10, stats=None, role=None):
        super().__init__(name, race, char_class, level, hp, stats)
        self.role = role  # e.g., 'villager', 'merchant', 'enemy'