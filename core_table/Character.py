#!/usr/bin/env python3
"""
Virtual Tabletop Character System
Unified character model using D&D 5e system for tabletop gaming
"""

from typing import List, Dict, Optional, Any, Union
from .compendiums.characters.character import (
    Character as DnD5eCharacter, 
    Race, 
    CharacterClass, 
    Background, 
    AbilityScore,
    Skill,
    Size,
    Feat
)


class Character(DnD5eCharacter):
    """
    Enhanced character class for virtual tabletop use.
    Extends the D&D 5e character system with VTT-specific functionality.
    """
    
    def __init__(self, name: str = "", race: Optional[Race] = None, 
                 character_class: Optional[CharacterClass] = None, 
                 level: int = 1, player_name: str = "", 
                 char_class: Optional[CharacterClass] = None, **kwargs):
        super().__init__()
        self.name = name
        self.race = race
        # Support both character_class and char_class for backward compatibility
        self.character_class = character_class or char_class
        self.level = level
        self.player_name = player_name
        
        # VTT-specific attributes
        self.sprite_id: Optional[str] = None
        self.position_x: float = 0.0
        self.position_y: float = 0.0
        self.token_size: int = 1  # Grid squares
        self.visibility: bool = True
        self.spells: List[Any] = []  # For spell objects
        self.inventory: List[str] = []
        
        # Initialize calculated values
        self.update_calculated_values()
        
        # Ensure character has hit points if they have a class
        if self.character_class and self.hit_points == 0:
            self.hit_points = self.max_hit_points
    
    def take_damage(self, amount: int) -> int:
        """Apply damage to the character and return actual damage taken"""
        actual_damage = min(amount, self.hit_points)
        self.hit_points = max(0, self.hit_points - amount)
        return actual_damage
    
    def heal(self, amount: int) -> int:
        """Heal the character and return actual healing done"""
        actual_healing = min(amount, self.max_hit_points - self.hit_points)
        self.hit_points = min(self.max_hit_points, self.hit_points + amount)
        return actual_healing
    
    def is_alive(self) -> bool:
        """Check if character is alive"""
        return self.hit_points > 0
    
    def is_conscious(self) -> bool:
        """Check if character is conscious (not unconscious or dead)"""
        return self.hit_points > 0
    
    def spell_attack(self, x: float, y: float, spell: Any) -> Dict[str, Any]:
        """
        Cast a spell at target coordinates.
        Returns attack result information.
        """
        if not self.is_alive():
            return {
                'success': False,
                'message': f"{self.name} is not alive to cast spells.",
                'damage': 0
            }
        
        # Calculate spell damage based on character's spellcasting ability
        spell_ability = self.get_spellcasting_ability()
        spell_modifier = self.get_ability_modifier(spell_ability) if spell_ability else 0
        
        damage = getattr(spell, 'damage', 0) + spell_modifier
        
        return {
            'success': True,
            'message': f"{self.name} casts {getattr(spell, 'name', 'spell')} for {damage} damage!",
            'damage': damage,
            'target_x': x,
            'target_y': y,
            'caster': self.name
        }
    
    def add_spell(self, spell: Any) -> None:
        """Add a spell to the character's spell list"""
        if spell not in self.spells:
            self.spells.append(spell)
    
    def remove_spell(self, spell: Any) -> bool:
        """Remove a spell from the character's spell list"""
        if spell in self.spells:
            self.spells.remove(spell)
            return True
        return False
    
    def add_item(self, item: str) -> None:
        """Add an item to the character's inventory"""
        self.inventory.append(item)
    
    def remove_item(self, item: str) -> bool:
        """Remove an item from the character's inventory"""
        if item in self.inventory:
            self.inventory.remove(item)
            return True
        return False
    
    def get_spellcasting_ability(self) -> Optional[AbilityScore]:
        """Get the character's primary spellcasting ability"""
        if self.character_class and self.character_class.spell_ability:
            return self.character_class.spell_ability
        if self.race and self.race.spell_ability:
            return self.race.spell_ability
        return None
    
    def get_save_modifier(self, ability: AbilityScore) -> int:
        """Get saving throw modifier for an ability"""
        modifier = self.get_ability_modifier(ability)
        
        # Add proficiency if proficient in this save
        if (self.character_class and 
            ability in self.character_class.saving_throw_proficiencies):
            modifier += self.proficiency_bonus
            
        return modifier
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert character to dictionary for serialization"""
        return {
            'name': self.name,
            'player_name': self.player_name,
            'race': self.race.name if self.race else "",
            'character_class': self.character_class.name if self.character_class else "",
            'background': self.background.name if self.background else "",
            'level': self.level,
            'hit_points': self.hit_points,
            'max_hit_points': self.max_hit_points,
            'armor_class': self.armor_class,
            'proficiency_bonus': self.proficiency_bonus,
            'ability_scores': {
                ability.value: score 
                for ability, score in self.ability_scores.items()
            },
            'skills': [skill.value for skill in self.skill_proficiencies],
            'expertise': [skill.value for skill in self.expertise],
            'spells': [getattr(spell, 'name', str(spell)) for spell in self.spells],
            'inventory': self.inventory.copy(),
            'alignment': self.alignment,
            'experience_points': self.experience_points,
            'backstory': self.backstory,
            # VTT-specific data
            'sprite_id': self.sprite_id,
            'position_x': self.position_x,
            'position_y': self.position_y,
            'token_size': self.token_size,
            'visibility': self.visibility
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Character':
        """Create character from dictionary data"""
        character = cls(
            name=data.get('name', ''),
            level=data.get('level', 1),
            player_name=data.get('player_name', '')
        )
        
        # Restore ability scores
        if 'ability_scores' in data:
            for ability_name, score in data['ability_scores'].items():
                for ability in AbilityScore:
                    if ability.value == ability_name:
                        character.ability_scores[ability] = score
                        break
        
        # Restore other attributes
        character.hit_points = data.get('hit_points', 0)
        character.max_hit_points = data.get('max_hit_points', 0)
        character.armor_class = data.get('armor_class', 10)
        character.alignment = data.get('alignment', '')
        character.experience_points = data.get('experience_points', 0)
        character.backstory = data.get('backstory', '')
        character.inventory = data.get('inventory', [])
        
        # VTT-specific attributes
        character.sprite_id = data.get('sprite_id')
        character.position_x = data.get('position_x', 0.0)
        character.position_y = data.get('position_y', 0.0)
        character.token_size = data.get('token_size', 1)
        character.visibility = data.get('visibility', True)
        
        return character
    
    def update_calculated_values(self):
        """Update all calculated character values"""
        self.proficiency_bonus = self.calculate_proficiency_bonus()
        
        # Calculate hit points
        if self.character_class:
            # Use class-based hit points
            constitution_modifier = self.get_ability_modifier(AbilityScore.CONSTITUTION)
            self.max_hit_points = (self.character_class.hit_die + constitution_modifier) * self.level
        else:
            # Default hit points for characters without a class
            constitution_modifier = self.get_ability_modifier(AbilityScore.CONSTITUTION)
            self.max_hit_points = (8 + constitution_modifier) * self.level  # Default d8 hit die
        
        # Ensure minimum 1 HP per level
        self.max_hit_points = max(self.level, self.max_hit_points)
        
        # Set initial hit points if not already set
        if self.hit_points == 0:
            self.hit_points = self.max_hit_points


class Player(Character):
    """Player character with additional player-specific functionality"""
    
    def __init__(self, name: str = "", race: Optional[Race] = None,
                 character_class: Optional[CharacterClass] = None,
                 level: int = 1, player_name: str = "", 
                 char_class: Optional[CharacterClass] = None, **kwargs):
        super().__init__(name, race, character_class or char_class, level, player_name)
        self.is_player_character = True
        
        # Player-specific attributes
        self.session_notes: List[str] = []
        self.character_goals: List[str] = []
        self.bonds: List[str] = []
        self.ideals: List[str] = []
        self.flaws: List[str] = []
    
    def add_session_note(self, note: str) -> None:
        """Add a note from the current session"""
        self.session_notes.append(note)
    
    def add_character_goal(self, goal: str) -> None:
        """Add a character goal"""
        self.character_goals.append(goal)


class NPC(Character):
    """Non-player character with NPC-specific functionality"""
    
    def __init__(self, name: str = "", race: Optional[Race] = None,
                 character_class: Optional[CharacterClass] = None,
                 level: int = 1, role: str = "", 
                 char_class: Optional[CharacterClass] = None, **kwargs):
        super().__init__(name, race, character_class or char_class, level)
        self.is_player_character = False
        self.role = role  # e.g., 'villager', 'merchant', 'enemy', 'ally'
        
        # NPC-specific attributes
        self.attitude: str = "neutral"  # friendly, neutral, hostile
        self.disposition: str = "indifferent"  # helpful, indifferent, unfriendly
        self.dialogue: List[str] = []
        self.quest_giver: bool = False
        self.shop_inventory: List[str] = []
    
    def add_dialogue(self, dialogue: str) -> None:
        """Add dialogue option for this NPC"""
        self.dialogue.append(dialogue)
    
    def set_attitude(self, attitude: str) -> None:
        """Set NPC's attitude towards players"""
        if attitude in ['friendly', 'neutral', 'hostile']:
            self.attitude = attitude
    
    def add_shop_item(self, item: str) -> None:
        """Add item to NPC's shop inventory"""
        self.shop_inventory.append(item)