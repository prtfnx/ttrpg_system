#!/usr/bin/env python3
"""
Simple test for webhook client imports and basic functionality
"""

import sys
import os
from pathlib import Path

# Add the project root to Python path so we can import our modules
project_root = Path(__file__).parent.parent.parent.absolute()
sys.path.insert(0, str(project_root))

def test_imports():
    """Test that all webhook modules can be imported"""
    print("=== Testing Imports ===")
    try:
        from net.client_webhook import WebhookClient, init_connection, send_data, receive_data, close_connection
        print("✓ client_webhook functions imported successfully")
        
        from net.client_webhook_protocol import setup_webhook_protocol, WebhookClientProtocol
        print("✓ client_webhook_protocol classes imported successfully")
        
        return True
    except ImportError as e:
        print(f"✗ Import error: {e}")
        return False

def test_instantiation():
    """Test that webhook classes can be instantiated"""
    print("\n=== Testing Instantiation ===")
    try:
        from net.client_webhook import WebhookClient
        
        # Test WebhookClient instantiation
        client = WebhookClient(
            server_url="http://localhost:8000",
            webhook_port=8080
        )
        print("✓ WebhookClient instantiated successfully")
        print(f"  - Client ID: {client.client_id}")
        print(f"  - Server URL: {client.server_url}")
        print(f"  - Webhook Port: {client.webhook_port}")
        
        return True
    except Exception as e:
        print(f"✗ Instantiation error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_protocol_setup():
    """Test webhook protocol setup"""
    print("\n=== Testing Protocol Setup ===")
    try:
        from net.client_webhook import WebhookClient
        from net.client_webhook_protocol import setup_webhook_protocol
        
        # Create dummy context
        class DummyContext:
            pass
        
        context = DummyContext()
        client = WebhookClient("http://localhost:8000", 8080)
        
        protocol = setup_webhook_protocol(context, client)
        print("✓ Webhook protocol setup completed")
        print(f"  - Protocol type: {protocol.connection_type}")
        
        return True
    except Exception as e:
        print(f"✗ Protocol setup error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all tests"""
    print("Testing webhook client implementation...\n")
    
    # Test imports
    imports_ok = test_imports()
    
    # Test instantiation
    instantiation_ok = test_instantiation()
    
    # Test protocol setup
    protocol_ok = test_protocol_setup()
    
    print(f"\n=== Test Results ===")
    print(f"Imports: {'PASSED' if imports_ok else 'FAILED'}")
    print(f"Instantiation: {'PASSED' if instantiation_ok else 'FAILED'}")
    print(f"Protocol Setup: {'PASSED' if protocol_ok else 'FAILED'}")
    
    if imports_ok and instantiation_ok and protocol_ok:
        print("\n✓ All basic tests passed!")
        print("The webhook client implementation appears to be working correctly.")
        return 0
    else:
        print("\n✗ Some tests failed!")
        return 1

if __name__ == "__main__":
    try:
        result = main()
        sys.exit(result)
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
        sys.exit(1)
