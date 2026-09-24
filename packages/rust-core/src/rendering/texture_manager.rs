use crate::texture_policy::{
    estimated_rgba8_bytes, eviction_order, texture_over_budget_bytes, TextureBudgetPolicy,
    TextureResidency,
};
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{HtmlImageElement, WebGl2RenderingContext as WebGlRenderingContext, WebGlTexture};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PendingTextureOutcome {
    Pending,
    Loaded { width: u32, height: u32 },
    Failed,
}

struct PendingTextureLoad {
    image: HtmlImageElement,
    _onload: Closure<dyn FnMut()>,
    _onerror: Closure<dyn FnMut()>,
    outcome: Rc<RefCell<PendingTextureOutcome>>,
}

impl Drop for PendingTextureLoad {
    fn drop(&mut self) {
        self.image.set_onload(None);
        self.image.set_onerror(None);
        if *self.outcome.borrow() == PendingTextureOutcome::Pending {
            self.image.set_src("");
        }
    }
}

struct TextureRecord {
    texture: WebGlTexture,
    width: u32,
    height: u32,
    estimated_bytes: u64,
    last_used_frame: Cell<u64>,
    residency: TextureResidency,
}

pub struct TextureManager {
    textures: HashMap<String, TextureRecord>,
    pending: HashMap<String, PendingTextureLoad>,
    gl: WebGlRenderingContext,
    budget_policy: TextureBudgetPolicy,
    texture_budget_bytes: u64,
    estimated_texture_bytes: u64,
    reserved_renderer_bytes: u64,
    reserved_renderer_textures: usize,
    max_texture_size: u32,
    current_frame: Cell<u64>,
}

impl TextureManager {
    pub fn new(
        gl: WebGlRenderingContext,
        canvas_width: u32,
        canvas_height: u32,
    ) -> Result<Self, JsValue> {
        let max_texture_size = gl
            .get_parameter(WebGlRenderingContext::MAX_TEXTURE_SIZE)?
            .as_f64()
            .filter(|value| value.is_finite() && *value > 0.0)
            .ok_or_else(|| JsValue::from_str("WebGL returned an invalid MAX_TEXTURE_SIZE"))?
            as u32;
        let budget_policy = TextureBudgetPolicy::default();
        Ok(Self {
            textures: HashMap::new(),
            pending: HashMap::new(),
            gl,
            budget_policy,
            texture_budget_bytes: budget_policy.budget_for_canvas(canvas_width, canvas_height),
            estimated_texture_bytes: 0,
            reserved_renderer_bytes: 0,
            reserved_renderer_textures: 0,
            max_texture_size,
            current_frame: Cell::new(0),
        })
    }

    pub fn begin_frame(&self) {
        self.current_frame
            .set(self.current_frame.get().wrapping_add(1));
    }

    pub fn update_canvas_size(&mut self, width: u32, height: u32) {
        self.texture_budget_bytes = self.budget_policy.budget_for_canvas(width, height);
        self.enforce_budget();
    }

    pub fn reserve_renderer_resources(&mut self, bytes: u64, texture_count: usize) {
        self.reserved_renderer_bytes = bytes;
        self.reserved_renderer_textures = texture_count;
        self.enforce_budget();
    }

    pub fn load_texture(&mut self, name: &str, image: &HtmlImageElement) -> Result<(), JsValue> {
        self.load_texture_with_residency(name, image, TextureResidency::SceneRequired)
    }

