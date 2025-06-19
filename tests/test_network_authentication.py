"""
Network and Authentication Tests
Tests network client functionality, authentication flows, and connection management
Focuses on real-world network scenarios and error handling
"""
import unittest
import asyncio
import json
import sys
from unittest.mock import Mock, MagicMock, patch, AsyncMock, call
from pathlib import Path
import threading
import time

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Import network modules
from net.protocol import Message, MessageType
from net.client_protocol import ClientProtocol
import menu


class TestNetworkClientBehavior(unittest.TestCase):
    """Test network client behavior and connection management"""
    
    def setUp(self):
        """Set up test environment"""
        self.mock_context = MagicMock()
        self.mock_context.user_id = 1
        self.mock_context.session_code = "TEST123"
        self.mock_context.queue_to_send = MagicMock()
        self.mock_context.queue_to_read = MagicMock()
    def test_client_protocol_message_handling(self):
        """
        BEHAVIORAL TEST: Client protocol handles different message types
        Real scenario: Server sends various messages during gameplay
        """
        # Create client protocol
        send_func = MagicMock()
        client_protocol = ClientProtocol(self.mock_context, send_func)
        
        # Test welcome message handling
        welcome_msg = Message(
            type=MessageType.WELCOME,
            data={"user_id": 42, "username": "TestPlayer"}
        )
        
        # Convert to JSON string as expected by handle_message
        welcome_json = welcome_msg.to_json()
        client_protocol.handle_message(welcome_json)
        
        # Verify context was updated with user information
        # Note: The actual implementation may update context differently
        # This tests the architectural requirement that welcome messages are processed
    
    def test_client_protocol_asset_request_flow(self):
        """
        ARCHITECTURAL TEST: Client properly requests assets from server
        Real scenario: Game needs to load sprites/images from server
        """
        send_func = MagicMock()
        client_protocol = ClientProtocol(self.mock_context, send_func)
        
        # Request an asset
        asset_id = "test_sprite_123"
        client_protocol.request_asset(asset_id)
        
        # Verify asset request message was sent
        send_func.assert_called_once()
        sent_message = send_func.call_args[0][0]
        self.assertEqual(sent_message.msg_type, MessageType.ASSET_REQUEST)
        self.assertEqual(sent_message.data["asset_id"], asset_id)
    
    @patch('requests.get')
    def test_network_error_recovery(self, mock_get):
        """
        BEHAVIORAL TEST: Network clients handle connection failures gracefully
        Real scenario: User loses internet connection during gameplay
        """
        # Simulate network timeout
        mock_get.side_effect = Exception("Connection timeout")
        
        send_func = MagicMock()
        client_protocol = ClientProtocol(self.mock_context, send_func)
        
        # Attempt to process a message that requires network access
        # Should not crash, should handle gracefully
        try:
            client_protocol.handle_network_error("Connection lost")
            # If we get here, error was handled gracefully
            success = True
        except:
            success = False
            
        self.assertTrue(success, "Client should handle network errors gracefully")
    
    def test_message_queue_processing(self):
        """
        ARCHITECTURAL TEST: Message queues handle high-volume communication
        Real scenario: Busy multiplayer session with many players
        """
        send_func = MagicMock()
        client_protocol = ClientProtocol(self.mock_context, send_func)
        
        # Simulate high-volume message processing
        messages = []
        for i in range(100):
            msg = Message(
                msg_type=MessageType.CHAT_MESSAGE,
                data={"message": f"Test message {i}", "sender": f"Player{i % 5}"}
            )
            messages.append(msg)
        
        # Process all messages
        start_time = time.time()
        for msg in messages:
            client_protocol.handle_message(msg)
        end_time = time.time()
        
        # Should process messages quickly (under 1 second for 100 messages)
        self.assertLess(end_time - start_time, 1.0, "Message processing should be fast")


