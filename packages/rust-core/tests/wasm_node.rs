// Pure logic WASM tests — no browser APIs needed.
// Run with: wasm-pack test --node
//
// These tests run in a Node.js environment via wasm-bindgen-test-runner,
// making them fast and CI-friendly without requiring a browser binary.
#![cfg(target_arch = "wasm32")]

use ttrpg_rust_core as core;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_node_experimental);

// ── Core utilities ────────────────────────────────────────────────────────

#[wasm_bindgen_test]
fn version_returns_non_empty_string() {
    let v = core::version();
    assert!(!v.is_empty(), "version() must return a non-empty string");
}

#[wasm_bindgen_test]
fn version_looks_like_semver() {
    let v = core::version();
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
    let result = core::geometry::compute_visibility_polygon(0.0, 0.0, &obstacles, 100.0);
    assert!(result.is_array() || result.is_object());
}

#[wasm_bindgen_test]
fn compute_visibility_with_single_wall() {
    use js_sys::Float32Array;
    let data = [10.0_f32, -50.0, 10.0, 50.0];
    let obstacles = Float32Array::from(data.as_slice());
    let result = core::geometry::compute_visibility_polygon(0.0, 0.0, &obstacles, 200.0);
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
    let s = uc.format_distance(70.0);
    assert!(!s.is_empty(), "format_distance must return a non-empty string");
}

#[wasm_bindgen_test]
fn unit_converter_grid_cell_px_roundtrip() {
    let uc = core::unit_converter::UnitConverter::dnd_default();
    let one_cell_px = uc.to_pixels(uc.cell_distance());
    assert!(
        (one_cell_px - uc.grid_cell_px()).abs() < 0.01,
        "1-cell pixels should equal grid_cell_px"
    );
}

// ── TableManager ──────────────────────────────────────────────────────────

#[wasm_bindgen_test]
fn table_manager_create_and_activate() {
    let mut tm = core::TableManager::new();
    tm.create_table("t1", "Test Table", 1920.0, 1080.0).unwrap();
    assert_eq!(tm.get_active_table_id(), Some("t1".to_string()));
}

#[wasm_bindgen_test]
fn table_manager_screen_to_table_roundtrip() {
    let mut tm = core::TableManager::new();
    tm.set_canvas_size(800.0, 600.0);
    tm.create_table("t1", "Map", 1920.0, 1080.0).unwrap();
    tm.set_table_screen_area("t1", 0.0, 0.0, 800.0, 600.0);

    let table_coords = tm.screen_to_table("t1", 400.0, 300.0).unwrap();
    let back = tm.table_to_screen("t1", table_coords[0], table_coords[1]).unwrap();
    assert!((back[0] - 400.0).abs() < 1.0, "x roundtrip: expected ~400, got {}", back[0]);
    assert!((back[1] - 300.0).abs() < 1.0, "y roundtrip: expected ~300, got {}", back[1]);
}

#[wasm_bindgen_test]
fn table_manager_snap_to_grid() {
    let mut tm = core::TableManager::new();
    tm.create_table("t1", "Map", 1920.0, 1080.0).unwrap();
    tm.set_table_grid("t1", true, 64.0);

    let snapped = tm.snap_to_grid("t1", 33.0, 97.0).unwrap();
    // Should snap to nearest grid intersection
    assert!((snapped[0] % 64.0).abs() < 0.01 || (64.0 - (snapped[0] % 64.0)).abs() < 0.01);
}

#[wasm_bindgen_test]
fn table_manager_zoom_changes_scale() {
    let mut tm = core::TableManager::new();
    tm.set_canvas_size(800.0, 600.0);
    tm.create_table("t1", "Map", 1920.0, 1080.0).unwrap();
    assert!(tm.zoom_table("t1", 1.5, 400.0, 300.0));
}

#[wasm_bindgen_test]
fn table_manager_units_to_pixels_conversion() {
    let mut tm = core::TableManager::new();
    tm.create_table("t1", "Map", 1920.0, 1080.0).unwrap();
    tm.set_table_units("t1", 70.0, 5.0, "ft");
    let px = tm.units_to_pixels("t1", 5.0);
    assert!((px - 70.0).abs() < 0.01, "5ft should be 70px, got {px}");
}

#[wasm_bindgen_test]
fn table_manager_remove_table() {
    let mut tm = core::TableManager::new();
    tm.create_table("t1", "Map", 1920.0, 1080.0).unwrap();
    assert!(tm.remove_table("t1"));
    assert_eq!(tm.get_active_table_id(), None);
}

