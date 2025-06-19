"""
Protocol Message Test
Tests basic protocol message functionality and core table operations
"""
import unittest
import logging
import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from net.protocol import Message, MessageType
from core_table.server import TableManager


class TestProtocolBasics(unittest.TestCase):
    """Test basic protocol and table functionality"""
    
    def setUp(self):
        """Set up test environment"""
        logging.basicConfig(level=logging.WARNING)
        self.table_manager = TableManager()

    def test_message_creation_and_serialization(self):
        """Test creating and serializing protocol messages"""
        
        # Test basic message creation
        message = Message(
            type=MessageType.PING,
            data={"test": "data"}
        )
        
        self.assertEqual(message.type, MessageType.PING, "Message type should be set")
        self.assertIsNotNone(message.data, "Message should have data")
        if message.data:
            self.assertEqual(message.data["test"], "data", "Message data should be accessible")
        
        # Test serialization
        json_str = message.to_json()
        self.assertIsInstance(json_str, str, "Should serialize to string")
        self.assertIn("ping", json_str, "Serialized message should contain message type")
        
        # Test deserialization
        parsed_message = Message.from_json(json_str)
        self.assertEqual(parsed_message.type, message.type, "Parsed message should match original")
        if parsed_message.data:
            self.assertEqual(parsed_message.data["test"], "data", "Parsed data should match original")

    def test_table_creation_workflow(self):
        """Test table creation and management"""
        
        # Test table creation
        table = self.table_manager.create_table("test_table", 30, 20)
        self.assertIsNotNone(table, "Table should be created")
        self.assertEqual(table.name, "test_table", "Table name should be set")
        self.assertEqual(table.width, 30, "Table width should be set")
        self.assertEqual(table.height, 20, "Table height should be set")
        
        # Test table retrieval
        retrieved_table = self.table_manager.get_table("test_table")
        self.assertIsNotNone(retrieved_table, "Should be able to retrieve table")
        self.assertEqual(retrieved_table.name, "test_table", "Retrieved table should match")

    def test_entity_management_workflow(self):
        """Test entity creation and management within tables"""
        
        # Create table
        table = self.table_manager.create_table("entity_test", 25, 15)
        
        # Add entities
        hero = table.add_entity("Hero", (5, 5), layer='tokens')
        orc = table.add_entity("Orc", (10, 10), layer='tokens')
        
        self.assertIsNotNone(hero, "Hero entity should be created")
        self.assertIsNotNone(orc, "Orc entity should be created")
        
        # Verify entities exist in table
        self.assertGreaterEqual(len(table.entities), 2, "Table should have at least 2 entities")
        
        # Test entity properties
        if hero:
            self.assertEqual(hero.name, "Hero", "Hero name should be correct")
            self.assertEqual(hero.position, (5, 5), "Hero position should be correct")
            self.assertEqual(hero.layer, 'tokens', "Hero layer should be correct")

    def test_asset_protocol_messages(self):
        """Test asset-related protocol messages"""
        
        # Test asset upload request message
        upload_message = Message(
            type=MessageType.ASSET_UPLOAD_REQUEST,
            data={
                "filename": "test_sprite.png",
                "file_size": 1024,
                "content_type": "image/png"
            }
        )
        
        self.assertEqual(upload_message.type, MessageType.ASSET_UPLOAD_REQUEST, 
                        "Upload message type should be correct")
        if upload_message.data:
            self.assertIn("filename", upload_message.data, "Should include filename")
            self.assertIn("file_size", upload_message.data, "Should include file size")
        
        # Test asset download request message
        download_message = Message(
            type=MessageType.ASSET_DOWNLOAD_REQUEST,
            data={
                "asset_id": "asset_123456"
            }
        )
        
        self.assertEqual(download_message.type, MessageType.ASSET_DOWNLOAD_REQUEST,
                        "Download message type should be correct")
        if download_message.data:
            self.assertEqual(download_message.data["asset_id"], "asset_123456",
                            "Asset ID should be correct")

    def test_sprite_protocol_messages(self):
        """Test sprite-related protocol messages"""
        
        # Test sprite creation message
        sprite_create = Message(
            type=MessageType.SPRITE_CREATE,
            data={
                "table_id": "test_table",
                "sprite_id": "hero_001",
                "position": [10, 15],
                "layer": "tokens",
                "texture_path": "hero.png"
            }
        )
        
        self.assertEqual(sprite_create.type, MessageType.SPRITE_CREATE,
                        "Sprite create message type should be correct")
        if sprite_create.data:
            self.assertIn("sprite_id", sprite_create.data, "Should include sprite ID")
            self.assertIn("position", sprite_create.data, "Should include position")
        
        # Test sprite movement message
        sprite_move = Message(
            type=MessageType.SPRITE_MOVE,
            data={
                "table_id": "test_table",
                "sprite_id": "hero_001",
                "position": [20, 25]
            }
        )
        
        self.assertEqual(sprite_move.type, MessageType.SPRITE_MOVE,
                        "Sprite move message type should be correct")
        if sprite_move.data:
            self.assertEqual(sprite_move.data["position"], [20, 25],
                            "New position should be correct")

    def test_table_protocol_messages(self):
        """Test table-related protocol messages"""
        
        # Test new table request
        new_table_request = Message(
            type=MessageType.NEW_TABLE_REQUEST,
            data={
                "name": "Adventure Table",
                "width": 50,
                "height": 40
            }
        )
        
        self.assertEqual(new_table_request.type, MessageType.NEW_TABLE_REQUEST,
                        "New table request type should be correct")
        if new_table_request.data:
            self.assertEqual(new_table_request.data["name"], "Adventure Table",
                            "Table name should be correct")
        
        # Test table data message
        table_data = Message(
            type=MessageType.TABLE_DATA,
            data={
                "table_id": "adventure_table",
                "entities": [],
                "metadata": {"theme": "dungeon"}
            }
        )
        
        self.assertEqual(table_data.type, MessageType.TABLE_DATA,
                        "Table data message type should be correct")
        if table_data.data:
            self.assertIn("entities", table_data.data, "Should include entities")
            self.assertIn("metadata", table_data.data, "Should include metadata")

    def test_message_priority_and_versioning(self):
        """Test message priority and versioning features"""
        
        # Test high priority message
        critical_message = Message(
            type=MessageType.ERROR,
            data={"error": "Critical system failure"},
            priority=0  # Critical priority
        )
        
        self.assertEqual(critical_message.priority, 0, "Critical message should have priority 0")
        
        # Test normal priority message
        normal_message = Message(
            type=MessageType.PING,
            data={"status": "ok"}
        )
        
        self.assertEqual(normal_message.priority, 5, "Normal message should have default priority 5")
        
        # Test versioning
        versioned_message = Message(
            type=MessageType.TABLE_DATA,
            data={"table": "data"},
            version="1.0"
        )
        
        self.assertEqual(versioned_message.version, "1.0", "Version should be set correctly")

    def test_message_timestamps(self):
        """Test message timestamp functionality"""
        
        import time
        
        # Create message
        start_time = time.time()
        message = Message(MessageType.PING, {"test": "data"})
        end_time = time.time()
        
        # Verify timestamp is set and reasonable
        self.assertIsNotNone(message.timestamp, "Message should have timestamp")
        if message.timestamp:
            self.assertGreaterEqual(message.timestamp, start_time, "Timestamp should be after start time")
            self.assertLessEqual(message.timestamp, end_time, "Timestamp should be before end time")
        
        # Test custom timestamp
        custom_time = 1234567890.0
        custom_message = Message(
            MessageType.PONG, 
            {"data": "test"}, 
            timestamp=custom_time
        )
        
        self.assertEqual(custom_message.timestamp, custom_time, 
                        "Custom timestamp should be preserved")


if __name__ == '__main__':
    unittest.main(verbosity=2)
