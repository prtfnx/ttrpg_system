"""
Generate Default Type-Based Token SVGs
Creates simple, professional SVG tokens for each D&D 5e creature type
"""

import os
from pathlib import Path

# Get the base directory
BASE_DIR = Path(__file__).parent.parent
DEFAULTS_DIR = BASE_DIR / "core_table" / "compendiums" / "tokens" / "defaults"

# Ensure directory exists
DEFAULTS_DIR.mkdir(parents=True, exist_ok=True)

# D&D 5e creature types with corresponding colors and icons
CREATURE_TYPES = {
    "aberration": {
        "color": "#8B4789",  # Purple
        "icon": "👁",
        "description": "Aberrations"
    },
    "beast": {
        "color": "#8B4513",  # Brown
        "icon": "🐺",
        "description": "Beasts"
    },
    "celestial": {
        "color": "#FFD700",  # Gold
        "icon": "⭐",
        "description": "Celestials"
    },
    "construct": {
        "color": "#708090",  # Slate Gray
        "icon": "⚙",
        "description": "Constructs"
    },
    "dragon": {
        "color": "#DC143C",  # Crimson
        "icon": "🐉",
        "description": "Dragons"
    },
    "elemental": {
        "color": "#4682B4",  # Steel Blue
        "icon": "🔥",
        "description": "Elementals"
    },
    "fey": {
        "color": "#9370DB",  # Medium Purple
        "icon": "🧚",
        "description": "Fey"
    },
    "fiend": {
        "color": "#8B0000",  # Dark Red
        "icon": "😈",
        "description": "Fiends"
    },
    "giant": {
        "color": "#CD853F",  # Peru
        "icon": "⛰",
        "description": "Giants"
    },
    "humanoid": {
        "color": "#DAA520",  # Goldenrod
        "icon": "👤",
        "description": "Humanoids"
    },
    "monstrosity": {
        "color": "#556B2F",  # Dark Olive Green
        "icon": "🐙",
        "description": "Monstrosities"
    },
    "ooze": {
        "color": "#32CD32",  # Lime Green
        "icon": "💧",
        "description": "Oozes"
    },
    "plant": {
        "color": "#228B22",  # Forest Green
        "icon": "🌿",
        "description": "Plants"
    },
    "undead": {
        "color": "#2F4F4F",  # Dark Slate Gray
        "icon": "💀",
        "description": "Undead"
    }
}

def create_svg_token(creature_type: str, color: str, icon: str, description: str) -> str:
    """Create a professional SVG token for a creature type"""
    
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <!-- Background circle -->
  <circle cx="128" cy="128" r="120" fill="{color}" opacity="0.9"/>
  
  <!-- Border ring -->
  <circle cx="128" cy="128" r="120" fill="none" stroke="#000000" stroke-width="4" opacity="0.3"/>
  <circle cx="128" cy="128" r="115" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.5"/>
  
  <!-- Icon background circle -->
  <circle cx="128" cy="120" r="60" fill="#FFFFFF" opacity="0.2"/>
  
  <!-- Icon text -->
  <text x="128" y="145" font-size="72" text-anchor="middle" fill="#000000" opacity="0.8">{icon}</text>
  
  <!-- Label -->
  <text x="128" y="220" font-size="16" font-weight="bold" text-anchor="middle" fill="#FFFFFF" stroke="#000000" stroke-width="0.5">{description.upper()}</text>
  
  <!-- Subtle gradient overlay -->
  <defs>
    <radialGradient id="grad_{creature_type}">
      <stop offset="0%" style="stop-color:#FFFFFF;stop-opacity:0.2" />
      <stop offset="100%" style="stop-color:#000000;stop-opacity:0.1" />
    </radialGradient>
  </defs>
  <circle cx="128" cy="128" r="120" fill="url(#grad_{creature_type})"/>
</svg>"""
    
    return svg

def generate_all_tokens():
    """Generate all default tokens"""
    print("Generating default creature type tokens...")
    print(f"Output directory: {DEFAULTS_DIR}")
    print()
    
    generated_count = 0
    
    for creature_type, info in CREATURE_TYPES.items():
        svg_content = create_svg_token(
            creature_type,
            info["color"],
            info["icon"],
            info["description"]
        )
        
        # Save to file
        output_file = DEFAULTS_DIR / f"{creature_type}.svg"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(svg_content)
        
        print(f"✓ Created {creature_type}.svg ({info['description']})")
        generated_count += 1
    
    print()
    print(f"Successfully generated {generated_count} default tokens!")
    print(f"Files saved to: {DEFAULTS_DIR}")
    
    # Create a mapping file
    mapping_file = DEFAULTS_DIR / "type_mapping.json"
    import json
    
    type_mapping = {
        "metadata": {
            "version": "1.0.0",
            "created_at": "2025-12-25",
            "description": "Default tokens for D&D 5e creature types"
        },
        "types": {
            creature_type: f"{creature_type}.svg"
            for creature_type in CREATURE_TYPES.keys()
        }
    }
    
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(type_mapping, f, indent=2)
    
    print(f"✓ Created type_mapping.json")

if __name__ == "__main__":
    generate_all_tokens()
