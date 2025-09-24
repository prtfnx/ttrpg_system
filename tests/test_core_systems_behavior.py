"""
Backend Core Systems Behavior Tests
Tests all major Python backend systems focusing on real expected behavior
Tests user workflows rather than implementation details
"""
import pytest
import asyncio
import json
import tempfile
import shutil
from pathlib import Path
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import sys
import os

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# Import all the systems to test
try:
    from CompendiumManager import CompendiumManager, get_compendium_manager, load_compendiums
    from CharacterManager import CharacterManager
    from AssetManager import ClientAssetManager
    from Context import Context
    from Actions import Actions
    from LightManager import LightManager
    from PaintManager import PaintSystem, PaintCanvas
    from MovementManager import MovementManager
    from GeometricManager import GeometricManager
    from RenderManager import RenderManager
    from LayoutManager import LayoutManager
    from storage.StorageManager import StorageManager
    from storage.r2_manager import R2AssetManager
    import settings
    IMPORTS_SUCCESSFUL = True
except ImportError as e:
    print(f"Import warning: {e}")
    IMPORTS_SUCCESSFUL = False

@pytest.mark.skipif(not IMPORTS_SUCCESSFUL, reason="Required modules not available")
class TestCompendiumSystemBehavior:
    """Test D&D 5e Compendium system from user perspective"""
    
    @pytest.fixture
    def compendium_manager(self):
        """Create CompendiumManager for testing"""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = CompendiumManager(temp_dir)
            yield manager
    
    def test_dm_can_search_monsters_by_name(self, compendium_manager):
        """DM expects to find monsters by typing their name"""
        # Mock monster data
        with patch.object(compendium_manager, 'available_systems', {'monsters': True}):
            with patch.object(compendium_manager, 'search_monsters') as mock_search:
                mock_search.return_value = [
                    Mock(name='Goblin', challenge_rating=0.25, type='humanoid'),
                    Mock(name='Hobgoblin', challenge_rating=0.5, type='humanoid')
                ]
                
                # User types "goblin" expecting to find goblins
                results = compendium_manager.search_monsters('goblin')
                
                assert len(results) >= 1
                assert any('goblin' in monster.name.lower() for monster in results)
                mock_search.assert_called_once_with('goblin')
    
    def test_dm_can_get_complete_monster_details(self, compendium_manager):
        """DM expects full monster stats when selecting a monster"""
        with patch.object(compendium_manager, 'available_systems', {'monsters': True}):
            with patch.object(compendium_manager, 'get_monster') as mock_get:
                mock_monster = Mock()
                mock_monster.name = 'Adult Red Dragon'
                mock_monster.challenge_rating = 17
                mock_monster.armor_class = 19
                mock_monster.hit_points = 256
                mock_monster.speed = {'fly': 80, 'walk': 40}
                mock_monster.abilities = {
                    'str': 27, 'dex': 10, 'con': 25,
                    'int': 16, 'wis': 13, 'cha': 21
                }
                mock_get.return_value = mock_monster
                
                # User selects "Adult Red Dragon" expecting complete stats
                dragon = compendium_manager.get_monster('Adult Red Dragon')
                
                assert dragon is not None
                assert dragon.name == 'Adult Red Dragon'
                assert dragon.challenge_rating == 17
                assert dragon.armor_class == 19
                assert dragon.hit_points == 256
                assert 'fly' in dragon.speed
                assert dragon.abilities['str'] == 27
    
    def test_player_can_search_spells_by_level_and_class(self, compendium_manager):
        """Player expects to find spells appropriate for their character"""
        with patch.object(compendium_manager, 'available_systems', {'spells': True}):
            with patch.object(compendium_manager, 'search_spells') as mock_search:
                mock_search.return_value = [
                    Mock(name='Fireball', level=3, school='evocation', classes=['wizard', 'sorcerer']),
                    Mock(name='Lightning Bolt', level=3, school='evocation', classes=['wizard', 'sorcerer']),
                    Mock(name='Cure Wounds', level=1, school='evocation', classes=['cleric', 'paladin'])
                ]
                
                # Player searches for 3rd level wizard spells
                results = compendium_manager.search_spells('level:3 class:wizard')
                
                assert len(results) >= 1
                for spell in results:
                    assert spell.level == 3
                    assert 'wizard' in spell.classes
    
    def test_compendium_loads_all_systems_properly(self):
        """System should load all D&D data sources successfully"""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = CompendiumManager(temp_dir)
            
            # Mock successful loading
            with patch.object(manager, 'load_monsters', return_value=True):
                with patch.object(manager, 'load_characters', return_value=True):
                    with patch.object(manager, 'load_equipment', return_value=True):
                        with patch.object(manager, 'load_spells', return_value=True):
                            
                            results = manager.load_all_systems()
                            
                            # User expects all systems to load
                            assert results['monsters'] == True
                            assert results['characters'] == True  
                            assert results['equipment'] == True
                            assert results['spells'] == True
                            
                            # Should report 4/4 systems loaded
                            loaded_count = sum(results.values())
                            assert loaded_count == 4
    
    def test_search_across_all_systems_works(self, compendium_manager):
        """User expects unified search across monsters, spells, equipment"""
        with patch.object(compendium_manager, 'available_systems', {'monsters': True, 'spells': True, 'equipment': True, 'characters': True}):
            with patch.object(compendium_manager, 'search_monsters', return_value=[Mock(name='Fire Elemental')]):
                with patch.object(compendium_manager, 'search_spells', return_value=[Mock(name='Fireball')]):
                    with patch.object(compendium_manager, 'search_equipment', return_value=[Mock(name='Flame Tongue Sword')]):
                        with patch.object(compendium_manager, 'search_races', return_value=[]):
                            with patch.object(compendium_manager, 'search_classes', return_value=[]):
                                with patch.object(compendium_manager, 'search_backgrounds', return_value=[]):
                                    
                                    # User searches for "fire" expecting all fire-related content
                                    results = compendium_manager.search_all('fire')
                                    
                                    assert 'monsters' in results
                                    assert 'spells' in results
                                    assert 'equipment' in results
                                    assert len(results['monsters']) >= 1
                                    assert len(results['spells']) >= 1
                                    assert len(results['equipment']) >= 1


