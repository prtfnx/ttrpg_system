"""
Simplified Asset Management Test
Tests core asset functionality using only actual ClientAssetManager API
"""
import unittest
import asyncio
import logging
import os
import sys
import tempfile
import json
from unittest.mock import Mock, AsyncMock, patch
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from AssetManager import  ClientAssetManager
from net.protocol import Message, MessageType
import settings


class TestAssetCore(unittest.TestCase):
    """Test core asset management functionality"""
    
    @classmethod
    def setUpClass(cls):
        """Set up test environment"""
        logging.basicConfig(level=logging.WARNING)
        cls.test_cache_dir = tempfile.mkdtemp()
        
        # Mock settings
        cls.original_cache_dir = getattr(settings, 'ASSET_CACHE_DIR', 'cache/assets')
        cls.original_registry = getattr(settings, 'ASSET_REGISTRY_FILE', 'cache/asset_registry.json')
        
        settings.ASSET_CACHE_DIR = cls.test_cache_dir
        settings.ASSET_REGISTRY_FILE = os.path.join(cls.test_cache_dir, 'test_registry.json')

    @classmethod
    def tearDownClass(cls):
        """Clean up"""
        settings.ASSET_CACHE_DIR = cls.original_cache_dir
        settings.ASSET_REGISTRY_FILE = cls.original_registry
        
        import shutil
        shutil.rmtree(cls.test_cache_dir, ignore_errors=True)

    def create_test_image(self, path):
        """Create a test image file"""
        png_data = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
            b'\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc```\x00\x00'
            b'\x00\x04\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(png_data)

    def test_asset_manager_creation(self):
        """Test that asset manager can be created"""
        asset_manager = ClientAssetManager()
        self.assertIsNotNone(asset_manager, "Asset manager should be created")
        self.assertIsInstance(asset_manager, ClientAssetManager, "Should be ClientAssetManager instance")

    def test_asset_caching_basic(self):
        """Test basic asset caching functionality"""
        asset_manager = ClientAssetManager()
        
        # Test with non-existent asset
        test_asset_id = "nonexistent_asset"
        is_cached = asset_manager.is_asset_cached(test_asset_id)
        self.assertFalse(is_cached, "Non-existent asset should not be cached")
        
        # Test getting path for non-existent asset
        cached_path = asset_manager.get_cached_asset_path(test_asset_id)
        self.assertIsNone(cached_path, "Non-existent asset should return None path")

    def test_asset_statistics(self):
        """Test asset manager statistics"""
        asset_manager = ClientAssetManager()
        
        stats = asset_manager.get_stats()
        self.assertIsInstance(stats, dict, "Stats should be a dictionary")
        
        # Check for expected keys
        expected_keys = ['total_downloads', 'successful_downloads', 'failed_downloads', 
                        'cache_hits', 'total_bytes_downloaded']
        for key in expected_keys:
            self.assertIn(key, stats, f"Stats should include {key}")
            self.assertIsInstance(stats[key], (int, float), f"{key} should be numeric")

    def test_session_assets_management(self):
        """Test session assets management"""
        asset_manager = ClientAssetManager()
        
        # Test updating session assets
        test_session = "test_session_001"
        test_assets = [
            {"asset_id": "asset1", "filename": "map.jpg"},
            {"asset_id": "asset2", "filename": "token.png"}
        ]
        
        # Update session assets
        asset_manager.update_session_assets(test_assets)
        
        # Verify session assets are stored
        self.assertEqual(len(asset_manager.session_assets), 2, "Should have 2 session assets")

    @patch('requests.get')
    async def test_asset_download(self, mock_get):
        """Test asset download functionality"""
        # Mock HTTP response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.headers = {'content-length': '100'}
        mock_response.iter_content = Mock(return_value=[b'test_data'])
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        asset_manager = ClientAssetManager()
        
        # Test download
        result = await asset_manager.download_asset(
            "test_asset", 
            "https://example.com/test.png", 
            "test.png"
        )
        
        self.assertIsInstance(result, tuple, "Download should return tuple")
        success, message = result
        self.assertIsInstance(success, bool, "First element should be boolean")
        self.assertIsInstance(message, str, "Second element should be string")

    def test_cache_path_generation(self):
        """Test cache path generation"""
        asset_manager = ClientAssetManager()
        
        # Test cache path generation
        cache_path = asset_manager._get_cache_path("test_asset_123", "test_file.png")
        self.assertIsInstance(cache_path, Path, "Should return Path object")
        self.assertTrue(str(cache_path).endswith("test_file.png"), "Should end with filename")

    def test_file_hash_calculation(self):
        """Test file hash calculation"""
        asset_manager = ClientAssetManager()
        
        # Create test file
        test_file = os.path.join(self.test_cache_dir, "hash_test.png")
        self.create_test_image(test_file)
        
        # Calculate hash
        file_hash = asset_manager._calculate_file_hash(Path(test_file))
        self.assertIsInstance(file_hash, str, "Hash should be string")
        self.assertTrue(len(file_hash) > 0, "Hash should not be empty")
        
        # Test with same file should give same hash
        file_hash2 = asset_manager._calculate_file_hash(Path(test_file))
        self.assertEqual(file_hash, file_hash2, "Same file should have same hash")

    def test_registry_persistence(self):
        """Test registry save/load functionality"""
        asset_manager = ClientAssetManager(cache_dir=self.test_cache_dir)
        
        # Add test data to registry
        test_data = {
            "test_asset": {"filename": "test.png", "local_path": "/test/path"}
        }
        asset_manager.asset_registry = test_data
        
        # Save registry
        asset_manager._save_registry()
        
        # Create new manager to test loading
        asset_manager2 = ClientAssetManager(cache_dir=self.test_cache_dir)
        
        # Verify data was loaded
        self.assertIn("test_asset", asset_manager2.asset_registry, 
                     "Registry should persist across instances")


if __name__ == '__main__':
    unittest.main(verbosity=2)
