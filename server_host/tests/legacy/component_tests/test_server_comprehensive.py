#!/usr/bin/env python3
"""
Comprehensive test script for the TTRPG Webhook Server
Tests all major functionality of the webhook-based server
"""

import asyncio
import aiohttp
import json
import time
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ServerTester:
    def __init__(self, base_url: str = "http://127.0.0.1:8000"):
        self.base_url = base_url
        self.session = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def test_server_status(self):
        """Test server root and health endpoints"""
        logger.info("Testing server status...")
        
        # Test root endpoint
        async with self.session.get(f"{self.base_url}/") as resp:
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "running"
            assert data["server"] == "TTRPG Webhook Server"
            logger.info("✅ Root endpoint working")
        
        # Test health endpoint
        async with self.session.get(f"{self.base_url}/health") as resp:
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "healthy"
            assert data["server_running"] is True
            logger.info("✅ Health endpoint working")
    
    async def test_client_registration(self):
        """Test client registration and listing"""
        logger.info("Testing client registration...")
        
        # Register a test client
        client_data = {
            "client_id": "test-comprehensive-client",
            "webhook_url": "http://localhost:9999/webhook"
        }
        
        async with self.session.post(
            f"{self.base_url}/api/client/register",
            json=client_data
        ) as resp:
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "registered"
            assert data["client_id"] == "test-comprehensive-client"
            logger.info("✅ Client registration working")
        
        # Check client list
        async with self.session.get(f"{self.base_url}/api/clients") as resp:
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "success"
            
            # Find our client
            client_found = False
            for client in data["clients"]:
                if client["client_id"] == "test-comprehensive-client":
                    client_found = True
                    break
            assert client_found, "Registered client not found in client list"
            logger.info("✅ Client listing working")
        
        return "test-comprehensive-client"
    
    async def test_message_handling(self, client_id: str):
        """Test message sending and handling"""
        logger.info("Testing message handling...")
        
        # Test PING message
        ping_message = {
            "client_id": client_id,
            "message": {
                "type": "ping",
                "data": {"message": "Test ping from comprehensive test"}
            }
        }
        
        async with self.session.post(
            f"{self.base_url}/api/message",
            json=ping_message
        ) as resp:
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "received"
            assert data["client_id"] == client_id
            logger.info("✅ PING message handling working")
        
        # Test TEST message
        test_message = {
            "client_id": client_id,
            "message": {
                "type": "test",
                "data": {"test_data": "Comprehensive test message"}
            }
        }
        
        async with self.session.post(
            f"{self.base_url}/api/message",
            json=test_message
        ) as resp:
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "received"
            logger.info("✅ TEST message handling working")
        
        # Test TABLE_REQUEST message
        table_request = {
            "client_id": client_id,
            "message": {
                "type": "table_request",
                "data": {"name": "default"}
            }
        }
        
        async with self.session.post(
            f"{self.base_url}/api/message",
            json=table_request
        ) as resp:
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "received"
            logger.info("✅ TABLE_REQUEST message handling working")
    
    async def test_table_management(self):
        """Test table listing and management"""
        logger.info("Testing table management...")
        
        # Test table listing
        async with self.session.get(f"{self.base_url}/api/tables") as resp:
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "success"
            assert isinstance(data["tables"], list)
            assert len(data["tables"]) >= 1  # Should have at least default table
            
            # Check default table exists
            default_found = False
            for table in data["tables"]:
                if table["name"] == "default":
                    default_found = True
                    assert table["width"] == 100
                    assert table["height"] == 100
                    break
            assert default_found, "Default table not found"
            logger.info("✅ Table listing working")
        
        # Test specific table endpoint
        async with self.session.get(f"{self.base_url}/api/table/default") as resp:
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "success"
            assert data["table"]["name"] == "default"
            logger.info("✅ Specific table endpoint working")
    
    async def test_table_creation(self):
        """Test table creation"""
        logger.info("Testing table creation...")
        
        table_data = {
            "name": "test-table-comprehensive",
            "width": 150,
            "height": 150
        }
        
        async with self.session.post(
            f"{self.base_url}/api/table/create",
            json=table_data
        ) as resp:
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "created"
            assert data["table"]["name"] == "test-table-comprehensive"
            assert data["table"]["width"] == 150
            assert data["table"]["height"] == 150
            logger.info("✅ Table creation working")
        
        # Verify table was created by listing tables
        async with self.session.get(f"{self.base_url}/api/tables") as resp:
            assert resp.status == 200
            data = await resp.json()
            
            test_table_found = False
            for table in data["tables"]:
                if table["name"] == "test-table-comprehensive":
                    test_table_found = True
                    break
            assert test_table_found, "Created table not found in table list"
            logger.info("✅ Table creation verification working")
    
    async def test_ping_endpoint(self, client_id: str):
        """Test ping endpoint"""
        logger.info("Testing ping endpoint...")
        
        ping_data = {"client_id": client_id}
        
        async with self.session.post(
            f"{self.base_url}/api/ping",
            json=ping_data
        ) as resp:
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "pong"
            assert data["client_id"] == client_id
            logger.info("✅ Ping endpoint working")
    
    async def test_client_unregistration(self, client_id: str):
        """Test client unregistration"""
        logger.info("Testing client unregistration...")
        
        unregister_data = {"client_id": client_id}
        
        async with self.session.post(
            f"{self.base_url}/api/client/unregister",
            json=unregister_data
        ) as resp:
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "unregistered"
            assert data["client_id"] == client_id
            logger.info("✅ Client unregistration working")
        
        # Verify client was removed
        async with self.session.get(f"{self.base_url}/api/clients") as resp:
            assert resp.status == 200
            data = await resp.json()
            
            client_found = False
            for client in data["clients"]:
                if client["client_id"] == client_id:
                    client_found = True
                    break
            assert not client_found, "Unregistered client still found in client list"
            logger.info("✅ Client unregistration verification working")

async def run_comprehensive_test():
    """Run all comprehensive tests"""
    logger.info("Starting comprehensive server test...")
    
    async with ServerTester() as tester:
        try:
            # Test server status
            await tester.test_server_status()
            
            # Test client registration
            client_id = await tester.test_client_registration()
            
            # Test message handling
            await tester.test_message_handling(client_id)
            
            # Test table management
            await tester.test_table_management()
            
            # Test table creation
            await tester.test_table_creation()
            
            # Test ping endpoint
            await tester.test_ping_endpoint(client_id)
            
            # Test client unregistration
            await tester.test_client_unregistration(client_id)
            logger.info("ALL TESTS PASSED! Server is fully functional.")
            return True
            
        except Exception as e:
            logger.error(f"TEST FAILED: {e}")
            import traceback
            traceback.print_exc()
            return False

if __name__ == "__main__":
    success = asyncio.run(run_comprehensive_test())
    if success:
        print("\nComprehensive test completed successfully!")
        print("Server is ready for production deployment to render.com")
    else:
        print("\nTests failed. Check the logs above for details.")
        exit(1)
