use wasm_bindgen::prelude::*;

// ===== RUST WASM LOGGING BEST PRACTICES =====
// Feature-based conditional compilation for different log levels
// Usage: cargo build --features="log-debug" for debug logs
//        cargo build --release (no features) for production

/// Log level macros using conditional compilation
/// Only compiled when respective features are enabled
#[cfg(feature = "log-trace")]
macro_rules! log_trace {
    ($($arg:tt)*) => {
        web_sys::console::log_1(&format!("[TRACE] {}", format_args!($($arg)*)).into());
    };
}

#[cfg(not(feature = "log-trace"))]
macro_rules! log_trace {
    ($($arg:tt)*) => {};
}

#[cfg(feature = "log-debug")]
macro_rules! log_debug {
    ($($arg:tt)*) => {
        web_sys::console::log_1(&format!("[DEBUG] {}", format_args!($($arg)*)).into());
    };
}

#[cfg(not(feature = "log-debug"))]
macro_rules! log_debug {
    ($($arg:tt)*) => {};
}

#[cfg(feature = "log-info")]
macro_rules! log_info {
    ($($arg:tt)*) => {
        web_sys::console::log_1(&format!("[INFO] {}", format_args!($($arg)*)).into());
    };
}

#[cfg(not(feature = "log-info"))]
macro_rules! log_info {
    ($($arg:tt)*) => {};
}

/// Warning logs - enabled by default in debug builds
#[cfg(any(feature = "log-warn", debug_assertions))]
macro_rules! log_warn {
    ($($arg:tt)*) => {
        web_sys::console::warn_1(&format!("[WARN] {}", format_args!($($arg)*)).into());
    };
}

#[cfg(not(any(feature = "log-warn", debug_assertions)))]
macro_rules! log_warn {
    ($($arg:tt)*) => {};
}

/// Error logs - always enabled (critical for debugging)
macro_rules! log_error {
    ($($arg:tt)*) => {
        web_sys::console::error_1(&format!("[ERROR] {}", format_args!($($arg)*)).into());
    };
}

/// Legacy console_log macro for backwards compatibility
/// Mapped to log_info level
#[cfg(any(feature = "log-info", debug_assertions))]
macro_rules! console_log {
    ($($t:tt)*) => (log_info!($($t)*))
}

#[cfg(not(any(feature = "log-info", debug_assertions)))]
macro_rules! console_log {
    ($($t:tt)*) => {}
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
mod sprite_renderer;
mod webgl_renderer;
mod text_renderer;
mod lighting;
mod fog;
mod event_system;
mod layer_manager;
mod grid_system;
mod texture_manager;
mod network;
mod actions;
mod paint;
mod asset_manager;
mod geometry;
mod table_manager;
mod table_sync;
mod utils;

pub use render::RenderEngine;
pub use types::*;
pub use lighting::{Light, LightingSystem, LightType};
pub use network::NetworkClient;
pub use actions::ActionsClient;
pub use paint::{PaintSystem, BrushPreset, create_default_brush_presets};
pub use asset_manager::{AssetManager, AssetInfo, CacheStats};
pub use table_manager::TableManager;
pub use table_sync::TableSync;

use web_sys::HtmlCanvasElement;

#[wasm_bindgen]
pub fn init_game_renderer(canvas: HtmlCanvasElement) -> Result<RenderEngine, JsValue> {
    log_info!("Initializing WebGL game renderer");
    RenderEngine::new(canvas)
}

#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    log_info!("TTRPG Rust Core initialized");
}

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
