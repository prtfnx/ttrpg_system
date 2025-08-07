use wasm_bindgen::prelude::*;

macro_rules! console_log {
    ($($t:tt)*) => (web_sys::console::log_1(&format_args!($($t)*).to_string().into()))
}

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

mod math;
mod render;
mod types;
mod camera;
mod input;
mod sprite_manager;
mod webgl_renderer;
mod lighting;
mod fog;

pub use render::RenderEngine;
pub use types::*;
pub use lighting::{Light, LightingSystem};

use web_sys::HtmlCanvasElement;

#[wasm_bindgen]
pub fn init_game_renderer(canvas: HtmlCanvasElement) -> Result<RenderEngine, JsValue> {
    console_log!("Initializing WebGL game renderer");
    RenderEngine::new(canvas)
}

#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    console_log!("TTRPG Rust Core initialized");
}

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
