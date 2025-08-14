// Type declarations for WASM RenderEngine - Updated from generated bindings
export class RenderEngine {
  free(): void;
  constructor(canvas: HTMLCanvasElement);
  render(): void;
  resize_canvas(width: number, height: number): void;
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
  load_texture(name: string, image: HTMLImageElement): void;
  set_layer_opacity(layer_name: string, opacity: number): void;
  set_layer_visible(layer_name: string, visible: boolean): void;
  handle_right_click(screen_x: number, screen_y: number): string | undefined;
  delete_sprite(sprite_id: string): boolean;
  copy_sprite(sprite_id: string): string | undefined;
  paste_sprite(layer_name: string, sprite_json: string, offset_x: number, offset_y: number): string;
  resize_sprite(sprite_id: string, new_width: number, new_height: number): boolean;
  resize(width: number, height: number): void;
  
  // Lighting system
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
  
  // Interactive lighting controls
  get_light_at_position(x: number, y: number): string | undefined;
  start_light_drag(light_id: string, world_x: number, world_y: number): boolean;
  update_light_drag(world_x: number, world_y: number): boolean;
  end_light_drag(): string | undefined;
  get_light_radius(light_id: string): number;
  
  // Fog of war system
  set_gm_mode(is_gm: boolean): void;
  add_fog_rectangle(id: string, start_x: number, start_y: number, end_x: number, end_y: number, mode: string): void;
  remove_fog_rectangle(id: string): void;
  clear_fog(): void;
  hide_entire_table(table_width: number, table_height: number): void;
  is_point_in_fog(x: number, y: number): boolean;
  get_fog_count(): number;
  
  // Interactive fog controls
  start_fog_draw(world_x: number, world_y: number, mode: string): string;
  update_fog_draw(rect_id: string, world_x: number, world_y: number): boolean;
  finish_fog_draw(rect_id: string): boolean;
  cancel_fog_draw(rect_id: string): void;
  get_fog_at_position(x: number, y: number): string | undefined;
  
  // Tool mode management
  set_fog_draw_mode(enabled: boolean): void;
  set_fog_erase_mode(enabled: boolean): void;
  set_light_drag_mode(enabled: boolean): void;
  is_in_fog_draw_mode(): boolean;
  is_in_light_drag_mode(): boolean;
  get_current_input_mode(): string;

  // Network integration
  get_sprite_network_data(sprite_id: string): any;
  apply_network_sprite_update(sprite_data: any): void;
  apply_network_sprite_create(sprite_data: any): string;
  apply_network_sprite_remove(sprite_id: string): boolean;
  get_all_sprites_network_data(): any[];

  // Actions System Integration
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
  
  // Actions event handlers
  set_action_handler(callback: (actionType: string, data: any) => void): void;
  set_state_change_handler(callback: (eventType: string, targetId: string) => void): void;
  set_actions_error_handler(callback: (error: string) => void): void;
  set_actions_auto_sync(enabled: boolean): void;
  
  // Advanced Layer Management for Rendering Pipeline
  set_layer_opacity(layer_name: string, opacity: number): boolean;
  set_layer_visibility(layer_name: string, visible: boolean): boolean;
  set_layer_blend_mode(layer_name: string, blend_mode: string): boolean;
  set_layer_color(layer_name: string, r: number, g: number, b: number): boolean;
  get_layer_settings(layer_name: string): any;
  get_layer_names(): string[];
  
  // Paint System Methods
  paint_enter_mode(width: number, height: number): void;
  paint_exit_mode(): void;
  paint_is_mode(): boolean;
  paint_set_brush_color(r: number, g: number, b: number, a: number): void;
  paint_set_brush_width(width: number): void;
  paint_set_blend_mode(blend_mode: string): void;
  paint_get_brush_color(): number[];
  paint_get_brush_width(): number;
  paint_start_stroke(world_x: number, world_y: number, pressure: number): boolean;
  paint_add_point(world_x: number, world_y: number, pressure: number): boolean;
  paint_end_stroke(): boolean;
  paint_cancel_stroke(): void;
  paint_clear_all(): void;
  paint_undo_stroke(): boolean;
  paint_get_stroke_count(): number;
  paint_is_drawing(): boolean;
  paint_get_strokes(): any;
  paint_get_current_stroke(): any;
  paint_on_event(event_type: string, callback: () => void): void;
}

