"""
TTRPG System Settings
Global settings and constants for the entire application.
All settings are CAPITAL LETTERS as per Python conventions.
"""
import os
from pathlib import Path

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    # Get the directory containing this file
    BASE_DIR = Path(__file__).resolve().parent
    # Load .env file from the root directory
    load_dotenv(BASE_DIR / '.env')
except ImportError:
    # python-dotenv not installed, will use system environment variables only
    pass

# ============================================================================
# APPLICATION SETTINGS
# ============================================================================
APP_NAME = "TTRPG System"
APP_VERSION = "0.0.08"
DEBUG_MODE = True

# ============================================================================
# STORAGE SETTINGS
# ============================================================================
# Default storage root path (platform-specific)
_default_storage_path = os.path.join(os.path.expanduser("~"), "Documents", "TTRPG_Storage") if os.name == 'nt' else os.path.join(os.path.expanduser("~"), ".local", "share", "ttrpg")
DEFAULT_STORAGE_PATH = os.getenv('DEFAULT_STORAGE_PATH', _default_storage_path)

# Storage folders
IMAGES_FOLDER = "images"
MUSIC_FOLDER = "music"
VIDEO_FOLDER = "video"
OTHER_FOLDER = "other"
SAVES_FOLDER = "saves"
CACHE_FOLDER = "cache"
COMPENDIUMS_FOLDER = "compendiums"

# ============================================================================
# R2 CLOUD STORAGE SETTINGS
# ============================================================================
R2_ENABLED = os.getenv('R2_ENABLED', 'false').lower() in ('true', '1', 'yes', 'on')
R2_ENDPOINT = os.getenv('R2_ENDPOINT', "")  # Can be left empty if R2_ACCOUNT_ID is provided
R2_ACCOUNT_ID = os.getenv('R2_ACCOUNT_ID', "")  # Your Cloudflare account ID for R2
R2_ACCESS_KEY = os.getenv('R2_ACCESS_KEY', "")
R2_SECRET_KEY = os.getenv('R2_SECRET_KEY', "")
R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', "")
R2_PUBLIC_URL = os.getenv('R2_PUBLIC_URL', "")  # Optional: Custom domain for public access

# ============================================================================
# CACHE SETTINGS
# ============================================================================
MAX_CACHE_SIZE_MB = 1024  # 1GB
CACHE_CLEANUP_INTERVAL_HOURS = 24
AUTO_CLEANUP_CACHE = True

# Asset cache paths
ASSET_CACHE_DIR = os.path.join(DEFAULT_STORAGE_PATH, CACHE_FOLDER, "assets")
TEXTURE_CACHE_DIR = os.path.join(DEFAULT_STORAGE_PATH, CACHE_FOLDER, "textures")
ASSET_REGISTRY_FILE = os.path.join(ASSET_CACHE_DIR, "registry.json")

# Cache size limits
MAX_ASSET_CACHE_SIZE_MB = 500  # 500MB for R2 assets
MAX_TEXTURE_CACHE_SIZE_MB = 200  # 200MB for texture cache
CACHE_CLEANUP_AGE_DAYS = 30  # Delete files older than 30 days

# ============================================================================
# NETWORK SETTINGS
# ============================================================================
DEFAULT_SERVER_PORT = 8000
WEBSOCKET_PORT = 8765


# ============================================================================
# GUI SETTINGS
# ============================================================================
WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 720
WINDOW_TITLE = "TTRPG System"
FPS_TARGET = 60
VSYNC_ENABLED = True

# ============================================================================
# RENDERING SETTINGS
# ============================================================================
MAX_SPRITES = 1000
TILE_SIZE = 32
MAP_WIDTH = 100
MAP_HEIGHT = 100

# ============================================================================
# AUTHENTICATION SETTINGS
# ============================================================================
JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
JWT_EXPIRATION_HOURS = 24
SESSION_TIMEOUT_MINUTES = 60

# ============================================================================
# FILE SETTINGS
# ============================================================================
MAX_FILE_SIZE_MB = 100
SUPPORTED_IMAGE_FORMATS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'}
SUPPORTED_VIDEO_FORMATS = {'.mp4', '.avi', '.mov', '.mkv', '.webm'}
SUPPORTED_AUDIO_FORMATS = {'.mp3', '.wav', '.ogg', '.flac', '.aac'}

# ============================================================================
# LOGGING SETTINGS
# ============================================================================
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
LOG_FILE = "debug.log"

# ============================================================================
# PERFORMANCE SETTINGS
# ============================================================================
ASYNC_POOL_SIZE = 10
MAX_CONCURRENT_UPLOADS = 3
MAX_CONCURRENT_DOWNLOADS = 5
REFRESH_THROTTLE_MS = 100

# ============================================================================
# HELPER FUNCTIONS (minimal)
# ============================================================================
def get_storage_path(folder_name: str) -> str:
    """Get full path for a storage folder"""
    return os.path.join(DEFAULT_STORAGE_PATH, folder_name)

def get_folder_for_file_type(filename: str) -> str:
    """Get folder name for file type"""
    ext = os.path.splitext(filename)[1].lower()
    
    if ext in SUPPORTED_IMAGE_FORMATS:
        return IMAGES_FOLDER
    elif ext in SUPPORTED_VIDEO_FORMATS:
        return VIDEO_FOLDER
    elif ext in SUPPORTED_AUDIO_FORMATS:
        return MUSIC_FOLDER
    else:
        return OTHER_FOLDER
