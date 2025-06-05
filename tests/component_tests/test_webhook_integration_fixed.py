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
import pytest

# Add the project root to Python path
project_root = Path(__file__).parent.parent.parent.absolute()
sys.path.insert(0, str(project_root))

from net.client_webhook import WebhookClient, init_connection, send_data, receive_data, close_connection, register_client_async
from net.client_webhook_protocol import setup_webhook_protocol

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
            assert data['status'] == 'healthy'
            assert isinstance(data['clients'], int)
        else:
            pytest.fail(f"Mock server returned status {response.status_code}")
    except requests.exceptions.ConnectionError:
        pytest.fail("Could not connect to mock server. Make sure to run: python mock_webhook_server.py")

@pytest.mark.asyncio
async def test_webhook_client_integration():
    """Test webhook client with mock server"""
    print("\n=== Testing Webhook Client Integration ===")
    
    try:        # Initialize connection - this creates the client
        client = init_connection(
            server_url="http://localhost:8000",
            webhook_port=8081
        )
        assert client is not None, "Connection initialization failed"
        print(f"✓ Connection initialized successfully (ID: {client.client_id})")
        
        # Give server time to start
        await asyncio.sleep(2)
        
        # Register with server (async)
        print("✓ Registering with server...")
        success = await register_client_async(client)
        assert success, "Failed to register with server"
        print("✓ Successfully registered with server")
        
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
        
        assert response.status_code == 200, f"Message sending failed: {response.status_code}"
        data = response.json()
        print("✓ Message sent successfully")
        print(f"  - Message ID: {data['message_id']}")
        print(f"  - Broadcasted to: {data['broadcasted_to']} clients")
        
        # Test listing clients
        print("✓ Testing client listing...")
        response = requests.get("http://localhost:8000/webhook/clients")
        assert response.status_code == 200, f"Client listing failed: {response.status_code}"
        data = response.json()
        print(f"✓ Found {data['count']} connected clients")
        assert client.client_id in data['clients'], "Our client is not in the list"
        print("✓ Our client is in the list")
        
        # Cleanup
        print("✓ Cleaning up...")
        
        # Unregister client
        response = requests.post(
            "http://localhost:8000/webhook/unregister",
            json={"client_id": client.client_id}
        )
        
        assert response.status_code == 200, f"Client unregistration failed: {response.status_code}"
        print("✓ Client unregistered successfully")
        
        # Close connection
        close_connection(client)
        print("✓ Connection closed")
        
    except Exception as e:
        print(f"✗ Integration test error: {e}")
        import traceback
        traceback.print_exc()
        raise

# Test file completed
