use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::unit_converter::{UnitConverter, DistanceUnit};

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
    pub grid_cell_px: f64,
    pub cell_distance: f64,
    pub distance_unit: String,
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
            cell_side: 50.0,
            grid_cell_px: 50.0,
            cell_distance: 5.0,
            distance_unit: "ft".to_string(),
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

    // NOTE: internal helper moved to a plain `impl TableManager` block below to
    // avoid wasm-bindgen attempting to export a tuple return type.

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
        
        let cell_size = table.grid_cell_px;
        let snapped_x = (x / cell_size).round() * cell_size;
        let snapped_y = (y / cell_size).round() * cell_size;
        
        Some(vec![snapped_x, snapped_y])
    }

    #[wasm_bindgen]
    pub fn set_table_units(&mut self, table_id: &str, grid_cell_px: f64, cell_distance: f64, unit: &str) -> bool {
        if let Some(table) = self.tables.get_mut(table_id) {
            table.grid_cell_px = grid_cell_px.max(10.0).min(500.0);
            table.cell_distance = cell_distance.max(0.001);
            table.distance_unit = unit.to_string();
            table.cell_side = table.grid_cell_px; // keep in sync
            true
        } else {
            false
        }
    }

    pub fn get_unit_converter(&self, table_id: &str) -> UnitConverter {
        match self.tables.get(table_id) {
            Some(t) => UnitConverter::new(
                t.grid_cell_px as f32,
                t.cell_distance as f32,
                DistanceUnit::from_str(&t.distance_unit),
            ),
            None => UnitConverter::dnd_default(),
        }
    }

    #[wasm_bindgen]
    pub fn units_to_pixels(&self, table_id: &str, game_distance: f64) -> f64 {
        self.get_unit_converter(table_id).to_pixels(game_distance as f32) as f64
    }

    #[wasm_bindgen]
    pub fn pixels_to_units(&self, table_id: &str, pixels: f64) -> f64 {
        self.get_unit_converter(table_id).to_units(pixels as f32) as f64
    }
}

impl Default for TableManager {
    fn default() -> Self {
        Self::new()
    }
}

// Plain impl block for internal-only helpers (not exported to wasm-bindgen)
impl TableManager {
    /// Borrow the active table ID without cloning.
    /// Use in hot loops (render, input) to avoid per-frame String allocation.
    pub(crate) fn active_table_id(&self) -> Option<&str> {
        self.active_table_id.as_deref()
    }

    pub fn get_active_table_screen_area_internal(&self) -> Option<(f64, f64, f64, f64)> {
        if let Some(active_id) = &self.active_table_id {
            if let Some(area) = self.screen_areas.get(active_id) {
                Some((area.x, area.y, area.width, area.height))
            } else {
                // If no explicit screen area set for the table, default to full canvas
                Some((0.0, 0.0, self.canvas_width, self.canvas_height))
            }
        } else {
            None
        }
    }
    
