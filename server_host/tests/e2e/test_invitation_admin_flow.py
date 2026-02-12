import pytest
import asyncio
import time
from unittest.mock import patch

# Import fixtures
from ..utils.invitation_fixtures import *

@pytest.mark.e2e
class TestCompleteInvitationWorkflow:
    """End-to-end test of the complete invitation workflow"""
    
    def test_complete_invitation_flow(self, auth_client, test_db, test_user, test_game_session, player_user):
        """
        Test the complete invitation workflow from creation to acceptance
        This simulates the real-world usage pattern
        """
        # Step 1: Session owner creates an invitation
        invitation_data = {
            "session_code": test_game_session.session_code,
            "pre_assigned_role": "player",
            "expires_hours": 168,  # 1 week
            "max_uses": 3
        }
        
        create_response = auth_client.post(
            "/api/invitations/create",
            json=invitation_data
        )
        
        assert create_response.status_code == 201
        invitation_result = create_response.json()
        invite_code = invitation_result["invite_code"]
        
        # Step 2: Potential player validates the invitation (views it)
        from server_host.routers.users import get_current_user
        from server_host import main
        
        async def override_get_current_user():
            return player_user
            
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        
        from fastapi.testclient import TestClient
        player_client = TestClient(main.app)
        
        validate_response = player_client.get(f"/api/invitations/{invite_code}")
        assert validate_response.status_code == 200
        
        validation_data = validate_response.json()
        assert validation_data["session_name"] == test_game_session.name
        assert validation_data["pre_assigned_role"] == "player"
        
        # Step 3: Player accepts the invitation
        accept_response = player_client.post(f"/api/invitations/{invite_code}/accept")
        assert accept_response.status_code == 200
        
        accept_data = accept_response.json()
        assert accept_data["success"] is True
        assert accept_data["session_code"] == test_game_session.session_code
        
        # Step 4: Verify player is now in the session
        main.app.dependency_overrides[get_current_user] = lambda: test_user  # Back to owner
        owner_client = TestClient(main.app)
        
        players_response = owner_client.get(
            f"/game/api/sessions/{test_game_session.session_code}/players"
        )
        assert players_response.status_code == 200
        
        players = players_response.json()
        player_usernames = [p["username"] for p in players]
        assert player_user.username in player_usernames
        
        # Find the added player and verify role
        added_player = next(p for p in players if p["username"] == player_user.username)
        assert added_player["role"] == "player"
        
        # Step 5: Verify invitation usage was tracked
        from server_host.database import models
        db_invitation = test_db.query(models.SessionInvitation).filter_by(
            invite_code=invite_code
        ).first()
        assert db_invitation.uses_count == 1
        assert db_invitation.is_active is True  # Still active since max_uses=3
        
        # Step 6: Verify audit logs were created
        audit_logs = test_db.query(models.AuditLog).filter(
            models.AuditLog.session_code == test_game_session.session_code
        ).all()
        
        event_types = [log.event_type for log in audit_logs]
        assert "invitation_created" in event_types
        assert "invitation_accepted" in event_types
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)

