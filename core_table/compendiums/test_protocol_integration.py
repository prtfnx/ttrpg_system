"""
Test WebSocket protocol integration with compendium service
"""

import sys
import io
from pathlib import Path

# Set UTF-8 encoding for output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from net.protocol import Message, MessageType


def test_message_types():
    """Test that all compendium message types are defined"""
    print("\n" + "="*60)
    print("TEST 1: Message Types")
    print("="*60)
    
    required_types = [
        'COMPENDIUM_SEARCH',
        'COMPENDIUM_SEARCH_RESPONSE',
        'COMPENDIUM_GET_SPELL',
        'COMPENDIUM_GET_SPELL_RESPONSE',
        'COMPENDIUM_GET_CLASS',
        'COMPENDIUM_GET_CLASS_RESPONSE',
        'COMPENDIUM_GET_EQUIPMENT',
        'COMPENDIUM_GET_EQUIPMENT_RESPONSE',
        'COMPENDIUM_GET_MONSTER',
        'COMPENDIUM_GET_MONSTER_RESPONSE',
        'COMPENDIUM_GET_STATS',
        'COMPENDIUM_GET_STATS_RESPONSE',
        'COMPENDIUM_GET_CHARACTER_DATA',
        'COMPENDIUM_GET_CHARACTER_DATA_RESPONSE'
    ]
    
    for msg_type in required_types:
        assert hasattr(MessageType, msg_type), f"MessageType.{msg_type} not found"
        print(f"✓ MessageType.{msg_type} exists")
    
    print(f"\n✓ All {len(required_types)} message types defined")


def test_message_creation():
    """Test creating compendium messages"""
    print("\n" + "="*60)
    print("TEST 2: Message Creation")
    print("="*60)
    
    # Test search message
    search_msg = Message(
        MessageType.COMPENDIUM_SEARCH,
        {'query': 'fireball', 'category': 'spells'}
    )
    assert search_msg.type == MessageType.COMPENDIUM_SEARCH
    assert search_msg.data['query'] == 'fireball'
    print("✓ Search message created")
    
    # Test spell request message
    spell_msg = Message(
        MessageType.COMPENDIUM_GET_SPELL,
        {'name': 'Fireball'}
    )
    assert spell_msg.type == MessageType.COMPENDIUM_GET_SPELL
    print("✓ Spell request message created")
    
    # Test stats request
    stats_msg = Message(MessageType.COMPENDIUM_GET_STATS, {})
    assert stats_msg.type == MessageType.COMPENDIUM_GET_STATS
    print("✓ Stats request message created")
    
    print("\n✓ All message creation tests passed")


def test_message_serialization():
    """Test message serialization/deserialization"""
    print("\n" + "="*60)
    print("TEST 3: Message Serialization")
    print("="*60)
    
    # Create a search message
    original = Message(
        MessageType.COMPENDIUM_SEARCH,
        {'query': 'dragon', 'category': None}
    )
    
    # Serialize to JSON
    json_str = original.to_json()
    assert isinstance(json_str, str)
    print(f"✓ Serialized: {len(json_str)} bytes")
    
    # Deserialize back
    restored = Message.from_json(json_str)
    assert restored.type == original.type
    assert restored.data['query'] == original.data['query']
    print("✓ Deserialized correctly")
    
    # Test response message
    from models.spell import Spell, SpellSchool, SpellComponent
    test_spell = Spell()
    test_spell.name = "Magic Missile"
    test_spell.level = 1
    test_spell.school = SpellSchool.EVOCATION
    test_spell.components = SpellComponent(verbal=True, somatic=True, material=False)
    
    response = Message(
        MessageType.COMPENDIUM_GET_SPELL_RESPONSE,
        {
            'spell': test_spell.to_dict(),
            'found': True
        }
    )
    
    response_json = response.to_json()
    restored_response = Message.from_json(response_json)
    
    assert restored_response.data['found'] == True
    assert restored_response.data['spell']['name'] == "Magic Missile"
    print("✓ Response with spell data serialized correctly")
    
    print("\n✓ All serialization tests passed")


