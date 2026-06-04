/* tslint:disable */
/* eslint-disable */

export class ActionsClient {
    free(): void;
    [Symbol.dispose](): void;
    batch_actions(actions: any): any;
    can_redo(): boolean;
    can_undo(): boolean;
    create_sprite(table_id: string, layer: string, position: any, texture_name: string): any;
    create_table(name: string, width: number, height: number): any;
    delete_sprite(sprite_id: string): any;
    delete_table(table_id: string): any;
    disconnect_network_client(): void;
    get_action_history(): any;
    get_all_tables(): any;
    get_layer_visibility(layer: string): boolean;
    get_sprite_info(sprite_id: string): any;
    get_sprites_by_layer(layer: string): any;
    get_table_info(table_id: string): any;
    is_network_connected(): boolean;
    move_sprite_to_layer(sprite_id: string, new_layer: string): any;
    constructor();
    redo(): any;
    set_action_handler(callback: Function): void;
    set_auto_sync(enabled: boolean): void;
    set_error_handler(callback: Function): void;
    set_layer_visibility(layer: string, visible: boolean): any;
    set_network_client(network_client: NetworkClient): void;
    set_state_change_handler(callback: Function): void;
    undo(): any;
    update_sprite(sprite_id: string, updates: any): any;
    update_table(table_id: string, updates: any): any;
}

export class AssetManager {
    free(): void;
    [Symbol.dispose](): void;
    calculate_asset_hash(data: Uint8Array): string;
    cleanup_cache(): Promise<void>;
    clear_cache(): Promise<void>;
    clear_download_queue(): void;
    download_asset(url: string, expected_hash?: string | null): Promise<string>;
    get_asset_by_hash(xxhash: string): string | undefined;
    get_asset_data(asset_id: string): Uint8Array | undefined;
    get_asset_info(asset_id: string): string | undefined;
    get_cache_stats(): string;
    get_download_queue_size(): number;
    get_queued_downloads(): string[];
    has_asset(asset_id: string): boolean;
    has_asset_by_hash(xxhash: string): boolean;
    initialize(): Promise<void>;
    list_assets(): string;
    constructor();
    remove_asset(asset_id: string): boolean;
    remove_from_queue(url: string): boolean;
    set_max_age(age_ms: number): void;
    set_max_cache_size(size_bytes: bigint): void;
}

export class BrushPreset {
    free(): void;
    [Symbol.dispose](): void;
    apply_to_paint_system(paint_system: PaintSystem): void;
    constructor(r: number, g: number, b: number, a: number, width: number, blend_mode: string);
}

/**
 * Server-mirrored collision system for client-side planning previews.
 * Both Python and Rust implement identical logic.
 */
export class CollisionSystem {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Grid-aware distance in feet
     */
    distance_ft(x1: number, y1: number, x2: number, y2: number, ft_per_unit: number): number;
    /**
     * A* pathfinding. Returns flat [x1,y1,x2,y2,...] waypoints or empty on failure.
     */
    find_path(sx: number, sy: number, ex: number, ey: number): Float32Array;
    /**
     * True if the line segment from (x1,y1) to (x2,y2) is blocked.
     * Uses spatial hash when available; falls back to linear scan.
     */
    line_blocked(x1: number, y1: number, x2: number, y2: number): boolean;
    /**
     * BFS reachable cells for movement range overlay
     */
    movement_range(sx: number, sy: number, speed_ft: number, ft_per_unit: number, diagonal_5_10_5: boolean): any;
    constructor(grid_size: number);
    /**
     * Rebuild spatial hash index after walls/obstacles change.
     */
    rebuild_index(): void;
    /**
     * Load obstacles from JSON array: [{id,obstacle_type,x,y,width,height,radius,vertices?}, ...]
     */
    set_obstacles(json: string): void;
    /**
     * Load walls from JSON array: [{x1,y1,x2,y2,is_door,door_open}, ...]
     */
    set_walls(json: string): void;
}

export class NetworkClient {
    free(): void;
    [Symbol.dispose](): void;
    authenticate(username: string, password: string): void;
    confirm_asset_upload(asset_id: string, upload_success: boolean): void;
    connect(url: string): void;
    disconnect(): void;
    get_client_id(): string;
    get_connection_state(): string;
    get_session_code(): string | undefined;
    get_username(): string | undefined;
    is_connected(): boolean;
    join_session(session_code: string): void;
    constructor();
    request_asset_download(asset_id: string): void;
    request_asset_upload(filename: string, file_hash: string, file_size: bigint): void;
    request_player_list(): void;
    request_table_list(): void;
    send_message(message_type: string, data: any): void;
    send_new_table_request(table_name: string): void;
    send_ping(): void;
    send_sprite_create(sprite_data: any): void;
    send_sprite_remove(sprite_id: string): void;
    send_sprite_update(sprite_data: any): void;
    send_table_request(request_data: any): void;
    send_table_update(table_data: any): void;
    set_connection_handler(callback: Function): void;
    set_error_handler(callback: Function): void;
    set_message_handler(callback: Function): void;
    set_user_info(user_id: number, username: string, session_code?: string | null, jwt_token?: string | null): void;
    sync_action(action_data: string): void;
}

