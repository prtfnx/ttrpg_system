"""
Security utility functions for invitation and admin systems
"""
import re
from typing import Optional

def sanitize_session_code(session_code: Optional[str]) -> str:
    """
    Sanitize and validate session code format
    
    Args:
        session_code: The session code to sanitize
        
    Returns:
        str: The sanitized session code
        
    Raises:
        ValueError: If session code is invalid or dangerous
    """
    if not session_code:
        raise ValueError("Session code cannot be empty")
    
    # Remove whitespace
    session_code = session_code.strip()
    
    if not session_code:
        raise ValueError("Session code cannot be empty after sanitization")
    
    # Check length limits
    if len(session_code) > 20:
        raise ValueError("Session code too long")
    
    if len(session_code) < 4:
        raise ValueError("Session code too short")
    
    # Only allow alphanumeric characters
    if not re.match(r'^[A-Z0-9]+$', session_code):
        raise ValueError("Session code contains invalid characters")
    
    # Check for SQL injection patterns
    dangerous_patterns = [
        r"'.*'",  # Single quotes
        r'".*"',  # Double quotes  
        r'--',    # SQL comments
        r'/\*.*\*/',  # SQL block comments
        r';',     # Statement terminator
        r'\\',    # Backslashes
        r'\.\.',  # Directory traversal
        r'<.*>',  # HTML/XML tags
    ]
    
    for pattern in dangerous_patterns:
        if re.search(pattern, session_code, re.IGNORECASE):
            raise ValueError(f"Session code contains dangerous pattern: {pattern}")
    
    return session_code

def sanitize_user_input(user_input: Optional[str], max_length: int = 255) -> str:
    """
    Sanitize general user input
    
    Args:
        user_input: The input to sanitize
        max_length: Maximum allowed length
        
    Returns:
        str: The sanitized input
        
    Raises:
        ValueError: If input is invalid or dangerous
    """
    if not user_input:
        raise ValueError("Input cannot be empty")
    
    user_input = user_input.strip()
    
    if len(user_input) > max_length:
        raise ValueError(f"Input too long (max {max_length} characters)")
    
    # Check for XSS patterns
    xss_patterns = [
        r'<script.*?>.*?</script>',
        r'javascript:',
        r'on\w+\s*=',  # Event handlers like onclick=
        r'<.*?on\w+.*?>',
    ]
    
    for pattern in xss_patterns:
        if re.search(pattern, user_input, re.IGNORECASE):
            raise ValueError("Input contains dangerous XSS pattern")
    
    # Check for SQL injection patterns
    sql_patterns = [
        r"'.*?;.*?--",  # SQL injection with comment
        r'".*?;.*?--',  # SQL injection with comment
        r'union\s+select',  # UNION SELECT
        r'drop\s+table',   # DROP TABLE
        r'insert\s+into',  # INSERT INTO
        r'delete\s+from',  # DELETE FROM
        r'update\s+.*?set', # UPDATE SET
    ]
    
    for pattern in sql_patterns:
        if re.search(pattern, user_input, re.IGNORECASE):
            raise ValueError("Input contains dangerous SQL pattern")
    
    return user_input

def validate_role(role: str) -> bool:
    """
    Validate that a role is one of the allowed values
    
    Args:
        role: The role to validate
        
    Returns:
        bool: True if role is valid
    """
    allowed_roles = {'owner', 'co_dm', 'player'}
    return role in allowed_roles

def validate_invite_code_format(invite_code: Optional[str]) -> bool:
    """
    Validate invite code format
    
    Args:
        invite_code: The invite code to validate
        
    Returns:
        bool: True if format is valid
    """
    if not invite_code:
        return False
    
    # Should be alphanumeric, specific length
    if not re.match(r'^[A-Za-z0-9]+$', invite_code):
        return False
    
    # Length should be reasonable (between 8 and 32 characters)
    if len(invite_code) < 8 or len(invite_code) > 32:
        return False
    
    return True