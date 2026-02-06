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

/// No-op trace macro when feature is disabled
#[cfg(not(feature = "log-trace"))]
macro_rules! log_trace {
    ($($arg:tt)*) => {};
}

/// Debug level logging macro - detailed debugging information
/// 
/// Only compiled when `log-debug` feature is enabled.
/// Use for debugging information that helps track program flow and state.
/// 
/// # Examples
/// 
/// ```rust
/// // Only logs when compiled with --features log-debug  
/// log_debug!("Light at ({:.1}, {:.1}) processing shadows", x, y);
/// log_debug!("WebGL state: {} active textures", texture_count);
/// log_debug!("Collision detected between {} and {}", entity1, entity2);
/// ```
#[cfg(feature = "log-debug")]
macro_rules! log_debug {
    ($($arg:tt)*) => {
        web_sys::console::log_1(&format!("[DEBUG] {}", format_args!($($arg)*)).into());
    };
}

/// No-op debug macro when feature is disabled
#[cfg(not(feature = "log-debug"))]
macro_rules! log_debug {
    ($($arg:tt)*) => {};
}

/// Info level logging macro - general information
/// 
/// Only compiled when `log-info` feature is enabled.
/// Use for important events and general application flow information.
/// 
/// # Examples
/// 
/// ```rust
/// // Only logs when compiled with --features log-info
/// log_info!("WebGL renderer initialized successfully");
/// log_info!("Loading texture: {}", filename);
/// log_info!("Game session started with {} players", player_count);
/// ```
#[cfg(feature = "log-info")]
macro_rules! log_info {
    ($($arg:tt)*) => {
        web_sys::console::log_1(&format!("[INFO] {}", format_args!($($arg)*)).into());
    };
}

/// No-op info macro when feature is disabled
#[cfg(not(feature = "log-info"))]
macro_rules! log_info {
    ($($arg:tt)*) => {};
}

/// Warning level logging macro - potential issues
/// 
/// Enabled by default in debug builds (`debug_assertions`) or with `log-warn` feature.
/// Use for non-critical issues that should be noticed but don't prevent operation.
/// 
/// # Examples
/// 
/// ```rust
/// // Logs in debug builds or with --features log-warn
/// log_warn!("Deprecated API usage detected in {}", function_name);
/// log_warn!("Performance warning: {} objects rendered in single batch", count);
/// log_warn!("Resource not found, using fallback: {}", resource_name);
/// ```
#[cfg(any(feature = "log-warn", debug_assertions))]
macro_rules! log_warn {
    ($($arg:tt)*) => {
        web_sys::console::warn_1(&format!("[WARN] {}", format_args!($($arg)*)).into());
    };
}

/// No-op warn macro when feature is disabled  
#[cfg(not(any(feature = "log-warn", debug_assertions)))]
macro_rules! log_warn {
    ($($arg:tt)*) => {};
}

/// Error level logging macro - always enabled
/// 
/// Critical errors that should always be logged regardless of build configuration.
/// Uses `console.error()` for proper browser dev tools styling and stack traces.
/// 
/// # Examples
/// 
/// ```rust
/// // Always logs in all builds
/// log_error!("Failed to initialize WebGL context: {}", error);
/// log_error!("Critical shader compilation error: {}", shader_log);
/// log_error!("WebSocket connection failed: {:?}", error);
/// ```
macro_rules! log_error {
    ($($arg:tt)*) => {
        web_sys::console::error_1(&format!("[ERROR] {}", format_args!($($arg)*)).into());
    };
}

/// Legacy console_log macro for backwards compatibility
/// 
/// Maps to `log_info!` when info logging is enabled.
/// Maintained for backward compatibility with existing code.
/// 
/// # Migration
/// 
/// ```rust
/// // Old usage (deprecated)
/// console_log!("Message");
/// 
/// // New usage (recommended)
/// log_info!("Message");
/// ```
#[cfg(any(feature = "log-info", debug_assertions))]
macro_rules! console_log {
    ($($t:tt)*) => (log_info!($($t)*))
}

/// No-op console_log when disabled
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

/// Initialize the WebGL game renderer
/// 
/// Creates a new `RenderEngine` instance bound to the provided HTML canvas element.
/// This is the main entry point for initializing the WASM-based rendering system.
/// 
/// # Arguments
/// 
/// * `canvas` - HTML canvas element where the game will be rendered
/// 
/// # Returns
/// 
/// * `Ok(RenderEngine)` - Successfully initialized render engine
/// * `Err(JsValue)` - WebGL initialization error
/// 
/// # Examples
/// 
/// ```javascript
/// // JavaScript usage
/// import init, { init_game_renderer } from './pkg/ttrpg_rust_core.js';
/// 
/// await init(); // Initialize WASM module
/// 
/// const canvas = document.getElementById('game-canvas');
/// try {
///     const renderer = init_game_renderer(canvas);
///     console.log('Renderer initialized successfully');
/// } catch (error) {
///     console.error('Failed to initialize renderer:', error);
/// }
/// ```
/// 
/// # WebGL Requirements
/// 
/// - WebGL2 support required
/// - Stencil buffer recommended for shadow rendering
/// - Minimum canvas size: 300x200 pixels
#[wasm_bindgen]
pub fn init_game_renderer(canvas: HtmlCanvasElement) -> Result<RenderEngine, JsValue> {
    log_info!("Initializing WebGL game renderer");
    RenderEngine::new(canvas)
}

/// WASM module initialization and panic hook setup
/// 
/// This function is automatically called when the WASM module loads.
/// Sets up panic handlers to provide readable error messages in the browser console.
/// 
/// # Panic Handling
/// 
/// Uses `console_error_panic_hook` to convert Rust panics into JavaScript errors
/// with full stack traces visible in browser developer tools.
/// 
/// # Examples
/// 
/// ```javascript
/// // Automatic initialization on module load
/// import init from './pkg/ttrpg_rust_core.js';
/// 
/// // This calls main() automatically
/// await init();
/// // TTRPG Rust Core initialized
/// ```
#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    log_info!("TTRPG Rust Core initialized");
}

/// Get the current crate version
/// 
/// Returns the version string defined in Cargo.toml at compile time.
/// Useful for debugging and version compatibility checks.
/// 
/// # Returns
/// 
/// Version string in semver format (e.g., "0.1.0")
/// 
/// # Examples
/// 
/// ```javascript
/// import { version } from './pkg/ttrpg_rust_core.js';
/// 
/// console.log('WASM Core Version:', version());
/// // Output: WASM Core Version: 0.1.0
/// ```
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