export class PaintSystem {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add a stroke from a remote client (already-serialized JSON blob from server).
     */
    add_remote_stroke_json(stroke_json: string): boolean;
    add_stroke_point(world_x: number, world_y: number, pressure: number): boolean;
    can_redo(): boolean;
    can_undo(): boolean;
    cancel_stroke(): void;
    clear_all_strokes(): void;
    clear_redo_stack(): void;
    clear_table_paint(table_id: string): void;
    end_stroke(): boolean;
    enter_paint_mode(width: number, height: number): void;
    exit_paint_mode(): void;
    get_all_strokes_data(): string[];
    get_all_strokes_json(): any;
    get_brush_color(): Float32Array;
    get_brush_width(): number;
    get_current_stroke_json(): any;
    get_current_table(): string | undefined;
    get_stroke_count(): number;
    get_strokes_data_json(): any;
    is_drawing(): boolean;
    is_paint_mode(): boolean;
    /**
     * Bulk-load a JSON array of DrawStroke objects, replacing all existing strokes for the current table.
     */
    load_strokes_json(strokes_json: string): boolean;
    constructor();
    on_stroke_event(event_type: string, callback: Function): void;
    redo_last_stroke(): boolean;
    /**
     * Remove a specific stroke by its id from the current table.
     */
    remove_stroke_by_id(stroke_id: string): boolean;
    remove_stroke_event(event_type: string): void;
    set_blend_mode(blend_mode: string): void;
    set_brush_color(r: number, g: number, b: number, a: number): void;
    set_brush_width(width: number): void;
    set_current_table(table_id: string): void;
    start_stroke(world_x: number, world_y: number, pressure: number): boolean;
    undo_last_stroke(): boolean;
}

/**
 * Client-side planning layer — computes previews without mutating game state.
 * All results are read-only overlays on top of committed state.
 */
export class PlanningManager {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Remove all ghost previews
     */
    clear_all(): void;
    clear_aoe(): void;
    /**
     * Remove a ghost token preview
     */
    clear_ghost(sprite_id: string): void;
    /**
     * Get current AoE template as JSON
     */
    get_aoe(): any;
    /**
     * Get a single ghost token as JSON
     */
    get_ghost(sprite_id: string): any;
    /**
     * Get all ghost tokens as JSON
     */
    get_ghosts(): any;
    /**
     * True if there is clear line of sight from (x1,y1) to (x2,y2)
     */
    has_los(x1: number, y1: number, x2: number, y2: number): boolean;
    measure_ft(x1: number, y1: number, x2: number, y2: number): number;
    /**
     * Compute movement range BFS. Returns JSON with {normal, dash, blocked} cell arrays.
     */
    movement_range(sx: number, sy: number, speed_ft: number, diagonal_5_10_5: boolean): any;
    constructor(grid_size: number, ft_per_unit: number);
    /**
     * Set cone AoE template (angle in radians)
     */
    set_aoe_cone(ox: number, oy: number, angle: number, length: number): void;
    /**
     * Set cube AoE template
     */
    set_aoe_cube(cx: number, cy: number, side: number): void;
    /**
     * Set line AoE template
     */
    set_aoe_line(x1: number, y1: number, x2: number, y2: number, width: number): void;
    /**
     * Set sphere AoE template
     */
    set_aoe_sphere(cx: number, cy: number, radius: number): void;
    set_obstacles(json: string): void;
    set_walls(json: string): void;
    /**
     * Start previewing a token move. Returns movement cost in feet.
     */
    start_ghost(sprite_id: string, real_x: number, real_y: number, preview_x: number, preview_y: number, speed_ft: number): number;
    /**
     * Given token positions (flat [x1,y1,x2,y2,...]), returns indices of tokens in AoE
     */
    tokens_in_aoe(positions_flat: Float32Array): any;
}

