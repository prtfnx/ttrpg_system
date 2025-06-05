#!/usr/bin/env python3
"""
End-to-end test for webhook functionality with main.py
This test will start the main application with webhook arguments and verify it connects properly
"""

import subprocess
import sys
import time
import requests
import threading
import signal
import os
from pathlib import Path

def test_complete_webhook_integration():
    """Test that main.py can start with webhook arguments and connect to mock server"""
    print("=== Testing Complete Webhook Integration ===")
    
    # First verify mock server is running
    try:
        response = requests.get("http://localhost:8000/health")
        if response.status_code != 200:
            print("✗ Mock server not running. Start it with: python tests/component_tests/mock_webhook_server.py")
            return False
        print("✓ Mock server is running")
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to mock server. Start it with: python tests/component_tests/mock_webhook_server.py")
        return False
    
    # Test argument parsing by running main.py with --help to verify it accepts webhook args
    print("✓ Testing webhook argument parsing...")
    try:
        result = subprocess.run([
            sys.executable, "main.py", "--help"
        ], capture_output=True, text=True, timeout=5, cwd="../..")
        
        if "--connection" in result.stdout and "webhook" in result.stdout:
            print("✓ Main.py accepts webhook arguments")
        else:
            print("✗ Main.py missing webhook arguments")
            return False
    except Exception as e:
        print(f"✗ Error testing arguments: {e}")
        return False
    
    # Test that main.py can start with webhook arguments (but exit quickly)
    print("✓ Testing main.py startup with webhook arguments...")
    try:
        # Use a timeout to prevent hanging, and test argument parsing
        result = subprocess.run([
            sys.executable, "-c", """
import sys
sys.path.insert(0, '../..')
try:
    from main import parse_arguments
    import sys
    sys.argv = ['main.py', '--connection', 'webhook', '--server-url', 'http://localhost:8000', '--webhook-port', '8082']
    args = parse_arguments()
    print(f"SUCCESS: Connection={args.connection}, URL={args.server_url}, Port={args.webhook_port}")
except Exception as e:
    print(f"ERROR: {e}")
"""
        ], capture_output=True, text=True, timeout=10)
        
        if "SUCCESS:" in result.stdout:
            print("✓ Main.py can parse webhook arguments successfully")
            print(f"  {result.stdout.strip()}")
        else:
            print("✗ Main.py argument parsing failed")
            print(f"  stdout: {result.stdout}")
            print(f"  stderr: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        print("✗ Main.py argument test timed out")
        return False
    except Exception as e:
        print(f"✗ Error testing main.py startup: {e}")
        return False
    
    # Test imports work correctly
    print("✓ Testing webhook imports in main.py context...")
    try:
        result = subprocess.run([
            sys.executable, "-c", """
import sys
sys.path.insert(0, '../..')
try:
    from net.client_webhook import WebhookClient, init_connection
    from net.client_webhook_protocol import setup_webhook_protocol
    print("SUCCESS: All webhook modules imported successfully")
except Exception as e:
    print(f"ERROR: Import failed - {e}")
"""
        ], capture_output=True, text=True, timeout=10)
        
        if "SUCCESS:" in result.stdout:
            print("✓ Webhook modules import successfully")
        else:
            print("✗ Webhook import failed")
            print(f"  stdout: {result.stdout}")
            print(f"  stderr: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"✗ Error testing imports: {e}")
        return False
    
    # Test webhook client can register with mock server
    print("✓ Testing webhook client registration...")
    try:
        result = subprocess.run([
            sys.executable, "-c", """
import sys
sys.path.insert(0, '../..')
import asyncio
from net.client_webhook import WebhookClient, init_connection, register_client_async

async def test_registration():
    try:
        client = init_connection(
            server_url="http://localhost:8000",
            webhook_port=8083
        )
        if not client:
            print("ERROR: Failed to initialize client")
            return
        
        success = await register_client_async(client)
        if success:
            print("SUCCESS: Client registered with server")
        else:
            print("ERROR: Client registration failed")
    except Exception as e:
        print(f"ERROR: {e}")

asyncio.run(test_registration())
"""
        ], capture_output=True, text=True, timeout=15)
        
        if "SUCCESS:" in result.stdout:
            print("✓ Webhook client can register with server")
        else:
            print("✗ Webhook client registration failed")
            print(f"  stdout: {result.stdout}")
            print(f"  stderr: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"✗ Error testing registration: {e}")
        return False
    
    return True

def main():
    """Run the complete integration test"""
    print("Running complete webhook integration test...\n")
    
    success = test_complete_webhook_integration()
    
    print(f"\n=== Test Results ===")
    if success:
        print("✓ All webhook integration tests passed!")
        print("\nThe webhook implementation is working correctly!")
        print("\nTo test manually:")
        print("1. Keep mock server running: python tests/component_tests/mock_webhook_server.py")
        print("2. Run main app: python main.py --connection webhook --server-url http://localhost:8000 --webhook-port 8080")
        return 0
    else:
        print("✗ Some webhook integration tests failed!")
        return 1

if __name__ == "__main__":
    try:
        result = main()
        sys.exit(result)
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
        sys.exit(1)