    /// Get the active table's world bounds (width/height from TableInfo, NOT screen coordinates)
    /// Returns (x, y, width, height) in world coordinates
    pub fn get_active_table_world_bounds(&self) -> Option<(f64, f64, f64, f64)> {
        if let Some(active_id) = &self.active_table_id {
            if let Some(table) = self.tables.get(active_id) {
                // Table's width and height are already in world coordinates
                // Tables start at origin (0, 0) by default
                Some((0.0, 0.0, table.width, table.height))
            } else {
                None
            }
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_table(id: &str, w: f64, h: f64) -> TableManager {
        let mut tm = TableManager::new();
        tm.create_table(id, "Test Table", w, h).unwrap();
        tm
    }

    #[test]
    fn create_table_stores_info() {
        let tm = make_table("t1", 1000.0, 800.0);
        assert_eq!(tm.tables.len(), 1);
        let info = &tm.tables["t1"];
        assert_eq!(info.width, 1000.0);
        assert_eq!(info.height, 800.0);
        assert_eq!(info.table_name, "Test Table");
    }

    #[test]
    fn first_table_becomes_active_automatically() {
        let tm = make_table("t1", 500.0, 500.0);
        assert_eq!(tm.active_table_id.as_deref(), Some("t1"));
    }

    #[test]
    fn set_active_table_returns_true_for_known_table() {
        let mut tm = make_table("t1", 500.0, 500.0);
        tm.create_table("t2", "Test 2", 200.0, 200.0).unwrap();
        assert!(tm.set_active_table("t2"));
        assert_eq!(tm.active_table_id.as_deref(), Some("t2"));
    }

    #[test]
    fn set_active_table_returns_false_for_unknown() {
        let mut tm = make_table("t1", 500.0, 500.0);
        assert!(!tm.set_active_table("nonexistent"));
        // Active table unchanged
        assert_eq!(tm.active_table_id.as_deref(), Some("t1"));
    }

    #[test]
    fn get_active_table_id_after_set() {
        let mut tm = make_table("t1", 500.0, 500.0);
        tm.create_table("t2", "Test 2", 200.0, 200.0).unwrap();
        tm.set_active_table("t2");
        assert_eq!(tm.get_active_table_id().as_deref(), Some("t2"));
    }

    #[test]
    fn get_active_table_world_bounds_returns_dimensions() {
        let tm = make_table("t1", 1024.0, 768.0);
        let bounds = tm.get_active_table_world_bounds().unwrap();
        assert_eq!(bounds, (0.0, 0.0, 1024.0, 768.0));
    }

    #[test]
    fn get_active_table_world_bounds_none_with_no_active() {
        let tm = TableManager::new();
        assert!(tm.get_active_table_world_bounds().is_none());
    }

    #[test]
    fn remove_table_decreases_count() {
        let mut tm = make_table("t1", 500.0, 500.0);
        tm.create_table("t2", "Test 2", 200.0, 200.0).unwrap();
        assert!(tm.remove_table("t1"));
        assert_eq!(tm.tables.len(), 1);
    }

    #[test]
    fn remove_unknown_table_returns_false() {
        let mut tm = make_table("t1", 500.0, 500.0);
        assert!(!tm.remove_table("unknown"));
    }

    #[test]
    fn remove_active_table_selects_another() {
        let mut tm = make_table("t1", 500.0, 500.0);
        tm.create_table("t2", "Test 2", 200.0, 200.0).unwrap();
        tm.remove_table("t1");
        // Should have selected t2 as new active
        assert_eq!(tm.get_active_table_id().as_deref(), Some("t2"));
    }

    #[test]
    fn snap_to_grid_rounds_to_nearest_cell() {
        let mut tm = make_table("t1", 1000.0, 1000.0);
        // default grid_cell_px=50
        let snapped = tm.snap_to_grid("t1", 73.0, 28.0).unwrap();
        assert_eq!(snapped, vec![50.0, 50.0]); // round(73/50)*50=50, round(28/50)*50=50
    }

    #[test]
    fn snap_to_grid_unknown_table_returns_none() {
        let tm = make_table("t1", 500.0, 500.0);
        assert!(tm.snap_to_grid("nope", 10.0, 10.0).is_none());
    }

    #[test]
    fn set_table_units_clamps_grid_cell() {
        let mut tm = make_table("t1", 500.0, 500.0);
        assert!(tm.set_table_units("t1", 5.0, 5.0, "ft")); // below min → clamped to 10
        let info: TableInfo = serde_json::from_str(&tm.get_table_info("t1").unwrap()).unwrap();
        assert_eq!(info.grid_cell_px, 10.0);
    }

    #[test]
    fn set_table_units_updates_fields() {
        let mut tm = make_table("t1", 500.0, 500.0);
        assert!(tm.set_table_units("t1", 64.0, 10.0, "m"));
        let info: TableInfo = serde_json::from_str(&tm.get_table_info("t1").unwrap()).unwrap();
        assert_eq!(info.grid_cell_px, 64.0);
        assert_eq!(info.cell_distance, 10.0);
        assert_eq!(info.distance_unit, "m");
    }

    #[test]
    fn set_table_units_unknown_returns_false() {
        let mut tm = make_table("t1", 500.0, 500.0);
        assert!(!tm.set_table_units("nope", 64.0, 5.0, "ft"));
    }

    #[test]
    fn units_to_pixels_and_back() {
        let mut tm = make_table("t1", 500.0, 500.0);
        tm.set_table_units("t1", 50.0, 5.0, "ft"); // 50px = 5ft
        let px = tm.units_to_pixels("t1", 10.0); // 10ft → 100px
        assert!((px - 100.0).abs() < 0.01);
        let u = tm.pixels_to_units("t1", 100.0); // 100px → 10ft
        assert!((u - 10.0).abs() < 0.01);
    }

    #[test]
    fn table_to_screen_without_area_uses_canvas() {
        let tm = make_table("t1", 1000.0, 1000.0);
        // No screen area set — uses canvas coordinates
        let result = tm.table_to_screen("t1", 100.0, 200.0).unwrap();
        assert_eq!(result, vec![100.0, 200.0]); // scale=1, viewport=0,0
    }

    #[test]
    fn screen_to_table_roundtrip() {
        let mut tm = make_table("t1", 1000.0, 1000.0);
        tm.set_table_screen_area("t1", 50.0, 50.0, 400.0, 300.0);
        let screen = tm.table_to_screen("t1", 100.0, 200.0).unwrap();
        let table = tm.screen_to_table("t1", screen[0], screen[1]).unwrap();
        assert!((table[0] - 100.0).abs() < 0.01);
        assert!((table[1] - 200.0).abs() < 0.01);
    }

    #[test]
    fn is_point_in_table_area_with_defined_area() {
        let mut tm = make_table("t1", 500.0, 500.0);
        tm.set_table_screen_area("t1", 10.0, 10.0, 100.0, 100.0);
        assert!(tm.is_point_in_table_area("t1", 50.0, 50.0));
        assert!(!tm.is_point_in_table_area("t1", 200.0, 200.0));
    }

    #[test]
    fn is_point_in_table_area_without_area_uses_canvas() {
        let mut tm = make_table("t1", 500.0, 500.0);
        tm.set_canvas_size(800.0, 600.0);
        assert!(tm.is_point_in_table_area("t1", 400.0, 300.0));
        assert!(!tm.is_point_in_table_area("t1", 900.0, 300.0));
    }

    #[test]
    fn pan_viewport_moves_and_clamps() {
        let mut tm = make_table("t1", 500.0, 500.0);
        assert!(tm.pan_viewport("t1", 100.0, 50.0));
        let bounds = tm.get_visible_bounds("t1").unwrap();
        // viewport moved from (0,0) by (100,50)/scale=1 → (100,50)
        assert!((bounds[0] - 100.0).abs() < 0.01);
        assert!((bounds[1] - 50.0).abs() < 0.01);
    }

    #[test]
    fn pan_viewport_unknown_table_returns_false() {
        let mut tm = make_table("t1", 500.0, 500.0);
        assert!(!tm.pan_viewport("nope", 10.0, 10.0));
    }

    #[test]
    fn zoom_table_changes_scale() {
        let mut tm = make_table("t1", 500.0, 500.0);
        tm.set_table_screen_area("t1", 0.0, 0.0, 800.0, 600.0);
        assert!(tm.zoom_table("t1", 2.0, 400.0, 300.0));
        let info: TableInfo = serde_json::from_str(&tm.get_table_info("t1").unwrap()).unwrap();
        assert!((info.table_scale - 2.0).abs() < 0.01);
    }

    #[test]
    fn zoom_table_clamps_to_max() {
        let mut tm = make_table("t1", 500.0, 500.0);
        assert!(tm.zoom_table("t1", 100.0, 0.0, 0.0)); // way over max
        let info: TableInfo = serde_json::from_str(&tm.get_table_info("t1").unwrap()).unwrap();
        assert_eq!(info.table_scale, 5.0);
    }

    #[test]
    fn zoom_unknown_table_returns_false() {
        let mut tm = make_table("t1", 500.0, 500.0);
        assert!(!tm.zoom_table("nope", 2.0, 0.0, 0.0));
    }

    #[test]
    fn set_table_grid_changes_grid_props() {
        let mut tm = make_table("t1", 500.0, 500.0);
        assert!(tm.set_table_grid("t1", false, 25.0));
        let info: TableInfo = serde_json::from_str(&tm.get_table_info("t1").unwrap()).unwrap();
        assert!(!info.show_grid);
        assert_eq!(info.cell_side, 25.0);
    }

    #[test]
    fn set_table_grid_clamps_min_cell() {
        let mut tm = make_table("t1", 500.0, 500.0);
        assert!(tm.set_table_grid("t1", true, 1.0));
        let info: TableInfo = serde_json::from_str(&tm.get_table_info("t1").unwrap()).unwrap();
        assert_eq!(info.cell_side, 5.0);
    }

    #[test]
    fn get_all_tables_returns_json_array() {
        let mut tm = make_table("t1", 500.0, 500.0);
        tm.create_table("t2", "Second", 200.0, 200.0).unwrap();
        let json = tm.get_all_tables();
        let tables: Vec<TableInfo> = serde_json::from_str(&json).unwrap();
        assert_eq!(tables.len(), 2);
    }

    #[test]
    fn get_visible_bounds_matches_canvas_size() {
        let mut tm = make_table("t1", 1000.0, 1000.0);
        tm.set_canvas_size(800.0, 600.0);
        // No screen area → use canvas size, scale=1, viewport=0,0
        let bounds = tm.get_visible_bounds("t1").unwrap();
        assert_eq!(bounds, vec![0.0, 0.0, 800.0, 600.0]);
    }

    #[test]
    fn active_table_id_borrow_returns_ref() {
        let tm = make_table("t1", 500.0, 500.0);
        assert_eq!(tm.active_table_id(), Some("t1"));
    }

    #[test]
    fn active_table_screen_area_defaults_to_canvas() {
        let mut tm = make_table("t1", 500.0, 500.0);
        tm.set_canvas_size(1024.0, 768.0);
        let area = tm.get_active_table_screen_area_internal().unwrap();
        assert_eq!(area, (0.0, 0.0, 1024.0, 768.0));
    }

    #[test]
    fn set_table_screen_area_returns_false_for_unknown() {
        let mut tm = make_table("t1", 500.0, 500.0);
        assert!(!tm.set_table_screen_area("nope", 0.0, 0.0, 100.0, 100.0));
    }
}
