import pytest

@pytest.mark.integration
class TestCompendiumAccess:
    def test_compendium_list(self, client):
        """Compendium should be accessible without auth"""
        response = client.get("/compendium/")
        assert response.status_code == 200
        
    def test_compendium_category(self, client):
        response = client.get("/compendium/races")
        # Should return 200 or redirect
        assert response.status_code in [200, 302, 404]

@pytest.mark.integration  
class TestCompendiumData:
    def test_get_item_details(self, client):
        """Test retrieving specific compendium item"""
        response = client.get("/compendium/item/human")
        # May not exist in test, but should handle gracefully
        assert response.status_code in [200, 404]
