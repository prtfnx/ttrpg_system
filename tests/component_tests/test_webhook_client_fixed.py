#!/usr/bin/env python3
"""
Test script for webhook client functionality
"""

import asyncio
import sys
import os
import logging
from pathlib import Path

# Add the project root to Python path so we can import our modules
project_root = Path(__file__).parent.absolute()
sys.path.insert(0, str(project_root))

try:
    from client_webhook import WebhookClient, init_connection, send_data, receive_data, close_connection
    from client_webhook_protocol import setup_webhook_protocol
    print("✓ Successfully imported webhook modules")
except ImportError as e:
    print(f"✗ Failed to import webhook modules: {e}")
    sys.exit(1)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_webhook_client():
    """Test basic webhook client functionality"""
    print("\n=== Testing Webhook Client ===")
    
    try:
        # Test WebhookClient instantiation
        client = WebhookClient(
            server_url="http://localhost:8000",
            webhook_port=8080
        )
        print("✓ WebhookClient created successfully")
        
        # Test connection initialization using the available function
        test_client = init_connection(
            server_url="http://localhost:8000",
            webhook_port=8081
        )
        print("✓ Webhook connection initialized")
        
        # Test protocol setup (requires dummy context)
        class DummyContext:
            pass
        
        context = DummyContext()
        protocol = setup_webhook_protocol(context, test_client)
        print("✓ Webhook protocol setup completed")
        
        # Cleanup
        if test_client:
            close_connection(test_client)
        print("✓ Webhook client cleanup completed")
        
        return True
        
    except Exception as e:
        print(f"✗ Error testing webhook client: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_webhook_server():
    """Test webhook server functionality"""
    print("\n=== Testing Webhook Server ===")
    
    try:
        client = WebhookClient(
            server_url="http://localhost:8000",
            webhook_port=8082  # Use different port for testing
        )
        
        # Start server in background
        server_task = asyncio.create_task(client.start_webhook_server())
        
        # Let server start
        await asyncio.sleep(0.5)
        
        # Test health endpoint
        import requests
        try:
            response = requests.get("http://localhost:8082/health")
            if response.status_code == 200:
                print("✓ Webhook server health check passed")
            else:
                print(f"✗ Webhook server health check failed: {response.status_code}")
        except requests.exceptions.ConnectionError:
            print("✗ Could not connect to webhook server")
        
        # Cancel server task
        server_task.cancel()
        try:
            await server_task
        except asyncio.CancelledError:
            pass
        
        return True
        
    except Exception as e:
        print(f"✗ Error testing webhook server: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Run all tests"""
    print("Starting webhook client tests...\n")
    
    # Test basic client functionality
    client_test_passed = await test_webhook_client()
    
    # Test server functionality
    server_test_passed = await test_webhook_server()
    
    print(f"\n=== Test Results ===")
    print(f"Client test: {'PASSED' if client_test_passed else 'FAILED'}")
    print(f"Server test: {'PASSED' if server_test_passed else 'FAILED'}")
    
    if client_test_passed and server_test_passed:
        print("✓ All tests passed!")
        return 0
    else:
        print("✗ Some tests failed!")
        return 1

if __name__ == "__main__":
    try:
        result = asyncio.run(main())
        sys.exit(result)
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
        sys.exit(1)
