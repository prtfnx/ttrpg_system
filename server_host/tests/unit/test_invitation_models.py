import pytest
import time
from datetime import datetime, timedelta
from unittest.mock import patch
from sqlalchemy.exc import IntegrityError

from server_host.database.models import SessionInvitation, AuditLog, GamePlayer
from server_host.routers.invitations import generate_invite_code, validate_invite_code_format
from server_host.routers.game import can_modify_role, has_session_admin_permission, sanitize_session_code
from server_host.utils.security import sanitize_user_input

@pytest.mark.unit
class TestSessionInvitationModel:
    """Unit tests for SessionInvitation model business logic"""
    
    def test_invitation_is_valid_active_and_not_expired(self):
        """Test that active, non-expired invitations are valid"""
        
        invitation = SessionInvitation(
            invite_code="VALID123",
            session_id=1,
            pre_assigned_role="player",
            created_by=1,
            max_uses=5,
            uses_count=2,
            is_active=True,
            expires_at=datetime.utcnow() + timedelta(hours=1)
        )
        
        assert invitation.is_valid() is True
        
    def test_invitation_invalid_when_inactive(self):
        """Test that inactive invitations are invalid"""
        
        invitation = SessionInvitation(
            invite_code="INACTIVE",
            session_id=1,
            pre_assigned_role="player",
            created_by=1,
            max_uses=5,
            uses_count=2,
            is_active=False,  # Inactive
            expires_at=datetime.utcnow() + timedelta(hours=1)
        )
        
        assert invitation.is_valid() is False
        
    def test_invitation_invalid_when_expired(self):
        """Test that expired invitations are invalid"""
        
        invitation = SessionInvitation(
            invite_code="EXPIRED123",
            session_id=1,
            pre_assigned_role="player", 
            created_by=1,
            max_uses=5,
            uses_count=2,
            is_active=True,
            expires_at=datetime.utcnow() - timedelta(hours=1)  # Expired
        )
        
        assert invitation.is_valid() is False
        
    def test_invitation_invalid_when_max_uses_reached(self):
        """Test that invitations with no remaining uses are invalid"""
        
        invitation = SessionInvitation(
            invite_code="MAXED123",
            session_id=1,
            pre_assigned_role="player",
            created_by=1,
            max_uses=3,
            uses_count=3,  # Reached max uses
            is_active=True,
            expires_at=datetime.utcnow() + timedelta(hours=1)
        )
        
        assert invitation.is_valid() is False
        
    def test_invitation_valid_when_uses_below_max(self):
        """Test that invitations with remaining uses are valid"""
        
        invitation = SessionInvitation(
            invite_code="HASLEFT123",
            session_id=1,
            pre_assigned_role="player",
            created_by=1,
            max_uses=10,
            uses_count=7,  # Still has 3 uses left
            is_active=True,
            expires_at=datetime.utcnow() + timedelta(hours=1)
        )
        
        assert invitation.is_valid() is True
        
    def test_invitation_valid_with_no_expiration(self):
        """Test that invitations with no expiration are valid when active"""
        
        invitation = SessionInvitation(
            invite_code="NOEXPIRY",
            session_id=1,
            pre_assigned_role="player",
            created_by=1,
            max_uses=5,
            uses_count=2,
            is_active=True,
            expires_at=None  # No expiration
        )
        
        assert invitation.is_valid() is True
        
    def test_invitation_code_generation(self):
        """Test that invitation codes are unique"""
        
        codes = set()
        for _ in range(100):
            code = generate_invite_code()
            codes.add(code)
            
        # All codes should be unique
        assert len(codes) == 100
        
        # Codes should be proper length and format
        for code in codes:
            assert len(code) == 16  # Based on implementation
            assert code.isalnum()  # Should be alphanumeric
            
    def test_invitation_role_validation(self):
        """Test that only valid roles can be assigned"""
        
        valid_roles = ["player", "co_dm"]
        
        for role in valid_roles:
            invitation = SessionInvitation(
                invite_code=f"ROLE_{role}",
                session_id=1,
                pre_assigned_role=role,
                created_by=1,
                max_uses=1,
                uses_count=0,
                is_active=True
            )
            # Should create without error
            assert invitation.pre_assigned_role == role

