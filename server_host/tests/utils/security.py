"""
Security testing utilities for invitation and admin systems
"""
import re
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

def sanitize_input(value: str, max_length: int = 255) -> str:
    """
    Sanitize input string for security testing
    
    Args:
        value: Input value to sanitize
        max_length: Maximum allowed length
        
    Returns:
        str: Sanitized value
    """
    if not isinstance(value, str):
        value = str(value)
    
    # Remove null bytes and control characters except newlines/tabs
    value = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', value)
    
    # Truncate to max length
    value = value[:max_length]
    
    # Strip leading/trailing whitespace
    value = value.strip()
    
    return value

def validate_email_format(email: str) -> bool:
    """
    Validate email format
    
    Args:
        email: Email address to validate
        
    Returns:
        bool: True if valid format
    """
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))

def validate_session_code_format(session_code: str) -> bool:
    """
    Validate session code format
    
    Args:
        session_code: Session code to validate
        
    Returns:
        bool: True if valid format
    """
    # Session codes should be 6-8 characters, alphanumeric
    pattern = r'^[a-zA-Z0-9]{6,8}$'
    return bool(re.match(pattern, session_code))

def validate_invite_code_format(invite_code: str) -> bool:
    """
    Validate invitation code format
    
    Args:
        invite_code: Invitation code to validate
        
    Returns:
        bool: True if valid format
    """
    # Invite codes should be UUID format
    try:
        uuid.UUID(invite_code)
        return True
    except (ValueError, TypeError):
        return False

def validate_role_name(role: str) -> bool:
    """
    Validate role name
    
    Args:
        role: Role name to validate
        
    Returns:
        bool: True if valid role
    """
    valid_roles = ['player', 'co_dm', 'dm', 'observer']
    return role.lower() in valid_roles

def create_malicious_inputs() -> List[str]:
    """
    Generate list of malicious inputs for security testing
    
    Returns:
        List[str]: List of malicious input strings
    """
    return [
        # SQL Injection attempts
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'/*",
        "' UNION SELECT * FROM users --",
        
        # XSS attempts
        "<script>alert('xss')</script>",
        "javascript:alert('xss')",
        "<img src=x onerror=alert('xss')>",
        "';alert(String.fromCharCode(88,83,83))//",
        
        # Path traversal
        "../../../etc/passwd",
        "..\\..\\..\\windows\\system32\\drivers\\etc\\hosts",
        "%2e%2e%2f%2e%2e%2f%2e%2e%2f",
        
        # Command injection
        "; rm -rf /",
        "| nc -l -p 1234",
        "&& ping 127.0.0.1",
        
        # LDAP injection
        "admin)(|(password=*))",
        "*)(uid=*))(|(uid=*",
        
        # Format string attacks
        "%s%s%s%s%s%s%s%s",
        "%x %x %x %x",
        
        # Buffer overflow attempts
        "A" * 1000,
        "A" * 10000,
        
        # Null bytes and control characters
        "test\x00.txt",
        "test\n\r\t",
        
        # Unicode attacks
        "\u0000",
        "\uFEFF",
        "test\u200B",
        
        # JSON injection
        '{"test": "value", "admin": true}',
        '"; alert("xss"); "',
    ]

def test_input_validation(validation_func, valid_inputs: List[str], invalid_inputs: List[str]) -> Dict[str, List[str]]:
    """
    Test input validation function with valid and invalid inputs
    
    Args:
        validation_func: Function to test
        valid_inputs: List of inputs that should be valid
        invalid_inputs: List of inputs that should be invalid
        
    Returns:
        Dict: Results of validation tests
    """
    results = {
        'passed_valid': [],
        'failed_valid': [],
        'passed_invalid': [],
        'failed_invalid': []
    }
    
    # Test valid inputs
    for input_val in valid_inputs:
        try:
            if validation_func(input_val):
                results['passed_valid'].append(input_val)
            else:
                results['failed_valid'].append(input_val)
        except Exception as e:
            results['failed_valid'].append(f"{input_val} (Exception: {str(e)})")
    
    # Test invalid inputs
    for input_val in invalid_inputs:
        try:
            if not validation_func(input_val):
                results['passed_invalid'].append(input_val)
            else:
                results['failed_invalid'].append(input_val)
        except Exception as e:
            # Exceptions are acceptable for invalid inputs
            results['passed_invalid'].append(f"{input_val} (Exception: {str(e)})")
    
    return results

def check_privilege_escalation(user_role: str, attempted_action: str, allowed_actions: Dict[str, List[str]]) -> bool:
    """
    Check if user is attempting privilege escalation
    
    Args:
        user_role: Current user's role
        attempted_action: Action being attempted
        allowed_actions: Dictionary mapping roles to allowed actions
        
    Returns:
        bool: True if action is allowed, False if privilege escalation attempt
    """
    if user_role not in allowed_actions:
        return False
    
    return attempted_action in allowed_actions[user_role]

def validate_session_timeout(created_at: datetime, timeout_hours: int = 24) -> bool:
    """
    Validate if session should be timed out
    
    Args:
        created_at: When session was created
        timeout_hours: Hours until timeout
        
    Returns:
        bool: True if session is still valid
    """
    if not isinstance(created_at, datetime):
        return False
    
    timeout_time = created_at + timedelta(hours=timeout_hours)
    return datetime.utcnow() < timeout_time

def create_secure_headers() -> Dict[str, str]:
    """
    Get security headers for testing
    
    Returns:
        Dict[str, str]: Security headers
    """
    return {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'",
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    }

def validate_password_strength(password: str) -> Dict[str, bool]:
    """
    Validate password strength
    
    Args:
        password: Password to validate
        
    Returns:
        Dict[str, bool]: Validation results
    """
    return {
        'min_length': len(password) >= 8,
        'has_uppercase': bool(re.search(r'[A-Z]', password)),
        'has_lowercase': bool(re.search(r'[a-z]', password)),
        'has_number': bool(re.search(r'\d', password)),
        'has_special': bool(re.search(r'[!@#$%^&*(),.?":{}|<>]', password)),
        'no_common_patterns': not bool(re.search(r'(123456|password|qwerty)', password.lower()))
    }