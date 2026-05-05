# This file contains the definitions of various entities in the game, including spells and walls.
from __future__ import annotations

import uuid
from typing import Optional


class Spell:
    def __init__(self, name, description, level, sprite=None, stat='INT', damage=5, speed=1):
        self.name = name
        self.description = description
        self.level = level
        self.sprite = sprite
        self.stat = stat
        self.damage = damage
        self.speed = speed

    def __repr__(self):
        return f"Spell(name={self.name}, description={self.description}, level={self.level}, sprite={self.sprite}, stat={self.stat})"


# Wall types and their default blocking behaviour
WALL_TYPE_DEFAULTS: dict[str, dict] = {
    'normal':    {'blocks_movement': True,  'blocks_light': True,  'blocks_sight': True,  'blocks_sound': True},
    'terrain':   {'blocks_movement': True,  'blocks_light': False, 'blocks_sight': False, 'blocks_sound': False},
    'invisible': {'blocks_movement': True,  'blocks_light': False, 'blocks_sight': False, 'blocks_sound': False},
    'ethereal':  {'blocks_movement': False, 'blocks_light': True,  'blocks_sight': True,  'blocks_sound': False},
    'window':    {'blocks_movement': True,  'blocks_light': False, 'blocks_sight': False, 'blocks_sound': False},
}


class Wall:
    """A wall segment defined by two endpoints.

    Walls are first-class entities, separate from sprites.  They feed directly
    into the lighting and vision pipeline as line-segment obstacles.
    """

    def __init__(
        self,
        table_id: str,
        x1: float, y1: float,
        x2: float, y2: float,
        wall_type: str = 'normal',
        blocks_movement: Optional[bool] = None,
        blocks_light: Optional[bool] = None,
        blocks_sight: Optional[bool] = None,
        blocks_sound: Optional[bool] = None,
        is_door: bool = False,
        door_state: str = 'closed',  # 'closed' | 'open' | 'locked'
        is_secret: bool = False,
        direction: str = 'both',     # 'both' | 'left' | 'right'
        created_by: Optional[int] = None,
        wall_id: Optional[str] = None,
    ):
        self.wall_id = wall_id or str(uuid.uuid4())
        self.table_id = table_id
        self.x1, self.y1 = x1, y1
        self.x2, self.y2 = x2, y2
        self.wall_type = wall_type

        defaults = WALL_TYPE_DEFAULTS.get(wall_type, WALL_TYPE_DEFAULTS['normal'])
        self.blocks_movement = blocks_movement if blocks_movement is not None else defaults['blocks_movement']
        self.blocks_light    = blocks_light    if blocks_light    is not None else defaults['blocks_light']
        self.blocks_sight    = blocks_sight    if blocks_sight    is not None else defaults['blocks_sight']
        self.blocks_sound    = blocks_sound    if blocks_sound    is not None else defaults['blocks_sound']

        self.is_door    = is_door
        self.door_state = door_state
        self.is_secret  = is_secret
        self.direction  = direction
        self.created_by = created_by

    def to_dict(self) -> dict:
        return {
            'wall_id':        self.wall_id,
            'table_id':       self.table_id,
            'x1': self.x1, 'y1': self.y1,
            'x2': self.x2, 'y2': self.y2,
            'wall_type':      self.wall_type,
            'blocks_movement': self.blocks_movement,
            'blocks_light':   self.blocks_light,
            'blocks_sight':   self.blocks_sight,
            'blocks_sound':   self.blocks_sound,
            'is_door':        self.is_door,
            'door_state':     self.door_state,
            'is_secret':      self.is_secret,
            'direction':      self.direction,
        }

    @classmethod
    def from_dict(cls, data: dict) -> Wall:
        return cls(
            table_id=data['table_id'],
            x1=float(data['x1']), y1=float(data['y1']),
            x2=float(data['x2']), y2=float(data['y2']),
            wall_type=data.get('wall_type', 'normal'),
            blocks_movement=data.get('blocks_movement'),
            blocks_light=data.get('blocks_light'),
            blocks_sight=data.get('blocks_sight'),
            blocks_sound=data.get('blocks_sound'),
            is_door=data.get('is_door', False),
            door_state=data.get('door_state', 'closed'),
            is_secret=data.get('is_secret', False),
            direction=data.get('direction', 'both'),
            created_by=data.get('created_by'),
            wall_id=data.get('wall_id'),
        )

    def __repr__(self) -> str:
        return (
            f"Wall(id={self.wall_id!r}, table={self.table_id!r}, "
            f"({self.x1},{self.y1})->({self.x2},{self.y2}), type={self.wall_type!r})"
        )
