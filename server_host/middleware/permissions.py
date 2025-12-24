"""
Permission middleware for FastAPI endpoints
Production-grade authorization with role and tier-based access control
"""
from fastapi import HTTPException, Depends, status
from typing import List, Annotated
from sqlalchemy.orm import Session
from functools import wraps

from ..database.database import get_db
from ..database import schemas
from ..routers.users import get_current_user
from ..utils.logger import setup_logger

logger = setup_logger(__name__)


class PermissionDenied(HTTPException):
    """Custom exception for permission denied errors"""
    def __init__(self, required_permission: str):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: '{required_permission}' required"
        )


async def require_permissions(
    required_permissions: List[str],
    current_user: Annotated[schemas.User, Depends(get_current_user)] = None,
) -> schemas.User:
    """
    Dependency to check if user has required permissions
    
    Usage in route:
        @router.get("/protected")
        async def protected_route(
            user: User = Depends(require_permissions(["compendium:read"]))
        ):
            ...
    
    Args:
        required_permissions: List of permission strings required
        current_user: Current authenticated user (injected)
    
    Returns:
        User object if authorized
        
    Raises:
        HTTPException 403 if permission denied
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    
    user_permissions = current_user.get_permissions()
    
    # Check admin wildcard
    if "admin:*" in user_permissions:
        return current_user
    
    # Check each required permission
    for permission in required_permissions:
        if permission not in user_permissions:
            logger.warning(
                f"Permission denied for user {current_user.username}: "
                f"required '{permission}', has {user_permissions}"
            )
            raise PermissionDenied(permission)
    
    return current_user


def require_permission(permission: str):
    """
    Factory function to create permission dependency for a single permission
    
    Usage:
        @router.get("/endpoint")
        async def endpoint(user: User = Depends(require_permission("compendium:read"))):
            ...
    """
    async def permission_checker(
        current_user: Annotated[schemas.User, Depends(get_current_user)]
    ) -> schemas.User:
        return await require_permissions([permission], current_user)
    return permission_checker


def require_role(role: str):
    """
    Dependency to check if user has specific role
    
    Usage:
        @router.get("/dm-only")
        async def dm_endpoint(user: User = Depends(require_role("dm"))):
            ...
    """
    async def role_checker(
        current_user: Annotated[schemas.User, Depends(get_current_user)]
    ) -> schemas.User:
        if current_user.role != role and current_user.role != "admin":
            logger.warning(
                f"Role check failed for user {current_user.username}: "
                f"required '{role}', has '{current_user.role}'"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' required"
            )
        return current_user
    return role_checker


def require_tier(tier: str):
    """
    Dependency to check if user has specific tier level
    
    Usage:
        @router.get("/premium-only")
        async def premium_endpoint(user: User = Depends(require_tier("premium"))):
            ...
    """
    async def tier_checker(
        current_user: Annotated[schemas.User, Depends(get_current_user)]
    ) -> schemas.User:
        # Admin always has access
        if current_user.role == "admin":
            return current_user
        
        tier_levels = {"free": 0, "premium": 1}
        user_tier_level = tier_levels.get(current_user.tier, 0)
        required_tier_level = tier_levels.get(tier, 0)
        
        if user_tier_level < required_tier_level:
            logger.warning(
                f"Tier check failed for user {current_user.username}: "
                f"required '{tier}', has '{current_user.tier}'"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Tier '{tier}' required. Upgrade your account."
            )
        return current_user
    return tier_checker
