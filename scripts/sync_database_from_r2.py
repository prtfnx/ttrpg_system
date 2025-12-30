"""
Sync Database from R2 Storage
Updates Asset database to match all tokens currently in R2
"""
import sys
from pathlib import Path
from typing import Dict, List

sys.path.insert(0, str(Path(__file__).parent.parent))

from storage.r2_manager import R2AssetManager
from server_host.database.database import SessionLocal
from server_host.database.models import Asset
from logger import setup_logger
import settings

logger = setup_logger(__name__)


class DatabaseSyncer:
    def __init__(self):
        self.r2_manager = R2AssetManager()
        self.registered = 0
        self.updated = 0
        self.skipped = 0
    
    def _list_r2_tokens(self) -> List[Dict]:
        """List all tokens in R2 with metadata"""
        logger.info("Listing R2 tokens...")
        tokens = []
        
        paginator = self.r2_manager.s3_client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=settings.R2_BUCKET_NAME):
            for obj in page.get('Contents', []):
                r2_key = obj['Key']
                
                if not (r2_key.endswith('.webp') or r2_key.endswith('.svg')):
                    continue
                
                try:
                    head = self.r2_manager.s3_client.head_object(
                        Bucket=settings.R2_BUCKET_NAME,
                        Key=r2_key
                    )
                    
                    metadata = head.get('Metadata', {})
                    tokens.append({
                        'r2_key': r2_key,
                        'size': obj['Size'],
                        'content_type': head.get('ContentType', 'application/octet-stream'),
                        'xxhash': metadata.get('xxhash', ''),
                        'original_filename': metadata.get('original-filename', Path(r2_key).name)
                    })
                except Exception as e:
                    logger.warning(f"Failed to get metadata for {r2_key}: {e}")
        
        logger.info(f"Found {len(tokens)} tokens in R2")
        return tokens
    
    def _extract_asset_name(self, r2_key: str, original_filename: str) -> str:
        """Extract asset name from R2 key or filename"""
        if 'fallback-tokens' in r2_key:
            creature_type = Path(original_filename).stem
            return f"FALLBACK_{creature_type}.svg"
        
        name = original_filename
        for prefix in ['MM_', 'TTP_', 'VGM_', 'MTF_']:
            if name.startswith(prefix):
                name = name[len(prefix):]
        return name
    
    def sync_all(self):
        """Sync all R2 tokens to database"""
        logger.info("="*70)
        logger.info("Database Sync from R2")
        logger.info("="*70)
        
        r2_tokens = self._list_r2_tokens()
        db = SessionLocal()
        
        try:
            for token in r2_tokens:
                r2_key = token['r2_key']
                xxhash_val = token['xxhash']
                
                if not xxhash_val:
                    logger.warning(f"Skipping {r2_key}: no xxhash in metadata")
                    self.skipped += 1
                    continue
                
                asset_id = xxhash_val[:16]
                existing = db.query(Asset).filter(Asset.r2_asset_id == asset_id).first()
                
                if existing:
                    if existing.r2_key != r2_key:
                        existing.r2_key = r2_key
                        self.updated += 1
                        logger.info(f"⟳ Updated: {existing.asset_name}")
                    else:
                        self.skipped += 1
                        logger.debug(f"⊘ Exists: {existing.asset_name}")
                else:
                    asset_name = self._extract_asset_name(r2_key, token['original_filename'])
                    
                    new_asset = Asset(
                        r2_asset_id=asset_id,
                        r2_key=r2_key,
                        asset_name=asset_name,
                        content_type=token['content_type'],
                        xxhash=xxhash_val,
                        file_size=token['size'],
                        original_filename=token['original_filename']
                    )
                    db.add(new_asset)
                    self.registered += 1
                    logger.info(f"✓ Registered: {asset_name} -> {asset_id}")
            
            db.commit()
            
        except Exception as e:
            logger.error(f"Sync failed: {e}")
            db.rollback()
            raise
        finally:
            db.close()
        
        logger.info("")
        logger.info("="*70)
        logger.info(f"Registered: {self.registered} | Updated: {self.updated} | Skipped: {self.skipped}")
        logger.info("="*70)


def main():
    syncer = DatabaseSyncer()
    syncer.sync_all()


if __name__ == "__main__":
    main()