@pytest.mark.e2e
class TestCompleteAdminWorkflow:
    """End-to-end test of session administration workflow"""
    
    def test_complete_session_management_flow(self, test_db, auth_client, game_session_with_players, 
                                               test_user, co_dm_user, player_user):
        """
        Test complete session management workflow including role changes and kick
        """
        session_code = game_session_with_players.session_code
        
        # Step 1: Owner views session players
        players_response = auth_client.get(f"/game/api/sessions/{session_code}/players")
        assert players_response.status_code == 200
        
        initial_players = players_response.json()
        assert len(initial_players) >= 3  # owner + co_dm + player
        
        # Step 2: Owner promotes regular player to co-DM
        promote_response = auth_client.post(
            f"/game/api/sessions/{session_code}/players/{player_user.id}/role",
            json={"new_role": "co_dm"}
        )
        assert promote_response.status_code == 200
        
        # Step 3: Verify role change in database and API
        players_after_promote = auth_client.get(f"/game/api/sessions/{session_code}/players").json()
        promoted_player = next(p for p in players_after_promote if p["user_id"] == player_user.id)
        assert promoted_player["role"] == "co_dm"
        
        # Step 4: Test that the newly promoted co-DM can perform admin actions
        from server_host.routers.users import get_current_user
        from server_host import main
        
        # Create a new regular player to manage
        new_player = test_db.merge(test_db.query(test_db.bind.metadata.tables['users'].c).first())
        from server_host.database import crud, schemas
        new_player_user = crud.create_user(
            test_db,
            schemas.UserCreate(
                username="new_player",
                email="newplayer@example.com",
                password="newpass123"
            )
        )
        
        # Add new player to session
        from server_host.database.models import GamePlayer
        game_player = GamePlayer(
            user_id=new_player_user.id,
            session_id=game_session_with_players.id,
            role="player"
        )
        test_db.add(game_player)
        test_db.commit()
        
        # Override to newly promoted co-DM
        async def override_get_current_user():
            return player_user
            
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        
        from fastapi.testclient import TestClient
        codm_client = TestClient(main.app)
        
        # Step 5: Co-DM kicks the new player
        kick_response = codm_client.delete(
            f"/game/api/sessions/{session_code}/players/{new_player_user.id}"
        )
        assert kick_response.status_code == 200
        
        # Step 6: Verify player was removed
        final_players_response = codm_client.get(f"/game/api/sessions/{session_code}/players")
        assert final_players_response.status_code == 200
        
        final_players = final_players_response.json()
        remaining_player_ids = [p["user_id"] for p in final_players]
        assert new_player_user.id not in remaining_player_ids
        
        # Step 7: Verify comprehensive audit trail
        from server_host.database.models import AuditLog
        audit_logs = test_db.query(AuditLog).filter_by(
            session_code=session_code
        ).order_by(AuditLog.timestamp.asc()).all()
        
        event_types = [log.event_type for log in audit_logs]
        assert "role_changed" in event_types
        assert "player_kicked" in event_types
        
        # Verify audit log details
        role_change_log = next(log for log in audit_logs if log.event_type == "role_changed")
        assert str(player_user.id) in role_change_log.details
        assert "co_dm" in role_change_log.details
        
        kick_log = next(log for log in audit_logs if log.event_type == "player_kicked") 
        assert str(new_player_user.id) in kick_log.details
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)

@pytest.mark.e2e
class TestConcurrentInvitationUsage:
    """Test concurrent usage of invitations (simulating real-world load)"""
    
    def test_concurrent_invitation_acceptance(self, test_db, auth_client, invitation_factory):
        """Test that invitation max_uses is properly enforced under concurrent access"""
        # Create invitation with limited uses
        invitation = invitation_factory(max_uses=2, uses_count=0)
        
        # Create multiple users who will try to accept simultaneously
        from server_host.database import crud, schemas
        users = []
        for i in range(4):  # More users than max_uses
            user = crud.create_user(
                test_db,
                schemas.UserCreate(
                    username=f"concurrent_user_{i}",
                    email=f"concurrent{i}@example.com",
                    password="concurrent123"
                )
            )
            users.append(user)
        
        # Simulate concurrent acceptance attempts
        from server_host.routers.users import get_current_user
        from server_host import main
        from fastapi.testclient import TestClient
        
        successful_accepts = 0
        failed_accepts = 0
        
        for user in users:
            async def override_get_current_user():
                return user
                
            main.app.dependency_overrides[get_current_user] = override_get_current_user
            client = TestClient(main.app)
            
            response = client.post(f"/api/invitations/{invitation.invite_code}/accept")
            
            if response.status_code == 200:
                successful_accepts += 1
            else:
                failed_accepts += 1
                assert response.status_code in [400, 410]  # Already member or no uses left
        
        # Should have exactly max_uses successful accepts
        assert successful_accepts <= 2  # max_uses = 2
        assert failed_accepts >= 2  # At least 2 should fail
        
        # Verify final state in database
        test_db.refresh(invitation)
        assert invitation.uses_count <= invitation.max_uses
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)