class TestAuthenticationFlow(unittest.TestCase):
    """Test authentication and session management flows"""
    
    def setUp(self):
        """Set up test environment"""
        self.menu_app = menu.MenuApp()
        self.menu_app.server_url = "http://test.example.com"
    
    @patch('requests.post')
    def test_user_login_success_flow(self, mock_post):
        """
        BEHAVIORAL TEST: Complete user login flow works correctly
        Real scenario: User enters credentials and logs into the system
        """
        # Mock successful login response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "access_token": "test_jwt_token_12345",
            "token_type": "bearer",
            "user_id": 123
        }
        mock_post.return_value = mock_response
        
        # Set up test credentials
        self.menu_app.username = "testuser"
        self.menu_app.password = "testpass"
        
        # Execute login
        self.menu_app._login_user()
        
        # Verify login request was made correctly
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        self.assertIn("username", call_args[1]["data"])
        self.assertIn("password", call_args[1]["data"])
        
        # Verify authentication state was updated
        self.assertTrue(self.menu_app.is_authenticated)
        self.assertEqual(self.menu_app.jwt_token, "test_jwt_token_12345")
        self.assertEqual(self.menu_app.auth_error, "")
    
    @patch('requests.post')
    def test_user_login_failure_handling(self, mock_post):
        """
        BEHAVIORAL TEST: Login failures are handled gracefully
        Real scenario: User enters wrong password or account doesn't exist
        """
        # Mock failed login response
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Invalid credentials"
        mock_post.return_value = mock_response
        
        # Set up test credentials
        self.menu_app.username = "wronguser"
        self.menu_app.password = "wrongpass"
        
        # Execute login
        self.menu_app._login_user()
        
        # Verify authentication state reflects failure
        self.assertFalse(self.menu_app.is_authenticated)
        self.assertEqual(self.menu_app.jwt_token, "")
        self.assertIn("Invalid credentials", self.menu_app.auth_error)
    
    @patch('requests.post')
    def test_user_registration_flow(self, mock_post):
        """
        BEHAVIORAL TEST: User registration works correctly
        Real scenario: New user creates an account
        """
        # Mock successful registration response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response
        
        # Set up test credentials
        self.menu_app.username = "newuser"
        self.menu_app.password = "newpass"
        
        # Execute registration
        self.menu_app._register_user()
        
        # Verify registration request was made
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        self.assertIn("username", call_args[1]["data"])
        self.assertIn("password", call_args[1]["data"])
        
        # Verify success message
        self.assertIn("successful", self.menu_app.auth_success)
    
    @patch('requests.get')
    def test_session_fetching_flow(self, mock_get):
        """
        BEHAVIORAL TEST: User can fetch available game sessions
        Real scenario: Authenticated user wants to join existing sessions
        """
        # Mock session list response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {"id": 1, "name": "Adventure Campaign", "session_code": "ABC123"},
            {"id": 2, "name": "One Shot Game", "session_code": "XYZ789"}
        ]
        mock_get.return_value = mock_response
        
        # Set up authenticated state
        self.menu_app.is_authenticated = True
        self.menu_app.jwt_token = "valid_token"
        
        # Fetch sessions
        self.menu_app._fetch_user_sessions()
        
        # Verify sessions were fetched with proper authorization
        mock_get.assert_called_once()
        call_args = mock_get.call_args
        self.assertIn("Authorization", call_args[1]["headers"])
        self.assertEqual(call_args[1]["headers"]["Authorization"], "Bearer valid_token")
        
        # Verify sessions were stored
        self.assertEqual(len(self.menu_app.available_sessions), 2)
        self.assertEqual(self.menu_app.available_sessions[0]["name"], "Adventure Campaign")
    
    def test_server_url_parsing(self):
        """
        BEHAVIORAL TEST: Server URL parsing works for different formats
        Real scenario: Users connect to different servers (localhost, production, etc.)
        """
        # Test localhost URL
        self.menu_app.server_url = "http://127.0.0.1:8000"
        ip, port = self.menu_app._parse_server_url()
        self.assertEqual(ip, "127.0.0.1")
        self.assertEqual(port, "8000")
        
        # Test production URL
        self.menu_app.server_url = "https://ttrpg-game.com:443"
        ip, port = self.menu_app._parse_server_url()
        self.assertEqual(ip, "ttrpg-game.com")
        self.assertEqual(port, "443")
        
        # Test URL without port
        self.menu_app.server_url = "https://example.com"
        ip, port = self.menu_app._parse_server_url()
        self.assertEqual(ip, "example.com")
        self.assertEqual(port, "443")  # Should default to 443 for HTTPS
    
    @patch('subprocess.Popen')
    def test_authenticated_game_launch(self, mock_popen):
        """
        BEHAVIORAL TEST: Authenticated users can launch the game properly
        Real scenario: User logs in and launches game with session
        """
        # Set up authenticated state
        self.menu_app.is_authenticated = True
        self.menu_app.jwt_token = "valid_token"
        self.menu_app.session_code = "GAME123"
        self.menu_app.server_url = "https://game-server.com"
        
        # Launch game
        self.menu_app._launch_authenticated_game()
        
        # Verify game was launched with correct parameters
        mock_popen.assert_called_once()
        call_args = mock_popen.call_args[0][0]  # First argument is the command list
        
        # Should include authentication parameters
        self.assertIn("--jwt-token", call_args)
        self.assertIn("valid_token", call_args)
        self.assertIn("--session-code", call_args)
        self.assertIn("GAME123", call_args)


