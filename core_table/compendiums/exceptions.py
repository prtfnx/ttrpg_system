#!/usr/bin/env python3
"""
Custom exceptions for compendium system
Provides structured error handling with error codes
"""

from typing import Optional, Dict, Any


class CompendiumError(Exception):
    """Base exception for all compendium operations"""
    
    def __init__(self, message: str, code: str = "COMPENDIUM_ERROR", details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(self.message)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict for WebSocket messages"""
        return {
            'error': self.message,
            'code': self.code,
            'details': self.details
        }


class DataNotFoundError(CompendiumError):
    """Raised when requested compendium data doesn't exist"""
    
    def __init__(self, item_type: str, name: str):
        super().__init__(
            message=f"{item_type} '{name}' not found",
            code="NOT_FOUND",
            details={'item_type': item_type, 'name': name}
        )


class AttunementError(CompendiumError):
    """Raised when attunement operation fails"""
    
    def __init__(self, character_id: str, item_name: str, reason: str):
        super().__init__(
            message=f"Attunement failed for character '{character_id}' with item '{item_name}': {reason}",
            code="ATTUNEMENT_ERROR",
            details={'character_id': character_id, 'item_name': item_name, 'reason': reason}
        )


class ValidationError(CompendiumError):
    """Raised when data validation fails"""
    
    def __init__(self, field: str, value: Any, reason: str):
        super().__init__(
            message=f"Validation failed for field '{field}': {reason}",
            code="VALIDATION_ERROR",
            details={'field': field, 'value': str(value), 'reason': reason}
        )
