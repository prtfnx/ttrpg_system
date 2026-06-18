use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use crate::math::Vec2;
use crate::webgl_renderer::WebGLRenderer;
use crate::types::BlendMode;

#[wasm_bindgen]
pub struct PaintSystem {
    // Per-table paint storage
    table_strokes: HashMap<String, Vec<DrawStroke>>,
    table_redo_stacks: HashMap<String, Vec<DrawStroke>>,
    current_table_id: Option<String>,
    
    current_stroke: Option<DrawStroke>,
    is_drawing: bool,
    
    // Brush settings
    current_color: [f32; 4],
    current_width: f32,
    current_blend_mode: BlendMode,
    
    // Canvas settings
    canvas_width: f32,
    canvas_height: f32,
    paint_mode: bool,
    
    // Drawing state
    last_point: Option<Vec2>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrawPoint {
    pub x: f32,
    pub y: f32,
    pub pressure: f32,
}

impl DrawPoint {
    pub fn new(x: f32, y: f32, pressure: f32) -> Self {
        Self { x, y, pressure }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrawStroke {
    pub points: Vec<DrawPoint>,
    pub color: [f32; 4], // RGBA
    pub width: f32,
    pub blend_mode: BlendMode,
    pub id: String,
}

impl DrawStroke {
    pub fn new(color: [f32; 4], width: f32) -> Self {
        Self {
            points: Vec::new(),
            color,
            width,
            blend_mode: BlendMode::Alpha,
            id: format!("stroke_{}", js_sys::Math::random()),
        }
    }
    
    pub fn add_point(&mut self, x: f32, y: f32, pressure: f32) {
        self.points.push(DrawPoint::new(x, y, pressure));
    }
}

// Duplicate struct definition removed - using the complete one above

#[wasm_bindgen]
impl PaintSystem {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            table_strokes: HashMap::new(),
            table_redo_stacks: HashMap::new(),
            current_table_id: None,
            current_stroke: None,
            is_drawing: false,
            current_color: [1.0, 1.0, 1.0, 1.0], // White
            current_width: 2.0,
            current_blend_mode: BlendMode::Alpha,
            canvas_width: 800.0,
            canvas_height: 600.0,
            paint_mode: false,
            last_point: None,
        }
    }
    
    // Table management
    #[wasm_bindgen]
    pub fn set_current_table(&mut self, table_id: &str) {
        let table_id_string = table_id.to_string();
        self.current_table_id = Some(table_id_string.clone());
        
        // Initialize table storage if it doesn't exist
        if !self.table_strokes.contains_key(&table_id_string) {
            self.table_strokes.insert(table_id_string.clone(), Vec::new());
            self.table_redo_stacks.insert(table_id_string, Vec::new());
            web_sys::console::log_1(&format!("Initialized paint storage for table: {}", table_id).into());
        } else {
            web_sys::console::log_1(&format!("Switched to table: {}", table_id).into());
        }
    }
    
    // Helper to get current table's strokes (mutable)
    fn get_current_strokes_mut(&mut self) -> Option<&mut Vec<DrawStroke>> {
        if let Some(ref table_id) = self.current_table_id {
            self.table_strokes.get_mut(table_id)
        } else {
            None
        }
    }
    
    // Helper to get current table's strokes (immutable)
    fn get_current_strokes(&self) -> Option<&Vec<DrawStroke>> {
        if let Some(ref table_id) = self.current_table_id {
            self.table_strokes.get(table_id)
        } else {
            None
        }
    }
    
    // Helper to get current table's redo stack (mutable)
    fn get_current_redo_stack_mut(&mut self) -> Option<&mut Vec<DrawStroke>> {
        if let Some(ref table_id) = self.current_table_id {
            self.table_redo_stacks.get_mut(table_id)
        } else {
            None
        }
    }
    
    // Canvas management
    #[wasm_bindgen]
    pub fn enter_paint_mode(&mut self, width: f32, height: f32) {
        self.canvas_width = width;
        self.canvas_height = height;
        self.paint_mode = true;
        web_sys::console::log_1(&"Entered paint mode".into());
    }
    
    #[wasm_bindgen]
    pub fn exit_paint_mode(&mut self) {
        self.paint_mode = false;
        self.is_drawing = false;
        self.current_stroke = None;
        self.last_point = None;
        web_sys::console::log_1(&"Exited paint mode".into());
    }
    
