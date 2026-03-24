import pytest

@pytest.mark.integration
class TestCompendiumAccess:
    def test_compendium_list(self, client):
        """Compendium status should be accessible without auth"""
        response = client.get("/api/compendium/status")
        assert response.status_code == 200
        
    def test_compendium_category(self, client):
        response = client.get("/api/compendium/races")
        assert response.status_code in [200, 302, 404]

@pytest.mark.integration  
class TestCompendiumData:
    def test_get_item_details(self, client):
        """Test retrieving specific compendium item"""
        response = client.get("/api/compendium/races/human")
        assert response.status_code in [200, 404]