export class NetworkClient {
  free(): void;
  constructor();
  
  // Connection management
  connect(url: string): void;
  disconnect(): void;
  is_connected(): boolean;
  get_connection_state(): string;
  get_client_id(): string;
  get_username(): string | undefined;
  get_session_code(): string | undefined;
  set_user_info(user_id: number, username: string, session_code?: string, jwt_token?: string): void;
  
  // Event handlers
  set_message_handler(callback: (messageType: string, data: any) => void): void;
  set_connection_handler(callback: (state: string, error?: string) => void): void;
  set_error_handler(callback: (error: string) => void): void;
  
  // Message sending
  send_message(message_type: string, data: any): void;
  send_sprite_update(sprite_data: any): void;
  send_sprite_create(sprite_data: any): void;
  send_sprite_remove(sprite_id: string): void;
  send_table_update(table_data: any): void;
  send_ping(): void;
  
  // Authentication and session management
  authenticate(username: string, password: string): void;
  join_session(session_code: string): void;
  request_table_list(): void;
  request_player_list(): void;
  
  // Asset management
  request_asset_upload(filename: string, file_hash: string, file_size: number): void;
  request_asset_download(asset_id: string): void;
  confirm_asset_upload(asset_id: string, upload_success: boolean): void;
}

export class ActionsClient {
  free(): void;
  constructor();
  
  // Event handlers
  set_action_handler(callback: (actionType: string, data: any) => void): void;
  set_state_change_handler(callback: (eventType: string, targetId: string) => void): void;
  set_error_handler(callback: (error: string) => void): void;
  
  // Configuration
  set_auto_sync(enabled: boolean): void;
  
  // Table Management
  create_table(name: string, width: number, height: number): any;
  delete_table(table_id: string): any;
  update_table(table_id: string, updates: any): any;
  
  // Sprite Management
  create_sprite(table_id: string, layer: string, position: any, texture_name: string): any;
  delete_sprite(sprite_id: string): any;
  update_sprite(sprite_id: string, updates: any): any;
  
  // Layer Management
  set_layer_visibility(layer: string, visible: boolean): any;
  get_layer_visibility(layer: string): boolean;
  move_sprite_to_layer(sprite_id: string, new_layer: string): any;
  
  // Batch Operations
  batch_actions(actions: any): any;
  
  // Undo/Redo
  undo(): any;
  redo(): any;
  can_undo(): boolean;
  can_redo(): boolean;
  
  // Query Methods
  get_table_info(table_id: string): any;
  get_sprite_info(sprite_id: string): any;
  get_all_tables(): any;
  get_sprites_by_layer(layer: string): any;
  get_action_history(): any;
}

export class PaintSystem {
  free(): void;
  constructor();
  
  // Canvas management
  enter_paint_mode(width: number, height: number): void;
  exit_paint_mode(): void;
  is_paint_mode(): boolean;
  
  // Brush settings
  set_brush_color(r: number, g: number, b: number, a: number): void;
  set_brush_width(width: number): void;
  set_blend_mode(blend_mode: string): void;
  get_brush_color(): number[];
  get_brush_width(): number;
  
  // Drawing operations
  start_stroke(world_x: number, world_y: number, pressure: number): boolean;
  add_stroke_point(world_x: number, world_y: number, pressure: number): boolean;
  end_stroke(): boolean;
  cancel_stroke(): void;
  
  // Stroke management
  clear_all_strokes(): void;
  undo_last_stroke(): boolean;
  get_stroke_count(): number;
  is_drawing(): boolean;
  
  // Data access
  get_all_strokes_json(): any;
  get_current_stroke_json(): any;
  
  // Events
  on_stroke_event(event_type: string, callback: () => void): void;
  remove_stroke_event(event_type: string): void;
}

