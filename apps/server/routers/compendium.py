"""
D&D 5e Compendium API Router
Serves compendium data (races, classes, spells, equipment, monsters) via REST API
"""

from pathlib import Path
from typing import Optional

import core_table
from config import Settings
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from service.character_rules import (
    ASI_LEVELS,
    MULTICLASS_DATA,
    PROFICIENCY_BONUSES,
    RULESET_VERSION,
    XP_THRESHOLDS,
)
from service.compendium_artifact import CompendiumArtifact


def _set_cache_headers(request: Request, response: Response) -> None:
    """Make immutable generations cacheable without caching readiness state."""
    if request.url.path.endswith("/status"):
        response.headers["Cache-Control"] = "no-store"
        return
    if compendium_service.artifact_version:
        response.headers["ETag"] = f'"{compendium_service.artifact_version}"'
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=60"


router = APIRouter(
    prefix="/api/compendium",
    tags=["compendium"],
    dependencies=[Depends(_set_cache_headers)],
)

# Compendium exports directory inside the installed core_table package
assert core_table.__file__ is not None, "core_table must be a file-based module"
COMPENDIUM_DIR = Path(core_table.__file__).parent / "compendiums" / "exports"

compendium_service = CompendiumArtifact(
    COMPENDIUM_DIR,
    require_manifest=Settings().is_production,
)


def _data(name: str) -> dict:
    value = compendium_service.data.get(name)
    if value is None:
        raise HTTPException(status_code=503, detail="Compendium artifact is not available")
    return value

@router.get("/status")
async def get_compendium_status():
    """Get compendium API status and data availability"""
    return {
        "status": "online" if compendium_service.data else "unavailable",
        "artifact_version": compendium_service.artifact_version,
        "verified": compendium_service.verified,
        "data_availability": {
            "character_data": "character_data" in compendium_service.data,
            "spell_data": "spell_data" in compendium_service.data,
            "equipment_data": "equipment_data" in compendium_service.data,
            "bestiary_data": "bestiary_data" in compendium_service.data,
        },
        "counts": {
            "races": len(compendium_service.data.get("character_data", {}).get('races', [])),
            "classes": len(compendium_service.data.get("character_data", {}).get('classes', [])),
            "backgrounds": len(compendium_service.data.get("character_data", {}).get('backgrounds', [])),
            "spells": len(compendium_service.data.get("spell_data", {}).get('spells', {})),
            "monsters": len(compendium_service.data.get("bestiary_data", {}).get('monsters', {})),
            "feats": len(compendium_service.data.get("feats_data", {}).get('feats', [])),
        }
    }

@router.get("/races")
async def get_races():
    """Get all race data"""
    races = _data("character_data").get('races', [])
    return {
        "races": races,
        "count": len(races)
    }

@router.get("/races/{race_name}")
async def get_race_by_name(race_name: str):
    """Get specific race by name"""
    races = _data("character_data").get('races', [])
    race = next((r for r in races if r['name'].lower() == race_name.lower()), None)

    if not race:
        raise HTTPException(status_code=404, detail=f"Race '{race_name}' not found")

    return race

@router.get("/classes")
async def get_classes():
    """Get all class data"""
    classes = _data("character_data").get('classes', [])
    return {
        "classes": classes,
        "count": len(classes)
    }

@router.get("/classes/{class_name}/subclasses")
async def get_class_subclasses(class_name: str):
    """Get subclasses for a specific class"""
    classes = _data("character_data").get('classes', [])
    char_class = next((c for c in classes if c['name'].lower() == class_name.lower()), None)
    if not char_class:
        raise HTTPException(status_code=404, detail=f"Class '{class_name}' not found")

    subclasses = char_class.get('subclasses', [])
    return {"class": char_class['name'], "subclasses": subclasses, "count": len(subclasses)}


@router.get("/classes/{class_name}")
async def get_class_by_name(class_name: str):
    """Get specific class by name"""
    classes = _data("character_data").get('classes', [])
    char_class = next((c for c in classes if c['name'].lower() == class_name.lower()), None)

    if not char_class:
        raise HTTPException(status_code=404, detail=f"Class '{class_name}' not found")

    return char_class

@router.get("/backgrounds")
async def get_backgrounds():
    """Get all background data"""
    backgrounds = _data("character_data").get('backgrounds', [])
    return {
        "backgrounds": backgrounds,
        "count": len(backgrounds)
    }

@router.get("/backgrounds/{background_name}")
async def get_background_by_name(background_name: str):
    """Get specific background by name"""
    backgrounds = _data("character_data").get('backgrounds', [])
    background = next((b for b in backgrounds if b['name'].lower() == background_name.lower()), None)

    if not background:
        raise HTTPException(status_code=404, detail=f"Background '{background_name}' not found")

    return background

