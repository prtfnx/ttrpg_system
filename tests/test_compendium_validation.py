#!/usr/bin/env python3
"""
Test suite for compendium exceptions and validators
"""

import pytest
from pydantic import ValidationError as PydanticValidationError

from core_table.compendiums.exceptions import (
    CompendiumError, DataNotFoundError, AttunementError, ValidationError
)
from core_table.compendiums.validators import (
    AttuneItemRequest, CompendiumSearchRequest, SpellSearchRequest,
    MonsterSearchRequest, EquipmentSearchRequest, TreasureGenerateRequest
)


class TestExceptions:
    """Test custom exception classes"""
    
    def test_compendium_error_basic(self):
        """Test basic CompendiumError"""
        error = CompendiumError("Test error", code="TEST_ERROR")
        assert error.message == "Test error"
        assert error.code == "TEST_ERROR"
        assert str(error) == "Test error"
    
    def test_compendium_error_to_dict(self):
        """Test error serialization to dict"""
        error = CompendiumError("Test error", code="TEST", details={'key': 'value'})
        error_dict = error.to_dict()
        
        assert error_dict['error'] == "Test error"
        assert error_dict['code'] == "TEST"
        assert error_dict['details']['key'] == 'value'
    
    def test_data_not_found_error(self):
        """Test DataNotFoundError"""
        error = DataNotFoundError('Spell', 'Fireball')
        assert "Spell 'Fireball' not found" in error.message
        assert error.code == "NOT_FOUND"
        assert error.details['item_type'] == 'Spell'
        assert error.details['name'] == 'Fireball'
    
    def test_attunement_error(self):
        """Test AttunementError"""
        error = AttunementError('char123', 'Ring of Protection', 'Already attuned to 3 items')
        assert 'char123' in error.message
        assert 'Ring of Protection' in error.message
        assert error.code == "ATTUNEMENT_ERROR"
        assert error.details['reason'] == 'Already attuned to 3 items'


class TestValidators:
    """Test Pydantic validator models"""
    
    def test_attune_item_request_valid(self):
        """Test valid attunement request"""
        request = AttuneItemRequest(
            character_id="char-123-456",
            item_name="Ring of Protection"
        )
        assert request.character_id == "char-123-456"
        assert request.item_name == "Ring of Protection"
    
    def test_attune_item_request_strips_whitespace(self):
        """Test whitespace stripping"""
        request = AttuneItemRequest(
            character_id="  char-123  ",
            item_name="  Ring of Protection  "
        )
        assert request.character_id == "char-123"
        assert request.item_name == "Ring of Protection"
    
    def test_attune_item_request_invalid_empty(self):
        """Test validation fails for empty fields"""
        with pytest.raises(PydanticValidationError):
            AttuneItemRequest(character_id="", item_name="Ring")
        
        with pytest.raises(PydanticValidationError):
            AttuneItemRequest(character_id="char123", item_name="")
    
    def test_compendium_search_request_defaults(self):
        """Test search request defaults"""
        request = CompendiumSearchRequest()
        assert request.query == ""
        assert request.category is None
        assert request.limit == 50
    
    def test_compendium_search_request_category_validation(self):
        """Test category validation"""
        request = CompendiumSearchRequest(category="spells")
        assert request.category == "spells"
        
        # Case insensitive
        request = CompendiumSearchRequest(category="EQUIPMENT")
        assert request.category == "equipment"
        
        # Invalid category
        with pytest.raises(PydanticValidationError):
            CompendiumSearchRequest(category="invalid")
    
    def test_spell_search_request_level_range(self):
        """Test spell level validation"""
        request = SpellSearchRequest(level=5)
        assert request.level == 5
        
        # Valid range 0-9
        request = SpellSearchRequest(level=0)
        assert request.level == 0
        
        # Out of range
        with pytest.raises(PydanticValidationError):
            SpellSearchRequest(level=10)
        
        with pytest.raises(PydanticValidationError):
            SpellSearchRequest(level=-1)
    
    def test_spell_search_request_school_validation(self):
        """Test school validation"""
        request = SpellSearchRequest(school="Evocation")
        assert request.school == "Evocation"
        
        # Case insensitive
        request = SpellSearchRequest(school="evocation")
        assert request.school == "Evocation"
        
        # Invalid school
        with pytest.raises(PydanticValidationError):
            SpellSearchRequest(school="InvalidSchool")
    
    def test_monster_search_request_cr_validation(self):
        """Test CR validation"""
        request = MonsterSearchRequest(cr="1/4")
        assert request.cr == "1/4"
        
        request = MonsterSearchRequest(cr="20")
        assert request.cr == "20"
        
        # Invalid CR
        with pytest.raises(PydanticValidationError):
            MonsterSearchRequest(cr="invalid")
    
    def test_monster_search_request_cr_range(self):
        """Test min/max CR range"""
        request = MonsterSearchRequest(min_cr=5, max_cr=15)
        assert request.min_cr == 5
        assert request.max_cr == 15
        
        # Out of range
        with pytest.raises(PydanticValidationError):
            MonsterSearchRequest(min_cr=-1)
        
        with pytest.raises(PydanticValidationError):
            MonsterSearchRequest(max_cr=35)
    
    def test_equipment_search_request_rarity(self):
        """Test rarity validation"""
        request = EquipmentSearchRequest(rarity="rare")
        assert request.rarity == "rare"
        
        # Case insensitive
        request = EquipmentSearchRequest(rarity="LEGENDARY")
        assert request.rarity == "legendary"
        
        # Invalid rarity
        with pytest.raises(PydanticValidationError):
            EquipmentSearchRequest(rarity="super rare")
    
    def test_treasure_generate_request_valid(self):
        """Test treasure generation validation"""
        request = TreasureGenerateRequest(cr=10, num_creatures=3, hoard=True)
        assert request.cr == 10
        assert request.num_creatures == 3
        assert request.hoard is True
    
    def test_treasure_generate_request_defaults(self):
        """Test treasure generation defaults"""
        request = TreasureGenerateRequest(cr=5)
        assert request.num_creatures == 1
        assert request.hoard is False
    
    def test_treasure_generate_request_ranges(self):
        """Test treasure generation ranges"""
        # Valid ranges
        request = TreasureGenerateRequest(cr=0, num_creatures=1)
        assert request.cr == 0
        
        request = TreasureGenerateRequest(cr=30, num_creatures=20)
        assert request.cr == 30
        
        # Out of range
        with pytest.raises(PydanticValidationError):
            TreasureGenerateRequest(cr=-1)
        
        with pytest.raises(PydanticValidationError):
            TreasureGenerateRequest(cr=31)
        
        with pytest.raises(PydanticValidationError):
            TreasureGenerateRequest(cr=10, num_creatures=0)
        
        with pytest.raises(PydanticValidationError):
            TreasureGenerateRequest(cr=10, num_creatures=21)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