export class RenderEngine {
    free(): void;
    [Symbol.dispose](): void;
    add_fog_rectangle(id: string, start_x: number, start_y: number, end_x: number, end_y: number, mode: string): void;
    add_light(id: string, x: number, y: number): void;
    add_sprite_to_layer(layer_name: string, sprite_data: any): string;
    add_wall(wall_json: string): boolean;
    /**
     * Snap all currently selected sprites to the nearest grid cell corner.
     */
    align_selected_to_grid(): void;
    batch_actions(actions: any): any;
    can_redo(): boolean;
    can_undo(): boolean;
    center_camera(world_x: number, world_y: number): void;
    clear_fog(): void;
    clear_layer(layer_name: string): boolean;
    /**
     * Clear current selection
     */
    clear_selection(): void;
    clear_walls(): void;
    copy_sprite(sprite_id: string): string | undefined;
    create_circle_sprite_with_options(x: number, y: number, radius: number, layer_name: string, color: string, opacity: number, filled: boolean): string;
    create_line_sprite_with_options(start_x: number, start_y: number, end_x: number, end_y: number, layer_name: string, color: string, opacity: number): string;
    create_rectangle_sprite_with_options(x: number, y: number, width: number, height: number, layer_name: string, color: string, opacity: number, filled: boolean): string;
    delete_sprite(sprite_id: string): boolean;
    get_active_table_id(): string | undefined;
    get_active_table_world_bounds(): Float64Array;
    get_cursor_type(screen_x: number, screen_y: number): string;
    get_grid_size(): number;
    get_layer_names(): string[];
    get_layer_sprite_count(layer_name: string): number;
    get_light_at_position(x: number, y: number): string | undefined;
    /**
     * Get list of currently selected sprite IDs
     */
    get_selected_sprite_ids(): string[];
    /**
     * Alias for get_selected_sprite_ids (TypeScript-facing name)
     */
    get_selected_sprites(): string[];
    /**
     * Get sprite data for network synchronization
     */
    get_sprite_data(sprite_id: string): any;
    /**
     * Get sprite position for movement operations
     */
    get_sprite_position(sprite_id: string): Float32Array | undefined;
    /**
     * Get sprite scale for scaling operations
     */
    get_sprite_scale(sprite_id: string): Float32Array | undefined;
    /**
     * Returns wall IDs in the same order as get_wall_render_data().
     */
    get_wall_ids(): any[];
    get_wall_render_data(): Float32Array;
    handle_mouse_down(screen_x: number, screen_y: number): void;
    /**
     * Full modifier support: ctrl for multi-select, alt to disable grid snap.
     */
    handle_mouse_down_full(screen_x: number, screen_y: number, ctrl_pressed: boolean, alt_pressed: boolean): string | undefined;
    handle_mouse_down_with_ctrl(screen_x: number, screen_y: number, ctrl_pressed: boolean): void;
    /**
     * Enhanced mouse down handler with modifier key support
     */
    handle_mouse_down_with_modifiers(screen_x: number, screen_y: number, ctrl_key: boolean, shift_key: boolean): string | undefined;
    handle_mouse_move(screen_x: number, screen_y: number): void;
    handle_mouse_up(screen_x: number, screen_y: number): void;
    handle_right_click(screen_x: number, screen_y: number): string | undefined;
    /**
     * Handle table data received from server
     */
    handle_table_data(table_data_js: any): void;
    handle_wheel(screen_x: number, screen_y: number, delta_y: number): void;
    hide_entire_table(table_width: number, table_height: number): void;
    is_in_fog_draw_mode(): boolean;
    is_in_light_drag_mode(): boolean;
    is_point_in_fog(x: number, y: number): boolean;
    load_texture(name: string, image: HTMLImageElement): void;
    move_sprite_to_layer(sprite_id: string, new_layer: string): boolean;
    constructor(canvas: HTMLCanvasElement);
    paint_add_point(world_x: number, world_y: number, pressure: number): boolean;
    paint_add_remote_stroke(stroke_json: string): boolean;
    paint_can_undo(): boolean;
    paint_clear_all(): void;
    paint_end_stroke(): boolean;
    paint_enter_mode(width: number, height: number): void;
    paint_exit_mode(): void;
    paint_get_strokes(): any;
    paint_load_strokes(strokes_json: string): boolean;
    paint_remove_stroke(stroke_id: string): boolean;
    paint_set_blend_mode(blend_mode: string): void;
    paint_set_brush_color(r: number, g: number, b: number, a: number): void;
    paint_set_brush_width(width: number): void;
    paint_set_current_table(table_id: string): void;
    paint_start_stroke(world_x: number, world_y: number, pressure: number): boolean;
    paint_undo_stroke(): boolean;
    paste_sprite(layer_name: string, sprite_json: string, offset_x: number, offset_y: number): string;
    remove_fog_rectangle(id: string): void;
    remove_light(id: string): void;
    remove_sprite(sprite_id: string): boolean;
    remove_wall(wall_id: string): boolean;
    render(): void;
    request_table(table_name: string): void;
    resize(width: number, height: number): void;
    resize_canvas(width: number, height: number): void;
    resize_sprite(sprite_id: string, new_width: number, new_height: number): boolean;
    rotate_sprite(sprite_id: string, rotation_degrees: number): boolean;
    screen_to_world(screen_x: number, screen_y: number): Float64Array;
    /**
     * Select all sprites in all layers
     */
    select_all_sprites(): void;
    send_sprite_create(sprite_data_js: any): void;
    send_sprite_move(sprite_id: string, x: number, y: number): string;
    set_active_layer(layer_name: string): void;
    set_alt_pressed(alt: boolean): void;
    set_ambient_light(level: number): void;
    set_background_color(hex: string): void;
    set_camera(world_x: number, world_y: number, zoom: number): void;
    set_current_user_id(user_id: number): void;
    set_gm_mode(is_gm: boolean): void;
    set_grid_enabled(enabled: boolean): void;
    set_grid_size(size: number): void;
    set_grid_snapping(enabled: boolean): void;
    set_input_mode_create_circle(): void;
    set_input_mode_create_line(): void;
    set_input_mode_create_polygon(): void;
    set_input_mode_create_rectangle(): void;
    set_input_mode_create_text(): void;
    set_input_mode_draw_wall(): void;
    set_input_mode_measurement(): void;
    set_input_mode_paint(): void;
    set_input_mode_select(): void;
    set_layer_blend_mode(layer_name: string, blend_mode: string): boolean;
    set_layer_color(layer_name: string, r: number, g: number, b: number): boolean;
    set_layer_opacity(layer_name: string, opacity: number): boolean;
    set_layer_visibility(layer_name: string, visible: boolean): boolean;
    set_layer_visible(layer_name: string, visible: boolean): boolean;
    set_light_color(id: string, r: number, g: number, b: number, a: number): void;
    set_light_intensity(id: string, intensity: number): void;
    set_light_radius(id: string, radius: number): void;
    /**
     * Set sprite position (alias for update_sprite_position)
     */
    set_sprite_position(sprite_id: string, x: number, y: number): boolean;
    /**
     * Set sprite scale (alias for update_sprite_scale)
     */
    set_sprite_scale(sprite_id: string, scale_x: number, scale_y: number): boolean;
    /**
     * Set the active tool mode (select / move / align).
     */
    set_tool_mode(mode: string): void;
    set_zoom(zoom: number): void;
    /**
     * Start camera pan mode for middle/right mouse button drag.
     */
    start_camera_pan(screen_x: number, screen_y: number): void;
    toggle_light(id: string): void;
    update_light_position(id: string, x: number, y: number): void;
    update_sprite_position(sprite_id: string, x: number, y: number): boolean;
    update_sprite_scale(sprite_id: string, scale_x: number, scale_y: number): boolean;
    update_wall(wall_id: string, updates_json: string): boolean;
    world_to_screen(world_x: number, world_y: number): Float64Array;
}

