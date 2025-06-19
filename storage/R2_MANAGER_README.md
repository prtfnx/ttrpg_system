# Cloudflare R2 Asset Manager

A production-ready Cloudflare R2 storage manager for the TTRPG System, built with boto3 following Cloudflare's official best practices.

## Features

- **Simple & Clean API**: Easy-to-use methods for common operations
- **Best Practice Implementation**: Follows Cloudflare's official boto3 documentation
- **Error Handling**: Comprehensive error handling with detailed logging
- **Type Safety**: Full type hints and dataclass-based results
- **Statistics Tracking**: Built-in upload/download statistics
- **Flexible Configuration**: Multiple ways to configure R2 connection
- **boto3 1.36.0+ Compatible**: Includes fixes for latest boto3 versions

## Configuration

Set the following in your `settings.py`:

```python
# Enable R2
R2_ENABLED = True

# Option 1: Use Account ID (Recommended)
R2_ACCOUNT_ID = "your-cloudflare-account-id"

# Option 2: Use Full Endpoint URL
R2_ENDPOINT = "https://your-account-id.r2.cloudflarestorage.com"

# Required: Access credentials
R2_ACCESS_KEY = "your-r2-access-key-id"
R2_SECRET_KEY = "your-r2-secret-access-key"
R2_BUCKET_NAME = "your-bucket-name"

# Optional: Custom domain for public URLs
R2_PUBLIC_URL = "https://your-custom-domain.com"
```

### Environment Variables (Alternative)

You can also set these via environment variables:
- `R2_ACCOUNT_ID`
- `AWS_ACCESS_KEY_ID` (for R2_ACCESS_KEY)
- `AWS_SECRET_ACCESS_KEY` (for R2_SECRET_KEY)

## Usage

### Basic Operations

```python
from storage.r2_manager import R2AssetManager

# Initialize the manager
r2 = R2AssetManager()

# Check if R2 is configured
if not r2.is_r2_configured():
    print("R2 is not configured!")
    return

# Upload a file
result = r2.upload_file("/path/to/file.jpg", "images")
if result.success:
    print(f"Uploaded: {result.url}")
    print(f"File key: {result.file_key}")
else:
    print(f"Upload failed: {result.error}")

# Download a file
download_result = r2.download_file(result.file_key, "/local/path/file.jpg")
if download_result.success:
    print(f"Downloaded to: {download_result.local_path}")

# Generate presigned URL (temporary access)
presigned_url = r2.get_presigned_url(result.file_key, expiration=3600)  # 1 hour
print(f"Temporary URL: {presigned_url}")

# Get file information
info = r2.get_object_info(result.file_key)
if info:
    print(f"Size: {info['size']} bytes")
    print(f"Last modified: {info['last_modified']}")
    print(f"Content type: {info['content_type']}")

# List objects
objects = r2.list_objects(prefix="images/", max_keys=100)
for obj in objects:
    print(f"{obj['key']} - {obj['size']} bytes")

# Delete a file
if r2.delete_file(result.file_key):
    print("File deleted successfully")
```

### Advanced Usage

```python
# Get usage statistics
stats = r2.get_stats()
print(f"Uploads: {stats['uploads']['count']} files, {stats['uploads']['bytes']} bytes")
print(f"Downloads: {stats['downloads']['count']} files, {stats['downloads']['bytes']} bytes")
print(f"Errors: {stats['uploads']['errors']} upload errors, {stats['downloads']['errors']} download errors")

# Reset statistics
r2.reset_stats()

# Generate file keys manually
file_key = r2.generate_file_key("myfile.png", "screenshots")
# Result: "screenshots/20250618_143022_a1b2c3d4_myfile.png"
```

## File Organization

The manager automatically organizes files by type:
- `images/` - Image files
- `videos/` - Video files  
- `audio/` - Audio files
- `documents/` - Document files
- `other/` - Everything else

Files are named with timestamp, hash, and original name for uniqueness.

## Error Handling

All operations return result objects with success status and error messages:

```python
@dataclass
class UploadResult:
    success: bool
    url: Optional[str] = None
    error: Optional[str] = None
    file_size: int = 0
    file_key: Optional[str] = None

@dataclass  
class DownloadResult:
    success: bool
    local_path: Optional[str] = None
    error: Optional[str] = None
    file_size: int = 0
```

## Testing

Run the test script to verify your configuration:

```bash
cd storage
python test_r2_manager.py
```

The test will:
1. Check R2 configuration
2. Upload a test file
3. Generate presigned URLs
4. Retrieve object information
5. Download the file
6. List objects
7. Delete the test file
8. Show usage statistics

## Best Practices

1. **Configuration**: Use `R2_ACCOUNT_ID` instead of full endpoint URL when possible
2. **Error Handling**: Always check the `success` field of result objects
3. **File Types**: Organize files by type for better bucket management
4. **Presigned URLs**: Use presigned URLs for temporary access instead of public URLs
5. **Statistics**: Monitor usage with the built-in statistics tracking
6. **Logging**: Enable logging to see detailed operation information

## Requirements

- `boto3`
- `botocore`

Install with:
```bash
pip install boto3
```

## Cloudflare R2 Setup

1. Log into Cloudflare Dashboard
2. Go to R2 Object Storage
3. Create a bucket
4. Go to "Manage R2 API tokens"
5. Create a new API token with R2 permissions
6. Note your Account ID from the R2 overview page

## Legacy Compatibility

The manager includes aliases for backward compatibility:
- `get_link()` → `get_presigned_url()`
- `add_pending_upload()` → logs the request (simplified)

## Troubleshooting

**"R2 configuration missing or invalid"**
- Check that `R2_ENABLED = True` in settings
- Verify all required settings are set
- Ensure either `R2_ACCOUNT_ID` or `R2_ENDPOINT` is configured

**"Upload failed: InvalidAccessKeyId"**
- Verify your R2 access key and secret key
- Check that the API token has proper R2 permissions

**"Upload failed: NoSuchBucket"**
- Verify the bucket name is correct and exists
- Check that your API token has access to the bucket

**boto3 version issues**
- The manager is compatible with boto3 1.36.0+
- If you encounter checksum issues, update boto3: `pip install -U boto3`