    // Brush settings
    #[wasm_bindgen]
    pub fn set_brush_color(&mut self, r: f32, g: f32, b: f32, a: f32) {
        self.current_color = [r, g, b, a];
    }
    
    #[wasm_bindgen]
    pub fn set_brush_width(&mut self, width: f32) {
        self.current_width = width.max(0.5);
    }
    
    #[wasm_bindgen]
    pub fn set_blend_mode(&mut self, blend_mode: &str) {
        self.current_blend_mode = match blend_mode {
            "alpha" => BlendMode::Alpha,
            "additive" => BlendMode::Additive,
            "modulate" => BlendMode::Modulate,
            "multiply" => BlendMode::Multiply,
            _ => BlendMode::Alpha,
        };
    }
    
    // Drawing operations
    #[wasm_bindgen]
    pub fn start_stroke(&mut self, world_x: f32, world_y: f32, pressure: f32) -> bool {
        if !self.paint_mode {
            return false;
        }
        
        let mut stroke = DrawStroke::new(self.current_color, self.current_width);
        stroke.blend_mode = self.current_blend_mode.clone();
        stroke.add_point(world_x, world_y, pressure);
        
        self.current_stroke = Some(stroke);
        self.is_drawing = true;
        self.last_point = Some(Vec2::new(world_x, world_y));
        
        true
    }
    
    #[wasm_bindgen]
    pub fn add_stroke_point(&mut self, world_x: f32, world_y: f32, pressure: f32) -> bool {
        if !self.is_drawing {
            return false;
        }
        
        if let Some(ref mut stroke) = self.current_stroke {
            let current = Vec2::new(world_x, world_y);
            
            // Always add points for smooth strokes, with minimal distance filtering
            if let Some(last) = self.last_point {
                let distance = (current - last).length();
                
                // Use much smaller threshold to maintain stroke continuity
                if distance > 0.2 {
                    // Add intermediate points if the distance is large to avoid gaps
                    if distance > 3.0 {
                        let steps = (distance / 2.0).ceil() as i32;
                        for i in 1..steps {
                            let t = i as f32 / steps as f32;
                            let interp_x = last.x + (current.x - last.x) * t;
                            let interp_y = last.y + (current.y - last.y) * t;
                            stroke.add_point(interp_x, interp_y, pressure);
                        }
                    }
                    
                    stroke.add_point(world_x, world_y, pressure);
                    self.last_point = Some(current);
                    return true;
                }
            } else {
                stroke.add_point(world_x, world_y, pressure);
                self.last_point = Some(current);
                return true;
            }
        }
        false
    }
    
    #[wasm_bindgen]
    pub fn end_stroke(&mut self) -> bool {
        if !self.is_drawing {
            return false;
        }
        
        if let Some(stroke) = self.current_stroke.take() {
            if stroke.points.len() > 1 {
                // Add to current table's strokes
                if let Some(strokes) = self.get_current_strokes_mut() {
                    strokes.push(stroke);
                    // Clear current table's redo stack
                    if let Some(redo_stack) = self.get_current_redo_stack_mut() {
                        redo_stack.clear();
                    }
                } else {
                    web_sys::console::warn_1(&"No current table set for paint stroke".into());
                }
            }
        }
        
        self.is_drawing = false;
        self.last_point = None;
        true
    }
    
    // Stroke management
    #[wasm_bindgen]
    pub fn clear_all_strokes(&mut self) {
        if let Some(strokes) = self.get_current_strokes_mut() {
            strokes.clear();
            web_sys::console::log_1(&"Cleared strokes for current table".into());
        }
        if let Some(redo_stack) = self.get_current_redo_stack_mut() {
            redo_stack.clear();
        }
        self.current_stroke = None;
        self.is_drawing = false;
        self.last_point = None;
    }
    
    #[wasm_bindgen]
    pub fn undo_last_stroke(&mut self) -> bool {
        if let Some(strokes) = self.get_current_strokes_mut() {
            if !strokes.is_empty() {
                let stroke = strokes.pop().unwrap();
                if let Some(redo_stack) = self.get_current_redo_stack_mut() {
                    redo_stack.push(stroke);
                }
                return true;
            }
        }
        false
    }
    
