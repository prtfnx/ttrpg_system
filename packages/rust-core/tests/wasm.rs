// WASM-specific integration tests using wasm-bindgen-test.
// These run in a browser/node environment via:
//   cargo test --target wasm32-unknown-unknown
//
// Requirements:
//   - wasm-bindgen-test-runner installed (cargo install wasm-bindgen-cli)
//   - .cargo/config.toml sets runner = "wasm-bindgen-test-runner"
//
// Run with:
//   cargo test --target wasm32-unknown-unknown --test wasm
//
// This file is excluded from native test runs (not wasm32 target).
#![cfg(target_arch = "wasm32")]

use ttrpg_rust_core as core;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

// ── Core utilities ────────────────────────────────────────────────────────

#[wasm_bindgen_test]
fn version_returns_non_empty_string() {
    let v = core::version();
    assert!(!v.is_empty(), "version() must return a non-empty string");
}

#[wasm_bindgen_test]
fn version_looks_like_semver() {
    let v = core::version();
    // Must have at least MAJOR.MINOR.PATCH structure
    let parts: Vec<&str> = v.split('.').collect();
    assert!(parts.len() >= 3, "expected MAJOR.MINOR.PATCH, got: {v}");
    assert!(
        parts.iter().all(|p| p.chars().next().map_or(false, |c| c.is_ascii_digit())),
        "each version part must start with a digit, got: {v}"
    );
}

// ── Visibility polygon ────────────────────────────────────────────────────

#[wasm_bindgen_test]
fn compute_visibility_empty_obstacles_returns_value() {
    use js_sys::Float32Array;
    let obstacles = Float32Array::new_with_length(0);
    let result = core::compute_visibility_polygon(0.0, 0.0, &obstacles, 100.0);
    assert!(result.is_array() || result.is_object());
}

#[wasm_bindgen_test]
fn compute_visibility_with_single_wall() {
    use js_sys::Float32Array;
    // Wall from (10, -50) to (10, 50)
    let data = [10.0_f32, -50.0, 10.0, 50.0];
    let obstacles = Float32Array::from(data.as_slice());
    let result = core::compute_visibility_polygon(0.0, 0.0, &obstacles, 200.0);
    assert!(result.is_array() || result.is_object());
}

// ── Paint system ──────────────────────────────────────────────────────────

#[wasm_bindgen_test]
fn create_default_brush_presets_returns_non_empty() {
    let presets = core::create_default_brush_presets();
    assert!(!presets.is_empty(), "should have at least one default brush preset");
}

// ── Unit converter ────────────────────────────────────────────────────────

#[wasm_bindgen_test]
fn unit_converter_dnd_default_pixels_per_unit_positive() {
    let uc = core::unit_converter::UnitConverter::dnd_default();
    assert!(uc.pixels_per_unit() > 0.0, "pixels_per_unit must be positive");
}

#[wasm_bindgen_test]
fn unit_converter_to_pixels_then_units_roundtrip() {
    let uc = core::unit_converter::UnitConverter::dnd_default();
    let dist = 30.0_f32;
    let px = uc.to_pixels(dist);
    let back = uc.to_units(px);
    assert!(
        (back - dist).abs() < 0.01,
        "roundtrip failed: {dist} → {px}px → {back}"
    );
}

#[wasm_bindgen_test]
fn unit_converter_format_distance_non_empty() {
    let uc = core::unit_converter::UnitConverter::dnd_default();
    let s = uc.format_distance(70.0); // one D&D grid cell
    assert!(!s.is_empty(), "format_distance must return a non-empty string");
}

#[wasm_bindgen_test]
fn unit_converter_grid_cell_px_roundtrip() {
    let uc = core::unit_converter::UnitConverter::dnd_default();
    // to_pixels(1 cell) == grid_cell_px
    let one_cell_px = uc.to_pixels(uc.cell_distance());
    assert!(
        (one_cell_px - uc.grid_cell_px()).abs() < 0.01,
        "1-cell pixels should equal grid_cell_px"
    );
}

