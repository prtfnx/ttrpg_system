"""
Upload Monster Tokens to R2 and Register in Database
Uploads local token files to R2 storage with deduplication and database registration
"""
import sys
from pathlib import Path
from typing import Dict, Set
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, str(Path(__file__).parent.parent))

from storage.r2_manager import R2AssetManager
from server_host.database.database import SessionLocal
from server_host.database.models import Asset
from logger import setup_logger
import settings
import xxhash

logger = setup_logger(__name__)


class TokenUploader:
    def __init__(self):
        self.r2_manager = R2AssetManager()
        self.tokens_dir = Path(__file__).parent.parent / "core_table" / "compendiums" / "tokens" / "monster_tokens"
        self.uploaded = 0
        self.skipped = 0
        self.failed = 0
    
    def _calculate_xxhash(self, file_path: Path) -> str:
        hasher = xxhash.xxh64()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                hasher.update(chunk)
        return hasher.hexdigest()
    
    def _extract_monster_name(self, filename: str) -> str:
        """Extract monster name from filename (MM_Monster Name.webp -> Monster Name)"""
        name = filename.replace('.webp', '').replace('.png', '')
        for prefix in ['MM_', 'TTP_', 'VGM_', 'MTF_']:
            if name.startswith(prefix):
                return name[len(prefix):]
        return name
    
    def _get_existing_hashes(self) -> Set[str]:
        """Get all existing xxhashes from database"""
        db = SessionLocal()
        try:
            assets = db.query(Asset).filter(Asset.content_type == 'image/webp').all()
            return {a.xxhash for a in assets if a.xxhash}
        finally:
            db.close()
    
    def _upload_token(self, file_path: Path, existing_hashes: Set[str]) -> Dict:
        filename = file_path.name
        monster_name = self._extract_monster_name(filename)
        
        try:
            file_hash = self._calculate_xxhash(file_path)
            
            if file_hash in existing_hashes:
                return {'status': 'skipped', 'name': monster_name, 'reason': 'already_uploaded'}
            
            result = self.r2_manager.upload_file(
                str(file_path),
                file_type='image/webp',
                metadata={'monster_name': monster_name}
            )
            
            if not result.success:
                return {'status': 'failed', 'name': monster_name, 'error': result.error}
            
            db = SessionLocal()
            try:
                asset = Asset(
                    r2_asset_id=result.xxhash[:16],
                    r2_key=result.file_key,
                    asset_name=f"{monster_name}.webp",
                    content_type='image/webp',
                    xxhash=result.xxhash,
                    file_size=result.file_size,
                    original_filename=filename
                )
                db.add(asset)
                db.commit()
                
                return {
                    'status': 'success',
                    'name': monster_name,
                    'asset_id': asset.r2_asset_id,
                    'size': result.file_size
                }
            finally:
                db.close()
                
        except Exception as e:
            return {'status': 'failed', 'name': monster_name, 'error': str(e)}
    
    def upload_all(self, max_workers: int = 4):
        """Upload all tokens with parallel processing"""
        logger.info("="*70)
        logger.info("Token Upload to R2")
        logger.info("="*70)
        
        if not self.tokens_dir.exists():
            logger.error(f"Tokens directory not found: {self.tokens_dir}")
            return
        
        token_files = list(self.tokens_dir.glob("*.webp")) + list(self.tokens_dir.glob("*.png"))
        if not token_files:
            logger.error("No token files found")
            return
        
        logger.info(f"Found {len(token_files)} token files")
        existing_hashes = self._get_existing_hashes()
        logger.info(f"Database contains {len(existing_hashes)} existing tokens")
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(self._upload_token, f, existing_hashes): f for f in token_files}
            
            for future in as_completed(futures):
                result = future.result()
                
                if result['status'] == 'success':
                    self.uploaded += 1
                    logger.info(f"✓ {result['name']} -> {result['asset_id']}")
                elif result['status'] == 'skipped':
                    self.skipped += 1
                    logger.debug(f"⊘ {result['name']} (already exists)")
                else:
                    self.failed += 1
                    logger.error(f"✗ {result['name']}: {result.get('error', 'unknown')}")
        
        logger.info("")
        logger.info("="*70)
        logger.info(f"Uploaded: {self.uploaded} | Skipped: {self.skipped} | Failed: {self.failed}")
        logger.info("="*70)


def main():
    uploader = TokenUploader()
    uploader.upload_all(max_workers=4)


if __name__ == "__main__":
    main()

    # Exit with appropriate code
    if results['failed'] > 0:
        logger.warning(f"\nUpload completed with {results['failed']} failures")
        exit(1)
    else:
        logger.info("\nAll tokens uploaded successfully!")
        exit(0)


if __name__ == "__main__":
    main()