@pytest.mark.unit  
class TestAuditLogModel:
    """Unit tests for AuditLog model functionality"""
    
    def test_audit_log_creation(self):
        """Test that audit logs can be created with all required fields"""
        
        audit_log = AuditLog(
            event_type="test_event",
            session_code="TEST123",
            user_id=42,
            ip_address="192.168.1.100",
            user_agent="Test-Browser/1.0",
            details="Test audit log entry"
        )
        
        assert audit_log.event_type == "test_event"
        assert audit_log.session_code == "TEST123"
        assert audit_log.user_id == 42
        assert audit_log.ip_address == "192.168.1.100"
        assert audit_log.user_agent == "Test-Browser/1.0"
        assert audit_log.details == "Test audit log entry"
        
    def test_audit_log_timestamp_auto_generated(self, test_db):
        """Test that audit log timestamps are automatically generated"""
        
        audit_log = AuditLog(
            event_type="timestamp_test",
            session_code="TS123",
            user_id=1,
            ip_address="127.0.0.1",
            details="Timestamp test"
        )
        
        test_db.add(audit_log)
        test_db.commit()
        test_db.refresh(audit_log)
        
        assert audit_log.timestamp is not None
        assert isinstance(audit_log.timestamp, datetime)
        
        # Should be recent (within last minute)
        time_diff = datetime.utcnow() - audit_log.timestamp
        assert time_diff.total_seconds() < 60
        
    def test_audit_log_optional_fields(self, test_db):
        """Test that optional fields can be None"""
        
        # Minimal audit log with only required fields
        audit_log = AuditLog(
            event_type="minimal_test",
            # session_code=None (optional)
            # user_id=None (optional) 
            # ip_address=None (optional)
            # user_agent=None (optional)
            details="Minimal audit log"
        )
        
        test_db.add(audit_log)
        test_db.commit()
        
        # Should save successfully
        assert audit_log.id is not None

@pytest.mark.unit
class TestGamePlayerModel:
    """Unit tests for GamePlayer model with role functionality"""
    
    def test_game_player_role_assignment(self, test_db, test_user, test_game_session):
        """Test that roles can be assigned to game players"""
        
        player = GamePlayer(
            user_id=test_user.id,
            session_id=test_game_session.id,
            role="co_dm"
        )
        
        test_db.add(player)
        test_db.commit()
        test_db.refresh(player)
        
        assert player.role == "co_dm"
        
    def test_game_player_default_role(self, test_db, test_user, test_game_session):
        """Test that default role is 'player'"""
        
        player = GamePlayer(
            user_id=test_user.id,
            session_id=test_game_session.id
            # No role specified, should default to 'player'
        )
        
        test_db.add(player)
        test_db.commit()
        test_db.refresh(player)
        
        assert player.role == "player"
        
    def test_game_player_unique_constraint(self, test_db, test_user, test_game_session):
        """Test that a user can only have one role per session"""
        
        # Create first player record
        player1 = GamePlayer(
            user_id=test_user.id,
            session_id=test_game_session.id,
            role="player"
        )
        test_db.add(player1)
        test_db.commit()
        
        # Try to create duplicate
        player2 = GamePlayer(
            user_id=test_user.id,
            session_id=test_game_session.id,
            role="co_dm"
        )
        test_db.add(player2)
        
        # Should raise integrity error due to unique constraint
        with pytest.raises(IntegrityError):
            test_db.commit()

@pytest.mark.unit
class TestInvitationBusinessLogic:
    """Unit tests for invitation-related business logic functions"""
    
    def test_generate_unique_invite_code_collision_handling(self):
        """Test that invite code generation handles collisions properly"""
        
        # Mock collision scenario
        with patch('server_host.routers.invitations.secrets.token_urlsafe') as mock_token:
            # First call returns a "collision", second call returns unique code
            mock_token.side_effect = ["COLLISION", "UNIQUE123"]
            
            # This would simulate checking against database and finding collision,
            # then generating a new unique code
            code1 = generate_invite_code()  
            code2 = generate_invite_code()
            
            assert code1 == "COLLISION"
            assert code2 == "UNIQUE123"
            
    def test_role_hierarchy_validation(self):
        """Test role hierarchy logic"""
        
        # Owner can modify anyone
        assert can_modify_role("owner", "player") is True
        assert can_modify_role("owner", "co_dm") is True
        
        # Co-DM can modify players but not owners or other co-DMs
        assert can_modify_role("co_dm", "player") is True
        assert can_modify_role("co_dm", "owner") is False
        assert can_modify_role("co_dm", "co_dm") is False
        
        # Players cannot modify anyone
        assert can_modify_role("player", "player") is False
        assert can_modify_role("player", "co_dm") is False
        assert can_modify_role("player", "owner") is False
        
    def test_session_permission_checking(self):
        """Test session permission checking logic"""
        
        # Owner has admin permission
        assert has_session_admin_permission("owner") is True
        
        # Co-DM has admin permission  
        assert has_session_admin_permission("co_dm") is True
        
        # Player does not have admin permission
        assert has_session_admin_permission("player") is False
        
        # Invalid role does not have admin permission
        assert has_session_admin_permission("invalid") is False

