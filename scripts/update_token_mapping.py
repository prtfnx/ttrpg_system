"""
Update Monster Token Mapping
Updates the monster_token_mapping.json file with newly downloaded tokens
"""

import json
from pathlib import Path
from typing import Dict, Set
import time

def update_token_mapping():
    """Update the mapping file with newly downloaded tokens"""
    
    base_dir = Path(__file__).parent.parent
    tokens_dir = base_dir / "core_table" / "compendiums" / "tokens" / "monster_tokens"
    mapping_file = tokens_dir / "monster_token_mapping.json"
    
    # Load existing mapping
    with open(mapping_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Get all token files
    token_files = list(tokens_dir.glob("*.webp")) + list(tokens_dir.glob("*.png"))
    
    print(f"Found {len(token_files)} token image files")
    
    # Build set of existing mappings
    existing_tokens = set(data['monster_tokens'].keys())
    failed_monsters = set(data.get('failed_monsters', []))
    
    # Track changes
    new_mappings = {}
    moved_from_failed = []
    
    # Process each token file
    for token_file in token_files:
        filename = token_file.name
        
        # Extract monster name from filename
        # Format: {SOURCE}_{Monster Name}.webp
        if '_' in filename:
            parts = filename.split('_', 1)
            monster_name = parts[1].replace('.webp', '').replace('.png', '')
            
            # Relative path for mapping
            rel_path = f"monster_tokens\\{filename}"
            
            # Check if this is a new mapping
            if monster_name not in existing_tokens:
                new_mappings[monster_name] = rel_path
                
                # Check if it was in failed list
                if monster_name in failed_monsters:
                    moved_from_failed.append(monster_name)
                    failed_monsters.remove(monster_name)
    
    if new_mappings:
        print(f"\n{'='*60}")
        print(f"Found {len(new_mappings)} new token mappings:")
        print(f"{'='*60}")
        for monster, path in new_mappings.items():
            print(f"  ✓ {monster} -> {path}")
            data['monster_tokens'][monster] = path
        
        if moved_from_failed:
            print(f"\n{len(moved_from_failed)} monsters moved from failed list:")
            for monster in moved_from_failed:
                print(f"  • {monster}")
        
        # Update failed monsters list
        data['failed_monsters'] = sorted(list(failed_monsters))
        
        # Update metadata
        data['metadata']['successfully_downloaded'] = len(data['monster_tokens'])
        data['metadata']['failed_downloads'] = len(failed_monsters)
        data['metadata']['total_monsters_checked'] = (
            len(data['monster_tokens']) + len(failed_monsters)
        )
        data['metadata']['success_rate'] = round(
            (len(data['monster_tokens']) / data['metadata']['total_monsters_checked']) * 100,
            2
        )
        data['metadata']['last_updated'] = time.strftime("%Y-%m-%d %H:%M:%S")
        
        # Save updated mapping
        with open(mapping_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        
        print(f"\n{'='*60}")
        print(f"Updated Mapping Summary:")
        print(f"{'='*60}")
        print(f"Total tokens: {len(data['monster_tokens'])}")
        print(f"Failed monsters: {len(failed_monsters)}")
        print(f"Coverage: {data['metadata']['success_rate']}%")
        print(f"\nMapping file updated: {mapping_file}")
        print(f"{'='*60}\n")
        
    else:
        print("\nNo new tokens found to add to mapping.")
        print(f"Current coverage: {data['metadata']['success_rate']}%")
        print(f"Total tokens: {len(data['monster_tokens'])}")
    
    return {
        "new_mappings": len(new_mappings),
        "total_tokens": len(data['monster_tokens']),
        "coverage": data['metadata']['success_rate'],
        "failed": len(failed_monsters)
    }


if __name__ == "__main__":
    print("Monster Token Mapping Updater\n")
    result = update_token_mapping()
    print(f"\nUpdate complete! {result['new_mappings']} new mappings added.")
