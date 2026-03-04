"""
RBAC Role System Tests
Tests server-side role utilities, permissions, and access control behaviour.
"""
import unittest
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from server_host.utils.roles import (
    is_valid_role, is_dm, is_elevated, can_interact,
    get_permissions, get_visible_layers, can_assign_role,
    SessionRole, ALL_ROLES, DM_ROLES, ELEVATED_ROLES, INTERACTIVE_ROLES,
)


class TestRoleValidation(unittest.TestCase):
    """What roles are valid in the system"""

    def test_all_five_canonical_roles_are_valid(self):
        for role in ('owner', 'co_dm', 'trusted_player', 'player', 'spectator'):
            with self.subTest(role=role):
                self.assertTrue(is_valid_role(role))

    def test_unknown_role_strings_are_rejected(self):
        for bad in ('admin', 'gm', 'dm', 'moderator', '', 'OWNER'):
            with self.subTest(role=bad):
                self.assertFalse(is_valid_role(bad))

    def test_legacy_dm_player_strings_are_not_valid(self):
        self.assertFalse(is_valid_role('dm'))
        self.assertFalse(is_valid_role('player_enhanced'))


class TestIsDM(unittest.TestCase):
    """DM status - only owner and co_dm"""

    def test_owner_is_dm(self):
        self.assertTrue(is_dm('owner'))

    def test_co_dm_is_dm(self):
        self.assertTrue(is_dm('co_dm'))

    def test_trusted_player_is_not_dm(self):
        self.assertFalse(is_dm('trusted_player'))

    def test_player_is_not_dm(self):
        self.assertFalse(is_dm('player'))

    def test_spectator_is_not_dm(self):
        self.assertFalse(is_dm('spectator'))


class TestIsElevated(unittest.TestCase):
    """Elevated roles can access compendium and token layer"""

    def test_dm_roles_are_elevated(self):
        self.assertTrue(is_elevated('owner'))
        self.assertTrue(is_elevated('co_dm'))

    def test_trusted_player_is_elevated(self):
        self.assertTrue(is_elevated('trusted_player'))

    def test_player_is_not_elevated(self):
        self.assertFalse(is_elevated('player'))

    def test_spectator_is_not_elevated(self):
        self.assertFalse(is_elevated('spectator'))


class TestCanInteract(unittest.TestCase):
    """Spectators are read-only; all other roles can interact"""

    def test_all_non_spectator_roles_can_interact(self):
        for role in ('owner', 'co_dm', 'trusted_player', 'player'):
            with self.subTest(role=role):
                self.assertTrue(can_interact(role))

    def test_spectator_cannot_interact(self):
        self.assertFalse(can_interact('spectator'))


class TestVisibleLayers(unittest.TestCase):
    """Each role sees only the layers they should"""

    def test_owner_sees_all_layers_including_dm_notes(self):
        layers = get_visible_layers('owner')
        for expected in ('map', 'tokens', 'dm_notes', 'fog'):
            self.assertIn(expected, layers, f"owner should see {expected}")

    def test_player_does_not_see_dm_notes(self):
        layers = get_visible_layers('player')
        self.assertIn('map', layers)
        self.assertNotIn('dm_notes', layers)
        self.assertNotIn('hidden', layers)

    def test_spectator_has_same_layer_visibility_as_player(self):
        spectator_layers = set(get_visible_layers('spectator'))
        player_layers = set(get_visible_layers('player'))
        self.assertEqual(spectator_layers, player_layers)

    def test_trusted_player_sees_tokens_but_not_dm_notes(self):
        layers = get_visible_layers('trusted_player')
        self.assertIn('tokens', layers)
        self.assertNotIn('dm_notes', layers)

    def test_unknown_role_falls_back_safely(self):
        layers = get_visible_layers('hacker')
        self.assertIn('map', layers)
        # Should not crash and should return minimal access
        self.assertNotIn('dm_notes', layers)


class TestPermissions(unittest.TestCase):
    """Each role has appropriate permissions"""

    def test_owner_has_all_permission(self):
        perms = get_permissions('owner')
        self.assertIn('all', perms)

    def test_player_cannot_admin_tables(self):
        perms = get_permissions('player')
        self.assertNotIn('table:admin', perms)
        self.assertNotIn('all', perms)

    def test_spectator_has_minimal_permissions(self):
        perms = get_permissions('spectator')
        # Spectators should have very limited access
        self.assertNotIn('sprite:create', perms)
        self.assertNotIn('sprite:move', perms)
        self.assertNotIn('table:admin', perms)

    def test_co_dm_can_manage_players(self):
        perms = get_permissions('co_dm')
        self.assertIn('player:manage', perms)
        self.assertIn('player:kick', perms)
        # co_dm cannot close session
        self.assertNotIn('session:close', perms)


class TestCanAssignRole(unittest.TestCase):
    """Role assignment rules - who can promote/demote whom"""

    def test_owner_can_promote_player_to_trusted_player(self):
        allowed, _ = can_assign_role('owner', 'player', 'trusted_player')
        self.assertTrue(allowed)

    def test_owner_can_demote_co_dm_to_player(self):
        allowed, _ = can_assign_role('owner', 'co_dm', 'player')
        self.assertTrue(allowed)

    def test_co_dm_can_promote_player_to_trusted_player(self):
        allowed, _ = can_assign_role('co_dm', 'player', 'trusted_player')
        self.assertTrue(allowed)

    def test_co_dm_cannot_promote_to_co_dm(self):
        allowed, msg = can_assign_role('co_dm', 'player', 'co_dm')
        self.assertFalse(allowed)
        self.assertIn('co_dm', msg.lower())

    def test_nobody_can_assign_owner_role(self):
        for requester in ('owner', 'co_dm', 'trusted_player', 'player'):
            allowed, _ = can_assign_role(requester, 'player', 'owner')
            self.assertFalse(allowed, f"{requester} should not be able to assign owner role")

    def test_nobody_can_change_the_owners_role(self):
        for requester in ('co_dm', 'trusted_player', 'player'):
            allowed, _ = can_assign_role(requester, 'owner', 'player')
            self.assertFalse(allowed, f"{requester} should not be able to change the owner")

    def test_player_cannot_change_any_roles(self):
        allowed, _ = can_assign_role('player', 'spectator', 'player')
        self.assertFalse(allowed)

    def test_invalid_new_role_is_rejected(self):
        allowed, msg = can_assign_role('owner', 'player', 'admin')
        self.assertFalse(allowed)
        self.assertIn('invalid', msg.lower())


if __name__ == '__main__':
    unittest.main()
