// Pure logic WASM tests — no browser APIs needed.
// Run with: wasm-pack test --node
//
// These tests run in a Node.js environment via wasm-bindgen-test-runner,
// making them fast and CI-friendly without requiring a browser binary.
#![cfg(target_arch = "wasm32")]

use ttrpg_rust_core as core;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_node_experimental);

fn js_json(value: &serde_json::Value) -> Result<wasm_bindgen::JsValue, serde_wasm_bindgen::Error> {
    use serde::Serialize;
    value.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
}

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
        parts
            .iter()
            .all(|p| p.chars().next().map_or(false, |c| c.is_ascii_digit())),
        "each version part must start with a digit, got: {v}"
    );
}

// ── Visibility polygon ────────────────────────────────────────────────────

// Visibility now belongs to a resident renderer scene, so the real WASM API
// tests live in wasm_browser.rs. Native geometry tests cover the pure algorithm.

// ── Paint system ──────────────────────────────────────────────────────────

// ── Unit converter ────────────────────────────────────────────────────────

// ActionsClient

#[wasm_bindgen_test]
fn actions_client_new_has_empty_history() {
    let client = core::ActionsClient::new();
    let history = client.get_action_history();

    assert!(
        js_sys::Array::is_array(&history),
        "history should be an array"
    );
    assert_eq!(js_sys::Array::from(&history).length(), 0);
    assert!(!client.can_undo(), "new client should not be undoable");
    assert!(!client.can_redo(), "new client should not be redoable");
}

#[wasm_bindgen_test]
fn actions_client_create_table_records_undoable_action() {
    let mut client = core::ActionsClient::new();
    let result = client.create_table("Test Table", 800.0, 600.0);
    let tables = client.get_all_tables();
    let history = client.get_action_history();

    assert_eq!(
        js_sys::Reflect::get(&result, &"success".into())
            .unwrap()
            .as_bool(),
        Some(true)
    );
    assert_eq!(js_sys::Array::from(&tables).length(), 1);
    assert_eq!(js_sys::Array::from(&history).length(), 1);
    assert!(client.can_undo(), "create_table should be undoable");
    assert!(!client.can_redo(), "redo stack should start empty");
}

#[wasm_bindgen_test]
fn actions_client_undo_and_redo_table_create() {
    let mut client = core::ActionsClient::new();
    client.create_table("Test Table", 800.0, 600.0);

    let undo = client.undo();
    assert_eq!(
        js_sys::Reflect::get(&undo, &"success".into())
            .unwrap()
            .as_bool(),
        Some(true)
    );
    assert_eq!(js_sys::Array::from(&client.get_all_tables()).length(), 0);
    assert!(!client.can_undo(), "undo stack should be empty after undo");
    assert!(
        client.can_redo(),
        "redo stack should contain the undone action"
    );

    let redo = client.redo();
    assert_eq!(
        js_sys::Reflect::get(&redo, &"success".into())
            .unwrap()
            .as_bool(),
        Some(true)
    );
    assert_eq!(js_sys::Array::from(&client.get_all_tables()).length(), 1);
    assert!(client.can_undo(), "redo should restore undoable action");
    assert!(!client.can_redo(), "redo stack should be empty after redo");
}

#[wasm_bindgen_test]
fn actions_client_undo_redo_sprite_update_and_layer_changes() {
    let mut client = core::ActionsClient::new();
    let position = js_json(&serde_json::json!({"x": 10, "y": 20})).unwrap();
    let created: serde_json::Value =
        serde_wasm_bindgen::from_value(client.create_sprite("t", "tokens", &position, "token"))
            .unwrap();
    let id = created["data"]["sprite_id"].as_str().unwrap();
    let updates = js_json(&serde_json::json!({"rotation": 90})).unwrap();
    client.update_sprite(id, &updates);
    client.undo();
    let sprite: serde_json::Value =
        serde_wasm_bindgen::from_value(client.get_sprite_info(id)).unwrap();
    assert_eq!(sprite["rotation"].as_f64(), Some(0.0));
    client.redo();
    client.move_sprite_to_layer(id, "map");
    client.undo();
    let sprite: serde_json::Value =
        serde_wasm_bindgen::from_value(client.get_sprite_info(id)).unwrap();
    assert_eq!(sprite["layer"], "tokens");
    assert_eq!(sprite["rotation"].as_f64(), Some(90.0));
    client.set_layer_visibility("map", false);
    client.undo();
    assert!(client.get_layer_visibility("map"));
    client.delete_sprite(id);
    client.undo();
    assert!(!client.get_sprite_info(id).is_null());
}

