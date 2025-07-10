#!/usr/bin/env python3
"""
Character Creator Enums - Shared enumerations for character creation
"""

from enum import Enum


class CreationStep(Enum):
    RACE = 0
    CLASS = 1
    ABILITIES = 2
    BACKGROUND = 3
    PROFICIENCIES = 4
    EQUIPMENT = 5
    IMAGE = 6
    OVERVIEW = 7


class AbilityGenMethod(Enum):
    POINT_BUY = "point_buy"
    STANDARD_ARRAY = "standard_array"
    ROLL_4D6 = "roll_4d6"
    MANUAL = "manual"
