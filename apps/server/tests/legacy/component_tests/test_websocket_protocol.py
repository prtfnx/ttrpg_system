#!/usr/bin/env python3
"""
Test the WebSocket protocol implementation
"""
import sys
import os
import asyncio
import json

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from websocket_protocol import WebSocketServerProtocol
from core_table.game import Game
import core_table.game as game_module
from net.protocol import Message, MessageType

async def test_websocket_protocol():
    """Test WebSocket protocol functionality"""
    print("🧪 Testing WebSocket Protocol...")
    
    # Test initialization
    try:
        game = game_module.create_test_game()
        ws_protocol = WebSocketServerProtocol(game)
        print('✅ WebSocket protocol initialized successfully')
        print(f'   Files found: {len(ws_protocol.files)} resource files')
        print(f'   Table manager: {ws_protocol.table_manager}')
        print(f'   Parent protocol: {ws_protocol.parent_protocol}')
    except Exception as e:
        print(f'❌ WebSocket protocol initialization failed: {e}')
        return
    
    # Test message handling with mock callback
    try:
        sent_messages = []
        
        async def mock_send_callback(client_id: str, message: Message):
            sent_messages.append((client_id, message))
            print(f"📤 Mock send: {client_id} -> {message.type.value}")
        
        # Test table request
        test_client_id = "test_client_123"
        table_request = {
            "type": "new_table_request",
            "data": {"table_name": "test_table"},
            "client_id": test_client_id
        }
        
        print(f"\n🔄 Testing table request...")
        await ws_protocol.handle_client(
            test_client_id, 
            None, 
            json.dumps(table_request), 
            mock_send_callback
        )
        
        if sent_messages:
            print(f"✅ Message handling successful - sent {len(sent_messages)} messages")
            for client_id, message in sent_messages:
                print(f"   📨 {client_id}: {message.type.value}")
        else:
            print("❌ No messages were sent")
            
    except Exception as e:
        print(f'❌ Message handling test failed: {e}')
        import traceback
        traceback.print_exc()
    
    print("\n🎉 WebSocket protocol test completed!")

if __name__ == "__main__":
    asyncio.run(test_websocket_protocol())
