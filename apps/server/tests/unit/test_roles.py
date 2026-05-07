"""Unit tests for utils/roles.py — covers all permission functions and edge cases."""

from utils.roles import (
    SessionRole,
    can_assign_role,
    can_interact,
    can_modify_role,
    get_permissions,
    get_sprite_limit,
    get_visible_layers,
    has_session_admin_permission,
    is_dm,
    is_elevated,
    is_valid_role,
)


class TestBasicRoleChecks:
    def test_owner_is_dm(self):
        assert is_dm("owner") is True

    def test_co_dm_is_dm(self):
        assert is_dm("co_dm") is True

    def test_player_is_not_dm(self):
        assert is_dm("player") is False

    def test_spectator_is_not_dm(self):
        assert is_dm("spectator") is False

    def test_none_is_not_dm(self):
        assert is_dm(None) is False

    def test_owner_is_elevated(self):
        assert is_elevated("owner") is True

    def test_trusted_player_is_elevated(self):
        assert is_elevated("trusted_player") is True

    def test_player_is_not_elevated(self):
        assert is_elevated("player") is False

    def test_can_interact_players(self):
        for role in ("owner", "co_dm", "trusted_player", "player"):
            assert can_interact(role) is True

    def test_spectator_cannot_interact(self):
        assert can_interact("spectator") is False

    def test_can_interact_none(self):
        assert can_interact(None) is False

    def test_is_valid_role_all_roles(self):
        for role in SessionRole:
            assert is_valid_role(role.value) is True

    def test_is_valid_role_invalid(self):
        assert is_valid_role("dungeon_master") is False
        assert is_valid_role(None) is False
        assert is_valid_role("") is False


class TestGetVisibleLayers:
    def test_owner_sees_all_layers(self):
        layers = get_visible_layers("owner")
        assert "dungeon_master" in layers
        assert "fog_of_war" in layers

    def test_player_cannot_see_dm_layer(self):
        layers = get_visible_layers("player")
        assert "dungeon_master" not in layers
        assert "map" in layers

    def test_spectator_limited_layers(self):
        layers = get_visible_layers("spectator")
        assert "tokens" in layers
        assert "dungeon_master" not in layers

    def test_unknown_role_fallback(self):
        layers = get_visible_layers("unknown_role")
        assert isinstance(layers, list)
        assert len(layers) > 0

    def test_none_fallback(self):
        layers = get_visible_layers(None)
        assert isinstance(layers, list)


class TestGetSpriteLimit:
    def test_owner_high_limit(self):
        assert get_sprite_limit("owner") == 1000

    def test_player_low_limit(self):
        assert get_sprite_limit("player") == 5

    def test_spectator_zero_limit(self):
        assert get_sprite_limit("spectator") == 0

    def test_unknown_role_zero(self):
        assert get_sprite_limit("unknown") == 0

    def test_none_returns_zero(self):
        assert get_sprite_limit(None) == 0


class TestGetPermissions:
    def test_owner_has_all_permission(self):
        perms = get_permissions("owner")
        assert "all" in perms

    def test_player_limited_permissions(self):
        perms = get_permissions("player")
        assert "table:delete" not in perms
        assert "sprite:create" in perms

    def test_unknown_role_empty(self):
        assert get_permissions("nobody") == []

    def test_none_returns_empty(self):
        assert get_permissions(None) == []


class TestCanModifyRole:
    def test_owner_can_modify_player(self):
        assert can_modify_role("owner", "player") is True

    def test_owner_can_modify_co_dm(self):
        assert can_modify_role("owner", "co_dm") is True

    def test_co_dm_cannot_modify_owner(self):
        assert can_modify_role("co_dm", "owner") is False

    def test_player_cannot_modify_anyone(self):
        for role in ("owner", "co_dm", "player", "spectator"):
            assert can_modify_role("player", role) is False


class TestHasSessionAdminPermission:
    def test_owner_has_admin(self):
        assert has_session_admin_permission("owner") is True

    def test_co_dm_has_admin(self):
        assert has_session_admin_permission("co_dm") is True

    def test_player_no_admin(self):
        assert has_session_admin_permission("player") is False


class TestCanAssignRole:
    def test_owner_can_assign_player_to_trusted(self):
        ok, err = can_assign_role("owner", "player", "trusted_player")
        assert ok is True
        assert err == ""

    def test_cannot_change_owner_role(self):
        ok, err = can_assign_role("owner", "owner", "player")
        assert ok is False
        assert "owner" in err.lower()

    def test_cannot_assign_owner_role(self):
        ok, err = can_assign_role("owner", "player", "owner")
        assert ok is False

    def test_co_dm_cannot_assign_co_dm(self):
        ok, err = can_assign_role("co_dm", "player", "co_dm")
        assert ok is False

    def test_player_cannot_assign_roles(self):
        ok, err = can_assign_role("player", "spectator", "player")
        assert ok is False
        assert "only" in err.lower()

    def test_invalid_new_role_rejected(self):
        ok, err = can_assign_role("owner", "player", "hacker")
        assert ok is False
        assert "invalid" in err.lower()