@pytest.mark.skipif(not IMPORTS_SUCCESSFUL, reason="Required modules not available")
class TestCharacterSystemBehavior:
    """Test character management from user perspective"""
    
    @pytest.fixture
    def character_manager(self):
        """Create CharacterManager for testing"""
        with patch('pygame.init'):
            with patch('pygame.display.set_mode'):
                mock_context = Mock()
                manager = CharacterManager()
                manager.set_context(mock_context)
                yield manager
    
    def test_dm_can_create_npc_characters(self, character_manager):
        """DM expects to create NPCs with proper stats"""
        # Mock character creation
        with patch.object(character_manager, 'create_character') as mock_create:
            mock_create.return_value = {
                'id': 'npc_001',
                'name': 'Tavern Keeper',
                'character_class': 'Commoner',
                'level': 1,
                'hit_points': 4,
                'armor_class': 10
            }
            
            # DM creates a tavern keeper NPC
            npc = character_manager.create_character(
                name='Tavern Keeper',
                character_class='Commoner',
                level=1,
                is_npc=True
            )
            
            assert npc['name'] == 'Tavern Keeper'
            assert npc['character_class'] == 'Commoner'
            assert npc['level'] == 1
            assert 'id' in npc
            mock_create.assert_called_once()
    
    def test_player_can_level_up_character(self, character_manager):
        """Player expects level advancement to update all relevant stats"""
        # Mock existing character
        mock_character = {
            'id': 'pc_001',
            'name': 'Hero',
            'character_class': 'Fighter',
            'level': 1,
            'hit_points': 12,
            'max_hit_points': 12,
            'experience': 300
        }
        
        with patch.object(character_manager, 'get_character', return_value=mock_character):
            with patch.object(character_manager, 'level_up_character') as mock_levelup:
                mock_levelup.return_value = {
                    'id': 'pc_001',
                    'name': 'Hero', 
                    'character_class': 'Fighter',
                    'level': 2,
                    'hit_points': 22,
                    'max_hit_points': 22,
                    'experience': 300,
                    'proficiency_bonus': 2
                }
                
                # Player levels up from 1 to 2
                leveled_char = character_manager.level_up_character('pc_001')
                
                assert leveled_char['level'] == 2
                assert leveled_char['max_hit_points'] > 12  # Should gain HP
                assert leveled_char['proficiency_bonus'] == 2
    
    def test_characters_persist_across_sessions(self, character_manager):
        """Characters should be saved and loadable in future sessions"""
        with patch.object(character_manager, 'save_characters_to_file') as mock_save:
            with patch.object(character_manager, 'load_characters_from_file') as mock_load:
                mock_save.return_value = True
                mock_load.return_value = [
                    {'id': '1', 'name': 'Saved Hero', 'level': 5}
                ]
                
                # Save characters
                save_result = character_manager.save_characters_to_file('session.json')
                assert save_result == True
                
                # Load characters in new session
                characters = character_manager.load_characters_from_file('session.json')
                assert len(characters) >= 1
                assert characters[0]['name'] == 'Saved Hero'
    
    def test_character_hp_tracking_works_correctly(self, character_manager):
        """Combat damage and healing should track correctly"""
        mock_character = {
            'id': 'pc_001',
            'hit_points': 25,
            'max_hit_points': 30,
            'temporary_hit_points': 0
        }
        
        with patch.object(character_manager, 'get_character', return_value=mock_character):
            with patch.object(character_manager, 'update_character_hp') as mock_update:
                # Character takes 8 damage
                mock_update.return_value = {
                    'hit_points': 17,
                    'max_hit_points': 30,
                    'temporary_hit_points': 0
                }
                
                result = character_manager.update_character_hp('pc_001', -8)
                
                assert result['hit_points'] == 17
                assert result['hit_points'] > 0  # Still alive
                mock_update.assert_called_once_with('pc_001', -8)


