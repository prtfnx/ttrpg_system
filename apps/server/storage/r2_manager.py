"""
Cloudflare R2 Asset Manager for TTRPG System.
Production-ready boto3-based implementation following Cloudflare best practices.
"""
import logging
import os
from typing import Any, Dict, List, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from config import Settings

_settings = Settings()
logger = logging.getLogger(__name__)

class R2AssetManager:
    """
    Cloudflare R2 storage manager using boto3.
    Follows Cloudflare documentation best practices.
    """
    def __init__(self):
        self._s3_client = None

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
                aws_access_key_id=_settings.r2_access_key,
                aws_secret_access_key=_settings.r2_secret_key,
                config=config
            )
        return self._s3_client

    def _build_endpoint_url(self) -> str:
        """Build the R2 endpoint URL"""
        if _settings.r2_endpoint:
            # If a full endpoint is provided, use it
            return _settings.r2_endpoint

        # Try to get account ID from environment or settings
        account_id = os.getenv('R2_ACCOUNT_ID') or _settings.r2_account_id

        if not account_id:
            raise ValueError("Either R2_ENDPOINT or R2_ACCOUNT_ID must be configured")

        return f"https://{account_id}.r2.cloudflarestorage.com"

    def is_r2_configured(self) -> bool:
        """Check if R2 is properly configured"""
        if not _settings.r2_enabled:
            return False

        required_settings = [
            _settings.r2_access_key,
            _settings.r2_secret_key,
            _settings.r2_bucket_name
        ]

        has_endpoint_config = bool(
            _settings.r2_endpoint or
            os.getenv('R2_ACCOUNT_ID') or
            _settings.r2_account_id
        )

        return all(required_settings) and has_endpoint_config

    def _build_public_url(self, file_key: str) -> str:
        """Build public URL for a file key"""
        if _settings.r2_public_url:
            return f"{_settings.r2_public_url.rstrip('/')}/{file_key}"
        else:
            # Use the R2 endpoint for direct access
            endpoint = self._build_endpoint_url()
            return f"{endpoint}/{_settings.r2_bucket_name}/{file_key}"

    def get_presigned_url(self, file_key: str, expiration: int = 3600) -> Optional[str]:
        """Generate presigned URL for file access"""
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': _settings.r2_bucket_name, 'Key': file_key},
                ExpiresIn=expiration
            )
            return url
        except ClientError:
            logger.exception("Presigned asset URL generation failed")
            return None

    def delete_file(self, file_key: str) -> bool:
        """Delete file from R2 storage"""
        try:
            self.s3_client.delete_object(
                Bucket=_settings.r2_bucket_name,
                Key=file_key
            )
            logger.info("R2 object deleted", extra={"event_name": "r2.object.deleted"})
            return True
        except ClientError:
            logger.exception("R2 object deletion failed")
            return False

    def promote_file(self, source_key: str, destination_key: str) -> bool:
        """Copy a verified object to its durable key before removing the pending object."""
        try:
            if not self.object_exists(destination_key):
                self.s3_client.copy_object(
                    Bucket=_settings.r2_bucket_name,
                    CopySource={"Bucket": _settings.r2_bucket_name, "Key": source_key},
                    Key=destination_key,
                    MetadataDirective="COPY"
                )
                if not self.object_exists(destination_key):
                    logger.error("Promoted R2 object verification failed")
                    return False
            if not self.delete_file(source_key):
                logger.error("Pending R2 object cleanup failed after promotion")
                return False
            logger.info("R2 object promoted", extra={"event_name": "r2.object.promoted"})
            return True
        except Exception:
            logger.exception("R2 object promotion failed")
            return False

    def list_objects(self, prefix: str = "", max_keys: int = 1000) -> List[Dict[str, Any]]:
        """List objects in R2 bucket"""
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=_settings.r2_bucket_name,
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
        except ClientError:
            logger.exception("R2 object listing failed")
            return []

    def get_object_info(self, file_key: str) -> Optional[Dict[str, Any]]:
        """Get information about a specific object"""
        try:
            response = self.s3_client.head_object(
                Bucket=_settings.r2_bucket_name,
                Key=file_key
            )

            return {
                'key': file_key,
                'size': response['ContentLength'],
                'last_modified': response['LastModified'],
                'content_type': response.get('ContentType', 'unknown'),
                'metadata': response.get('Metadata', {}),
                'url': self._build_public_url(file_key)
            }
        except ClientError:
            logger.exception("R2 object metadata read failed")
            return None

    def get_object_bytes(self, file_key: str, max_bytes: int) -> bytes:
        """Read a private object with a hard memory limit for content inspection."""
        response = self.s3_client.get_object(
            Bucket=_settings.r2_bucket_name,
            Key=file_key
        )
        body = response["Body"]
        try:
            data = body.read(max_bytes + 1)
        finally:
            body.close()
        if len(data) > max_bytes:
            raise ValueError(f"R2 object exceeds inspection limit of {max_bytes} bytes")
        return data

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
                        'Bucket': _settings.r2_bucket_name,
                        'Key': file_key
                    },
                    ExpiresIn=expiration
                )
            elif method.upper() == "PUT":
                url = self.s3_client.generate_presigned_url(
                    'put_object',
                    Params={
                        'Bucket': _settings.r2_bucket_name,
                        'Key': file_key
                    },
                    ExpiresIn=expiration
                )
            elif method.upper() == "DELETE":
                url = self.s3_client.generate_presigned_url(
                    'delete_object',
                    Params={
                        'Bucket': _settings.r2_bucket_name,
                        'Key': file_key
                    },
                    ExpiresIn=expiration
                )
            else:
                logger.error(f"Unsupported method for presigned URL: {method}")
                return None

            logger.info(
                "Presigned asset URL generated",
                extra={
                    "event_name": "asset.presigned_url.generated",
                    "http_method": method,
                    "expires_in_seconds": expiration,
                    "outcome": "success",
                },
            )
            return url

        except Exception:
            logger.exception("Presigned asset URL generation failed")
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
                Bucket=_settings.r2_bucket_name,
                Key=file_key
            )
            return True
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == '404':
                return False
            else:
                logger.exception("R2 object existence check failed")
                return False
        except Exception:
            logger.exception("Unexpected R2 object existence check failure")
            return False

    def get_object_hash(self, file_key: str) -> Optional[str]:
        """Get stored xxHash for an object"""
        try:
            response = self.s3_client.head_object(
                Bucket=_settings.r2_bucket_name,
                Key=file_key
            )
            return response.get('Metadata', {}).get('xxhash')
        except Exception:
            logger.exception("R2 object hash read failed")
            return None

    def generate_presigned_upload_url(
        self,
        file_key: str,
        xxhash: str,
        content_type: Optional[str] = None,
        expiration: int = 3600
    ) -> Optional[str]:
        """Generate presigned URL for upload with required xxHash metadata"""
        try:
            # Validate expiration (Cloudflare R2 limit: 7 days)
            max_expiration = 7 * 24 * 3600  # 7 days in seconds
            if expiration > max_expiration:
                logger.warning(f"Expiration {expiration}s exceeds R2 limit, using {max_expiration}s")
                expiration = max_expiration

            params: Dict[str, Any] = {
                'Bucket': _settings.r2_bucket_name,
                'Key': file_key,
                'Metadata': {
                    'xxhash': xxhash
                }
            }
            if content_type:
                params['ContentType'] = content_type

            # Generate presigned URL for PUT with required metadata
            url = self.s3_client.generate_presigned_url(
                'put_object',
                Params=params,
                ExpiresIn=expiration
            )

            logger.info(
                "Presigned asset upload URL generated",
                extra={
                    "event_name": "asset.presigned_upload.generated",
                    "outcome": "success",
                },
            )
            return url

        except Exception:
            logger.exception("Presigned asset upload URL generation failed")
            return None
