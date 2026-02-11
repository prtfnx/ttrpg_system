"""
Token Resolution Service
Intelligent lookup service with fallback strategy for monster tokens
Follows industry best practices for asset resolution
"""

import json
import re
from pathlib import Path
from typing import Optional, Dict, List
from difflib import SequenceMatcher
from functools import lru_cache

from logger import setup_logger
from server_host.database.database import SessionLocal
from server_host.database.models import Asset

logger = setup_logger(__name__)


class TokenResolutionService:
    """
    Handles intelligent token resolution with multi-level fallback strategy:
    1. Exact name match
    2. Normalized name match (variants, parentheses)
    3. Fuzzy name match (typos, similar names)
    4. Type-based default token
    5. Generic fallback token
    """
    
    # D&D 5e creature types
    CREATURE_TYPES = [
        'aberration', 'beast', 'celestial', 'construct', 'dragon',
        'elemental', 'fey', 'fiend', 'giant', 'humanoid',
        'monstrosity', 'ooze', 'plant', 'undead'
    ]
    
    def __init__(self, r2_manager=None):
        """
        Initialize token resolution service
        
        Args:
            r2_manager: R2AssetManager instance for generating presigned URLs
        """
        self.r2_manager = r2_manager
        
        # Find base directory (go up from this file to project root)
        current_file = Path(__file__)  # .../core_table/compendiums/token_resolution_service.py
        self.base_dir = current_file.parent.parent.parent  # Go up 3 levels to project root
        
        # Load mappings
        self.token_mapping = self._load_token_mapping()
        self.r2_mapping = self._load_r2_mapping()
        
        # Build lookup indices
        self.normalized_index = self._build_normalized_index()
        
        logger.info(f"TokenResolutionService initialized with {len(self.token_mapping)} tokens")
    
    def _load_token_mapping(self) -> Dict[str, str]:
        """Load local token mapping"""
        mapping_file = self.base_dir / "core_table" / "compendiums" / "tokens" / "monster_tokens" / "monster_token_mapping.json"
        
        try:
            with open(mapping_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return data.get('monster_tokens', {})
        except Exception as e:
            logger.error(f"Failed to load token mapping: {e}")
            return {}
    
    def _load_r2_mapping(self) -> Dict[str, str]:
        """Load R2 URL mapping"""
        r2_mapping_file = self.base_dir / "core_table" / "compendiums" / "tokens" / "r2_token_mapping.json"
        
        try:
            with open(r2_mapping_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return data.get('monsters', {})
        except Exception as e:
            logger.warning(f"R2 mapping not found, will use local paths: {e}")
            return {}
    
    def _build_normalized_index(self) -> Dict[str, str]:
        """Build index of normalized names to original names for faster lookup"""
        index = {}
        for monster_name in self.token_mapping.keys():
            normalized = self.normalize_name(monster_name)
            index[normalized] = monster_name
        return index
    
    @staticmethod
    def normalize_name(name: str) -> str:
        """
        Normalize monster name for matching
        - Remove parenthetical content
        - Remove special characters
        - Lowercase
        - Remove extra spaces
        """
        # Remove parenthetical content: "Faerie Dragon (Older)" -> "Faerie Dragon"
        normalized = re.sub(r'\s*\([^)]*\)', '', name)
        
        # Remove special characters but keep spaces
        normalized = re.sub(r'[^\w\s-]', '', normalized)
        
        # Lowercase and trim
        normalized = normalized.lower().strip()
        
        # Collapse multiple spaces
        normalized = re.sub(r'\s+', ' ', normalized)
        
        return normalized
    
    @staticmethod
    def similarity_score(name1: str, name2: str) -> float:
        """Calculate similarity score between two names (0-1)"""
        return SequenceMatcher(None, name1.lower(), name2.lower()).ratio()
    
    @lru_cache(maxsize=1024)
    def resolve_token_url(
        self, 
        monster_name: str, 
        monster_type: Optional[str] = None,
        use_r2: bool = True,
        presigned_expiry: int = 604800  # 7 days
    ) -> str:
        """
        Resolve token URL with intelligent fallback strategy
        
        Args:
            monster_name: Name of the monster
            monster_type: Creature type (for fallback)
            use_r2: Return R2 URL instead of local path
            presigned_expiry: Expiry time for presigned URLs (seconds)
            
        Returns:
            Token URL (R2 presigned URL or local path) or fallback SVG
        """
        
        # Priority 1: Exact name match
        if monster_name in self.token_mapping:
            return self._get_token_url(monster_name, use_r2, presigned_expiry)
        
        # Priority 2: Normalized name match
        normalized = self.normalize_name(monster_name)
        if normalized in self.normalized_index:
            original_name = self.normalized_index[normalized]
            logger.debug(f"Normalized match: '{monster_name}' -> '{original_name}'")
            return self._get_token_url(original_name, use_r2, presigned_expiry)
        
        # Priority 3: Fuzzy name match
        fuzzy_match = self._fuzzy_lookup(monster_name)
        if fuzzy_match:
            logger.debug(f"Fuzzy match: '{monster_name}' -> '{fuzzy_match}'")
            return self._get_token_url(fuzzy_match, use_r2, presigned_expiry)
        
        # Priority 4: Type-based fallback
        if monster_type:
            type_token = self._get_type_fallback(monster_type, use_r2, presigned_expiry)
            if type_token:
                logger.debug(f"Type fallback: '{monster_name}' ({monster_type})")
                return type_token
        
        # Priority 5: Generic fallback SVG
        logger.debug(f"No token found for '{monster_name}', using generic fallback")
        return self._get_generic_fallback()
    
    def _get_token_url(self, monster_name: str, use_r2: bool, expiry: int) -> str:
        """Get token URL for a monster"""
        
        if use_r2:
            # Query Asset database for content-addressed R2 key
            asset_info = self.get_asset_by_monster_name(monster_name)
            
            if asset_info and asset_info.get('r2_key'):
                r2_key = asset_info['r2_key']
                
                # Generate presigned URL if R2 manager available
                if self.r2_manager:
                    presigned_url = self.r2_manager.get_presigned_url(r2_key, expiration=expiry)
                    if presigned_url:
                        logger.debug(f"Resolved R2 token for '{monster_name}': {r2_key}")
                        return presigned_url
                    logger.warning(f"Failed to generate presigned URL for {r2_key}")
                
                # Fallback to R2 API endpoint
                return f"/api/tokens/{r2_key}"
            else:
                logger.debug(f"No R2 asset found for '{monster_name}', checking old r2_mapping")
                
                # Fallback to old r2_mapping (for backward compatibility during migration)
                if monster_name in self.r2_mapping:
                    r2_key = self.r2_mapping[monster_name]
                    if self.r2_manager:
                        presigned_url = self.r2_manager.get_presigned_url(r2_key, expiration=expiry)
                        if presigned_url:
                            return presigned_url
                    return f"/api/tokens/{r2_key}"
        
        # Use local path
        local_path = self.token_mapping.get(monster_name, '')
        if local_path:
            # Convert to API endpoint
            filename = Path(local_path).name
            return f"/api/tokens/local/{filename}"
        
        return self._get_generic_fallback()
    
    def _fuzzy_lookup(self, monster_name: str, threshold: float = 0.85) -> Optional[str]:
        """
        Find best fuzzy match for monster name
        
        Args:
            monster_name: Monster name to search for
            threshold: Minimum similarity score (0-1)
            
        Returns:
            Best matching monster name or None
        """
        normalized_search = self.normalize_name(monster_name)
        best_match = None
        best_score = threshold
        
        for normalized_name, original_name in self.normalized_index.items():
            score = self.similarity_score(normalized_search, normalized_name)
            if score > best_score:
                best_score = score
                best_match = original_name
        
        return best_match
    
    def _get_type_fallback(self, creature_type: str, use_r2: bool, expiry: int) -> Optional[str]:
        """
        Get type-based fallback token (SVG format)
        
        SVG tokens are stored in R2 at: image/svg+xml/YYYYMMDD_HHMMSS_hash_{type}.svg
        Local fallback: tokens/defaults/{type}.svg
        """
        creature_type_lower = creature_type.lower()
        
        if creature_type_lower not in self.CREATURE_TYPES:
            return None
        
        # Check if type default exists locally or in R2
        # We'll always use the API endpoint which will check R2 first, then local
        type_default_path = self.base_dir / "core_table" / "compendiums" / "tokens" / "defaults" / f"{creature_type_lower}.svg"
        
        # If local file exists, return API endpoint
        if type_default_path.exists():
            logger.debug(f"Type default found for '{creature_type}': {type_default_path.name}")
            return f"/api/tokens/defaults/{creature_type_lower}"
        
        # If R2 manager is configured, assume R2 has the defaults
        if self.r2_manager:
            logger.debug(f"Using R2 type default for '{creature_type}'")
            return f"/api/tokens/defaults/{creature_type_lower}"
        
        return None
    
    def _get_generic_fallback(self) -> str:
        """Get generic fallback SVG data URL"""
        # Gray circle with "?" - matches current implementation
        svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
            <circle cx="32" cy="32" r="30" fill="#666" stroke="#333" stroke-width="2"/>
            <text x="32" y="42" font-size="32" fill="#fff" text-anchor="middle" font-family="Arial">?</text>
        </svg>'''
        
        # Convert to data URL
        import base64
        svg_b64 = base64.b64encode(svg.encode('utf-8')).decode('utf-8')
        return f"data:image/svg+xml;base64,{svg_b64}"
    
    def get_token_info(self, monster_name: str, monster_type: Optional[str] = None) -> Dict:
        """
        Get detailed token information for a monster
        
        Args:
            monster_name: Name of the monster
            monster_type: Creature type for fallback (optional)
        
        Returns:
            Dictionary with token info including source, path, match type, and asset ID
        """
        info = {
            'monster_name': monster_name,
            'has_token': False,
            'match_type': 'none',
            'source': 'fallback',
            'local_path': None,
            'r2_key': None,
            'asset_id': None,
            'asset_xxhash': None
        }
        
        # Exact match
        if monster_name in self.token_mapping:
            info['has_token'] = True
            info['match_type'] = 'exact'
            info['source'] = 'compendium'
            info['local_path'] = self.token_mapping[monster_name]
            
            # Fetch asset info from database by monster name
            asset_info = self.get_asset_by_monster_name(monster_name)
            if asset_info:
                info['r2_key'] = asset_info.get('r2_key')
                info['asset_id'] = asset_info.get('asset_id')
                info['asset_xxhash'] = asset_info.get('asset_xxhash')
            else:
                # Fallback to old r2_mapping for backward compatibility
                info['r2_key'] = self.r2_mapping.get(monster_name)
            
            return info
        
        # Normalized match
        normalized = self.normalize_name(monster_name)
        if normalized in self.normalized_index:
            original_name = self.normalized_index[normalized]
            info['has_token'] = True
            info['match_type'] = 'normalized'
            info['source'] = 'compendium'
            info['matched_name'] = original_name
            info['local_path'] = self.token_mapping[original_name]
            
            # Fetch asset info from database by monster name
            asset_info = self.get_asset_by_monster_name(original_name)
            if asset_info:
                info['r2_key'] = asset_info.get('r2_key')
                info['asset_id'] = asset_info.get('asset_id')
                info['asset_xxhash'] = asset_info.get('asset_xxhash')
            else:
                # Fallback to old r2_mapping
                info['r2_key'] = self.r2_mapping.get(original_name)
            
            return info
        
        # Fuzzy match
        fuzzy_match = self._fuzzy_lookup(monster_name, threshold=0.85)
        if fuzzy_match:
            info['has_token'] = True
            info['match_type'] = 'fuzzy'
            info['source'] = 'compendium'
            info['matched_name'] = fuzzy_match
            info['local_path'] = self.token_mapping[fuzzy_match]
            
            # Fetch asset info from database by monster name
            asset_info = self.get_asset_by_monster_name(fuzzy_match)
            if asset_info:
                info['r2_key'] = asset_info.get('r2_key')
                info['asset_id'] = asset_info.get('asset_id')
                info['asset_xxhash'] = asset_info.get('asset_xxhash')
            else:
                # Fallback to old r2_mapping
                info['r2_key'] = self.r2_mapping.get(fuzzy_match)
            
            return info
        
        # No exact match - use type-based fallback
        if monster_type:
            creature_type_lower = monster_type.lower()
            info['match_type'] = 'type_fallback'
            info['source'] = 'fallback_type'
            info['has_token'] = True  # Mark as having token (fallback SVG)
            
            # Query database for actual fallback asset
            fallback_asset_name = f'FALLBACK_{creature_type_lower}.svg'
            db = SessionLocal()
            try:
                fallback_asset = db.query(Asset).filter(
                    Asset.asset_name == fallback_asset_name
                ).first()
                
                if fallback_asset:
                    info['asset_id'] = fallback_asset.r2_asset_id
                    info['asset_xxhash'] = fallback_asset.xxhash
                    info['r2_key'] = fallback_asset.r2_key
                else:
                    # Fallback doesn't exist in database, use synthetic ID
                    info['asset_id'] = f'fallback-{creature_type_lower}'
                    info['asset_xxhash'] = f'fallback-{creature_type_lower}'
            except Exception as e:
                logger.error(f"Error querying fallback asset for {creature_type_lower}: {e}")
                # Fallback to synthetic ID on error
                info['asset_id'] = f'fallback-{creature_type_lower}'
                info['asset_xxhash'] = f'fallback-{creature_type_lower}'
            finally:
                db.close()
        
        return info
    
    def _get_asset_info_from_db(self, r2_key: str) -> Optional[Dict]:
        """Fetch asset information from database by R2 key"""
        try:
            db = SessionLocal()
            try:
                asset = db.query(Asset).filter(Asset.r2_key == r2_key).first()
                if asset:
                    return {
                        'asset_id': asset.r2_asset_id,
                        'asset_xxhash': asset.xxhash,
                        'filename': asset.asset_name,
                        'content_type': asset.content_type,
                        'file_size': asset.file_size,
                        'r2_key': asset.r2_key
                    }
                return None
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Failed to fetch asset info for {r2_key}: {e}")
            return None
    
    def get_asset_by_monster_name(self, monster_name: str) -> Optional[Dict]:
        """
        Fetch asset from database using asset_name mapping.
        
        Assets are stored with naming convention:
        - MM_{MonsterName}.webp (Monster Manual)
        - TTP_{MonsterName}.webp (Third Party)
        - {MonsterName}.webp (Generic)
        
        Args:
            monster_name: Exact monster name (e.g., "Adult Red Dragon")
            
        Returns:
            Asset dict with r2_key, asset_id, etc. or None if not found
        """
        try:
            db = SessionLocal()
            try:
                # Try exact asset_name matches (most common patterns)
                search_patterns = [
                    f"MM_{monster_name}.webp",
                    f"TTP_{monster_name}.webp",
                    f"{monster_name}.webp",
                ]
                
                for pattern in search_patterns:
                    asset = db.query(Asset).filter(Asset.asset_name == pattern).first()
                    if asset:
                        logger.info(f"✅ Asset found: {monster_name} -> {asset.r2_key}")
                        return {
                            'asset_id': asset.r2_asset_id,
                            'asset_xxhash': asset.xxhash,
                            'filename': asset.asset_name,
                            'content_type': asset.content_type,
                            'file_size': asset.file_size,
                            'r2_key': asset.r2_key
                        }
                
                logger.warning(f"❌ No asset found for monster: {monster_name}")
                return None
                
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Database error fetching asset for '{monster_name}': {e}")
            return None
    
    def batch_resolve(self, monster_names: List[str], monster_types: Optional[List[str]] = None) -> Dict[str, str]:
        """
        Batch resolve token URLs for multiple monsters
        
        Args:
            monster_names: List of monster names
            monster_types: Optional list of monster types (same order)
            
        Returns:
            Dictionary mapping monster names to token URLs
        """
        results = {}
        
        for idx, monster_name in enumerate(monster_names):
            monster_type = monster_types[idx] if monster_types and idx < len(monster_types) else None
            results[monster_name] = self.resolve_token_url(monster_name, monster_type)
        
        return results


# Singleton instance
_token_service = None

def get_token_service(r2_manager=None) -> TokenResolutionService:
    """Get or create singleton token service instance"""
    global _token_service
    if _token_service is None:
        _token_service = TokenResolutionService(r2_manager)
    return _token_service