export class BrushPreset {
  free(): void;
  constructor(r: number, g: number, b: number, a: number, width: number, blend_mode: string);
  apply_to_paint_system(paint_system: any): void;
}

export interface AssetInfo {
  id: string;
  name: string;
  url: string;
  hash: string;
  size: number;
  mime_type: string;
  cached_at: number;
  last_accessed: number;
}

export interface CacheStats {
  total_assets: number;
  total_size: number;
  cache_hits: number;
  cache_misses: number;
  last_cleanup: number;
}

export class AssetManager {
  free(): void;
  constructor();
  initialize_db(): Promise<void>;
  set_cache_limits(max_size_mb: bigint, max_age_hours: number): void;
  is_cached(asset_id: string): boolean;
  get_asset_info(asset_id: string): string | null;
  get_asset_data(asset_id: string): Uint8Array | null;
  cache_asset(asset_info_json: string, data: Uint8Array): Promise<void>;
  remove_asset(asset_id: string): Promise<boolean>;
  cleanup_cache(): Promise<void>;
  clear_cache(): Promise<void>;
  get_cache_stats(): string;
  preload_assets(asset_urls: string[]): Promise<void>;
  get_asset_list(): string[];
  export_cache(): string;
  import_cache(cache_json: string): Promise<void>;
}

export class AssetUploader {
  free(): void;
  constructor();
  set_max_concurrent_uploads(max: number): void;
  upload_asset(asset_id: string, url: string, data: Uint8Array): Promise<void>;
  get_upload_progress(asset_id: string): number;
  cancel_upload(asset_id: string): boolean;
  get_active_uploads(): number;
  get_upload_queue_size(): number;
}

export class TableManager {
  free(): void;
  constructor();
  set_canvas_size(width: number, height: number): void;
  create_table(table_id: string, table_name: string, width: number, height: number): void;
  set_active_table(table_id: string): boolean;
  get_active_table_id(): string | undefined;
  set_table_screen_area(table_id: string, x: number, y: number, width: number, height: number): boolean;
  table_to_screen(table_id: string, table_x: number, table_y: number): number[] | undefined;
  screen_to_table(table_id: string, screen_x: number, screen_y: number): number[] | undefined;
  is_point_in_table_area(table_id: string, screen_x: number, screen_y: number): boolean;
  pan_viewport(table_id: string, dx: number, dy: number): boolean;
  zoom_table(table_id: string, zoom_factor: number, center_x: number, center_y: number): boolean;
  set_table_grid(table_id: string, show_grid: boolean, cell_size: number): boolean;
  get_table_info(table_id: string): string | undefined;
  get_all_tables(): string;
  remove_table(table_id: string): boolean;
  get_visible_bounds(table_id: string): number[] | undefined;
  snap_to_grid(table_id: string, x: number, y: number): number[] | undefined;
}

export class TableSync {
  free(): void;
  constructor();
  set_network_client(network_client: any): void;
  set_table_received_handler(callback: Function): void;
  set_sprite_update_handler(callback: Function): void;
  set_error_handler(callback: Function): void;
  request_table(table_name: string): void;
  handle_table_data(table_data: any): void;
  send_sprite_move(sprite_id: string, x: number, y: number): void;
  send_sprite_scale(sprite_id: string, scale_x: number, scale_y: number): void;
  send_sprite_rotate(sprite_id: string, rotation: number): void;
  send_sprite_create(sprite_data: any): void;
  send_sprite_delete(sprite_id: string): void;
  handle_sprite_update(update_data: any): void;
  get_table_data(): any;
  get_table_id(): string | undefined;
  get_sprites(): any;
  handle_error(error_message: string): void;
}

export function create_default_brush_presets(): BrushPreset[];

export function init_game_renderer(canvas: HTMLCanvasElement): RenderEngine;

declare global {
  interface Window {
    rustRenderManager?: RenderEngine;
    rustNetworkClient?: NetworkClient;
    // Removed wasm declaration - using global wasmManager instead
    wasmInitialized: boolean;
    // ttrpg_rust_core type is defined in wasmManager.ts
    gameAPI?: {
      sendMessage: (type: string, data: any) => void;
    };
  }
}

export { };