#[wasm_bindgen_test]
fn actions_client_batch_is_atomic_and_undoes_as_one_step() {
    let mut client = core::ActionsClient::new();
    let actions = js_json(&serde_json::json!([
        {"type": "create_table", "params": {"name": "A", "width": 100, "height": 100}},
        {"type": "set_layer_visibility", "params": {"layer": "map", "visible": false}}
    ]))
    .unwrap();
    let result: serde_json::Value =
        serde_wasm_bindgen::from_value(client.batch_actions(&actions)).unwrap();
    assert_eq!(result["success"], true);
    assert_eq!(
        js_sys::Array::from(&client.get_action_history()).length(),
        1
    );
    client.undo();
    assert_eq!(js_sys::Array::from(&client.get_all_tables()).length(), 0);
    assert!(client.get_layer_visibility("map"));
    client.redo();
    assert_eq!(js_sys::Array::from(&client.get_all_tables()).length(), 1);
    assert!(!client.get_layer_visibility("map"));
}

#[wasm_bindgen_test]
fn actions_client_rejects_bad_batches_without_state_or_history_changes() {
    let mut client = core::ActionsClient::new();
    for value in [
        serde_json::json!([]),
        serde_json::json!({}),
        serde_json::json!([
            {"type": "create_table", "params": {"name": "A", "width": 100, "height": 100}},
            {"type": "unsupported", "params": {}}
        ]),
    ] {
        let actions = js_json(&value).unwrap();
        let result: serde_json::Value =
            serde_wasm_bindgen::from_value(client.batch_actions(&actions)).unwrap();
        assert_eq!(result["success"], false);
        assert_eq!(js_sys::Array::from(&client.get_all_tables()).length(), 0);
        assert!(!client.can_undo());
    }
}

#[wasm_bindgen_test]
fn actions_client_rejects_invalid_updates_without_recording_history() {
    let mut client = core::ActionsClient::new();
    let result: serde_json::Value =
        serde_wasm_bindgen::from_value(client.create_table("A", 100.0, 100.0)).unwrap();
    let id = result["data"]["table_id"].as_str().unwrap();
    for value in [
        serde_json::json!(null),
        serde_json::json!({"width": -1}),
        serde_json::json!({"name": "Changed", "width": "invalid"}),
        serde_json::json!({"unknown": true}),
    ] {
        let result: serde_json::Value =
            serde_wasm_bindgen::from_value(client.update_table(id, &js_json(&value).unwrap()))
                .unwrap();
        assert_eq!(result["success"], false);
        assert_eq!(
            js_sys::Array::from(&client.get_action_history()).length(),
            1
        );
    }
    let state: serde_json::Value =
        serde_wasm_bindgen::from_value(client.get_table_info(id)).unwrap();
    assert_eq!(state["name"], "A");
}

// TableSync is an inbound engine adapter. Browser transport remains in TypeScript.

#[wasm_bindgen_test]
fn table_sync_ingests_normalized_table_data() {
    let mut sync = core::TableSync::new();
    let table = serde_json::json!({
        "table_id": "table-1",
        "table_name": "Dungeon",
        "width": 800.0,
        "height": 600.0,
        "scale": 1.0,
        "layers": {
            "tokens": [{
                "sprite_id": "sprite-1",
                "texture_path": "/assets/token.png",
                "coord_x": 10.0,
                "coord_y": 20.0,
                "scale_x": 1.0,
                "scale_y": 1.0,
                "layer": "tokens"
            }]
        }
    });
    let value = js_sys::JSON::parse(&table.to_string()).unwrap();

    sync.handle_table_data(&value).unwrap();

    assert_eq!(sync.get_table_id().as_deref(), Some("table-1"));
    assert_eq!(js_sys::Array::from(&sync.get_sprites()).length(), 1);
}

