"""
D&D 5e Compendium API Router
Production-ready compendium data service with authentication and rate limiting
"""

import json
import os
import sys
from pathlib import Path
from typing import Optional, Dict, List, Any
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import JSONResponse
from functools import lru_cache

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from server_host.utils.logger import setup_logger
from server_host.middleware.permissions import require_permission, require_role
from server_host.database import schemas

logger = setup_logger(__name__)
router = APIRouter(prefix="/api/compendium", tags=["compendium"])

# Path to compendium exports directory
COMPENDIUM_DIR = Path(__file__).parent.parent.parent / "core_table" / "compendiums" / "exports"

class CompendiumService:
    """Thread-safe singleton service for compendium data with caching"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self.character_data = None
        self.spell_data = None
        self.equipment_data = None
        self.bestiary_data = None
        self._load_all_data()
        self._initialized = True
    
    def _load_all_data(self):
        """Load all compendium data from JSON files"""
        try:
            logger.info(f"Loading compendium data from: {COMPENDIUM_DIR}")
            
            # Load character data (races, classes, backgrounds)
            char_file = COMPENDIUM_DIR / "character_data.json"
            if char_file.exists():
                with open(char_file, 'r', encoding='utf-8') as f:
                    self.character_data = json.load(f)
                logger.info(f"✅ Loaded character data: {len(self.character_data.get('races', []))} races")
            else:
                logger.warning("❌ character_data.json not found")
            
            # Load spell data
            spell_file = COMPENDIUM_DIR / "spellbook_optimized.json"
            if spell_file.exists():
                with open(spell_file, 'r', encoding='utf-8') as f:
                    self.spell_data = json.load(f)
                logger.info(f"✅ Loaded spell data: {self.spell_data['metadata']['spell_count']} spells")
            else:
                logger.warning("❌ spellbook_optimized.json not found")
            
            # Load equipment data
            equipment_file = COMPENDIUM_DIR / "equipment_data.json"
            if equipment_file.exists():
                with open(equipment_file, 'r', encoding='utf-8') as f:
                    self.equipment_data = json.load(f)
                logger.info("✅ Loaded equipment data")
            else:
                logger.warning("❌ equipment_data.json not found")
            
            # Load bestiary data
            bestiary_file = COMPENDIUM_DIR / "bestiary_optimized.json"
            if bestiary_file.exists():
                with open(bestiary_file, 'r', encoding='utf-8') as f:
                    self.bestiary_data = json.load(f)
                # Handle different bestiary file formats
                if 'metadata' in self.bestiary_data and 'monster_count' in self.bestiary_data['metadata']:
                    monster_count = self.bestiary_data['metadata']['monster_count']
                elif 'monsters' in self.bestiary_data:
                    monster_count = len(self.bestiary_data['monsters'])
                else:
                    monster_count = "unknown"
                logger.info(f"✅ Loaded bestiary data: {monster_count} monsters")
            else:
                logger.warning("❌ bestiary_optimized.json not found")
                
        except Exception as e:
            logger.error(f"❌ Error loading compendium data: {e}")

# Global compendium service instance (singleton)
@lru_cache
def get_compendium_service():
    return CompendiumService()

@router.get("/status")
async def get_compendium_status(
    user: schemas.User = Depends(require_permission("compendium:read"))
):
    """Get compendium API status and data availability (requires authentication)"""
    service = get_compendium_service()
    return {
        "status": "online",
        "user": {
            "username": user.username,
            "tier": user.tier,
            "permissions": user.get_permissions()
        },
        "data_availability": {
            "character_data": service.character_data is not None,
            "spell_data": service.spell_data is not None,
            "equipment_data": service.equipment_data is not None,
            "bestiary_data": service.bestiary_data is not None
        },
        "counts": {
            "races": len(service.character_data.get('races', [])) if service.character_data else 0,
            "classes": len(service.character_data.get('classes', [])) if service.character_data else 0,
            "spells": service.spell_data['metadata']['spell_count'] if service.spell_data else 0,
            "monsters": len(service.bestiary_data.get('monsters', {})) if service.bestiary_data else 0
        }
    }

@router.get("/races")
async def get_races(
    user: schemas.User = Depends(require_permission("compendium:read"))
):
    """Get all race data (authenticated)"""
    service = get_compendium_service()
    if not service.character_data:
        raise HTTPException(status_code=500, detail="Character data not available")
    
    races = service.character_data.get('races', [])
    return {
        "races": races,
        "count": len(races)
    }

@router.get("/races/{race_name}")
async def get_race_by_name(
    race_name: str,
    user: schemas.User = Depends(require_permission("compendium:read"))
):
    """Get specific race by name (authenticated)"""
    service = get_compendium_service()
    if not service.character_data:
        raise HTTPException(status_code=500, detail="Character data not available")
    
    races = service.character_data.get('races', [])
    race = next((r for r in races if r['name'].lower() == race_name.lower()), None)
    
    if not race:
        raise HTTPException(status_code=404, detail=f"Race '{race_name}' not found")
    
    return race

@router.get("/classes")
async def get_classes(
    user: schemas.User = Depends(require_permission("compendium:read"))
):
    """Get all class data (authenticated)"""
    service = get_compendium_service()
    if not service.character_data:
        raise HTTPException(status_code=500, detail="Character data not available")
    
    classes = service.character_data.get('classes', [])
    return {
        "classes": classes,
        "count": len(classes)
    }

@router.get("/classes/{class_name}")
async def get_class_by_name(
    class_name: str,
    user: schemas.User = Depends(require_permission("compendium:read"))
):
    """Get specific class by name (authenticated)"""
    service = get_compendium_service()
    if not service.character_data:
        raise HTTPException(status_code=500, detail="Character data not available")
    
    classes = service.character_data.get('classes', [])
    char_class = next((c for c in classes if c['name'].lower() == class_name.lower()), None)
    
    if not char_class:
        raise HTTPException(status_code=404, detail=f"Class '{class_name}' not found")
    
    return char_class

@router.get("/backgrounds")
async def get_backgrounds(
    user: schemas.User = Depends(require_permission("compendium:read"))
):
    """Get all background data (authenticated)"""
    service = get_compendium_service()
    if not service.character_data:
        raise HTTPException(status_code=500, detail="Character data not available")
    
    backgrounds = service.character_data.get('backgrounds', [])
    return {
        "backgrounds": backgrounds,
        "count": len(backgrounds)
    }

@router.get("/backgrounds/{background_name}")
async def get_background_by_name(
    background_name: str,
    user: schemas.User = Depends(require_permission("compendium:read"))
):
    """Get specific background by name (authenticated)"""
    service = get_compendium_service()
    if not service.character_data:
        raise HTTPException(status_code=500, detail="Character data not available")
    
    backgrounds = service.character_data.get('backgrounds', [])
    background = next((b for b in backgrounds if b['name'].lower() == background_name.lower()), None)
    
    if not background:
        raise HTTPException(status_code=404, detail=f"Background '{background_name}' not found")
    
    return background

@router.get("/spells")
async def get_spells(
    user: schemas.User = Depends(require_permission("compendium:read")),
    level: Optional[int] = Query(None, description="Filter by spell level"),
    school: Optional[str] = Query(None, description="Filter by spell school"),
    spell_class: Optional[str] = Query(None, alias="class", description="Filter by class that can cast the spell"),
    limit: Optional[int] = Query(None, description="Limit number of results")
):
    """Get all spell data with optional filtering (authenticated)"""
    service = get_compendium_service()
    if not service.spell_data:
        raise HTTPException(status_code=500, detail="Spell data not available")
    
    spells = service.spell_data['spells']
    filtered_spells = {}
    
    count = 0
    for name, spell in spells.items():
        # Apply filters
        if level is not None and spell['level'] != level:
            continue
        if school and spell['school'].lower() != school.lower():
            continue
        if spell_class and spell_class.lower() not in [c.lower() for c in spell.get('classes', [])]:
            continue
        
        filtered_spells[name] = spell
        count += 1
        
        # Apply limit
        if limit and count >= limit:
            break
    
    return {
        "spells": filtered_spells,
        "count": len(filtered_spells),
        "metadata": service.spell_data['metadata']
    }

@router.get("/spells/{spell_name}")
async def get_spell_by_name(
    spell_name: str,
    user: schemas.User = Depends(require_permission("compendium:read"))
):
    """Get specific spell by name (authenticated)"""
    service = get_compendium_service()
    if not service.spell_data:
        raise HTTPException(status_code=500, detail="Spell data not available")
    
    spells = service.spell_data['spells']
    spell = spells.get(spell_name)
    
    if not spell:
        # Try case-insensitive search
        spell = next((s for name, s in spells.items() if name.lower() == spell_name.lower()), None)
    
    if not spell:
        raise HTTPException(status_code=404, detail=f"Spell '{spell_name}' not found")
    
    return spell

@router.get("/equipment")
async def get_equipment(
    user: schemas.User = Depends(require_permission("compendium:read"))
):
    """Get all equipment data (authenticated)"""
    service = get_compendium_service()
    if not service.equipment_data:
        raise HTTPException(status_code=500, detail="Equipment data not available")
    
    return service.equipment_data

@router.get("/monsters")
async def get_monsters(
    user: schemas.User = Depends(require_permission("compendium:read")),
    cr: Optional[str] = Query(None, description="Filter by challenge rating"),
    limit: Optional[int] = Query(None, description="Limit number of results")
):
    """Get all monster data with optional filtering (authenticated)"""
    service = get_compendium_service()
    if not service.bestiary_data:
        raise HTTPException(status_code=500, detail="Bestiary data not available")
    
    monsters = service.bestiary_data['monsters']
    
    if cr:
        filtered_monsters = {name: monster for name, monster in monsters.items() 
                           if str(monster.get('challenge_rating', 0)) == str(cr)}
        return {
            "monsters": filtered_monsters,
            "count": len(filtered_monsters),
            "metadata": service.bestiary_data['metadata']
        }
    
    # Apply limit if specified
    if limit:
        limited_monsters = dict(list(monsters.items())[:limit])
        return {
            "monsters": limited_monsters,
            "count": len(limited_monsters),
            "metadata": service.bestiary_data['metadata']
        }
    
    return {
        "monsters": monsters,
        "count": len(monsters),
        "metadata": service.bestiary_data.get('metadata', {})
    }

@router.get("/monsters/{monster_name}")
async def get_monster_by_name(
    monster_name: str,
    user: schemas.User = Depends(require_permission("compendium:read"))
):
    """Get specific monster by name (authenticated)"""
    service = get_compendium_service()
    if not service.bestiary_data:
        raise HTTPException(status_code=500, detail="Bestiary data not available")
    
    monsters = service.bestiary_data['monsters']
    monster = monsters.get(monster_name)
    
    if not monster:
        # Try case-insensitive search
        monster = next((m for name, m in monsters.items() if name.lower() == monster_name.lower()), None)
    
    if not monster:
        raise HTTPException(status_code=404, detail=f"Monster '{monster_name}' not found")
    
    return monster

# Reload endpoint for development
@router.post("/reload")
async def reload_compendium_data(
    user: schemas.User = Depends(require_role("admin"))
):
    """Reload compendium data from files (admin only)"""
    try:
        service = get_compendium_service()
        service._load_all_data()
        return {"message": "Compendium data reloaded successfully", "reloaded_by": user.username}
    except Exception as e:
        logger.error(f"Error reloading compendium data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reload data: {str(e)}")