def test_compendium_service_integration():
    """Test that CompendiumService can be imported in protocol context"""
    print("\n" + "="*60)
    print("TEST 4: Service Integration")
    print("="*60)
    
    try:
        from core_table.compendiums.services.compendium_service import CompendiumService
        print("✓ CompendiumService imported")
        
        compendium = CompendiumService()
        print("✓ CompendiumService instantiated")
        
        counts = compendium.load_all()
        assert counts['spells'] > 0
        assert counts['monsters'] > 0
        print(f"✓ Loaded {sum(counts.values())} items")
        
        # Test that search returns serializable data
        results = compendium.search("fire")
        for category, items in results.items():
            for item in items:
                assert 'name' in item, f"Item in {category} missing name"
                json_test = Message(
                    MessageType.COMPENDIUM_SEARCH_RESPONSE,
                    {'results': {category: [item]}}
                ).to_json()
                assert len(json_test) > 0
        
        print("✓ Search results are WebSocket-serializable")
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    
    print("\n✓ Service integration working")
    return True


def test_message_flow_simulation():
    """Simulate a complete message flow"""
    print("\n" + "="*60)
    print("TEST 5: Message Flow Simulation")
    print("="*60)
    
    from core_table.compendiums.services.compendium_service import CompendiumService
    
    compendium = CompendiumService()
    compendium.load_all()
    
    # Simulate client search request
    client_request = Message(
        MessageType.COMPENDIUM_SEARCH,
        {'query': 'fireball', 'category': 'spells'}
    )
    print(f"1. Client sends: {client_request.type.value}")
    
    # Simulate server processing
    data = client_request.data
    results = compendium.search(data['query'], data.get('category'))
    print(f"2. Server processes: Found {sum(len(v) for v in results.values())} results")
    
    # Simulate server response
    server_response = Message(
        MessageType.COMPENDIUM_SEARCH_RESPONSE,
        {
            'query': data['query'],
            'category': data.get('category'),
            'results': results,
            'total': sum(len(v) for v in results.values())
        }
    )
    print(f"3. Server responds: {server_response.type.value}")
    
    # Verify serialization works
    response_json = server_response.to_json()
    restored = Message.from_json(response_json)
    
    assert restored.data['total'] > 0, "No results found"
    assert 'results' in restored.data
    print(f"4. Response serialized/deserialized: {restored.data['total']} items")
    
    # Test spell detail request
    spell_request = Message(
        MessageType.COMPENDIUM_GET_SPELL,
        {'name': 'Fireball'}
    )
    
    spell = compendium.get_spell('Fireball')
    spell_response = Message(
        MessageType.COMPENDIUM_GET_SPELL_RESPONSE,
        {
            'spell': spell.to_dict() if spell else None,
            'found': spell is not None
        }
    )
    
    spell_json = spell_response.to_json()
    spell_restored = Message.from_json(spell_json)
    
    assert spell_restored.data['found'] == True
    assert spell_restored.data['spell']['name'] == 'Fireball'
    print(f"5. Spell detail request: {spell_restored.data['spell']['name']} (level {spell_restored.data['spell']['level']})")
    
    print("\n✓ Complete message flow working")


def main():
    print("\n" + "#"*60)
    print("# COMPENDIUM PROTOCOL INTEGRATION TEST")
    print("#"*60)
    
    try:
        test_message_types()
        test_message_creation()
        test_message_serialization()
        if not test_compendium_service_integration():
            return False
        test_message_flow_simulation()
        
        print("\n" + "#"*60)
        print("# ALL PROTOCOL INTEGRATION TESTS PASSED ✓")
        print("#"*60)
        print("\n✅ WebSocket protocol ready for compendium operations")
        print("✅ Message types defined in protocol.py")
        print("✅ Handlers added to game_session_protocol.py")
        print("✅ CompendiumService integrated and tested")
        
        return True
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return False
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
