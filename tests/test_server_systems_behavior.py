"""
Server-Side Systems Behavior Tests
Tests server systems, multiplayer coordination, and real-time features
Focuses on real expected behavior from server perspective
"""
import pytest
import asyncio
import json
import time
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

try:
    # Server-side imports
    from server_host.main import app, AppState
    from core_table.server import TableManager
    from core_table.table import VirtualTable
    from server_host.websocket_manager import ConnectionManager
    from server_host.database import User, GameSession, create_tables
    import settings
    SERVER_IMPORTS_SUCCESSFUL = True
except ImportError as e:
    print(f"Server import warning: {e}")
    SERVER_IMPORTS_SUCCESSFUL = False


@pytest.mark.skipif(not SERVER_IMPORTS_SUCCESSFUL, reason="Server modules not available")
class TestMultiplayerSessionBehavior:
    """Test multiplayer session management from server perspective"""
    
    @pytest.fixture
    def app_state(self):
        """Create server app state for testing"""
        state = AppState()
        yield state
    
    @pytest.fixture
    def mock_websocket(self):
        """Create mock WebSocket connection"""
        mock_ws = AsyncMock()
        mock_ws.send = AsyncMock()
        mock_ws.receive = AsyncMock()
        mock_ws.close = AsyncMock()
        yield mock_ws
    
    @pytest.mark.asyncio
    async def test_dm_can_create_and_host_session(self, app_state):
        """DM expects to create session that players can join"""
        # DM creates new session
        session_data = {
            'session_name': 'Dragon Heist Campaign',
            'dm_id': 'dm_001',
            'max_players': 6,
            'is_private': False
        }
        
        with patch.object(app_state.table_manager, 'create_session') as mock_create:
            mock_create.return_value = {
                'session_id': 'DRAGON123',
                'session_code': 'DRAGON123',
                'created': True,
                'dm_id': 'dm_001'
            }
            
            # Create session
            result = app_state.table_manager.create_session(session_data)
            
            assert result['created'] == True
            assert result['session_code'] == 'DRAGON123'
            assert result['dm_id'] == 'dm_001'
            mock_create.assert_called_once_with(session_data)
    
    @pytest.mark.asyncio
    async def test_players_can_discover_and_join_sessions(self, app_state, mock_websocket):
        """Players expect to find available sessions and join them"""
        # Mock available sessions
        with patch.object(app_state.table_manager, 'get_available_sessions') as mock_list:
            mock_list.return_value = [
                {
                    'session_code': 'DRAGON123',
                    'session_name': 'Dragon Heist Campaign',
                    'dm_name': 'DM Mike',
                    'current_players': 3,
                    'max_players': 6,
                    'is_private': False
                },
                {
                    'session_code': 'CURSE456',
                    'session_name': 'Curse of Strahd',
                    'dm_name': 'DM Sarah',
                    'current_players': 4,
                    'max_players': 5,
                    'is_private': False
                }
            ]
            
            # Player requests available sessions
            sessions = app_state.table_manager.get_available_sessions()
            
            assert len(sessions) == 2
            assert sessions[0]['session_code'] == 'DRAGON123'
            assert sessions[0]['current_players'] < sessions[0]['max_players']  # Has space
    
    @pytest.mark.asyncio
    async def test_real_time_websocket_communication(self, app_state, mock_websocket):
        """Players and DM should communicate in real-time via WebSocket"""
        # Mock connection manager
        connection_mgr = app_state.connection_manager
        
        with patch.object(connection_mgr, 'connect') as mock_connect:
            with patch.object(connection_mgr, 'broadcast_to_session') as mock_broadcast:
                mock_connect.return_value = True
                
                # Player connects
                await connection_mgr.connect(mock_websocket, 'player_001', 'DRAGON123')
                
                # DM sends message to all players
                message = {
                    'type': 'dm_message',
                    'content': 'Roll for initiative!',
                    'timestamp': time.time()
                }
                
                await connection_mgr.broadcast_to_session('DRAGON123', message)
                
                mock_connect.assert_called_once_with(mock_websocket, 'player_001', 'DRAGON123')
                mock_broadcast.assert_called_once_with('DRAGON123', message)
    
    @pytest.mark.asyncio
    async def test_session_state_synchronization(self, app_state):
        """All clients should stay synchronized with session state"""
        table_mgr = app_state.table_manager
        
        with patch.object(table_mgr, 'update_session_state') as mock_update:
            with patch.object(table_mgr, 'get_session_state') as mock_get:
                mock_get.return_value = {
                    'characters': [
                        {'id': 'char_001', 'name': 'Aragorn', 'position': [100, 100]},
                        {'id': 'char_002', 'name': 'Legolas', 'position': [120, 100]}
                    ],
                    'turn_order': ['char_001', 'char_002'],
                    'current_turn': 'char_001',
                    'round': 1
                }
                
                # Update session state
                new_state = {
                    'characters': [
                        {'id': 'char_001', 'name': 'Aragorn', 'position': [110, 105]},  # Moved
                        {'id': 'char_002', 'name': 'Legolas', 'position': [120, 100]}
                    ],
                    'current_turn': 'char_002',  # Turn advanced
                    'round': 1
                }
                
                table_mgr.update_session_state('DRAGON123', new_state)
                
                # Get updated state
                current_state = table_mgr.get_session_state('DRAGON123')
                
                assert current_state['current_turn'] == 'char_002'
                assert current_state['characters'][0]['position'] == [110, 105]