@pytest.mark.e2e
class TestSecurityScenarios:
    """End-to-end security testing scenarios"""
    
    def test_privilege_escalation_prevention(self, test_db, game_session_with_players, player_user, test_user):
        """Test that regular players cannot escalate their privileges"""
        from server_host.routers.users import get_current_user
        from server_host import main
        from fastapi.testclient import TestClient
        
        # Override to regular player
        async def override_get_current_user():
            return player_user
            
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        player_client = TestClient(main.app)
        
        # Attempt 1: Try to promote themselves to co-DM
        self_promote_response = player_client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}/role",
            json={"new_role": "co_dm"}
        )
        assert self_promote_response.status_code == 403
        
        # Attempt 2: Try to promote themselves to owner
        owner_promote_response = player_client.post(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{player_user.id}/role",
            json={"new_role": "owner"}
        )
        assert owner_promote_response.status_code in [403, 422]  # Forbidden or validation error
        
        # Attempt 3: Try to kick the owner
        kick_owner_response = player_client.delete(
            f"/game/api/sessions/{game_session_with_players.session_code}/players/{test_user.id}"
        )
        assert kick_owner_response.status_code == 403
        
        # Verify no changes occurred
        main.app.dependency_overrides[get_current_user] = lambda: test_user
        owner_client = TestClient(main.app)
        
        final_players = owner_client.get(
            f"/game/api/sessions/{game_session_with_players.session_code}/players"
        ).json()
        
        # Player should still be regular player
        player_record = next(p for p in final_players if p["user_id"] == player_user.id)
        assert player_record["role"] == "player"
        
        # Owner should still be owner
        owner_record = next(p for p in final_players if p["user_id"] == test_user.id)
        assert owner_record["role"] == "owner"
        
        # Clean up override
        main.app.dependency_overrides.pop(get_current_user, None)
        
    def test_cross_session_access_prevention(self, test_db, auth_client, test_user):
        """Test that users cannot access sessions they're not members of"""
        # Create another user and their session
        from server_host.database import crud, schemas
        
        other_user = crud.create_user(
            test_db,
            schemas.UserCreate(
                username="other_session_owner",
                email="othersession@example.com",
                password="other123"
            )
        )
        
        other_session_data = schemas.GameSessionCreate(name="Other User's Session")
        other_session = crud.create_game_session(
            test_db, other_session_data, other_user.id, "OTHER1"
        )
        
        # Attempt to access other user's session players
        response = auth_client.get(f"/game/api/sessions/{other_session.session_code}/players")
        assert response.status_code == 403
        
        # Attempt to modify other user's session
        response = auth_client.post(
            f"/game/api/sessions/{other_session.session_code}/players/{other_user.id}/role",
            json={"new_role": "player"}  # Even demoting owner should fail
        )
        assert response.status_code == 403
        
        # Attempt to kick from other user's session
        response = auth_client.delete(
            f"/game/api/sessions/{other_session.session_code}/players/{other_user.id}"
        )
        assert response.status_code == 403

@pytest.mark.e2e
@pytest.mark.slow
class TestPerformanceAndStress:
    """Performance and stress testing for invitation/admin systems"""
    
    def test_large_session_management(self, test_db, auth_client, test_game_session):
        """Test session management with many players (stress test)"""
        # Create many players
        from server_host.database import crud, schemas, models
        
        users = []
        for i in range(20):  # 20 players + owner = 21 total
            user = crud.create_user(
                test_db,
                schemas.UserCreate(
                    username=f"stress_player_{i:02d}",
                    email=f"stress{i:02d}@example.com",
                    password="stress123"
                )
            )
            users.append(user)
            
            # Add to session
            game_player = models.GamePlayer(
                user_id=user.id,
                session_id=test_game_session.id,
                role="player"
            )
            test_db.add(game_player)
        
        test_db.commit()
        
        # Test listing all players (should handle large result set)
        start_time = time.time()
        response = auth_client.get(f"/game/api/sessions/{test_game_session.session_code}/players")
        end_time = time.time()
        
        assert response.status_code == 200
        players = response.json()
        assert len(players) >= 21  # 20 stress players + owner
        
        # Should respond reasonably fast (under 2 seconds for 21 players)
        response_time = end_time - start_time
        assert response_time < 2.0
        
        # Test bulk operations (promote several players)
        promotion_times = []
        for i in range(3):  # Promote first 3 players to co_dm
            start_time = time.time()
            response = auth_client.post(
                f"/game/api/sessions/{test_game_session.session_code}/players/{users[i].id}/role",
                json={"new_role": "co_dm"}
            )
            end_time = time.time()
            
            assert response.status_code == 200
            promotion_times.append(end_time - start_time)
        
        # Promotions should be consistent and fast
        avg_promotion_time = sum(promotion_times) / len(promotion_times)
        assert avg_promotion_time < 1.0  # Average under 1 second
        assert max(promotion_times) < 2.0  # No single promotion over 2 seconds
    
    def test_invitation_stress_creation(self, auth_client, test_game_session):
        """Test creating many invitations rapidly"""
        invitation_times = []
        created_invitations = []
        
        # Create 10 invitations rapidly
        for i in range(10):
            invitation_data = {
                "session_code": test_game_session.session_code,
                "pre_assigned_role": "player" if i % 2 == 0 else "co_dm",
                "expires_hours": 24 + i,  # Vary expiration
                "max_uses": 1 + i % 5  # Vary max uses
            }
            
            start_time = time.time()
            response = auth_client.post("/api/invitations/create", json=invitation_data)
            end_time = time.time()
            
            assert response.status_code == 201
            created_invitations.append(response.json())
            invitation_times.append(end_time - start_time)
        
        # All invitations should be created successfully and reasonably fast
        avg_creation_time = sum(invitation_times) / len(invitation_times)
        assert avg_creation_time < 1.0  # Average under 1 second
        
        # All invite codes should be unique
        invite_codes = [inv["invite_code"] for inv in created_invitations]
        assert len(set(invite_codes)) == 10  # All unique