"""
Minimal Cloudflare R2 Asset Manager for TTRPG System.
Production-ready boto3-based implementation with JWT authentication.
"""
import os
import logging
import hashlib
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from dataclasses import dataclass

import boto3
import jwt
from botocore.exceptions import ClientError, NoCredentialsError
import settings

logger = logging.getLogger(__name__)

@dataclass
class UploadResult:
    """Result of file upload operation"""
    success: bool
    url: Optional[str] = None
    error: Optional[str] = None
    file_size: int = 0

@dataclass
class DownloadResult:
    """Result of file download operation"""
    success: bool
    local_path: Optional[str] = None
    error: Optional[str] = None
    file_size: int = 0


class R2AssetManager:
    """
    Minimal R2 storage manager using boto3.
    Supports JWT authentication, upload, get link, and download.
    """
    def __init__(self):
        self._s3_client = None
        self._jwt_secret = os.getenv('JWT_SECRET_KEY', settings.JWT_SECRET_KEY)
    
    @property
    def s3_client(self):
        """Lazy-loaded S3 client for R2"""
        if self._s3_client is None:
            if not self.is_r2_configured():
                raise ValueError("R2 configuration missing or invalid")
            
            self._s3_client = boto3.client(
                's3',
                endpoint_url=self.config.r2_endpoint,
                aws_access_key_id=self.config.r2_access_key,
                aws_secret_access_key=self.config.r2_secret_key,
                region_name='auto'  # R2 uses 'auto' region
            )
        return self._s3_client
      def is_r2_configured(self) -> bool:
        """Check if R2 is properly configured"""
        if not settings.R2_ENABLED:
            return False
        
        return all([settings.R2_ENDPOINT, settings.R2_ACCESS_KEY, 
                   settings.R2_SECRET_KEY, settings.R2_BUCKET_NAME])
    
    def generate_file_key(self, filename: str, file_type: str = "other") -> str:
        """Generate unique key for file in R2"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_hash = hashlib.md5(filename.encode()).hexdigest()[:8]
        name, ext = os.path.splitext(filename)
        return f"{file_type}/{timestamp}_{file_hash}_{name}{ext}"
    
    def generate_jwt_token(self, user_id: str, permissions: Optional[List[str]] = None) -> str:
        """Generate JWT token for authentication (production-ready)"""
        permissions = permissions or ['read', 'write']
        payload = {
            'user_id': user_id,
            'permissions': permissions,
            'exp': datetime.utcnow() + timedelta(hours=24),
            'iat': datetime.utcnow()
        }
        return jwt.encode(payload, self._jwt_secret, algorithm='HS256')
    
    def verify_jwt_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify JWT token and return payload"""
        try:
            payload = jwt.decode(token, self._jwt_secret, algorithms=['HS256'])
            return payload
        except jwt.ExpiredSignatureError:
            logger.error("JWT token has expired")
            return None
        except jwt.InvalidTokenError:
            logger.error("Invalid JWT token")
            return None
    
    def upload_file(self, file_path: str, file_type: Optional[str] = None, 
                   jwt_token: Optional[str] = None) -> UploadResult:
        """Upload file to R2 storage"""
        # JWT authentication check (if token provided)
        if jwt_token:
            payload = self.verify_jwt_token(jwt_token)
            if not payload or 'write' not in payload.get('permissions', []):
                return UploadResult(success=False, error="Unauthorized: Invalid or insufficient permissions")
        
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
                self.config.r2_bucket_name, 
                file_key,
                ExtraArgs={'ACL': 'public-read'} if not jwt_token else {}
            )
            
            # Generate URL
            if self.config.r2_public_url:
                url = f"{self.config.r2_public_url}/{file_key}"
            else:
                url = f"{self.config.r2_endpoint}/{self.config.r2_bucket_name}/{file_key}"
            
            logger.info(f"Successfully uploaded: {filename} -> {url}")
            return UploadResult(success=True, url=url, file_size=file_size)
            
        except (ClientError, NoCredentialsError) as e:
            error_msg = f"Upload failed: {str(e)}"
            logger.error(error_msg)
            return UploadResult(success=False, error=error_msg, file_size=file_size)
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(error_msg)
            return UploadResult(success=False, error=error_msg, file_size=file_size)
    
    def get_link(self, file_key: str, expiration: int = 3600, 
                jwt_token: Optional[str] = None) -> Optional[str]:
        """Generate presigned URL for file access"""
        # JWT authentication check (if token provided)
        if jwt_token:
            payload = self.verify_jwt_token(jwt_token)
            if not payload or 'read' not in payload.get('permissions', []):
                logger.error("Unauthorized: Invalid or insufficient permissions")
                return None
        
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.config.r2_bucket_name, 'Key': file_key},
                ExpiresIn=expiration
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return None
    
    def download_file(self, file_key: str, local_path: str, 
                     jwt_token: Optional[str] = None) -> DownloadResult:
        """Download file from R2 to local path"""
        # JWT authentication check (if token provided)
        if jwt_token:
            payload = self.verify_jwt_token(jwt_token)
            if not payload or 'read' not in payload.get('permissions', []):
                return DownloadResult(success=False, error="Unauthorized: Invalid or insufficient permissions")
        
        try:
            # Ensure local directory exists
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            # Download from R2
            self.s3_client.download_file(
                self.config.r2_bucket_name, 
                file_key, 
                local_path
            )
            
            file_size = os.path.getsize(local_path)
            logger.info(f"Successfully downloaded: {file_key} -> {local_path}")
            return DownloadResult(success=True, local_path=local_path, file_size=file_size)
            
        except ClientError as e:
            error_msg = f"Download failed: {str(e)}"
            logger.error(error_msg)
            return DownloadResult(success=False, error=error_msg)
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(error_msg)
            return DownloadResult(success=False, error=error_msg)
    
    # Minimal method aliases for existing code that hasn't been updated yet
    def _check_r2_config(self) -> bool:
        """Alias for is_r2_configured"""
        return self.is_r2_configured()
    
    def _generate_file_key(self, filename: str, file_type: str = "other") -> str:
        """Alias for generate_file_key"""
        return self.generate_file_key(filename, file_type)
    
    def _get_file_url(self, file_key: str) -> str:
        """Generate public URL for file key"""
        if self.config.r2_public_url:
            return f"{self.config.r2_public_url}/{file_key}"
        else:
            return f"{self.config.r2_endpoint}/{self.config.r2_bucket_name}/{file_key}"
    
    def _generate_auth_token(self) -> str:
        """Generate JWT token for system use"""
        return self.generate_jwt_token("system", ["read", "write"])
    
    def get_stats(self) -> Dict[str, Dict[str, int]]:
        """Get basic stats (minimal implementation)"""
        return {
            'uploads': {"count": 0, "bytes": 0, "errors": 0},
            'downloads': {"count": 0, "bytes": 0, "errors": 0}
        }
    
    def add_pending_upload(self, file_path: str, file_type: str):
        """Stub for pending uploads (minimal implementation just logs)"""
        logger.info(f"Pending upload (logged only): {file_path} ({file_type})")
        # In minimal implementation, we don't queue uploads - just log