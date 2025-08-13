use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub table_id: String,
    pub table_name: String,
    pub width: f64,
    pub height: f64,
    pub scale: f64,
    pub table_x: f64,
    pub table_y: f64,
    pub viewport_x: f64,
    pub viewport_y: f64,
    pub table_scale: f64,
    pub show_grid: bool,
    pub cell_side: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenArea {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[wasm_bindgen]
pub struct TableManager {
    tables: HashMap<String, TableInfo>,
    screen_areas: HashMap<String, ScreenArea>,
    active_table_id: Option<String>,
    canvas_width: f64,
    canvas_height: f64,
}

#[wasm_bindgen]
impl TableManager {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            tables: HashMap::new(),
            screen_areas: HashMap::new(),
            active_table_id: None,
            canvas_width: 800.0,
            canvas_height: 600.0,
        }
    }

    #[wasm_bindgen]
    pub fn set_canvas_size(&mut self, width: f64, height: f64) {
        self.canvas_width = width;
        self.canvas_height = height;
    }

    #[wasm_bindgen]
    pub fn create_table(&mut self, table_id: &str, table_name: &str, width: f64, height: f64) -> Result<(), JsValue> {
        let table = TableInfo {
            table_id: table_id.to_string(),
            table_name: table_name.to_string(),
            width,
            height,
            scale: 1.0,
            table_x: 0.0,
            table_y: 0.0,
            viewport_x: 0.0,
            viewport_y: 0.0,
            table_scale: 1.0,
            show_grid: true,
            cell_side: 20.0,
        };

        self.tables.insert(table_id.to_string(), table);
        
        // Set as active if it's the first table
        if self.active_table_id.is_none() {
            self.active_table_id = Some(table_id.to_string());
        }

        Ok(())
    }

    #[wasm_bindgen]
    pub fn set_active_table(&mut self, table_id: &str) -> bool {
        if self.tables.contains_key(table_id) {
            self.active_table_id = Some(table_id.to_string());
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn get_active_table_id(&self) -> Option<String> {
        self.active_table_id.clone()
    }

    #[wasm_bindgen]
    pub fn set_table_screen_area(&mut self, table_id: &str, x: f64, y: f64, width: f64, height: f64) -> bool {
        if self.tables.contains_key(table_id) {
            let area = ScreenArea { x, y, width, height };
            self.screen_areas.insert(table_id.to_string(), area);
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn table_to_screen(&self, table_id: &str, table_x: f64, table_y: f64) -> Option<Vec<f64>> {
        let table = self.tables.get(table_id)?;
        let screen_area = self.screen_areas.get(table_id);

        let (screen_x, screen_y) = if let Some(area) = screen_area {
            // Apply viewport offset and scaling
            let relative_x = (table_x - table.viewport_x) * table.table_scale;
            let relative_y = (table_y - table.viewport_y) * table.table_scale;
            
            // Map to screen area
            (area.x + relative_x, area.y + relative_y)
        } else {
            // Fallback to canvas coordinates
            let relative_x = (table_x - table.viewport_x) * table.table_scale;
            let relative_y = (table_y - table.viewport_y) * table.table_scale;
            (relative_x, relative_y)
        };

        Some(vec![screen_x, screen_y])
    }

    #[wasm_bindgen]
    pub fn screen_to_table(&self, table_id: &str, screen_x: f64, screen_y: f64) -> Option<Vec<f64>> {
        let table = self.tables.get(table_id)?;
        let screen_area = self.screen_areas.get(table_id);

        let (table_x, table_y) = if let Some(area) = screen_area {
            // Convert to relative coordinates within table area
            let relative_x = screen_x - area.x;
            let relative_y = screen_y - area.y;
            
            // Apply inverse scaling and viewport offset
            let table_x = (relative_x / table.table_scale) + table.viewport_x;
            let table_y = (relative_y / table.table_scale) + table.viewport_y;
            (table_x, table_y)
        } else {
            // Fallback to canvas coordinates
            let table_x = (screen_x / table.table_scale) + table.viewport_x;
            let table_y = (screen_y / table.table_scale) + table.viewport_y;
            (table_x, table_y)
        };

        Some(vec![table_x, table_y])
    }

    #[wasm_bindgen]
    pub fn is_point_in_table_area(&self, table_id: &str, screen_x: f64, screen_y: f64) -> bool {
        if let Some(area) = self.screen_areas.get(table_id) {
            screen_x >= area.x && screen_x <= area.x + area.width &&
            screen_y >= area.y && screen_y <= area.y + area.height
        } else {
            // If no screen area defined, consider entire canvas
            screen_x >= 0.0 && screen_x <= self.canvas_width &&
            screen_y >= 0.0 && screen_y <= self.canvas_height
        }
    }

    #[wasm_bindgen]
    pub fn pan_viewport(&mut self, table_id: &str, dx: f64, dy: f64) -> bool {
        if let Some(table) = self.tables.get_mut(table_id) {
            table.viewport_x += dx / table.table_scale;
            table.viewport_y += dy / table.table_scale;
            
            // Clamp viewport to reasonable bounds
            let max_viewport_x = table.width * 2.0;
            let max_viewport_y = table.height * 2.0;
            let min_viewport_x = -table.width;
            let min_viewport_y = -table.height;
            
            table.viewport_x = table.viewport_x.clamp(min_viewport_x, max_viewport_x);
            table.viewport_y = table.viewport_y.clamp(min_viewport_y, max_viewport_y);
            
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn zoom_table(&mut self, table_id: &str, zoom_factor: f64, center_x: f64, center_y: f64) -> bool {
        // First, get the center coordinates before the zoom
        let center_table_coords = if let Some(coords) = self.screen_to_table(table_id, center_x, center_y) {
            coords
        } else {
            return false;
        };
        
        if let Some(table) = self.tables.get_mut(table_id) {
            let old_scale = table.table_scale;
            let new_scale = (table.table_scale * zoom_factor).clamp(0.1, 5.0);
            
            if (new_scale - old_scale).abs() < f64::EPSILON {
                return false; // No change
            }
            
            let center_table_x = center_table_coords[0];
            let center_table_y = center_table_coords[1];
            
            // Apply new scale
            table.table_scale = new_scale;
            
            // Calculate the new center coordinates after zoom and adjust viewport
            let screen_area = self.screen_areas.get(table_id);
            let (table_x, table_y) = if let Some(area) = screen_area {
                // Convert to relative coordinates within table area
                let relative_x = center_x - area.x;
                let relative_y = center_y - area.y;
                
                // Apply inverse scaling and viewport offset
                let table_x = (relative_x / table.table_scale) + table.viewport_x;
                let table_y = (relative_y / table.table_scale) + table.viewport_y;
                (table_x, table_y)
            } else {
                // Fallback to canvas coordinates
                let table_x = (center_x / table.table_scale) + table.viewport_x;
                let table_y = (center_y / table.table_scale) + table.viewport_y;
                (table_x, table_y)
            };
            
            let dx = center_table_x - table_x;
            let dy = center_table_y - table_y;
            
            table.viewport_x += dx;
            table.viewport_y += dy;
            
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn set_table_grid(&mut self, table_id: &str, show_grid: bool, cell_size: f64) -> bool {
        if let Some(table) = self.tables.get_mut(table_id) {
            table.show_grid = show_grid;
            table.cell_side = cell_size.max(5.0); // Minimum cell size
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn get_table_info(&self, table_id: &str) -> Option<String> {
        self.tables.get(table_id)
            .map(|table| serde_json::to_string(table).unwrap_or_default())
    }

    #[wasm_bindgen]
    pub fn get_all_tables(&self) -> String {
        let tables: Vec<&TableInfo> = self.tables.values().collect();
        serde_json::to_string(&tables).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn remove_table(&mut self, table_id: &str) -> bool {
        let removed = self.tables.remove(table_id).is_some();
        if removed {
            self.screen_areas.remove(table_id);
            
            // If active table was removed, select another one
            if self.active_table_id.as_deref() == Some(table_id) {
                self.active_table_id = self.tables.keys().next().cloned();
            }
        }
        removed
    }

    #[wasm_bindgen]
    pub fn get_visible_bounds(&self, table_id: &str) -> Option<Vec<f64>> {
        let table = self.tables.get(table_id)?;
        let screen_area = self.screen_areas.get(table_id);
        
        let (area_width, area_height) = if let Some(area) = screen_area {
            (area.width, area.height)
        } else {
            (self.canvas_width, self.canvas_height)
        };
        
        // Calculate world bounds of visible area
        let world_width = area_width / table.table_scale;
        let world_height = area_height / table.table_scale;
        
        let min_x = table.viewport_x;
        let min_y = table.viewport_y;
        let max_x = table.viewport_x + world_width;
        let max_y = table.viewport_y + world_height;
        
        Some(vec![min_x, min_y, max_x, max_y])
    }

    #[wasm_bindgen]
    pub fn snap_to_grid(&self, table_id: &str, x: f64, y: f64) -> Option<Vec<f64>> {
        let table = self.tables.get(table_id)?;
        
        if !table.show_grid {
            return Some(vec![x, y]);
        }
        
        let cell_size = table.cell_side;
        let snapped_x = (x / cell_size).round() * cell_size;
        let snapped_y = (y / cell_size).round() * cell_size;
        
        Some(vec![snapped_x, snapped_y])
    }
}

impl Default for TableManager {
    fn default() -> Self {
        Self::new()
    }
}
