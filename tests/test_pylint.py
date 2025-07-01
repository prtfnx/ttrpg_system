#!/usr/bin/env python3
"""Test file to check if Pylint is working"""

import os
import sys
# import unused_module  # Removed unused import

# Fixed Pylint warnings:
def good_function_name():  # Fixed: snake_case naming
    """Example function with proper Pylint compliance."""
    print("Hello")
    # Removed unused variables
    # Fixed: removed useless return
    
    # Split long line to comply with line length limit
    long_variable_name = (
        "This was a really long line that exceeded the maximum "
        "line length but is now properly formatted"
    )
    return long_variable_name

class TestClass:  # Fixed: PascalCase for class names
    """Example class with proper Pylint compliance."""  
    def __init__(self):
        """Initialize the test class."""
        self.value = "test"
    
    def get_value(self):
        """Get the test value."""
        return self.value

# Missing main guard
if __name__ == "__main__":
    # This will trigger an undefined-variable error
    BadFunctionName()
    print("Pylint test file")
