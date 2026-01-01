"""
Enhanced D&D 5e Monster model
"""

from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from enum import Enum


class MonsterType(Enum):
    """Monster creature types"""
    ABERRATION = "aberration"
    BEAST = "beast"
    CELESTIAL = "celestial"
    CONSTRUCT = "construct"
    DRAGON = "dragon"
    ELEMENTAL = "elemental"
    FEY = "fey"
    FIEND = "fiend"
    GIANT = "giant"
    HUMANOID = "humanoid"
    MONSTROSITY = "monstrosity"
    OOZE = "ooze"
    PLANT = "plant"
    UNDEAD = "undead"


class Size(Enum):
    """Creature size categories"""
    TINY = "T"
    SMALL = "S"
    MEDIUM = "M"
    LARGE = "L"
    HUGE = "H"
    GARGANTUAN = "G"
    
    @property
    def full_name(self) -> str:
        names = {
            "T": "Tiny", "S": "Small", "M": "Medium",
            "L": "Large", "H": "Huge", "G": "Gargantuan"
        }
        return names.get(self.value, self.value)


class Alignment(Enum):
    """Creature alignments"""
    LAWFUL_GOOD = "LG"
    NEUTRAL_GOOD = "NG"
    CHAOTIC_GOOD = "CG"
    LAWFUL_NEUTRAL = "LN"
    TRUE_NEUTRAL = "N"
    CHAOTIC_NEUTRAL = "CN"
    LAWFUL_EVIL = "LE"
    NEUTRAL_EVIL = "NE"
    CHAOTIC_EVIL = "CE"
    UNALIGNED = "U"
    ANY = "A"


@dataclass
class AbilityScores:
    """Monster ability scores"""
    strength: int = 10
    dexterity: int = 10
    constitution: int = 10
    intelligence: int = 10
    wisdom: int = 10
    charisma: int = 10
    
    def get_modifier(self, ability: str) -> int:
        """Calculate ability modifier"""
        score = getattr(self, ability.lower(), 10)
        return (score - 10) // 2
    
    def to_dict(self) -> Dict[str, int]:
        return {
            'str': self.strength,
            'dex': self.dexterity,
            'con': self.constitution,
            'int': self.intelligence,
            'wis': self.wisdom,
            'cha': self.charisma
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, int]) -> 'AbilityScores':
        return cls(
            strength=data.get('str', 10),
            dexterity=data.get('dex', 10),
            constitution=data.get('con', 10),
            intelligence=data.get('int', 10),
            wisdom=data.get('wis', 10),
            charisma=data.get('cha', 10)
        )


@dataclass
class MonsterAction:
    """Monster action (attack, ability, etc)"""
    name: str
    description: str
    attack_bonus: Optional[int] = None
    damage_dice: Optional[str] = None
    damage_type: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'desc': self.description,
            'attack': self.attack_bonus,
            'damage': self.damage_dice,
            'type': self.damage_type
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'MonsterAction':
        return cls(
            name=data.get('name', ''),
            description=data.get('desc', ''),
            attack_bonus=data.get('attack'),
            damage_dice=data.get('damage'),
            damage_type=data.get('type')
        )


@dataclass
class LegendaryAction:
    """Legendary action"""
    name: str
    description: str
    cost: int = 1
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'desc': self.description,
            'cost': self.cost
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'LegendaryAction':
        return cls(
            name=data.get('name', ''),
            description=data.get('desc', ''),
            cost=data.get('cost', 1)
        )


@dataclass
class LairAction:
    """Lair action for legendary creatures"""
    name: str
    description: str
    initiative: int = 20
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'desc': self.description,
            'init': self.initiative
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'LairAction':
        return cls(
            name=data.get('name', ''),
            description=data.get('desc', ''),
            initiative=data.get('init', 20)
        )


@dataclass
class RegionalEffect:
    """Regional effect for legendary creatures"""
    description: str
    radius: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'desc': self.description,
            'radius': self.radius
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'RegionalEffect':
        return cls(
            description=data.get('desc', ''),
            radius=data.get('radius')
        )


