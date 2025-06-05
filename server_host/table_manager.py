"""
Webhook-adapted table manager
Adapts the original TableManager for webhook server use
"""
import logging
import os
import sys
from typing import Dict, Optional

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core_table.table import VirtualTable

logger = logging.getLogger(__name__)

class WebhookTableManager:
    """Manages virtual tables for the webhook server"""
    
    def __init__(self):
        self.tables: Dict[str, VirtualTable] = {}
        
        # Create default table
        default_table = self._create_default_table()
        self.add_table(default_table)
        
        logger.info("Webhook table manager initialized with default table")
        
    def _create_default_table(self) -> VirtualTable:
        """Create default table with sample content"""
        table = VirtualTable("default", 100, 100)
        
        # Add default properties
        table.scale = 1.0
        table.x_moved = 0.0
        table.y_moved = 0.0
        table.show_grid = True
        
        return table
    
    def get_table(self, name: str = None) -> VirtualTable:
        """Get table by name, returns default if name is None"""
        if name is None:
            name = "default"
            
        if name in self.tables:
            return self.tables[name]
        else:
            logger.warning(f"Table '{name}' not found, returning default")
            return self.tables.get("default")
    
    def create_table(self, name: str, width: int, height: int) -> VirtualTable:
        """Create a new table"""
        if name in self.tables:
            logger.warning(f"Table '{name}' already exists, returning existing")
            return self.tables[name]
            
        table = VirtualTable(name, width, height)
        
        # Add default properties
        table.scale = 1.0
        table.x_moved = 0.0
        table.y_moved = 0.0
        table.show_grid = True
        
        self.add_table(table)
        logger.info(f"Created new table: {name} ({width}x{height})")
        
        return table
    
    def add_table(self, table: VirtualTable):
        """Add an existing table to the manager"""
        self.tables[table.name] = table
        logger.debug(f"Added table: {table.name}")
    
    def apply_update(self, data: Dict):
        """Apply update to table based on data"""
        table_name = data.get('table_name', 'default')
        table = self.get_table(table_name)
        
        if not table:
            logger.warning(f"Cannot apply update to non-existent table: {table_name}")
            return
            
        # Apply table-level updates
        if 'scale' in data:
            table.scale = data['scale']
        if 'x_moved' in data:
            table.x_moved = data['x_moved']
        if 'y_moved' in data:
            table.y_moved = data['y_moved']
        if 'show_grid' in data:
            table.show_grid = data['show_grid']
        if 'width' in data:
            table.width = data['width']
        if 'height' in data:
            table.height = data['height']
            
        logger.debug(f"Applied update to table {table_name}")
    
    def list_tables(self) -> list:
        """Get list of table names"""
        return list(self.tables.keys())
    
    def remove_table(self, name: str) -> bool:
        """Remove a table by name"""
        if name == "default":
            logger.warning("Cannot remove default table")
            return False
            
        if name in self.tables:
            del self.tables[name]
            logger.info(f"Removed table: {name}")
            return True
        else:
            logger.warning(f"Cannot remove non-existent table: {name}")
            return False
