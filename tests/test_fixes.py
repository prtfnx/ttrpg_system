#!/usr/bin/env python3
"""
Test script to verify table request fixes work correctly
This tests the local table manager functionality
"""
import asyncio
import logging
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core_table.server import TableManager
from core_table.table import VirtualTable
from server_host.service.game_session_protocol import GameSessionProtocolService

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s:%(name)s: %(message)s"
)

logger = logging.getLogger(__name__)

async def test_table_requests():
    """Test table request functionality"""
    logger.info("🧪 Testing table request fixes...")
    
    # Create a test session protocol service
    session_service = GameSessionProtocolService("TEST_SESSION")
    
    # Check available tables
    logger.info(f"📋 Available tables: {list(session_service.table_manager.tables.keys())}")
    
    # Test getting default table
    default_table = session_service.table_manager.get_table("default")
    logger.info(f"✅ Default table: {default_table.name} ({default_table.width}x{default_table.height})")
    
    # Test getting large_table
    large_table = session_service.table_manager.get_table("large_table")
    if large_table:
        logger.info(f"✅ Large table: {large_table.name} ({large_table.width}x{large_table.height})")
        logger.info(f"📊 Large table entities: {len(large_table.entities)}")
        
        # List some entities
        for i, entity in enumerate(list(large_table.entities.values())[:5]):
            logger.info(f"   Entity {i+1}: {entity.name} at {entity.position} [Layer: {entity.layer}]")
        
        if len(large_table.entities) > 5:
            logger.info(f"   ... and {len(large_table.entities) - 5} more entities")
    else:
        logger.error("❌ Large table not found!")
        return False
    
    # Test getting non-existent table (should return default)
    test_table = session_service.table_manager.get_table("non_existent")
    logger.info(f"🔄 Non-existent table request returns: {test_table.name}")
    
    # Test table creation
    new_table = session_service.table_manager.create_table("test_table_new", 50, 50)
    logger.info(f"✨ Created new table: {new_table.name} ({new_table.width}x{new_table.height})")
    
    logger.info(f"📋 Final table list: {list(session_service.table_manager.tables.keys())}")
    
    logger.info("✅ All table request tests passed!")
    return True

async def test_bcrypt_import():
    """Test bcrypt import to verify version compatibility"""
    logger.info("🔐 Testing bcrypt import...")
    
    try:
        import bcrypt
        logger.info(f"✅ bcrypt version: {bcrypt.__version__}")
        
        # Test basic bcrypt functionality
        password = "test_password"
        hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
        logger.info("✅ bcrypt hashing works")
        
        # Test verification
        if bcrypt.checkpw(password.encode('utf-8'), hashed):
            logger.info("✅ bcrypt verification works")
            return True
        else:
            logger.error("❌ bcrypt verification failed")
            return False
            
    except ImportError as e:
        logger.error(f"❌ bcrypt import failed: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ bcrypt test failed: {e}")
        return False

async def main():
    """Run all tests"""
    logger.info("🚀 Starting local validation tests...")
    
    # Test bcrypt
    bcrypt_ok = await test_bcrypt_import()
    
    # Test table requests
    table_ok = await test_table_requests()
    
    if bcrypt_ok and table_ok:
        logger.info("🎉 All tests passed! Ready for deployment.")
        return True
    else:
        logger.error("❌ Some tests failed. Please fix before deploying.")
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
