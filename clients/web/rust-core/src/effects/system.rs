use crate::graphics::GraphicsSystem;

pub struct EffectsSystem {
    ambient_light: f32,
    light_sources: Vec<LightSource>,
}

#[derive(Debug, Clone)]
pub struct LightSource {
    pub x: f32,
    pub y: f32,
    pub radius: f32,
    pub intensity: f32,
    pub color: (f32, f32, f32), // RGB values 0-1
}

impl EffectsSystem {
    pub fn new(_canvas: &web_sys::HtmlCanvasElement) -> Result<Self, String> {
        Ok(Self {
            ambient_light: 0.3,
            light_sources: Vec::new(),
        })
    }

    pub fn apply_lighting(&self, graphics: &mut GraphicsSystem) -> Result<(), String> {
        let context = graphics.context();
        
        // Apply ambient lighting effect
        context.set_global_alpha(self.ambient_light as f64);
        
        // For each light source, create a radial gradient
        for light in &self.light_sources {
            let gradient = context
                .create_radial_gradient(
                    light.x as f64, light.y as f64, 0.0,
                    light.x as f64, light.y as f64, light.radius as f64
                )
                .map_err(|_| "Failed to create radial gradient")?;

            let color_str = format!(
                "rgba({}, {}, {}, {})", 
                (light.color.0 * 255.0) as u8,
                (light.color.1 * 255.0) as u8,
                (light.color.2 * 255.0) as u8,
                light.intensity
            );

            gradient.add_color_stop(0.0, &color_str)
                .map_err(|_| "Failed to add color stop")?;
            gradient.add_color_stop(1.0, "rgba(0, 0, 0, 0)")
                .map_err(|_| "Failed to add color stop")?;

            context.set_fill_style(&gradient);
            context.set_global_composite_operation("lighter")
                .map_err(|_| "Failed to set composite operation")?;
            
            context.fill_rect(
                (light.x - light.radius) as f64,
                (light.y - light.radius) as f64,
                (light.radius * 2.0) as f64,
                (light.radius * 2.0) as f64
            );
        }

        // Reset to default
        context.set_global_alpha(1.0);
        context.set_global_composite_operation("source-over")
            .map_err(|_| "Failed to reset composite operation")?;

        Ok(())
    }

    pub fn add_light_source(&mut self, light: LightSource) {
        self.light_sources.push(light);
    }

    pub fn remove_light_source(&mut self, index: usize) -> Option<LightSource> {
        if index < self.light_sources.len() {
            Some(self.light_sources.remove(index))
        } else {
            None
        }
    }

    pub fn set_ambient_light(&mut self, intensity: f32) {
        self.ambient_light = intensity.clamp(0.0, 1.0);
    }

    pub fn get_ambient_light(&self) -> f32 {
        self.ambient_light
    }

    pub fn clear_light_sources(&mut self) {
        self.light_sources.clear();
    }

    pub fn add_test_lighting(&mut self) {
        self.add_light_source(LightSource {
            x: 200.0,
            y: 200.0,
            radius: 100.0,
            intensity: 0.8,
            color: (1.0, 1.0, 0.8), // Warm white
        });
    }
}