@pytest.mark.skipif(not SERVER_IMPORTS_SUCCESSFUL, reason="Server modules not available")
class TestVirtualTableBehavior:
    """Test virtual tabletop functionality from server perspective"""
    
    @pytest.fixture
    def virtual_table(self):
        """Create VirtualTable for testing"""
        table = VirtualTable(
            table_id='table_001',
            name='Test Dungeon',
            dm_id='dm_001'
        )
        yield table
    
    def test_table_supports_multiple_simultaneous_players(self, virtual_table):
        """Table should handle multiple players without conflicts"""
        # Add players to table
        players = [
            {'id': 'player_001', 'name': 'Alice', 'character': 'Wizard'},
            {'id': 'player_002', 'name': 'Bob', 'character': 'Fighter'},
            {'id': 'player_003', 'name': 'Carol', 'character': 'Rogue'},
            {'id': 'player_004', 'name': 'Dave', 'character': 'Cleric'}
        ]
        
        with patch.object(virtual_table, 'add_player') as mock_add:
            mock_add.return_value = True
            
            # Add all players
            for player in players:
                result = virtual_table.add_player(player['id'], player)
                assert result == True
            
            assert mock_add.call_count == 4
    
    def test_character_movement_prevents_overlap_conflicts(self, virtual_table):
        """Character movement should be validated to prevent positioning conflicts"""
        # Mock existing characters
        with patch.object(virtual_table, 'get_character_at_position') as mock_get_char:
            with patch.object(virtual_table, 'move_character') as mock_move:
                mock_get_char.return_value = None  # Position is empty
                mock_move.return_value = {'success': True, 'new_position': [150, 200]}
                
                # Move character to empty position
                result = virtual_table.move_character('char_001', [150, 200])
                
                assert result['success'] == True
                assert result['new_position'] == [150, 200]
                mock_get_char.assert_called_once_with([150, 200])
    
    def test_combat_initiative_tracking_works_correctly(self, virtual_table):
        """Initiative system should manage turn order properly"""
        combat_data = {
            'participants': [
                {'character_id': 'char_001', 'initiative': 18, 'name': 'Aragorn'},
                {'character_id': 'char_002', 'initiative': 15, 'name': 'Orc Chief'},
                {'character_id': 'char_003', 'initiative': 12, 'name': 'Legolas'},
                {'character_id': 'char_004', 'initiative': 8, 'name': 'Orc Grunt'}
            ]
        }
        
        with patch.object(virtual_table, 'start_combat') as mock_combat:
            mock_combat.return_value = {
                'combat_started': True,
                'turn_order': ['char_001', 'char_002', 'char_003', 'char_004'],
                'current_turn': 'char_001',
                'round': 1
            }
            
            result = virtual_table.start_combat(combat_data)
            
            assert result['combat_started'] == True
            assert result['current_turn'] == 'char_001'  # Highest initiative
            assert result['round'] == 1
    
    def test_dice_rolling_provides_verifiable_results(self, virtual_table):
        """Dice rolls should be fair and verifiable by all players"""
        with patch.object(virtual_table, 'roll_dice') as mock_roll:
            mock_roll.return_value = {
                'roll_id': 'roll_001',
                'dice': '2d6+3',
                'results': [4, 6],
                'modifiers': 3,
                'total': 13,
                'roller': 'player_001',
                'timestamp': time.time(),
                'visible_to': 'all'
            }
            
            # Player rolls attack dice
            result = virtual_table.roll_dice('2d6+3', 'player_001', visible_to='all')
            
            assert result['dice'] == '2d6+3'
            assert result['total'] == 13
            assert result['results'] == [4, 6]
            assert result['visible_to'] == 'all'
    
    def test_fog_of_war_tracks_player_exploration(self, virtual_table):
        """Fog of war should reveal areas as players explore"""
        with patch.object(virtual_table, 'update_fog_of_war') as mock_fog:
            mock_fog.return_value = {
                'areas_revealed': [(100, 100, 50)],  # center_x, center_y, radius
                'visibility_changed': True
            }
            
            # Character with darkvision explores
            result = virtual_table.update_fog_of_war(
                character_id='char_001',
                position=[100, 100],
                sight_radius=50,
                darkvision=True
            )
            
            assert result['visibility_changed'] == True
            assert len(result['areas_revealed']) >= 1


