"""
Cloudflare R2 Asset Manager for TTRPG System.
Production-ready boto3-based implementation following Cloudflare best practices.
"""
import os
import logging
import hashlib
from typing import Optional, Dict, Any, List
from datetime import datetime
from dataclasses import dataclass

import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from botocore.config import Config
import settings

logger = logging.getLogger(__name__)

@dataclass
class UploadResult:
    """Result of file upload operation"""
    success: bool
    url: Optional[str] = None
    error: Optional[str] = None
    file_size: int = 0
    file_key: Optional[str] = None

@dataclass
class DownloadResult:
    """Result of file download operation"""
    success: bool
    local_path: Optional[str] = None
    error: Optional[str] = None
    file_size: int = 0


class R2AssetManager:
    """
    Cloudflare R2 storage manager using boto3.
    Follows Cloudflare documentation best practices.
    """
    def __init__(self):
        self._s3_client = None
        self._stats = {
            'uploads': {"count": 0, "bytes": 0, "errors": 0},
            'downloads': {"count": 0, "bytes": 0, "errors": 0}
        }
    
    @property
    def s3_client(self):
        """Lazy-loaded S3 client for R2 following Cloudflare best practices"""
        if self._s3_client is None:
            if not self.is_r2_configured():
                raise ValueError("R2 configuration missing or invalid")
            
            # Following Cloudflare R2 boto3 documentation
            # https://developers.cloudflare.com/r2/examples/aws/boto3/
            endpoint_url = self._build_endpoint_url()
            
            # Config for boto3 1.36.0+ compatibility
            config = Config(
                region_name='auto',
                s3={'addressing_style': 'path'},
                signature_version='s3v4'
            )
            
            self._s3_client = boto3.client(
                's3',
                endpoint_url=endpoint_url,
                aws_access_key_id=settings.R2_ACCESS_KEY,
                aws_secret_access_key=settings.R2_SECRET_KEY,
                config=config
            )
        return self._s3_client
    
    def _build_endpoint_url(self) -> str:
        """Build the R2 endpoint URL"""
        if settings.R2_ENDPOINT:
            # If a full endpoint is provided, use it
            return settings.R2_ENDPOINT
        
        # Try to get account ID from environment or settings
        account_id = os.getenv('R2_ACCOUNT_ID')
        if not account_id and hasattr(settings, 'R2_ACCOUNT_ID'):
            account_id = getattr(settings, 'R2_ACCOUNT_ID', None)
        
        if not account_id:
            raise ValueError("Either R2_ENDPOINT or R2_ACCOUNT_ID must be configured")
        
        return f"https://{account_id}.r2.cloudflarestorage.com"
    
    def is_r2_configured(self) -> bool:
        """Check if R2 is properly configured"""
        if not settings.R2_ENABLED:
            return False
        
        required_settings = [
            settings.R2_ACCESS_KEY, 
            settings.R2_SECRET_KEY, 
            settings.R2_BUCKET_NAME
        ]
        
        # Need either R2_ENDPOINT or R2_ACCOUNT_ID
        has_endpoint_config = bool(
            settings.R2_ENDPOINT or 
            os.getenv('R2_ACCOUNT_ID') or
            hasattr(settings, 'R2_ACCOUNT_ID')
        )
        
        return all(required_settings) and has_endpoint_config
    
    def generate_file_key(self, filename: str, file_type: str = "other") -> str:
        """Generate unique key for file in R2"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_hash = hashlib.md5(filename.encode()).hexdigest()[:8]
        name, ext = os.path.splitext(filename)
        clean_name = "".join(c for c in name if c.isalnum() or c in '-_')[:50]
        return f"{file_type}/{timestamp}_{file_hash}_{clean_name}{ext}"
    
    def upload_file(self, file_path: str, file_type: Optional[str] = None) -> UploadResult:
        """Upload file to R2 storage"""
        if not os.path.exists(file_path):
            return UploadResult(success=False, error=f"File not found: {file_path}")
        
        file_size = 0
        try:
            filename = os.path.basename(file_path)
            file_key = self.generate_file_key(filename, file_type or "other")
            file_size = os.path.getsize(file_path)
            
            # Upload to R2
            self.s3_client.upload_file(
                file_path, 
                settings.R2_BUCKET_NAME, 
                file_key
            )
            
            # Generate URL
            url = self._build_public_url(file_key)
            
            # Update stats
            self._stats['uploads']['count'] += 1
            self._stats['uploads']['bytes'] += file_size
            
            logger.info(f"Successfully uploaded: {filename} -> {url}")
            return UploadResult(success=True, url=url, file_size=file_size, file_key=file_key)
            
        except (ClientError, NoCredentialsError) as e:
            error_msg = f"Upload failed: {str(e)}"
            logger.error(error_msg)
            self._stats['uploads']['errors'] += 1
            return UploadResult(success=False, error=error_msg, file_size=file_size)
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(error_msg)
            self._stats['uploads']['errors'] += 1
            return UploadResult(success=False, error=error_msg, file_size=file_size)
    
    def _build_public_url(self, file_key: str) -> str:
        """Build public URL for a file key"""
        if settings.R2_PUBLIC_URL:
            return f"{settings.R2_PUBLIC_URL.rstrip('/')}/{file_key}"
        else:
            # Use the R2 endpoint for direct access
            endpoint = self._build_endpoint_url()
            return f"{endpoint}/{settings.R2_BUCKET_NAME}/{file_key}"
    
    def get_presigned_url(self, file_key: str, expiration: int = 3600) -> Optional[str]:
        """Generate presigned URL for file access"""
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': settings.R2_BUCKET_NAME, 'Key': file_key},
                ExpiresIn=expiration
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return None
    
    def download_file(self, file_key: str, local_path: str) -> DownloadResult:
        """Download file from R2 to local path"""
        try:
            # Ensure local directory exists
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            # Download from R2
            self.s3_client.download_file(
                settings.R2_BUCKET_NAME, 
                file_key, 
                local_path
            )
            
            file_size = os.path.getsize(local_path)
            
            # Update stats
            self._stats['downloads']['count'] += 1
            self._stats['downloads']['bytes'] += file_size
            
            logger.info(f"Successfully downloaded: {file_key} -> {local_path}")
            return DownloadResult(success=True, local_path=local_path, file_size=file_size)
            
        except ClientError as e:
            error_msg = f"Download failed: {str(e)}"
            logger.error(error_msg)
            self._stats['downloads']['errors'] += 1
            return DownloadResult(success=False, error=error_msg)
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(error_msg)
            self._stats['downloads']['errors'] += 1
            return DownloadResult(success=False, error=error_msg)
    
    def delete_file(self, file_key: str) -> bool:
        """Delete file from R2 storage"""
        try:
            self.s3_client.delete_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=file_key
            )
            logger.info(f"Successfully deleted: {file_key}")
            return True
        except ClientError as e:
            logger.error(f"Delete failed: {e}")
            return False
    
    def list_objects(self, prefix: str = "", max_keys: int = 1000) -> List[Dict[str, Any]]:
        """List objects in R2 bucket"""
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=settings.R2_BUCKET_NAME,
                Prefix=prefix,
                MaxKeys=max_keys
            )
            
            objects = []
            for obj in response.get('Contents', []):
                objects.append({
                    'key': obj['Key'],
                    'size': obj['Size'],
                    'last_modified': obj['LastModified'],
                    'url': self._build_public_url(obj['Key'])
                })
            
            return objects
        except ClientError as e:
            logger.error(f"List objects failed: {e}")
            return []
    
    def get_object_info(self, file_key: str) -> Optional[Dict[str, Any]]:
        """Get information about a specific object"""
        try:
            response = self.s3_client.head_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=file_key
            )
            
            return {
                'key': file_key,
                'size': response['ContentLength'],
                'last_modified': response['LastModified'],
                'content_type': response.get('ContentType', 'unknown'),
                'url': self._build_public_url(file_key)
            }
        except ClientError as e:
            logger.error(f"Get object info failed: {e}")
            return None
    
    def get_stats(self) -> Dict[str, Dict[str, int]]:
        """Get usage statistics"""
        return self._stats.copy()
    
    def reset_stats(self):
        """Reset usage statistics"""
        self._stats = {
            'uploads': {"count": 0, "bytes": 0, "errors": 0},
            'downloads': {"count": 0, "bytes": 0, "errors": 0}
        }
