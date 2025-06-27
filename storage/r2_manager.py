"""
Cloudflare R2 Asset Manager for TTRPG System.
Production-ready boto3-based implementation following Cloudflare best practices.
"""
import os
from logger import setup_logger
import hashlib
import xxhash
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime
from dataclasses import dataclass

import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from botocore.config import Config
import settings
import mimetypes
logger = setup_logger(__name__)

@dataclass
class UploadResult:
    """Result of file upload operation"""
    success: bool
    url: Optional[str] = None
    error: Optional[str] = None
    file_size: int = 0
    file_key: Optional[str] = None
    xxhash: Optional[str] = None  # Add xxHash

@dataclass
class DownloadResult:
    """Result of file download operation"""
    success: bool
    local_path: Optional[str] = None
    error: Optional[str] = None
    file_size: int = 0
    xxhash: Optional[str] = None  # Add xxHash
    hash_verified: bool = False  # Hash verification status


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
    
    def calculate_xxhash(self, file_path: str) -> str:
        """Calculate xxHash for a file (fast hash for local operations)"""
        try:
            hasher = xxhash.xxh64()  # xxh64 is faster and has good distribution
            
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(65536), b""):  # 64KB chunks
                    hasher.update(chunk)
            
            return hasher.hexdigest()
        except Exception as e:
            logger.error(f"Error calculating xxHash for {file_path}: {e}")
            return ""
    
    def upload_file(self, file_path: str, file_type: Optional[str] = None) -> UploadResult:
        """Upload file to R2 storage with xxHash metadata"""
        if not os.path.exists(file_path):
            return UploadResult(success=False, error=f"File not found: {file_path}")
        
        file_size = 0
        file_xxhash = ""
        try:
            filename = os.path.basename(file_path)
            file_key = self.generate_file_key(filename, file_type or "other")
            file_size = os.path.getsize(file_path)
            
            # Calculate xxHash before upload
            file_xxhash = self.calculate_xxhash(file_path)
            logger.info(f"Calculated xxHash for {filename}: {file_xxhash}")
            
            # Upload to R2 with metadata including xxHash
            extra_args = {
                'Metadata': {
                    'xxhash': file_xxhash,
                    'original-filename': filename,
                    'upload-timestamp': str(int(datetime.now().timestamp()))
                }
            }
            
            # Set content type if we can determine it
            
            content_type, _ = mimetypes.guess_type(filename)
            if content_type:
                extra_args['ContentType'] = content_type
            
            self.s3_client.upload_file(
                file_path, 
                settings.R2_BUCKET_NAME, 
                file_key,
                ExtraArgs=extra_args
            )
            
            # Generate URL
            url = self._build_public_url(file_key)
            
            # Update stats
            self._stats['uploads']['count'] += 1
            self._stats['uploads']['bytes'] += file_size
            
            logger.info(f"Successfully uploaded: {filename} -> {url} (xxHash: {file_xxhash})")
            return UploadResult(
                success=True, 
                url=url, 
                file_size=file_size, 
                file_key=file_key,
                xxhash=file_xxhash
            )
            
        except (ClientError, NoCredentialsError) as e:
            error_msg = f"Upload failed: {str(e)}"
            logger.error(error_msg)
            self._stats['uploads']['errors'] += 1
            return UploadResult(success=False, error=error_msg, file_size=file_size, xxhash=file_xxhash)
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(error_msg)
            self._stats['uploads']['errors'] += 1
            return UploadResult(success=False, error=error_msg, file_size=file_size, xxhash=file_xxhash)
    
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
    
    def generate_presigned_url(self, file_key: str, method: str = "GET", expiration: int = 3600) -> Optional[str]:
        """
        Generate presigned URL for R2 object following Cloudflare best practices.
        
        Args:
            file_key: Object key in R2 bucket
            method: HTTP method (GET, PUT, DELETE)
            expiration: URL expiration in seconds (max 7 days)
        
        Returns:
            Presigned URL string or None if failed
        """
        try:
            # Validate expiration (Cloudflare R2 limit: 7 days)
            max_expiration = 7 * 24 * 3600  # 7 days in seconds
            if expiration > max_expiration:
                logger.warning(f"Expiration {expiration}s exceeds R2 limit, using {max_expiration}s")
                expiration = max_expiration
            
            # Generate presigned URL using boto3
            if method.upper() == "GET":
                url = self.s3_client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': settings.R2_BUCKET_NAME,
                        'Key': file_key
                    },
                    ExpiresIn=expiration
                )
            elif method.upper() == "PUT":
                url = self.s3_client.generate_presigned_url(
                    'put_object',
                    Params={
                        'Bucket': settings.R2_BUCKET_NAME,
                        'Key': file_key
                    },
                    ExpiresIn=expiration
                )
            elif method.upper() == "DELETE":
                url = self.s3_client.generate_presigned_url(
                    'delete_object',
                    Params={
                        'Bucket': settings.R2_BUCKET_NAME,
                        'Key': file_key
                    },
                    ExpiresIn=expiration
                )
            else:
                logger.error(f"Unsupported method for presigned URL: {method}")
                return None
            
            logger.info(f"Generated presigned {method} URL for {file_key} (expires in {expiration}s)")
            return url
            
        except Exception as e:
            logger.error(f"Failed to generate presigned URL for {file_key}: {e}")
            return None
    
    def object_exists(self, file_key: str) -> bool:
        """
        Check if an object exists in R2 bucket.
        
        Args:
            file_key: Object key to check
            
        Returns:
            True if object exists, False otherwise
        """
        try:
            self.s3_client.head_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=file_key
            )
            return True
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == '404':
                return False
            else:
                logger.error(f"Error checking object existence for {file_key}: {e}")
                return False
        except Exception as e:
            logger.error(f"Unexpected error checking object existence for {file_key}: {e}")
            return False
    
    def download_file_with_verification(self, file_key: str, local_path: str) -> DownloadResult:
        """Download file from R2 with hash verification"""
        try:
            # Ensure local directory exists
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            # Get object metadata first to retrieve stored hash
            head_response = self.s3_client.head_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=file_key
            )
            
            stored_xxhash = head_response.get('Metadata', {}).get('xxhash')
            
            # Download from R2
            self.s3_client.download_file(
                settings.R2_BUCKET_NAME, 
                file_key, 
                local_path
            )
            
            file_size = os.path.getsize(local_path)
            
            # Calculate local file hash
            local_xxhash = self.calculate_xxhash(local_path)
            
            # Verify hash if stored hash exists
            hash_verified = False
            if stored_xxhash:
                hash_verified = (local_xxhash == stored_xxhash)
                if hash_verified:
                    logger.info(f"Hash verification successful for {file_key}")
                else:
                    logger.warning(f"Hash verification failed for {file_key}: stored={stored_xxhash}, local={local_xxhash}")
            else:
                logger.warning(f"No stored hash found for {file_key}")
            
            # Update stats
            self._stats['downloads']['count'] += 1
            self._stats['downloads']['bytes'] += file_size
            
            logger.info(f"Successfully downloaded: {file_key} -> {local_path}")
            return DownloadResult(
                success=True, 
                local_path=local_path, 
                file_size=file_size,
                xxhash=local_xxhash,
                hash_verified=hash_verified
            )
            
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
    
    def get_object_hash(self, file_key: str) -> Optional[str]:
        """Get stored xxHash for an object"""
        try:
            response = self.s3_client.head_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=file_key
            )
            return response.get('Metadata', {}).get('xxhash')
        except Exception as e:
            logger.error(f"Error getting hash for {file_key}: {e}")
            return None
    
    def generate_presigned_upload_url(self, file_key: str, xxhash: str, expiration: int = 3600) -> Optional[str]:
        """Generate presigned URL for upload with required xxHash metadata"""
        try:
            # Validate expiration (Cloudflare R2 limit: 7 days)
            max_expiration = 7 * 24 * 3600  # 7 days in seconds
            if expiration > max_expiration:
                logger.warning(f"Expiration {expiration}s exceeds R2 limit, using {max_expiration}s")
                expiration = max_expiration
            
            # Generate presigned URL for PUT with required metadata
            url = self.s3_client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': settings.R2_BUCKET_NAME,
                    'Key': file_key,
                    'Metadata': {
                        'xxhash': xxhash,
                        'upload-timestamp': str(int(datetime.now().timestamp()))
                    }
                },
                ExpiresIn=expiration
            )
            
            logger.info(f"Generated presigned upload URL for {file_key} with xxHash: {xxhash}")
            return url
            
        except Exception as e:
            logger.error(f"Failed to generate presigned upload URL for {file_key}: {e}")
            return None
