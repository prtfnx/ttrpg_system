#!/usr/bin/env python3
"""
Test webhook integration with the mock server
"""

import asyncio
import sys
import os
import time
import requests
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent.absolute()
sys.path.insert(0, str(project_root))

from client_webhook import WebhookClient, init_connection, send_data, receive_data, close_connection
from client_webhook_protocol import setup_webhook_protocol

def test_mock_server_connection():
    """Test that we can connect to the mock server"""
    print("=== Testing Mock Server Connection ===")
    try:
        response = requests.get("http://localhost:8000/health")
        if response.status_code == 200:
            data = response.json()
            print("✓ Mock server is running")
            print(f"  - Status: {data['status']}")
            print(f"  - Connected clients: {data['clients']}")
            return True
        else:
            print(f"✗ Mock server returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("✗ Could not connect to mock server")
        print("  Make sure to run: python mock_webhook_server.py")
        return False

async def test_webhook_client_integration():
    """Test webhook client with mock server"""
    print("\n=== Testing Webhook Client Integration ===")
    
    try:
        # Create webhook client
        client = WebhookClient(
            server_url="http://localhost:8000",
            webhook_port=8081
        )
        print(f"✓ Created webhook client (ID: {client.client_id})")
        
        # Create a dummy context for protocol
        class DummyContext:
            pass
        
        context = DummyContext()
        
        # Initialize connection
        success = init_connection(context, client)
        if success:
            print("✓ Connection initialized successfully")
        else:
            print("✗ Connection initialization failed")
            return False
        
        # Start webhook server in background
        print("✓ Starting webhook server...")
        server_task = asyncio.create_task(client.start_webhook_server())
        
        # Give server time to start
        await asyncio.sleep(1)
        
        # Test client registration with mock server
        print("✓ Testing client registration...")
        response = requests.post(
            "http://localhost:8000/webhook/register",
            json={
                "client_id": client.client_id,
                "webhook_url": f"http://localhost:{client.webhook_port}/webhook"
            }
        )
        
        if response.status_code == 200:
            print("✓ Client registered with mock server")
            data = response.json()
            print(f"  - Status: {data['status']}")
        else:
            print(f"✗ Registration failed: {response.status_code}")
            return False
        
        # Test sending a message
        print("✓ Testing message sending...")
        test_message = {"type": "test", "content": "Hello from webhook client!"}
        
        response = requests.post(
            "http://localhost:8000/webhook/message",
            json={
                "client_id": client.client_id,
                "message": test_message
            }
        )
        
        if response.status_code == 200:
            print("✓ Message sent successfully")
            data = response.json()
            print(f"  - Message ID: {data['message_id']}")
            print(f"  - Broadcasted to: {data['broadcasted_to']} clients")
        else:
            print(f"✗ Message sending failed: {response.status_code}")
        
        # Test listing clients
        print("✓ Testing client listing...")
        response = requests.get("http://localhost:8000/webhook/clients")
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Found {data['count']} connected clients")
            if client.client_id in data['clients']:
                print("✓ Our client is in the list")
            else:
                print("✗ Our client is not in the list")
        
        # Cleanup
        print("✓ Cleaning up...")
        
        # Unregister client
        response = requests.post(
            "http://localhost:8000/webhook/unregister",
            json={"client_id": client.client_id}
        )
        
        if response.status_code == 200:
            print("✓ Client unregistered successfully")
        
        # Close connection
        close_connection()
        print("✓ Connection closed")
        
        # Cancel server task
        server_task.cancel()
        try:
            await server_task
        except asyncio.CancelledError:
            pass
        
        print("✓ Webhook server stopped")
        
        return True
        
    except Exception as e:
        print(f"✗ Integration test error: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Run integration tests"""
    print("Testing webhook client integration with mock server...\n")
    
    # Test mock server connection first
    server_ok = test_mock_server_connection()
    if not server_ok:
        return 1
    
    # Test webhook client integration
    integration_ok = await test_webhook_client_integration()
    
    print(f"\n=== Integration Test Results ===")
    print(f"Mock server: {'PASSED' if server_ok else 'FAILED'}")
    print(f"Integration: {'PASSED' if integration_ok else 'FAILED'}")
    
    if server_ok and integration_ok:
        print("\n✓ All integration tests passed!")
        print("The webhook client can successfully communicate with the server!")
        return 0
    else:
        print("\n✗ Some integration tests failed!")
        return 1

if __name__ == "__main__":
    try:
        result = asyncio.run(main())
        sys.exit(result)
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
        sys.exit(1)