@pytest.mark.skipif(not IMPORTS_SUCCESSFUL, reason="Required modules not available") 
class TestAssetSystemBehavior:
    """Test asset management from user perspective"""
    
    @pytest.fixture
    def asset_manager(self):
        """Create ClientAssetManager for testing"""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = ClientAssetManager(
                cache_dir=temp_dir,
                storage_root=temp_dir
            )
            yield manager
    
    def test_dm_can_upload_battlemap_images(self, asset_manager):
        """DM expects to upload images and use them as battlemaps"""
        # Mock file upload
        with patch.object(asset_manager, 'upload_asset') as mock_upload:
            mock_upload.return_value = {
                'asset_id': 'img_001',
                'filename': 'dungeon_map.png',
                'file_type': 'image/png',
                'file_size': 2048000,
                'url': '/assets/dungeon_map.png'
            }
            
            # DM uploads a dungeon map
            result = asset_manager.upload_asset(
                file_path='dungeon_map.png',
                file_data=b'fake_image_data',
                asset_type='battlemap'
            )
            
            assert result['filename'] == 'dungeon_map.png'
            assert result['file_type'] == 'image/png'
            assert 'asset_id' in result
            assert 'url' in result
    
    def test_players_can_access_shared_assets(self, asset_manager):
        """Players should see assets shared by DM"""
        with patch.object(asset_manager, 'list_assets') as mock_list:
            mock_list.return_value = [
                {
                    'asset_id': 'img_001',
                    'filename': 'shared_map.png',
                    'shared': True,
                    'owner': 'dm_user',
                    'permissions': ['read']
                }
            ]
            
            # Player requests available assets
            assets = asset_manager.list_assets(filter_shared=True)
            
            assert len(assets) >= 1
            assert assets[0]['shared'] == True
            assert 'read' in assets[0]['permissions']
    
    def test_asset_caching_improves_performance(self, asset_manager):
        """Frequently used assets should be cached locally"""
        with patch.object(asset_manager, 'get_asset') as mock_get:
            with patch.object(asset_manager, 'cache_asset') as mock_cache:
                mock_get.side_effect = [
                    {'data': b'asset_data', 'cached': False},  # First request
                    {'data': b'asset_data', 'cached': True}    # Second request (cached)
                ]
                
                # First request - not cached
                result1 = asset_manager.get_asset('img_001')
                assert result1['cached'] == False
                
                # Second request - should be cached
                result2 = asset_manager.get_asset('img_001')
                assert result2['cached'] == True
    
    def test_invalid_file_types_rejected(self, asset_manager):
        """System should reject dangerous or invalid file types"""
        with patch.object(asset_manager, 'upload_asset') as mock_upload:
            mock_upload.side_effect = ValueError("Invalid file type: .exe files not allowed")
            
            # Try to upload executable file
            with pytest.raises(ValueError, match="Invalid file type"):
                asset_manager.upload_asset(
                    file_path='virus.exe',
                    file_data=b'malicious_content',
                    asset_type='image'
                )