    fn load_texture_with_residency(
        &mut self,
        name: &str,
        image: &HtmlImageElement,
        residency: TextureResidency,
    ) -> Result<(), JsValue> {
        let width = image.natural_width();
        let height = image.natural_height();
        let estimated_bytes = self.validate_dimensions(width, height)?;
        self.pending.remove(name);
        let texture = self.gl.create_texture().ok_or("Failed to create texture")?;
        self.gl
            .bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(&texture));
        if let Err(error) = self
            .gl
            .tex_image_2d_with_u32_and_u32_and_html_image_element(
                WebGlRenderingContext::TEXTURE_2D,
                0,
                WebGlRenderingContext::RGBA as i32,
                WebGlRenderingContext::RGBA,
                WebGlRenderingContext::UNSIGNED_BYTE,
                image,
            )
        {
            self.gl.delete_texture(Some(&texture));
            return Err(error);
        }
        Self::configure_texture(&self.gl, WebGlRenderingContext::NEAREST as i32);
        self.insert_record(
            name.to_string(),
            TextureRecord {
                texture,
                width,
                height,
                estimated_bytes,
                last_used_frame: Cell::new(self.current_frame.get()),
                residency,
            },
        );
        Ok(())
    }

    pub fn collect_completed_loads(&mut self) {
        let completed: Vec<_> = self
            .pending
            .iter()
            .filter_map(|(name, load)| {
                let outcome = *load.outcome.borrow();
                (outcome != PendingTextureOutcome::Pending).then(|| (name.clone(), outcome))
            })
            .collect();

        for (name, outcome) in completed {
            self.pending.remove(&name);
            match outcome {
                PendingTextureOutcome::Loaded { width, height } => {
                    let Some(estimated_bytes) = estimated_rgba8_bytes(width, height) else {
                        self.remove_record(&name);
                        continue;
                    };
                    if let Some(record) = self.textures.get_mut(&name) {
                        self.estimated_texture_bytes = self
                            .estimated_texture_bytes
                            .saturating_sub(record.estimated_bytes)
                            .saturating_add(estimated_bytes);
                        record.width = width;
                        record.height = height;
                        record.estimated_bytes = estimated_bytes;
                    }
                }
                PendingTextureOutcome::Failed => {
                    self.remove_record(&name);
                }
                PendingTextureOutcome::Pending => {}
            }
        }
        self.enforce_budget();
    }

    pub fn unload_texture(&mut self, name: &str) -> bool {
        self.pending.remove(name);
        self.remove_record(name).is_some()
    }

    pub fn has_texture(&self, name: &str) -> bool {
        self.textures.contains_key(name)
    }

    pub fn resident_texture_count(&self) -> usize {
        self.textures
            .len()
            .saturating_add(self.reserved_renderer_textures)
    }

    pub fn estimated_texture_bytes(&self) -> u64 {
        self.estimated_texture_bytes
            .saturating_add(self.reserved_renderer_bytes)
    }

    pub fn texture_budget_bytes(&self) -> u64 {
        self.texture_budget_bytes
    }

    pub fn texture_over_budget_bytes(&self) -> u64 {
        texture_over_budget_bytes(self.estimated_texture_bytes(), self.texture_budget_bytes)
    }

    pub fn bind_texture(&self, name: &str) {
        if let Some(record) = self.textures.get(name) {
            record.last_used_frame.set(self.current_frame.get());
            self.gl.active_texture(WebGlRenderingContext::TEXTURE0);
            self.gl
                .bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(&record.texture));
        }
    }

    pub fn unbind_texture(&self) {
        self.gl
            .bind_texture(WebGlRenderingContext::TEXTURE_2D, None);
    }

    pub fn load_pinned_texture_from_url(&mut self, name: &str, url: &str) -> Result<(), JsValue> {
        self.load_texture_from_url_with_residency(name, url, TextureResidency::Pinned)
    }

    fn load_texture_from_url_with_residency(
        &mut self,
        name: &str,
        url: &str,
        residency: TextureResidency,
    ) -> Result<(), JsValue> {
        self.pending.remove(name);
        self.collect_completed_loads();
        web_sys::console::log_1(
            &format!("[TEXTURE MANAGER] Loading texture '{}' from: {}", name, url).into(),
        );

        let placeholder_texture = self
            .gl
            .create_texture()
            .ok_or("Failed to create placeholder texture")?;
        self.gl.bind_texture(
            WebGlRenderingContext::TEXTURE_2D,
            Some(&placeholder_texture),
        );
        let white_pixel = [255u8, 255, 255, 255];
        if let Err(error) = self
            .gl
            .tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_u8_array(
                WebGlRenderingContext::TEXTURE_2D,
                0,
                WebGlRenderingContext::RGBA as i32,
                1,
                1,
                0,
                WebGlRenderingContext::RGBA,
                WebGlRenderingContext::UNSIGNED_BYTE,
                Some(&white_pixel),
            )
        {
            self.gl.delete_texture(Some(&placeholder_texture));
            return Err(error);
        }
        self.insert_record(
            name.to_string(),
            TextureRecord {
                texture: placeholder_texture.clone(),
                width: 1,
                height: 1,
                estimated_bytes: 4,
                last_used_frame: Cell::new(self.current_frame.get()),
                residency,
            },
        );

        let image = match HtmlImageElement::new() {
            Ok(image) => image,
            Err(error) => {
                self.remove_record(name);
                return Err(error);
            }
        };
        image.set_cross_origin(Some("anonymous"));

        let gl = self.gl.clone();
        let texture = placeholder_texture;
        let texture_name = name.to_string();
        let image_for_onload = image.clone();
        let outcome = Rc::new(RefCell::new(PendingTextureOutcome::Pending));
        let outcome_onload = outcome.clone();
        let max_texture_size = self.max_texture_size;
        let onload = Closure::wrap(Box::new(move || {
            image_for_onload.set_onload(None);
            image_for_onload.set_onerror(None);
            let width = image_for_onload.natural_width();
            let height = image_for_onload.natural_height();
            if width == 0
                || height == 0
                || width > max_texture_size
                || height > max_texture_size
                || estimated_rgba8_bytes(width, height).is_none()
            {
                *outcome_onload.borrow_mut() = PendingTextureOutcome::Failed;
                web_sys::console::error_1(
                    &format!(
                        "[ERR] [TEXTURE MANAGER] Unsupported texture '{}' dimensions {}x{}",
                        texture_name, width, height
                    )
                    .into(),
                );
                return;
            }

            gl.bind_texture(WebGlRenderingContext::TEXTURE_2D, Some(&texture));
            match gl.tex_image_2d_with_u32_and_u32_and_html_image_element(
                WebGlRenderingContext::TEXTURE_2D,
                0,
                WebGlRenderingContext::RGBA as i32,
                WebGlRenderingContext::RGBA,
                WebGlRenderingContext::UNSIGNED_BYTE,
                &image_for_onload,
            ) {
                Ok(_) => {
                    Self::configure_texture(&gl, WebGlRenderingContext::LINEAR as i32);
                    *outcome_onload.borrow_mut() = PendingTextureOutcome::Loaded { width, height };
                }
                Err(error) => {
                    *outcome_onload.borrow_mut() = PendingTextureOutcome::Failed;
                    web_sys::console::error_1(
                        &format!(
                            "[ERR] [TEXTURE MANAGER] Failed to upload texture '{}': {:?}",
                            texture_name, error
                        )
                        .into(),
                    );
                }
            }
        }) as Box<dyn FnMut()>);
        image.set_onload(Some(onload.as_ref().unchecked_ref()));

        let error_name = name.to_string();
        let error_url = url.to_string();
        let error_image = image.clone();
        let outcome_onerror = outcome.clone();
        let onerror = Closure::wrap(Box::new(move || {
            error_image.set_onload(None);
            error_image.set_onerror(None);
            *outcome_onerror.borrow_mut() = PendingTextureOutcome::Failed;
            web_sys::console::error_1(
                &format!(
                    "[ERR] [TEXTURE MANAGER] Failed to load texture '{}' from {}",
                    error_name, error_url
                )
                .into(),
            );
        }) as Box<dyn FnMut()>);
        image.set_onerror(Some(onerror.as_ref().unchecked_ref()));
        self.pending.insert(
            name.to_string(),
            PendingTextureLoad {
                image: image.clone(),
                _onload: onload,
                _onerror: onerror,
                outcome,
            },
        );
        image.set_src(url);
        Ok(())
    }

    fn validate_dimensions(&self, width: u32, height: u32) -> Result<u64, JsValue> {
        if width == 0 || height == 0 {
            return Err(JsValue::from_str("Texture dimensions must be non-zero"));
        }
        if width > self.max_texture_size || height > self.max_texture_size {
            return Err(JsValue::from_str(&format!(
                "Texture dimensions {width}x{height} exceed WebGL MAX_TEXTURE_SIZE {}",
                self.max_texture_size
            )));
        }
        estimated_rgba8_bytes(width, height)
            .ok_or_else(|| JsValue::from_str("Estimated RGBA8 texture size overflowed u64"))
    }

    fn configure_texture(gl: &WebGlRenderingContext, filter: i32) {
        gl.tex_parameteri(
            WebGlRenderingContext::TEXTURE_2D,
            WebGlRenderingContext::TEXTURE_MIN_FILTER,
            filter,
        );
        gl.tex_parameteri(
            WebGlRenderingContext::TEXTURE_2D,
            WebGlRenderingContext::TEXTURE_MAG_FILTER,
            filter,
        );
        gl.tex_parameteri(
            WebGlRenderingContext::TEXTURE_2D,
            WebGlRenderingContext::TEXTURE_WRAP_S,
            WebGlRenderingContext::CLAMP_TO_EDGE as i32,
        );
        gl.tex_parameteri(
            WebGlRenderingContext::TEXTURE_2D,
            WebGlRenderingContext::TEXTURE_WRAP_T,
            WebGlRenderingContext::CLAMP_TO_EDGE as i32,
        );
    }

    fn insert_record(&mut self, name: String, record: TextureRecord) {
        let estimated_bytes = record.estimated_bytes;
        if let Some(old) = self.textures.insert(name, record) {
            self.estimated_texture_bytes = self
                .estimated_texture_bytes
                .saturating_sub(old.estimated_bytes);
            self.gl.delete_texture(Some(&old.texture));
        }
        self.estimated_texture_bytes = self.estimated_texture_bytes.saturating_add(estimated_bytes);
        self.enforce_budget();
    }

    fn remove_record(&mut self, name: &str) -> Option<TextureRecord> {
        let record = self.textures.remove(name)?;
        self.estimated_texture_bytes = self
            .estimated_texture_bytes
            .saturating_sub(record.estimated_bytes);
        self.gl.delete_texture(Some(&record.texture));
        Some(record)
    }

    fn enforce_budget(&mut self) {
        if self.estimated_texture_bytes() <= self.texture_budget_bytes {
            return;
        }
        let candidates = eviction_order(
            self.textures
                .iter()
                .map(|(name, record)| {
                    (name.clone(), record.last_used_frame.get(), record.residency)
                })
                .collect(),
        );
        for name in candidates {
            self.pending.remove(&name);
            self.remove_record(&name);
            if self.estimated_texture_bytes() <= self.texture_budget_bytes {
                break;
            }
        }
    }
}

impl Drop for TextureManager {
    fn drop(&mut self) {
        self.pending.clear();
        for (_, record) in self.textures.drain() {
            self.gl.delete_texture(Some(&record.texture));
        }
        self.estimated_texture_bytes = 0;
    }
}