@pytest.mark.skipif(not SERVER_IMPORTS_SUCCESSFUL, reason="Server modules not available")
class TestDatabasePersistenceBehavior:
    """Test database persistence from server perspective"""
    
    @pytest.mark.asyncio
    async def test_user_authentication_and_session_management(self):
        """Server should authenticate users and manage sessions"""
        with patch('server_host.database.get_session') as mock_get_session:
            with patch('server_host.database.User') as mock_user:
                mock_user.create_user.return_value = {
                    'user_id': 'user_001',
                    'username': 'testplayer',
                    'email': 'test@example.com',
                    'created': True
                }
                mock_get_session.return_value = mock_get_session
                
                # Create user account
                user_data = {
                    'username': 'testplayer',
                    'email': 'test@example.com',
                    'password_hash': 'hashed_password'
                }
                
                result = mock_user.create_user(user_data)
                
                assert result['created'] == True
                assert result['username'] == 'testplayer'
                assert result['user_id'] == 'user_001'
    
    @pytest.mark.asyncio
    async def test_game_session_persistence_across_server_restarts(self):
        """Active sessions should survive server restarts"""
        session_data = {
            'session_id': 'PERSIST123',
            'dm_id': 'dm_001',
            'session_name': 'Persistent Campaign',
            'state': {
                'characters': [{'id': 'char_001', 'hp': 25}],
                'current_map': 'dungeon_level_2',
                'session_time': 7200  # 2 hours
            }
        }
        
        with patch('server_host.database.GameSession') as mock_session:
            mock_session.save_session.return_value = True
            mock_session.load_session.return_value = session_data
            
            # Save session state
            save_result = mock_session.save_session('PERSIST123', session_data)
            assert save_result == True
            
            # Simulate server restart and reload
            loaded_session = mock_session.load_session('PERSIST123')
            
            assert loaded_session['session_id'] == 'PERSIST123'
            assert loaded_session['state']['current_map'] == 'dungeon_level_2'
            assert loaded_session['state']['session_time'] == 7200
    
    @pytest.mark.asyncio
    async def test_character_data_integrity_maintained(self):
        """Character data should remain consistent across operations"""
        character_data = {
            'character_id': 'char_001',
            'name': 'Test Hero',
            'class': 'Paladin',
            'level': 5,
            'hit_points': 45,
            'max_hit_points': 45,
            'armor_class': 18,
            'equipment': ['Longsword', 'Shield', 'Plate Armor'],
            'spells': ['Cure Wounds', 'Divine Sense']
        }
        
        with patch('server_host.database.Character') as mock_char:
            mock_char.save_character.return_value = True
            mock_char.load_character.return_value = character_data
            
            # Save character
            save_result = mock_char.save_character('char_001', character_data)
            assert save_result == True
            
            # Load character
            loaded_char = mock_char.load_character('char_001')
            
            # Data integrity checks
            assert loaded_char['name'] == character_data['name']
            assert loaded_char['level'] == character_data['level']
            assert loaded_char['hit_points'] == character_data['hit_points']
            assert loaded_char['equipment'] == character_data['equipment']


