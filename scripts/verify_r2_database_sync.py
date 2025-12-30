"""
Verify R2-Database Synchronization
Validates that database Asset entries match R2 storage state
"""
import sys
from pathlib import Path
from typing import Set, Dict, List

sys.path.insert(0, str(Path(__file__).parent.parent))

from storage.r2_manager import R2AssetManager
from server_host.database.database import SessionLocal
from server_host.database.models import Asset
from logger import setup_logger
import settings

logger = setup_logger(__name__)


class SyncVerifier:
    def __init__(self):
        self.r2_manager = R2AssetManager()
        self.issues = []
    
    def _get_r2_keys(self) -> Set[str]:
        """Get all R2 keys from storage"""
        logger.info("Scanning R2 storage...")
        keys = set()
        
        paginator = self.r2_manager.s3_client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=settings.R2_BUCKET_NAME):
            for obj in page.get('Contents', []):
                keys.add(obj['Key'])
        
        logger.info(f"Found {len(keys)} files in R2")
        return keys
    
    def _get_database_assets(self) -> Dict[str, Asset]:
        """Get all assets from database indexed by r2_key"""
        logger.info("Loading database assets...")
        db = SessionLocal()
        try:
            assets = db.query(Asset).all()
            logger.info(f"Found {len(assets)} assets in database")
            return {a.r2_key: a for a in assets}
        finally:
            db.close()
    
    def _verify_r2_file(self, r2_key: str, asset: Asset) -> List[str]:
        """Verify R2 file matches asset metadata"""
        errors = []
        
        try:
            head = self.r2_manager.s3_client.head_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=r2_key
            )
            
            metadata = head.get('Metadata', {})
            r2_xxhash = metadata.get('xxhash', '')
            
            if asset.xxhash and r2_xxhash and asset.xxhash != r2_xxhash:
                errors.append(f"xxhash mismatch: DB={asset.xxhash[:8]}... R2={r2_xxhash[:8]}...")
            
            if asset.file_size and abs(asset.file_size - head['ContentLength']) > 0:
                errors.append(f"size mismatch: DB={asset.file_size} R2={head['ContentLength']}")
                
        except Exception as e:
            errors.append(f"R2 error: {str(e)}")
        
        return errors
    
    def verify_all(self):
        """Run complete verification"""
        logger.info("="*70)
        logger.info("R2-Database Synchronization Verification")
        logger.info("="*70)
        
        r2_keys = self._get_r2_keys()
        db_assets = self._get_database_assets()
        
        logger.info("\n--- Checking Database Assets ---")
        missing_in_r2 = 0
        invalid_metadata = 0
        
        for r2_key, asset in db_assets.items():
            if r2_key not in r2_keys:
                self.issues.append(f"✗ DB asset points to missing R2 file: {asset.asset_name} -> {r2_key}")
                missing_in_r2 += 1
            else:
                errors = self._verify_r2_file(r2_key, asset)
                if errors:
                    self.issues.append(f"⚠ {asset.asset_name}: {', '.join(errors)}")
                    invalid_metadata += 1
        
        logger.info(f"Missing in R2: {missing_in_r2}")
        logger.info(f"Metadata mismatches: {invalid_metadata}")
        
        logger.info("\n--- Checking R2 Files ---")
        orphaned_r2 = []
        for key in r2_keys:
            if key.endswith(('.webp', '.svg')) and key not in db_assets:
                orphaned_r2.append(key)
        
        logger.info(f"Orphaned R2 files: {len(orphaned_r2)}")
        if orphaned_r2:
            for key in orphaned_r2[:10]:
                self.issues.append(f"⚠ Orphaned R2 file: {key}")
            if len(orphaned_r2) > 10:
                self.issues.append(f"... and {len(orphaned_r2) - 10} more")
        
        logger.info("\n" + "="*70)
        logger.info("Verification Summary")
        logger.info("="*70)
        logger.info(f"Database assets: {len(db_assets)}")
        logger.info(f"R2 files: {len(r2_keys)}")
        logger.info(f"Issues found: {len(self.issues)}")
        
        if self.issues:
            logger.info("\n--- Issues ---")
            for issue in self.issues[:20]:
                logger.warning(issue)
            if len(self.issues) > 20:
                logger.warning(f"... and {len(self.issues) - 20} more issues")
            logger.info("\n⚠ Synchronization issues detected")
        else:
            logger.info("\n✓ Database and R2 are in sync")
        
        logger.info("="*70)
        
        return len(self.issues) == 0


def main():
    verifier = SyncVerifier()
    is_synced = verifier.verify_all()
    sys.exit(0 if is_synced else 1)


if __name__ == "__main__":
    main()