@router.get("/spells")
async def get_spells(
    level: Optional[int] = Query(None, description="Filter by spell level"),
    school: Optional[str] = Query(None, description="Filter by spell school"),
    spell_class: Optional[str] = Query(None, alias="class", description="Filter by class that can cast the spell"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of matching results to skip"),
):
    """Get all spell data with optional filtering"""
    spell_data = _data("spell_data")
    spells = spell_data['spells']
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

        if count >= offset:
            filtered_spells[name] = spell
        count += 1

        # Apply limit
        if len(filtered_spells) >= limit:
            break

    return {
        "spells": filtered_spells,
        "count": len(filtered_spells),
        "metadata": spell_data['metadata'],
        "limit": limit,
        "offset": offset,
    }

@router.get("/spells/{spell_name}")
async def get_spell_by_name(spell_name: str):
    """Get specific spell by name"""
    spells = _data("spell_data")['spells']
    spell = spells.get(spell_name)

    if not spell:
        # Try case-insensitive search
        spell = next((s for name, s in spells.items() if name.lower() == spell_name.lower()), None)

    if not spell:
        raise HTTPException(status_code=404, detail=f"Spell '{spell_name}' not found")

    return spell

@router.get("/equipment")
async def get_equipment(
    limit_per_category: int = Query(100, ge=1, le=200),
):
    """Get all equipment data"""
    equipment_data = _data("equipment_data")
    equipment = {
        category: items[:limit_per_category]
        for category, items in equipment_data["equipment"].items()
    }
    return {
        "metadata": equipment_data["metadata"],
        "equipment": equipment,
        "limit_per_category": limit_per_category,
    }

@router.get("/monsters")
async def get_monsters(
    cr: Optional[str] = Query(None, description="Filter by challenge rating"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of matching results to skip"),
):
    """Get all monster data with optional filtering"""
    bestiary_data = _data("bestiary_data")
    monsters = bestiary_data['monsters']

    if cr:
        monsters = {name: monster for name, monster in monsters.items()
                    if str(monster.get('challenge_rating', 0)) == str(cr)}
    page = dict(list(monsters.items())[offset:offset + limit])
    return {
        "monsters": page,
        "count": len(page),
        "total": len(monsters),
        "limit": limit,
        "offset": offset,
        "metadata": bestiary_data.get('metadata', {}),
    }

@router.get("/monsters/{monster_name}")
async def get_monster_by_name(monster_name: str):
    """Get specific monster by name"""
    monsters = _data("bestiary_data")['monsters']
    monster = monsters.get(monster_name)

    if not monster:
        # Try case-insensitive search
        monster = next((m for name, m in monsters.items() if name.lower() == monster_name.lower()), None)

    if not monster:
        raise HTTPException(status_code=404, detail=f"Monster '{monster_name}' not found")

    return monster

@router.get("/feats")
async def get_feats(
    prerequisite: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Get all feats, optionally filtered by prerequisite or source"""
    feats = _data("feats_data").get('feats', [])
    if prerequisite == 'none':
        feats = [f for f in feats if f.get('prerequisite') is None]
    elif prerequisite:
        feats = [f for f in feats if f.get('prerequisite') and prerequisite.lower() in f['prerequisite'].lower()]
    if source:
        feats = [f for f in feats if f.get('source', '').upper() == source.upper()]

    total = len(feats)
    feats = feats[offset:offset + limit]
    return {"feats": feats, "count": len(feats), "total": total, "limit": limit, "offset": offset}


@router.get("/feats/{feat_name}")
async def get_feat_by_name(feat_name: str):
    """Get a specific feat by name"""
    feats = _data("feats_data").get('feats', [])
    feat = next((f for f in feats if f['name'].lower() == feat_name.lower()), None)
    if not feat:
        raise HTTPException(status_code=404, detail=f"Feat '{feat_name}' not found")
    return feat


@router.get("/advancement")
async def get_advancement_config():
    """D&D 5e advancement config: XP table, proficiency bonus, ASI levels, tier boundaries"""
    return {
        'ruleset_version': RULESET_VERSION,
        'xp_table': list(XP_THRESHOLDS),
        'proficiency_bonus': list(PROFICIENCY_BONUSES),
        'asi_levels': ASI_LEVELS,
        'tier_boundaries': [1, 5, 11, 17],
    }


@router.get("/classes/{class_name}/multiclass")
async def get_class_multiclass(class_name: str):
    """Multiclass prerequisites and proficiencies for a class (SRD rules)"""
    data = MULTICLASS_DATA.get(class_name.lower())
    if not data:
        raise HTTPException(status_code=404, detail=f"Multiclass data not found for '{class_name}'")
    return {'ruleset_version': RULESET_VERSION, 'class': class_name, **data}


@router.get("/classes/multiclass/all")
async def get_all_multiclass_data():
    """All class multiclass prerequisites and proficiencies"""
    return {
        key: {'ruleset_version': RULESET_VERSION, 'class': key, **value}
        for key, value in MULTICLASS_DATA.items()
    }
