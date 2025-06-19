"""
Example usage of the R2AssetManager.
This demonstrates the basic functionality and best practices.
"""
import os
import sys
import tempfile
from pathlib import Path

# Add the parent directory to the path so we can import the storage module
sys.path.append(str(Path(__file__).parent.parent))

from storage.r2_manager import R2AssetManager
import settings

def test_r2_manager():
    """Test the R2AssetManager functionality"""
    
    # Initialize the manager
    r2_manager = R2AssetManager()
    
    # Check if R2 is configured
    if not r2_manager.is_r2_configured():
        print("R2 is not configured. Please set the following in settings.py:")
        print("- R2_ENABLED = True")
        print("- R2_ACCOUNT_ID = 'your-account-id'  # OR set full R2_ENDPOINT")
        print("- R2_ACCESS_KEY = 'your-access-key'")
        print("- R2_SECRET_KEY = 'your-secret-key'")
        print("- R2_BUCKET_NAME = 'your-bucket-name'")
        print("- R2_PUBLIC_URL = 'https://your-custom-domain.com'  # Optional")
        return
    
    print("R2 is configured! Testing functionality...")
    
    # Create a test file
    test_content = "Hello, R2! This is a test file from TTRPG System."
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(test_content)
        test_file_path = f.name
    
    try:        # Test upload
        print(f"\n1. Testing upload of: {test_file_path}")
        upload_result = r2_manager.upload_file(test_file_path, "test")
        
        if upload_result.success and upload_result.file_key:
            print(f"   ✓ Upload successful!")
            print(f"   - URL: {upload_result.url}")
            print(f"   - File Key: {upload_result.file_key}")
            print(f"   - Size: {upload_result.file_size} bytes")
            
            file_key = upload_result.file_key
            
            # Test presigned URL generation
            print(f"\n2. Testing presigned URL generation...")
            presigned_url = r2_manager.get_presigned_url(file_key, 3600)
            if presigned_url:
                print(f"   ✓ Presigned URL generated: {presigned_url[:80]}...")
            else:
                print("   ✗ Failed to generate presigned URL")
            
            # Test object info
            print(f"\n3. Testing object info retrieval...")
            obj_info = r2_manager.get_object_info(file_key)
            if obj_info:
                print(f"   ✓ Object info retrieved:")
                print(f"   - Size: {obj_info['size']} bytes")
                print(f"   - Last Modified: {obj_info['last_modified']}")
                print(f"   - Content Type: {obj_info['content_type']}")
            else:
                print("   ✗ Failed to get object info")
            
            # Test download
            print(f"\n4. Testing download...")
            download_path = os.path.join(tempfile.gettempdir(), "r2_test_download.txt")
            download_result = r2_manager.download_file(file_key, download_path)
            
            if download_result.success:
                print(f"   ✓ Download successful to: {download_result.local_path}")
                # Verify content
                with open(download_path, 'r') as f:
                    downloaded_content = f.read()
                if downloaded_content == test_content:
                    print("   ✓ Downloaded content matches original")
                else:
                    print("   ✗ Downloaded content doesn't match original")
                os.unlink(download_path)  # Clean up
            else:
                print(f"   ✗ Download failed: {download_result.error}")
            
            # Test list objects
            print(f"\n5. Testing object listing...")
            objects = r2_manager.list_objects(prefix="test/", max_keys=10)
            print(f"   Found {len(objects)} objects with 'test/' prefix")
            for obj in objects[:3]:  # Show first 3
                print(f"   - {obj['key']} ({obj['size']} bytes)")
            
            # Test delete
            print(f"\n6. Testing file deletion...")
            if r2_manager.delete_file(file_key):
                print("   ✓ File deleted successfully")
            else:
                print("   ✗ Failed to delete file")
            
        else:
            print(f"   ✗ Upload failed: {upload_result.error}")
    
    finally:
        # Clean up test file
        if os.path.exists(test_file_path):
            os.unlink(test_file_path)
    
    # Show stats
    print(f"\n7. Usage Statistics:")
    stats = r2_manager.get_stats()
    print(f"   Uploads: {stats['uploads']['count']} ({stats['uploads']['bytes']} bytes, {stats['uploads']['errors']} errors)")
    print(f"   Downloads: {stats['downloads']['count']} ({stats['downloads']['bytes']} bytes, {stats['downloads']['errors']} errors)")

def main():
    """Main function"""
    print("R2AssetManager Test Script")
    print("=" * 50)
    
    try:
        test_r2_manager()
    except Exception as e:
        print(f"Error during testing: {e}")
        import traceback
        traceback.print_exc()
    
    print("\nTest completed!")

if __name__ == "__main__":
    main()