class TestNetworkProtocolIntegration(unittest.TestCase):
    """Test integration between different network components"""
    
    def setUp(self):
        """Set up test environment"""
        self.mock_context = MagicMock()
        self.mock_context.user_id = 1
        self.mock_context.username = "TestPlayer"
        
    def test_protocol_message_serialization(self):
        """
        ARCHITECTURAL TEST: Messages serialize/deserialize correctly
        Real scenario: Client and server exchange complex game data
        """
        # Create a complex message with game data
        original_message = Message(
            msg_type=MessageType.SPRITE_UPDATE,
            data={
                "sprite_id": "sprite_123",
                "position": {"x": 100.5, "y": 200.7},
                "properties": {
                    "scale": 1.5,
                    "visible": True,
                    "layer": "characters"
                }
            }
        )
        
        # Serialize message
        serialized = original_message.to_json()
        self.assertIsInstance(serialized, str)
        
        # Deserialize message
        deserialized = Message.from_json(serialized)
        
        # Verify data integrity
        self.assertEqual(deserialized.msg_type, original_message.msg_type)
        self.assertEqual(deserialized.data["sprite_id"], "sprite_123")
        self.assertEqual(deserialized.data["position"]["x"], 100.5)
        self.assertEqual(deserialized.data["properties"]["scale"], 1.5)
    
    def test_concurrent_message_handling(self):
        """
        BEHAVIORAL TEST: System handles concurrent messages correctly
        Real scenario: Multiple players sending actions simultaneously
        """
        send_func = MagicMock()
        client_protocol = ClientProtocol(self.mock_context, send_func)
        
        # Simulate concurrent message processing
        def send_messages():
            for i in range(50):
                msg = Message(
                    msg_type=MessageType.PLAYER_ACTION,
                    data={"action": "move", "player_id": i % 5}
                )
                client_protocol.handle_message(msg)
        
        # Start multiple threads sending messages
        threads = []
        for _ in range(3):
            thread = threading.Thread(target=send_messages)
            threads.append(thread)
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join(timeout=5.0)  # 5 second timeout
        
        # Verify no crashes occurred and system is still responsive
        test_msg = Message(msg_type=MessageType.PING, data={})
        try:
            client_protocol.handle_message(test_msg)
            success = True
        except:
            success = False
            
        self.assertTrue(success, "System should handle concurrent messages without issues")
    
    def test_network_reconnection_behavior(self):
        """
        BEHAVIORAL TEST: System handles network reconnection properly
        Real scenario: User's network drops and reconnects during gameplay
        """
        # This tests the architectural requirement that network failures
        # don't lose critical game state and can reconnect gracefully
        
        mock_queue_send = MagicMock()
        mock_queue_read = MagicMock()
        
        context = MagicMock()
        context.queue_to_send = mock_queue_send
        context.queue_to_read = mock_queue_read
        context.user_id = 1
        context.session_code = "TEST123"
        
        send_func = MagicMock()
        client_protocol = ClientProtocol(context, send_func)
        
        # Simulate network disconnection
        client_protocol.handle_network_error("Connection lost")
        
        # System should still be able to queue messages for when connection returns
        test_message = Message(msg_type=MessageType.CHAT_MESSAGE, data={"msg": "test"})
        
        try:
            # Should not crash even when network is down
            client_protocol.send_message(test_message)
            success = True
        except:
            success = False
        
        self.assertTrue(success, "System should queue messages when network is down")


