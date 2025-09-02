/* tslint:disable */
/* eslint-disable */
export function create_default_brush_presets(): any[];
export function compute_visibility_polygon(player_x: number, player_y: number, obstacles: Float32Array, max_dist: number): any;
export function now(): number;
export function request_animation_frame(callback: Function): number;
export function log(s: string): void;
export function error(s: string): void;
export function warn(s: string): void;
export function init_game_renderer(canvas: HTMLCanvasElement): RenderEngine;
export function main(): void;
export function version(): string;
export class ActionsClient {
  free(): void;
  constructor();
  set_action_handler(callback: Function): void;
  set_state_change_handler(callback: Function): void;
  set_error_handler(callback: Function): void;
  set_network_client(network_client: NetworkClient): void;
  disconnect_network_client(): void;
  is_network_connected(): boolean;
  set_auto_sync(enabled: boolean): void;
  create_table(name: string, width: number, height: number): any;
  delete_table(table_id: string): any;
  update_table(table_id: string, updates: any): any;
  create_sprite(table_id: string, layer: string, position: any, texture_name: string): any;
  delete_sprite(sprite_id: string): any;
  update_sprite(sprite_id: string, updates: any): any;
  set_layer_visibility(layer: string, visible: boolean): any;
  get_layer_visibility(layer: string): boolean;
  move_sprite_to_layer(sprite_id: string, new_layer: string): any;
  batch_actions(actions: any): any;
  undo(): any;
  redo(): any;
  get_table_info(table_id: string): any;
  get_sprite_info(sprite_id: string): any;
  get_all_tables(): any;
  get_sprites_by_layer(layer: string): any;
  get_action_history(): any;
  can_undo(): boolean;
  can_redo(): boolean;
}
export class AssetManager {
  free(): void;
  constructor();
  initialize(): Promise<void>;
  download_asset(url: string, expected_hash?: string | null): Promise<string>;
  get_asset_data(asset_id: string): Uint8Array | undefined;
  get_asset_info(asset_id: string): string | undefined;
  has_asset(asset_id: string): boolean;
  has_asset_by_hash(xxhash: string): boolean;
  get_asset_by_hash(xxhash: string): string | undefined;
  remove_asset(asset_id: string): boolean;
  cleanup_cache(): Promise<void>;
  get_cache_stats(): string;
  list_assets(): string;
  set_max_cache_size(size_bytes: bigint): void;
  set_max_age(age_ms: number): void;
  clear_cache(): Promise<void>;
  calculate_asset_hash(data: Uint8Array): string;
  get_download_queue_size(): number;
  get_queued_downloads(): string[];
  clear_download_queue(): void;
  remove_from_queue(url: string): boolean;
}
export class BrushPreset {
  free(): void;
  constructor(r: number, g: number, b: number, a: number, width: number, blend_mode: string);
  apply_to_paint_system(paint_system: PaintSystem): void;
}
export class NetworkClient {
  free(): void;
  constructor();
  set_message_handler(callback: Function): void;
  set_connection_handler(callback: Function): void;
  set_error_handler(callback: Function): void;
  connect(url: string): void;
  disconnect(): void;
  send_message(message_type: string, data: any): void;
  send_sprite_update(sprite_data: any): void;
  send_sprite_create(sprite_data: any): void;
  send_sprite_remove(sprite_id: string): void;
  send_table_update(table_data: any): void;
  send_table_request(request_data: any): void;
  send_new_table_request(table_name: string): void;
  send_ping(): void;
  authenticate(username: string, password: string): void;
  join_session(session_code: string): void;
  request_table_list(): void;
  request_player_list(): void;
  request_asset_upload(filename: string, file_hash: string, file_size: bigint): void;
  request_asset_download(asset_id: string): void;
  confirm_asset_upload(asset_id: string, upload_success: boolean): void;
  is_connected(): boolean;
  get_connection_state(): string;
  get_client_id(): string;
  get_username(): string | undefined;
  get_session_code(): string | undefined;
  set_user_info(user_id: number, username: string, session_code?: string | null, jwt_token?: string | null): void;
  sync_action(action_data: string): void;
}
export class PaintSystem {
  free(): void;
  constructor();
  enter_paint_mode(width: number, height: number): void;
  exit_paint_mode(): void;
  is_paint_mode(): boolean;
  set_brush_color(r: number, g: number, b: number, a: number): void;
  set_brush_width(width: number): void;
  set_blend_mode(blend_mode: string): void;
  get_brush_color(): Float32Array;
  get_brush_width(): number;
  start_stroke(world_x: number, world_y: number, pressure: number): boolean;
  add_stroke_point(world_x: number, world_y: number, pressure: number): boolean;
  end_stroke(): boolean;
  cancel_stroke(): void;
  clear_all_strokes(): void;
  undo_last_stroke(): boolean;
  get_stroke_count(): number;
  is_drawing(): boolean;
  get_all_strokes_json(): any;
  get_current_stroke_json(): any;
  on_stroke_event(event_type: string, callback: Function): void;
  remove_stroke_event(event_type: string): void;
  get_all_strokes_data(): string[];
  get_strokes_data_json(): any;
}
export class RenderEngine {
  free(): void;
  constructor(canvas: HTMLCanvasElement);
  render(): void;
  resize_canvas(width: number, height: number): void;
  /**
   * Compute visibility polygon given player position and flat obstacle float32 array
   */
  compute_visibility_polygon(player_x: number, player_y: number, obstacles: Float32Array, max_dist: number): any;
  /**
   * Add a fog reveal polygon (array of {x,y}) under given id
   */
  add_fog_polygon(id: string, points: any): void;
  remove_fog_polygon(id: string): void;
  handle_wheel(screen_x: number, screen_y: number, delta_y: number): void;
  set_zoom(zoom: number): void;
  center_camera(world_x: number, world_y: number): void;
  set_camera(world_x: number, world_y: number, zoom: number): void;
  screen_to_world(screen_x: number, screen_y: number): Float64Array;
  get_cursor_type(screen_x: number, screen_y: number): string;
  handle_mouse_down(screen_x: number, screen_y: number): void;
  handle_mouse_down_with_ctrl(screen_x: number, screen_y: number, ctrl_pressed: boolean): void;
  handle_mouse_move(screen_x: number, screen_y: number): void;
  handle_mouse_up(screen_x: number, screen_y: number): void;
  add_sprite_to_layer(layer_name: string, sprite_data: any): string;
  remove_sprite(sprite_id: string): boolean;
  rotate_sprite(sprite_id: string, rotation_degrees: number): boolean;
  toggle_grid(): void;
  set_grid_enabled(enabled: boolean): void;
  toggle_grid_snapping(): void;
  set_grid_snapping(enabled: boolean): void;
  set_grid_size(size: number): void;
  get_grid_size(): number;
  is_grid_snapping_enabled(): boolean;
  set_snap_to_grid(enabled: boolean): void;
  set_grid_color(r: number, g: number, b: number, a: number): void;
  set_background_color(r: number, g: number, b: number, a: number): void;
  reset_camera(): void;
  set_camera_position(world_x: number, world_y: number): void;
  set_camera_scale(scale: number): void;
  load_texture(name: string, image: HTMLImageElement): void;
  handle_right_click(screen_x: number, screen_y: number): string | undefined;
  delete_sprite(sprite_id: string): boolean;
  copy_sprite(sprite_id: string): string | undefined;
  paste_sprite(layer_name: string, sprite_json: string, offset_x: number, offset_y: number): string;
  resize_sprite(sprite_id: string, new_width: number, new_height: number): boolean;
  resize(width: number, height: number): void;
  add_light(id: string, x: number, y: number): void;
  remove_light(id: string): void;
  set_light_color(id: string, r: number, g: number, b: number, a: number): void;
  set_light_intensity(id: string, intensity: number): void;
  set_light_radius(id: string, radius: number): void;
  toggle_light(id: string): void;
  update_light_position(id: string, x: number, y: number): void;
  turn_on_all_lights(): void;
  turn_off_all_lights(): void;
  get_light_count(): number;
  clear_lights(): void;
  set_gm_mode(is_gm: boolean): void;
  add_fog_rectangle(id: string, start_x: number, start_y: number, end_x: number, end_y: number, mode: string): void;
  remove_fog_rectangle(id: string): void;
  clear_fog(): void;
  hide_entire_table(table_width: number, table_height: number): void;
  is_point_in_fog(x: number, y: number): boolean;
  get_fog_count(): number;
  get_light_at_position(x: number, y: number): string | undefined;
  start_light_drag(light_id: string, world_x: number, world_y: number): boolean;
  update_light_drag(world_x: number, world_y: number): boolean;
  end_light_drag(): string | undefined;
  get_light_radius(light_id: string): number;
  start_fog_draw(world_x: number, world_y: number, mode: string): string;
  update_fog_draw(rect_id: string, world_x: number, world_y: number): boolean;
  finish_fog_draw(rect_id: string): boolean;
  cancel_fog_draw(rect_id: string): void;
  get_fog_at_position(x: number, y: number): string | undefined;
  set_fog_draw_mode(enabled: boolean): void;
  set_fog_erase_mode(enabled: boolean): void;
  set_light_drag_mode(enabled: boolean): void;
  is_in_fog_draw_mode(): boolean;
  is_in_light_drag_mode(): boolean;
  get_current_input_mode(): string;
  set_input_mode_measurement(): void;
  set_input_mode_create_rectangle(): void;
  set_input_mode_create_circle(): void;
  set_input_mode_create_line(): void;
  set_input_mode_create_text(): void;
  set_input_mode_select(): void;
  set_input_mode_paint(): void;
  create_rectangle_sprite(x: number, y: number, width: number, height: number, layer_name: string): string;
  create_rectangle_sprite_with_options(x: number, y: number, width: number, height: number, layer_name: string, color: string, opacity: number, filled: boolean): string;
  create_circle_sprite(x: number, y: number, radius: number, layer_name: string): string;
  create_circle_sprite_with_options(x: number, y: number, radius: number, layer_name: string, color: string, opacity: number, filled: boolean): string;
  create_line_sprite(start_x: number, start_y: number, end_x: number, end_y: number, layer_name: string): string;
  create_line_sprite_with_options(start_x: number, start_y: number, end_x: number, end_y: number, layer_name: string, color: string, opacity: number): string;
  get_sprite_network_data(sprite_id: string): any;
  apply_network_sprite_update(sprite_data: any): void;
  apply_network_sprite_create(sprite_data: any): string;
  apply_network_sprite_remove(sprite_id: string): boolean;
  get_all_sprites_network_data(): any;
  create_table_action(name: string, width: number, height: number): any;
  delete_table_action(table_id: string): any;
  update_table_action(table_id: string, updates: any): any;
  create_sprite_action(table_id: string, layer: string, position: any, texture_name: string): any;
  delete_sprite_action(sprite_id: string): any;
  update_sprite_action(sprite_id: string, updates: any): any;
  set_layer_visibility_action(layer: string, visible: boolean): any;
  move_sprite_to_layer_action(sprite_id: string, new_layer: string): any;
  batch_actions(actions: any): any;
  undo_action(): any;
  redo_action(): any;
  can_undo(): boolean;
  can_redo(): boolean;
  get_action_history(): any;
  get_table_info(table_id: string): any;
  get_sprite_info(sprite_id: string): any;
  get_all_tables(): any;
  get_sprites_by_layer(layer: string): any;
  set_action_handler(callback: Function): void;
  set_state_change_handler(callback: Function): void;
  set_actions_error_handler(callback: Function): void;
  set_actions_auto_sync(enabled: boolean): void;
  set_layer_opacity(layer_name: string, opacity: number): boolean;
  set_layer_visibility(layer_name: string, visible: boolean): boolean;
  set_layer_blend_mode(layer_name: string, blend_mode: string): boolean;
  set_layer_color(layer_name: string, r: number, g: number, b: number): boolean;
  get_layer_settings(layer_name: string): any;
  get_layer_names(): string[];
  get_layer_sprite_count(layer_name: string): number;
  set_layer_z_order(layer_name: string, z_order: number): boolean;
  clear_layer(layer_name: string): boolean;
  clear_all_sprites(): void;
  set_layer_visible(layer_name: string, visible: boolean): boolean;
  paint_enter_mode(width: number, height: number): void;
  paint_exit_mode(): void;
  paint_is_mode(): boolean;
  paint_set_brush_color(r: number, g: number, b: number, a: number): void;
  paint_set_brush_width(width: number): void;
  paint_set_blend_mode(blend_mode: string): void;
  paint_get_brush_color(): Float32Array;
  paint_get_brush_width(): number;
  paint_start_stroke(world_x: number, world_y: number, pressure: number): boolean;
  paint_add_point(world_x: number, world_y: number, pressure: number): boolean;
  paint_end_stroke(): boolean;
  paint_cancel_stroke(): void;
  paint_clear_all(): void;
  paint_save_strokes_as_sprites(layer_name: string): string[];
  paint_undo_stroke(): boolean;
  paint_get_stroke_count(): number;
  paint_is_drawing(): boolean;
  paint_get_strokes(): any;
  paint_get_current_stroke(): any;
  paint_on_event(event_type: string, callback: Function): void;
  /**
   * Set network client for table synchronization
   */
  set_network_client(network_client: object): void;
  /**
   * Handle table data received from server
   */
  handle_table_data(table_data_js: any): void;
  /**
   * Handle sprite update from server
   */
  handle_sprite_update(update_data_js: any): void;
  /**
   * Send sprite move update to server
   */
  send_sprite_move(sprite_id: string, x: number, y: number): void;
  /**
   * Send sprite scale update to server
   */
  send_sprite_scale(sprite_id: string, scale_x: number, scale_y: number): void;
  /**
   * Send sprite creation to server
   */
  send_sprite_create(sprite_data_js: any): void;
  /**
   * Send sprite deletion to server
   */
  send_sprite_delete(sprite_id: string): void;
  /**
   * Request table data from server
   */
  request_table(table_name: string): void;
  /**
   * Get current table data
   */
  get_table_data(): any;
  /**
   * Get current table ID
   */
  get_table_id(): string | undefined;
  /**
   * Set table sync callbacks
   */
  set_table_received_handler(callback: Function): void;
  set_sprite_update_handler(callback: Function): void;
  set_table_error_handler(callback: Function): void;
}
export class TableManager {
  free(): void;
  constructor();
  set_canvas_size(width: number, height: number): void;
  create_table(table_id: string, table_name: string, width: number, height: number): void;
  set_active_table(table_id: string): boolean;
  get_active_table_id(): string | undefined;
  set_table_screen_area(table_id: string, x: number, y: number, width: number, height: number): boolean;
  table_to_screen(table_id: string, table_x: number, table_y: number): Float64Array | undefined;
  screen_to_table(table_id: string, screen_x: number, screen_y: number): Float64Array | undefined;
  is_point_in_table_area(table_id: string, screen_x: number, screen_y: number): boolean;
  pan_viewport(table_id: string, dx: number, dy: number): boolean;
  zoom_table(table_id: string, zoom_factor: number, center_x: number, center_y: number): boolean;
  set_table_grid(table_id: string, show_grid: boolean, cell_size: number): boolean;
  get_table_info(table_id: string): string | undefined;
  get_all_tables(): string;
  remove_table(table_id: string): boolean;
  get_visible_bounds(table_id: string): Float64Array | undefined;
  snap_to_grid(table_id: string, x: number, y: number): Float64Array | undefined;
}
/**
 * Table synchronization manager for TTRPG web client
 * Handles table data reception from server and bidirectional sprite updates
 */
