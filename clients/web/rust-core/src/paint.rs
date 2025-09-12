use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use crate::math::Vec2;
use crate::webgl_renderer::WebGLRenderer;
use crate::types::BlendMode;

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
    
    pub fn is_empty(&self) -> bool {
        self.points.is_empty()
    }
    

}

#[wasm_bindgen]
pub struct PaintSystem {
    strokes: Vec<DrawStroke>,
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
    
    // Event callbacks
    stroke_callbacks: HashMap<String, js_sys::Function>,
}

#[wasm_bindgen]
impl PaintSystem {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            strokes: Vec::new(),
            current_stroke: None,
            is_drawing: false,
            current_color: [1.0, 1.0, 1.0, 1.0], // White
            current_width: 2.0,
            current_blend_mode: BlendMode::Alpha,
            canvas_width: 800.0,
            canvas_height: 600.0,
            paint_mode: false,
            last_point: None,
            stroke_callbacks: HashMap::new(),
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
    
    #[wasm_bindgen]
    pub fn is_paint_mode(&self) -> bool {
        self.paint_mode
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
    
    #[wasm_bindgen]
    pub fn get_brush_color(&self) -> Vec<f32> {
        self.current_color.to_vec()
    }
    
    #[wasm_bindgen]
    pub fn get_brush_width(&self) -> f32 {
        self.current_width
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
        
        self.emit_stroke_started();
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
                    self.emit_stroke_updated();
                    return true;
                }
            } else {
                stroke.add_point(world_x, world_y, pressure);
                self.last_point = Some(current);
                self.emit_stroke_updated();
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
                self.strokes.push(stroke);
                self.emit_stroke_completed();
            }
        }
        
        self.is_drawing = false;
        self.last_point = None;
        true
    }
    
    #[wasm_bindgen]
    pub fn cancel_stroke(&mut self) {
        self.current_stroke = None;
        self.is_drawing = false;
        self.last_point = None;
        self.emit_stroke_cancelled();
    }
    
    // Stroke management
    #[wasm_bindgen]
    pub fn clear_all_strokes(&mut self) {
        self.strokes.clear();
        self.current_stroke = None;
        self.is_drawing = false;
        self.last_point = None;
        self.emit_canvas_cleared();
    }
    
    #[wasm_bindgen]
    pub fn undo_last_stroke(&mut self) -> bool {
        if !self.strokes.is_empty() {
            self.strokes.pop();
            self.emit_stroke_undone();
            return true;
        }
        false
    }
    
    #[wasm_bindgen]
    pub fn get_stroke_count(&self) -> usize {
        self.strokes.len()
    }
    
    #[wasm_bindgen]
    pub fn is_drawing(&self) -> bool {
        self.is_drawing
    }
    
    // Stroke data access for rendering
    #[wasm_bindgen]
    pub fn get_all_strokes_json(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.strokes).unwrap_or(JsValue::NULL)
    }
    
    #[wasm_bindgen]
    pub fn get_current_stroke_json(&self) -> JsValue {
        if let Some(ref stroke) = self.current_stroke {
            serde_wasm_bindgen::to_value(stroke).unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        }
    }
    
    // Event system
    #[wasm_bindgen]
    pub fn on_stroke_event(&mut self, event_type: &str, callback: js_sys::Function) {
        self.stroke_callbacks.insert(event_type.to_string(), callback);
    }
    
    #[wasm_bindgen]
    pub fn remove_stroke_event(&mut self, event_type: &str) {
        self.stroke_callbacks.remove(event_type);
    }
    
    // Get stroke data for sprite conversion
    pub fn get_all_strokes_data(&self) -> Vec<String> {
        self.strokes.iter().map(|stroke| {
            serde_json::to_string(stroke).unwrap_or_else(|_| {
                format!("stroke_{}_{}_{}_{}", 
                    stroke.id, 
                    stroke.points.len(), 
                    stroke.color[0], 
                    stroke.width)
            })
        }).collect()
    }
    
    // Get stroke bounds for sprite positioning (internal use only)
    fn get_stroke_bounds(&self, stroke: &DrawStroke) -> (Vec2, Vec2) {
        if stroke.points.is_empty() {
            return (Vec2::new(0.0, 0.0), Vec2::new(0.0, 0.0));
        }
        
        let mut min_x = stroke.points[0].x;
        let mut min_y = stroke.points[0].y;
        let mut max_x = stroke.points[0].x;
        let mut max_y = stroke.points[0].y;
        
        for point in &stroke.points {
            min_x = min_x.min(point.x);
            min_y = min_y.min(point.y);
            max_x = max_x.max(point.x);
            max_y = max_y.max(point.y);
        }
        
        // Add padding for stroke width
        let padding = stroke.width * 0.5;
        (
            Vec2::new(min_x - padding, min_y - padding),
            Vec2::new(max_x + padding, max_y + padding)
        )
    }
    

    
    // WASM-safe method to get stroke data for sprite conversion
    #[wasm_bindgen]
    pub fn get_strokes_data_json(&self) -> JsValue {
        let stroke_data: Vec<_> = self.strokes.iter().map(|stroke| {
            let (min, max) = self.get_stroke_bounds(stroke);
            serde_json::json!({
                "id": stroke.id,
                "min_x": min.x,
                "min_y": min.y,
                "max_x": max.x,
                "max_y": max.y,
                "color": stroke.color,
                "width": stroke.width,
                "points": stroke.points
            })
        }).collect();
        
        serde_wasm_bindgen::to_value(&stroke_data).unwrap_or(JsValue::NULL)
    }
}

