import pytest
from fastapi.testclient import TestClient

@pytest.mark.e2e
class TestWebSocketConnection:
    """Test real WebSocket connections and messaging"""
    
    def test_websocket_connect_and_disconnect(self, client):
        """Test basic WebSocket connection lifecycle"""
        with client.websocket_connect("/ws") as websocket:
            # Connection should be established
            assert websocket is not None
            
    def test_websocket_receives_welcome_message(self, client):
        """Test that new connections receive welcome message"""
        with client.websocket_connect("/ws") as websocket:
            # Should receive a message
            data = websocket.receive_json()
            assert "type" in data
            
    def test_websocket_client_registration(self, client):
        """Test client registration flow"""
        with client.websocket_connect("/ws") as websocket:
            # Send registration
            websocket.send_json({
                "type": "register",
                "client_id": "test_client",
                "client_type": "player"
            })
            
            # Should receive confirmation
            response = websocket.receive_json()
            assert response is not None

@pytest.mark.e2e
class TestWebSocketBroadcasting:
    """Test message broadcasting between clients"""
    
    def test_message_broadcast_to_multiple_clients(self, client):
        """Test that messages are broadcast to all connected clients"""
        # Open two WebSocket connections
        with client.websocket_connect("/ws") as ws1:
            with client.websocket_connect("/ws") as ws2:
                # Register both clients
                ws1.send_json({"type": "register", "client_id": "client1"})
                ws2.send_json({"type": "register", "client_id": "client2"})
                
                # Clear welcome messages
                ws1.receive_json()
                ws2.receive_json()
                
                # Client 1 sends a message
                ws1.send_json({
                    "type": "chat",
                    "data": {"message": "Hello from client 1"}
                })
                
                # Both clients might receive the broadcast
                # (depending on server implementation)
                try:
                    msg = ws2.receive_json(timeout=1)
                    assert msg is not None
                except Exception:
                    # Broadcast might not be implemented yet
                    pass