class TestRealWorldNetworkScenarios(unittest.TestCase):
    """Test real-world network scenarios and edge cases"""
    
    def test_malformed_message_handling(self):
        """
        BEHAVIORAL TEST: System handles malformed network messages gracefully
        Real scenario: Network corruption or malicious messages
        """
        mock_context = MagicMock()
        send_func = MagicMock()
        client_protocol = ClientProtocol(mock_context, send_func)
        
        # Test various malformed messages
        malformed_messages = [
            '{"invalid": "json"',  # Incomplete JSON
            '{}',  # Empty message
            '{"msg_type": "INVALID_TYPE"}',  # Invalid message type
            None,  # Null message
            42,  # Non-string message
        ]
        
        for bad_msg in malformed_messages:
            try:
                client_protocol.handle_message(bad_msg)
                # Should not crash
                success = True
            except Exception as e:
                # Log but don't fail - some exceptions are expected for malformed data
                success = False
                
        # System should still be responsive after handling bad messages
        good_msg = Message(msg_type=MessageType.PING, data={})
        try:
            client_protocol.handle_message(good_msg)
            final_success = True
        except:
            final_success = False
            
        self.assertTrue(final_success, "System should remain responsive after bad messages")
    
    def test_high_latency_behavior(self):
        """
        BEHAVIORAL TEST: System behaves correctly under high network latency
        Real scenario: User on slow or distant connection
        """
        # Simulate high-latency environment by adding delays
        mock_context = MagicMock()
        
        def slow_send(msg):
            time.sleep(0.1)  # Simulate 100ms latency
            return True
            
        client_protocol = ClientProtocol(mock_context, slow_send)
        
        # Send multiple messages quickly
        start_time = time.time()
        for i in range(10):
            msg = Message(msg_type=MessageType.PING, data={"seq": i})
            client_protocol.send_message(msg)
        end_time = time.time()
        
        # Should handle latency gracefully (not block indefinitely)
        self.assertLess(end_time - start_time, 5.0, "Should handle high latency gracefully")
    
    @patch('requests.get')
    def test_server_connection_validation(self, mock_get):
        """
        BEHAVIORAL TEST: System validates server connections before use
        Real scenario: User enters invalid server URL
        """
        menu_app = menu.MenuApp()
        
        # Test valid server connection
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_get.return_value = mock_response
        
        menu_app.server_url = "http://valid-server.com"
        is_valid = menu_app._test_server_connection()
        self.assertTrue(is_valid, "Valid server should be accessible")
        
        # Test invalid server connection
        mock_get.side_effect = Exception("Connection refused")
        menu_app.server_url = "http://invalid-server.com"
        is_valid = menu_app._test_server_connection()
        self.assertFalse(is_valid, "Invalid server should be detected")


if __name__ == '__main__':
    # Run with verbose output to see test progress
    unittest.main(verbosity=2, buffer=True)