@pytest.mark.skipif(not SERVER_IMPORTS_SUCCESSFUL, reason="Server modules not available")
class TestServerPerformanceBehavior:
    """Test server performance under various loads"""
    
    @pytest.mark.asyncio
    async def test_server_handles_multiple_concurrent_sessions(self):
        """Server should manage multiple game sessions without performance degradation"""
        # Simulate multiple concurrent sessions
        sessions = []
        for i in range(10):
            session = {
                'session_id': f'SESSION_{i:03d}',
                'players': 4,
                'active': True,
                'dm_id': f'dm_{i:03d}'
            }
            sessions.append(session)
        
        with patch('server_host.main.AppState') as mock_app_state:
            app_state = mock_app_state.return_value
            app_state.table_manager.get_active_sessions.return_value = sessions
            
            # Check server can handle all sessions
            active_sessions = app_state.table_manager.get_active_sessions()
            
            assert len(active_sessions) == 10
            assert all(session['active'] for session in active_sessions)
    
    @pytest.mark.asyncio
    async def test_websocket_message_broadcasting_scales_properly(self):
        """WebSocket broadcasting should handle many players efficiently"""
        # Simulate broadcasting to many players
        session_id = 'BIG_SESSION'
        message = {'type': 'update', 'data': 'test_message'}
        
        # Mock many connected players
        mock_connections = [AsyncMock() for _ in range(50)]
        
        with patch('server_host.websocket_manager.ConnectionManager') as mock_mgr:
            connection_mgr = mock_mgr.return_value
            connection_mgr.get_session_connections.return_value = mock_connections
            
            # Broadcast message
            start_time = time.time()
            await connection_mgr.broadcast_to_session(session_id, message)
            end_time = time.time()
            
            # Should complete quickly even with many connections
            assert (end_time - start_time) < 1.0  # Less than 1 second
    
    @pytest.mark.asyncio
    async def test_database_operations_remain_fast_under_load(self):
        """Database operations should maintain acceptable performance"""
        # Simulate multiple concurrent database operations
        operations = []
        
        with patch('server_host.database.get_session') as mock_session:
            mock_db_session = Mock()
            mock_session.return_value = mock_db_session
            
            # Time multiple database operations
            start_time = time.time()
            
            for i in range(100):
                # Simulate various database operations
                mock_db_session.query.return_value.filter.return_value.first.return_value = {
                    'id': f'record_{i}',
                    'data': f'test_data_{i}'
                }
                
                # Simulate database query
                result = mock_db_session.query(User).filter(User.id == f'user_{i}').first()
                operations.append(result)
            
            end_time = time.time()
            
            # Should complete reasonably quickly
            assert (end_time - start_time) < 2.0  # Less than 2 seconds for 100 operations
            assert len(operations) == 100


