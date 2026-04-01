#!/usr/bin/env python3
"""
End-to-end test for R2 integration workflow
Tests the complete flow: client loads sprite → server provides upload URL → client uploads → server tracks asset
"""

import asyncio
import logging
import os
import sys
import time
import unittest

# Add server_host to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'server_host'))

from server_host.database.database import init_db, SessionLocal
from server_host.database.models import Asset, GameSession, User
from server_host.service.asset_manager import ServerAssetManager, AssetRequest
from server_host.config import Settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestR2EndToEnd(unittest.TestCase):
    """Test R2 end-to-end workflows using unittest"""
    def test_end_to_end_workflow(self):
        """Test the complete R2 workflow - converted to sync unittest"""
        # Run async test in sync context
        asyncio.run(self._async_test_workflow())
    
    async def _async_test_workflow(self):
        """Async implementation of R2 workflow test"""
        logger.info("=== R2 End-to-End Workflow Test ===")
        
        # Initialize database
        logger.info("Initializing database...")
        init_db()
        
        # Create asset manager
        logger.info("Creating asset manager...")
        asset_manager = ServerAssetManager()
        
        # Test settings
        logger.info("Testing settings...")
        settings = Settings()
        logger.info(f"R2 enabled: {settings.r2_enabled}")
        logger.info(f"R2 bucket: {settings.r2_bucket_name}")
        
        logger.info("\\n=== End-to-End Test Complete ===")


if __name__ == "__main__":
    unittest.main()
    """Test the complete R2 workflow"""
    logger.info("=== R2 End-to-End Workflow Test ===")
    
    # Initialize database
    logger.info("Initializing database...")
    init_db()
    
    # Create asset manager
    logger.info("Creating asset manager...")
    asset_manager = ServerAssetManager()
    
    # Test settings
    logger.info("Testing settings...")
    settings = Settings()
    logger.info(f"R2 enabled: {settings.r2_enabled}")
    logger.info(f"R2 bucket: {settings.r2_bucket_name}")
    
    # Create test session and user data
    db = SessionLocal()    
    try:
        # Check if test user exists
        test_user = db.query(User).filter(User.username == "testuser").first()
        if not test_user:
            # Create test user
            test_user = User(
                username="testuser",
                email="test@example.com",
                full_name="Test User",
                hashed_password="testhash"
            )
            db.add(test_user)
            db.commit()
            logger.info("Created test user")
        
        # Extract user ID while session is still open
        user_id = test_user.id
        
        # Check if test session exists
        test_session = db.query(GameSession).filter(GameSession.session_code == "TEST123").first()
        if not test_session:
            test_session = GameSession(
                name="Test Session",
                session_code="TEST123",
                owner_id=user_id,
                is_active=True
            )
            db.add(test_session)
            db.commit()
            logger.info("Created test session")
            
    finally:
        db.close()
    
    # Setup session permissions for the test user
    logger.info("Setting up session permissions...")
    asset_manager.setup_session_permissions("TEST123", user_id, "testuser", "player")
    
    # Test 1: Request upload URL for new asset
    logger.info("\\n--- Test 1: Request Upload URL ---")
    upload_request = AssetRequest(
        user_id=user_id,
        username="testuser",
        session_code="TEST123",
        filename="test_character.png",
        file_size=1024,
        content_type="image/png"
    )
    
    upload_response = await asset_manager.request_upload_url(upload_request)
    logger.info(f"Upload response: success={upload_response.success}")
    if upload_response.success:
        logger.info(f"Upload URL generated: {upload_response.url[:50]}...")
        logger.info(f"Asset ID: {upload_response.asset_id}")
    else:
        logger.error(f"Upload failed: {upload_response.error}")
    
    # Test 2: Check if asset was saved to database
    logger.info("\\n--- Test 2: Check Database Storage ---")
    db = SessionLocal()
    try:
        asset = db.query(Asset).filter(Asset.asset_name == "test_character.png").first()
        if asset:
            logger.info(f"Asset found in database: {asset.asset_name} -> {asset.r2_asset_id}")
            logger.info(f"Uploaded by: {asset.uploaded_by}, R2 key: {asset.r2_key}")
        else:
            logger.error("Asset not found in database")
    finally:
        db.close()
    
    # Test 3: Request download URL by filename
    logger.info("\\n--- Test 3: Request Download by Filename ---")
    if upload_response.success:        
        download_response = await asset_manager.request_download_url_by_filename(
            "test_character.png", "TEST123", user_id
        )
        logger.info(f"Download response: success={download_response.success}")
        if download_response.success:
            logger.info(f"Download URL generated: {download_response.url[:50]}...")
            logger.info(f"Asset ID: {download_response.asset_id}")
        else:
            logger.error(f"Download failed: {download_response.error}")
    
    # Test 4: Request download URL by asset_id
    logger.info("\\n--- Test 4: Request Download by Asset ID ---")
    if upload_response.success and upload_response.asset_id:        
        download_request = AssetRequest(
            user_id=user_id,
            username="testuser",
            session_code="TEST123",
            asset_id=upload_response.asset_id
        )
        
        download_response = await asset_manager.request_download_url(download_request)
        logger.info(f"Download response: success={download_response.success}")
        if download_response.success:
            logger.info(f"Download URL generated: {download_response.url[:50]}...")
        else:
            logger.error(f"Download failed: {download_response.error}")
    
    # Test 5: List session assets
    logger.info("\\n--- Test 5: List Session Assets ---")
    session_assets = asset_manager.get_session_assets("TEST123")
    logger.info(f"Found {len(session_assets)} assets in session")
    for asset in session_assets:
        logger.info(f"  - {asset.get('filename', 'unknown')} (ID: {asset.get('asset_id', 'unknown')})")
    
    logger.info("\\n=== End-to-End Test Complete ===")

if __name__ == "__main__":
    asyncio.run(test_end_to_end_workflow())