export class TableManager {
    free(): void;
    [Symbol.dispose](): void;
    create_table(table_id: string, table_name: string, width: number, height: number): void;
    get_active_table_id(): string | undefined;
    get_all_tables(): string;
    get_table_info(table_id: string): string | undefined;
    get_unit_converter(table_id: string): UnitConverter;
    get_visible_bounds(table_id: string): Float64Array | undefined;
    is_point_in_table_area(table_id: string, screen_x: number, screen_y: number): boolean;
    constructor();
    pan_viewport(table_id: string, dx: number, dy: number): boolean;
    pixels_to_units(table_id: string, pixels: number): number;
    remove_table(table_id: string): boolean;
    screen_to_table(table_id: string, screen_x: number, screen_y: number): Float64Array | undefined;
    set_active_table(table_id: string): boolean;
    set_canvas_size(width: number, height: number): void;
    set_table_grid(table_id: string, show_grid: boolean, cell_size: number): boolean;
    set_table_screen_area(table_id: string, x: number, y: number, width: number, height: number): boolean;
    set_table_units(table_id: string, grid_cell_px: number, cell_distance: number, unit: string): boolean;
    snap_to_grid(table_id: string, x: number, y: number): Float64Array | undefined;
    table_to_screen(table_id: string, table_x: number, table_y: number): Float64Array | undefined;
    units_to_pixels(table_id: string, game_distance: number): number;
    zoom_table(table_id: string, zoom_factor: number, center_x: number, center_y: number): boolean;
}

/**
 * Table synchronization manager for TTRPG web client
 * Handles table data reception from server and bidirectional sprite updates
 */
export class TableSync {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Check for timed out actions and revert them
     */
    check_timeouts(): void;
    /**
     * Confirm action completion from server
     */
    confirm_action(action_id: string): boolean;
    /**
     * Get sprites from current table (flattened from all layers)
     */
    get_sprites(): any;
    /**
     * Get sprites by layer
     */
    get_sprites_by_layer(layer_name: string): any;
    /**
     * Get current table data
     */
    get_table_data(): any;
    /**
     * Get current table ID
     */
    get_table_id(): string | undefined;
    /**
     * Handle table update errors
     */
    handle_error(error_message: string): void;
    /**
     * Handle sprite update received from server
     */
    handle_sprite_update(update_data_js: any): void;
    /**
     * Handle table data received from server
     */
    handle_table_data(table_data_js: any): void;
    constructor();
    /**
     * Request table data from server
     */
    request_table(table_name: string): void;
    /**
     * Revert action due to timeout or server rejection
     */
    revert_action(action_id: string): void;
    /**
     * Send sprite creation to server
     */
    send_sprite_create(sprite_data_js: any): void;
    /**
     * Send sprite deletion to server with confirmation tracking
     */
    send_sprite_delete(sprite_id: string): string;
    /**
     * Send sprite move update to server with confirmation tracking
     */
    send_sprite_move(sprite_id: string, x: number, y: number): string;
    /**
     * Send sprite rotation update to server with confirmation tracking
     */
    send_sprite_rotate(sprite_id: string, rotation: number): string;
    /**
     * Send sprite scale update to server with confirmation tracking
     */
    send_sprite_scale(sprite_id: string, scale_x: number, scale_y: number): string;
    /**
     * Set action reverted handler
     */
    set_action_reverted_handler(callback: Function): void;
    /**
     * Set error handler
     */
    set_error_handler(callback: Function): void;
    /**
     * Set grace period for server confirmations (milliseconds)
     */
    set_grace_period(ms: number): void;
    /**
     * Set the network client for sending messages
     */
    set_network_client(network_client: object): void;
    /**
     * Set callback for sprite updates
     */
    set_sprite_update_handler(callback: Function): void;
    /**
     * Set callback for when table data is received
     */
    set_table_received_handler(callback: Function): void;
}

/**
 * Single authoritative unit converter for a table's coordinate system.
 * All game distances flow through here — no scattered px/ft ratios.
 */
