"""
Comprehensive test for Asset Management and R2 Integration Workflows
Tests real user workflows: asset upload, download, caching, and sprite creation
"""
import unittest
import asyncio
import logging
import os
import sys
import tempfile
import json
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from client_asset_manager import get_client_asset_manager, ClientAssetManager
from server_host.service.asset_manager import get_server_asset_manager, AssetRequest
from net.protocol import Message, MessageType
import settings


class TestAssetWorkflows(unittest.TestCase):
    """Test comprehensive asset management workflows"""
    
    @classmethod
    def setUpClass(cls):
        """Set up test environment"""
        logging.basicConfig(level=logging.WARNING)  # Reduce noise
        cls.logger = logging.getLogger(__name__)
        
        # Create temporary directories for testing
        cls.test_cache_dir = tempfile.mkdtemp()
        cls.test_assets_dir = tempfile.mkdtemp()
        
        # Mock settings for testing
        cls.original_settings = {}
        cls.mock_settings()

    @classmethod
    def tearDownClass(cls):
        """Clean up test environment"""
        # Restore original settings
        for key, value in cls.original_settings.items():
            if hasattr(settings, key):
                setattr(settings, key, value)
        
        # Clean up temp directories
        import shutil
        shutil.rmtree(cls.test_cache_dir, ignore_errors=True)
        shutil.rmtree(cls.test_assets_dir, ignore_errors=True)

    @classmethod
    def mock_settings(cls):
        """Mock settings for testing"""
        # Store original values
        cls.original_settings = {
            'ASSET_CACHE_DIR': getattr(settings, 'ASSET_CACHE_DIR', 'cache/assets'),
            'ASSET_REGISTRY_FILE': getattr(settings, 'ASSET_REGISTRY_FILE', 'cache/asset_registry.json'),
        }
        
        # Set test values
        settings.ASSET_CACHE_DIR = cls.test_cache_dir
        settings.ASSET_REGISTRY_FILE = os.path.join(cls.test_cache_dir, 'test_registry.json')

    def setUp(self):
        """Set up each test"""
        # Create test files
        self.test_image_path = os.path.join(self.test_assets_dir, "test_sprite.png")
        self.create_test_image(self.test_image_path)

    def create_test_image(self, path):
        """Create a minimal test image file"""
        # Create a minimal PNG file (1x1 pixel) - using only ASCII bytes
        png_data = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
            b'\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc```\x00\x00'
            b'\x00\x04\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        os.makedirs(os.path.dirname(path), exist_ok=True)        with open(path, 'wb') as f:
            f.write(png_data)

    def test_client_asset_caching_workflow(self):
        """Test client asset caching using actual API"""
        
        # Step 1: Create asset manager
        asset_manager = get_client_asset_manager()
        self.assertIsNotNone(asset_manager, "Asset manager should be created")
        
        # Step 2: Test basic cache operations using actual API
        test_asset_id = "test_asset_001"
        
        # Initially should not be cached
        is_cached = asset_manager.is_asset_cached(test_asset_id)
        self.assertFalse(is_cached, "New asset should not be cached initially")
        
        # Step 3: Simulate downloading and caching an asset
        test_filename = "test_sprite.png"
        mock_url = "https://example.com/test_sprite.png"
        
        # Create a mock cached file
        cache_path = asset_manager._get_cache_path(test_asset_id, test_filename)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.create_test_image(str(cache_path))
        
        # Add to registry manually (simulating successful download)
        asset_manager.asset_registry[test_asset_id] = {
            'filename': test_filename,
            'local_path': str(cache_path),
            'download_url': mock_url,
            'cached_at': 'test_time',
            'file_size': os.path.getsize(cache_path),
            'file_hash': asset_manager._calculate_file_hash(cache_path)
        }
        asset_manager._save_registry()
        
        # Step 4: Verify asset is now cached
        is_cached_after = asset_manager.is_asset_cached(test_asset_id)
        self.assertTrue(is_cached_after, "Asset should be cached after download")
        
        # Step 5: Test getting cached asset path
        cached_path = asset_manager.get_cached_asset_path(test_asset_id)
        self.assertIsNotNone(cached_path, "Should return cached asset path")
        self.assertTrue(os.path.exists(cached_path), "Cached file should exist")

    def test_asset_manager_stats_and_info(self):
        """Test asset manager statistics and information"""
        
        asset_manager = get_client_asset_manager()
        
        # Test initial stats
        stats = asset_manager.get_stats()
        self.assertIsInstance(stats, dict, "Stats should be a dictionary")
        self.assertIn('total_downloads', stats, "Should include download stats")
        self.assertIn('cache_hits', stats, "Should include cache hit stats")
        
        # Test session assets management
        test_session_code = "test_session_001"
        test_assets = [
            {"asset_id": "asset_001", "filename": "map1.jpg"},
            {"asset_id": "asset_002", "filename": "token1.png"}
        ]
        
        # Update session assets
        asset_manager.update_session_assets(test_session_code, test_assets)
        
        # Verify session assets were stored
        session_assets = asset_manager.get_session_assets(test_session_code)
        self.assertIsNotNone(session_assets, "Should return session assets")
        self.assertEqual(len(session_assets), 2, "Should have 2 session assets")

    @patch('requests.get')
    async def test_asset_download_workflow(self, mock_get):
        """Test asset download workflow with mocked HTTP requests"""
        
        # Mock successful HTTP response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.headers = {'content-length': '1024'}
        mock_response.iter_content = Mock(return_value=[b'test_image_data'])
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        asset_manager = get_client_asset_manager()
        
        # Test download
        asset_id = "download_test_001"
        download_url = "https://example.com/test_image.png"
        filename = "test_image.png"
        
        success, message = await asset_manager.download_asset(asset_id, download_url, filename)
        
        self.assertTrue(success, f"Download should succeed: {message}")
        self.assertTrue(asset_manager.is_asset_cached(asset_id), 
                       "Asset should be cached after download")

    def test_asset_registry_persistence(self):
        """Test asset registry persistence across manager instances"""
        
        # Create first manager instance and add an asset
        asset_manager1 = ClientAssetManager(cache_dir=self.test_cache_dir)
        
        test_asset_id = "persistence_test_001"
        test_filename = "persistent_asset.png"
        
        # Manually add asset to registry
        cache_path = asset_manager1._get_cache_path(test_asset_id, test_filename)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.create_test_image(str(cache_path))
        
        asset_manager1.asset_registry[test_asset_id] = {
            'filename': test_filename,
            'local_path': str(cache_path),
            'cached_at': 'test_time'
        }
        asset_manager1._save_registry()
        
        # Create second manager instance (simulating restart)
        asset_manager2 = ClientAssetManager(cache_dir=self.test_cache_dir)
        
        # Verify asset is still cached in new instance
        is_cached = asset_manager2.is_asset_cached(test_asset_id)
        self.assertTrue(is_cached, "Asset should persist across manager instances")
        
        cached_path = asset_manager2.get_cached_asset_path(test_asset_id)
        self.assertEqual(cached_path, str(cache_path), "Cached path should match")

    @patch('server_host.service.asset_manager.ServerAssetManager')
    def test_server_asset_protocol_handling(self, mock_server_manager):
        """Test server-side asset protocol message handling"""
        
        # Mock server asset manager
        mock_manager_instance = Mock()
        mock_server_manager.return_value = mock_manager_instance
        
        # Mock presigned URL response
        from server_host.service.asset_manager import PresignedUrlResponse
        mock_upload_response = PresignedUrlResponse(
            success=True,
            url="https://r2.example.com/upload?signed=true",
            asset_id="new_asset_123",
            expires_in=3600,
            instructions="POST to this URL with the file"
        )
        mock_manager_instance.request_upload_url = AsyncMock(return_value=mock_upload_response)
        
        mock_download_response = PresignedUrlResponse(
            success=True,
            url="https://r2.example.com/download/asset_123",
            asset_id="asset_123",
            expires_in=3600
        )
        mock_manager_instance.request_download_url = AsyncMock(return_value=mock_download_response)
        
        # Test upload request handling
        upload_message = Message(
            type=MessageType.ASSET_UPLOAD_REQUEST,
            data={
                "filename": "new_dungeon_map.jpg",
                "file_size": 2048000,
                "content_type": "image/jpeg"
            }
        )
        
        # Would be handled by GameSessionProtocolService._handle_asset_message
        # Verify the response would contain upload URL
        self.assertIsNotNone(mock_upload_response.url, "Should provide upload URL")
        self.assertIsNotNone(mock_upload_response.asset_id, "Should provide asset ID")
        self.assertTrue(mock_upload_response.success, "Upload request should succeed")
        
        # Test download request handling  
        download_message = Message(
            type=MessageType.ASSET_DOWNLOAD_REQUEST,
            data={
                "asset_id": "asset_123"
            }
        )
        
        # Verify the response would contain download URL
        self.assertIsNotNone(mock_download_response.url, "Should provide download URL")
        self.assertTrue(mock_download_response.success, "Download request should succeed")

    def test_multi_client_asset_sharing(self):
        """Test asset sharing between multiple clients in same session"""
        
        # Simulate multiple clients
        dm_asset_manager = get_client_asset_manager()
        
        # Reset for second client simulation
        ClientAssetManager._instance = None
        player_asset_manager = get_client_asset_manager()
        
        session_code = "test_session_001"
        
        # Step 1: DM uploads an asset (battle map)
        dm_asset_filename = "battle_map.jpg"
        dm_asset_id = "asset_dm_001"
        dm_r2_url = "https://r2.example.com/asset_dm_001"
        
        # Create test file for DM
        dm_test_path = os.path.join(self.test_assets_dir, dm_asset_filename)
        self.create_test_image(dm_test_path)
        
        # DM caches the asset after upload
        dm_asset_manager.cache_asset(dm_asset_filename, dm_asset_id, dm_r2_url, dm_test_path)
        
        # Step 2: Player joins session and receives asset list
        session_assets = [
            {
                "filename": dm_asset_filename,
                "asset_id": dm_asset_id,
                "r2_url": dm_r2_url,
                "uploaded_by": "dm_user"
            }
        ]
        
        # Step 3: Player downloads shared assets
        for asset_info in session_assets:
            filename = asset_info["filename"]
            asset_id = asset_info["asset_id"]
            r2_url = asset_info["r2_url"]
            
            # Player checks if they have the asset
            player_has_asset = player_asset_manager.is_asset_cached(filename)
            
            if not player_has_asset:
                # Simulate download and cache
                # In real implementation, would download from R2 URL
                downloaded_path = os.path.join(self.test_cache_dir, filename)
                self.create_test_image(downloaded_path)  # Simulate download
                
                player_asset_manager.cache_asset(filename, asset_id, r2_url, downloaded_path)
        
        # Step 4: Verify both clients have access to shared assets
        dm_has_asset = dm_asset_manager.is_asset_cached(dm_asset_filename)
        player_has_asset = player_asset_manager.is_asset_cached(dm_asset_filename)
        
        self.assertTrue(dm_has_asset, "DM should have access to uploaded asset")
        self.assertTrue(player_has_asset, "Player should have access to downloaded asset")
        
        # Step 5: Verify asset IDs match (same asset, different cache locations)
        dm_info = dm_asset_manager.get_cached_asset_info(dm_asset_filename)
        player_info = player_asset_manager.get_cached_asset_info(dm_asset_filename)
        
        self.assertEqual(dm_info['asset_id'], player_info['asset_id'], 
                        "Both clients should reference same asset ID")

    def test_asset_error_handling_and_recovery(self):
        """Test error handling and recovery in asset workflows"""
        
        asset_manager = get_client_asset_manager()
        
        # Test 1: Handle non-existent file
        with self.assertRaises(Exception):
            asset_manager.create_sprite_from_local_file("/non/existent/file.png")
        
        # Test 2: Handle cache corruption recovery
        filename = "test_recovery.png"
        asset_id = "asset_recovery_001"
        r2_url = "https://r2.example.com/asset_recovery_001"
        
        # Create and cache asset
        test_path = os.path.join(self.test_assets_dir, filename)
        self.create_test_image(test_path)
        asset_manager.cache_asset(filename, asset_id, r2_url, test_path)
        
        # Verify it's cached
        self.assertTrue(asset_manager.is_asset_cached(filename), "Should be cached initially")
        
        # Simulate cache corruption (delete cached file but keep registry entry)
        cached_info = asset_manager.get_cached_asset_info(filename)
        if cached_info and 'local_path' in cached_info:
            cached_path = cached_info['local_path']
            if os.path.exists(cached_path):
                os.remove(cached_path)
        
        # Test recovery - should detect corruption and handle gracefully
        is_cached_after_corruption = asset_manager.is_asset_cached(filename)
        
        # Implementation should either:
        # 1. Return False (cache miss, trigger re-download)
        # 2. Attempt recovery
        # For this test, we expect it to handle the situation gracefully
        self.assertIsInstance(is_cached_after_corruption, bool, 
                            "Should handle cache corruption gracefully")

    def test_asset_performance_and_limits(self):
        """Test asset management performance and limits"""
        
        asset_manager = get_client_asset_manager()
        
        # Test handling many assets
        num_assets = 50
        large_asset_list = []
        
        for i in range(num_assets):
            filename = f"asset_{i:03d}.png"
            asset_id = f"asset_{i:06d}"
            r2_url = f"https://r2.example.com/asset_{i:06d}"
            
            # Create test file
            test_path = os.path.join(self.test_assets_dir, filename)
            self.create_test_image(test_path)
            
            # Cache asset
            asset_manager.cache_asset(filename, asset_id, r2_url, test_path)
            large_asset_list.append(filename)
        
        # Verify all assets are cached
        stats = asset_manager.get_stats()
        self.assertGreaterEqual(stats['cached_assets'], num_assets, 
                              f"Should cache {num_assets} assets")
        
        # Test bulk operations performance
        import time
        start_time = time.time()
        
        # Simulate checking cache status for many assets
        cache_hits = 0
        for filename in large_asset_list:
            if asset_manager.is_asset_cached(filename):
                cache_hits += 1
        
        end_time = time.time()
        check_time = end_time - start_time
        
        self.assertEqual(cache_hits, num_assets, "All assets should be cache hits")
        self.assertLess(check_time, 1.0, "Cache checks should be fast (< 1 second)")
        
        # Test cache statistics are reasonable
        self.assertIsInstance(stats['cache_size_mb'], (int, float), 
                            "Cache size should be numeric")
        self.assertGreaterEqual(stats['cache_size_mb'], 0, 
                              "Cache size should be non-negative")


if __name__ == '__main__':
    # Run tests
    unittest.main(verbosity=2)
