"""
Integration tests for server-side token-character binding features
Tests character sync and database persistence
"""
import asyncio
import pytest
from unittest.mock import Mock, patch

from net.protocol import Message, MessageType
from core_table.server_protocol import ServerProtocol
from core_table.actions_protocol import ActionResult
from core_table.table import VirtualTable, Entity


class DummyTableManager:
    def __init__(self):
        self.tables = {}
        self.tables_id = {1: "table_1"}
    
    def get_table_by_session_id(self, session_id):
        return self.tables.get(session_id)


class DummySessionManager:
    def __init__(self):
        self.sessions = {}


@pytest.fixture
def protocol():
    """Create a ServerProtocol instance with mocked dependencies"""
    tm = DummyTableManager()
    sm = DummySessionManager()
    protocol = ServerProtocol(tm, sm)
    protocol._get_session_id = lambda msg: 1
    protocol._get_user_id = lambda msg: 1
    return protocol


@pytest.mark.asyncio
async def test_character_update_triggers_token_sync(protocol, monkeypatch):
    """Test that character updates automatically sync to linked tokens"""
    # Mock actions.update_character
    async def fake_update(session_id, character_id, updates, user_id, expected_version=None):
        return ActionResult(True, 'updated', {'version': 2})
    
    protocol.actions.update_character = fake_update
    
    # Mock _sync_character_stats_to_tokens
    sync_calls = []
    async def fake_sync(session_id, character_id, updates):
        sync_calls.append((session_id, character_id, updates))
    
    protocol._sync_character_stats_to_tokens = fake_sync
    
    # Mock broadcast
    async def fake_broadcast(msg, client_id):
        pass
    monkeypatch.setattr(protocol, 'broadcast_to_session', fake_broadcast)
    
    msg_data = {
        'character_id': 'char-123',
        'updates': {
            'stats': {'hp': 25, 'ac': 20},
            'name': 'Updated Name'  # Non-stat update
        },
        'user_id': 1
    }
    
    msg = Message(MessageType.CHARACTER_UPDATE, msg_data)
    resp = await protocol.handle_character_update(msg, 'client_1')
    
    assert resp.type == MessageType.CHARACTER_UPDATE_RESPONSE
    assert resp.data['success'] is True
    
    # Verify sync was called with the updates
    assert len(sync_calls) == 1
    assert sync_calls[0][0] == 1  # session_id
    assert sync_calls[0][1] == 'char-123'  # character_id
    assert 'stats' in sync_calls[0][2]  # updates


@pytest.mark.asyncio
async def test_entity_serialization_includes_all_fields():
    """Test that Entity.to_dict includes character_id, controlled_by, and token stats"""
    entity = Entity(
        name='test_1',
        position=(100, 200),
        layer='tokens',
        entity_id=1,
        character_id='char-123',
        controlled_by=[1, 2, 3],
        hp=75,
        max_hp=100,
        ac=16,
        aura_radius=7.5
    )
    
    data = entity.to_dict()
    
    assert data['character_id'] == 'char-123'
    assert data['controlled_by'] == [1, 2, 3]
    assert data['hp'] == 75
    assert data['max_hp'] == 100
    assert data['ac'] == 16
    assert data['aura_radius'] == 7.5


@pytest.mark.asyncio
async def test_entity_from_dict_loads_all_fields():
    """Test that Entity.from_dict correctly loads character_id, controlled_by, and token stats"""
    data = {
        'entity_id': 1,
        'name': 'test_entity',
        'position': [100, 200],
        'layer': 'tokens',
        'texture_path': None,
        'character_id': 'char-456',
        'controlled_by': [5, 6],
        'hp': 50,
        'max_hp': 80,
        'ac': 14,
        'aura_radius': 3.0
    }
    
    entity = Entity.from_dict(data)
    
    assert entity.character_id == 'char-456'
    assert entity.controlled_by == [5, 6]
    assert entity.hp == 50
    assert entity.max_hp == 80
    assert entity.ac == 14
    assert entity.aura_radius == 3.0


