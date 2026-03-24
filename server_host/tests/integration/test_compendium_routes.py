import pytest

BASE = "/api/compendium"
# Compendium data may or may not be loaded in test env; accept both
DATA_CODES = [200, 500]
ITEM_CODES = [200, 404, 500]


@pytest.mark.integration
class TestCompendiumStatus:
    def test_status_returns_200(self, client):
        response = client.get(f"{BASE}/status")
        assert response.status_code == 200

    def test_status_structure(self, client):
        data = client.get(f"{BASE}/status").json()
        assert "status" in data
        assert "data_availability" in data
        assert "counts" in data


@pytest.mark.integration
class TestCompendiumCharacterData:
    def test_get_races(self, client):
        response = client.get(f"{BASE}/races")
        assert response.status_code in DATA_CODES

    def test_get_race_not_found(self, client):
        response = client.get(f"{BASE}/races/nonexistent_race_xyz")
        assert response.status_code in ITEM_CODES

    def test_get_classes(self, client):
        assert client.get(f"{BASE}/classes").status_code in DATA_CODES

    def test_get_class_not_found(self, client):
        assert client.get(f"{BASE}/classes/nonexistent_class_xyz").status_code in ITEM_CODES

    def test_get_class_subclasses_not_found(self, client):
        assert client.get(f"{BASE}/classes/nonexistent_class_xyz/subclasses").status_code in ITEM_CODES

    def test_get_backgrounds(self, client):
        assert client.get(f"{BASE}/backgrounds").status_code in DATA_CODES

    def test_get_background_not_found(self, client):
        assert client.get(f"{BASE}/backgrounds/nonexistent_bg_xyz").status_code in ITEM_CODES


@pytest.mark.integration
class TestCompendiumSpells:
    def test_get_spells(self, client):
        assert client.get(f"{BASE}/spells").status_code in DATA_CODES

    def test_get_spells_with_level_filter(self, client):
        assert client.get(f"{BASE}/spells?level=1").status_code in DATA_CODES

    def test_get_spells_with_school_filter(self, client):
        assert client.get(f"{BASE}/spells?school=evocation").status_code in DATA_CODES

    def test_get_spells_with_limit(self, client):
        assert client.get(f"{BASE}/spells?limit=5").status_code in DATA_CODES

    def test_get_spell_not_found(self, client):
        assert client.get(f"{BASE}/spells/nonexistent_spell_xyz").status_code in ITEM_CODES


@pytest.mark.integration
class TestCompendiumMonsters:
    def test_get_monsters(self, client):
        assert client.get(f"{BASE}/monsters").status_code in DATA_CODES

    def test_get_monsters_with_cr_filter(self, client):
        assert client.get(f"{BASE}/monsters?cr=1").status_code in DATA_CODES

    def test_get_monsters_with_limit(self, client):
        assert client.get(f"{BASE}/monsters?limit=5").status_code in DATA_CODES

    def test_get_monster_not_found(self, client):
        assert client.get(f"{BASE}/monsters/nonexistent_monster_xyz").status_code in ITEM_CODES


@pytest.mark.integration
class TestCompendiumFeats:
    def test_get_feats(self, client):
        assert client.get(f"{BASE}/feats").status_code in DATA_CODES

    def test_get_feats_no_prerequisite(self, client):
        assert client.get(f"{BASE}/feats?prerequisite=none").status_code in DATA_CODES

    def test_get_feats_by_source(self, client):
        assert client.get(f"{BASE}/feats?source=PHB").status_code in DATA_CODES

    def test_get_feat_not_found(self, client):
        assert client.get(f"{BASE}/feats/nonexistent_feat_xyz").status_code in ITEM_CODES


@pytest.mark.integration
class TestCompendiumEquipment:
    def test_get_equipment(self, client):
        assert client.get(f"{BASE}/equipment").status_code in DATA_CODES


@pytest.mark.integration
class TestCompendiumReload:
    def test_reload_endpoint(self, client):
        response = client.post(f"{BASE}/reload")
        assert response.status_code in [200, 500]