    #[wasm_bindgen]
    pub fn redo_last_stroke(&mut self) -> bool {
        if let Some(redo_stack) = self.get_current_redo_stack_mut() {
            if !redo_stack.is_empty() {
                let stroke = redo_stack.pop().unwrap();
                if let Some(strokes) = self.get_current_strokes_mut() {
                    strokes.push(stroke);
                }
                return true;
            }
        }
        false
    }
    
    #[wasm_bindgen]
    pub fn can_undo(&self) -> bool {
        if let Some(strokes) = self.get_current_strokes() {
            !strokes.is_empty()
        } else {
            false
        }
    }
    
    #[wasm_bindgen]
    pub fn can_redo(&self) -> bool {
        if let Some(ref table_id) = self.current_table_id {
            if let Some(redo_stack) = self.table_redo_stacks.get(table_id) {
                return !redo_stack.is_empty();
            }
        }
        false
    }
    // Stroke data access for rendering
    #[wasm_bindgen]
    pub fn get_all_strokes_json(&self) -> JsValue {
        if let Some(strokes) = self.get_current_strokes() {
            serde_wasm_bindgen::to_value(strokes).unwrap_or(JsValue::NULL)
        } else {
            serde_wasm_bindgen::to_value(&Vec::<DrawStroke>::new()).unwrap_or(JsValue::NULL)
        }
    }
    /// Add a stroke from a remote client (already-serialized JSON blob from server).
    #[wasm_bindgen]
    pub fn add_remote_stroke_json(&mut self, stroke_json: &str) -> bool {
        match serde_json::from_str::<DrawStroke>(stroke_json) {
            Ok(stroke) => {
                if let Some(table_id) = self.current_table_id.clone() {
                    self.table_strokes.entry(table_id).or_default().push(stroke);
                    return true;
                }
                web_sys::console::warn_1(&"add_remote_stroke_json: no current table".into());
                false
            }
            Err(e) => {
                web_sys::console::warn_1(&format!("add_remote_stroke_json parse error: {}", e).into());
                false
            }
        }
    }

    /// Remove a specific stroke by its id from the current table.
    #[wasm_bindgen]
    pub fn remove_stroke_by_id(&mut self, stroke_id: &str) -> bool {
        if let Some(table_id) = self.current_table_id.clone() {
            if let Some(strokes) = self.table_strokes.get_mut(&table_id) {
                let before = strokes.len();
                strokes.retain(|s| s.id != stroke_id);
                return strokes.len() < before;
            }
        }
        false
    }

    /// Bulk-load a JSON array of DrawStroke objects, replacing all existing strokes for the current table.
    #[wasm_bindgen]
    pub fn load_strokes_json(&mut self, strokes_json: &str) -> bool {
        match serde_json::from_str::<Vec<DrawStroke>>(strokes_json) {
            Ok(strokes) => {
                if let Some(table_id) = self.current_table_id.clone() {
                    self.table_strokes.insert(table_id, strokes);
                    return true;
                }
                web_sys::console::warn_1(&"load_strokes_json: no current table".into());
                false
            }
            Err(e) => {
                web_sys::console::warn_1(&format!("load_strokes_json parse error: {}", e).into());
                false
            }
        }
    }
}

impl PaintSystem {
    pub(crate) fn cancel_stroke(&mut self) {
        self.current_stroke = None;
        self.is_drawing = false;
        self.last_point = None;
    }

    // Rendering helpers (called from render engine)
    pub fn render_strokes(&self, renderer: &WebGLRenderer) -> Result<(), JsValue> {
        // Render all completed strokes for current table
        if let Some(strokes) = self.get_current_strokes() {
            for stroke in strokes {
                self.render_stroke(stroke, renderer)?;
            }
        }
        
        // Render current stroke being drawn
        if let Some(ref stroke) = self.current_stroke {
            self.render_stroke(stroke, renderer)?;
        }
        
        Ok(())
    }
    