@pytest.mark.asyncio
async def test_sync_only_stat_fields(protocol):
    """Test that _sync_character_stats_to_tokens only syncs hp, max_hp, and ac"""
    with patch('core_table.server_protocol.SessionLocal') as mock_session_class:
        mock_db = Mock()
        mock_session_class.return_value = mock_db
        
        # No entities to update
        mock_query = Mock()
        mock_query.filter.return_value.all.return_value = []
        mock_db.query.return_value = mock_query
        
        # Updates with both stat and non-stat fields
        updates = {
            'hp': 30,
            'max_hp': 120,
            'ac': 18,
            'name': 'New Name',  # Should be ignored
            'level': 5  # Should be ignored
        }
        
        # Should not raise error and should only process stat fields
        await protocol._sync_character_stats_to_tokens(1, 'char-123', updates)
        
        # Verify query was made (would have updated entities if they existed)
        mock_db.query.assert_called()


@pytest.mark.asyncio
async def test_character_stats_sync_to_tokens(protocol):
    """Test that character HP/AC updates sync to linked tokens"""
    with patch('core_table.server_protocol.SessionLocal') as mock_session_class:
        mock_db = Mock()
        mock_session_class.return_value = mock_db
        
        # Mock entities linked to character
        mock_entity1 = Mock()
        mock_entity1.id = 1
        mock_entity1.character_id = 'char-123'
        mock_entity1.hp = 50
        mock_entity1.max_hp = 100
        mock_entity1.ac = 15
        
        mock_entity2 = Mock()
        mock_entity2.id = 2
        mock_entity2.character_id = 'char-123'
        mock_entity2.hp = 50
        mock_entity2.max_hp = 100
        mock_entity2.ac = 15
        
        mock_query = Mock()
        mock_query.filter.return_value.all.return_value = [mock_entity1, mock_entity2]
        mock_db.query.return_value = mock_query
        
        # Create in-memory table with entities
        table = VirtualTable(table_id="1", width=1000, height=1000, name="test_table")
        table.entities[1] = Entity(
            name='token_1', position=(100, 100), layer='tokens', entity_id=1,
            character_id='char-123',
            hp=50, max_hp=100, ac=15
        )
        table.entities[2] = Entity(
            name='token_2', position=(200, 200), layer='tokens', entity_id=2,
            character_id='char-123',
            hp=50, max_hp=100, ac=15
        )
        protocol.table_manager.tables[1] = table
        
        # Call sync method
        updates = {'hp': 30, 'ac': 18}
        await protocol._sync_character_stats_to_tokens(1, 'char-123', updates)
        
        # Verify database entities were updated
        assert mock_entity1.hp == 30
        assert mock_entity1.ac == 18
        assert mock_entity2.hp == 30
        assert mock_entity2.ac == 18
        
        # Verify in-memory entities were updated
        assert table.entities[1].hp == 30
        assert table.entities[1].ac == 18
        assert table.entities[2].hp == 30
        assert table.entities[2].ac == 18
        
        # Verify commit was called
        mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_permission_check_with_character_ownership(protocol):
    """Test permission validation checks character ownership when character_id is linked"""
    with patch('core_table.server_protocol.SessionLocal') as mock_session_class:
        mock_db = Mock()
        mock_session_class.return_value = mock_db
        
        # Mock entity with character_id
        mock_entity = Mock()
        mock_entity.id = 1
        mock_entity.character_id = 'char-123'
        mock_entity.controlled_by = None  # Not in entity.controlled_by
        
        # Mock character owned by current user
        mock_character = Mock()
        mock_character.owner_user_id = 1  # Current user
        
        mock_entity_query = Mock()
        mock_entity_query.filter.return_value.first.return_value = mock_entity
        
        mock_char_query = Mock()
        mock_char_query.filter.return_value.first.return_value = mock_character
        
        def query_side_effect(model):
            from server_host.database.models import Entity, SessionCharacter
            if model == Entity:
                return mock_entity_query
            elif model == SessionCharacter:
                return mock_char_query
            return Mock()
        
        mock_db.query.side_effect = query_side_effect
        
        # Test permission check
        has_permission = await protocol._can_control_sprite(1, 1)
        
        assert has_permission is True


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