class Monster:
    """Enhanced D&D 5e monster"""
    
    def __init__(self):
        self.name: str = ""
        self.source: str = "MM"
        self.page: Optional[int] = None
        
        # Basic stats
        self.size: Size = Size.MEDIUM
        self.type: MonsterType = MonsterType.HUMANOID
        self.alignment: Alignment = Alignment.UNALIGNED
        
        # Defense
        self.armor_class: int = 10
        self.hit_points: int = 10
        self.hit_dice: str = "2d8"
        
        # Movement
        self.speed: Dict[str, int] = {"walk": 30}
        
        # Abilities
        self.abilities: AbilityScores = AbilityScores()
        
        # Proficiencies
        self.saving_throws: Dict[str, int] = {}
        self.skills: Dict[str, int] = {}
        
        # Resistances and immunities
        self.damage_vulnerabilities: List[str] = []
        self.damage_resistances: List[str] = []
        self.damage_immunities: List[str] = []
        self.condition_immunities: List[str] = []
        
        # Senses
        self.senses: Dict[str, int] = {}
        self.passive_perception: int = 10
        
        # Languages
        self.languages: List[str] = []
        
        # Challenge
        self.challenge_rating: str = "0"
        self.experience_points: int = 0
        
        # Traits
        self.traits: List[MonsterAction] = []
        
        # Actions
        self.actions: List[MonsterAction] = []
        self.bonus_actions: List[MonsterAction] = []
        self.reactions: List[MonsterAction] = []
        
        # Legendary creature features
        self.is_legendary: bool = False
        self.legendary_actions: List[LegendaryAction] = []
        self.legendary_actions_per_round: int = 3
        self.lair_actions: List[LairAction] = []
        self.regional_effects: List[RegionalEffect] = []
        
        # Spellcasting
        self.spellcasting: Optional[Dict[str, Any]] = None
        self.innate_spellcasting: Optional[Dict[str, Any]] = None
    
    def get_ability_modifier(self, ability: str) -> int:
        """Get ability modifier"""
        return self.abilities.get_modifier(ability)
    
    def get_proficiency_bonus(self) -> int:
        """Calculate proficiency bonus from CR"""
        cr_float = float(self.challenge_rating.replace("1/8", "0.125").replace("1/4", "0.25").replace("1/2", "0.5"))
        if cr_float < 5:
            return 2
        elif cr_float < 9:
            return 3
        elif cr_float < 13:
            return 4
        elif cr_float < 17:
            return 5
        elif cr_float < 21:
            return 6
        elif cr_float < 25:
            return 7
        elif cr_float < 29:
            return 8
        else:
            return 9
    
    def has_legendary_actions(self) -> bool:
        """Check if monster has legendary actions"""
        return len(self.legendary_actions) > 0
    
    def has_lair_actions(self) -> bool:
        """Check if monster has lair actions"""
        return len(self.lair_actions) > 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize for WebSocket transmission"""
        return {
            'name': self.name,
            'source': self.source,
            'page': self.page,
            'size': self.size.value,
            'type': self.type.value,
            'alignment': self.alignment.value,
            'ac': self.armor_class,
            'hp': self.hit_points,
            'hit_dice': self.hit_dice,
            'speed': self.speed,
            'abilities': self.abilities.to_dict(),
            'saves': self.saving_throws,
            'skills': self.skills,
            'vuln': self.damage_vulnerabilities,
            'resist': self.damage_resistances,
            'immune': self.damage_immunities,
            'cond_immune': self.condition_immunities,
            'senses': self.senses,
            'passive': self.passive_perception,
            'languages': self.languages,
            'cr': self.challenge_rating,
            'xp': self.experience_points,
            'traits': [t.to_dict() for t in self.traits],
            'actions': [a.to_dict() for a in self.actions],
            'bonus_actions': [b.to_dict() for b in self.bonus_actions],
            'reactions': [r.to_dict() for r in self.reactions],
            'is_legendary': self.is_legendary,
            'legendary': [l.to_dict() for l in self.legendary_actions],
            'legendary_per_round': self.legendary_actions_per_round,
            'lair': [l.to_dict() for l in self.lair_actions],
            'regional': [r.to_dict() for r in self.regional_effects],
            'spellcasting': self.spellcasting,
            'innate': self.innate_spellcasting
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Monster':
        """Deserialize from WebSocket message"""
        monster = cls()
        monster.name = data.get('name', '')
        monster.source = data.get('source', 'MM')
        monster.page = data.get('page')
        monster.size = Size(data.get('size', 'M'))
        monster.type = MonsterType(data.get('type', 'humanoid'))
        monster.alignment = Alignment(data.get('alignment', 'U'))
        monster.armor_class = data.get('ac', 10)
        monster.hit_points = data.get('hp', 10)
        monster.hit_dice = data.get('hit_dice', '2d8')
        monster.speed = data.get('speed', {"walk": 30})
        monster.abilities = AbilityScores.from_dict(data.get('abilities', {}))
        monster.saving_throws = data.get('saves', {})
        monster.skills = data.get('skills', {})
        monster.damage_vulnerabilities = data.get('vuln', [])
        monster.damage_resistances = data.get('resist', [])
        monster.damage_immunities = data.get('immune', [])
        monster.condition_immunities = data.get('cond_immune', [])
        monster.senses = data.get('senses', {})
        monster.passive_perception = data.get('passive', 10)
        monster.languages = data.get('languages', [])
        monster.challenge_rating = data.get('cr', '0')
        monster.experience_points = data.get('xp', 0)
        monster.traits = [MonsterAction.from_dict(t) for t in data.get('traits', [])]
        monster.actions = [MonsterAction.from_dict(a) for a in data.get('actions', [])]
        monster.bonus_actions = [MonsterAction.from_dict(b) for b in data.get('bonus_actions', [])]
        monster.reactions = [MonsterAction.from_dict(r) for r in data.get('reactions', [])]
        monster.is_legendary = data.get('is_legendary', False)
        monster.legendary_actions = [LegendaryAction.from_dict(l) for l in data.get('legendary', [])]
        monster.legendary_actions_per_round = data.get('legendary_per_round', 3)
        monster.lair_actions = [LairAction.from_dict(l) for l in data.get('lair', [])]
        monster.regional_effects = [RegionalEffect.from_dict(r) for r in data.get('regional', [])]
        monster.spellcasting = data.get('spellcasting')
        monster.innate_spellcasting = data.get('innate')
        
        return monster
    
    @classmethod
    def from_external_data(cls, data: Dict[str, Any]) -> 'Monster':
        """Parse external JSON format"""
        monster = cls()
        monster.name = data.get('name', '')
        monster.source = data.get('source', 'MM')
        monster.page = data.get('page')
        
        # Size, type, alignment
        size = data.get('size', ['M'])
        monster.size = Size(size[0] if isinstance(size, list) else size)
        
        type_data = data.get('type', 'humanoid')
        if isinstance(type_data, dict):
            monster.type = MonsterType(type_data.get('type', 'humanoid'))
        else:
            monster.type = MonsterType(type_data)
        
        alignment = data.get('alignment', ['U'])
        if isinstance(alignment, list) and alignment:
            align_str = alignment[0]
            if isinstance(align_str, dict):
                align_str = align_str.get('alignment', 'U')
            elif isinstance(align_str, list):
                align_str = align_str[0] if align_str else 'U'
            
            # Handle partial/special alignments
            if isinstance(align_str, str):
                align_map = {
                    'L': 'LN', 'N': 'N', 'C': 'CN', 'G': 'NG', 'E': 'NE',
                    'U': 'U', 'A': 'A', 'NX': 'N', 'NY': 'N'
                }
                if len(align_str) <= 2 and align_str in align_map:
                    align_str = align_map[align_str]
                try:
                    monster.alignment = Alignment(align_str)
                except ValueError:
                    monster.alignment = Alignment.UNALIGNED
            else:
                monster.alignment = Alignment.UNALIGNED
        else:
            monster.alignment = Alignment.UNALIGNED
        
        # AC
        ac_data = data.get('ac', [10])
        if isinstance(ac_data, list) and ac_data:
            if isinstance(ac_data[0], dict):
                monster.armor_class = ac_data[0].get('ac', 10)
            else:
                monster.armor_class = ac_data[0]
        
        # HP
        hp_data = data.get('hp', {})
        if isinstance(hp_data, dict):
            monster.hit_points = hp_data.get('average', 10)
            monster.hit_dice = hp_data.get('formula', '2d8')
        
        # Speed
        speed_data = data.get('speed', {})
        if isinstance(speed_data, dict):
            monster.speed = {k: v.get('number', v) if isinstance(v, dict) else v 
                           for k, v in speed_data.items() if k != 'canHover'}
        
        # Abilities
        monster.abilities = AbilityScores(
            strength=data.get('str', 10),
            dexterity=data.get('dex', 10),
            constitution=data.get('con', 10),
            intelligence=data.get('int', 10),
            wisdom=data.get('wis', 10),
            charisma=data.get('cha', 10)
        )
        
        # Saves and skills
        save_data = data.get('save', {})
        monster.saving_throws = {k: int(v.replace('+', '')) for k, v in save_data.items()}
        
        skill_data = data.get('skill', {})
        monster.skills = {k: int(v.replace('+', '')) for k, v in skill_data.items()}
        
        # Resistances
        monster.damage_vulnerabilities = data.get('vulnerable', [])
        monster.damage_resistances = data.get('resist', [])
        monster.damage_immunities = data.get('immune', [])
        monster.condition_immunities = data.get('conditionImmune', [])
        
        # Senses
        senses_data = data.get('senses', [])
        if isinstance(senses_data, list):
            for sense in senses_data:
                if isinstance(sense, str):
                    parts = sense.split()
                    if len(parts) >= 2:
                        sense_name = parts[0].lower()
                        try:
                            value = int(''.join(c for c in parts[1] if c.isdigit()))
                            monster.senses[sense_name] = value
                        except:
                            pass
        
        monster.passive_perception = data.get('passive', 10)
        
        # Languages
        languages = data.get('languages', [])
        if isinstance(languages, list):
            monster.languages = [lang if isinstance(lang, str) else str(lang) for lang in languages]
        
        # CR
        cr = data.get('cr', '0')
        if isinstance(cr, dict):
            monster.challenge_rating = cr.get('cr', '0')
        else:
            monster.challenge_rating = str(cr)
        
        # Traits
        trait_data = data.get('trait', [])
        for trait in trait_data:
            if isinstance(trait, dict):
                entries = trait.get('entries', [])
                desc = '\n'.join([e if isinstance(e, str) else str(e) for e in entries])
                monster.traits.append(MonsterAction(
                    name=trait.get('name', ''),
                    description=desc
                ))
        
        # Actions
        action_data = data.get('action', [])
        for action in action_data:
            if isinstance(action, dict):
                entries = action.get('entries', [])
                desc = '\n'.join([e if isinstance(e, str) else str(e) for e in entries])
                monster.actions.append(MonsterAction(
                    name=action.get('name', ''),
                    description=desc
                ))
        
        # Legendary actions
        legendary_data = data.get('legendary', [])
        if legendary_data:
            monster.is_legendary = True
            for legendary in legendary_data:
                if isinstance(legendary, dict):
                    entries = legendary.get('entries', [])
                    desc = '\n'.join([e if isinstance(e, str) else str(e) for e in entries])
                    monster.legendary_actions.append(LegendaryAction(
                        name=legendary.get('name', ''),
                        description=desc
                    ))
        
        # Lair actions
        lair_data = data.get('legendaryGroup', {}).get('lairActions', []) if data.get('legendaryGroup') else []
        for lair in lair_data:
            if isinstance(lair, str):
                monster.lair_actions.append(LairAction(
                    name="Lair Action",
                    description=lair
                ))
        
        return monster