    fn render_stroke(&self, stroke: &DrawStroke, renderer: &WebGLRenderer) -> Result<(), JsValue> {
        if stroke.points.len() < 2 {
            return Ok(());
        }
        
        // Set blend mode for this stroke
        renderer.set_blend_mode(&stroke.blend_mode);
        
        // Simple approach: just extract x,y coordinates for LINE_STRIP
        let mut vertices = Vec::new();
        for point in &stroke.points {
            vertices.push(point.x);
            vertices.push(point.y);
        }
        
        if !vertices.is_empty() {
            // Use WebGL's built-in line rendering with lineWidth and LINE_STRIP
            renderer.draw_line_strip(&vertices, stroke.color, stroke.width)?;
        }
        
        Ok(())
    }
}

// Preset brush configurations
#[derive(Debug, Clone, Serialize, Deserialize)]
struct BrushPreset {
    color: [f32; 4],
    width: f32,
    blend_mode: BlendMode,
}

impl BrushPreset {
    fn new(r: f32, g: f32, b: f32, a: f32, width: f32, blend_mode: &str) -> Self {
        let blend = match blend_mode {
            "alpha" => BlendMode::Alpha,
            "additive" => BlendMode::Additive,
            "modulate" => BlendMode::Modulate,
            "multiply" => BlendMode::Multiply,
            _ => BlendMode::Alpha,
        };
        
        Self {
            color: [r, g, b, a],
            width,
            blend_mode: blend,
        }
    }
}

// Utility functions for common brush presets
#[wasm_bindgen]
pub fn create_default_brush_presets() -> Vec<JsValue> {
    let presets = vec![
        BrushPreset::new(1.0, 0.0, 0.0, 1.0, 3.0, "alpha"),     // Red marker
        BrushPreset::new(0.0, 1.0, 0.0, 1.0, 3.0, "alpha"),     // Green marker  
        BrushPreset::new(0.0, 0.0, 1.0, 1.0, 3.0, "alpha"),     // Blue marker
        BrushPreset::new(1.0, 1.0, 0.0, 1.0, 5.0, "alpha"),     // Yellow highlighter
        BrushPreset::new(1.0, 0.5, 0.0, 0.8, 8.0, "additive"),  // Orange glow
        BrushPreset::new(0.0, 0.0, 0.0, 1.0, 2.0, "multiply"),  // Black pen
        BrushPreset::new(1.0, 1.0, 1.0, 0.3, 12.0, "alpha"),    // White eraser
    ];
    
    presets.into_iter()
        .map(|preset| serde_wasm_bindgen::to_value(&preset).unwrap_or(JsValue::NULL))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{DrawPoint, DrawStroke};
    use crate::types::BlendMode;

    #[test]
    fn draw_point_stores_values() {
        let p = DrawPoint::new(1.5, 2.5, 0.8);
        assert_eq!(p.x, 1.5);
        assert_eq!(p.y, 2.5);
        assert_eq!(p.pressure, 0.8);
    }

    #[test]
    fn draw_stroke_starts_empty() {
        let s = DrawStroke {
            points: Vec::new(),
            color: [1.0, 0.0, 0.0, 1.0],
            width: 3.0,
            blend_mode: BlendMode::Alpha,
            id: "test".into(),
        };
        assert!(s.points.is_empty());
        assert_eq!(s.width, 3.0);
    }

    #[test]
    fn draw_stroke_add_point() {
        let mut s = DrawStroke {
            points: Vec::new(),
            color: [1.0, 1.0, 1.0, 1.0],
            width: 2.0,
            blend_mode: BlendMode::Alpha,
            id: "s1".into(),
        };
        s.add_point(10.0, 20.0, 1.0);
        s.add_point(15.0, 25.0, 0.5);
        assert_eq!(s.points.len(), 2);
        assert_eq!(s.points[0].x, 10.0);
        assert_eq!(s.points[1].pressure, 0.5);
    }

    #[test]
    fn draw_stroke_serde_roundtrip() {
        let s = DrawStroke {
            points: vec![DrawPoint::new(1.0, 2.0, 1.0)],
            color: [0.5, 0.5, 0.5, 1.0],
            width: 4.0,
            blend_mode: BlendMode::Additive,
            id: "rt".into(),
        };
        let json = serde_json::to_string(&s).unwrap();
        let s2: DrawStroke = serde_json::from_str(&json).unwrap();
        assert_eq!(s2.id, "rt");
        assert_eq!(s2.points.len(), 1);
        assert_eq!(s2.width, 4.0);
    }
}