#[wasm_bindgen_test]
fn table_manager_get_all_tables_json() {
    let mut tm = core::TableManager::new();
    tm.create_table("t1", "Map A", 1920.0, 1080.0).unwrap();
    tm.create_table("t2", "Map B", 800.0, 600.0).unwrap();
    let json = tm.get_all_tables();
    assert!(json.contains("Map A"));
    assert!(json.contains("Map B"));
}

// ── CollisionSystem ──────────────────────────────────────────────────────

#[wasm_bindgen_test]
fn collision_line_blocked_by_wall() {
    let mut cs = core::CollisionSystem::new(64.0);
    cs.set_walls(r#"[{"id":"w1","x1":100,"y1":0,"x2":100,"y2":200,"wall_type":"normal","door_state":"closed","direction":"both"}]"#);
    assert!(cs.line_blocked(50.0, 100.0, 150.0, 100.0), "line through wall should be blocked");
}

#[wasm_bindgen_test]
fn collision_line_not_blocked_without_walls() {
    let cs = core::CollisionSystem::new(64.0);
    assert!(!cs.line_blocked(0.0, 0.0, 200.0, 200.0), "no walls means no blocking");
}

#[wasm_bindgen_test]
fn collision_distance_ft_straight() {
    let cs = core::CollisionSystem::new(64.0);
    let d = cs.distance_ft(0.0, 0.0, 320.0, 0.0, 5.0);
    assert!((d - 25.0).abs() < 0.1, "5 cells × 5ft = 25ft, got {d}");
}

#[wasm_bindgen_test]
fn collision_find_path_open_field() {
    let cs = core::CollisionSystem::new(64.0);
    let path = cs.find_path(0.0, 0.0, 192.0, 0.0);
    assert!(!path.is_empty(), "path in open field should not be empty");
}

#[wasm_bindgen_test]
fn collision_open_door_not_blocked() {
    let mut cs = core::CollisionSystem::new(64.0);
    cs.set_walls(r#"[{"id":"w1","x1":100,"y1":0,"x2":100,"y2":200,"wall_type":"normal","door_state":"open","direction":"both"}]"#);
    assert!(!cs.line_blocked(50.0, 100.0, 150.0, 100.0), "open door should not block");
}

// ── PlanningManager ──────────────────────────────────────────────────────

#[wasm_bindgen_test]
fn planning_measure_ft_straight_line() {
    let pm = core::PlanningManager::new(64.0, 5.0 / 64.0);
    let d = pm.measure_ft(0.0, 0.0, 320.0, 0.0);
    assert!((d - 25.0).abs() < 0.1, "5 cells straight = 25ft, got {d}");
}

#[wasm_bindgen_test]
fn planning_has_los_open_field() {
    let pm = core::PlanningManager::new(64.0, 5.0 / 64.0);
    assert!(pm.has_los(0.0, 0.0, 500.0, 500.0), "open field should have LOS");
}

#[wasm_bindgen_test]
fn planning_ghost_movement() {
    let mut pm = core::PlanningManager::new(64.0, 5.0 / 64.0);
    let dist = pm.start_ghost("sprite1", 0.0, 0.0, 192.0, 0.0, 30.0);
    assert!(dist > 0.0, "ghost movement distance should be positive");

    let ghost = pm.get_ghost("sprite1");
    assert!(!ghost.is_undefined() && !ghost.is_null(), "ghost should exist");
}

#[wasm_bindgen_test]
fn planning_aoe_sphere_and_tokens() {
    use js_sys::Float32Array;
    let mut pm = core::PlanningManager::new(64.0, 5.0 / 64.0);
    pm.set_aoe_sphere(100.0, 100.0, 80.0);

    let aoe = pm.get_aoe();
    assert!(!aoe.is_undefined() && !aoe.is_null(), "AoE should exist after set");

    // Token at (100,100) inside, token at (500,500) outside
    let positions = Float32Array::from([100.0_f32, 100.0, 500.0, 500.0].as_slice());
    let hits = pm.tokens_in_aoe(&positions);
    assert!(!hits.is_undefined(), "tokens_in_aoe should return a value");
}

#[wasm_bindgen_test]
fn planning_clear_all_resets_state() {
    let mut pm = core::PlanningManager::new(64.0, 5.0 / 64.0);
    pm.start_ghost("s1", 0.0, 0.0, 64.0, 0.0, 30.0);
    pm.set_aoe_sphere(0.0, 0.0, 50.0);
    pm.clear_all();

    let ghost = pm.get_ghost("s1");
    assert!(ghost.is_undefined() || ghost.is_null(), "ghost should be cleared");
    let aoe = pm.get_aoe();
    assert!(aoe.is_undefined() || aoe.is_null(), "AoE should be cleared");
}