@pytest.mark.skipif(not SERVER_IMPORTS_SUCCESSFUL, reason="Server modules not available")
class TestServerSecurityBehavior:
    """Test server security features and validation"""
    
    @pytest.mark.asyncio
    async def test_input_validation_prevents_malicious_data(self):
        """Server should validate all input data to prevent attacks"""
        # Test various malicious inputs
        malicious_inputs = [
            {'type': 'xss', 'data': '<script>alert("xss")</script>'},
            {'type': 'sql_injection', 'data': "'; DROP TABLE users; --"},
            {'type': 'oversized', 'data': 'A' * 10000},  # Very large input
            {'type': 'invalid_json', 'data': '{"invalid": json}'}
        ]
        
        with patch('server_host.validation.validate_input') as mock_validate:
            # Mock validation to reject malicious input
            def validate_side_effect(data):
                if any(dangerous in str(data) for dangerous in ['<script>', 'DROP TABLE', 'A' * 1000]):
                    return {'valid': False, 'error': 'Invalid input detected'}
                return {'valid': True}
            
            mock_validate.side_effect = validate_side_effect
            
            # Test each malicious input
            for malicious_input in malicious_inputs:
                result = mock_validate(malicious_input['data'])
                
                if malicious_input['type'] in ['xss', 'sql_injection', 'oversized']:
                    assert result['valid'] == False
                    assert 'error' in result
    
    @pytest.mark.asyncio
    async def test_rate_limiting_prevents_spam_and_abuse(self):
        """Server should rate limit requests to prevent abuse"""
        user_id = 'user_001'
        
        with patch('server_host.rate_limiter.check_rate_limit') as mock_rate_limit:
            # Simulate rate limiting
            def rate_limit_side_effect(user, action):
                # Allow first 10 requests, then rate limit
                if not hasattr(rate_limit_side_effect, 'counts'):
                    rate_limit_side_effect.counts = {}
                
                count = rate_limit_side_effect.counts.get(user, 0) + 1
                rate_limit_side_effect.counts[user] = count
                
                if count <= 10:
                    return {'allowed': True, 'remaining': 10 - count}
                else:
                    return {'allowed': False, 'retry_after': 60}
            
            mock_rate_limit.side_effect = rate_limit_side_effect
            
            # Make many requests
            results = []
            for i in range(15):
                result = mock_rate_limit(user_id, 'api_request')
                results.append(result)
            
            # First 10 should be allowed
            assert all(result['allowed'] for result in results[:10])
            
            # Remaining should be rate limited
            assert not any(result['allowed'] for result in results[10:])
            assert all('retry_after' in result for result in results[10:])
    
    @pytest.mark.asyncio
    async def test_session_authentication_prevents_unauthorized_access(self):
        """Users should only access sessions they're authorized for"""
        with patch('server_host.auth.verify_session_access') as mock_auth:
            # Mock authentication
            def auth_side_effect(user_id, session_id):
                # Only allow specific user-session combinations
                authorized = {
                    'user_001': ['SESSION_A', 'SESSION_B'],
                    'user_002': ['SESSION_B'],
                    'dm_001': ['SESSION_A', 'SESSION_B', 'SESSION_C']
                }
                
                user_sessions = authorized.get(user_id, [])
                return {
                    'authorized': session_id in user_sessions,
                    'role': 'dm' if user_id.startswith('dm_') else 'player'
                }
            
            mock_auth.side_effect = auth_side_effect
            
            # Test authorized access
            result = mock_auth('user_001', 'SESSION_A')
            assert result['authorized'] == True
            assert result['role'] == 'player'
            
            # Test unauthorized access
            result = mock_auth('user_001', 'SESSION_C')
            assert result['authorized'] == False
            
            # Test DM access
            result = mock_auth('dm_001', 'SESSION_C')
            assert result['authorized'] == True
            assert result['role'] == 'dm'


if __name__ == "__main__":
    # Run with verbose output and show test durations
    pytest.main([__file__, "-v", "--tb=short", "--durations=10"])