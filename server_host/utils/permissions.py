"""
Permission system for session-based role management
"""
from enum import Enum
from typing import Set

class SessionPermission(str, Enum):
    CREATE_TOKENS = "create_tokens"
    DELETE_TOKENS = "delete_tokens"
    MODIFY_OWN_TOKENS = "modify_own_tokens"
    MODIFY_ALL_TOKENS = "modify_all_tokens"
    
    VIEW_DM_LAYER = "view_dm_layer"
    MODIFY_DM_LAYER = "modify_dm_layer"
    VIEW_FOG_OF_WAR = "view_fog_of_war"
    MODIFY_FOG_OF_WAR = "modify_fog_of_war"
    
    UPLOAD_ASSETS = "upload_assets"
    DELETE_ASSETS = "delete_assets"
    MANAGE_ASSETS = "manage_assets"
    
    USE_DRAWING_TOOLS = "use_drawing_tools"
    USE_MEASUREMENT_TOOLS = "use_measurement_tools"
    DELETE_DRAWINGS = "delete_drawings"
    
    MODIFY_TURN_ORDER = "modify_turn_order"
    ROLL_DICE_PUBLIC = "roll_dice_public"
    ROLL_DICE_PRIVATE = "roll_dice_private"
    VIEW_PRIVATE_ROLLS = "view_private_rolls"
    
    INVITE_PLAYERS = "invite_players"
    KICK_PLAYERS = "kick_players"
    BAN_PLAYERS = "ban_players"
    CHANGE_ROLES = "change_roles"
    MODIFY_SESSION = "modify_session"
    DELETE_SESSION = "delete_session"
    
    CREATE_CHARACTERS = "create_characters"
    EDIT_OWN_CHARACTERS = "edit_own_characters"
    EDIT_ALL_CHARACTERS = "edit_all_characters"
    DELETE_CHARACTERS = "delete_characters"

ROLE_PERMISSIONS: dict[str, Set[str]] = {
    "owner": {
        SessionPermission.CREATE_TOKENS,
        SessionPermission.DELETE_TOKENS,
        SessionPermission.MODIFY_OWN_TOKENS,
        SessionPermission.MODIFY_ALL_TOKENS,
        SessionPermission.VIEW_DM_LAYER,
        SessionPermission.MODIFY_DM_LAYER,
        SessionPermission.VIEW_FOG_OF_WAR,
        SessionPermission.MODIFY_FOG_OF_WAR,
        SessionPermission.UPLOAD_ASSETS,
        SessionPermission.DELETE_ASSETS,
        SessionPermission.MANAGE_ASSETS,
        SessionPermission.USE_DRAWING_TOOLS,
        SessionPermission.USE_MEASUREMENT_TOOLS,
        SessionPermission.DELETE_DRAWINGS,
        SessionPermission.MODIFY_TURN_ORDER,
        SessionPermission.ROLL_DICE_PUBLIC,
        SessionPermission.ROLL_DICE_PRIVATE,
        SessionPermission.VIEW_PRIVATE_ROLLS,
        SessionPermission.INVITE_PLAYERS,
        SessionPermission.KICK_PLAYERS,
        SessionPermission.BAN_PLAYERS,
        SessionPermission.CHANGE_ROLES,
        SessionPermission.MODIFY_SESSION,
        SessionPermission.DELETE_SESSION,
        SessionPermission.CREATE_CHARACTERS,
        SessionPermission.EDIT_OWN_CHARACTERS,
        SessionPermission.EDIT_ALL_CHARACTERS,
        SessionPermission.DELETE_CHARACTERS,
    },
    
    "co_dm": {
        SessionPermission.CREATE_TOKENS,
        SessionPermission.DELETE_TOKENS,
        SessionPermission.MODIFY_OWN_TOKENS,
        SessionPermission.MODIFY_ALL_TOKENS,
        SessionPermission.VIEW_DM_LAYER,
        SessionPermission.MODIFY_DM_LAYER,
        SessionPermission.VIEW_FOG_OF_WAR,
        SessionPermission.MODIFY_FOG_OF_WAR,
        SessionPermission.UPLOAD_ASSETS,
        SessionPermission.DELETE_ASSETS,
        SessionPermission.MANAGE_ASSETS,
        SessionPermission.USE_DRAWING_TOOLS,
        SessionPermission.USE_MEASUREMENT_TOOLS,
        SessionPermission.DELETE_DRAWINGS,
        SessionPermission.MODIFY_TURN_ORDER,
        SessionPermission.ROLL_DICE_PUBLIC,
        SessionPermission.ROLL_DICE_PRIVATE,
        SessionPermission.VIEW_PRIVATE_ROLLS,
        SessionPermission.INVITE_PLAYERS,
        SessionPermission.KICK_PLAYERS,
        SessionPermission.CREATE_CHARACTERS,
        SessionPermission.EDIT_OWN_CHARACTERS,
        SessionPermission.EDIT_ALL_CHARACTERS,
    },
    
    "trusted_player": {
        SessionPermission.MODIFY_OWN_TOKENS,
        SessionPermission.UPLOAD_ASSETS,
        SessionPermission.USE_DRAWING_TOOLS,
        SessionPermission.USE_MEASUREMENT_TOOLS,
        SessionPermission.DELETE_DRAWINGS,
        SessionPermission.ROLL_DICE_PUBLIC,
        SessionPermission.ROLL_DICE_PRIVATE,
        SessionPermission.CREATE_CHARACTERS,
        SessionPermission.EDIT_OWN_CHARACTERS,
    },
    
    "player": {
        SessionPermission.MODIFY_OWN_TOKENS,
        SessionPermission.USE_DRAWING_TOOLS,
        SessionPermission.USE_MEASUREMENT_TOOLS,
        SessionPermission.ROLL_DICE_PUBLIC,
        SessionPermission.ROLL_DICE_PRIVATE,
        SessionPermission.CREATE_CHARACTERS,
        SessionPermission.EDIT_OWN_CHARACTERS,
    },
    
    "spectator": set(),
}

def get_role_permissions(role: str) -> Set[str]:
    return ROLE_PERMISSIONS.get(role, set())

def check_permission(role: str, permission: str) -> bool:
    return permission in get_role_permissions(role)

def get_permission_diff(from_role: str, to_role: str) -> dict[str, Set[str]]:
    from_perms = get_role_permissions(from_role)
    to_perms = get_role_permissions(to_role)
    
    return {
        "gained": to_perms - from_perms,
        "lost": from_perms - to_perms,
        "unchanged": from_perms & to_perms
    }