#[wasm_bindgen_test]
fn unit_converter_dnd_default_pixels_per_unit_positive() {
    let uc = core::unit_converter::UnitConverter::dnd_default();
    assert!(
        uc.pixels_per_unit() > 0.0,
        "pixels_per_unit must be positive"
    );
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
    assert!(
        !s.is_empty(),
        "format_distance must return a non-empty string"
    );
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
    let back = tm
        .table_to_screen("t1", table_coords[0], table_coords[1])
        .unwrap();
    assert!(
        (back[0] - 400.0).abs() < 1.0,
        "x roundtrip: expected ~400, got {}",
        back[0]
    );
    assert!(
        (back[1] - 300.0).abs() < 1.0,
        "y roundtrip: expected ~300, got {}",
        back[1]
    );
}

#[wasm_bindgen_test]
fn table_manager_snap_to_grid() {
    let mut tm = core::TableManager::new();
    tm.create_table("t1", "Map", 1920.0, 1080.0).unwrap();
    // set_table_units sets grid_cell_px which snap_to_grid reads
    tm.set_table_units("t1", 64.0, 5.0, "ft");
    tm.set_table_grid("t1", true, 64.0);

    let snapped = tm.snap_to_grid("t1", 33.0, 97.0).unwrap();
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
    cs.set_walls(r#"[{"x1":100,"y1":0,"x2":100,"y2":200,"is_door":false,"door_open":false}]"#);
    assert!(
        cs.line_blocked(50.0, 100.0, 150.0, 100.0),
        "line through wall should be blocked"
    );
}

#[wasm_bindgen_test]
fn collision_line_not_blocked_without_walls() {
    let cs = core::CollisionSystem::new(64.0);
    assert!(
        !cs.line_blocked(0.0, 0.0, 200.0, 200.0),
        "no walls means no blocking"
    );
}

#[wasm_bindgen_test]
fn collision_distance_ft_straight() {
    let cs = core::CollisionSystem::new(64.0);
    // ft_per_unit = ft_per_cell / pixels_per_cell = 5.0 / 64.0
    let d = cs.distance_ft(0.0, 0.0, 320.0, 0.0, 5.0 / 64.0);
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
    cs.set_walls(r#"[{"x1":100,"y1":0,"x2":100,"y2":200,"is_door":true,"door_open":true}]"#);
    assert!(
        !cs.line_blocked(50.0, 100.0, 150.0, 100.0),
        "open door should not block"
    );
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
    assert!(
        pm.has_los(0.0, 0.0, 500.0, 500.0),
        "open field should have LOS"
    );
}

#[wasm_bindgen_test]
fn planning_ghost_movement() {
    let mut pm = core::PlanningManager::new(64.0, 5.0 / 64.0);
    let dist = pm.start_ghost("sprite1", 0.0, 0.0, 192.0, 0.0, 30.0);
    assert!(dist > 0.0, "ghost movement distance should be positive");

    let ghost = pm.get_ghost("sprite1");
    assert!(
        !ghost.is_undefined() && !ghost.is_null(),
        "ghost should exist"
    );
}

#[wasm_bindgen_test]
fn planning_aoe_sphere_and_tokens() {
    use js_sys::Float32Array;
    let mut pm = core::PlanningManager::new(64.0, 5.0 / 64.0);
    pm.set_aoe_sphere(100.0, 100.0, 80.0);

    let aoe = pm.get_aoe();
    assert!(
        !aoe.is_undefined() && !aoe.is_null(),
        "AoE should exist after set"
    );

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
    assert!(
        ghost.is_undefined() || ghost.is_null(),
        "ghost should be cleared"
    );
    let aoe = pm.get_aoe();
    assert!(aoe.is_undefined() || aoe.is_null(), "AoE should be cleared");
}
