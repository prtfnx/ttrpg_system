from enum import Enum
from typing import Optional


class SessionRole(str, Enum):
    OWNER = "owner"
    CO_DM = "co_dm"
    TRUSTED_PLAYER = "trusted_player"
    PLAYER = "player"
    SPECTATOR = "spectator"


ALL_ROLES = {r.value for r in SessionRole}
DM_ROLES = {SessionRole.OWNER.value, SessionRole.CO_DM.value}
ELEVATED_ROLES = {SessionRole.OWNER.value, SessionRole.CO_DM.value, SessionRole.TRUSTED_PLAYER.value}
INTERACTIVE_ROLES = {r.value for r in SessionRole if r != SessionRole.SPECTATOR}

_PERMISSIONS: dict[str, list[str]] = {
    SessionRole.OWNER: [
        "all",
        "compendium:read", "compendium:write",
        "table:admin", "table:create", "table:delete",
        "character:read", "character:write",
        "sprite:create", "sprite:move", "sprite:delete",
        "player:manage", "player:kick", "player:role",
        "session:settings", "session:close",
    ],
    SessionRole.CO_DM: [
        "compendium:read", "compendium:write",
        "table:admin", "table:create",
        "character:read", "character:write",
        "sprite:create", "sprite:move", "sprite:delete",
        "player:manage", "player:kick", "player:role",
    ],
    SessionRole.TRUSTED_PLAYER: [
        "compendium:read",
        "character:read", "character:write",
        "sprite:create", "sprite:move",
    ],
    SessionRole.PLAYER: [
        "compendium:read",
        "character:read",
        "sprite:create",
    ],
    SessionRole.SPECTATOR: [
        "compendium:read",
    ],
}

# Layers visible per role — must match WASM layer IDs exactly
_VISIBLE_LAYERS: dict[str, list[str]] = {
    SessionRole.OWNER: ["map", "tokens", "dungeon_master", "light", "height", "obstacles", "fog_of_war"],
    SessionRole.CO_DM: ["map", "tokens", "dungeon_master", "light", "height", "obstacles", "fog_of_war"],
    SessionRole.TRUSTED_PLAYER: ["map", "tokens", "light", "fog_of_war"],
    SessionRole.PLAYER: ["map", "tokens", "light", "fog_of_war"],
    SessionRole.SPECTATOR: ["map", "tokens", "fog_of_war"],
}


def is_valid_role(role: Optional[str]) -> bool:
    return role in ALL_ROLES


def is_dm(role: Optional[str]) -> bool:
    return role in DM_ROLES


def is_elevated(role: Optional[str]) -> bool:
    return role in ELEVATED_ROLES


def can_interact(role: Optional[str]) -> bool:
    return role in INTERACTIVE_ROLES


def get_permissions(role: Optional[str]) -> list[str]:
    return _PERMISSIONS.get(role or "", [])


def get_visible_layers(role: Optional[str]) -> list[str]:
    return _VISIBLE_LAYERS.get(role or "", ["map", "tokens", "fog"])


# Role hierarchy: who can modify whom
_ROLE_MODIFY_HIERARCHY: dict[str, set[str]] = {
    SessionRole.OWNER: {SessionRole.CO_DM, SessionRole.TRUSTED_PLAYER, SessionRole.PLAYER, SessionRole.SPECTATOR},
    SessionRole.CO_DM: {SessionRole.TRUSTED_PLAYER, SessionRole.PLAYER, SessionRole.SPECTATOR},
    SessionRole.TRUSTED_PLAYER: set(),
    SessionRole.PLAYER: set(),
    SessionRole.SPECTATOR: set(),
}


def can_modify_role(actor_role: str, target_role: str) -> bool:
    """Return True if actor_role can modify/assign target_role."""
    return target_role in _ROLE_MODIFY_HIERARCHY.get(actor_role, set())


def has_session_admin_permission(role: str) -> bool:
    """Return True if role has admin-level session permissions."""
    return role in DM_ROLES


# Max sprites a player of each role can own simultaneously
SPRITE_LIMITS: dict[str, int] = {
    SessionRole.OWNER: 1000,
    SessionRole.CO_DM: 100,
    SessionRole.TRUSTED_PLAYER: 20,
    SessionRole.PLAYER: 5,
    SessionRole.SPECTATOR: 0,
}


def get_sprite_limit(role: Optional[str]) -> int:
    return SPRITE_LIMITS.get(role or "", 0)


def can_assign_role(requester_role: Optional[str], target_role: Optional[str], new_role: str) -> tuple[bool, str]:
    """Check if requester can assign new_role to a player currently at target_role."""
    if not is_valid_role(new_role):
        return False, f"Invalid role: {new_role}"
    if target_role == SessionRole.OWNER:
        return False, "Cannot change owner role"
    if new_role == SessionRole.OWNER:
        return False, "Cannot assign owner role"
    if requester_role not in DM_ROLES:
        return False, "Only owner or co_dm can change roles"
    # co_dm cannot promote to co_dm (only owner can)
    if requester_role == SessionRole.CO_DM and new_role == SessionRole.CO_DM:
        return False, "Co-DM cannot assign co_dm role"
    return True, ""
