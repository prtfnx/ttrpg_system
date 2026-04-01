"""
Test utilities for the TTRPG system.
Contains helper functions and setup utilities for all tests.
"""
import sys
import os
from pathlib import Path


def setup_test_environment():
    """
    Set up the test environment by adding the project root to sys.path.
    This allows imports to work correctly from test files.
    
    Returns:
        str: The project root path
    """
    # Get the directory containing this file (tests directory)
    tests_dir = Path(__file__).resolve().parent
    # Get the project root (parent of tests directory)
    project_root = tests_dir.parent
    project_root_str = str(project_root)
    
    # Add project root to sys.path if not already present
    if project_root_str not in sys.path:
        sys.path.insert(0, project_root_str)
    
    return project_root_str


def get_project_root():
    """
    Get the project root directory path.
    
    Returns:
        str: The project root path
    """
    tests_dir = Path(__file__).resolve().parent
    return str(tests_dir.parent)


def get_test_resource_path(resource_name: str) -> str:
    """
    Get the path to a test resource file.
    
    Args:
        resource_name: The name of the test resource file
        
    Returns:
        str: The full path to the test resource
    """
    project_root = get_project_root()
    return os.path.join(project_root, "tests", "resources", resource_name)


def ensure_test_directories():
    """
    Ensure that required test directories exist.
    Creates test output and resource directories if they don't exist.
    """
    project_root = get_project_root()
    test_dirs = [
        os.path.join(project_root, "tests", "resources"),
        os.path.join(project_root, "tests", "output"),
        os.path.join(project_root, "tests", "temp")
    ]
    
    for test_dir in test_dirs:
        os.makedirs(test_dir, exist_ok=True)


# Set up the environment when this module is imported
setup_test_environment()
