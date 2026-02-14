use web_sys::*;
use wasm_bindgen::JsCast;

pub struct GraphicsSystem {
    canvas: HtmlCanvasElement,
    context: CanvasRenderingContext2d,
    width: f32,
    height: f32,
    scale_factor: f32,
}

impl GraphicsSystem {
    pub fn new(canvas: &HtmlCanvasElement) -> Result<Self, String> {
        let context = canvas
            .get_context("2d")
            .map_err(|_| "Failed to get 2d context")?
            .ok_or("Context is None")?
            .dyn_into::<CanvasRenderingContext2d>()
            .map_err(|_| "Failed to cast to CanvasRenderingContext2d")?;

        let width = canvas.width() as f32;
        let height = canvas.height() as f32;

        Ok(Self {
            canvas: canvas.clone(),
            context,
            width,
            height,
            scale_factor: 1.0,
        })
    }

    pub fn render(&self, scene: &crate::content::Scene) -> Result<(), String> {
        // Clear canvas
        self.context.clear_rect(0.0, 0.0, self.width as f64, self.height as f64);

        // Set background
        self.context.set_fill_style(&wasm_bindgen::JsValue::from_str("black"));
        self.context.fill_rect(0.0, 0.0, self.width as f64, self.height as f64);

        // Render scene items
        for item in &scene.items {
            self.render_item(item)?;
        }

        Ok(())
    }

    fn render_item(&self, item: &crate::content::SceneItem) -> Result<(), String> {
        match item {
            crate::content::SceneItem::Sprite { x, y, texture_id, scale } => {
                self.render_sprite(*x, *y, texture_id, *scale)
            },
            crate::content::SceneItem::Text { x, y, content, color } => {
                self.render_text(*x, *y, content, color)
            },
        }
    }

    fn render_sprite(&self, x: f32, y: f32, _texture_id: &str, scale: f32) -> Result<(), String> {
        // For now, just draw a colored rectangle
        self.context.set_fill_style(&wasm_bindgen::JsValue::from_str("blue"));
        let size = 32.0 * scale * self.scale_factor;
        self.context.fill_rect(
            (x * self.scale_factor) as f64,
            (y * self.scale_factor) as f64,
            size as f64,
            size as f64
        );
        Ok(())
    }

    fn render_text(&self, x: f32, y: f32, text: &str, color: &str) -> Result<(), String> {
        self.context.set_font("16px monospace");
        self.context.set_fill_style(&wasm_bindgen::JsValue::from_str(color));
        self.context.fill_text(text, (x * self.scale_factor) as f64, (y * self.scale_factor) as f64)
            .map_err(|_| "Failed to render text")?;
        Ok(())
    }

    pub fn resize(&mut self, width: f32, height: f32) -> Result<(), String> {
        self.width = width;
        self.height = height;
        self.canvas.set_width(width as u32);
        self.canvas.set_height(height as u32);
        
        // Calculate scale factor based on device pixel ratio
        let window = web_sys::window().ok_or("No window available")?;
        self.scale_factor = window.device_pixel_ratio() as f32;
        
        Ok(())
    }

    pub fn get_dimensions(&self) -> (f32, f32) {
        (self.width, self.height)
    }

    pub fn get_scale_factor(&self) -> f32 {
        self.scale_factor
    }

    pub fn context(&self) -> &CanvasRenderingContext2d {
        &self.context
    }
}