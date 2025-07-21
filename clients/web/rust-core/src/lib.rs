use wasm_bindgen::prelude::*;

// Import the `console.log` function from the host environment
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// Define a macro to make console.log! work like println!
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// Module exports
mod render;
mod network;
mod game;
mod types;
mod utils;

pub use render::RenderManager;
pub use network::NetworkClient;
pub use game::GameEngine;
pub use types::*;

#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    console_log!("TTRPG Rust Core initialized");
}

#[wasm_bindgen]
pub fn greet(name: &str) {
    console_log!("Hello, {}!", name);
}

// Export version info
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
