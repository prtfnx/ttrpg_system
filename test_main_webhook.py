#!/usr/bin/env python3
"""
Test main.py with webhook arguments to ensure integration works
"""

import subprocess
import sys
import time
import requests
from pathlib import Path

def test_main_help():
    """Test that main.py help shows webhook options"""
    print("=== Testing main.py Help ===")
    try:
        result = subprocess.run([
            sys.executable, "main.py", "--help"
        ], capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            help_text = result.stdout
            if "--connection" in help_text and "webhook" in help_text:
                print("✓ Help shows webhook connection options")
                return True
            else:
                print("✗ Help missing webhook options")
                return False
        else:
            print(f"✗ Help command failed: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        print("✗ Help command timed out")
        return False
    except Exception as e:
        print(f"✗ Help test error: {e}")
        return False

def test_main_argument_parsing():
    """Test that main.py can parse webhook arguments"""
    print("\n=== Testing Argument Parsing ===")
    try:
        # Test with webhook arguments but exit quickly
        result = subprocess.run([
            sys.executable, "-c", 
            """
import sys
sys.path.insert(0, '.')
from main import parse_arguments
import argparse

# Mock sys.argv for testing
sys.argv = ['main.py', '--connection', 'webhook', '--server-url', 'http://test.com', '--webhook-port', '9000']

try:
    args = parse_arguments()
    print(f"Connection: {args.connection}")
    print(f"Server URL: {args.server_url}")
    print(f"Webhook Port: {args.webhook_port}")
    print("PARSING_SUCCESS")
except Exception as e:
    print(f"PARSING_ERROR: {e}")
"""
        ], capture_output=True, text=True, timeout=10)
        
        if "PARSING_SUCCESS" in result.stdout:
            print("✓ Webhook arguments parsed successfully")
            print("  Output:", result.stdout.strip())
            return True
        else:
            print("✗ Argument parsing failed")
            print("  Error:", result.stderr)
            print("  Output:", result.stdout)
            return False
            
    except subprocess.TimeoutExpired:
        print("✗ Argument parsing test timed out")
        return False
    except Exception as e:
        print(f"✗ Argument parsing test error: {e}")
        return False

def test_webhook_imports():
    """Test that main.py can import webhook modules"""
    print("\n=== Testing Webhook Imports ===")
    try:
        result = subprocess.run([
            sys.executable, "-c", 
            """
import sys
sys.path.insert(0, '.')

try:
    from main import client_webhook, client_webhook_protocol
    print("IMPORT_SUCCESS")
except ImportError as e:
    print(f"IMPORT_ERROR: {e}")
except Exception as e:
    print(f"OTHER_ERROR: {e}")
"""
        ], capture_output=True, text=True, timeout=10)
        
        if "IMPORT_SUCCESS" in result.stdout:
            print("✓ Webhook modules imported successfully")
            return True
        else:
            print("✗ Webhook imports failed")
            print("  Error:", result.stderr)
            print("  Output:", result.stdout)
            return False
            
    except subprocess.TimeoutExpired:
        print("✗ Import test timed out")
        return False
    except Exception as e:
        print(f"✗ Import test error: {e}")
        return False

def check_mock_server():
    """Check if mock server is still running"""
    try:
        response = requests.get("http://localhost:8000/health", timeout=2)
        return response.status_code == 200
    except:
        return False

def main():
    """Run all main.py integration tests"""
    print("Testing main.py webhook integration...\n")
    
    # Test help
    help_ok = test_main_help()
    
    # Test argument parsing
    args_ok = test_main_argument_parsing()
    
    # Test imports
    imports_ok = test_webhook_imports()
    
    print(f"\n=== Main.py Integration Test Results ===")
    print(f"Help command: {'PASSED' if help_ok else 'FAILED'}")
    print(f"Argument parsing: {'PASSED' if args_ok else 'FAILED'}")
    print(f"Webhook imports: {'PASSED' if imports_ok else 'FAILED'}")
    
    if help_ok and args_ok and imports_ok:
        print("\n✓ All main.py integration tests passed!")
        
        # Check if we can also verify with mock server
        if check_mock_server():
            print("✓ Mock server is still running - ready for full testing")
            print("\nTo test the complete integration:")
            print("1. Keep the mock server running: python mock_webhook_server.py")
            print("2. Run: python main.py --connection webhook --server-url http://localhost:8000 --webhook-port 8081")
        else:
            print("ℹ Mock server is not running - start it to test full integration")
        
        return 0
    else:
        print("\n✗ Some main.py integration tests failed!")
        return 1

if __name__ == "__main__":
    try:
        result = main()
        sys.exit(result)
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
        sys.exit(1)