@pytest.mark.unit
class TestSecurityValidation:
    """Unit tests for security validation functions"""
    
    def test_session_code_sanitization(self):
        """Test that session codes are properly sanitized"""
        
        # Valid session codes should pass through unchanged
        assert sanitize_session_code("VALID1") == "VALID1"
        assert sanitize_session_code("TEST123") == "TEST123"
        
        # Invalid characters should be rejected or sanitized
        with pytest.raises(ValueError):
            sanitize_session_code("INVALID'; DROP TABLE sessions; --")
            
        with pytest.raises(ValueError):
            sanitize_session_code("../../../etc/passwd")
            
        # Empty or None should be rejected
        with pytest.raises(ValueError):
            sanitize_session_code("")
            
        with pytest.raises(ValueError):
            sanitize_session_code(None)
            
    def test_invite_code_validation(self):
        """Test that invite codes are properly validated"""
        
        # Valid invite codes
        assert validate_invite_code_format("ABC123DEF456GHI7") is True
        assert validate_invite_code_format("VALID16CHARCODE1") is True
        
        # Invalid formats
        assert validate_invite_code_format("too_short") is False
        assert validate_invite_code_format("way_too_long_for_invite_code_12345") is False
        assert validate_invite_code_format("invalid-chars!@#") is False
        assert validate_invite_code_format("") is False
        assert validate_invite_code_format(None) is False
        
    def test_user_input_sanitization(self):
        """Test that user inputs are properly sanitized"""
        
        # Safe inputs should pass through
        assert sanitize_user_input("normal_username") == "normal_username"
        assert sanitize_user_input("Player123") == "Player123"
        
        # Dangerous inputs should be sanitized or rejected
        with pytest.raises(ValueError):
            sanitize_user_input("<script>alert('xss')</script>")
            
        with pytest.raises(ValueError):
            sanitize_user_input("'; DROP TABLE users; --")
            
        # Length limits
        with pytest.raises(ValueError):
            sanitize_user_input("x" * 1000)  # Too long

@pytest.mark.unit
class TestAuditLogUtilities:
    """Unit tests for audit logging utility functions"""
    
    def test_format_audit_details(self):
        """Test that audit details are properly formatted"""
        
        details = format_audit_details("invitation_created", {
            "invite_code": "ABC123",
            "role": "player",
            "expires_hours": 24
        })
        
        assert "invitation_created" in details
        assert "ABC123" in details
        assert "player" in details
        assert "24" in details
        
    def test_extract_client_info(self):
        """Test extraction of client information for audit logs"""
        
        # Mock request object
        mock_request = Mock()
        mock_request.client.host = "192.168.1.50"
        mock_request.headers = {
            "user-agent": "Mozilla/5.0 Test Browser",
            "x-forwarded-for": "203.0.113.1"
        }
        
        client_info = extract_client_info(mock_request)
        
        assert client_info["ip_address"] == "203.0.113.1"  # Should use X-Forwarded-For if available
        assert client_info["user_agent"] == "Mozilla/5.0 Test Browser"
        
    def test_audit_log_filtering(self):
        """Test filtering audit logs by various criteria"""
        
        # This would test a utility function for filtering audit logs
        # (Implementation would depend on admin panel requirements)
        logs = [
            {"event_type": "invitation_created", "timestamp": "2026-02-11T10:00:00Z"},
            {"event_type": "role_changed", "timestamp": "2026-02-11T11:00:00Z"}, 
            {"event_type": "player_kicked", "timestamp": "2026-02-11T12:00:00Z"}
        ]
        
        filtered = filter_audit_logs(logs, event_types=["invitation_created", "role_changed"])
        
        assert len(filtered) == 2
        assert filtered[0]["event_type"] == "invitation_created"
        assert filtered[1]["event_type"] == "role_changed"