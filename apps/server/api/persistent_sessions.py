"""
Example API endpoints showing how to use database persistence with game sessions
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from server_host.database.database import get_db
from server_host.database import crud, schemas
from server_host.database.session_utils import (
    create_game_session_with_persistence,
    load_game_session_with_persistence,
    save_game_session_state,
    get_user_persistent_sessions
)

router = APIRouter(prefix="/api/persistent", tags=["persistent-sessions"])

# Global storage for active protocol services (in production, use Redis or similar)
active_sessions = {}

@router.post("/sessions", response_model=dict)
async def create_persistent_session(
    session_data: schemas.GameSessionCreate,
    owner_id: int,  # In real app, get this from authentication
    db: Session = Depends(get_db)
):
    """Create a new persistent game session"""
    
    protocol_service, error = create_game_session_with_persistence(
        db, session_data.name, owner_id
    )
    
    if error:
        raise HTTPException(status_code=400, detail=error)
    
    # Store in active sessions
    active_sessions[protocol_service.session_code] = protocol_service
    
    return {
        "session_code": protocol_service.session_code,
        "name": session_data.name,
        "message": "Persistent session created successfully",
        "tables": list(protocol_service.table_manager.tables.keys())
    }

@router.get("/sessions", response_model=List[dict])
async def get_user_sessions(
    user_id: int,  # In real app, get this from authentication
    db: Session = Depends(get_db)
):
    """Get all persistent sessions for a user"""
    return get_user_persistent_sessions(db, user_id)

@router.get("/sessions/{session_code}", response_model=dict)
async def get_session_details(
    session_code: str,
    db: Session = Depends(get_db)
):
    """Get details of a specific persistent session"""
    
    # Check if already loaded
    if session_code in active_sessions:
        protocol_service = active_sessions[session_code]
    else:
        # Load from database
        protocol_service, error = load_game_session_with_persistence(db, session_code)
        if error:
            raise HTTPException(status_code=404, detail=error)
        active_sessions[session_code] = protocol_service
    
    return {
        "session_code": session_code,
        "connected_clients": len(protocol_service.clients),
        "tables": list(protocol_service.table_manager.tables.keys()),
        "table_details": {
            name: {
                "width": table.width,
                "height": table.height,
                "entities": len(table.entities)
            }
            for name, table in protocol_service.table_manager.tables.items()
        }
    }

@router.post("/sessions/{session_code}/save")
async def save_session(
    session_code: str,
    additional_data: dict = None,
    db: Session = Depends(get_db)
):
    """Manually save a session state"""
    
    if session_code not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not active")
    
    protocol_service = active_sessions[session_code]
    success = save_game_session_state(protocol_service, additional_data)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save session")
    
    return {"message": "Session saved successfully"}

@router.post("/sessions/{session_code}/load")
async def load_session(
    session_code: str,
    db: Session = Depends(get_db)
):
    """Load a session from database"""
    
    protocol_service, error = load_game_session_with_persistence(db, session_code)
    if error:
        raise HTTPException(status_code=404, detail=error)
    
    # Replace in active sessions
    active_sessions[session_code] = protocol_service
    
    return {
        "message": "Session loaded successfully",
        "tables": list(protocol_service.table_manager.tables.keys())
    }

# Utility endpoints for development/testing

@router.get("/sessions/{session_code}/tables", response_model=dict)
async def get_session_tables(session_code: str):
    """Get table information for a session"""
    
    if session_code not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not active")
    
    protocol_service = active_sessions[session_code]
    tables_info = {}
    
    for name, table in protocol_service.table_manager.tables.items():
        tables_info[name] = {
            "table_id": table.table_id,
            "width": table.width,
            "height": table.height,
            "position": table.position,
            "scale": table.scale,
            "entities": [
                {
                    "entity_id": entity.entity_id,
                    "sprite_id": entity.sprite_id,
                    "name": entity.name,
                    "position": entity.position,
                    "layer": entity.layer
                }
                for entity in table.entities.values()
            ]
        }
    
    return tables_info

@router.post("/sessions/{session_code}/tables/{table_name}/save")
async def save_specific_table(
    session_code: str,
    table_name: str,
    db: Session = Depends(get_db)
):
    """Save a specific table to database"""
    
    if session_code not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not active")
    
    protocol_service = active_sessions[session_code]
    
    if not protocol_service.game_session_db_id:
        raise HTTPException(status_code=400, detail="No database session ID")
    
    success = protocol_service.table_manager.save_table(table_name, protocol_service.game_session_db_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Table not found or save failed")
    
    return {"message": f"Table '{table_name}' saved successfully"}