export class TableSync {
  free(): void;
  constructor();
  /**
   * Set the network client for sending messages
   */
  set_network_client(network_client: object): void;
  /**
   * Set callback for when table data is received
   */
  set_table_received_handler(callback: Function): void;
  /**
   * Set callback for sprite updates
   */
  set_sprite_update_handler(callback: Function): void;
  /**
   * Set error handler
   */
  set_error_handler(callback: Function): void;
  /**
   * Request table data from server
   */
  request_table(table_name: string): void;
  /**
   * Handle table data received from server
   */
  handle_table_data(table_data_js: any): void;
  /**
   * Send sprite move update to server
   */
  send_sprite_move(sprite_id: string, x: number, y: number): void;
  /**
   * Send sprite scale update to server
   */
  send_sprite_scale(sprite_id: string, scale_x: number, scale_y: number): void;
  /**
   * Send sprite rotation update to server
   */
  send_sprite_rotate(sprite_id: string, rotation: number): void;
  /**
   * Send sprite creation to server
   */
  send_sprite_create(sprite_data_js: any): void;
  /**
   * Send sprite deletion to server
   */
  send_sprite_delete(sprite_id: string): void;
  /**
   * Handle sprite update received from server
   */
  handle_sprite_update(update_data_js: any): void;
  /**
   * Get current table data
   */
  get_table_data(): any;
  /**
   * Get current table ID
   */
  get_table_id(): string | undefined;
  /**
   * Get sprites from current table (flattened from all layers)
   */
  get_sprites(): any;
  /**
   * Get sprites by layer
   */
  get_sprites_by_layer(layer_name: string): any;
  /**
   * Handle table update errors
   */
  handle_error(error_message: string): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_renderengine_free: (a: number, b: number) => void;
  readonly renderengine_new: (a: any) => [number, number, number];
  readonly renderengine_render: (a: number) => [number, number];
  readonly renderengine_compute_visibility_polygon: (a: number, b: number, c: number, d: any, e: number) => any;
  readonly renderengine_add_fog_polygon: (a: number, b: number, c: number, d: any) => void;
  readonly renderengine_remove_fog_polygon: (a: number, b: number, c: number) => void;
  readonly renderengine_handle_wheel: (a: number, b: number, c: number, d: number) => void;
  readonly renderengine_center_camera: (a: number, b: number, c: number) => void;
  readonly renderengine_set_camera: (a: number, b: number, c: number, d: number) => void;
  readonly renderengine_screen_to_world: (a: number, b: number, c: number) => [number, number];
  readonly renderengine_get_cursor_type: (a: number, b: number, c: number) => [number, number];
  readonly renderengine_handle_mouse_down: (a: number, b: number, c: number) => void;
  readonly renderengine_handle_mouse_down_with_ctrl: (a: number, b: number, c: number, d: number) => void;
  readonly renderengine_handle_mouse_move: (a: number, b: number, c: number) => void;
  readonly renderengine_handle_mouse_up: (a: number, b: number, c: number) => void;
  readonly renderengine_add_sprite_to_layer: (a: number, b: number, c: number, d: any) => [number, number, number, number];
  readonly renderengine_remove_sprite: (a: number, b: number, c: number) => number;
  readonly renderengine_rotate_sprite: (a: number, b: number, c: number, d: number) => number;
  readonly renderengine_toggle_grid: (a: number) => void;
  readonly renderengine_set_grid_enabled: (a: number, b: number) => void;
  readonly renderengine_toggle_grid_snapping: (a: number) => void;
  readonly renderengine_set_grid_snapping: (a: number, b: number) => void;
  readonly renderengine_set_grid_size: (a: number, b: number) => void;
  readonly renderengine_get_grid_size: (a: number) => number;
  readonly renderengine_is_grid_snapping_enabled: (a: number) => number;
  readonly renderengine_set_grid_color: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly renderengine_set_background_color: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly renderengine_reset_camera: (a: number) => void;
  readonly renderengine_set_camera_scale: (a: number, b: number) => void;
  readonly renderengine_load_texture: (a: number, b: number, c: number, d: any) => [number, number];
  readonly renderengine_handle_right_click: (a: number, b: number, c: number) => [number, number];
  readonly renderengine_copy_sprite: (a: number, b: number, c: number) => [number, number];
  readonly renderengine_paste_sprite: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
  readonly renderengine_resize_sprite: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly renderengine_resize: (a: number, b: number, c: number) => void;
  readonly renderengine_add_light: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly renderengine_remove_light: (a: number, b: number, c: number) => void;
  readonly renderengine_set_light_color: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly renderengine_set_light_intensity: (a: number, b: number, c: number, d: number) => void;
  readonly renderengine_set_light_radius: (a: number, b: number, c: number, d: number) => void;
  readonly renderengine_toggle_light: (a: number, b: number, c: number) => void;
  readonly renderengine_update_light_position: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly renderengine_turn_on_all_lights: (a: number) => void;
  readonly renderengine_turn_off_all_lights: (a: number) => void;
  readonly renderengine_get_light_count: (a: number) => number;
  readonly renderengine_clear_lights: (a: number) => void;
  readonly renderengine_set_gm_mode: (a: number, b: number) => void;
  readonly renderengine_add_fog_rectangle: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
  readonly renderengine_remove_fog_rectangle: (a: number, b: number, c: number) => void;
  readonly renderengine_clear_fog: (a: number) => void;
  readonly renderengine_hide_entire_table: (a: number, b: number, c: number) => void;
  readonly renderengine_is_point_in_fog: (a: number, b: number, c: number) => number;
  readonly renderengine_get_fog_count: (a: number) => number;
  readonly renderengine_get_light_at_position: (a: number, b: number, c: number) => [number, number];
  readonly renderengine_start_light_drag: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly renderengine_update_light_drag: (a: number, b: number, c: number) => number;
  readonly renderengine_end_light_drag: (a: number) => [number, number];
  readonly renderengine_get_light_radius: (a: number, b: number, c: number) => number;
  readonly renderengine_start_fog_draw: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly renderengine_update_fog_draw: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly renderengine_finish_fog_draw: (a: number, b: number, c: number) => number;
  readonly renderengine_cancel_fog_draw: (a: number, b: number, c: number) => void;
  readonly renderengine_get_fog_at_position: (a: number, b: number, c: number) => [number, number];
  readonly renderengine_set_fog_draw_mode: (a: number, b: number) => void;
  readonly renderengine_set_fog_erase_mode: (a: number, b: number) => void;
  readonly renderengine_set_light_drag_mode: (a: number, b: number) => void;
  readonly renderengine_is_in_fog_draw_mode: (a: number) => number;
  readonly renderengine_is_in_light_drag_mode: (a: number) => number;
  readonly renderengine_get_current_input_mode: (a: number) => [number, number];
  readonly renderengine_set_input_mode_measurement: (a: number) => void;
  readonly renderengine_set_input_mode_create_rectangle: (a: number) => void;
  readonly renderengine_set_input_mode_create_circle: (a: number) => void;
  readonly renderengine_set_input_mode_create_line: (a: number) => void;
  readonly renderengine_set_input_mode_create_text: (a: number) => void;
  readonly renderengine_set_input_mode_select: (a: number) => void;
  readonly renderengine_set_input_mode_paint: (a: number) => void;
  readonly renderengine_create_rectangle_sprite: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
  readonly renderengine_create_rectangle_sprite_with_options: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number];
  readonly renderengine_create_circle_sprite: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
  readonly renderengine_create_circle_sprite_with_options: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
  readonly renderengine_create_line_sprite: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
  readonly renderengine_create_line_sprite_with_options: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
  readonly renderengine_get_sprite_network_data: (a: number, b: number, c: number) => [number, number, number];
  readonly renderengine_apply_network_sprite_update: (a: number, b: any) => [number, number];
  readonly renderengine_apply_network_sprite_create: (a: number, b: any) => [number, number, number, number];
  readonly renderengine_apply_network_sprite_remove: (a: number, b: number, c: number) => number;
  readonly renderengine_get_all_sprites_network_data: (a: number) => [number, number, number];
  readonly renderengine_create_table_action: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly renderengine_delete_table_action: (a: number, b: number, c: number) => any;
  readonly renderengine_update_table_action: (a: number, b: number, c: number, d: any) => any;
  readonly renderengine_create_sprite_action: (a: number, b: number, c: number, d: number, e: number, f: any, g: number, h: number) => any;
  readonly renderengine_delete_sprite_action: (a: number, b: number, c: number) => any;
  readonly renderengine_update_sprite_action: (a: number, b: number, c: number, d: any) => any;
  readonly renderengine_set_layer_visibility_action: (a: number, b: number, c: number, d: number) => any;
  readonly renderengine_move_sprite_to_layer_action: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly renderengine_batch_actions: (a: number, b: any) => any;
  readonly renderengine_undo_action: (a: number) => any;
  readonly renderengine_redo_action: (a: number) => any;
  readonly renderengine_can_undo: (a: number) => number;
  readonly renderengine_can_redo: (a: number) => number;
  readonly renderengine_get_action_history: (a: number) => any;
  readonly renderengine_get_table_info: (a: number, b: number, c: number) => any;
  readonly renderengine_get_sprite_info: (a: number, b: number, c: number) => any;
  readonly renderengine_get_all_tables: (a: number) => any;
  readonly renderengine_get_sprites_by_layer: (a: number, b: number, c: number) => any;
  readonly renderengine_set_action_handler: (a: number, b: any) => void;
  readonly renderengine_set_state_change_handler: (a: number, b: any) => void;
  readonly renderengine_set_actions_error_handler: (a: number, b: any) => void;
  readonly renderengine_set_actions_auto_sync: (a: number, b: number) => void;
  readonly renderengine_set_layer_opacity: (a: number, b: number, c: number, d: number) => number;
  readonly renderengine_set_layer_visibility: (a: number, b: number, c: number, d: number) => number;
  readonly renderengine_set_layer_blend_mode: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly renderengine_set_layer_color: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
  readonly renderengine_get_layer_settings: (a: number, b: number, c: number) => any;
  readonly renderengine_get_layer_names: (a: number) => [number, number];
  readonly renderengine_get_layer_sprite_count: (a: number, b: number, c: number) => number;
  readonly renderengine_set_layer_z_order: (a: number, b: number, c: number, d: number) => number;
  readonly renderengine_clear_layer: (a: number, b: number, c: number) => number;
  readonly renderengine_clear_all_sprites: (a: number) => void;
  readonly renderengine_paint_enter_mode: (a: number, b: number, c: number) => void;
  readonly renderengine_paint_exit_mode: (a: number) => void;
  readonly renderengine_paint_is_mode: (a: number) => number;
  readonly renderengine_paint_set_brush_color: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly renderengine_paint_set_brush_width: (a: number, b: number) => void;
  readonly renderengine_paint_set_blend_mode: (a: number, b: number, c: number) => void;
  readonly renderengine_paint_get_brush_color: (a: number) => [number, number];
  readonly renderengine_paint_get_brush_width: (a: number) => number;
  readonly renderengine_paint_start_stroke: (a: number, b: number, c: number, d: number) => number;
  readonly renderengine_paint_add_point: (a: number, b: number, c: number, d: number) => number;
  readonly renderengine_paint_end_stroke: (a: number) => number;
  readonly renderengine_paint_cancel_stroke: (a: number) => void;
  readonly renderengine_paint_clear_all: (a: number) => void;
  readonly renderengine_paint_save_strokes_as_sprites: (a: number, b: number, c: number) => [number, number];
  readonly renderengine_paint_undo_stroke: (a: number) => number;
  readonly renderengine_paint_get_stroke_count: (a: number) => number;
  readonly renderengine_paint_is_drawing: (a: number) => number;
  readonly renderengine_paint_get_strokes: (a: number) => any;
  readonly renderengine_paint_get_current_stroke: (a: number) => any;
  readonly renderengine_paint_on_event: (a: number, b: number, c: number, d: any) => void;
  readonly renderengine_set_network_client: (a: number, b: any) => void;
  readonly renderengine_handle_table_data: (a: number, b: any) => [number, number];
  readonly renderengine_handle_sprite_update: (a: number, b: any) => [number, number];
  readonly renderengine_send_sprite_move: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly renderengine_send_sprite_scale: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly renderengine_send_sprite_create: (a: number, b: any) => [number, number];
  readonly renderengine_send_sprite_delete: (a: number, b: number, c: number) => [number, number];
  readonly renderengine_request_table: (a: number, b: number, c: number) => [number, number];
  readonly renderengine_get_table_data: (a: number) => any;
  readonly renderengine_get_table_id: (a: number) => [number, number];
  readonly renderengine_set_table_received_handler: (a: number, b: any) => void;
  readonly renderengine_set_sprite_update_handler: (a: number, b: any) => void;
  readonly renderengine_set_table_error_handler: (a: number, b: any) => void;
  readonly __wbg_actionsclient_free: (a: number, b: number) => void;
  readonly actionsclient_new: () => number;
  readonly actionsclient_set_action_handler: (a: number, b: any) => void;
  readonly actionsclient_set_state_change_handler: (a: number, b: any) => void;
  readonly actionsclient_set_error_handler: (a: number, b: any) => void;
  readonly actionsclient_set_network_client: (a: number, b: number) => void;
  readonly actionsclient_disconnect_network_client: (a: number) => void;
  readonly actionsclient_is_network_connected: (a: number) => number;
  readonly actionsclient_set_auto_sync: (a: number, b: number) => void;
  readonly actionsclient_create_table: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly actionsclient_delete_table: (a: number, b: number, c: number) => any;
  readonly actionsclient_update_table: (a: number, b: number, c: number, d: any) => any;
  readonly actionsclient_create_sprite: (a: number, b: number, c: number, d: number, e: number, f: any, g: number, h: number) => any;
  readonly actionsclient_delete_sprite: (a: number, b: number, c: number) => any;
  readonly actionsclient_update_sprite: (a: number, b: number, c: number, d: any) => any;
  readonly actionsclient_set_layer_visibility: (a: number, b: number, c: number, d: number) => any;
  readonly actionsclient_get_layer_visibility: (a: number, b: number, c: number) => number;
  readonly actionsclient_move_sprite_to_layer: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly actionsclient_batch_actions: (a: number, b: any) => any;
  readonly actionsclient_undo: (a: number) => any;
  readonly actionsclient_redo: (a: number) => any;
  readonly actionsclient_get_table_info: (a: number, b: number, c: number) => any;
  readonly actionsclient_get_sprite_info: (a: number, b: number, c: number) => any;
  readonly actionsclient_get_all_tables: (a: number) => any;
  readonly actionsclient_get_sprites_by_layer: (a: number, b: number, c: number) => any;
  readonly actionsclient_get_action_history: (a: number) => any;
  readonly actionsclient_can_undo: (a: number) => number;
  readonly actionsclient_can_redo: (a: number) => number;
  readonly __wbg_paintsystem_free: (a: number, b: number) => void;
  readonly paintsystem_new: () => number;
  readonly paintsystem_enter_paint_mode: (a: number, b: number, c: number) => void;
  readonly paintsystem_exit_paint_mode: (a: number) => void;
  readonly paintsystem_is_paint_mode: (a: number) => number;
  readonly paintsystem_set_brush_color: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly paintsystem_set_brush_width: (a: number, b: number) => void;
  readonly paintsystem_set_blend_mode: (a: number, b: number, c: number) => void;
  readonly paintsystem_get_brush_color: (a: number) => [number, number];
  readonly paintsystem_get_brush_width: (a: number) => number;
  readonly paintsystem_start_stroke: (a: number, b: number, c: number, d: number) => number;
  readonly paintsystem_add_stroke_point: (a: number, b: number, c: number, d: number) => number;
  readonly paintsystem_end_stroke: (a: number) => number;
  readonly paintsystem_cancel_stroke: (a: number) => void;
  readonly paintsystem_clear_all_strokes: (a: number) => void;
  readonly paintsystem_undo_last_stroke: (a: number) => number;
  readonly paintsystem_get_stroke_count: (a: number) => number;
  readonly paintsystem_is_drawing: (a: number) => number;
  readonly paintsystem_get_all_strokes_json: (a: number) => any;
  readonly paintsystem_get_current_stroke_json: (a: number) => any;
  readonly paintsystem_on_stroke_event: (a: number, b: number, c: number, d: any) => void;
  readonly paintsystem_remove_stroke_event: (a: number, b: number, c: number) => void;
  readonly paintsystem_get_all_strokes_data: (a: number) => [number, number];
  readonly paintsystem_get_strokes_data_json: (a: number) => any;
  readonly __wbg_brushpreset_free: (a: number, b: number) => void;
  readonly brushpreset_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
  readonly brushpreset_apply_to_paint_system: (a: number, b: number) => void;
  readonly create_default_brush_presets: () => [number, number];
  readonly __wbg_assetmanager_free: (a: number, b: number) => void;
  readonly assetmanager_new: () => number;
  readonly assetmanager_initialize: (a: number) => any;
  readonly assetmanager_download_asset: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly assetmanager_get_asset_data: (a: number, b: number, c: number) => [number, number];
  readonly assetmanager_get_asset_info: (a: number, b: number, c: number) => [number, number];
  readonly assetmanager_has_asset: (a: number, b: number, c: number) => number;
  readonly assetmanager_has_asset_by_hash: (a: number, b: number, c: number) => number;
  readonly assetmanager_get_asset_by_hash: (a: number, b: number, c: number) => [number, number];
  readonly assetmanager_remove_asset: (a: number, b: number, c: number) => number;
  readonly assetmanager_cleanup_cache: (a: number) => any;
  readonly assetmanager_get_cache_stats: (a: number) => [number, number];
  readonly assetmanager_list_assets: (a: number) => [number, number];
  readonly assetmanager_set_max_cache_size: (a: number, b: bigint) => void;
  readonly assetmanager_set_max_age: (a: number, b: number) => void;
  readonly assetmanager_clear_cache: (a: number) => any;
  readonly assetmanager_calculate_asset_hash: (a: number, b: number, c: number) => [number, number];
  readonly assetmanager_get_download_queue_size: (a: number) => number;
  readonly assetmanager_get_queued_downloads: (a: number) => [number, number];
  readonly assetmanager_clear_download_queue: (a: number) => void;
  readonly assetmanager_remove_from_queue: (a: number, b: number, c: number) => number;
  readonly __wbg_tablemanager_free: (a: number, b: number) => void;
  readonly tablemanager_new: () => number;
  readonly tablemanager_set_canvas_size: (a: number, b: number, c: number) => void;
  readonly tablemanager_create_table: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
  readonly tablemanager_set_active_table: (a: number, b: number, c: number) => number;
  readonly tablemanager_get_active_table_id: (a: number) => [number, number];
  readonly tablemanager_set_table_screen_area: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
  readonly tablemanager_table_to_screen: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly tablemanager_screen_to_table: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly tablemanager_is_point_in_table_area: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly tablemanager_pan_viewport: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly tablemanager_zoom_table: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
  readonly tablemanager_set_table_grid: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly tablemanager_get_table_info: (a: number, b: number, c: number) => [number, number];
  readonly tablemanager_get_all_tables: (a: number) => [number, number];
  readonly tablemanager_remove_table: (a: number, b: number, c: number) => number;
  readonly tablemanager_get_visible_bounds: (a: number, b: number, c: number) => [number, number];
  readonly tablemanager_snap_to_grid: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly __wbg_networkclient_free: (a: number, b: number) => void;
  readonly networkclient_new: () => number;
  readonly networkclient_set_message_handler: (a: number, b: any) => void;
  readonly networkclient_set_connection_handler: (a: number, b: any) => void;
  readonly networkclient_set_error_handler: (a: number, b: any) => void;
  readonly networkclient_connect: (a: number, b: number, c: number) => [number, number];
  readonly networkclient_disconnect: (a: number) => void;
  readonly networkclient_send_message: (a: number, b: number, c: number, d: any) => [number, number];
  readonly networkclient_send_sprite_update: (a: number, b: any) => [number, number];
  readonly networkclient_send_sprite_create: (a: number, b: any) => [number, number];
  readonly networkclient_send_sprite_remove: (a: number, b: number, c: number) => [number, number];
  readonly networkclient_send_table_update: (a: number, b: any) => [number, number];
  readonly networkclient_send_table_request: (a: number, b: any) => [number, number];
  readonly networkclient_send_new_table_request: (a: number, b: number, c: number) => [number, number];
  readonly networkclient_send_ping: (a: number) => [number, number];
  readonly networkclient_authenticate: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly networkclient_join_session: (a: number, b: number, c: number) => [number, number];
  readonly networkclient_request_table_list: (a: number) => [number, number];
  readonly networkclient_request_player_list: (a: number) => [number, number];
  readonly networkclient_request_asset_upload: (a: number, b: number, c: number, d: number, e: number, f: bigint) => [number, number];
  readonly networkclient_request_asset_download: (a: number, b: number, c: number) => [number, number];
  readonly networkclient_confirm_asset_upload: (a: number, b: number, c: number, d: number) => [number, number];
  readonly networkclient_is_connected: (a: number) => number;
  readonly networkclient_get_connection_state: (a: number) => [number, number];
  readonly networkclient_get_client_id: (a: number) => [number, number];
  readonly networkclient_get_username: (a: number) => [number, number];
  readonly networkclient_get_session_code: (a: number) => [number, number];
  readonly networkclient_set_user_info: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly networkclient_sync_action: (a: number, b: number, c: number) => [number, number];
  readonly compute_visibility_polygon: (a: number, b: number, c: any, d: number) => any;
  readonly now: () => number;
  readonly request_animation_frame: (a: any) => number;
  readonly log: (a: number, b: number) => void;
  readonly error: (a: number, b: number) => void;
  readonly warn: (a: number, b: number) => void;
  readonly __wbg_tablesync_free: (a: number, b: number) => void;
  readonly tablesync_new: () => number;
  readonly tablesync_set_network_client: (a: number, b: any) => void;
  readonly tablesync_set_table_received_handler: (a: number, b: any) => void;
  readonly tablesync_set_sprite_update_handler: (a: number, b: any) => void;
  readonly tablesync_set_error_handler: (a: number, b: any) => void;
  readonly tablesync_request_table: (a: number, b: number, c: number) => [number, number];
  readonly tablesync_handle_table_data: (a: number, b: any) => [number, number];
  readonly tablesync_send_sprite_move: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly tablesync_send_sprite_scale: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly tablesync_send_sprite_rotate: (a: number, b: number, c: number, d: number) => [number, number];
  readonly tablesync_send_sprite_create: (a: number, b: any) => [number, number];
  readonly tablesync_send_sprite_delete: (a: number, b: number, c: number) => [number, number];
  readonly tablesync_handle_sprite_update: (a: number, b: any) => [number, number];
  readonly tablesync_get_table_data: (a: number) => any;
  readonly tablesync_get_table_id: (a: number) => [number, number];
  readonly tablesync_get_sprites: (a: number) => any;
  readonly tablesync_get_sprites_by_layer: (a: number, b: number, c: number) => any;
  readonly tablesync_handle_error: (a: number, b: number, c: number) => void;
  readonly init_game_renderer: (a: any) => [number, number, number];
  readonly main: () => void;
  readonly version: () => [number, number];
  readonly renderengine_set_zoom: (a: number, b: number) => void;
  readonly renderengine_delete_sprite: (a: number, b: number, c: number) => number;
  readonly renderengine_set_layer_visible: (a: number, b: number, c: number, d: number) => number;
  readonly renderengine_set_snap_to_grid: (a: number, b: number) => void;
  readonly renderengine_set_camera_position: (a: number, b: number, c: number) => void;
  readonly renderengine_resize_canvas: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_4: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export_6: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __externref_drop_slice: (a: number, b: number) => void;
  readonly closure59_externref_shim: (a: number, b: number, c: any) => void;
  readonly closure33_externref_shim: (a: number, b: number, c: any, d: any) => void;
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
