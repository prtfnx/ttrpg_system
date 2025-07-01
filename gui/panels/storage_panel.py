"""
Storage Panel for TTRPG GUI System
Provides file management interface as part of the main GUI panels.
"""
import os

import time
import subprocess
import sys
from pathlib import Path
from typing import Optional, List, Dict, Any
from imgui_bundle import imgui


# Import storage system components

from storage.r2_manager import R2AssetManager
import settings

from logger import setup_logger
logger = setup_logger(__name__)

class StoragePanel:
    """Storage management panel for the TTRPG GUI system"""
    
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge          
        # Initialize storage system components        
        
        self.r2_manager = R2AssetManager()
        self.R2_ENABLED = settings.R2_ENABLED
        # Panel state
        self.show_storage_window = False
        self.show_config_window = False
        self.show_upload_progress = False
        
        # File browser state
        self.current_folder = 'images'
        self.file_list = []
        self.selected_file = None
        self.refresh_needed = True
        
        # Config state
        self.config_cache = None
        self.config_modified = False
        
        # Performance optimization - cache expensive operations
        self._stats_cache = None
        self._stats_cache_time = 0
        self._stats_cache_duration = 3.0  # Cache for 3 seconds
        self._file_list_cache_time = 0
    
    def render(self):
        """Render the storage panel tab content"""
        # Simple storage interface within the tab
        if imgui.button("Open Storage Manager"):
            self.show_storage_window = True
        imgui.same_line()
        if imgui.button("Open Folder"):
            self._open_file_browser()
        
        imgui.same_line()
        if imgui.button("Settings"):
            self.show_config_window = True
        
        imgui.separator()
        imgui.text("Storage System")
        imgui.text(f"Root: {settings.DEFAULT_STORAGE_PATH}")
        
        # Quick stats (cached - only update every few seconds)
        if not hasattr(self, '_storage_stats_cache') or \
           not hasattr(self, '_storage_stats_time') or \
           (time.time() - self._storage_stats_time) > 3.0:
            self._storage_stats_cache = self.get_cached_stats()
            self._storage_stats_time = time.time()
        
        imgui.text(f"Total files: {self._storage_stats_cache.get('total_files', 0)}")
        
        # Current folder quick view
        imgui.spacing()
        imgui.text(f"Current folder: {self.current_folder}")
        
        # Quick folder switcher
        folders = ['images', 'music', 'video', 'other']
        for i, folder in enumerate(folders):
            if i > 0:
                imgui.same_line()
            
            if imgui.small_button(folder):
                if self.current_folder != folder:
                    self.current_folder = folder
                    self.refresh_needed = True
        
        # Show file count for current folder
        if self.refresh_needed:
            current_time = time.time()
            if current_time - self._file_list_cache_time > 1.0:
                self._refresh_file_list()
                self._file_list_cache_time = current_time
        
        imgui.text(f"Files in {self.current_folder}: {len(self.file_list)}")
        
        # Render popup windows only when visible
        self._render_popup_windows()
    
    def _render_popup_windows(self):
        """Render storage popup windows only when needed"""
        if self.show_storage_window:
            self._draw_storage_window()
        if self.show_config_window:
            self._draw_config_window()
        if self.show_upload_progress:
            self._draw_upload_progress()
    def _draw_storage_window(self):
        """Draw main storage management window"""
        window_opened = False
        try:
            imgui.set_next_window_size((800, 600))
            
            expanded, self.show_storage_window = imgui.begin("Storage Manager", self.show_storage_window)
            window_opened = True
            
            if expanded:
                # Folder selection
                imgui.text("Current Folder:")
                imgui.same_line()
                
                folders = ['images', 'music', 'video', 'other', 'saves', 'compendiums']
                for i, folder in enumerate(folders):
                    if i > 0:
                        imgui.same_line()
                    
                    if imgui.button(folder.title()):
                        if self.current_folder != folder:
                            self.current_folder = folder
                            self.refresh_needed = True
                
                imgui.separator()
                  # Action buttons
                if imgui.button("Open Folder"):
                    self._open_file_browser()
                
                imgui.same_line()
                if imgui.button("Refresh"):
                    self.refresh_needed = True
                
                imgui.same_line()
                if imgui.button("Open Folder"):
                    self._open_current_folder()
                
                imgui.separator()
                
                # File list (performance optimized)
                self._draw_file_list_optimized()
                
                # Storage stats (cached)
                imgui.separator()
                self._draw_storage_stats_cached()
            
        except Exception as e:
            logger.error(f"Error drawing storage window: {e}")
            self.show_storage_window = False
        finally:
            if window_opened:
                imgui.end()
    
    def _draw_config_window(self):
        """Draw storage configuration window"""
        try:
            imgui.set_next_window_size((500, 400))
            
            expanded, self.show_config_window = imgui.begin("Storage Settings", self.show_config_window)
            
            if expanded:
                
                # Storage paths
                imgui.text("Storage Configuration")
                imgui.separator()
                
                # Root path (read-only for now)
                root_path = settings.DEFAULT_STORAGE_PATH
                imgui.text(f"Root Storage Path: {root_path}")
                
                imgui.spacing()
                
                # R2 Configuration (simplified)
                changed, enabled = imgui.checkbox("Enable R2 Cloud Storage", self.R2_ENABLED)
                if changed:
                    self.R2_ENABLED = enabled
                    

                if self.R2_ENABLED:
                    imgui.text("R2 settings would go here...")
                
                imgui.spacing()
                imgui.separator()
                
                # Buttons
                if imgui.button("Save Settings"):
                    self._save_config()
                
                imgui.same_line()
                if imgui.button("Cancel"):
                    self.config_cache = None
                    self.config_modified = False
                    self.show_config_window = False
            imgui.end()
        except Exception as e:
            logger.error(f"Error drawing config window: {e}")
            self.show_config_window = False

    def _draw_upload_progress(self):
        """Draw upload progress overlay"""
        try:
            # Open the popup modal when needed
            if self.show_upload_progress and not imgui.is_popup_open("Upload Progress"):
                imgui.open_popup("Upload Progress")
            
            # Draw the popup if it's open
            popup_opened, _ = imgui.begin_popup_modal("Upload Progress")
            if popup_opened:
                imgui.text("File upload functionality coming soon...")
                imgui.spacing()
                
                if imgui.button("Close"):
                    self.show_upload_progress = False
                    imgui.close_current_popup()
                
                imgui.end_popup()
        except Exception as e:
            logger.error(f"Error drawing upload progress: {e}")
            self.show_upload_progress = False
    def get_cached_stats(self):
        """Get cached storage stats to avoid expensive I/O every frame"""
        current_time = time.time()
        
        if (self._stats_cache is None or 
            current_time - self._stats_cache_time > self._stats_cache_duration):
            try:
                # Only get stats if storage manager is available and working
                if hasattr(self, 'StorageManager') and self.StorageManager:
                    # Use a simple file count instead of expensive operations
                    root_path = getattr(settings, 'DEFAULT_STORAGE_PATH', 'storage')
                    if os.path.exists(root_path):
                        file_count = len([f for f in os.listdir(root_path) if os.path.isfile(os.path.join(root_path, f))])
                        self._stats_cache = {'total_files': file_count, 'cache_size_mb': 0.0}
                    else:
                        self._stats_cache = {'total_files': 0, 'cache_size_mb': 0.0}
                else:
                    self._stats_cache = {'total_files': 0, 'cache_size_mb': 0.0}
                    
                self._stats_cache_time = current_time
            except Exception as e:
                logger.error(f"Failed to get storage stats: {e}")
                self._stats_cache = {'total_files': 0, 'cache_size_mb': 0.0}
        
        return self._stats_cache
    
    def _draw_file_list_optimized(self):
        """Draw optimized file list (only refresh when needed)"""
        # Only refresh file list when explicitly requested or folder changed
        if self.refresh_needed:
            current_time = time.time()
            # Throttle file list refreshes to max once per second
            if current_time - self._file_list_cache_time > 1.0:
                self._refresh_file_list()
                self._file_list_cache_time = current_time
        
        imgui.text(f"Files in '{self.current_folder}' folder:")
        
        if not self.file_list:
            imgui.text("  (No files)")
        else:
            # Limit display to prevent performance issues with large folders
            display_limit = 30
            if len(self.file_list) > display_limit:
                imgui.text(f"  Showing first {display_limit} of {len(self.file_list)} files...")
                display_files = self.file_list[:display_limit]
                imgui.text(f"  Use Refresh button to update list")
            else:
                display_files = self.file_list
            
            for filename in display_files:
                imgui.bullet_text(filename)
    
    def _draw_storage_stats_cached(self):
        """Draw cached storage statistics (performance optimized)"""
        try:
            stats = self.get_cached_stats()
            
            imgui.text("Storage Statistics:")
            imgui.text(f"  Total files: {stats.get('total_files', 0)}")
            imgui.text(f"  Cache size: {stats.get('cache_size_mb', 0):.1f} MB")
            
            # Only show folder stats if available and not too many
            folders = stats.get('folders', {})
            if len(folders) <= 6:  # Limit to prevent UI clutter
                for folder_name, folder_info in folders.items():
                    if folder_info.get('exists', False):
                        imgui.text(f"  {folder_name}: {folder_info.get('file_count', 0)} files")
        except Exception as e:
            imgui.text(f"Error loading stats: {e}")
    def _refresh_file_list(self):
        """Refresh the file list for current folder (throttled)"""
        try:
            # Safely handle missing storage manager
            if hasattr(self, 'StorageManager') and self.StorageManager:
                # Use simple directory listing instead of storage manager methods
                root_path = getattr(settings, 'DEFAULT_STORAGE_PATH', 'storage')
                folder_path = os.path.join(root_path, self.current_folder)
                
                if os.path.exists(folder_path):
                    self.file_list = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f))]
                else:
                    self.file_list = []
            else:
                self.file_list = []
                
            self.refresh_needed = False
        except Exception as e:
            logger.error(f"Failed to refresh file list: {e}")
            self.file_list = []    
    def _open_file_browser(self):
        """Open folder in system file manager for drag-drop upload"""
        try:
            # Use StorageManager's root_path and build folder path
            if hasattr(self, 'StorageManager') and self.StorageManager:
                root_path = self.StorageManager.root_path
                folder_path = root_path / self.current_folder
            else:
                # Fallback to settings
                root_path = Path(getattr(settings, 'DEFAULT_STORAGE_PATH', 'storage'))
                folder_path = root_path / self.current_folder
            
            # Ensure folder exists
            folder_path.mkdir(parents=True, exist_ok=True)
            
            # Open folder in system file manager
            if sys.platform == "win32":
                subprocess.run(['explorer', str(folder_path)], shell=True)
            elif sys.platform == "darwin":  # macOS
                subprocess.run(['open', str(folder_path)])
            else:  # Linux
                subprocess.run(['xdg-open', str(folder_path)])
            
            logger.info(f"Opened {self.current_folder} folder: {folder_path}")
            logger.info("Drag files into the folder to upload them")
            
        except Exception as e:
            logger.error(f"Failed to open folder: {e}")
    def _open_current_folder(self):
        """Open current folder in system file explorer"""
        try:
            # Use StorageManager's root_path and build folder path
            if hasattr(self, 'StorageManager') and self.StorageManager:
                root_path = self.StorageManager.root_path
                folder_path = root_path / self.current_folder
            else:
                # Fallback to settings
                root_path = Path(getattr(settings, 'DEFAULT_STORAGE_PATH', 'storage'))
                folder_path = root_path / self.current_folder
            
            # Ensure folder exists
            folder_path.mkdir(parents=True, exist_ok=True)
            
            if os.path.exists(folder_path):
                import subprocess
                if sys.platform == "win32":
                    subprocess.Popen(f'explorer "{folder_path}"', shell=True)
                elif sys.platform == "darwin":  # macOS
                    subprocess.run(['open', str(folder_path)])
                else:  # Linux
                    subprocess.run(['xdg-open', str(folder_path)])
                logger.info(f"Opened folder: {folder_path}")
            else:
                logger.warning(f"Folder does not exist: {folder_path}")
        except Exception as e:
            logger.error(f"Failed to open folder: {e}")
    
    def _save_config(self):
        """Save configuration changes"""
        #TODO: implement
        pass
    
    def _cleanup_storage(self):
        """Run storage cleanup"""
        try:
            logger.info("Storage cleanup requested")
            # TODO: Implement actual cleanup in background thread
        except Exception as e:
            logger.error(f"Storage cleanup exception: {e}")
    
    def _process_uploaded_files(self, file_paths):
        """Process files selected by the user for upload"""
        try:
            uploaded_count = 0
            for file_path in file_paths:
                # Get just the filename
                filename = os.path.basename(file_path)
                
                # Save file to current folder
                saved_path = self.StorageManager.save_file(file_path, filename, self.current_folder)
                
                if saved_path:
                    uploaded_count += 1
                    logger.info(f"Uploaded file: {filename} to {self.current_folder}")
                else:
                    logger.error(f"Failed to upload file: {filename}")
            
            # Refresh file list to show new files            self.refresh_needed = True
            
            # Log summary
            if uploaded_count > 0:
                logger.info(f"Successfully uploaded {uploaded_count} file(s) to {self.current_folder}")
            else:
                logger.warning("No files were uploaded successfully")
                
        except Exception as e:
            logger.error(f"Error processing uploaded files: {e}")


# Note: Old global instance pattern removed - use dependency injection instead
