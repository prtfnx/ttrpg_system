"""
Monster Token API Endpoints
FastAPI routes for token resolution and serving
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse, FileResponse, Response
from pydantic import BaseModel
from typing import List, Optional
from pathlib import Path

from core_table.compendiums.token_resolution_service import get_token_service
from storage.r2_manager import R2AssetManager
from logger import setup_logger
import re

logger = setup_logger(__name__)

# Create API router
router = APIRouter(prefix="/api/tokens", tags=["tokens"])

# Initialize services
token_service = None
r2_manager = None


def init_token_api(r2_asset_manager: Optional[R2AssetManager] = None):
    """Initialize token API with R2 manager"""
    global token_service, r2_manager
    r2_manager = r2_asset_manager
    token_service = get_token_service(r2_manager)
    logger.info("Token API initialized")


class TokenRequest(BaseModel):
    """Request model for token resolution"""
    monster_name: str
    monster_type: Optional[str] = None
    use_r2: bool = True


class TokenInfo(BaseModel):
    """Token information response"""
    monster_name: str
    has_token: bool
    match_type: str
    source: str
    url: str
    local_path: Optional[str] = None
    r2_key: Optional[str] = None
    asset_id: Optional[str] = None  # Asset ID for database lookup
    asset_xxhash: Optional[str] = None  # xxHash for integrity verification


@router.get("/resolve/{monster_name}")
async def resolve_token(
    monster_name: str,
    monster_type: Optional[str] = Query(None, description="Monster type for fallback"),
    use_r2: bool = Query(True, description="Use R2 URLs instead of local paths"),
    redirect: bool = Query(False, description="Redirect to token URL directly")
):
    """
    Resolve token URL for a monster with intelligent fallback
    
    - **monster_name**: Name of the monster
    - **monster_type**: Creature type (aberration, dragon, etc.) for type-based fallback
    - **use_r2**: Return R2 presigned URL (True) or local path (False)
    - **redirect**: Redirect to the token URL directly
    """
    if not token_service:
        raise HTTPException(status_code=500, detail="Token service not initialized")
    
    try:
        token_url = token_service.resolve_token_url(
            monster_name=monster_name,
            monster_type=monster_type,
            use_r2=use_r2
        )
        
        if redirect:
            # Redirect directly to the token
            return RedirectResponse(url=token_url)
        else:
            # Return JSON with URL
            info = token_service.get_token_info(monster_name, monster_type)
            return {
                **info,
                "url": token_url
            }
    
    except Exception as e:
        logger.error(f"Token resolution error for '{monster_name}': {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resolve/batch")
async def resolve_tokens_batch(
    monsters: List[str],
    types: Optional[List[str]] = None,
    use_r2: bool = True
):
    """
    Batch resolve token URLs for multiple monsters
    
    - **monsters**: List of monster names
    - **types**: Optional list of monster types (same order as monsters)
    - **use_r2**: Use R2 URLs instead of local paths
    """
    if not token_service:
        raise HTTPException(status_code=500, detail="Token service not initialized")
    
    try:
        results = token_service.batch_resolve(monsters, types)
        return {
            "count": len(results),
            "tokens": results
        }
    
    except Exception as e:
        logger.error(f"Batch token resolution error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/info/{monster_name}")
async def get_token_info(monster_name: str):
    """
    Get detailed token information for a monster
    
    - **monster_name**: Name of the monster
    
    Returns detailed info including match type, source, paths
    """
    if not token_service:
        raise HTTPException(status_code=500, detail="Token service not initialized")
    
    try:
        info = token_service.get_token_info(monster_name)
        return info
    
    except Exception as e:
        logger.error(f"Error getting token info for '{monster_name}': {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/local/{filename}")
async def serve_local_token(filename: str):
    """
    Serve a local token file
    
    - **filename**: Name of the token file
    """
    base_dir = Path(__file__).parent.parent
    token_path = base_dir / "core_table" / "compendiums" / "tokens" / "monster_tokens" / filename
    
    if not token_path.exists():
        raise HTTPException(status_code=404, detail="Token file not found")
    
    # Serve with appropriate content type
    return FileResponse(
        token_path,
        media_type="image/webp" if filename.endswith('.webp') else "image/png",
        headers={"Cache-Control": "public, max-age=604800"}  # 7 days
    )


@router.get("/defaults/{type_name}")
async def serve_default_token(type_name: str):
    """
    Serve a type-based default token (SVG format)
    
    - **type_name**: Creature type (aberration, dragon, etc.) - without extension
    
    Returns either a redirect to R2 or serves local SVG file
    """
    type_name_lower = type_name.lower().replace('.svg', '')  # Remove extension if present
    
    # Try R2 first
    if r2_manager:
        # R2 tokens are stored as: image/svg+xml/YYYYMMDD_HHMMSS_hash_{type}.svg
        # We need to search for the file by type suffix
        # For now, generate presigned URL by listing or use known pattern
        
        # Attempt direct key pattern (will need adjustment if upload pattern changes)
        # Better approach: search R2 for files matching pattern *_{type_name}.svg
        
        try:
            # List all objects in the image/svg+xml/ prefix
            response = r2_manager.s3_client.list_objects_v2(
                Bucket=r2_manager.bucket_name,
                Prefix='image/svg+xml/'
            )
            
            if 'Contents' in response:
                # Find file ending with _{type_name}.svg
                pattern = re.compile(rf'.*_{type_name_lower}\.svg$')
                for obj in response['Contents']:
                    if pattern.match(obj['Key']):
                        # Generate presigned URL
                        presigned_url = r2_manager.get_presigned_url(obj['Key'], expiration=2592000)  # 30 days
                        if presigned_url:
                            return RedirectResponse(url=presigned_url)
                        break
        except Exception as e:
            logger.warning(f"Failed to fetch default token from R2 for '{type_name}': {e}")
    
    # Fallback to local file
    base_dir = Path(__file__).parent.parent.parent
    token_path = base_dir / "core_table" / "compendiums" / "tokens" / "defaults" / f"{type_name_lower}.svg"
    
    if not token_path.exists():
        raise HTTPException(status_code=404, detail=f"Default token not found for type: {type_name}")
    
    return FileResponse(
        token_path,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=2592000"}  # 30 days
    )


@router.get("/{r2_key:path}")
async def get_r2_token(r2_key: str):
    """
    Get presigned URL for R2 token or redirect to it
    
    - **r2_key**: R2 object key (e.g., "tokens/monsters/MM_Goblin.webp")
    """
    if not r2_manager:
        raise HTTPException(status_code=500, detail="R2 manager not configured")
    
    try:
        # Generate presigned URL
        presigned_url = r2_manager.get_presigned_url(r2_key, expiration=604800)  # 7 days
        
        if not presigned_url:
            raise HTTPException(status_code=404, detail="Token not found in R2 storage")
        
        # Redirect to presigned URL
        return RedirectResponse(url=presigned_url)
    
    except Exception as e:
        logger.error(f"Error serving R2 token '{r2_key}': {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_token_stats():
    """Get token statistics"""
    if not token_service:
        raise HTTPException(status_code=500, detail="Token service not initialized")
    
    total_tokens = len(token_service.token_mapping)
    r2_tokens = len(token_service.r2_mapping)
    
    return {
        "total_tokens": total_tokens,
        "r2_tokens": r2_tokens,
        "local_only_tokens": total_tokens - r2_tokens,
        "coverage_percent": round((total_tokens / 2132) * 100, 2) if total_tokens > 0 else 0
    }
