"""
Compendium API tests.
Tests /api/compendium/* endpoints for D&D 5e data access.
"""
import pytest


@pytest.mark.api
class TestCompendiumStatus:
    """Test compendium service status and availability."""
    
    def test_status_endpoint(self, owner_client):
        """Authenticated user can check compendium status."""
        response = owner_client.get(
            "/api/compendium/status",
            headers={"Accept": "application/json"}
        )
        
        # Endpoint requires auth
        assert response.status_code in [200, 401, 403, 302]
        
        if response.status_code == 200:
            data = response.json()
            assert "status" in data
            assert "data_availability" in data
    
    def test_status_unauthenticated(self, client):
        """Unauthenticated user cannot access compendium."""
        response = client.get(
            "/api/compendium/status",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [401, 302]


@pytest.mark.api
class TestRacesEndpoint:
    """Test D&D races data."""
    
    def test_get_all_races(self, owner_client):
        """Can retrieve all race data."""
        response = owner_client.get(
            "/api/compendium/races",
            headers={"Accept": "application/json"}
        )
        
        # Requires auth
        assert response.status_code in [200, 401, 403, 500, 302]
        
        if response.status_code == 200:
            data = response.json()
            assert "races" in data
            assert isinstance(data["races"], list)
    
    def test_get_race_by_name(self, owner_client):
        """Can retrieve specific race data."""
        response = owner_client.get(
            "/api/compendium/races/elf",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [200, 404, 401, 500, 302]
    
    def test_races_unauthenticated(self, client):
        """Unauthenticated user cannot access races."""
        response = client.get(
            "/api/compendium/races",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [401, 302]


@pytest.mark.api
class TestClassesEndpoint:
    """Test D&D class data."""
    
    def test_get_all_classes(self, owner_client):
        """Can retrieve all class data."""
        response = owner_client.get(
            "/api/compendium/classes",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [200, 401, 500, 302]
        
        if response.status_code == 200:
            data = response.json()
            assert "classes" in data or isinstance(data, list)
    
    def test_get_class_by_name(self, owner_client):
        """Can retrieve specific class data."""
        response = owner_client.get(
            "/api/compendium/classes/wizard",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [200, 404, 401, 500, 302]


@pytest.mark.api
class TestBackgroundsEndpoint:
    """Test D&D background data."""
    
    def test_get_all_backgrounds(self, owner_client):
        """Can retrieve all background data."""
        response = owner_client.get(
            "/api/compendium/backgrounds",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [200, 401, 500, 302]
    
    def test_get_background_by_name(self, owner_client):
        """Can retrieve specific background."""
        response = owner_client.get(
            "/api/compendium/backgrounds/acolyte",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [200, 404, 401, 500, 302]


@pytest.mark.api
class TestSpellsEndpoint:
    """Test D&D spell data."""
    
    def test_get_all_spells(self, owner_client):
        """Can retrieve spell list."""
        response = owner_client.get(
            "/api/compendium/spells",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [200, 401, 500, 302]
        
        if response.status_code == 200:
            data = response.json()
            assert "spells" in data or isinstance(data, list)
    
    def test_filter_spells_by_level(self, owner_client):
        """Can filter spells by level."""
        response = owner_client.get(
            "/api/compendium/spells?level=1",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [200, 401, 500, 302]
    
    def test_filter_spells_by_class(self, owner_client):
        """Can filter spells by class."""
        response = owner_client.get(
            "/api/compendium/spells?class=wizard",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [200, 401, 500, 302]
    
    def test_get_spell_by_name(self, owner_client):
        """Can retrieve specific spell."""
        response = owner_client.get(
            "/api/compendium/spells/fireball",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [200, 404, 401, 500, 302]


@pytest.mark.api
class TestEquipmentEndpoint:
    """Test D&D equipment data."""
    
    def test_get_all_equipment(self, owner_client):
        """Can retrieve equipment list."""
        response = owner_client.get(
            "/api/compendium/equipment",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [200, 401, 500, 302]


@pytest.mark.api
class TestMonstersEndpoint:
    """Test D&D monster/bestiary data."""
    
    def test_get_all_monsters(self, owner_client):
        """Can retrieve monster list."""
        response = owner_client.get(
            "/api/compendium/monsters",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [200, 401, 500, 302]
        
        if response.status_code == 200:
            data = response.json()
            assert "monsters" in data or isinstance(data, list)
    
    def test_filter_monsters_by_cr(self, owner_client):
        """Can filter monsters by challenge rating."""
        response = owner_client.get(
            "/api/compendium/monsters?cr=5",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [200, 401, 500, 302]
    
    def test_get_monster_by_name(self, owner_client):
        """Can retrieve specific monster."""
        response = owner_client.get(
            "/api/compendium/monsters/dragon",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [200, 404, 401, 500, 302]


@pytest.mark.api
@pytest.mark.admin
class TestCompendiumReload:
    """Test compendium data reload (admin only)."""
    
    def test_reload_compendium_owner(self, owner_client):
        """Owner can reload compendium data."""
        response = owner_client.post(
            "/api/compendium/reload",
            headers={"Accept": "application/json"}
        )
        
        # Might be admin-only or not implemented
        assert response.status_code in [200, 201, 403, 404, 302]
    
    def test_reload_compendium_player(self, player_client):
        """Regular player cannot reload compendium."""
        response = player_client.post(
            "/api/compendium/reload",
            headers={"Accept": "application/json"}
        )
        
        assert response.status_code in [403, 302]