impl PaintSystem {
    // Rendering helpers (called from render engine)
    pub fn render_strokes(&self, renderer: &WebGLRenderer) -> Result<(), JsValue> {
        // Render all completed strokes
        for stroke in &self.strokes {
            self.render_stroke(stroke, renderer)?;
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
    
    // Event emission helpers
    fn emit_stroke_started(&self) {
        if let Some(callback) = self.stroke_callbacks.get("stroke_started") {
            let _ = callback.call0(&JsValue::NULL);
        }
    }
    
    fn emit_stroke_updated(&self) {
        if let Some(callback) = self.stroke_callbacks.get("stroke_updated") {
            let _ = callback.call0(&JsValue::NULL);
        }
    }
    
    fn emit_stroke_completed(&self) {
        if let Some(callback) = self.stroke_callbacks.get("stroke_completed") {
            let _ = callback.call0(&JsValue::NULL);
        }
    }
    
    fn emit_stroke_cancelled(&self) {
        if let Some(callback) = self.stroke_callbacks.get("stroke_cancelled") {
            let _ = callback.call0(&JsValue::NULL);
        }
    }
    
    fn emit_stroke_undone(&self) {
        if let Some(callback) = self.stroke_callbacks.get("stroke_undone") {
            let _ = callback.call0(&JsValue::NULL);
        }
    }
    
    fn emit_canvas_cleared(&self) {
        if let Some(callback) = self.stroke_callbacks.get("canvas_cleared") {
            let _ = callback.call0(&JsValue::NULL);
        }
    }
}

// Preset brush configurations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[wasm_bindgen]
pub struct BrushPreset {
    color: [f32; 4],
    width: f32,
    blend_mode: BlendMode,
}

#[wasm_bindgen]
impl BrushPreset {
    #[wasm_bindgen(constructor)]
    pub fn new(r: f32, g: f32, b: f32, a: f32, width: f32, blend_mode: &str) -> Self {
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
    
    #[wasm_bindgen]
    pub fn apply_to_paint_system(&self, paint_system: &mut PaintSystem) {
        paint_system.set_brush_color(self.color[0], self.color[1], self.color[2], self.color[3]);
        paint_system.set_brush_width(self.width);
        
        let blend_str = match self.blend_mode {
            BlendMode::Alpha => "alpha",
            BlendMode::Additive => "additive",
            BlendMode::Modulate => "modulate",
            BlendMode::Multiply => "multiply",
        };
        paint_system.set_blend_mode(blend_str);
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
