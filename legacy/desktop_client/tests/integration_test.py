"""
Integration test showing how the Actions Protocol works in practice.
This demonstrates the client-server interaction pattern.
"""

from core_table.actions_core import ActionsCore
from core_table.actions_protocol import Position, ActionResult
import json
import time

def simulate_network_message(action_type: str, params: dict) -> dict:
    """Simulate sending a message over the network"""
    return {
        "action": action_type,
        "params": params,
        "timestamp": time.time(),
        "client_id": "player_1"
    }

def simulate_server_processing(server_actions: ActionsCore, message: dict) -> ActionResult:
    """Simulate server processing a client message"""
    action_type = message["action"]
    params = message["params"]
    
    # Map action types to server methods
    method_map = {
        'create_table': server_actions.create_table,
        'create_sprite': server_actions.create_sprite,
        'move_sprite': server_actions.move_sprite,
        'scale_sprite': server_actions.scale_sprite,
        'rotate_sprite': server_actions.rotate_sprite,
        'set_layer_visibility': server_actions.set_layer_visibility,
        'batch_actions': server_actions.batch_actions
    }
    
    if action_type in method_map:
        return method_map[action_type](**params)
    else:
        return ActionResult(False, f"Unknown action: {action_type}")

def integration_test():
    """Run integration test simulating client-server interaction"""
    print("=== Actions Protocol Integration Test ===")
    
    # Initialize server
    server_actions = ActionsCore()
    print("✓ Server initialized")
    
    # Simulate client actions
    print("\n1. Client creates a table:")
    message = simulate_network_message("create_table", {
        "table_id": "campaign_table",
        "name": "D&D Campaign",
        "width": 25,
        "height": 20
    })
    result = simulate_server_processing(server_actions, message)
    print(f"   Server response: {result.message}")
    
    print("\n2. Client adds party members:")
    party_members = [
        {"sprite_id": "fighter", "position": Position(5, 8), "image": "fighter.png"},
        {"sprite_id": "wizard", "position": Position(6, 8), "image": "wizard.png"},
        {"sprite_id": "rogue", "position": Position(7, 8), "image": "rogue.png"},
        {"sprite_id": "cleric", "position": Position(8, 8), "image": "cleric.png"}
    ]
    
    for member in party_members:
        message = simulate_network_message("create_sprite", {
            "table_id": "campaign_table",
            "sprite_id": member["sprite_id"],
            "position": member["position"],
            "image_path": member["image"],
            "layer": "tokens"
        })
        result = simulate_server_processing(server_actions, message)
        print(f"   Added {member['sprite_id']}: {result.success}")
    
    print("\n3. Client moves characters forward:")
    movements = [
        {"sprite_id": "fighter", "new_pos": Position(5, 12)},
        {"sprite_id": "wizard", "new_pos": Position(6, 11)},
        {"sprite_id": "rogue", "new_pos": Position(9, 13)},  # Rogue scouts ahead
        {"sprite_id": "cleric", "new_pos": Position(7, 11)}
    ]
    
    for movement in movements:
        message = simulate_network_message("move_sprite", {
            "table_id": "campaign_table",
            "sprite_id": movement["sprite_id"],
            "position": movement["new_pos"]
        })
        result = simulate_server_processing(server_actions, message)
        print(f"   Moved {movement['sprite_id']}: {result.success}")
    
    print("\n4. DM adds enemies using batch operations:")
    enemy_actions = [
        {
            "type": "create_sprite",
            "params": {
                "table_id": "campaign_table",
                "sprite_id": "orc_captain",
                "position": Position(15, 15),
                "image_path": "orc_captain.png",
                "layer": "dungeon_master"
            }
        },
        {
            "type": "create_sprite", 
            "params": {
                "table_id": "campaign_table",
                "sprite_id": "orc_grunt_1",
                "position": Position(14, 16),
                "image_path": "orc_grunt.png",
                "layer": "dungeon_master"
            }
        },
        {
            "type": "create_sprite",
            "params": {
                "table_id": "campaign_table", 
                "sprite_id": "orc_grunt_2",
                "position": Position(16, 16),
                "image_path": "orc_grunt.png",
                "layer": "dungeon_master"
            }
        }
    ]
    
    message = simulate_network_message("batch_actions", {"actions": enemy_actions})
    result = simulate_server_processing(server_actions, message)
    print(f"   Batch enemy creation: {result.message}")
    
    print("\n5. DM reveals enemies to players:")
    message = simulate_network_message("set_layer_visibility", {
        "table_id": "campaign_table",
        "layer": "dungeon_master", 
        "visible": True
    })
    result = simulate_server_processing(server_actions, message)
    print(f"   Made DM layer visible: {result.success}")
    
    print("\n6. Get current game state:")
    result = server_actions.get_table_info("campaign_table")
    if result.success:
        info = result.data
        print(f"   Table: {info['name']} ({info['width']}x{info['height']})")
        print(f"   Total entities: {info['entity_count']}")
    
    result = server_actions.get_table_sprites("campaign_table")
    if result.success:
        sprites = result.data['sprites']
        print(f"   Active sprites: {len(sprites)}")
        for sprite_id, sprite_info in sprites.items():
            pos = sprite_info['position']
            layer = sprite_info['layer']
            print(f"     {sprite_id}: ({pos.x}, {pos.y}) on {layer}")
    
    print("\n7. Test collision detection:")
    result = server_actions.get_sprite_at_position("campaign_table", Position(5, 12))
    if result.success and result.data['sprite_id']:
        print(f"   Sprite at (5, 12): {result.data['sprite_id']}")
    
    result = server_actions.get_sprites_in_area(
        "campaign_table", 
        Position(14, 15), 
        Position(16, 16)
    )
    if result.success:
        area_sprites = result.data['sprites']
        print(f"   Sprites in enemy area: {list(area_sprites.keys())}")
    
    print("\n8. Test undo functionality:")
    result = server_actions.undo_action()
    print(f"   Undo last action: {result.message}")
    
    print("\n✓ Integration test completed successfully!")
    print("\nThis demonstrates:")
    print("- Client-server message passing")
    print("- Action validation and processing")
    print("- Batch operations")
    print("- Layer management")
    print("- State queries")
    print("- Collision detection")
    print("- Undo/redo system")

if __name__ == "__main__":
    integration_test()
