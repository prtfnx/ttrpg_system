import pytest

BASE = "/api/compendium"


@pytest.fixture(autouse=True)
def deterministic_compendium(monkeypatch):
    """Exercise routes against a small artifact independent of ignored local data."""
    from routers.compendium import compendium_service

    data = {
        "character_data": {
            "races": [{"name": "Test Folk"}],
            "classes": [{"name": "Test Adept", "subclasses": []}],
            "backgrounds": [{"name": "Test Wanderer"}],
        },
        "spell_data": {
            "metadata": {"source": "test"},
            "spells": {
                "Test Spark": {
                    "name": "Test Spark",
                    "level": 1,
                    "school": "evocation",
                    "classes": ["Test Adept"],
                },
            },
        },
        "equipment_data": {
            "metadata": {"source": "test"},
            "equipment": {"tools": [{"name": "Test Tool"}]},
        },
        "bestiary_data": {
            "metadata": {"source": "test"},
            "monsters": {
                "Test Beast": {"name": "Test Beast", "challenge_rating": 1},
            },
        },
        "feats_data": {
            "feats": [{"name": "Test Talent", "prerequisite": None, "source": "TEST"}],
        },
    }
    monkeypatch.setattr(compendium_service, "data", data)
    monkeypatch.setattr(compendium_service, "artifact_version", "test-v1")
    monkeypatch.setattr(compendium_service, "verified", True)
    monkeypatch.setattr(compendium_service, "error_code", None)


@pytest.mark.integration
class TestCompendiumStatus:
    def test_status_returns_200(self, client):
        response = client.get(f"{BASE}/status")
        assert response.status_code == 200

    def test_status_structure(self, client):
        response = client.get(f"{BASE}/status")
        data = response.json()
        assert "status" in data
        assert "artifact_version" in data
        assert "verified" in data
        assert "data_availability" in data
        assert "counts" in data
        assert response.headers["cache-control"] == "no-store"


@pytest.mark.integration
class TestCompendiumCharacterData:
    def test_get_races(self, client):
        response = client.get(f"{BASE}/races")
        assert response.status_code == 200

    def test_get_race_not_found(self, client):
        response = client.get(f"{BASE}/races/nonexistent_race_xyz")
        assert response.status_code == 404

    def test_get_classes(self, client):
        assert client.get(f"{BASE}/classes").status_code == 200

    def test_get_class_not_found(self, client):
        assert client.get(f"{BASE}/classes/nonexistent_class_xyz").status_code == 404

    def test_get_class_subclasses_not_found(self, client):
        assert client.get(f"{BASE}/classes/nonexistent_class_xyz/subclasses").status_code == 404

    def test_get_backgrounds(self, client):
        assert client.get(f"{BASE}/backgrounds").status_code == 200

    def test_get_background_not_found(self, client):
        assert client.get(f"{BASE}/backgrounds/nonexistent_bg_xyz").status_code == 404


@pytest.mark.integration
class TestCompendiumSpells:
    def test_get_spells(self, client):
        assert client.get(f"{BASE}/spells").status_code == 200

    def test_get_spells_with_level_filter(self, client):
        assert client.get(f"{BASE}/spells?level=1").status_code == 200

    def test_get_spells_with_school_filter(self, client):
        assert client.get(f"{BASE}/spells?school=evocation").status_code == 200

    def test_get_spells_with_limit(self, client):
        response = client.get(f"{BASE}/spells?limit=5")
        assert response.status_code == 200
        assert response.json()["count"] <= 5
        assert response.headers["etag"]
        assert "max-age=300" in response.headers["cache-control"]

    def test_get_spells_rejects_unbounded_limit(self, client):
        assert client.get(f"{BASE}/spells?limit=501").status_code == 422

    def test_get_spell_not_found(self, client):
        assert client.get(f"{BASE}/spells/nonexistent_spell_xyz").status_code == 404


@pytest.mark.integration
class TestCompendiumMonsters:
    def test_get_monsters(self, client):
        assert client.get(f"{BASE}/monsters").status_code == 200

    def test_get_monsters_with_cr_filter(self, client):
        assert client.get(f"{BASE}/monsters?cr=1").status_code == 200

    def test_get_monsters_with_limit(self, client):
        assert client.get(f"{BASE}/monsters?limit=5").status_code == 200

    def test_get_monster_not_found(self, client):
        assert client.get(f"{BASE}/monsters/nonexistent_monster_xyz").status_code == 404


@pytest.mark.integration
class TestCompendiumFeats:
    def test_get_feats(self, client):
        assert client.get(f"{BASE}/feats").status_code == 200

    def test_get_feats_no_prerequisite(self, client):
        assert client.get(f"{BASE}/feats?prerequisite=none").status_code == 200

    def test_get_feats_by_source(self, client):
        assert client.get(f"{BASE}/feats?source=TEST").status_code == 200

    def test_get_feat_not_found(self, client):
        assert client.get(f"{BASE}/feats/nonexistent_feat_xyz").status_code == 404


@pytest.mark.integration
class TestCompendiumEquipment:
    def test_get_equipment(self, client):
        assert client.get(f"{BASE}/equipment").status_code == 200


@pytest.mark.integration
class TestCompendiumMutationBoundary:
    def test_reload_endpoint_is_not_exposed(self, client):
        response = client.post(f"{BASE}/reload")
        assert response.status_code == 404

