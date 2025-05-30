# This file contains the definitions of various entities in the game, including characters.
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

    def spell_attack(self, x, y, spell):
        if self.is_alive():
            damage = spell.damage + self.stats[spell.stat] 
            # #target = find_target_at_position(cnt, x, y)
            # if target:
            #     target.take_damage(damage)
            #     print(f"{self.name} casts {spell['name']} on {target.name} for {damage} damage!")
            # else:
            #     print("No target found.")
            print(f"{self.name} casts {spell.name} on  for {damage} damage!")
        else:
            print(f"{self.name} is not alive to cast spells.")
    def add_spell(self, spell):
        if not hasattr(self, 'spells'):
            self.spells = []
        self.spells.append(spell)
    def to_dict(self):
        return {
            'name': self.name,
            'race': self.race,
            'char_class': self.char_class,
            'level': self.level,
            'hp': self.hp,
            'stats': self.stats.copy(),
            'spells': [spell.name for spell in getattr(self, 'spells', [])]
        }
        

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