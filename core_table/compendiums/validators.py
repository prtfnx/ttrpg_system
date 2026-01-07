#!/usr/bin/env python3
"""
Pydantic validators for WebSocket message payloads
Provides type safety and validation for compendium operations
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List


class AttuneItemRequest(BaseModel):
    """Validate attunement request payload"""
    character_id: str = Field(min_length=1, description="Character UUID")
    item_name: str = Field(min_length=1, description="Equipment item name")
    
    @field_validator('character_id')
    @classmethod
    def validate_character_id(cls, v: str) -> str:
        if not v or v.strip() == '':
            raise ValueError("character_id cannot be empty")
        return v.strip()
    
    @field_validator('item_name')
    @classmethod
    def validate_item_name(cls, v: str) -> str:
        if not v or v.strip() == '':
            raise ValueError("item_name cannot be empty")
        return v.strip()


class CompendiumSearchRequest(BaseModel):
    """Validate compendium search payload"""
    query: str = Field(default="", description="Search query string")
    category: Optional[str] = Field(default=None, description="Filter by category: spells, classes, equipment, monsters")
    limit: int = Field(default=50, ge=1, le=1000, description="Maximum results to return")
    
    @field_validator('category')
    @classmethod
    def validate_category(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            valid_categories = {'spells', 'classes', 'equipment', 'monsters'}
            if v.lower() not in valid_categories:
                raise ValueError(f"category must be one of: {', '.join(valid_categories)}")
            return v.lower()
        return v


class SpellSearchRequest(BaseModel):
    """Validate spell search filters"""
    class_name: Optional[str] = Field(default=None, description="Filter by class")
    level: Optional[int] = Field(default=None, ge=0, le=9, description="Spell level (0-9)")
    school: Optional[str] = Field(default=None, description="School of magic")
    concentration: Optional[bool] = Field(default=None, description="Requires concentration")
    ritual: Optional[bool] = Field(default=None, description="Can be cast as ritual")
    
    @field_validator('school')
    @classmethod
    def validate_school(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            valid_schools = {
                'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
                'Evocation', 'Illusion', 'Necromancy', 'Transmutation'
            }
            # Case-insensitive match
            matched = next((s for s in valid_schools if s.lower() == v.lower()), None)
            if not matched:
                raise ValueError(f"school must be one of: {', '.join(valid_schools)}")
            return matched
        return v


class MonsterSearchRequest(BaseModel):
    """Validate monster search filters"""
    monster_type: Optional[str] = Field(default=None, description="Monster type (dragon, undead, etc)")
    cr: Optional[str] = Field(default=None, description="Challenge rating")
    min_cr: Optional[float] = Field(default=None, ge=0, le=30, description="Minimum CR")
    max_cr: Optional[float] = Field(default=None, ge=0, le=30, description="Maximum CR")
    is_legendary: Optional[bool] = Field(default=None, description="Legendary creatures only")
    
    @field_validator('cr')
    @classmethod
    def validate_cr(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            valid_crs = {
                '0', '1/8', '1/4', '1/2',
                '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
                '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
                '21', '22', '23', '24', '25', '26', '27', '28', '29', '30'
            }
            if v not in valid_crs:
                raise ValueError(f"Invalid CR value: {v}")
        return v


class EquipmentSearchRequest(BaseModel):
    """Validate equipment search filters"""
    equipment_type: Optional[str] = Field(default=None, description="Equipment type (weapon, armor, etc)")
    rarity: Optional[str] = Field(default=None, description="Magic item rarity")
    requires_attunement: Optional[bool] = Field(default=None, description="Requires attunement")
    is_magic: Optional[bool] = Field(default=None, description="Magic items only")
    
    @field_validator('rarity')
    @classmethod
    def validate_rarity(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            valid_rarities = {'common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'}
            if v.lower() not in valid_rarities:
                raise ValueError(f"rarity must be one of: {', '.join(valid_rarities)}")
            return v.lower()
        return v


class TreasureGenerateRequest(BaseModel):
    """Validate treasure generation request"""
    cr: int = Field(ge=0, le=30, description="Challenge rating")
    num_creatures: int = Field(default=1, ge=1, le=20, description="Number of creatures defeated")
    hoard: bool = Field(default=False, description="Generate hoard treasure")
