"""
Test script for webhook server functionality
"""
import asyncio
import aiohttp
import json
import logging
import time
from typing import Dict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WebhookServerTester:
    """Test the webhook server functionality"""
    
    def __init__(self, server_url: str = "http://localhost:8000"):
        self.server_url = server_url.rstrip('/')
        self.client_id = f"test_client_{int(time.time())}"
        self.webhook_port = 8081
        
    async def test_server_health(self) -> bool:
        """Test server health endpoint"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.server_url}/health") as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"Server health: {data}")
                        return True
                    else:
                        logger.error(f"Health check failed: {response.status}")
                        return False
        except Exception as e:
            logger.error(f"Health check error: {e}")
            return False
    
    async def test_client_registration(self) -> bool:
        """Test client registration"""
        try:
            webhook_url = f"http://localhost:{self.webhook_port}/webhook/message"
            
            async with aiohttp.ClientSession() as session:
                payload = {
                    "client_id": self.client_id,
                    "webhook_url": webhook_url,
                    "client_type": "test_client"
                }
                
                async with session.post(
                    f"{self.server_url}/api/client/register",
                    json=payload
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"Registration successful: {data}")
                        return True
                    else:
                        logger.error(f"Registration failed: {response.status}")
                        return False
        except Exception as e:
            logger.error(f"Registration error: {e}")
            return False
    
    async def test_ping(self) -> bool:
        """Test ping functionality"""
        try:
            async with aiohttp.ClientSession() as session:
                payload = {"client_id": self.client_id}
                
                async with session.post(
                    f"{self.server_url}/api/ping",
                    json=payload
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"Ping successful: {data}")
                        return True
                    else:
                        logger.error(f"Ping failed: {response.status}")
                        return False
        except Exception as e:
            logger.error(f"Ping error: {e}")
            return False
    
    async def test_message_sending(self) -> bool:
        """Test message sending"""
        try:
            test_message = json.dumps({
                "type": "table_request",
                "data": {"name": "default"},
                "client_id": self.client_id,
                "timestamp": time.time()
            })
            
            async with aiohttp.ClientSession() as session:
                payload = {
                    "client_id": self.client_id,
                    "message": test_message
                }
                
                async with session.post(
                    f"{self.server_url}/api/message",
                    json=payload
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"Message sent successfully: {data}")
                        return True
                    else:
                        logger.error(f"Message sending failed: {response.status}")
                        return False
        except Exception as e:
            logger.error(f"Message sending error: {e}")
            return False
    
    async def test_client_list(self) -> bool:
        """Test client listing"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.server_url}/api/clients") as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"Client list: {data}")
                        return True
                    else:
                        logger.error(f"Client listing failed: {response.status}")
                        return False
        except Exception as e:
            logger.error(f"Client listing error: {e}")
            return False
    
    async def test_table_list(self) -> bool:
        """Test table listing"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.server_url}/api/tables") as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"Table list: {data}")
                        return True
                    else:
                        logger.error(f"Table listing failed: {response.status}")
                        return False
        except Exception as e:
            logger.error(f"Table listing error: {e}")
            return False
    
    async def test_unregistration(self) -> bool:
        """Test client unregistration"""
        try:
            async with aiohttp.ClientSession() as session:
                payload = {"client_id": self.client_id}
                
                async with session.post(
                    f"{self.server_url}/api/client/unregister",
                    json=payload
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"Unregistration successful: {data}")
                        return True
                    else:
                        logger.error(f"Unregistration failed: {response.status}")
                        return False
        except Exception as e:
            logger.error(f"Unregistration error: {e}")
            return False
    
    async def run_full_test(self) -> bool:
        """Run complete test suite"""
        logger.info("Starting webhook server test suite...")
        
        tests = [
            ("Health Check", self.test_server_health),
            ("Client Registration", self.test_client_registration),
            ("Ping", self.test_ping),
            ("Message Sending", self.test_message_sending),
            ("Client List", self.test_client_list),
            ("Table List", self.test_table_list),
            ("Unregistration", self.test_unregistration)
        ]
        
        passed = 0
        total = len(tests)
        
        for test_name, test_func in tests:
            logger.info(f"Running test: {test_name}")
            try:
                result = await test_func()
                if result:
                    logger.info(f"✅ {test_name} PASSED")
                    passed += 1
                else:
                    logger.error(f"❌ {test_name} FAILED")
            except Exception as e:
                logger.error(f"❌ {test_name} ERROR: {e}")
            
            # Small delay between tests
            await asyncio.sleep(0.5)
        
        logger.info(f"Test results: {passed}/{total} tests passed")
        return passed == total

async def main():
    """Main test function"""
    import sys
    
    server_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    
    tester = WebhookServerTester(server_url)
    success = await tester.run_full_test()
    
    if success:
        logger.info("🎉 All tests passed!")
        return 0
    else:
        logger.error("❌ Some tests failed!")
        return 1

if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