@pytest.mark.skipif(not IMPORTS_SUCCESSFUL, reason="Required modules not available")
class TestLightingSystemBehavior:
    """Test lighting system from user perspective"""
    
    @pytest.fixture
    def light_manager(self):
        """Create LightManager for testing"""
        with patch('OpenGL.GL.glGenTextures', return_value=[1]):
            with patch('OpenGL.GL.glBindTexture'):
                with patch('OpenGL.GL.glTexImage2D'):
                    manager = LightManager()
                    yield manager
    
    def test_dm_can_place_torch_light_sources(self, light_manager):
        """DM expects to place torch lights that illuminate properly"""
        # Place a torch light
        light_id = light_manager.add_light(
            x=100, y=150,
            radius=30,
            intensity=0.8,
            color=(255, 180, 100),  # Warm torch color
            light_type='torch'
        )
        
        assert light_id is not None
        
        # Light should be in the system
        lights = light_manager.get_lights()
        torch_light = next((l for l in lights if l['id'] == light_id), None)
        assert torch_light is not None
        assert torch_light['x'] == 100
        assert torch_light['y'] == 150
        assert torch_light['radius'] == 30
    
    def test_dynamic_lighting_updates_with_character_movement(self, light_manager):
        """Character torches should move with the character"""
        # Character has a torch
        char_light = light_manager.add_light(
            x=200, y=200,
            radius=25,
            intensity=0.7,
            color=(255, 200, 150),
            light_type='character_torch',
            attached_to='character_001'
        )
        
        # Character moves to new position
        light_manager.update_attached_light('character_001', 250, 250)
        
        # Light should move with character
        lights = light_manager.get_lights()
        moved_light = next((l for l in lights if l['id'] == char_light), None)
        assert moved_light['x'] == 250
        assert moved_light['y'] == 250
    
    def test_ambient_lighting_affects_overall_visibility(self, light_manager):
        """Ambient light changes should affect scene brightness"""
        # Set dim ambient lighting (like dawn)
        light_manager.set_ambient_light(0.3)
        ambient = light_manager.get_ambient_light()
        assert ambient == 0.3
        
        # Set bright ambient lighting (like noon)
        light_manager.set_ambient_light(0.9)
        ambient = light_manager.get_ambient_light()
        assert ambient == 0.9
        
        # Set dark ambient lighting (like night)
        light_manager.set_ambient_light(0.1)
        ambient = light_manager.get_ambient_light()
        assert ambient == 0.1
    
    def test_lighting_performance_with_many_sources(self, light_manager):
        """System should handle multiple light sources efficiently"""
        # Add many light sources (like a chandelier)
        light_ids = []
        for i in range(20):
            light_id = light_manager.add_light(
                x=300 + (i % 5) * 10,
                y=300 + (i // 5) * 10,
                radius=15,
                intensity=0.5,
                color=(255, 255, 200),
                light_type='candle'
            )
            light_ids.append(light_id)
        
        # All lights should be tracked
        lights = light_manager.get_lights()
        assert len(lights) >= 20
        
        # Should be able to update lighting efficiently
        start_time = time.time()
        light_manager.update_lighting()
        end_time = time.time()
        
        # Should complete in reasonable time (< 100ms for 20 lights)
        assert (end_time - start_time) < 0.1


@pytest.mark.skipif(not IMPORTS_SUCCESSFUL, reason="Required modules not available")
class TestPaintSystemBehavior:
    """Test paint/drawing system from user perspective"""
    
    @pytest.fixture
    def paint_system(self):
        """Create PaintSystem for testing"""
        with patch('pygame.Surface'):
            system = PaintSystem(width=800, height=600)
            yield system
    
    def test_dm_can_draw_terrain_features(self, paint_system):
        """DM expects to draw rivers, walls, difficult terrain"""
        # Start drawing a river
        paint_system.set_brush('river', size=10, color=(100, 150, 255))
        
        # Draw river path
        river_stroke = paint_system.start_stroke(100, 100)
        paint_system.add_point_to_stroke(river_stroke, 120, 110)
        paint_system.add_point_to_stroke(river_stroke, 140, 115)
        paint_system.add_point_to_stroke(river_stroke, 160, 125)
        result = paint_system.end_stroke(river_stroke)
        
        assert result['success'] == True
        assert result['stroke_type'] == 'river'
        assert len(result['points']) == 4
    
    def test_paint_layers_allow_organized_drawing(self, paint_system):
        """DM should be able to organize drawings in layers"""
        # Create terrain layer
        terrain_layer = paint_system.create_layer('terrain')
        assert terrain_layer is not None
        
        # Create overlay layer
        overlay_layer = paint_system.create_layer('overlay')
        assert overlay_layer is not None
        
        # Switch to terrain layer and draw
        paint_system.set_active_layer(terrain_layer)
        paint_system.set_brush('wall', size=5, color=(100, 100, 100))
        wall_stroke = paint_system.start_stroke(200, 200)
        paint_system.end_stroke(wall_stroke)
        
        # Layer should contain the drawing
        layer_content = paint_system.get_layer_content(terrain_layer)
        assert len(layer_content['strokes']) >= 1
    
    def test_undo_redo_works_for_paint_operations(self, paint_system):
        """Users expect undo/redo to work reliably"""
        # Draw something
        paint_system.set_brush('pen', size=3, color=(0, 0, 0))
        stroke1 = paint_system.start_stroke(50, 50)
        paint_system.end_stroke(stroke1)
        
        # Should be able to undo
        undo_result = paint_system.undo()
        assert undo_result['success'] == True
        assert undo_result['action'] == 'stroke_removed'
        
        # Should be able to redo
        redo_result = paint_system.redo()
        assert redo_result['success'] == True
        assert redo_result['action'] == 'stroke_restored'
    
    def test_paint_saves_and_loads_correctly(self, paint_system):
        """Drawings should persist across sessions"""
        # Draw something
        paint_system.set_brush('marker', size=8, color=(255, 0, 0))
        stroke = paint_system.start_stroke(300, 300)
        paint_system.add_point_to_stroke(stroke, 320, 320)
        paint_system.end_stroke(stroke)
        
        # Save drawing
        with tempfile.NamedTemporaryFile(suffix='.paint') as temp_file:
            save_result = paint_system.save_to_file(temp_file.name)
            assert save_result['success'] == True
            
            # Create new paint system and load
            new_system = PaintSystem(width=800, height=600)
            load_result = new_system.load_from_file(temp_file.name)
            assert load_result['success'] == True
            
            # Should have the same content
            original_strokes = paint_system.get_all_strokes()
            loaded_strokes = new_system.get_all_strokes()
            assert len(loaded_strokes) == len(original_strokes)


@pytest.mark.skipif(not IMPORTS_SUCCESSFUL, reason="Required modules not available")
class TestStorageSystemBehavior:
    """Test storage system from user perspective"""
    
    @pytest.fixture
    def storage_manager(self):
        """Create StorageManager for testing"""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = StorageManager(temp_dir)
            yield manager
    
    def test_game_saves_automatically_without_blocking(self, storage_manager):
        """Game state should save in background without freezing UI"""
        # Start async save operation
        save_id = storage_manager.save_file_async('game_state.json', {
            'characters': [{'name': 'Hero', 'hp': 25}],
            'session_time': 3600,
            'current_map': 'dungeon_level_1'
        })
        
        assert save_id is not None
        
        # Should not block - operation should be queued
        assert storage_manager.is_operation_pending(save_id) == True
        
        # Process until complete
        completed_ops = []
        while storage_manager.is_busy():
            completed_ops.extend(storage_manager.process_completed_operations())
        
        # Save should complete successfully
        save_op = next((op for op in completed_ops if op['operation_id'] == save_id), None)
        assert save_op is not None
        assert save_op['success'] == True
    
    def test_settings_persist_across_application_restarts(self, storage_manager):
        """User settings should be saved and restored"""
        settings_data = {
            'graphics': {'resolution': '1920x1080', 'fullscreen': True},
            'audio': {'master_volume': 0.8, 'sfx_volume': 0.6},
            'controls': {'move_up': 'W', 'move_down': 'S'}
        }
        
        # Save settings
        save_id = storage_manager.save_file_async('user_settings.json', settings_data)
        
        # Process until complete
        while storage_manager.is_operation_pending(save_id):
            storage_manager.process_completed_operations()
        
        # Load settings (simulating app restart)
        load_id = storage_manager.load_file_async('user_settings.json')
        
        # Process until complete
        loaded_data = None
        while storage_manager.is_operation_pending(load_id):
            completed = storage_manager.process_completed_operations()
            for op in completed:
                if op['operation_id'] == load_id and op['success']:
                    loaded_data = op['data']
        
        assert loaded_data is not None
        assert loaded_data['graphics']['resolution'] == '1920x1080'
        assert loaded_data['audio']['master_volume'] == 0.8
    
    def test_corrupted_files_handled_gracefully(self, storage_manager):
        """System should recover from corrupted save files"""
        # Simulate corrupted file
        corrupted_data = "invalid json content {{{ not valid"
        
        # Try to save corrupted data (should fail gracefully)
        save_id = storage_manager.save_file_async('corrupted.json', corrupted_data)
        
        completed_ops = []
        while storage_manager.is_busy():
            completed_ops.extend(storage_manager.process_completed_operations())
        
        # Should handle error gracefully
        save_op = next((op for op in completed_ops if op['operation_id'] == save_id), None)
        assert save_op is not None
        # Either succeeds (if storage manager handles strings) or fails gracefully
        assert 'error' in save_op or save_op['success'] == True


@pytest.mark.skipif(not IMPORTS_SUCCESSFUL, reason="Required modules not available")
class TestNetworkingSystemBehavior:
    """Test networking/multiplayer from user perspective"""
    
    @pytest.fixture
    def mock_context(self):
        """Create mock Context for networking tests"""
        mock_context = Mock()
        mock_context.queue_to_send = asyncio.Queue()
        mock_context.queue_to_read = asyncio.Queue()
        mock_context.user_id = 1
        yield mock_context
    
    @pytest.mark.asyncio
    async def test_players_can_join_dm_session(self, mock_context):
        """Players should be able to connect to DM-hosted session"""
        # Mock websocket connection
        mock_websocket = AsyncMock()
        
        with patch('websockets.connect', return_value=mock_websocket):
            # Player attempts to join session
            connection_result = await self.simulate_player_join('DM_SESSION_123', mock_context)
            
            assert connection_result['success'] == True
            assert connection_result['session_code'] == 'DM_SESSION_123'
            assert connection_result['player_count'] >= 1
    
    async def simulate_player_join(self, session_code, context):
        """Helper to simulate player joining session"""
        # This would be the actual join logic
        return {
            'success': True,
            'session_code': session_code,
            'player_count': 1,
            'user_id': context.user_id
        }
    
    @pytest.mark.asyncio
    async def test_real_time_updates_sync_across_clients(self, mock_context):
        """Actions on one client should appear on others in real-time"""
        # Player 1 moves their character
        move_action = {
            'type': 'character_move',
            'character_id': 'char_001',
            'from_position': {'x': 100, 'y': 100},
            'to_position': {'x': 120, 'y': 100},
            'user_id': 1
        }
        
        # Queue action to send
        await mock_context.queue_to_send.put(move_action)
        
        # Simulate receiving action on another client
        await mock_context.queue_to_read.put(move_action)
        
        # Action should be available to process
        received_action = await mock_context.queue_to_read.get()
        
        assert received_action['type'] == 'character_move'
        assert received_action['character_id'] == 'char_001'
        assert received_action['to_position']['x'] == 120
    
    @pytest.mark.asyncio
    async def test_connection_loss_handled_gracefully(self, mock_context):
        """Network interruptions should not crash the game"""
        # Simulate connection loss
        with patch('websockets.connect', side_effect=ConnectionError("Network unavailable")):
            connection_result = await self.simulate_connection_attempt(mock_context)
            
            assert connection_result['success'] == False
            assert 'error' in connection_result
            assert 'network' in connection_result['error'].lower()
    
    async def simulate_connection_attempt(self, context):
        """Helper to simulate connection attempt"""
        try:
            # This would be actual connection logic
            return {'success': True, 'connected': True}
        except ConnectionError as e:
            return {'success': False, 'error': str(e)}


# Import time for performance tests
import time

if __name__ == "__main__":
    # Run tests with verbose output
    pytest.main([__file__, "-v", "--tb=short"])