export class UnitConverter {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

export function compute_visibility_polygon(player_x: number, player_y: number, obstacles: Float32Array, max_dist: number): any;

export function create_default_brush_presets(): any[];

export function error(s: string): void;

/**
 * Initialize the WebGL game renderer
 *
 * Creates a new `RenderEngine` instance bound to the provided HTML canvas element.
 * This is the main entry point for initializing the WASM-based rendering system.
 *
 * # Arguments
 *
 * * `canvas` - HTML canvas element where the game will be rendered
 *
 * # Returns
 *
 * * `Ok(RenderEngine)` - Successfully initialized render engine
 * * `Err(JsValue)` - WebGL initialization error
 *
 * # Examples
 *
 * ```javascript
 * // JavaScript usage
 * import init, { init_game_renderer } from './pkg/ttrpg_rust_core.js';
 *
 * await init(); // Initialize WASM module
 *
 * const canvas = document.getElementById('game-canvas');
 * try {
 *     const renderer = init_game_renderer(canvas);
 *     console.log('Renderer initialized successfully');
 * } catch (error) {
 *     console.error('Failed to initialize renderer:', error);
 * }
 * ```
 *
 * # WebGL Requirements
 *
 * - WebGL2 support required
 * - Stencil buffer recommended for shadow rendering
 * - Minimum canvas size: 300x200 pixels
 */
export function init_game_renderer(canvas: HTMLCanvasElement): RenderEngine;

export function log(s: string): void;

/**
 * WASM module initialization and panic hook setup
 *
 * This function is automatically called when the WASM module loads.
 * Sets up panic handlers to provide readable error messages in the browser console.
 *
 * # Panic Handling
 *
 * Uses `console_error_panic_hook` to convert Rust panics into JavaScript errors
 * with full stack traces visible in browser developer tools.
 *
 * # Examples
 *
 * ```javascript
 * // Automatic initialization on module load
 * import init from './pkg/ttrpg_rust_core.js';
 *
 * // This calls main() automatically
 * await init();
 * // TTRPG Rust Core initialized
 * ```
 */
export function main(): void;

export function now(): number;

export function request_animation_frame(callback: Function): number;

/**
 * Get the current crate version
 *
 * Returns the version string defined in Cargo.toml at compile time.
 * Useful for debugging and version compatibility checks.
 *
 * # Returns
 *
 * Version string in semver format (e.g., "0.1.0")
 *
 * # Examples
 *
 * ```javascript
 * import { version } from './pkg/ttrpg_rust_core.js';
 *
 * console.log('WASM Core Version:', version());
 * // Output: WASM Core Version: 0.1.0
 * ```
 */
export function version(): string;

export function warn(s: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_collisionsystem_free: (a: number, b: number) => void;
    readonly collisionsystem_distance_ft: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly collisionsystem_find_path: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly collisionsystem_line_blocked: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly collisionsystem_movement_range: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
    readonly collisionsystem_new: (a: number) => number;
    readonly collisionsystem_rebuild_index: (a: number) => void;
    readonly collisionsystem_set_obstacles: (a: number, b: number, c: number) => void;
    readonly collisionsystem_set_walls: (a: number, b: number, c: number) => void;
    readonly compute_visibility_polygon: (a: number, b: number, c: any, d: number) => any;
    readonly __wbg_assetmanager_free: (a: number, b: number) => void;
    readonly assetmanager_calculate_asset_hash: (a: number, b: number, c: number) => [number, number];
    readonly assetmanager_cleanup_cache: (a: number) => any;
    readonly assetmanager_clear_cache: (a: number) => any;
    readonly assetmanager_clear_download_queue: (a: number) => void;
    readonly assetmanager_download_asset: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly assetmanager_get_asset_by_hash: (a: number, b: number, c: number) => [number, number];
    readonly assetmanager_get_asset_data: (a: number, b: number, c: number) => [number, number];
    readonly assetmanager_get_asset_info: (a: number, b: number, c: number) => [number, number];
    readonly assetmanager_get_cache_stats: (a: number) => [number, number];
    readonly assetmanager_get_download_queue_size: (a: number) => number;
    readonly assetmanager_get_queued_downloads: (a: number) => [number, number];
    readonly assetmanager_has_asset: (a: number, b: number, c: number) => number;
    readonly assetmanager_has_asset_by_hash: (a: number, b: number, c: number) => number;
    readonly assetmanager_initialize: (a: number) => any;
    readonly assetmanager_list_assets: (a: number) => [number, number];
    readonly assetmanager_new: () => number;
    readonly assetmanager_remove_asset: (a: number, b: number, c: number) => number;
    readonly assetmanager_remove_from_queue: (a: number, b: number, c: number) => number;
    readonly assetmanager_set_max_age: (a: number, b: number) => void;
    readonly assetmanager_set_max_cache_size: (a: number, b: bigint) => void;
    readonly renderengine_add_fog_rectangle: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly renderengine_add_light: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly renderengine_add_wall: (a: number, b: number, c: number) => number;
    readonly renderengine_align_selected_to_grid: (a: number) => void;
    readonly renderengine_batch_actions: (a: number, b: any) => any;
    readonly renderengine_can_redo: (a: number) => number;
    readonly renderengine_can_undo: (a: number) => number;
    readonly renderengine_center_camera: (a: number, b: number, c: number) => void;
    readonly renderengine_clear_fog: (a: number) => void;
    readonly renderengine_clear_layer: (a: number, b: number, c: number) => number;
    readonly renderengine_clear_walls: (a: number) => void;
    readonly renderengine_get_active_table_id: (a: number) => [number, number];
    readonly renderengine_get_active_table_world_bounds: (a: number) => [number, number, number, number];
    readonly renderengine_get_grid_size: (a: number) => number;
    readonly renderengine_get_layer_names: (a: number) => [number, number];
    readonly renderengine_get_layer_sprite_count: (a: number, b: number, c: number) => number;
    readonly renderengine_get_light_at_position: (a: number, b: number, c: number) => [number, number];
    readonly renderengine_get_wall_ids: (a: number) => [number, number];
    readonly renderengine_get_wall_render_data: (a: number) => any;
    readonly renderengine_hide_entire_table: (a: number, b: number, c: number) => void;
    readonly renderengine_is_in_fog_draw_mode: (a: number) => number;
    readonly renderengine_is_in_light_drag_mode: (a: number) => number;
    readonly renderengine_is_point_in_fog: (a: number, b: number, c: number) => number;
    readonly renderengine_paint_add_point: (a: number, b: number, c: number, d: number) => number;
    readonly renderengine_paint_add_remote_stroke: (a: number, b: number, c: number) => number;
    readonly renderengine_paint_can_undo: (a: number) => number;
    readonly renderengine_paint_clear_all: (a: number) => void;
    readonly renderengine_paint_end_stroke: (a: number) => number;
    readonly renderengine_paint_enter_mode: (a: number, b: number, c: number) => void;
    readonly renderengine_paint_exit_mode: (a: number) => void;
    readonly renderengine_paint_get_strokes: (a: number) => any;
    readonly renderengine_paint_load_strokes: (a: number, b: number, c: number) => number;
    readonly renderengine_paint_remove_stroke: (a: number, b: number, c: number) => number;
    readonly renderengine_paint_set_blend_mode: (a: number, b: number, c: number) => void;
    readonly renderengine_paint_set_brush_color: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly renderengine_paint_set_brush_width: (a: number, b: number) => void;
    readonly renderengine_paint_set_current_table: (a: number, b: number, c: number) => void;
    readonly renderengine_paint_start_stroke: (a: number, b: number, c: number, d: number) => number;
    readonly renderengine_paint_undo_stroke: (a: number) => number;
    readonly renderengine_remove_fog_rectangle: (a: number, b: number, c: number) => void;
    readonly renderengine_remove_light: (a: number, b: number, c: number) => void;
    readonly renderengine_remove_wall: (a: number, b: number, c: number) => number;
    readonly renderengine_resize: (a: number, b: number, c: number) => void;
    readonly renderengine_resize_canvas: (a: number, b: number, c: number) => void;
    readonly renderengine_screen_to_world: (a: number, b: number, c: number) => [number, number];
    readonly renderengine_set_active_layer: (a: number, b: number, c: number) => void;
    readonly renderengine_set_ambient_light: (a: number, b: number) => void;
    readonly renderengine_set_background_color: (a: number, b: number, c: number) => void;
    readonly renderengine_set_camera: (a: number, b: number, c: number, d: number) => void;
    readonly renderengine_set_current_user_id: (a: number, b: number) => void;
    readonly renderengine_set_gm_mode: (a: number, b: number) => void;
    readonly renderengine_set_grid_enabled: (a: number, b: number) => void;
    readonly renderengine_set_grid_size: (a: number, b: number) => void;
    readonly renderengine_set_grid_snapping: (a: number, b: number) => void;
    readonly renderengine_set_input_mode_create_circle: (a: number) => void;
    readonly renderengine_set_input_mode_create_line: (a: number) => void;
    readonly renderengine_set_input_mode_create_polygon: (a: number) => void;
    readonly renderengine_set_input_mode_create_rectangle: (a: number) => void;
    readonly renderengine_set_input_mode_create_text: (a: number) => void;
    readonly renderengine_set_input_mode_draw_wall: (a: number) => void;
    readonly renderengine_set_input_mode_measurement: (a: number) => void;
    readonly renderengine_set_input_mode_paint: (a: number) => void;
    readonly renderengine_set_input_mode_select: (a: number) => void;
    readonly renderengine_set_layer_blend_mode: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly renderengine_set_layer_color: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly renderengine_set_layer_opacity: (a: number, b: number, c: number, d: number) => number;
    readonly renderengine_set_layer_visibility: (a: number, b: number, c: number, d: number) => number;
    readonly renderengine_set_layer_visible: (a: number, b: number, c: number, d: number) => number;
    readonly renderengine_set_light_color: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly renderengine_set_light_intensity: (a: number, b: number, c: number, d: number) => void;
    readonly renderengine_set_light_radius: (a: number, b: number, c: number, d: number) => void;
    readonly renderengine_set_tool_mode: (a: number, b: number, c: number) => void;
    readonly renderengine_set_zoom: (a: number, b: number) => void;
    readonly renderengine_toggle_light: (a: number, b: number, c: number) => void;
    readonly renderengine_update_light_position: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly renderengine_update_wall: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly renderengine_world_to_screen: (a: number, b: number, c: number) => [number, number];
    readonly __wbg_renderengine_free: (a: number, b: number) => void;
    readonly renderengine_new: (a: any) => [number, number, number];
    readonly __wbg_networkclient_free: (a: number, b: number) => void;
    readonly __wbg_planningmanager_free: (a: number, b: number) => void;
    readonly init_game_renderer: (a: any) => [number, number, number];
    readonly main: () => void;
    readonly networkclient_authenticate: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly networkclient_confirm_asset_upload: (a: number, b: number, c: number, d: number) => [number, number];
    readonly networkclient_connect: (a: number, b: number, c: number) => [number, number];
    readonly networkclient_disconnect: (a: number) => void;
    readonly networkclient_get_client_id: (a: number) => [number, number];
    readonly networkclient_get_connection_state: (a: number) => [number, number];
    readonly networkclient_get_session_code: (a: number) => [number, number];
    readonly networkclient_get_username: (a: number) => [number, number];
    readonly networkclient_is_connected: (a: number) => number;
    readonly networkclient_join_session: (a: number, b: number, c: number) => [number, number];
    readonly networkclient_new: () => number;
    readonly networkclient_request_asset_download: (a: number, b: number, c: number) => [number, number];
    readonly networkclient_request_asset_upload: (a: number, b: number, c: number, d: number, e: number, f: bigint) => [number, number];
    readonly networkclient_request_player_list: (a: number) => [number, number];
    readonly networkclient_request_table_list: (a: number) => [number, number];
    readonly networkclient_send_message: (a: number, b: number, c: number, d: any) => [number, number];
    readonly networkclient_send_new_table_request: (a: number, b: number, c: number) => [number, number];
    readonly networkclient_send_ping: (a: number) => [number, number];
    readonly networkclient_send_sprite_create: (a: number, b: any) => [number, number];
    readonly networkclient_send_sprite_remove: (a: number, b: number, c: number) => [number, number];
    readonly networkclient_send_sprite_update: (a: number, b: any) => [number, number];
    readonly networkclient_send_table_request: (a: number, b: any) => [number, number];
    readonly networkclient_send_table_update: (a: number, b: any) => [number, number];
    readonly networkclient_set_connection_handler: (a: number, b: any) => void;
    readonly networkclient_set_error_handler: (a: number, b: any) => void;
    readonly networkclient_set_message_handler: (a: number, b: any) => void;
    readonly networkclient_set_user_info: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly networkclient_sync_action: (a: number, b: number, c: number) => [number, number];
    readonly planningmanager_clear_all: (a: number) => void;
    readonly planningmanager_clear_aoe: (a: number) => void;
    readonly planningmanager_clear_ghost: (a: number, b: number, c: number) => void;
    readonly planningmanager_get_aoe: (a: number) => any;
    readonly planningmanager_get_ghost: (a: number, b: number, c: number) => any;
    readonly planningmanager_get_ghosts: (a: number) => any;
    readonly planningmanager_has_los: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly planningmanager_measure_ft: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly planningmanager_movement_range: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly planningmanager_new: (a: number, b: number) => number;
    readonly planningmanager_set_aoe_cone: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly planningmanager_set_aoe_cube: (a: number, b: number, c: number, d: number) => void;
    readonly planningmanager_set_aoe_line: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly planningmanager_set_aoe_sphere: (a: number, b: number, c: number, d: number) => void;
    readonly planningmanager_set_obstacles: (a: number, b: number, c: number) => void;
    readonly planningmanager_set_walls: (a: number, b: number, c: number) => void;
    readonly planningmanager_start_ghost: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly planningmanager_tokens_in_aoe: (a: number, b: any) => any;
    readonly version: () => [number, number];
    readonly __wbg_brushpreset_free: (a: number, b: number) => void;
    readonly __wbg_paintsystem_free: (a: number, b: number) => void;
    readonly __wbg_tablemanager_free: (a: number, b: number) => void;
    readonly brushpreset_apply_to_paint_system: (a: number, b: number) => void;
    readonly brushpreset_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly create_default_brush_presets: () => [number, number];
    readonly paintsystem_add_remote_stroke_json: (a: number, b: number, c: number) => number;
    readonly paintsystem_add_stroke_point: (a: number, b: number, c: number, d: number) => number;
    readonly paintsystem_can_redo: (a: number) => number;
    readonly paintsystem_can_undo: (a: number) => number;
    readonly paintsystem_cancel_stroke: (a: number) => void;
    readonly paintsystem_clear_all_strokes: (a: number) => void;
    readonly paintsystem_clear_redo_stack: (a: number) => void;
    readonly paintsystem_clear_table_paint: (a: number, b: number, c: number) => void;
    readonly paintsystem_end_stroke: (a: number) => number;
    readonly paintsystem_enter_paint_mode: (a: number, b: number, c: number) => void;
    readonly paintsystem_exit_paint_mode: (a: number) => void;
    readonly paintsystem_get_all_strokes_data: (a: number) => [number, number];
    readonly paintsystem_get_all_strokes_json: (a: number) => any;
    readonly paintsystem_get_brush_color: (a: number) => [number, number];
    readonly paintsystem_get_brush_width: (a: number) => number;
    readonly paintsystem_get_current_stroke_json: (a: number) => any;
    readonly paintsystem_get_current_table: (a: number) => [number, number];
    readonly paintsystem_get_stroke_count: (a: number) => number;
    readonly paintsystem_get_strokes_data_json: (a: number) => any;
    readonly paintsystem_is_drawing: (a: number) => number;
    readonly paintsystem_is_paint_mode: (a: number) => number;
    readonly paintsystem_load_strokes_json: (a: number, b: number, c: number) => number;
    readonly paintsystem_new: () => number;
    readonly paintsystem_on_stroke_event: (a: number, b: number, c: number, d: any) => void;
    readonly paintsystem_redo_last_stroke: (a: number) => number;
    readonly paintsystem_remove_stroke_by_id: (a: number, b: number, c: number) => number;
    readonly paintsystem_remove_stroke_event: (a: number, b: number, c: number) => void;
    readonly paintsystem_set_blend_mode: (a: number, b: number, c: number) => void;
    readonly paintsystem_set_brush_color: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly paintsystem_set_brush_width: (a: number, b: number) => void;
    readonly paintsystem_set_current_table: (a: number, b: number, c: number) => void;
    readonly paintsystem_start_stroke: (a: number, b: number, c: number, d: number) => number;
    readonly paintsystem_undo_last_stroke: (a: number) => number;
    readonly renderengine_clear_selection: (a: number) => void;
    readonly renderengine_get_cursor_type: (a: number, b: number, c: number) => [number, number];
    readonly renderengine_get_selected_sprite_ids: (a: number) => [number, number];
    readonly renderengine_get_selected_sprites: (a: number) => [number, number];
    readonly renderengine_handle_mouse_down: (a: number, b: number, c: number) => void;
    readonly renderengine_handle_mouse_down_full: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly renderengine_handle_mouse_down_with_ctrl: (a: number, b: number, c: number, d: number) => void;
    readonly renderengine_handle_mouse_down_with_modifiers: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly renderengine_handle_mouse_move: (a: number, b: number, c: number) => void;
    readonly renderengine_handle_mouse_up: (a: number, b: number, c: number) => void;
    readonly renderengine_handle_right_click: (a: number, b: number, c: number) => [number, number];
    readonly renderengine_handle_wheel: (a: number, b: number, c: number, d: number) => void;
    readonly renderengine_select_all_sprites: (a: number) => void;
    readonly renderengine_set_alt_pressed: (a: number, b: number) => void;
    readonly renderengine_start_camera_pan: (a: number, b: number, c: number) => void;
    readonly tablemanager_create_table: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly tablemanager_get_active_table_id: (a: number) => [number, number];
    readonly tablemanager_get_all_tables: (a: number) => [number, number];
    readonly tablemanager_get_table_info: (a: number, b: number, c: number) => [number, number];
    readonly tablemanager_get_unit_converter: (a: number, b: number, c: number) => number;
    readonly tablemanager_get_visible_bounds: (a: number, b: number, c: number) => [number, number];
    readonly tablemanager_is_point_in_table_area: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly tablemanager_new: () => number;
    readonly tablemanager_pan_viewport: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly tablemanager_pixels_to_units: (a: number, b: number, c: number, d: number) => number;
    readonly tablemanager_remove_table: (a: number, b: number, c: number) => number;
    readonly tablemanager_screen_to_table: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly tablemanager_set_active_table: (a: number, b: number, c: number) => number;
    readonly tablemanager_set_canvas_size: (a: number, b: number, c: number) => void;
    readonly tablemanager_set_table_grid: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly tablemanager_set_table_screen_area: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly tablemanager_set_table_units: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly tablemanager_snap_to_grid: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly tablemanager_table_to_screen: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly tablemanager_units_to_pixels: (a: number, b: number, c: number, d: number) => number;
    readonly tablemanager_zoom_table: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly __wbg_unitconverter_free: (a: number, b: number) => void;
    readonly __wbg_tablesync_free: (a: number, b: number) => void;
    readonly actionsclient_batch_actions: (a: number, b: any) => any;
    readonly actionsclient_create_sprite: (a: number, b: number, c: number, d: number, e: number, f: any, g: number, h: number) => any;
    readonly actionsclient_delete_sprite: (a: number, b: number, c: number) => any;
    readonly actionsclient_get_layer_visibility: (a: number, b: number, c: number) => number;
    readonly actionsclient_move_sprite_to_layer: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly actionsclient_set_layer_visibility: (a: number, b: number, c: number, d: number) => any;
    readonly actionsclient_update_sprite: (a: number, b: number, c: number, d: any) => any;
    readonly error: (a: number, b: number) => void;
    readonly log: (a: number, b: number) => void;
    readonly renderengine_add_sprite_to_layer: (a: number, b: number, c: number, d: any) => [number, number, number, number];
    readonly renderengine_copy_sprite: (a: number, b: number, c: number) => [number, number];
    readonly renderengine_create_circle_sprite_with_options: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly renderengine_create_line_sprite_with_options: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly renderengine_create_rectangle_sprite_with_options: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number];
    readonly renderengine_delete_sprite: (a: number, b: number, c: number) => number;
    readonly renderengine_get_sprite_data: (a: number, b: number, c: number) => any;
    readonly renderengine_get_sprite_position: (a: number, b: number, c: number) => [number, number];
    readonly renderengine_get_sprite_scale: (a: number, b: number, c: number) => [number, number];
    readonly renderengine_handle_table_data: (a: number, b: any) => [number, number];
    readonly renderengine_load_texture: (a: number, b: number, c: number, d: any) => [number, number];
    readonly renderengine_move_sprite_to_layer: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly renderengine_paste_sprite: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly renderengine_remove_sprite: (a: number, b: number, c: number) => number;
    readonly renderengine_render: (a: number) => [number, number];
    readonly renderengine_request_table: (a: number, b: number, c: number) => [number, number];
    readonly renderengine_resize_sprite: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly renderengine_rotate_sprite: (a: number, b: number, c: number, d: number) => number;
    readonly renderengine_send_sprite_create: (a: number, b: any) => [number, number];
    readonly renderengine_send_sprite_move: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly renderengine_set_sprite_position: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly renderengine_set_sprite_scale: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly renderengine_update_sprite_position: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly renderengine_update_sprite_scale: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly request_animation_frame: (a: any) => number;
    readonly tablesync_check_timeouts: (a: number) => [number, number];
    readonly tablesync_confirm_action: (a: number, b: number, c: number) => number;
    readonly tablesync_get_sprites: (a: number) => any;
    readonly tablesync_get_sprites_by_layer: (a: number, b: number, c: number) => any;
    readonly tablesync_get_table_data: (a: number) => any;
    readonly tablesync_get_table_id: (a: number) => [number, number];
    readonly tablesync_handle_error: (a: number, b: number, c: number) => void;
    readonly tablesync_handle_sprite_update: (a: number, b: any) => [number, number];
    readonly tablesync_handle_table_data: (a: number, b: any) => [number, number];
    readonly tablesync_new: () => number;
    readonly tablesync_request_table: (a: number, b: number, c: number) => [number, number];
    readonly tablesync_revert_action: (a: number, b: number, c: number) => [number, number];
    readonly tablesync_send_sprite_create: (a: number, b: any) => [number, number];
    readonly tablesync_send_sprite_delete: (a: number, b: number, c: number) => [number, number, number, number];
    readonly tablesync_send_sprite_move: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly tablesync_send_sprite_rotate: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly tablesync_send_sprite_scale: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly tablesync_set_action_reverted_handler: (a: number, b: any) => void;
    readonly tablesync_set_error_handler: (a: number, b: any) => void;
    readonly tablesync_set_grace_period: (a: number, b: number) => void;
    readonly tablesync_set_network_client: (a: number, b: any) => void;
    readonly tablesync_set_sprite_update_handler: (a: number, b: any) => void;
    readonly tablesync_set_table_received_handler: (a: number, b: any) => void;
    readonly warn: (a: number, b: number) => void;
    readonly now: () => number;
    readonly __wbg_actionsclient_free: (a: number, b: number) => void;
    readonly actionsclient_can_redo: (a: number) => number;
    readonly actionsclient_can_undo: (a: number) => number;
    readonly actionsclient_create_table: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly actionsclient_delete_table: (a: number, b: number, c: number) => any;
    readonly actionsclient_disconnect_network_client: (a: number) => void;
    readonly actionsclient_get_action_history: (a: number) => any;
    readonly actionsclient_get_all_tables: (a: number) => any;
    readonly actionsclient_get_sprite_info: (a: number, b: number, c: number) => any;
    readonly actionsclient_get_sprites_by_layer: (a: number, b: number, c: number) => any;
    readonly actionsclient_get_table_info: (a: number, b: number, c: number) => any;
    readonly actionsclient_is_network_connected: (a: number) => number;
    readonly actionsclient_new: () => number;
    readonly actionsclient_redo: (a: number) => any;
    readonly actionsclient_set_action_handler: (a: number, b: any) => void;
    readonly actionsclient_set_auto_sync: (a: number, b: number) => void;
    readonly actionsclient_set_error_handler: (a: number, b: any) => void;
    readonly actionsclient_set_network_client: (a: number, b: number) => void;
    readonly actionsclient_set_state_change_handler: (a: number, b: any) => void;
    readonly actionsclient_undo: (a: number) => any;
    readonly actionsclient_update_table: (a: number, b: number, c: number, d: any) => any;
    readonly wasm_bindgen__convert__closures_____invoke__h379eeb6857ff453f: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h2bc1731c5b684db1: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88_2: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88_3: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88_4: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h933b87fda231a098: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
