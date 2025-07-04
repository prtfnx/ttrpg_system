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
        
        # Combat-specific attributes
        self.temporary_hit_points: int = 0
        self.death_save_successes: List[bool] = [False, False, False]
        self.death_save_failures: List[bool] = [False, False, False]
        self.inspiration: bool = False
        self.speed: int = 30  # Base movement speed
        self.initiative: int = 0  # Initiative modifier
        self.hit_dice: str = "1d8"  # Hit dice remaining
        self.total_hit_dice: str = "1d8"  # Total hit dice
        
        # Initialize calculated values
        self.update_calculated_values()
        
        # Ensure character has hit points if they have a class
        if self.character_class and self.hit_points == 0:
            self.hit_points = self.max_hit_points
    
    def take_damage(self, amount: int) -> Dict[str, Any]:
        """Apply damage to the character and return damage result"""
        if amount <= 0:
            return {'damage_taken': 0, 'temp_damage': 0, 'hp_damage': 0, 'status': 'no_damage'}
        
        # Apply damage to temporary HP first
        temp_damage = min(amount, self.temporary_hit_points)
        self.temporary_hit_points -= temp_damage
        remaining_damage = amount - temp_damage
        
        # Apply remaining damage to actual HP
        hp_damage = min(remaining_damage, self.hit_points)
        self.hit_points -= hp_damage
        
        # Check for massive damage (damage >= max HP while at full HP)
        was_at_full_hp = (self.hit_points + hp_damage) == self.max_hit_points
        massive_damage = was_at_full_hp and amount >= self.max_hit_points
        
        # Reset death saves when taking damage while conscious
        if self.hit_points > 0:
            self.reset_death_saves()
        
        return {
            'damage_taken': amount,
            'temp_damage': temp_damage,
            'hp_damage': hp_damage,
            'massive_damage': massive_damage,
            'status': 'dead' if massive_damage else ('unconscious' if self.hit_points == 0 else 'conscious')
        }
    
    def heal(self, amount: int) -> int:
        """Heal the character and return actual healing done"""
        if amount <= 0:
            return 0
            
        actual_healing = min(amount, self.max_hit_points - self.hit_points)
        old_hp = self.hit_points
        self.hit_points = min(self.max_hit_points, self.hit_points + amount)
        
        # Reset death saves if character regains consciousness
        if old_hp == 0 and self.hit_points > 0:
            self.reset_death_saves()
            
        return actual_healing
    
    def is_alive(self) -> bool:
        """Check if character is alive"""
        return self.hit_points > 0
    
    def is_conscious(self) -> bool:
        """Check if character is conscious (not unconscious or dead)"""
        return self.hit_points > 0
    
    def is_dying(self) -> bool:
        """Check if character is dying (0 HP but not dead)"""
        return self.hit_points == 0 and not self.is_dead()
    
    def is_dead(self) -> bool:
        """Check if character is dead (3 death save failures or massive damage)"""
        return sum(self.death_save_failures) >= 3
    
    def is_stable(self) -> bool:
        """Check if character is stable (3 death save successes)"""
        return sum(self.death_save_successes) >= 3
    
    def make_death_save(self, roll: int) -> Dict[str, Any]:
        """Make a death saving throw and return the result"""
        if not self.is_dying():
            return {
                'success': False,
                'message': f"{self.name} is not dying and doesn't need death saves.",
                'result': 'not_applicable'
            }
        
        # Natural 20 restores 1 HP
        if roll == 20:
            self.hit_points = 1
            self.reset_death_saves()
            return {
                'success': True,
                'message': f"{self.name} rolled a natural 20 and recovers with 1 HP!",
                'result': 'recovered'
            }
        
        # Natural 1 counts as 2 failures
        if roll == 1:
            for i in range(2):
                for j in range(3):
                    if not self.death_save_failures[j]:
                        self.death_save_failures[j] = True
                        break
            message = f"{self.name} rolled a natural 1 (2 failures)!"
        # Success (10 or higher)
        elif roll >= 10:
            for i in range(3):
                if not self.death_save_successes[i]:
                    self.death_save_successes[i] = True
                    break
            message = f"{self.name} succeeded on death save (rolled {roll})!"
        # Failure (2-9)
        else:
            for i in range(3):
                if not self.death_save_failures[i]:
                    self.death_save_failures[i] = True
                    break
            message = f"{self.name} failed death save (rolled {roll})!"
        
        # Check results
        if self.is_dead():
            return {
                'success': True,
                'message': message + f" {self.name} has died.",
                'result': 'dead'
            }
        elif self.is_stable():
            return {
                'success': True,
                'message': message + f" {self.name} is now stable.",
                'result': 'stable'
            }
        else:
            successes = sum(self.death_save_successes)
            failures = sum(self.death_save_failures)
            return {
                'success': True,
                'message': message + f" ({successes} successes, {failures} failures)",
                'result': 'continuing'
            }
    
    def reset_death_saves(self) -> None:
        """Reset all death saves (called when character regains HP)"""
        self.death_save_successes = [False, False, False]
        self.death_save_failures = [False, False, False]
    
    def add_temporary_hp(self, amount: int) -> None:
        """Add temporary hit points (doesn't stack, takes higher value)"""
        self.temporary_hit_points = max(self.temporary_hit_points, amount)
    
    def get_total_hp(self) -> int:
        """Get total effective hit points including temporary HP"""
        return self.hit_points + self.temporary_hit_points
    
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
            'temporary_hit_points': self.temporary_hit_points,
            'armor_class': self.armor_class,
            'proficiency_bonus': self.proficiency_bonus,
            'speed': self.speed,
            'initiative': self.initiative,
            'inspiration': self.inspiration,
            'hit_dice': self.hit_dice,
            'total_hit_dice': self.total_hit_dice,
            'death_save_successes': self.death_save_successes.copy(),
            'death_save_failures': self.death_save_failures.copy(),
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
        character.temporary_hit_points = data.get('temporary_hit_points', 0)
        character.armor_class = data.get('armor_class', 10)
        character.speed = data.get('speed', 30)
        character.initiative = data.get('initiative', 0)
        character.inspiration = data.get('inspiration', False)
        character.hit_dice = data.get('hit_dice', '1d8')
        character.total_hit_dice = data.get('total_hit_dice', '1d8')
        character.death_save_successes = data.get('death_save_successes', [False, False, False])
        character.death_save_failures = data.get('death_save_failures', [False, False, False])
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