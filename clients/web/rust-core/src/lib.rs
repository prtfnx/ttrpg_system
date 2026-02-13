use wasm_bindgen::prelude::*;

// ===== RUST WASM LOGGING BEST PRACTICES =====
// Feature-based conditional compilation for different log levels
// Usage: cargo build --features="log-debug" for debug logs
//        cargo build --release (no features) for production

/// Error level logging macro - always enabled
/// 
/// Critical errors that should always be logged regardless of build configuration.
/// Uses `console.error()` for proper browser dev tools styling and stack traces.
macro_rules! log_error {
    ($($arg:tt)*) => {
        web_sys::console::error_1(&format!("[ERROR] {}", format_args!($($arg)*)).into());
    };
}

/// Warning level logging macro - potential issues
/// 
/// Enabled by default in debug builds (`debug_assertions`) or with `log-warn` feature.
/// Use for non-critical issues that should be noticed but don't prevent operation.
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

/// Info level logging macro - general information
/// 
/// Only compiled when `log-info` feature is enabled.
/// Use for important events and general application flow information.
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

/// Debug level logging macro - detailed debugging information
/// 
/// Only compiled when `log-debug` feature is enabled.
/// Use for debugging information that helps track program flow and state.
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

/// Trace level logging macro - very detailed tracing
/// 
/// Only compiled when `log-trace` feature is enabled.
/// Use for performance-heavy detailed tracing information.
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

/// Legacy console_log macro for backwards compatibility
/// 
/// Maps to `log_info!` when info logging is enabled.
/// Maintained for backward compatibility with existing code.
#[cfg(feature = "log-info")]
macro_rules! console_log {
    ($($t:tt)*) => (log_info!($($t)*))
}

/// No-op console_log when disabled
#[cfg(not(feature = "log-info"))]
macro_rules! console_log {
    ($($t:tt)*) => {}
}

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// Domain-driven architecture modules
mod core;
mod graphics;
mod content;
mod interaction;
mod effects;
mod network;
mod wasm;

// Re-export the main WASM interface
pub use wasm::WasmEngine;

// Re-export key types for JavaScript interop
pub use core::{Engine, EngineError};
pub use graphics::GraphicsSystem;
pub use content::{ContentSystem, Scene, SceneItem, GameAction};
pub use interaction::{InteractionSystem, InputEvent};
pub use effects::{EffectsSystem, LightSource};
pub use network::NetworkSystem;

use web_sys::HtmlCanvasElement;

/// Initialize the WebGL game engine
/// 
/// Creates a new `WasmEngine` instance bound to the provided HTML canvas element.
/// This is the main entry point for initializing the WASM-based rendering system
/// using the new domain-driven architecture.
/// 
/// # Arguments
/// 
/// * `canvas` - HTML canvas element where the game will be rendered
/// 
/// # Returns
/// 
/// * `Ok(WasmEngine)` - Successfully initialized game engine
/// * `Err(JsValue)` - WebGL initialization error
/// 
/// # Examples
/// 
/// ```javascript
/// // JavaScript usage
/// import init, { init_game_engine } from './pkg/ttrpg_rust_core.js';
/// 
/// await init(); // Initialize WASM module
/// 
/// const canvas = document.getElementById('game-canvas');
/// try {
///     const engine = init_game_engine(canvas);
///     console.log('Engine initialized successfully');
/// } catch (error) {
///     console.error('Failed to initialize engine:', error);
/// }
/// ```
/// 
/// # Requirements
/// 
/// - HTML5 Canvas 2D context support required
/// - Minimum canvas size: 300x200 pixels
/// - Modern browser with WASM support
#[wasm_bindgen]
pub fn init_game_engine(canvas: HtmlCanvasElement) -> Result<WasmEngine, JsValue> {
    log_info!("Initializing game engine with domain-driven architecture");
    WasmEngine::new(&canvas)
}

/// WASM module initialization and panic hook setup
/// 
/// This function is automatically called when the WASM module loads.
/// Sets up panic handlers and initializes the domain-driven architecture system.
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
/// // TTRPG Rust Core domain-driven system initialized
/// ```
#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    log_info!("TTRPG Rust Core domain-driven system initialized");
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
