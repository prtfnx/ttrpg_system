# This file contains the definitions of various entities in the game, including  spells

class Spell:
    def __init__(self, name, description, level,sprite = None,stat='INT',damage=5,speed=1):
        self.name = name
        self.description = description
        self.level = level
        self.sprite = sprite
        self.stat = stat
        self.damage = damage
        self.speed = speed

    def __repr__(self):
        return f"Spell(name={self.name}, description={self.description}, level={self.level}, sprite={self.sprite}, stat={self.stat})"