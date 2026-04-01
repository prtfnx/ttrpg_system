#!/usr/bin/env python3
"""
Test runner for TTRPG Webhook Server component tests
"""

import sys
import os
import subprocess
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def run_component_tests():
    """Run all component tests"""
    test_dir = Path(__file__).parent / "tests" / "component_tests"
    
    if not test_dir.exists():
        logger.error(f"Test directory not found: {test_dir}")
        return False
    
    test_files = list(test_dir.glob("test_*.py"))
    
    if not test_files:
        logger.error("No test files found")
        return False
    
    logger.info(f"Found {len(test_files)} test files")
    
    all_passed = True
    
    for test_file in test_files:
        logger.info(f"Running test: {test_file.name}")
        try:
            result = subprocess.run([
                sys.executable, str(test_file)
            ], capture_output=True, text=True, cwd=test_dir.parent.parent)
            
            if result.returncode == 0:
                logger.info(f"✅ {test_file.name} PASSED")
            else:
                logger.error(f"❌ {test_file.name} FAILED")
                logger.error(f"STDOUT: {result.stdout}")
                logger.error(f"STDERR: {result.stderr}")
                all_passed = False
                
        except Exception as e:
            logger.error(f"❌ Error running {test_file.name}: {e}")
            all_passed = False
    
    if all_passed:
        logger.info("🎉 ALL COMPONENT TESTS PASSED!")
        return True
    else:
        logger.error("❌ Some tests failed")
        return False

if __name__ == "__main__":
    success = run_component_tests()
    sys.exit(0 if success else 1)
